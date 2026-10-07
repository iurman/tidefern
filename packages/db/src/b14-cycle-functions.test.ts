import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withActor } from "./actor";
import type { Transaction } from "./actor";
import * as schema from "./schema/index";
import {
  ANNA,
  BEN,
  CARA,
  expectJournalApplied,
  id,
  insertProfile,
  insertUser,
  refusal,
  rows,
} from "./schema/testing";
import type { Harness, Row } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * Task B14, migration 0010: `cycle_status_for()` and
 * `refresh_cycle_prediction()`, the two SECURITY DEFINER functions that
 * derive from rows the caller may not read, and the two internal
 * derivations behind them. Everything runs through withActor(), which drops
 * to tidefern_app, and the last block re-owns the definers to a role that
 * cannot bypass RLS, the shape of a Neon owner under FORCE.
 *
 * The cast: Anna tracks her cycle in Europe/Berlin. Ben holds her status
 * card, Cara contributes to her history, Finn reads her history but holds no
 * status card, Eve's status card is revoked, and Dana has no relationship
 * with her. Gina tracks her own cycle and is in her fertile window today.
 */
let harness: Harness;
let today: string;

// Synthetic ids only; nothing here is a real person.
const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
const EVE = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f50";
const FINN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f60";
const GINA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f70";

const BEN_STATUS = id(1);
const ANNA_PREGNANCY = id(90);

const STATUS_COLUMNS = ["cycle_day", "in_fertile_window", "period_day", "today"];

