import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withActor, withSystem } from "./actor";
import type { Transaction } from "./actor";
import * as schema from "./schema/index";
import {
  ANNA,
  BEN,
  CARA,
  CHILD,
  HOUSEHOLD,
  OTHER_CHILD,
  id,
  insertProfile,
  insertUser,
  refusal,
  rows,
} from "./schema/testing";
import type { Harness } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * What this file proves, all on PGlite through withActor(), which drops to
 * tidefern_app so the policies apply (PGlite's own role is a superuser and
 * bypasses them): the 0007 helpers and policies mirror can() in core for
 * the owner, a summary grantee, a revoked grant, a grant scoped to one
 * child, the private journal, a foreign subject, and system context from
 * both roles. The last block re-owns the helpers to a role that cannot
 * bypass RLS, which is the shape of a Neon owner under FORCE, and runs the
 * same scenarios again.
 *
 * The cast: Anna tracks her cycle, owns the household and is a guardian of
 * both children. Ben is her partner in the household, a guardian of
 * nobody, with a summary grant on cycle.history and a read grant on
 * cycle.symptoms. Eve is the other guardian of the first child. Cara is
 * outside the household with a read grant on the first child only. Dana
 * has an account and no relationship with anyone.
 */
let harness: Harness;
let ownerRole: string;

// Synthetic ids only; nothing here is a real person.
const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
const EVE = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f50";

const SUMMARY_GRANT = id(1);
const SYMPTOMS_GRANT = id(2);
const CHILD_GRANT = id(3);
const ENTRY_ONE = id(10);
const ENTRY_TWO = id(11);
const PRIVATE_NOTE = id(20);
const SHARED_NOTE = id(21);
const FIRST_CHILD_EVENT = id(30);
const OTHER_CHILD_EVENT = id(31);
const PREDICTION = id(40);

/** 1 version byte, 12 IV bytes, 16 tag bytes, 32 wrapped key bytes. */
const WRAPPED_DEK = Uint8Array.from({ length: 61 }, (_, index) => (index * 7 + 3) % 256);
const CIPHERTEXT = Uint8Array.from([1, 2, 3, 4]);

/** The SECURITY DEFINER helpers, the ones that read tables under RLS. */
const DEFINER_HELPERS = [
  "is_guardian(uuid)",
  "has_guardian(uuid)",
  "child_household(uuid)",
  "is_household_member(uuid,text)",
  "has_members(uuid)",
  "may_join(uuid,text)",
  "can_read(uuid,text)",
  "can_write(uuid,text)",
  "can_use_key(uuid)",
  "is_related(uuid)",
];

/** Every table 0007 forces, as the catalog orders them. */
const RLS_TABLES = [
  "audit_events",
  "child_events",
  "child_guardians",
  "child_measurements",
  "children",
  "consents",
  "cycle_entries",
  "cycle_predictions",
  "data_requests",
  "disclosures",
  "due_date_changes",
  "entry_symptoms",
  "grants",
  "household_members",
  "households",
  "invitations",
  "notes",
  "photo_variants",
  "photos",
  "pregnancies",
  "pregnancy_events",
  "profiles",
  "subject_keys",
];

