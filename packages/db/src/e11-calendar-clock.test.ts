import { sql } from "drizzle-orm";
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
 * Task E11, migration 0011: `cycle_status_for()` decides which day it is
 * from the transaction-local `app.calendar_now` when the API froze its
 * calendar clock (`TIDEFERN_FAKE_NOW`, never on production), and from
 * `now()` when the setting is unset or empty. Everything runs through
 * withActor(), which drops to tidefern_app, exactly as the API calls it.
 *
 * The cast: Anna tracks her cycle in Europe/Berlin (the zone insertProfile
 * gives everyone) and Ben holds her status card. Cara has no relationship
 * with her. Anna's periods started on 2026-02-14 and on 2026-03-14, 28 days
 * apart, and she bled on 2026-03-15 too, so on 2026-03-15 she is on day 2
 * of her cycle and of her period, and her fertile window is expected from
 * 2026-03-23 to 2026-03-28. The instants below sit on purpose on either
 * side of Berlin's midnight, where the UTC date and hers differ.
 */
let harness: Harness;

const STATUS = sql.raw(
  "to_char(s.today, 'YYYY-MM-DD') as today, s.cycle_day, s.period_day, s.in_fertile_window",
);

/** 23:30 UTC on 14 March is 00:30 on 15 March in Berlin (UTC+1 until 29 March). */
const FIRST_MINUTES_OF_15_MARCH = "2026-03-14T23:30:00.000Z";
/** One second before Berlin's midnight at the end of 15 March. */
const LAST_SECOND_OF_15_MARCH = "2026-03-15T22:59:59.000Z";
/** Berlin's midnight at the start of 16 March: the next day, no bleeding logged. */
const START_OF_16_MARCH = "2026-03-15T23:00:00.000Z";
/** Midday on 25 March in Berlin, inside the expected fertile window. */
const MIDDAY_25_MARCH = "2026-03-25T12:00:00.000Z";

async function setCalendar(tx: Transaction, value: string): Promise<void> {
  await tx.execute(sql`select set_config('app.calendar_now', ${value}, true)`);
}

/**
 * The status `actor` reads for `subject` in one transaction, with
 * `app.calendar_now` set first when `calendar` is given, the way the API
 * sets it when its clock is frozen.
 */
async function statusAs(actor: string, subject: string, calendar?: string): Promise<Row[]> {
  return withActor(
    actor,
    async (tx) => {
      if (calendar !== undefined) await setCalendar(tx, calendar);
      return rows(
        await tx.execute(sql`select ${STATUS} from cycle_status_for(${subject}::uuid) s`),
      );
    },
    harness.db,
  );
}

