import { Hono } from "hono";
import { sql } from "drizzle-orm";
import {
  FixedKeyProvider,
  createKeyCache,
  encryptFieldFor,
  provisionSubjectKey,
  unwrapForSubject,
} from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import { schema } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";

import type { TidefernApi } from "../app";
import { DB_VARIABLE, KEYS_VARIABLE } from "../routes/account";
import { ANNA, BEN, CARA } from "./actors";
import { FakeAuth } from "./auth-fake";
import { createApiTestDatabase } from "./database";
import type { ApiTestDatabase } from "./database";

/**
 * The cast for the account routes: Anna with a profile, a key, notes, a day
 * entry, a pregnancy, grants in both directions, a household and a child;
 * Ben as her partner with his own rows; Cara as a grantee. Sessions carry
 * UUID ids and matching rows in Better Auth's table, because closing an
 * account deletes the other sessions by id. Synthetic throughout.
 */

export const KEK: KeyProvider = new FixedKeyProvider(Buffer.alloc(32, 7), "v1");

export const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
export const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";

export const SESSIONS = {
  anna: "018f5e7a-5000-7000-8000-000000000001",
  annaPhone: "018f5e7a-5000-7000-8000-000000000002",
  annaTablet: "018f5e7a-5000-7000-8000-000000000003",
  annaStale: "018f5e7a-5000-7000-8000-000000000004",
  ben: "018f5e7a-5000-7000-8000-000000000005",
  benStale: "018f5e7a-5000-7000-8000-000000000006",
  cara: "018f5e7a-5000-7000-8000-000000000007",
} as const;

export const TOKENS = {
  anna: "anna",
  annaStale: "anna-stale",
  ben: "ben",
  benStale: "ben-stale",
  cara: "cara",
} as const;

export const GRANTS = {
  annaToBenSymptoms: "018f5e7a-2000-7000-8000-000000000001",
  annaToCaraStatus: "018f5e7a-2000-7000-8000-000000000002",
  annaToCaraChild: "018f5e7a-2000-7000-8000-000000000003",
  benToAnnaHistory: "018f5e7a-2000-7000-8000-000000000004",
  benToCaraStatus: "018f5e7a-2000-7000-8000-000000000005",
} as const;

export const NOTES = {
  annaPrivate: "018f5e7a-7000-7000-8000-000000000001",
  annaShared: "018f5e7a-7000-7000-8000-000000000002",
  benPrivate: "018f5e7a-7000-7000-8000-000000000003",
} as const;

/** The decrypted texts the export must carry, and the one it must not. */
export const TEXTS = {
  annaPrivate: "Tired and teary tonight, early night.",
  annaShared: "Cramps eased by the evening.",
  benPrivate: "Ben's own private thought.",
  annaEventLabel: "Scan booked at the clinic on the hill.",
} as const;

export const ENTRIES = {
  anna: "018f5e7a-8000-7000-8000-000000000001",
  ben: "018f5e7a-8000-7000-8000-000000000002",
} as const;

export const PREGNANCY = "018f5e7a-9000-7000-8000-000000000001";
export const PREGNANCY_EVENT = "018f5e7a-9000-7000-8000-000000000002";

/** The seeded audit rows, oldest first; `T` is the reference instant. */
export const T = new Date("2026-10-05T12:00:00.000Z");
const hoursBefore = (hours: number) => new Date(T.getTime() - hours * 60 * 60_000);

export const AUDIT = {
  annaGrantSymptoms: "018f5e7a-6000-7000-8000-000000000001",
  annaGrantStatus: "018f5e7a-6000-7000-8000-000000000002",
  annaGrantChild: "018f5e7a-6000-7000-8000-000000000003",
  benReadsAnna: "018f5e7a-6000-7000-8000-000000000004",
  caraReadsAnna: "018f5e7a-6000-7000-8000-000000000006",
  caraReadsChild: "018f5e7a-6000-7000-8000-000000000007",
  benGrantCara: "018f5e7a-6000-7000-8000-000000000008",
  /** Two of Cara's rows inside one millisecond, 400 and 900 microseconds in. */
  caraEarlyMicro: "018f5e7a-6000-7000-8000-000000000009",
  caraLateMicro: "018f5e7a-6000-7000-8000-00000000000a",
} as const;

export interface AccountFixture {
  harness: ApiTestDatabase;
  auth: FakeAuth;
}