async function count(tx: Transaction, table: string): Promise<number> {
  const [row] = rows(
    await tx.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`),
  );
  return row?.n as number;
}

async function countsFor(actor: string, tables: string[]): Promise<Record<string, number>> {
  return withActor(
    actor,
    async (tx) => {
      const seen: Record<string, number> = {};
      for (const table of tables) seen[table] = await count(tx, table);
      return seen;
    },
    harness.db,
  );
}

async function helper(actor: string, expression: ReturnType<typeof sql>): Promise<unknown> {
  const [row] = await withActor(
    actor,
    async (tx) => rows(await tx.execute(sql`select ${expression} as value`)),
    harness.db,
  );
  return row?.value;
}

async function seed() {
  for (const [userId, email] of [
    [ANNA, "anna@example.test"],
    [BEN, "ben@example.test"],
    [CARA, "cara@example.test"],
    [DANA, "dana@example.test"],
    [EVE, "eve@example.test"],
  ] as const) {
    await insertUser(harness, userId, email);
    await insertProfile(harness, userId);
  }
  await harness.db.insert(schema.subjectKeys).values([
    {
      subjectId: ANNA,
      kind: "user",
      wrappedDek: WRAPPED_DEK,
      kekProvider: "env",
      kekVersion: "v1",
    },
    {
      subjectId: CHILD,
      kind: "child",
      wrappedDek: WRAPPED_DEK,
      kekProvider: "env",
      kekVersion: "v1",
    },
  ]);
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
  await harness.db.insert(schema.householdMembers).values([
    { id: id(50), householdId: HOUSEHOLD, userId: ANNA, role: "owner" },
    { id: id(51), householdId: HOUSEHOLD, userId: BEN, role: "partner" },
    { id: id(52), householdId: HOUSEHOLD, userId: EVE, role: "guardian" },
  ]);
  await harness.db.insert(schema.children).values([
    { id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2026-02-14" },
    { id: OTHER_CHILD, householdId: HOUSEHOLD, displayName: "Lu", dateOfBirth: "2024-06-01" },
  ]);
  await harness.db.insert(schema.childGuardians).values([
    { id: id(60), childId: CHILD, userId: ANNA },
    { id: id(61), childId: CHILD, userId: EVE },
    { id: id(62), childId: OTHER_CHILD, userId: ANNA },
  ]);
  await harness.db.insert(schema.cycleEntries).values([
    { id: ENTRY_ONE, subjectId: ANNA, date: "2026-09-01", flow: "medium", mood: "low" },
    { id: ENTRY_TWO, subjectId: ANNA, date: "2026-09-02", flow: "light", mood: "steady" },
  ]);
  await harness.db
    .insert(schema.entrySymptoms)
    .values({ id: id(12), entryId: ENTRY_ONE, subjectId: ANNA, code: "cramps" });
  await harness.db.insert(schema.cyclePredictions).values({
    id: PREDICTION,
    subjectId: ANNA,
    basis: "estimate",
    cycleLength: 28,
    sampleSize: 3,
    nextPeriodStart: "2026-09-29",
    uncertaintyDays: 2,
    ovulationBandDays: 2,
  });
  await harness.db.insert(schema.notes).values([
    {
      id: PRIVATE_NOTE,
      subjectId: ANNA,
      authorId: ANNA,
      category: "journal.private",
      date: "2026-09-01",
      body: CIPHERTEXT,
      kekVersion: "v1",
    },
    {
      id: SHARED_NOTE,
      subjectId: ANNA,
      authorId: ANNA,
      category: "cycle.symptoms",
      date: "2026-09-01",
      body: CIPHERTEXT,
      kekVersion: "v1",
    },
  ]);
  await harness.db.insert(schema.childEvents).values([
    { id: FIRST_CHILD_EVENT, childId: CHILD, authorId: ANNA, kind: "feed", date: "2026-09-01" },
    {
      id: OTHER_CHILD_EVENT,
      childId: OTHER_CHILD,
      authorId: ANNA,
      kind: "feed",
      date: "2026-09-01",
    },
  ]);
  await harness.db.insert(schema.grants).values([
    {
      id: SUMMARY_GRANT,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.history",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    {
      id: SYMPTOMS_GRANT,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.symptoms",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    {
      id: CHILD_GRANT,
      ownerId: ANNA,
      granteeId: CARA,
      category: "child",
      level: "read",
      childId: CHILD,
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
  ]);
}

beforeAll(async () => {
  harness = await createTestDatabase();
  const [row] = rows(await harness.db.execute(sql`select current_user as owner`));
  ownerRole = row?.owner as string;
  await seed();
});

afterAll(async () => {
  await harness.close();
});

describe("the 0007 migration", () => {
  test("forces row security on every user-data table and on nothing else", async () => {
    const flags = rows(
      await harness.db.execute(
        sql`select relname, relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
      ),
    );
    const forced = flags.filter((row) => row.relforcerowsecurity).map((row) => row.relname);
    expect(forced).toEqual(RLS_TABLES);
    // ENABLE and FORCE go together: no table has one without the other.
    expect(flags.filter((row) => row.relrowsecurity).map((row) => row.relname)).toEqual(forced);
  });

  test("gives every forced table one permissive policy per command", async () => {
    const policies = rows(
      await harness.db.execute(
        sql`select tablename, string_agg(cmd, ',' order by cmd) as commands, bool_and(permissive = 'PERMISSIVE') as permissive from pg_catalog.pg_policies group by tablename order by tablename`,
      ),
    );
    expect(policies).toEqual(
      RLS_TABLES.map((tablename) => ({
        tablename,
        commands: "DELETE,INSERT,SELECT,UPDATE",
        permissive: true,
      })),
    );
  });

  test("declares the helpers SECURITY DEFINER, STABLE, with the pinned search_path and the marker", async () => {
    const definers = rows(
      await harness.db.execute(
        sql`select p.oid::regprocedure::text as signature, p.prosecdef, p.provolatile, p.proconfig from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef order by signature`,
      ),
    );
    expect(definers.map((row) => row.signature as string).sort()).toEqual(
      [...DEFINER_HELPERS].sort(),
    );
    for (const row of definers) {
      expect(row.provolatile).toBe("s");
      expect(row.proconfig).toEqual(["search_path=pg_catalog, public", "app.policy_helper=on"]);
    }

    // The three readers of the transaction settings run as the caller: an
    // is_system() that ran as the owner would let the app role pass.
    const invokers = rows(
      await harness.db.execute(
        sql`select p.oid::regprocedure::text as signature, p.provolatile, p.proconfig from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and not p.prosecdef and p.proname in ('current_actor', 'is_system', 'in_policy_helper', 'actor_email') order by signature`,
      ),
    );
    expect(invokers).toEqual([
      {
        signature: "actor_email()",
        provolatile: "s",
        proconfig: ["search_path=pg_catalog, public"],
      },
      {
        signature: "current_actor()",
        provolatile: "s",
        proconfig: ["search_path=pg_catalog, public"],
      },
      {
        signature: "in_policy_helper()",
        provolatile: "s",
        proconfig: ["search_path=pg_catalog, public"],
      },
      { signature: "is_system()", provolatile: "s", proconfig: ["search_path=pg_catalog, public"] },
    ]);
  });

  test("adds the indexes the policies lean on", async () => {
    const indexes = rows(
      await harness.db.execute(
        sql`select indexname from pg_catalog.pg_indexes where schemaname = 'public' and indexname in ('due_date_changes_subject_idx', 'photos_child_idx', 'invitations_invitee_email_idx') order by indexname`,
      ),
    );
    expect(indexes.map((row) => row.indexname)).toEqual([
      "due_date_changes_subject_idx",
      "invitations_invitee_email_idx",
      "photos_child_idx",
    ]);
  });
});

