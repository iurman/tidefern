import { createHash } from "node:crypto";

import {
  createKeyCache,
  encryptFieldFor,
  provisionChildKey,
  provisionSubjectKey,
  unwrapForSubject,
} from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import { hashPassword } from "better-auth/crypto";
import { inArray, sql } from "drizzle-orm";

import { withSystem } from "../actor";
import type { ActorDatabase, Transaction } from "../actor";
import * as schema from "../schema/index";
import { dateIn, daysBefore, hoursBefore, shiftDays } from "./calendar";
import type { CalendarDate } from "./calendar";
import {
  BLOCK,
  GRANT_LENA_MIRA_CONTRIBUTE,
  GRANT_MIRA_PIA_READ,
  GRANT_NOOR_THEO_READ,
  GRANT_NOOR_THEO_REVOKED,
  GRANT_NOOR_THEO_SUMMARY,
  HOUSEHOLD_A,
  HOUSEHOLD_B,
  ILO,
  INVITATION_EXPIRED,
  INVITATION_LENA_ACCEPTED,
  INVITATION_PENDING,
  INVITATION_THEO_ACCEPTED,
  INVITATION_WITHDRAWN,
  LENA,
  LENA_PREGNANCY,
  MIRA,
  MIRA_PREGNANCY,
  NOOR,
  NOOR_PREDICTION,
  NOTE_LENA_BY_MIRA,
  NOTE_LENA_OWN,
  NOTE_MIRA_PRIVATE,
  NOTE_NOOR_PRIVATE,
  NOTE_NOOR_SHARED,
  PERSONAS,
  PIA,
  SOL,
  THEO,
  invitationToken,
  seedId,
} from "./cast";
import type { Persona } from "./cast";
import { seedVocabulary } from "./vocabulary";

export * from "./cast";
export { dateIn, shiftDays } from "./calendar";
export { seedVocabulary, vocabularyRows, VOCABULARY_LISTS } from "./vocabulary";

/**
 * The synthetic data of architecture record 7.5: two households that
 * between them cover every stage and every grant state, with verified users
 * a browser test can sign in as. Everything is fixed except what cannot be:
 * ids and relative dates are constants, the DEKs and the IVs under them are
 * random because the envelope requires it, and the password hashes carry
 * Better Auth's random salt. Running it twice on one database changes
 * nothing: every insert is `ON CONFLICT DO NOTHING` on its primary key, the
 * keys are provisioned through the idempotent D2 helper, and the report says
 * how many rows each run added.
 */

export interface SeedOptions {
  /** The instant "today" is derived from, in each profile's own time zone. */
  now: Date;
  /** Wraps every subject's DEK and seals the free text; the development KEK outside tests. */
  kek: KeyProvider;
}

/** Rows added per table by this run; all zeros on a database that was seeded before. */
export interface SeedReport {
  inserted: Record<string, number>;
}

/** The connection's role cannot act as the system, so the policies would refuse the rows. */
export class SeedRoleError extends Error {
  override readonly name = "SeedRoleError";

  constructor() {
    super(
      "the seed needs the owner role: is_system() is false on this connection, " +
        "which happens when DATABASE_URL belongs to tidefern_app",
    );
  }
}

/** The environment asks for something the seed refuses to do. */
export class SeedConfigurationError extends Error {
  override readonly name = "SeedConfigurationError";
}

/**
 * What "today" is for a seed run: `TIDEFERN_FAKE_NOW` when set, so CI and
 * local assertions stay stable, and the clock otherwise. Production refuses
 * the variable outright (architecture record 17.1), as it does
 * `E2E_MAIL_CAPTURE`.
 */
export function resolveSeedNow(env: Record<string, string | undefined>): Date {
  const fake = env.TIDEFERN_FAKE_NOW?.trim();
  if (!fake) return new Date();
  if (env.VERCEL_ENV === "production") {
    throw new SeedConfigurationError("TIDEFERN_FAKE_NOW is set on production, where it is refused");
  }
  const parsed = new Date(fake);
  if (Number.isNaN(parsed.getTime())) {
    throw new SeedConfigurationError("TIDEFERN_FAKE_NOW is not an ISO 8601 instant");
  }
  return parsed;
}

/** The version every seeded grant and consent records as what the person saw. */
export const SEED_POLICY_VERSION = "2026-10";