/** Today in Berlin by the database's own clock, which is what the fallback reads. */
async function realToday(): Promise<string> {
  const [row] = rows(
    await harness.db.execute(
      sql`select to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD') as today`,
    ),
  );
  return row?.today as string;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

beforeAll(async () => {
  harness = await createTestDatabase();
  for (const [userId, email] of [
    [ANNA, "anna@example.test"],
    [BEN, "ben@example.test"],
    [CARA, "cara@example.test"],
  ] as const) {
    await insertUser(harness, userId, email);
    await insertProfile(harness, userId);
  }
  await harness.db.insert(schema.grants).values({
    id: id(1),
    ownerId: ANNA,
    granteeId: BEN,
    category: "cycle.status",
    level: "summary",
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
  });
  await harness.db.insert(schema.cycleEntries).values([
    { id: id(10), subjectId: ANNA, date: "2026-02-14", flow: "heavy" },
    { id: id(11), subjectId: ANNA, date: "2026-02-16", flow: "light" },
    { id: id(12), subjectId: ANNA, date: "2026-03-14", flow: "heavy" },
    { id: id(13), subjectId: ANNA, date: "2026-03-15", flow: "medium" },
  ]);
});

afterAll(async () => {
  await harness.close();
});

describe("migration 0011", () => {
  test("applies from empty in journal order", async () => {
    await expectJournalApplied(harness, "0011_cycle_status_calendar_clock");
  });

  test("keeps 0010's function: one argument, the same columns, a STABLE definer with the pinned search_path and the marker", async () => {
    const functions = rows(
      await harness.db.execute(
        sql`select p.oid::regprocedure::text as signature, pg_catalog.pg_get_function_result(p.oid) as result, p.prosecdef as definer, p.provolatile as volatility, p.proconfig as config from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'cycle_status_for'`,
      ),
    );
    expect(functions).toEqual([
      {
        signature: "cycle_status_for(uuid)",
        result:
          "TABLE(today date, cycle_day integer, period_day integer, in_fertile_window boolean)",
        definer: true,
        volatility: "s",
        config: ["search_path=pg_catalog, public", "app.policy_helper=on"],
      },
    ]);
  });

  test("lets the app role call it and nobody else by default", async () => {
    await harness.db.execute(sql`create role tidefern_e11_probe nologin`);
    const privileges = rows(
      await harness.db.execute(
        sql`select has_function_privilege('tidefern_app', 'cycle_status_for(uuid)', 'execute') as app, has_function_privilege('tidefern_e11_probe', 'cycle_status_for(uuid)', 'execute') as anyone`,
      ),
    );
    expect(privileges).toEqual([{ app: true, anyone: false }]);
  });
});

describe("cycle_status_for under a frozen calendar", () => {
  test("reads the day app.calendar_now falls on in the subject's zone, not the UTC date", async () => {
    expect(await statusAs(ANNA, ANNA, FIRST_MINUTES_OF_15_MARCH)).toEqual([
      { today: "2026-03-15", cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    expect(await statusAs(ANNA, ANNA, LAST_SECOND_OF_15_MARCH)).toEqual([
      { today: "2026-03-15", cycle_day: 2, period_day: 2, in_fertile_window: false },
    ]);
    expect(await statusAs(ANNA, ANNA, START_OF_16_MARCH)).toEqual([
      { today: "2026-03-16", cycle_day: 3, period_day: null, in_fertile_window: false },
    ]);
  });

  test("decides the fertile window for the frozen day too", async () => {
    expect(await statusAs(ANNA, ANNA, MIDDAY_25_MARCH)).toEqual([
      { today: "2026-03-25", cycle_day: 12, period_day: null, in_fertile_window: true },
    ]);
  });

  test("gives a status grantee the same frozen day as the subject", async () => {
    expect(await statusAs(BEN, ANNA, FIRST_MINUTES_OF_15_MARCH)).toEqual(
      await statusAs(ANNA, ANNA, FIRST_MINUTES_OF_15_MARCH),
    );
    expect(await statusAs(BEN, ANNA, MIDDAY_25_MARCH)).toEqual(
      await statusAs(ANNA, ANNA, MIDDAY_25_MARCH),
    );
  });

  test("still re-checks the grant: a frozen calendar gives a stranger nothing", async () => {
    expect(await statusAs(CARA, ANNA, FIRST_MINUTES_OF_15_MARCH)).toEqual([]);
  });

  test("refuses a setting that names no instant instead of reading now()", async () => {
    const message = await refusal(statusAs(ANNA, ANNA, "the day after tomorrow"));
    expect(message).toMatch(/invalid input syntax for type timestamp with time zone/);
  });
});

describe("cycle_status_for on the real clock", () => {
  test("reads now() when the transaction carries no setting", async () => {
    const today = await realToday();
    expect(await statusAs(ANNA, ANNA)).toEqual([
      {
        today,
        cycle_day: daysBetween("2026-03-14", today) + 1,
        period_day: null,
        in_fertile_window: false,
      },
    ]);
  });

  test("reads now() when the setting is empty", async () => {
    expect(await statusAs(ANNA, ANNA, "")).toEqual(await statusAs(ANNA, ANNA));
  });

  test("never carries a frozen day into the next transaction on the same connection", async () => {
    // PGlite is one connection, as a pooled server connection is between
    // two requests: the setting was local to the transaction that set it.
    const frozen = await statusAs(BEN, ANNA, FIRST_MINUTES_OF_15_MARCH);
    expect(frozen[0]?.today).toBe("2026-03-15");
    const left = await withActor(
      BEN,
      async (tx) =>
        rows(await tx.execute(sql`select current_setting('app.calendar_now', true) as value`)),
      harness.db,
    );
    expect(left[0]?.value ?? "").toBe("");
    expect((await statusAs(BEN, ANNA))[0]?.today).toBe(await realToday());
  });
});