describe("the owner", () => {
  test("reads her own rows across the tables that carry them", async () => {
    expect(
      await countsFor(ANNA, [
        "profiles",
        "subject_keys",
        "cycle_entries",
        "entry_symptoms",
        "cycle_predictions",
        "notes",
        "grants",
        "households",
        "household_members",
        "children",
        "child_guardians",
        "child_events",
      ]),
    ).toEqual({
      // Her own profile plus Ben, Eve (household) and Cara (a grant she made).
      profiles: 4,
      // Her own key and the first child's; she is a guardian of both children.
      subject_keys: 2,
      cycle_entries: 2,
      entry_symptoms: 1,
      cycle_predictions: 1,
      notes: 2,
      grants: 3,
      households: 1,
      household_members: 3,
      children: 2,
      child_guardians: 3,
      child_events: 2,
    });
  });

  test("writes, changes and removes a row of her own", async () => {
    const entry = id(100);
    const written = await withActor(
      ANNA,
      async (tx) => {
        await tx
          .insert(schema.cycleEntries)
          .values({ id: entry, subjectId: ANNA, date: "2026-09-03", flow: "spotting" });
        const updated = await tx
          .update(schema.cycleEntries)
          .set({ flow: "heavy", version: 2 })
          .where(eq(schema.cycleEntries.id, entry))
          .returning({ flow: schema.cycleEntries.flow });
        const removed = await tx
          .delete(schema.cycleEntries)
          .where(eq(schema.cycleEntries.id, entry))
          .returning({ id: schema.cycleEntries.id });
        return { updated, removed };
      },
      harness.db,
    );
    expect(written).toEqual({ updated: [{ flow: "heavy" }], removed: [{ id: entry }] });
  });

  test("alone files a note in the private journal", async () => {
    const note = id(101);
    const [written] = await withActor(
      ANNA,
      (tx) =>
        tx
          .insert(schema.notes)
          .values({
            id: note,
            subjectId: ANNA,
            authorId: ANNA,
            category: "journal.private",
            date: "2026-09-04",
            body: CIPHERTEXT,
            kekVersion: "v1",
          })
          .returning({ category: schema.notes.category }),
      harness.db,
    );
    expect(written).toEqual({ category: "journal.private" });
    await harness.db.delete(schema.notes).where(eq(schema.notes.id, note));
  });
});