/** How a `share.read` row is deduplicated: one per actor, subject, category and day. */
export function readDedupeKey(
  actorId: string,
  subjectId: string,
  category: string,
  day: CalendarDate,
): string {
  return `read:${actorId}:${subjectId}:${category}:${day}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type FlowLevel = (typeof schema.flowLevelValues)[number];
type MoodCode = (typeof schema.moodCodeValues)[number];
type SymptomCode = (typeof schema.symptomCodeValues)[number];

/**
 * Noor's day sheet relative to her "today": three period starts 28 days
 * apart, the third two days ago, with the symptoms and moods she logged
 * around them and a few mid-cycle days. A tuple is day offset, flow, mood,
 * symptoms.
 */
const NOOR_DAYS: readonly [number, FlowLevel | null, MoodCode | null, SymptomCode[]][] = [
  [-58, "heavy", "low", ["cramps", "fatigue"]],
  [-57, "heavy", null, ["cramps"]],
  [-56, "medium", "steady", []],
  [-55, "light", null, []],
  [-54, "spotting", null, []],
  [-44, null, "bright", ["high_energy"]],
  [-33, null, "low", ["bloating", "headache"]],
  [-30, "medium", "low", ["cramps", "backache"]],
  [-29, "heavy", null, ["cramps"]],
  [-28, "medium", "steady", []],
  [-27, "light", null, []],
  [-26, "spotting", null, []],
  [-16, null, "bright", []],
  [-4, null, "low", ["tender_breasts", "mood_swings"]],
  [-2, "medium", "low", ["cramps"]],
  [-1, "heavy", null, ["cramps", "fatigue"]],
  [0, "medium", "steady", []],
];

/** The free text the seed seals; exported so the test can prove each one decrypts. */
export interface SeedNote {
  id: string;
  subjectId: string;
  authorId: string;
  category: (typeof schema.noteCategoryValues)[number];
  /** Day offset from the subject's "today". */
  dayOffset: number;
  text: string;
}

export const SEED_NOTES: readonly SeedNote[] = [
  {
    id: NOTE_NOOR_PRIVATE,
    subjectId: NOOR.id,
    authorId: NOOR.id,
    category: "journal.private",
    dayOffset: -1,
    text: "Slept badly; the cramps woke me twice. The hot water bottle helped.",
  },
  {
    id: NOTE_NOOR_SHARED,
    subjectId: NOOR.id,
    authorId: NOOR.id,
    category: "cycle.symptoms",
    dayOffset: 0,
    text: "Steadier today. Sharing this one.",
  },
  {
    id: NOTE_LENA_OWN,
    subjectId: LENA.id,
    authorId: LENA.id,
    category: "pregnancy.overview",
    dayOffset: -5,
    text: "Felt the first kicks on the evening walk.",
  },
  {
    id: NOTE_MIRA_PRIVATE,
    subjectId: MIRA.id,
    authorId: MIRA.id,
    category: "journal.private",
    dayOffset: -2,
    text: "Six weeks in. Long nights, but a first smile this morning.",
  },
  {
    id: NOTE_LENA_BY_MIRA,
    subjectId: LENA.id,
    authorId: MIRA.id,
    category: "pregnancy.overview",
    dayOffset: -14,
    text: "Notes from the anatomy scan: everything measured on track.",
  },
];

/** Lena's appointments and milestones; the label is sealed under her key. */
export interface SeedPregnancyEvent {
  id: string;
  pregnancyId: string;
  subjectId: string;
  authorId: string;
  kind: (typeof schema.pregnancyEventKindValues)[number];
  dayOffset: number;
  label: string | null;
}

export const SEED_PREGNANCY_EVENTS: readonly SeedPregnancyEvent[] = [
  {
    id: seedId(BLOCK.pregnancyEvents, 1),
    pregnancyId: LENA_PREGNANCY,
    subjectId: LENA.id,
    authorId: LENA.id,
    kind: "appointment",
    dayOffset: -56,
    label: "Dating scan",
  },
  {
    id: seedId(BLOCK.pregnancyEvents, 2),
    pregnancyId: LENA_PREGNANCY,
    subjectId: LENA.id,
    authorId: LENA.id,
    kind: "appointment",
    dayOffset: -14,
    label: "Anatomy scan",
  },
  {
    id: seedId(BLOCK.pregnancyEvents, 3),
    pregnancyId: LENA_PREGNANCY,
    subjectId: LENA.id,
    authorId: LENA.id,
    kind: "milestone",
    dayOffset: -5,
    label: "First kicks",
  },
  {
    id: seedId(BLOCK.pregnancyEvents, 4),
    pregnancyId: LENA_PREGNANCY,
    subjectId: LENA.id,
    authorId: MIRA.id,
    kind: "appointment",
    dayOffset: 28,
    label: "Glucose screening",
  },
  {
    id: seedId(BLOCK.pregnancyEvents, 5),
    pregnancyId: MIRA_PREGNANCY,
    subjectId: MIRA.id,
    authorId: MIRA.id,
    kind: "milestone",
    dayOffset: -42,
    label: null,
  },
];

/** The one child event with free text, sealed under Ilo's own key. */
export const ILO_FEED_NOTE = {
  id: seedId(BLOCK.childEvents, 2),
  text: "Settled quickly after the feed.",
} as const;

/** The CDC checklist items the guardians checked off (core's `<months>m-<domain>-<n>` keys). */
export const CHECKED_MILESTONES: readonly { id: string; childId: string; milestoneId: string }[] = [
  { id: seedId(BLOCK.childEvents, 5), childId: ILO, milestoneId: "2m-social-1" },
  { id: seedId(BLOCK.childEvents, 6), childId: SOL, milestoneId: "30m-social-1" },
  { id: seedId(BLOCK.childEvents, 7), childId: SOL, milestoneId: "30m-language-2" },
  { id: seedId(BLOCK.childEvents, 8), childId: SOL, milestoneId: "24m-movement-1" },
  { id: seedId(BLOCK.childEvents, 9), childId: SOL, milestoneId: "24m-language-3" },
];

async function assertSystemContext(tx: Transaction): Promise<void> {
  const result = (await tx.execute(sql`select is_system() as ok`)) as unknown as {
    rows: { ok?: unknown }[];
  };
  if (result.rows[0]?.ok !== true) throw new SeedRoleError();
}

/**
 * Builds the two households inside one `withSystem` transaction, so a
 * database is seeded whole or not at all. Returns how many rows each table
 * gained; a second run reports zeros everywhere.
 */
export async function seed(db: ActorDatabase, options: SeedOptions): Promise<SeedReport> {
  const { now, kek } = options;
  return withSystem(async (tx) => {
    await assertSystemContext(tx);
    const inserted: Record<string, number> = {};
    const record = (table: string, n: number) => {
      inserted[table] = (inserted[table] ?? 0) + n;
    };

    // Today in each household's zone; Pia's own zone only dates her consents.
    const berlin = dateIn(now, NOOR.timeZone);
    const vancouver = dateIn(now, MIRA.timeZone);
    const t = (days: number) => shiftDays(berlin, days);
    const v = (days: number) => shiftDays(vancouver, days);
    const signedUp = (persona: Persona) => daysBefore(now, persona.signedUpDaysAgo);

    // Identity: verified users with a credential account Better Auth's
    // sign-in accepts. The hash is Better Auth's own (scrypt with a random
    // salt), computed only for accounts that do not exist yet so a repeat
    // run stays cheap and leaves the stored hash alone.
    record(
      "user",
      (
        await tx
          .insert(schema.user)
          .values(
            PERSONAS.map((persona) => ({
              id: persona.id,
              name: persona.name,
              email: persona.email,
              emailVerified: true,
              createdAt: signedUp(persona),
              updatedAt: signedUp(persona),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: schema.user.id })
      ).length,
    );

    const accountIds = PERSONAS.map((_, index) => seedId(BLOCK.accounts, index + 1));
    const existingAccounts = new Set(
      (
        await tx
          .select({ id: schema.account.id })
          .from(schema.account)
          .where(inArray(schema.account.id, accountIds))
      ).map((row) => row.id),
    );
    const accountRows: (typeof schema.account.$inferInsert)[] = [];
    for (const [index, persona] of PERSONAS.entries()) {
      const id = accountIds[index] as string;
      if (existingAccounts.has(id)) continue;
      accountRows.push({
        id,
        accountId: persona.id,
        providerId: "credential",
        userId: persona.id,
        password: await hashPassword(persona.password),
        createdAt: signedUp(persona),
        updatedAt: signedUp(persona),
      });
    }
    if (accountRows.length > 0) {
      record(
        "account",
        (
          await tx
            .insert(schema.account)
            .values(accountRows)
            .onConflictDoNothing()
            .returning({ id: schema.account.id })
        ).length,
      );
    } else {
      record("account", 0);
    }

    record(
      "profiles",
      (
        await tx
          .insert(schema.profiles)
          .values(
            PERSONAS.map((persona) => ({
              userId: persona.id,
              displayName: persona.name,
              timeZone: persona.timeZone,
              stage: persona.stage,
              weekStart: persona.weekStart,
              units: persona.units,
              notificationDetail: persona.notificationDetail,
              ageAttestedAt: signedUp(persona),
            })),
          )
          .onConflictDoNothing()
          .returning({ userId: schema.profiles.userId })
      ).length,
    );

    // Keys: one wrapped DEK per user, as the sign-up hook would have minted.
    let keysCreated = 0;
    for (const persona of PERSONAS) {
      const key = await provisionSubjectKey(tx, persona.id, kek, "user");
      if (key.created) keysCreated += 1;
    }

    // Households, memberships and the invitations in every state.
    record(
      "households",
      (
        await tx
          .insert(schema.households)
          .values([{ id: HOUSEHOLD_A }, { id: HOUSEHOLD_B }])
          .onConflictDoNothing()
          .returning({ id: schema.households.id })
      ).length,
    );
    record(
      "household_members",
      (
        await tx
          .insert(schema.householdMembers)
          .values([
            {
              id: seedId(BLOCK.householdMembers, 1),
              householdId: HOUSEHOLD_A,
              userId: NOOR.id,
              role: "owner",
              joinedAt: daysBefore(now, 400),
            },
            {
              id: seedId(BLOCK.householdMembers, 2),
              householdId: HOUSEHOLD_A,
              userId: THEO.id,
              role: "partner",
              joinedAt: daysBefore(now, 120),
            },
            {
              id: seedId(BLOCK.householdMembers, 3),
              householdId: HOUSEHOLD_B,
              userId: MIRA.id,
              role: "owner",
              joinedAt: daysBefore(now, 420),
            },
            {
              id: seedId(BLOCK.householdMembers, 4),
              householdId: HOUSEHOLD_B,
              userId: LENA.id,
              role: "partner",
              joinedAt: daysBefore(now, 399),
            },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.householdMembers.id })
      ).length,
    );
    record(
      "invitations",
      (
        await tx
          .insert(schema.invitations)
          .values([
            {
              id: INVITATION_THEO_ACCEPTED,
              householdId: HOUSEHOLD_A,
              inviterId: NOOR.id,
              inviteeEmail: THEO.email,
              role: "partner",
              tokenHash: sha256(invitationToken(INVITATION_THEO_ACCEPTED)),
              createdAt: daysBefore(now, 121),
              expiresAt: daysBefore(now, 118),
              acceptedAt: daysBefore(now, 120),
            },
            {
              id: INVITATION_PENDING,
              householdId: HOUSEHOLD_A,
              inviterId: NOOR.id,
              inviteeEmail: "kim@example.test",
              role: "partner",
              tokenHash: sha256(invitationToken(INVITATION_PENDING)),
              createdAt: daysBefore(now, 1),
              expiresAt: daysBefore(now, -2),
            },
            {
              id: INVITATION_EXPIRED,
              householdId: HOUSEHOLD_A,
              inviterId: NOOR.id,
              inviteeEmail: "rafa@example.test",
              role: "guardian",
              tokenHash: sha256(invitationToken(INVITATION_EXPIRED)),
              createdAt: daysBefore(now, 10),
              expiresAt: daysBefore(now, 7),
            },
            {
              id: INVITATION_WITHDRAWN,
              householdId: HOUSEHOLD_A,
              inviterId: NOOR.id,
              inviteeEmail: "uma@example.test",
              role: "partner",
              tokenHash: sha256(invitationToken(INVITATION_WITHDRAWN)),
              createdAt: daysBefore(now, 30),
              expiresAt: daysBefore(now, 27),
              withdrawnAt: daysBefore(now, 29),
            },
            {
              id: INVITATION_LENA_ACCEPTED,
              householdId: HOUSEHOLD_B,
              inviterId: MIRA.id,
              inviteeEmail: LENA.email,
              role: "partner",
              tokenHash: sha256(invitationToken(INVITATION_LENA_ACCEPTED)),
              createdAt: daysBefore(now, 400),
              expiresAt: daysBefore(now, 397),
              acceptedAt: daysBefore(now, 399),
            },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.invitations.id })
      ).length,
    );

    // Children, their guardians and their own keys (a child's rows are sealed
    // under the child's DEK so a co-guardian keeps reading them).
    record(
      "children",
      (
        await tx
          .insert(schema.children)
          .values([
            {
              id: ILO,
              householdId: HOUSEHOLD_B,
              displayName: "Ilo",
              dateOfBirth: v(-42),
              sex: "female",
            },
            {
              id: SOL,
              householdId: HOUSEHOLD_B,
              displayName: "Sol",
              dateOfBirth: v(-913),
              sex: "male",
            },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.children.id })
      ).length,
    );
    record(
      "child_guardians",
      (
        await tx
          .insert(schema.childGuardians)
          .values([
            { id: seedId(BLOCK.childGuardians, 1), childId: ILO, userId: MIRA.id },
            { id: seedId(BLOCK.childGuardians, 2), childId: ILO, userId: LENA.id },
            { id: seedId(BLOCK.childGuardians, 3), childId: SOL, userId: MIRA.id },
            { id: seedId(BLOCK.childGuardians, 4), childId: SOL, userId: LENA.id },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.childGuardians.id })
      ).length,
    );
    for (const childId of [ILO, SOL]) {
      const key = await provisionChildKey(tx, childId, kek);
      if (key.created) keysCreated += 1;
    }
    record("subject_keys", keysCreated);

    // Grants: summary, read, contribute and revoked; a child grant for one child.
    record(
      "grants",
      (
        await tx
          .insert(schema.grants)
          .values([
            {
              id: GRANT_NOOR_THEO_SUMMARY,
              ownerId: NOOR.id,
              granteeId: THEO.id,
              category: "cycle.status",
              level: "summary",
              notify: true,
              policyVersion: SEED_POLICY_VERSION,
              descriptionVersion: SEED_POLICY_VERSION,
              createdAt: daysBefore(now, 100),
            },
            {
              id: GRANT_NOOR_THEO_READ,
              ownerId: NOOR.id,
              granteeId: THEO.id,
              category: "cycle.symptoms",
              level: "read",
              policyVersion: SEED_POLICY_VERSION,
              descriptionVersion: SEED_POLICY_VERSION,
              createdAt: daysBefore(now, 100),
            },
            {
              id: GRANT_NOOR_THEO_REVOKED,
              ownerId: NOOR.id,
              granteeId: THEO.id,
              category: "cycle.history",
              level: "read",
              policyVersion: SEED_POLICY_VERSION,
              descriptionVersion: SEED_POLICY_VERSION,
              createdAt: daysBefore(now, 100),
              revokedAt: daysBefore(now, 20),
            },
            {
              id: GRANT_LENA_MIRA_CONTRIBUTE,
              ownerId: LENA.id,
              granteeId: MIRA.id,
              category: "pregnancy.overview",
              level: "contribute",
              policyVersion: SEED_POLICY_VERSION,
              descriptionVersion: SEED_POLICY_VERSION,
              createdAt: daysBefore(now, 60),
            },
            {
              id: GRANT_MIRA_PIA_READ,
              ownerId: MIRA.id,
              granteeId: PIA.id,
              category: "child",
              level: "read",
              childId: SOL,
              policyVersion: SEED_POLICY_VERSION,
              descriptionVersion: SEED_POLICY_VERSION,
              createdAt: daysBefore(now, 200),
            },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.grants.id })
      ).length,
    );

    // Consents: what each subject agreed to collect, with the disclosure's hash.
    const consent = (
      n: number,
      subjectId: string,
      category: (typeof schema.dataCategoryValues)[number],
      basis: (typeof schema.consentBasisValues)[number],
      purpose: string,
      grantedAt: Date,
      consentingGuardianId: string | null = null,
    ): typeof schema.consents.$inferInsert => ({
      id: seedId(BLOCK.consents, n),
      subjectId,
      consentingGuardianId,
      category,
      basis,
      purpose,
      policyVersion: SEED_POLICY_VERSION,
      textHash: sha256(purpose),
      grantedAt,
    });
    record(
      "consents",
      (
        await tx
          .insert(schema.consents)
          .values([
            consent(
              1,
              NOOR.id,
              "cycle.history",
              "necessary",
              "Keep the dates you log so the calendar and the estimates work.",
              signedUp(NOOR),
            ),
            consent(
              2,
              NOOR.id,
              "cycle.symptoms",
              "necessary",
              "Keep what you log on a day so you can look back at it.",
              signedUp(NOOR),
            ),
            consent(
              3,
              NOOR.id,
              "journal.private",
              "necessary",
              "Keep your private notes, readable by you alone.",
              signedUp(NOOR),
            ),
            consent(
              4,
              NOOR.id,
              "cycle.status",
              "consent",
              "Show a status card to the people you choose.",
              daysBefore(now, 100),
            ),
            consent(
              5,
              LENA.id,
              "pregnancy.overview",
              "necessary",
              "Keep your due date, appointments and milestones.",
              signedUp(LENA),
            ),
            consent(
              6,
              LENA.id,
              "pregnancy.photos",
              "consent",
              "Keep the photos you add to your journey.",
              signedUp(LENA),
            ),
            consent(
              7,
              LENA.id,
              "journal.private",
              "necessary",
              "Keep your private notes, readable by you alone.",
              signedUp(LENA),
            ),
            consent(
              8,
              MIRA.id,
              "journal.private",
              "necessary",
              "Keep your private notes, readable by you alone.",
              signedUp(MIRA),
            ),
            consent(
              9,
              MIRA.id,
              "pregnancy.overview",
              "necessary",
              "Keep your due date, appointments and milestones.",
              signedUp(MIRA),
            ),
            consent(
              10,
              ILO,
              "child",
              "necessary",
              "Keep this child's feeds, sleep, growth and milestones.",
              daysBefore(now, 42),
              MIRA.id,
            ),
            consent(
              11,
              SOL,
              "child",
              "necessary",
              "Keep this child's feeds, sleep, growth and milestones.",
              daysBefore(now, 420),
              MIRA.id,
            ),
          ])
          .onConflictDoNothing()
          .returning({ id: schema.consents.id })
      ).length,
    );

    // Noor's day sheet, symptoms and the live prediction core would derive
    // from her three period starts (28 and 28 days apart: estimate, two
    // samples, three days of uncertainty).
    const entryRows: (typeof schema.cycleEntries.$inferInsert)[] = [];
    const symptomRows: (typeof schema.entrySymptoms.$inferInsert)[] = [];
    let symptomCount = 0;
    NOOR_DAYS.forEach(([offset, flow, mood, symptoms], index) => {
      const entryId = seedId(BLOCK.cycleEntries, index + 1);
      entryRows.push({ id: entryId, subjectId: NOOR.id, date: t(offset), flow, mood });
      for (const code of symptoms) {
        symptomCount += 1;
        symptomRows.push({
          id: seedId(BLOCK.entrySymptoms, symptomCount),
          entryId,
          subjectId: NOOR.id,
          code,
        });
      }
    });
    record(
      "cycle_entries",
      (
        await tx
          .insert(schema.cycleEntries)
          .values(entryRows)
          .onConflictDoNothing()
          .returning({ id: schema.cycleEntries.id })
      ).length,
    );
    record(
      "entry_symptoms",
      (
        await tx
          .insert(schema.entrySymptoms)
          .values(symptomRows)
          .onConflictDoNothing()
          .returning({ id: schema.entrySymptoms.id })
      ).length,
    );
    record(
      "cycle_predictions",
      (
        await tx
          .insert(schema.cyclePredictions)
          .values({
            id: NOOR_PREDICTION,
            subjectId: NOOR.id,
            basis: "estimate",
            cycleLength: 28,
            sampleSize: 2,
            nextPeriodStart: t(26),
            ovulation: t(12),
            fertileWindowStart: t(7),
            fertileWindowEnd: t(12),
            uncertaintyDays: 3,
            ovulationBandDays: 2,
            computedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: schema.cyclePredictions.id })
      ).length,
    );

    // Lena's open pregnancy, redated at the 14 week scan (eight days, past
    // ACOG's seven day threshold for that window), and Mira's that ended in
    // Ilo's birth. The ended reason is hers alone (storage map, 8.2).
    record(
      "pregnancies",
      (
        await tx
          .insert(schema.pregnancies)
          .values([
            {
              id: LENA_PREGNANCY,
              subjectId: LENA.id,
              dueDate: v(126),
              datingMethod: "ultrasound",
              startedAt: daysBefore(now, 98),
            },
            {
              id: MIRA_PREGNANCY,
              subjectId: MIRA.id,
              dueDate: v(-40),
              datingMethod: "lmp",
              startedAt: daysBefore(now, 300),
              endedAt: v(-42),
              endedReason: "birth",
            },
          ])
          .onConflictDoNothing()
          .returning({ id: schema.pregnancies.id })
      ).length,
    );
    record(
      "due_date_changes",
      (
        await tx
          .insert(schema.dueDateChanges)
          .values({
            id: seedId(BLOCK.dueDateChanges, 1),
            pregnancyId: LENA_PREGNANCY,
            subjectId: LENA.id,
            previousDueDate: v(134),
            nextDueDate: v(126),
            method: "ultrasound",
            changedAt: daysBefore(now, 56),
          })
          .onConflictDoNothing()
          .returning({ id: schema.dueDateChanges.id })
      ).length,
    );

    // Free text: unwrap each subject's DEK once (the request cache of D2),
    // then seal every label, note and body under its own row's AAD.
    const keys = createKeyCache();
    try {
      for (const subjectId of [NOOR.id, LENA.id, MIRA.id, ILO]) {
        await unwrapForSubject(tx, subjectId, kek, keys);
      }

      record(
        "pregnancy_events",
        (
          await tx
            .insert(schema.pregnancyEvents)
            .values(
              SEED_PREGNANCY_EVENTS.map((event) => ({
                id: event.id,
                pregnancyId: event.pregnancyId,
                subjectId: event.subjectId,
                authorId: event.authorId,
                kind: event.kind,
                date: v(event.dayOffset),
                label:
                  event.label === null
                    ? null
                    : encryptFieldFor(
                        keys,
                        {
                          subjectId: event.subjectId,
                          table: "pregnancy_events",
                          column: "label",
                          rowId: event.id,
                        },
                        event.label,
                      ),
                kekVersion: event.label === null ? null : kek.version,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: schema.pregnancyEvents.id })
        ).length,
      );

      // Ilo's feeds, a night's sleep and a diaper; the checked milestones for
      // both children; Sol's night. A feed with a note seals it under Ilo's key.
      const childEventRows: (typeof schema.childEvents.$inferInsert)[] = [
        {
          id: seedId(BLOCK.childEvents, 1),
          childId: ILO,
          authorId: MIRA.id,
          kind: "feed",
          date: v(-1),
          startedAt: hoursBefore(now, 26),
          quantityMl: 90,
        },
        {
          id: ILO_FEED_NOTE.id,
          childId: ILO,
          authorId: LENA.id,
          kind: "feed",
          date: v(-1),
          startedAt: hoursBefore(now, 22),
          note: encryptFieldFor(
            keys,
            { subjectId: ILO, table: "child_events", column: "note", rowId: ILO_FEED_NOTE.id },
            ILO_FEED_NOTE.text,
          ),
          kekVersion: kek.version,
        },
        {
          id: seedId(BLOCK.childEvents, 3),
          childId: ILO,
          authorId: MIRA.id,
          kind: "sleep",
          date: v(0),
          startedAt: hoursBefore(now, 9),
          endedAt: hoursBefore(now, 3),
        },
        {
          id: seedId(BLOCK.childEvents, 4),
          childId: ILO,
          authorId: LENA.id,
          kind: "diaper",
          date: v(0),
          startedAt: hoursBefore(now, 2),
        },
        ...CHECKED_MILESTONES.map((item, index) => ({
          id: item.id,
          childId: item.childId,
          authorId: index % 2 === 0 ? MIRA.id : LENA.id,
          kind: "milestone" as const,
          date: v([-3, -5, -5, -200, -190][index] ?? 0),
          milestoneId: item.milestoneId,
        })),
        {
          id: seedId(BLOCK.childEvents, 10),
          childId: SOL,
          authorId: LENA.id,
          kind: "sleep",
          date: v(-1),
          startedAt: hoursBefore(now, 24),
          endedAt: hoursBefore(now, 14),
        },
      ];
      record(
        "child_events",
        (
          await tx
            .insert(schema.childEvents)
            .values(childEventRows)
            .onConflictDoNothing()
            .returning({ id: schema.childEvents.id })
        ).length,
      );

      record(
        "child_measurements",
        (
          await tx
            .insert(schema.childMeasurements)
            .values([
              {
                id: seedId(BLOCK.childMeasurements, 1),
                childId: ILO,
                authorId: MIRA.id,
                date: v(-42),
                weightGrams: 3400,
                lengthMillimetres: 505,
                headMillimetres: 345,
              },
              {
                id: seedId(BLOCK.childMeasurements, 2),
                childId: ILO,
                authorId: LENA.id,
                date: v(-28),
                weightGrams: 3650,
              },
              {
                id: seedId(BLOCK.childMeasurements, 3),
                childId: ILO,
                authorId: MIRA.id,
                date: v(-1),
                weightGrams: 4600,
                lengthMillimetres: 555,
                headMillimetres: 375,
              },
              {
                id: seedId(BLOCK.childMeasurements, 4),
                childId: SOL,
                authorId: MIRA.id,
                date: v(-183),
                weightGrams: 12500,
                lengthMillimetres: 870,
                headMillimetres: 485,
              },
              {
                id: seedId(BLOCK.childMeasurements, 5),
                childId: SOL,
                authorId: LENA.id,
                date: v(-5),
                weightGrams: 13600,
                lengthMillimetres: 920,
              },
            ])
            .onConflictDoNothing()
            .returning({ id: schema.childMeasurements.id })
        ).length,
      );

      record(
        "notes",
        (
          await tx
            .insert(schema.notes)
            .values(
              SEED_NOTES.map((note) => ({
                id: note.id,
                subjectId: note.subjectId,
                authorId: note.authorId,
                category: note.category,
                date: shiftDays(note.subjectId === NOOR.id ? berlin : vancouver, note.dayOffset),
                body: encryptFieldFor(
                  keys,
                  { subjectId: note.subjectId, table: "notes", column: "body", rowId: note.id },
                  note.text,
                ),
                kekVersion: kek.version,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: schema.notes.id })
        ).length,
      );
    } finally {
      keys.clear();
    }

    // The audit trail: sign-ins, every grant change, the partner reads
    // (one row per actor, subject, category and day) and the partner writes.
    const audit = (
      n: number,
      actorId: string,
      action: string,
      subjectId: string,
      category: (typeof schema.dataCategoryValues)[number] | null,
      occurredAt: Date,
      extra: { childId?: string; dedupeKey?: string } = {},
    ): typeof schema.auditEvents.$inferInsert => ({
      id: seedId(BLOCK.auditEvents, n),
      actorId,
      action,
      subjectId,
      category,
      childId: extra.childId ?? null,
      occurredAt,
      dedupeKey: extra.dedupeKey ?? null,
    });
    record(
      "audit_events",
      (
        await tx
          .insert(schema.auditEvents)
          .values([
            audit(1, NOOR.id, "session.sign_in", NOOR.id, null, hoursBefore(now, 3)),
            audit(2, THEO.id, "session.sign_in", THEO.id, null, hoursBefore(now, 5)),
            audit(3, MIRA.id, "session.sign_in", MIRA.id, null, hoursBefore(now, 2)),
            audit(4, LENA.id, "session.sign_in", LENA.id, null, hoursBefore(now, 8)),
            audit(5, PIA.id, "session.sign_in", PIA.id, null, hoursBefore(now, 30)),
            audit(6, NOOR.id, "grant.create", NOOR.id, "cycle.status", daysBefore(now, 100)),
            audit(7, NOOR.id, "grant.create", NOOR.id, "cycle.symptoms", daysBefore(now, 100)),
            audit(8, NOOR.id, "grant.create", NOOR.id, "cycle.history", daysBefore(now, 100)),
            audit(9, NOOR.id, "grant.revoke", NOOR.id, "cycle.history", daysBefore(now, 20)),
            audit(10, LENA.id, "grant.create", LENA.id, "pregnancy.overview", daysBefore(now, 60)),
            audit(11, MIRA.id, "grant.create", SOL, "child", daysBefore(now, 200), {
              childId: SOL,
            }),
            audit(12, THEO.id, "share.read", NOOR.id, "cycle.symptoms", hoursBefore(now, 4), {
              dedupeKey: readDedupeKey(THEO.id, NOOR.id, "cycle.symptoms", t(0)),
            }),
            audit(13, THEO.id, "share.read", NOOR.id, "cycle.symptoms", daysBefore(now, 1), {
              dedupeKey: readDedupeKey(THEO.id, NOOR.id, "cycle.symptoms", t(-1)),
            }),
            audit(14, PIA.id, "share.read", SOL, "child", hoursBefore(now, 29), {
              childId: SOL,
              dedupeKey: readDedupeKey(PIA.id, SOL, "child", v(-1)),
            }),
            audit(15, MIRA.id, "share.write", LENA.id, "pregnancy.overview", daysBefore(now, 3)),
            audit(16, MIRA.id, "share.write", LENA.id, "pregnancy.overview", daysBefore(now, 14)),
            audit(17, NOOR.id, "invitation.create", NOOR.id, null, daysBefore(now, 1)),
            audit(18, NOOR.id, "invitation.withdraw", NOOR.id, null, daysBefore(now, 29)),
          ])
          .onConflictDoNothing()
          .returning({ id: schema.auditEvents.id })
      ).length,
    );

    record("vocabulary", await seedVocabulary(tx));

    return { inserted };
  }, db);
}
