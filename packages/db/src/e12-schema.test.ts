import { eq, sql } from "drizzle-orm";
import { ChildEventDiaperContents, ChildEventFeedMethod } from "@tidefern/schemas";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./schema/index";
import {
  ANNA,
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
 * Task E12, migration 0012: how a feed was given and what a diaper held,
 * two closed, nullable enums on `child_events`, each refused on every kind
 * but its own, written the way B13 added a feed's side.
 */
let harness: Harness;

const DAY = "2026-10-01";
const NIGHT = new Date("2026-10-01T20:00:00.000Z");

async function enumLabels(type: string): Promise<unknown[]> {
  return rows(
    await harness.db.execute(
      sql`select e.enumlabel as value from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid = e.enumtypid where t.typname = ${type} order by e.enumsortorder`,
    ),
  ).map((row) => row.value);
}

async function column(name: string) {
  const [found] = rows(
    await harness.db.execute(
      sql`select udt_name, is_nullable from information_schema.columns where table_name = 'child_events' and column_name = ${name}`,
    ),
  );
  return found;
}

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
  await harness.db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2026-02-14" });
});

afterAll(async () => {
  await harness.close();
});

describe("migration 0012", () => {
  test("applies from empty in journal order", async () => {
    await expectJournalApplied(harness, "0012_child_event_feed_method_and_diaper_contents");
  });

  test("adds a nullable feed method over breast, bottle and solids, pinned to its Zod twin", async () => {
    expect(await enumLabels("child_event_feed_method")).toEqual(["breast", "bottle", "solids"]);
    expect([...schema.childEventFeedMethodValues]).toEqual(ChildEventFeedMethod.options);
    expect(await column("feed_method")).toEqual({
      udt_name: "child_event_feed_method",
      is_nullable: "YES",
    });
  });

  test("adds nullable diaper contents over wet, dirty and mixed, pinned to its Zod twin", async () => {
    expect(await enumLabels("child_event_diaper_contents")).toEqual(["wet", "dirty", "mixed"]);
    expect([...schema.childEventDiaperContentsValues]).toEqual(ChildEventDiaperContents.options);
    expect(await column("diaper_contents")).toEqual({
      udt_name: "child_event_diaper_contents",
      is_nullable: "YES",
    });
  });
});

describe("a feed's method", () => {
  test("is stored on a feed, beside a side or a volume, and a feed may go without one", async () => {
    await harness.db.insert(schema.childEvents).values([
      {
        id: id(1),
        childId: CHILD,
        authorId: ANNA,
        kind: "feed",
        date: DAY,
        feedMethod: "breast",
        side: "left",
      },
      {
        id: id(2),
        childId: CHILD,
        authorId: ANNA,
        kind: "feed",
        date: DAY,
        feedMethod: "bottle",
        quantityMl: 90,
      },
      { id: id(3), childId: CHILD, authorId: ANNA, kind: "feed", date: DAY, feedMethod: "solids" },
      { id: id(4), childId: CHILD, authorId: ANNA, kind: "feed", date: DAY },
    ]);
    const stored = await harness.db
      .select({ id: schema.childEvents.id, feedMethod: schema.childEvents.feedMethod })
      .from(schema.childEvents)
      .orderBy(schema.childEvents.id);
    expect(stored).toEqual([
      { id: id(1), feedMethod: "breast" },
      { id: id(2), feedMethod: "bottle" },
      { id: id(3), feedMethod: "solids" },
      { id: id(4), feedMethod: null },
    ]);
  });

  test("is refused on a sleep, a diaper and a milestone", async () => {
    for (const [n, kind, extra] of [
      [5, "sleep", { startedAt: NIGHT }],
      [6, "diaper", {}],
      [7, "milestone", { milestoneId: "2m-social-1" }],
    ] as const) {
      const message = await refusal(
        harness.db.insert(schema.childEvents).values({
          id: id(n),
          childId: CHILD,
          authorId: ANNA,
          kind,
          date: DAY,
          feedMethod: "bottle",
          ...extra,
        }),
      );
      expect(message).toMatch(/child_events_feed_method_is_for_feed/);
    }
  });

  test("is refused when a feed with a method becomes another kind, and outside the enum", async () => {
    const changed = await refusal(
      harness.db
        .update(schema.childEvents)
        .set({ kind: "diaper" })
        .where(eq(schema.childEvents.id, id(3))),
    );
    expect(changed).toMatch(/child_events_feed_method_is_for_feed/);
    const unknown = await refusal(
      harness.db.execute(
        sql`insert into child_events (id, child_id, kind, date, feed_method) values (${id(8)}, ${CHILD}, 'feed', ${DAY}, 'formula')`,
      ),
    );
    expect(unknown).toMatch(/invalid input value for enum child_event_feed_method/);
  });
});

describe("a diaper's contents", () => {
  test("are stored on a diaper, and a diaper may go without them", async () => {
    await harness.db.insert(schema.childEvents).values([
      {
        id: id(11),
        childId: CHILD,
        authorId: ANNA,
        kind: "diaper",
        date: DAY,
        diaperContents: "wet",
      },
      {
        id: id(12),
        childId: CHILD,
        authorId: ANNA,
        kind: "diaper",
        date: DAY,
        diaperContents: "dirty",
      },
      {
        id: id(13),
        childId: CHILD,
        authorId: ANNA,
        kind: "diaper",
        date: DAY,
        diaperContents: "mixed",
      },
      { id: id(14), childId: CHILD, authorId: ANNA, kind: "diaper", date: DAY },
    ]);
    const stored = await harness.db
      .select({ id: schema.childEvents.id, diaperContents: schema.childEvents.diaperContents })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.kind, "diaper"))
      .orderBy(schema.childEvents.id);
    expect(stored).toEqual([
      { id: id(11), diaperContents: "wet" },
      { id: id(12), diaperContents: "dirty" },
      { id: id(13), diaperContents: "mixed" },
      { id: id(14), diaperContents: null },
    ]);
  });

  test("are refused on a feed, a sleep and a milestone", async () => {
    for (const [n, kind, extra] of [
      [15, "feed", {}],
      [16, "sleep", { startedAt: NIGHT }],
      [17, "milestone", { milestoneId: "2m-social-2" }],
    ] as const) {
      const message = await refusal(
        harness.db.insert(schema.childEvents).values({
          id: id(n),
          childId: CHILD,
          authorId: ANNA,
          kind,
          date: DAY,
          diaperContents: "wet",
          ...extra,
        }),
      );
      expect(message).toMatch(/child_events_diaper_contents_is_for_diaper/);
    }
  });

  test("are refused when a diaper with contents becomes another kind, and outside the enum", async () => {
    const changed = await refusal(
      harness.db
        .update(schema.childEvents)
        .set({ kind: "feed" })
        .where(eq(schema.childEvents.id, id(11))),
    );
    expect(changed).toMatch(/child_events_diaper_contents_is_for_diaper/);
    const unknown = await refusal(
      harness.db.execute(
        sql`insert into child_events (id, child_id, kind, date, diaper_contents) values (${id(18)}, ${CHILD}, 'diaper', ${DAY}, 'leaked')`,
      ),
    );
    expect(unknown).toMatch(/invalid input value for enum child_event_diaper_contents/);
  });
});