describe("a summary grantee", () => {
  test("reads the rows of the granted category and the API projects them", async () => {
    // RLS works per row: the summary grant lets the prediction rows through,
    // and the serializer (projectRow in core) decides which columns a summary
    // level shows. cycle_predictions files under cycle.history alone, so it
    // isolates the summary grant from Ben's read grant on symptoms.
    expect(await helper(BEN, sql`can_read(${ANNA}::uuid, 'cycle.history')`)).toBe(true);
    expect(await helper(BEN, sql`can_write(${ANNA}::uuid, 'cycle.history')`)).toBe(false);
    expect(await countsFor(BEN, ["cycle_predictions", "cycle_entries"])).toEqual({
      cycle_predictions: 1,
      cycle_entries: 2,
    });
  });

  test("cannot insert, and neither can a read grantee", async () => {
    const prediction = await refusal(
      withActor(
        BEN,
        (tx) =>
          tx.insert(schema.cyclePredictions).values({
            id: id(102),
            subjectId: ANNA,
            basis: "first_guess",
            uncertaintyDays: 4,
            ovulationBandDays: 2,
          }),
        harness.db,
      ),
    );
    expect(prediction).toMatch(/row-level security policy for table "cycle_predictions"/);

    // The read grant on cycle.symptoms is not contribute either.
    const symptom = await refusal(
      withActor(
        BEN,
        (tx) =>
          tx
            .insert(schema.entrySymptoms)
            .values({ id: id(103), entryId: ENTRY_ONE, subjectId: ANNA, code: "headache" }),
        harness.db,
      ),
    );
    expect(symptom).toMatch(/row-level security policy for table "entry_symptoms"/);
  });

  test("cannot change a row through an update either", async () => {
    const touched = await withActor(
      BEN,
      (tx) =>
        tx
          .update(schema.cyclePredictions)
          .set({ sampleSize: 99 })
          .where(eq(schema.cyclePredictions.id, PREDICTION))
          .returning({ id: schema.cyclePredictions.id }),
      harness.db,
    );
    expect(touched).toEqual([]);
    const [kept] = await harness.db
      .select({ sampleSize: schema.cyclePredictions.sampleSize })
      .from(schema.cyclePredictions)
      .where(eq(schema.cyclePredictions.id, PREDICTION));
    expect(kept).toEqual({ sampleSize: 3 });
  });
});

describe("a revoked grant", () => {
  test("reads zero rows from the moment revoked_at is set", async () => {
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date("2026-10-01T09:00:00Z") })
      .where(eq(schema.grants.id, SUMMARY_GRANT));
    expect(await helper(BEN, sql`can_read(${ANNA}::uuid, 'cycle.history')`)).toBe(false);
    expect(await countsFor(BEN, ["cycle_predictions", "cycle_entries"])).toEqual({
      cycle_predictions: 0,
      // The read grant on symptoms still reaches the day sheet rows.
      cycle_entries: 2,
    });
  });

  test("still shows both parties the revoked grant row", async () => {
    expect(await countsFor(BEN, ["grants"])).toEqual({ grants: 2 });
    expect(await countsFor(ANNA, ["grants"])).toEqual({ grants: 3 });
  });
});

