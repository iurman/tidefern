import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./schema/index";
import {
  ANNA,
  BEN,
  CHILD,
  HOUSEHOLD,
  expectJournalApplied,
  id,
  insertUser,
  refusal,
  rows,
} from "./schema/testing";
import type { Harness } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * Task B13, migration 0009: a feed's side on `child_events` (a closed,
 * nullable enum that only a feed may carry) and the partial unique index
 * that allows one open closure per person on `data_requests`.
 */
let harness: Harness;

const DEADLINE = new Date("2026-11-20T00:00:00.000Z");
const UNDO_UNTIL = new Date("2026-10-13T00:00:00.000Z");

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
  await harness.db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2026-02-14" });
});

afterAll(async () => {
  await harness.close();
});

describe("migration 0009", () => {
  test("applies from empty in journal order", async () => {
    await expectJournalApplied(harness, "0009_child_event_side_and_open_closure");
  });

  test("adds a nullable side column over the closed left, right and both", async () => {
    const values = rows(
      await harness.db.execute(
        sql`select e.enumlabel as value from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid = e.enumtypid where t.typname = 'child_event_side' order by e.enumsortorder`,
      ),
    );
    expect(values.map((row) => row.value)).toEqual(["left", "right", "both"]);
    expect(schema.childEventSideValues).toEqual(["left", "right", "both"]);
    const [column] = rows(
      await harness.db.execute(
        sql`select udt_name, is_nullable from information_schema.columns where table_name = 'child_events' and column_name = 'side'`,
      ),
    );
    expect(column).toEqual({ udt_name: "child_event_side", is_nullable: "YES" });
  });
});

describe("a feed's side", () => {
  test("is stored on a feed, and a feed may go without one", async () => {
    await harness.db.insert(schema.childEvents).values([
      { id: id(1), childId: CHILD, authorId: ANNA, kind: "feed", date: "2026-10-01", side: "left" },
      { id: id(2), childId: CHILD, authorId: ANNA, kind: "feed", date: "2026-10-01", side: "both" },
      { id: id(3), childId: CHILD, authorId: ANNA, kind: "feed", date: "2026-10-01" },
    ]);
    const stored = await harness.db
      .select({ id: schema.childEvents.id, side: schema.childEvents.side })
      .from(schema.childEvents)
      .orderBy(schema.childEvents.id);
    expect(stored).toEqual([
      { id: id(1), side: "left" },
      { id: id(2), side: "both" },
      { id: id(3), side: null },
    ]);
  });

  test("is refused on a sleep, a diaper and a milestone", async () => {
    for (const [n, kind, extra] of [
      [4, "sleep", { startedAt: new Date("2026-10-01T20:00:00.000Z") }],
      [5, "diaper", {}],
      [6, "milestone", { milestoneId: "2m-social-1" }],
    ] as const) {
      const message = await refusal(
        harness.db.insert(schema.childEvents).values({
          id: id(n),
          childId: CHILD,
          authorId: ANNA,
          kind,
          date: "2026-10-01",
          side: "right",
          ...extra,
        }),
      );
      expect(message).toMatch(/child_events_side_is_for_feed/);
    }
  });

  test("is refused when a feed with a side becomes another kind, and outside the enum", async () => {
    const changed = await refusal(
      harness.db
        .update(schema.childEvents)
        .set({ kind: "diaper" })
        .where(eq(schema.childEvents.id, id(1))),
    );
    expect(changed).toMatch(/child_events_side_is_for_feed/);
    const unknown = await refusal(
      harness.db.execute(
        sql`insert into child_events (id, child_id, kind, date, side) values (${id(7)}, ${CHILD}, 'feed', '2026-10-01', 'middle')`,
      ),
    );
    expect(unknown).toMatch(/invalid input value for enum child_event_side/);
  });
});

describe("one open closure per person", () => {
  test("is a partial unique index on the user over the two open states", async () => {
    const [index] = rows(
      await harness.db.execute(
        sql`select indexdef from pg_catalog.pg_indexes where indexname = 'data_requests_open_closure_unique'`,
      ),
    );
    expect(index?.indexdef).toMatch(
      /CREATE UNIQUE INDEX .* ON public\.data_requests .*\(user_id\)/,
    );
    expect(index?.indexdef).toMatch(/kind = 'closure'/);
    expect(index?.indexdef).toMatch(/'requested'.*'in_progress'/);
  });

  test("refuses a second open closure, whether requested or in progress", async () => {
    await harness.db.insert(schema.dataRequests).values({
      id: id(20),
      userId: ANNA,
      kind: "closure",
      deadlineAt: DEADLINE,
      undoUntil: UNDO_UNTIL,
    });
    for (const [n, state] of [
      [21, "requested"],
      [22, "in_progress"],
    ] as const) {
      const message = await refusal(
        harness.db.insert(schema.dataRequests).values({
          id: id(n),
          userId: ANNA,
          kind: "closure",
          state,
          deadlineAt: DEADLINE,
        }),
      );
      expect(message).toMatch(/data_requests_open_closure_unique/);
    }
  });

  test("leaves room for closed closures, other kinds, other people and a closure after an undo", async () => {
    await harness.db.insert(schema.dataRequests).values([
      {
        id: id(23),
        userId: ANNA,
        kind: "closure",
        state: "cancelled",
        completedAt: new Date(),
        deadlineAt: DEADLINE,
      },
      {
        id: id(24),
        userId: ANNA,
        kind: "closure",
        state: "completed",
        completedAt: new Date(),
        deadlineAt: DEADLINE,
      },
      { id: id(25), userId: ANNA, kind: "export", deadlineAt: DEADLINE },
      { id: id(26), userId: ANNA, kind: "export", deadlineAt: DEADLINE },
      { id: id(27), userId: BEN, kind: "closure", deadlineAt: DEADLINE },
    ]);
    // Undoing the open closure closes it, and a new one may then be filed.
    await harness.db
      .update(schema.dataRequests)
      .set({ state: "cancelled", completedAt: new Date() })
      .where(eq(schema.dataRequests.id, id(20)));
    await harness.db
      .insert(schema.dataRequests)
      .values({ id: id(28), userId: ANNA, kind: "closure", deadlineAt: DEADLINE });
    const open = await harness.db
      .select({ id: schema.dataRequests.id })
      .from(schema.dataRequests)
      .where(
        sql`${schema.dataRequests.kind} = 'closure' and ${schema.dataRequests.state} = 'requested'`,
      )
      .orderBy(schema.dataRequests.id);
    expect(open.map((row) => row.id)).toEqual([id(27), id(28)]);
  });
});