function day(offset: number): string {
  const [year, month, date] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

async function statusAs(actor: string, subject: string): Promise<Row[]> {
  return withActor(
    actor,
    async (tx) =>
      rows(
        await tx.execute(
          sql`select to_char(s.today, 'YYYY-MM-DD') as today, s.cycle_day, s.period_day, s.in_fertile_window from cycle_status_for(${subject}::uuid) s`,
        ),
      ),
    harness.db,
  );
}

async function rawStatusAs(actor: string, subject: string): Promise<Row[]> {
  return withActor(
    actor,
    async (tx) => rows(await tx.execute(sql`select * from cycle_status_for(${subject}::uuid)`)),
    harness.db,
  );
}

async function refreshAs(actor: string, subject: string): Promise<unknown> {
  return withActor(
    actor,
    async (tx) => {
      const [row] = rows(
        await tx.execute(sql`select refresh_cycle_prediction(${subject}::uuid) as ok`),
      );
      return row?.ok;
    },
    harness.db,
  );
}

async function livePrediction(subject: string) {
  const [row] = await harness.db
    .select()
    .from(schema.cyclePredictions)
    .where(
      and(
        eq(schema.cyclePredictions.subjectId, subject),
        isNull(schema.cyclePredictions.deletedAt),
      ),
    );
  return row ?? null;
}

async function reachable(tx: Transaction, subject: string) {
  return {
    entries: (
      await tx
        .select({ id: schema.cycleEntries.id })
        .from(schema.cycleEntries)
        .where(eq(schema.cycleEntries.subjectId, subject))
    ).length,
    pregnancies: (
      await tx
        .select({ id: schema.pregnancies.id })
        .from(schema.pregnancies)
        .where(eq(schema.pregnancies.subjectId, subject))
    ).length,
  };
}

beforeAll(async () => {
  harness = await createTestDatabase();
  const [now] = rows(
    await harness.db.execute(
      sql`select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as today`,
    ),
  );
  today = now?.today as string;

  for (const [userId, email] of [
    [ANNA, "anna@example.test"],
    [BEN, "ben@example.test"],
    [CARA, "cara@example.test"],
    [DANA, "dana@example.test"],
    [EVE, "eve@example.test"],
    [FINN, "finn@example.test"],
    [GINA, "gina@example.test"],
  ] as const) {
    await insertUser(harness, userId, email);
    await insertProfile(harness, userId);
  }
  const versions = { policyVersion: "2026-10", descriptionVersion: "2026-10" };
  await harness.db.insert(schema.grants).values([
    {
      id: BEN_STATUS,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.status",
      level: "summary",
      ...versions,
    },
    {
      id: id(2),
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.history",
      level: "contribute",
      ...versions,
    },
    {
      id: id(3),
      ownerId: ANNA,
      granteeId: FINN,
      category: "cycle.history",
      level: "read",
      ...versions,
    },
    {
      id: id(4),
      ownerId: ANNA,
      granteeId: EVE,
      category: "cycle.status",
      level: "read",
      revokedAt: new Date("2026-09-01T00:00:00.000Z"),
      ...versions,
    },
  ]);
  // Anna: periods 28 days apart, bleeding yesterday and today, spotting a
  // week ago, so she is on day 2 of her cycle and of her period.
  await harness.db.insert(schema.cycleEntries).values([
    { id: id(10), subjectId: ANNA, date: day(-29), flow: "heavy", mood: "low" },
    { id: id(11), subjectId: ANNA, date: day(-27), flow: "light" },
    { id: id(12), subjectId: ANNA, date: day(-8), flow: "spotting" },
    { id: id(13), subjectId: ANNA, date: day(-1), flow: "heavy" },
    { id: id(14), subjectId: ANNA, date: day(0), flow: "medium" },
    // Gina: starts 38 and 10 days ago, so ovulation is expected in four
    // days and today falls inside the six day window before it.
    { id: id(20), subjectId: GINA, date: day(-38), flow: "medium" },
    { id: id(21), subjectId: GINA, date: day(-10), flow: "heavy" },
  ]);
  await harness.db
    .insert(schema.entrySymptoms)
    .values({ id: id(15), entryId: id(10), subjectId: ANNA, code: "cramps" });
});

afterAll(async () => {
  await harness.close();
});

describe("migration 0010", () => {
  test("applies from empty in journal order", async () => {
    await expectJournalApplied(harness, "0010_cycle_status_functions");
  });

  test("declares the two entry points SECURITY DEFINER with the B8 conventions and one argument", async () => {
    const functions = rows(
      await harness.db.execute(
        sql`select p.oid::regprocedure::text as signature, p.prosecdef as definer, p.provolatile as volatility, p.proconfig as config from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('cycle_status_for', 'refresh_cycle_prediction', 'cycle_prediction_facts', 'cycle_period_starts') order by signature`,
      ),
    );
    // Task E10's migration (0011) moved pg_temp to the end of every
    // function's search_path, so a temporary table can never stand in for
    // a real one; 0010 wrote pg_catalog, public. The rest is as B14 made it.
    const path = "search_path=pg_catalog, public, pg_temp";
    const marker = [path, "app.policy_helper=on"];
    expect(functions).toEqual([
      {
        signature: "cycle_period_starts(uuid)",
        definer: false,
        volatility: "s",
        config: [path],
      },
      {
        signature: "cycle_prediction_facts(uuid)",
        definer: false,
        volatility: "s",
        config: [path],
      },
      { signature: "cycle_status_for(uuid)", definer: true, volatility: "s", config: marker },
      {
        signature: "refresh_cycle_prediction(uuid)",
        definer: true,
        volatility: "v",
        config: marker,
      },
    ]);
  });

  test("lets the app role call the two entry points and nothing else, and nobody by default", async () => {
    await harness.db.execute(sql`create role tidefern_probe nologin`);
    const privileges = rows(
      await harness.db.execute(
        sql`select f as signature, has_function_privilege('tidefern_app', f, 'execute') as app, has_function_privilege('tidefern_probe', f, 'execute') as anyone from unnest(array['cycle_period_starts(uuid)', 'cycle_prediction_facts(uuid)', 'cycle_status_for(uuid)', 'refresh_cycle_prediction(uuid)']) as f`,
      ),
    );
    expect(privileges).toEqual([
      { signature: "cycle_period_starts(uuid)", app: false, anyone: false },
      { signature: "cycle_prediction_facts(uuid)", app: false, anyone: false },
      { signature: "cycle_status_for(uuid)", app: true, anyone: false },
      { signature: "refresh_cycle_prediction(uuid)", app: true, anyone: false },
    ]);
  });

  test("lets the marker through the cycle_entries and pregnancies select policies only", async () => {
    const policies = rows(
      await harness.db.execute(
        sql`select tablename || '.' || policyname as policy from pg_catalog.pg_policies where qual like '%in_policy_helper()%' or with_check like '%in_policy_helper()%' order by policy`,
      ),
    );
    // The whole set of marker policies. Task E10 (migration 0011) adds the
    // marker to audit_events_insert and grants_update, bound to the current
    // actor's own rows, for revoke_closure_grants(); B14 added the two
    // select policies this test is named for.
    expect(policies.map((row) => row.policy)).toEqual([
      "audit_events.audit_events_insert",
      "child_guardians.child_guardians_select",
      "children.children_select",
      "cycle_entries.cycle_entries_select",
      "grants.grants_select",
      "grants.grants_update",
      "household_members.household_members_select",
      "invitations.invitations_select",
      "invitations.invitations_update",
      "pregnancies.pregnancies_select",
    ]);
  });
});

describe("cycle_status_for", () => {
  test("gives the subject today's derived values in her zone and nothing else", async () => {
    const raw = await rawStatusAs(ANNA, ANNA);
    expect(raw).toHaveLength(1);
    expect(Object.keys(raw[0] ?? {}).sort()).toEqual(STATUS_COLUMNS);
    expect(await statusAs(ANNA, ANNA)).toEqual([
      { today, cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    expect(await statusAs(GINA, GINA)).toEqual([
      { today, cycle_day: 11, period_day: null, in_fertile_window: true },
    ]);
  });

  test("gives a cycle.status grantee exactly the subject's derived values while she reaches no row", async () => {
    const raw = await rawStatusAs(BEN, ANNA);
    expect(Object.keys(raw[0] ?? {}).sort()).toEqual(STATUS_COLUMNS);
    expect(await statusAs(BEN, ANNA)).toEqual(await statusAs(ANNA, ANNA));
    const seen = await withActor(
      BEN,
      async (tx) => ({
        ...(await reachable(tx, ANNA)),
        symptoms: (await tx.select().from(schema.entrySymptoms)).length,
        predictions: (await tx.select().from(schema.cyclePredictions)).length,
      }),
      harness.db,
    );
    expect(seen).toEqual({ entries: 0, pregnancies: 0, symptoms: 0, predictions: 0 });
  });

  test("gives nothing to a revoked grant, a history reader without a status card, or a stranger", async () => {
    expect(await statusAs(EVE, ANNA)).toEqual([]);
    expect(await statusAs(FINN, ANNA)).toEqual([]);
    expect(await statusAs(DANA, ANNA)).toEqual([]);
    expect(await statusAs(BEN, GINA)).toEqual([]);
  });

  test("re-checks the grant itself, so a grant revoked a moment ago gives nothing", async () => {
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, BEN_STATUS));
    expect(await statusAs(BEN, ANNA)).toEqual([]);
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: null })
      .where(eq(schema.grants.id, BEN_STATUS));
    expect(await statusAs(BEN, ANNA)).toHaveLength(1);
  });

  test("cannot be used to read entries: the derivations are closed to the app role and the marker is not hers to set", async () => {
    for (const call of [
      sql`select * from cycle_period_starts(${ANNA}::uuid)`,
      sql`select * from cycle_prediction_facts(${ANNA}::uuid)`,
    ]) {
      const message = await refusal(withActor(BEN, (tx) => tx.execute(call), harness.db));
      expect(message).toMatch(/permission denied for function/);
    }
    const marked = await withActor(
      BEN,
      async (tx) => {
        await tx.execute(sql`select set_config('app.policy_helper', 'on', true)`);
        return reachable(tx, ANNA);
      },
      harness.db,
    );
    expect(marked).toEqual({ entries: 0, pregnancies: 0 });
    // It takes the subject and nothing else: no day to ask about, so a
    // grantee cannot walk it back through her history.
    const message = await refusal(
      withActor(
        BEN,
        (tx) => tx.execute(sql`select * from cycle_status_for(${ANNA}::uuid, ${day(-20)}::date)`),
        harness.db,
      ),
    );
    expect(message).toMatch(/function cycle_status_for\(uuid, date\) does not exist/);
  });
});