describe("a grant for one child", () => {
  test("reaches that child and never the other", async () => {
    const seen = await withActor(
      CARA,
      async (tx) => ({
        children: (await tx.select({ id: schema.children.id }).from(schema.children)).map(
          (row) => row.id,
        ),
        events: (
          await tx.select({ childId: schema.childEvents.childId }).from(schema.childEvents)
        ).map((row) => row.childId),
        keys: await count(tx, "subject_keys"),
        guardians: await count(tx, "child_guardians"),
      }),
      harness.db,
    );
    expect(seen).toEqual({
      children: [CHILD],
      events: [CHILD],
      // The child's key, for decrypting its event notes; not Anna's key.
      keys: 1,
      // Guardianship is not hers to see.
      guardians: 0,
    });
    expect(await helper(CARA, sql`can_read(${OTHER_CHILD}::uuid, 'child')`)).toBe(false);
    expect(await helper(CARA, sql`can_use_key(${ANNA}::uuid)`)).toBe(false);
  });

  test("writes nothing for either child at the read level", async () => {
    for (const childId of [CHILD, OTHER_CHILD]) {
      const message = await refusal(
        withActor(
          CARA,
          (tx) =>
            tx
              .insert(schema.childEvents)
              .values({ id: id(104), childId, authorId: CARA, kind: "diaper", date: "2026-09-02" }),
          harness.db,
        ),
      );
      expect(message).toMatch(/row-level security policy for table "child_events"/);
    }
  });

  test("lets a contribute grantee write for that child only", async () => {
    await harness.db
      .update(schema.grants)
      .set({ level: "contribute" })
      .where(eq(schema.grants.id, CHILD_GRANT));
    const event = id(105);
    const [written] = await withActor(
      CARA,
      (tx) =>
        tx
          .insert(schema.childEvents)
          .values({ id: event, childId: CHILD, authorId: CARA, kind: "diaper", date: "2026-09-02" })
          .returning({ id: schema.childEvents.id }),
      harness.db,
    );
    expect(written).toEqual({ id: event });

    const other = await refusal(
      withActor(
        CARA,
        (tx) =>
          tx.insert(schema.childEvents).values({
            id: id(106),
            childId: OTHER_CHILD,
            authorId: CARA,
            kind: "diaper",
            date: "2026-09-02",
          }),
        harness.db,
      ),
    );
    expect(other).toMatch(/row-level security policy for table "child_events"/);

    // Removing a child's record stays with the guardians.
    const removed = await withActor(
      CARA,
      (tx) =>
        tx.delete(schema.childEvents).where(eq(schema.childEvents.id, event)).returning({
          id: schema.childEvents.id,
        }),
      harness.db,
    );
    expect(removed).toEqual([]);
    await harness.db.delete(schema.childEvents).where(eq(schema.childEvents.id, event));
    await harness.db
      .update(schema.grants)
      .set({ level: "read" })
      .where(eq(schema.grants.id, CHILD_GRANT));
  });
});