function registerSession(
  auth: FakeAuth,
  token: string,
  id: string,
  userId: string,
  email: string,
  ageSeconds: number,
): void {
  const createdAt = new Date(Date.now() - ageSeconds * 1000);
  auth.sessions.set(token, {
    session: {
      id,
      userId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    user: { id: userId, email, emailVerified: true },
  });
}

export async function createAccountFixture(): Promise<AccountFixture> {
  const harness = await createApiTestDatabase();
  const { db } = harness;

  await db.insert(schema.user).values([
    { id: ANNA, name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: BEN, name: "Ben", email: "ben@example.com", emailVerified: true },
    { id: CARA, name: "Cara", email: "cara@example.com", emailVerified: true },
  ]);
  const ago = (hours: number) => hoursBefore(hours);
  await db.insert(schema.session).values(
    (
      [
        [SESSIONS.anna, ANNA],
        [SESSIONS.annaPhone, ANNA],
        [SESSIONS.annaTablet, ANNA],
        [SESSIONS.annaStale, ANNA],
        [SESSIONS.ben, BEN],
        [SESSIONS.benStale, BEN],
        [SESSIONS.cara, CARA],
      ] as const
    ).map(([id, userId]) => ({
      id,
      userId,
      token: `token-${id}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    })),
  );

  await db.insert(schema.profiles).values([
    {
      userId: ANNA,
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      stage: "pregnancy",
      ageAttestedAt: ago(48),
    },
    {
      userId: BEN,
      displayName: "Ben",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      ageAttestedAt: ago(48),
    },
  ]);
  await provisionSubjectKey(db, ANNA, KEK, "user");
  await provisionSubjectKey(db, BEN, KEK, "user");

  await db.insert(schema.households).values({ id: HOUSEHOLD });
  await db.insert(schema.householdMembers).values([
    {
      id: "018f5e7a-a000-7000-8000-000000000001",
      householdId: HOUSEHOLD,
      userId: ANNA,
      role: "owner",
    },
    {
      id: "018f5e7a-a000-7000-8000-000000000002",
      householdId: HOUSEHOLD,
      userId: BEN,
      role: "partner",
    },
  ]);
  await db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" });
  await db
    .insert(schema.childGuardians)
    .values({ id: "018f5e7a-a000-7000-8000-000000000003", childId: CHILD, userId: ANNA });

  const versions = { policyVersion: "2026-10", descriptionVersion: "2026-10" };
  await db.insert(schema.grants).values([
    {
      id: GRANTS.annaToBenSymptoms,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.symptoms",
      level: "read",
      ...versions,
    },
    {
      id: GRANTS.annaToCaraStatus,
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.status",
      level: "summary",
      ...versions,
    },
    {
      id: GRANTS.annaToCaraChild,
      ownerId: ANNA,
      granteeId: CARA,
      category: "child",
      level: "contribute",
      childId: CHILD,
      ...versions,
    },
    {
      id: GRANTS.benToAnnaHistory,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.history",
      level: "read",
      ...versions,
    },
    {
      id: GRANTS.benToCaraStatus,
      ownerId: BEN,
      granteeId: CARA,
      category: "cycle.status",
      level: "summary",
      ...versions,
    },
  ]);

  await db.insert(schema.consents).values({
    id: "018f5e7a-b000-7000-8000-000000000001",
    subjectId: ANNA,
    category: "cycle.history",
    basis: "necessary",
    purpose: "Keep the calendar she asked for.",
    policyVersion: "2026-10",
    textHash: "0".repeat(64),
  });

  await db.insert(schema.cycleEntries).values([
    { id: ENTRIES.anna, subjectId: ANNA, date: "2026-09-28", flow: "medium", mood: "low" },
    { id: ENTRIES.ben, subjectId: BEN, date: "2026-09-29", flow: "light" },
  ]);
  await db.insert(schema.entrySymptoms).values([
    {
      id: "018f5e7a-8000-7000-8000-000000000011",
      entryId: ENTRIES.anna,
      subjectId: ANNA,
      code: "nausea",
    },
    {
      id: "018f5e7a-8000-7000-8000-000000000012",
      entryId: ENTRIES.anna,
      subjectId: ANNA,
      code: "cramps",
    },
  ]);

  await db.insert(schema.pregnancies).values({
    id: PREGNANCY,
    subjectId: ANNA,
    dueDate: "2027-03-15",
    datingMethod: "lmp",
  });
  await db.insert(schema.dueDateChanges).values({
    id: "018f5e7a-9000-7000-8000-000000000003",
    pregnancyId: PREGNANCY,
    subjectId: ANNA,
    previousDueDate: "2027-03-12",
    nextDueDate: "2027-03-15",
    method: "ultrasound",
    changedAt: ago(72),
  });

  // Free text sealed under each subject's own key, as the routes will.
  const keys = createKeyCache();
  await unwrapForSubject(db, ANNA, KEK, keys);
  await unwrapForSubject(db, BEN, KEK, keys);
  await db.insert(schema.pregnancyEvents).values({
    id: PREGNANCY_EVENT,
    pregnancyId: PREGNANCY,
    subjectId: ANNA,
    authorId: ANNA,
    kind: "appointment",
    date: "2026-10-20",
    label: encryptFieldFor(
      keys,
      { subjectId: ANNA, table: "pregnancy_events", column: "label", rowId: PREGNANCY_EVENT },
      TEXTS.annaEventLabel,
    ),
    kekVersion: KEK.version,
  });
  const note = (
    id: string,
    subjectId: string,
    category: "journal.private" | "cycle.symptoms",
    text: string,
  ) => ({
    id,
    subjectId,
    authorId: subjectId,
    category,
    date: "2026-09-28",
    body: encryptFieldFor(keys, { subjectId, table: "notes", column: "body", rowId: id }, text),
    kekVersion: KEK.version,
  });
  await db
    .insert(schema.notes)
    .values([
      note(NOTES.annaPrivate, ANNA, "journal.private", TEXTS.annaPrivate),
      note(NOTES.annaShared, ANNA, "cycle.symptoms", TEXTS.annaShared),
      note(NOTES.benPrivate, BEN, "journal.private", TEXTS.benPrivate),
    ]);
  keys.clear();

  await db.insert(schema.auditEvents).values([
    {
      id: AUDIT.annaGrantSymptoms,
      actorId: ANNA,
      action: "grant.create",
      subjectId: ANNA,
      category: "cycle.symptoms",
      occurredAt: ago(5),
    },
    {
      id: AUDIT.annaGrantStatus,
      actorId: ANNA,
      action: "grant.create",
      subjectId: ANNA,
      category: "cycle.status",
      occurredAt: ago(4),
    },
    {
      id: AUDIT.annaGrantChild,
      actorId: ANNA,
      action: "grant.create",
      subjectId: CHILD,
      category: "child",
      childId: CHILD,
      occurredAt: ago(3),
    },
    {
      id: AUDIT.benReadsAnna,
      actorId: BEN,
      action: "partner.read",
      subjectId: ANNA,
      category: "cycle.symptoms",
      occurredAt: ago(2),
      dedupeKey: `${BEN}/${ANNA}/cycle.symptoms/2026-10-05`,
    },
    {
      id: AUDIT.caraReadsAnna,
      actorId: CARA,
      action: "partner.read",
      subjectId: ANNA,
      category: "cycle.status",
      occurredAt: ago(2),
      dedupeKey: `${CARA}/${ANNA}/cycle.status/2026-10-05`,
    },
    {
      id: AUDIT.caraReadsChild,
      actorId: CARA,
      action: "partner.read",
      subjectId: CHILD,
      category: "child",
      childId: CHILD,
      occurredAt: ago(1),
      dedupeKey: `${CARA}/${CHILD}/child/2026-10-05`,
    },
    {
      id: AUDIT.benGrantCara,
      actorId: BEN,
      action: "grant.create",
      subjectId: BEN,
      category: "cycle.status",
      occurredAt: ago(0.5),
    },
  ]);
  // Microseconds survive only through SQL; a JavaScript date stops at milliseconds.
  await db.execute(
    sql`insert into audit_events (id, actor_id, action, subject_id, occurred_at) values
      (${AUDIT.caraEarlyMicro}, ${CARA}, 'grant.create', ${CARA}, '2026-10-05T02:00:00.000400Z'::timestamptz),
      (${AUDIT.caraLateMicro}, ${CARA}, 'grant.create', ${CARA}, '2026-10-05T02:00:00.000900Z'::timestamptz)`,
  );

  const auth = new FakeAuth();
  registerSession(auth, TOKENS.anna, SESSIONS.anna, ANNA, "anna@example.com", 60);
  registerSession(auth, TOKENS.annaStale, SESSIONS.annaStale, ANNA, "anna@example.com", 11 * 60);
  registerSession(auth, TOKENS.ben, SESSIONS.ben, BEN, "ben@example.com", 60);
  registerSession(auth, TOKENS.benStale, SESSIONS.benStale, BEN, "ben@example.com", 11 * 60);
  registerSession(auth, TOKENS.cara, SESSIONS.cara, CARA, "cara@example.com", 60);
  return { harness, auth };
}

/**
 * The database as the request pool reaches it on CI and in production,
 * where `DATABASE_URL` names `tidefern_app` (architecture 7.2): every
 * transaction starts as that role, so `withSystem()` gets no system context
 * there and a request path works only through what the policies and the
 * definer functions allow. PGlite's own role is a superuser, which is what
 * hid the closure defect task E10 fixed; `packages/auth/src/keys.test.ts`
 * wraps its database the same way.
 */
export function asAppRole(db: ApiTestDatabase["db"]): ActorDatabase {
  return {
    transaction: (fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role tidefern_app`);
        return fn(tx);
      }),
  };
}

/**
 * The app with the test database and key provider on every request's
 * context, where the account routes look for them. The real app is mounted
 * whole, so the session, cross-site, rate limit and idempotency middleware
 * all run exactly as in production.
 */
export function withInjected(
  app: TidefernApi,
  injected: { db: ActorDatabase; keys: KeyProvider },
): Hono<{ Variables: { [DB_VARIABLE]: ActorDatabase; [KEYS_VARIABLE]: KeyProvider } }> {
  const outer = new Hono<{
    Variables: { [DB_VARIABLE]: ActorDatabase; [KEYS_VARIABLE]: KeyProvider };
  }>();
  outer.use("*", async (c, next) => {
    c.set(DB_VARIABLE, injected.db);
    c.set(KEYS_VARIABLE, injected.keys);
    await next();
  });
  outer.route("/", app);
  return outer;
}