describe("refresh_cycle_prediction", () => {
  test("stores the prediction for a history contributor and answers only that she was allowed", async () => {
    expect(await livePrediction(ANNA)).toBeNull();
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    const stored = await livePrediction(ANNA);
    expect(stored).toMatchObject({
      basis: "estimate",
      cycleLength: 28,
      sampleSize: 1,
      nextPeriodStart: day(27),
      ovulation: day(13),
      fertileWindowStart: day(8),
      fertileWindowEnd: day(13),
      uncertaintyDays: 4,
      ovulationBandDays: 2,
      version: 1,
    });
    // Nothing changed, so nothing is written.
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    expect(await livePrediction(ANNA)).toEqual(stored);
  });

  test("writes nothing for a status grantee, a reader or a stranger", async () => {
    const before = await livePrediction(ANNA);
    expect(await refreshAs(BEN, ANNA)).toBe(false);
    expect(await refreshAs(FINN, ANNA)).toBe(false);
    expect(await refreshAs(DANA, ANNA)).toBe(false);
    expect(await refreshAs(DANA, GINA)).toBe(false);
    expect(await livePrediction(ANNA)).toEqual(before);
    expect(await livePrediction(GINA)).toBeNull();
  });

  test("honours a pregnancy the contributor cannot see, and the status follows it", async () => {
    await harness.db.insert(schema.pregnancies).values({
      id: ANNA_PREGNANCY,
      subjectId: ANNA,
      dueDate: day(250),
      datingMethod: "lmp",
    });
    const seen = await withActor(CARA, (tx) => reachable(tx, ANNA), harness.db);
    expect(seen).toEqual({ entries: 5, pregnancies: 0 });
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    expect(await livePrediction(ANNA)).toBeNull();
    const [tombstone] = await harness.db
      .select()
      .from(schema.cyclePredictions)
      .where(eq(schema.cyclePredictions.subjectId, ANNA));
    expect(tombstone).toMatchObject({ version: 2 });
    expect(tombstone?.deletedAt).toBeInstanceOf(Date);
    // While it continues, a status grantee gets no day count that would
    // tell her about it (pregnancy.overview is a separate card); Anna's own
    // status still counts through it.
    expect(await statusAs(BEN, ANNA)).toEqual([
      { today, cycle_day: null, period_day: null, in_fertile_window: false },
    ]);
    expect(await statusAs(ANNA, ANNA)).toEqual([
      { today, cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    await harness.db.delete(schema.pregnancies).where(eq(schema.pregnancies.id, ANNA_PREGNANCY));
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    expect(await livePrediction(ANNA)).toMatchObject({ basis: "estimate", version: 1 });
    expect(await statusAs(BEN, ANNA)).toEqual(await statusAs(ANNA, ANNA));
  });

  test("counts a status grantee's day only from the periods after a pregnancy ends", async () => {
    // Ended on the first day of the bleeding: that bleeding is not a period
    // after the end, so no start counts and the grantee sees no day.
    await harness.db.insert(schema.pregnancies).values({
      id: id(91),
      subjectId: ANNA,
      dueDate: day(-1),
      datingMethod: "lmp",
      endedAt: day(-1),
      endedReason: "birth",
    });
    expect(await statusAs(BEN, ANNA)).toEqual([
      { today, cycle_day: null, period_day: null, in_fertile_window: false },
    ]);
    expect(await statusAs(ANNA, ANNA)).toEqual([
      { today, cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    // Ended before the latest start: that start counts, and the earlier one
    // never does.
    await harness.db
      .update(schema.pregnancies)
      .set({ endedAt: day(-20) })
      .where(eq(schema.pregnancies.id, id(91)));
    expect(await statusAs(BEN, ANNA)).toEqual([
      { today, cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    await harness.db.delete(schema.pregnancies).where(eq(schema.pregnancies.id, id(91)));
  });
});

/**
 * On Neon the functions are owned by the console role, which FORCE binds
 * to the policies. Re-owned here to such a role, the definers must still
 * read the entries and the pregnancies through the marker, and still write
 * the prediction under the contributor's own grant.
 */
describe("with the functions owned by a role that cannot bypass RLS", () => {
  beforeAll(async () => {
    await harness.db.execute(sql`create role tidefern_b14_bound nologin nobypassrls noinherit`);
    await harness.db.execute(sql`grant usage on schema public to tidefern_b14_bound`);
    await harness.db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to tidefern_b14_bound`,
    );
    await harness.db.execute(
      sql`grant execute on function cycle_period_starts(uuid), cycle_prediction_facts(uuid) to tidefern_b14_bound`,
    );
    for (const signature of ["cycle_status_for(uuid)", "refresh_cycle_prediction(uuid)"]) {
      await harness.db.execute(
        sql`alter function ${sql.raw(signature)} owner to tidefern_b14_bound`,
      );
    }
    await harness.db.insert(schema.pregnancies).values({
      id: ANNA_PREGNANCY,
      subjectId: ANNA,
      dueDate: day(250),
      datingMethod: "lmp",
    });
  });

  test("runs them as the bound role", async () => {
    const owners = rows(
      await harness.db.execute(
        sql`select p.proname as name, r.rolname as owner, r.rolbypassrls as bypass from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner where p.proname in ('cycle_status_for', 'refresh_cycle_prediction') order by name`,
      ),
    );
    expect(owners).toEqual([
      { name: "cycle_status_for", owner: "tidefern_b14_bound", bypass: false },
      { name: "refresh_cycle_prediction", owner: "tidefern_b14_bound", bypass: false },
    ]);
  });

  test("still gives the status grantee the status, bounded by the pregnancy, and nobody else anything", async () => {
    expect(await statusAs(BEN, ANNA)).toEqual([
      { today, cycle_day: null, period_day: null, in_fertile_window: false },
    ]);
    expect(await statusAs(ANNA, ANNA)).toEqual([
      { today, cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    expect(await statusAs(GINA, GINA)).toEqual([
      { today, cycle_day: 11, period_day: null, in_fertile_window: true },
    ]);
    expect(await statusAs(DANA, ANNA)).toEqual([]);
    expect(await statusAs(FINN, ANNA)).toEqual([]);
  });

  test("still refreshes through the pregnancy the contributor cannot see", async () => {
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    expect(await livePrediction(ANNA)).toBeNull();
    await harness.db.delete(schema.pregnancies).where(eq(schema.pregnancies.id, ANNA_PREGNANCY));
    expect(await refreshAs(CARA, ANNA)).toBe(true);
    expect(await livePrediction(ANNA)).toMatchObject({
      basis: "estimate",
      nextPeriodStart: day(27),
    });
    expect(await refreshAs(DANA, ANNA)).toBe(false);
  });
});