describe("the private journal", () => {
  test("is never visible to a grantee, whatever else she holds", async () => {
    const seen = await withActor(
      BEN,
      (tx) => tx.select({ category: schema.notes.category }).from(schema.notes),
      harness.db,
    );
    expect(seen).toEqual([{ category: "cycle.symptoms" }]);
    expect(await helper(BEN, sql`can_read(${ANNA}::uuid, 'journal.private')`)).toBe(false);
  });

  test("accepts no note from anyone but her, even at the contribute level", async () => {
    await harness.db
      .update(schema.grants)
      .set({ level: "contribute" })
      .where(eq(schema.grants.id, SYMPTOMS_GRANT));
    expect(await helper(BEN, sql`can_write(${ANNA}::uuid, 'journal.private')`)).toBe(false);
    const message = await refusal(
      withActor(
        BEN,
        (tx) =>
          tx.insert(schema.notes).values({
            id: id(107),
            subjectId: ANNA,
            authorId: BEN,
            category: "journal.private",
            date: "2026-09-05",
            body: CIPHERTEXT,
            kekVersion: "v1",
          }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "notes"/);

    // The same contributor may file a note under the shared category; she
    // owns it (subject_id) and he cannot remove it.
    const note = id(108);
    const [written] = await withActor(
      BEN,
      (tx) =>
        tx
          .insert(schema.notes)
          .values({
            id: note,
            subjectId: ANNA,
            authorId: BEN,
            category: "cycle.symptoms",
            date: "2026-09-05",
            body: CIPHERTEXT,
            kekVersion: "v1",
          })
          .returning({ id: schema.notes.id }),
      harness.db,
    );
    expect(written).toEqual({ id: note });
    const removed = await withActor(
      BEN,
      (tx) =>
        tx.delete(schema.notes).where(eq(schema.notes.id, note)).returning({ id: schema.notes.id }),
      harness.db,
    );
    expect(removed).toEqual([]);
    await harness.db.delete(schema.notes).where(eq(schema.notes.id, note));
    await harness.db
      .update(schema.grants)
      .set({ level: "read" })
      .where(eq(schema.grants.id, SYMPTOMS_GRANT));
  });
});

describe("a foreign subject", () => {
  test("gets zero rows everywhere but her own profile", async () => {
    expect(
      await countsFor(DANA, [
        "profiles",
        "subject_keys",
        "cycle_entries",
        "entry_symptoms",
        "cycle_predictions",
        "notes",
        "grants",
        "households",
        "household_members",
        "invitations",
        "children",
        "child_guardians",
        "child_events",
        "audit_events",
      ]),
    ).toEqual({
      profiles: 1,
      subject_keys: 0,
      cycle_entries: 0,
      entry_symptoms: 0,
      cycle_predictions: 0,
      notes: 0,
      grants: 0,
      households: 0,
      household_members: 0,
      invitations: 0,
      children: 0,
      child_guardians: 0,
      child_events: 0,
      audit_events: 0,
    });
  });

  test("is refused on insert, by the policy and not by a grant", async () => {
    const message = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx
            .insert(schema.cycleEntries)
            .values({ id: id(109), subjectId: ANNA, date: "2026-09-06", flow: "light" }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "cycle_entries"/);
    expect(message).not.toMatch(/permission denied/);
  });

  test("cannot name herself as a guardian or join a household uninvited", async () => {
    const guardian = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx.insert(schema.childGuardians).values({ id: id(110), childId: CHILD, userId: DANA }),
        harness.db,
      ),
    );
    expect(guardian).toMatch(/row-level security policy for table "child_guardians"/);

    const member = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx
            .insert(schema.householdMembers)
            .values({ id: id(111), householdId: HOUSEHOLD, userId: DANA, role: "partner" }),
        harness.db,
      ),
    );
    expect(member).toMatch(/row-level security policy for table "household_members"/);
  });
});

describe("households and guardianship", () => {
  test("show members to each other and children only to guardians", async () => {
    // Ben is a partner in the household and a guardian of nobody.
    expect(
      await countsFor(BEN, [
        "households",
        "household_members",
        "profiles",
        "children",
        "child_events",
        "child_guardians",
      ]),
    ).toEqual({
      households: 1,
      household_members: 3,
      // Himself, Anna and Eve; neither Cara nor Dana.
      profiles: 3,
      children: 0,
      child_events: 0,
      child_guardians: 0,
    });
    // Eve is a guardian of the first child and sees her co-guardian.
    const eve = await withActor(
      EVE,
      async (tx) => ({
        children: (await tx.select({ id: schema.children.id }).from(schema.children)).map(
          (row) => row.id,
        ),
        guardians: (
          await tx
            .select({ userId: schema.childGuardians.userId })
            .from(schema.childGuardians)
            .orderBy(schema.childGuardians.userId)
        ).map((row) => row.userId),
        events: await count(tx, "child_events"),
        keys: await count(tx, "subject_keys"),
      }),
      harness.db,
    );
    expect(eve).toEqual({ children: [CHILD], guardians: [ANNA, EVE], events: 1, keys: 1 });
  });

  test("let a new owner create a household, a child, its first guardian row and its key", async () => {
    const household = id(120);
    const child = id(121);
    const seen = await withActor(
      CARA,
      async (tx) => {
        await tx.insert(schema.households).values({ id: household });
        await tx
          .insert(schema.householdMembers)
          .values({ id: id(122), householdId: household, userId: CARA, role: "owner" });
        await tx.insert(schema.children).values({
          id: child,
          householdId: household,
          displayName: "Pip",
          dateOfBirth: "2026-08-01",
        });
        await tx
          .insert(schema.childGuardians)
          .values({ id: id(123), childId: child, userId: CARA });
        await tx.insert(schema.subjectKeys).values({
          subjectId: child,
          kind: "child",
          wrappedDek: WRAPPED_DEK,
          kekProvider: "env",
          kekVersion: "v1",
        });
        const [guardian] = rows(await tx.execute(sql`select is_guardian(${child}::uuid) as value`));
        return {
          households: await count(tx, "households"),
          children: (
            await tx
              .select({ id: schema.children.id })
              .from(schema.children)
              .orderBy(schema.children.id)
          ).map((row) => row.id),
          guardian: guardian?.value,
        };
      },
      harness.db,
    );
    expect(seen).toEqual({ households: 1, children: [CHILD, child], guardian: true });

    // A second owner row on a household that already has members is refused.
    const second = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx
            .insert(schema.householdMembers)
            .values({ id: id(124), householdId: household, userId: DANA, role: "owner" }),
        harness.db,
      ),
    );
    expect(second).toMatch(/row-level security policy for table "household_members"/);
  });

  test("let an invitee read her invitation by email and join in the invited role", async () => {
    const invitation = id(130);
    await harness.db.insert(schema.invitations).values({
      id: invitation,
      householdId: HOUSEHOLD,
      inviterId: ANNA,
      inviteeEmail: "Dana@example.test",
      role: "partner",
      tokenHash: "hash-of-a-token-never-stored",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(await countsFor(DANA, ["invitations"])).toEqual({ invitations: 1 });
    const wrongRole = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx
            .insert(schema.householdMembers)
            .values({ id: id(131), householdId: HOUSEHOLD, userId: DANA, role: "guardian" }),
        harness.db,
      ),
    );
    expect(wrongRole).toMatch(/row-level security policy for table "household_members"/);

    const accepted = await withActor(
      DANA,
      async (tx) => {
        await tx
          .insert(schema.householdMembers)
          .values({ id: id(132), householdId: HOUSEHOLD, userId: DANA, role: "partner" });
        const marked = await tx
          .update(schema.invitations)
          .set({ acceptedAt: new Date() })
          .where(eq(schema.invitations.id, invitation))
          .returning({ id: schema.invitations.id });
        return { marked, members: await count(tx, "household_members") };
      },
      harness.db,
    );
    expect(accepted).toEqual({ marked: [{ id: invitation }], members: 4 });

    await harness.db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, id(132)));
    await harness.db.delete(schema.invitations).where(eq(schema.invitations.id, invitation));
  });
});

describe("the transaction boundary", () => {
  test("resets the role and the settings once withActor returns", async () => {
    await withActor(DANA, async () => undefined, harness.db);
    const [after] = rows(
      await harness.db.execute(
        sql`select current_user as role, coalesce(current_setting('app.actor_id', true), '') as actor, current_actor() is null as no_actor, is_system() as system, in_policy_helper() as helper`,
      ),
    );
    expect(after).toEqual({
      role: ownerRole,
      actor: "",
      no_actor: true,
      system: false,
      helper: false,
    });
  });

  test("lets withSystem pass as the owner role", async () => {
    const seen = await withSystem(async (tx) => {
      const [flags] = rows(
        await tx.execute(sql`select current_user as role, is_system() as system`),
      );
      return { ...flags, entries: await count(tx, "cycle_entries") };
    }, harness.db);
    expect(seen).toEqual({ role: ownerRole, system: true, entries: 2 });
  });

  test("refuses system context to tidefern_app, whatever it sets", async () => {
    const seen = await withActor(
      DANA,
      async (tx) => {
        await tx.execute(sql`select set_config('app.system', 'on', true)`);
        await tx.execute(sql`select set_config('app.policy_helper', 'on', true)`);
        const [flags] = rows(
          await tx.execute(
            sql`select current_user as role, current_setting('app.system', true) as setting, is_system() as system, in_policy_helper() as helper`,
          ),
        );
        return {
          ...flags,
          entries: await count(tx, "cycle_entries"),
          grants: await count(tx, "grants"),
          guardians: await count(tx, "child_guardians"),
        };
      },
      harness.db,
    );
    expect(seen).toEqual({
      role: "tidefern_app",
      setting: "on",
      system: false,
      helper: false,
      entries: 0,
      grants: 0,
      guardians: 0,
    });
    const insert = await refusal(
      withActor(
        DANA,
        async (tx) => {
          await tx.execute(sql`select set_config('app.system', 'on', true)`);
          await tx
            .insert(schema.cycleEntries)
            .values({ id: id(140), subjectId: ANNA, date: "2026-09-07", flow: "light" });
        },
        harness.db,
      ),
    );
    expect(insert).toMatch(/row-level security policy for table "cycle_entries"/);
  });
});

/**
 * On Neon the helpers are owned by the console role, which is bound by
 * FORCE ROW LEVEL SECURITY because it does not inherit BYPASSRLS. PGlite's
 * owner is a superuser, so the block above never exercised that path. Here
 * the helpers are re-owned to a role that cannot bypass RLS and the
 * scenarios run again: the policies on the tables the helpers read must
 * let the helper through by its marker, or every read would come back
 * empty or recurse.
 */
describe("with helpers owned by a role that cannot bypass RLS", () => {
  beforeAll(async () => {
    await harness.db.execute(sql`create role tidefern_bound nologin nobypassrls noinherit`);
    await harness.db.execute(sql`grant usage on schema public to tidefern_bound`);
    await harness.db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to tidefern_bound`,
    );
    for (const signature of DEFINER_HELPERS) {
      await harness.db.execute(sql`alter function ${sql.raw(signature)} owner to tidefern_bound`);
    }
  });

  test("runs the helpers as the bound role", async () => {
    const [owner] = rows(
      await harness.db.execute(
        sql`select r.rolname as owner, r.rolbypassrls from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner where p.proname = 'can_read'`,
      ),
    );
    expect(owner).toEqual({ owner: "tidefern_bound", rolbypassrls: false });
  });

  test("still answers the owner, the grantees, the guardians and the stranger the same way", async () => {
    expect(
      await countsFor(ANNA, [
        "cycle_entries",
        "notes",
        "children",
        "child_guardians",
        "subject_keys",
        "profiles",
      ]),
    ).toEqual({
      cycle_entries: 2,
      notes: 2,
      children: 2,
      child_guardians: 3,
      subject_keys: 2,
      profiles: 4,
    });
    expect(
      await countsFor(BEN, [
        "cycle_predictions",
        "cycle_entries",
        "notes",
        "children",
        "household_members",
      ]),
    ).toEqual({
      cycle_predictions: 0,
      cycle_entries: 2,
      notes: 1,
      children: 0,
      household_members: 3,
    });
    expect(await countsFor(CARA, ["children", "child_events", "subject_keys"])).toEqual({
      // The first child by grant and her own child as its guardian.
      children: 2,
      child_events: 1,
      subject_keys: 2,
    });
    expect(await countsFor(EVE, ["children", "child_guardians", "child_events"])).toEqual({
      children: 1,
      child_guardians: 2,
      child_events: 1,
    });
    expect(
      await countsFor(DANA, ["cycle_entries", "notes", "children", "grants", "household_members"]),
    ).toEqual({
      cycle_entries: 0,
      notes: 0,
      children: 0,
      grants: 0,
      household_members: 0,
    });
  });

  test("still refuses a foreign insert and a journal note from a grantee", async () => {
    const foreign = await refusal(
      withActor(
        DANA,
        (tx) =>
          tx
            .insert(schema.cycleEntries)
            .values({ id: id(150), subjectId: ANNA, date: "2026-09-08", flow: "light" }),
        harness.db,
      ),
    );
    expect(foreign).toMatch(/row-level security policy for table "cycle_entries"/);
    const journal = await refusal(
      withActor(
        BEN,
        (tx) =>
          tx.insert(schema.notes).values({
            id: id(151),
            subjectId: ANNA,
            authorId: BEN,
            category: "journal.private",
            date: "2026-09-08",
            body: CIPHERTEXT,
            kekVersion: "v1",
          }),
        harness.db,
      ),
    );
    expect(journal).toMatch(/row-level security policy for table "notes"/);
  });
});
