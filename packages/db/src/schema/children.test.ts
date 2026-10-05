import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./index";
import {
  ANNA,
  BEN,
  CARA,
  CHILD,
  HOUSEHOLD,
  OTHER_CHILD,
  expectJournalApplied,
  id,
  insertUser,
  refusal,
  rowSecurityFlags,
  rows,
  type Harness,
} from "./testing";
import { createTestDatabase } from "../test/harness";

let harness: Harness;

const NOTE = Uint8Array.from({ length: 40 }, (_, index) => (index * 13 + 7) % 256);
const SLEEP_START = new Date("2026-10-04T19:30:00Z");
const SLEEP_END = new Date("2026-10-05T05:10:00Z");

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await insertUser(harness, CARA, "cara@example.test");
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
});

afterAll(async () => {
  await harness.close();
});

describe("the children migration", () => {
  test("applies from empty as the sixth journal entry", async () => {
    await expectJournalApplied(harness, "0005_children");
  });

  test("pins the sex and event vocabularies", () => {
    expect([...schema.sexValues]).toEqual(["female", "male"]);
    expect([...schema.childEventKindValues]).toEqual(["milestone", "feed", "sleep", "diaper"]);
  });

  test("enables row level security on the four tables", async () => {
    const flags = await rowSecurityFlags(harness);
    expect(flags).toMatchObject({
      children: true,
      child_guardians: true,
      child_events: true,
      child_measurements: true,
    });
  });

  test("adds the foreign key from grants.child_id to children", async () => {
    const [constraint] = rows(
      await harness.db.execute(
        sql`select confrelid::regclass::text as target, confdeltype as on_delete from pg_catalog.pg_constraint where conname = 'grants_child_id_children_id_fk'`,
      ),
    );
    expect(constraint).toEqual({ target: "children", on_delete: "c" });
  });
});

describe("children and guardians", () => {
  test("store a child with a date of birth as a string and an optional sex", async () => {
    const [child, other] = await harness.db
      .insert(schema.children)
      .values([
        {
          id: CHILD,
          householdId: HOUSEHOLD,
          displayName: "Mo",
          dateOfBirth: "2026-02-14",
          sex: "female",
        },
        { id: OTHER_CHILD, householdId: HOUSEHOLD, displayName: "Sam", dateOfBirth: "2024-07-01" },
      ])
      .returning();
    expect(child).toMatchObject({
      householdId: HOUSEHOLD,
      displayName: "Mo",
      dateOfBirth: "2026-02-14",
      sex: "female",
      version: 1,
      deletedAt: null,
    });
    expect(other).toMatchObject({ sex: null });

    const [column] = rows(
      await harness.db.execute(
        sql`select data_type from information_schema.columns where table_name = 'children' and column_name = 'date_of_birth'`,
      ),
    );
    expect(column).toEqual({ data_type: "date" });
  });

  test("record two guardians and refuse the same guardian twice", async () => {
    await harness.db.insert(schema.childGuardians).values([
      { id: id(1), childId: CHILD, userId: ANNA },
      { id: id(2), childId: CHILD, userId: BEN },
    ]);
    const message = await refusal(
      harness.db.insert(schema.childGuardians).values({ id: id(3), childId: CHILD, userId: ANNA }),
    );
    expect(message).toMatch(/child_guardians_child_user_unique/);
  });

  test("refuse a child grant for a child that does not exist", async () => {
    const message = await refusal(
      harness.db.insert(schema.grants).values({
        id: id(4),
        ownerId: ANNA,
        granteeId: CARA,
        category: "child",
        level: "read",
        childId: id(999),
        policyVersion: "2026-10-01",
        descriptionVersion: "1",
      }),
    );
    expect(message).toMatch(/grants_child_id_children_id_fk/);
  });

  test("refuse deleting a household that still has children", async () => {
    const message = await refusal(
      harness.db.delete(schema.households).where(eq(schema.households.id, HOUSEHOLD)),
    );
    expect(message).toMatch(/children_household_id_households_id_fk/);
  });
});

describe("child events", () => {
  test("store a milestone, a feed in millilitres and a sleep span", async () => {
    const [milestone, feed, sleep] = await harness.db
      .insert(schema.childEvents)
      .values([
        {
          id: id(10),
          childId: CHILD,
          authorId: ANNA,
          kind: "milestone",
          date: "2026-10-04",
          milestoneId: "6m-movement-2",
        },
        {
          id: id(11),
          childId: CHILD,
          authorId: BEN,
          kind: "feed",
          date: "2026-10-04",
          startedAt: new Date("2026-10-04T12:00:00Z"),
          quantityMl: 120,
          note: NOTE,
          kekVersion: "v1",
        },
        {
          id: id(12),
          childId: CHILD,
          authorId: ANNA,
          kind: "sleep",
          date: "2026-10-04",
          startedAt: SLEEP_START,
          endedAt: SLEEP_END,
        },
      ])
      .returning();
    expect(milestone).toMatchObject({
      kind: "milestone",
      milestoneId: "6m-movement-2",
      quantityMl: null,
      note: null,
    });
    expect(feed).toMatchObject({ kind: "feed", quantityMl: 120, kekVersion: "v1" });
    expect(Array.from(feed?.note ?? [])).toEqual(Array.from(NOTE));
    expect(sleep?.startedAt?.toISOString()).toBe(SLEEP_START.toISOString());
    expect(sleep?.endedAt?.toISOString()).toBe(SLEEP_END.toISOString());
  });

  test("refuse a milestone without its id and a feed carrying one", async () => {
    const noId = await refusal(
      harness.db
        .insert(schema.childEvents)
        .values({ id: id(13), childId: CHILD, kind: "milestone", date: "2026-10-05" }),
    );
    expect(noId).toMatch(/child_events_milestone_id_matches_kind/);
    const strayId = await refusal(
      harness.db.insert(schema.childEvents).values({
        id: id(13),
        childId: CHILD,
        kind: "feed",
        date: "2026-10-05",
        milestoneId: "6m-movement-2",
      }),
    );
    expect(strayId).toMatch(/child_events_milestone_id_matches_kind/);
  });

  test("refuse a sleep that ends before it starts and a feed of nothing", async () => {
    const backwards = await refusal(
      harness.db.insert(schema.childEvents).values({
        id: id(14),
        childId: CHILD,
        kind: "sleep",
        date: "2026-10-05",
        startedAt: SLEEP_END,
        endedAt: SLEEP_START,
      }),
    );
    expect(backwards).toMatch(/child_events_span_is_ordered/);
    const empty = await refusal(
      harness.db
        .insert(schema.childEvents)
        .values({ id: id(14), childId: CHILD, kind: "feed", date: "2026-10-05", quantityMl: 0 }),
    );
    expect(empty).toMatch(/child_events_quantity_is_positive/);
  });

  test("refuse a note without its kek version", async () => {
    const message = await refusal(
      harness.db
        .insert(schema.childEvents)
        .values({ id: id(15), childId: CHILD, kind: "diaper", date: "2026-10-05", note: NOTE }),
    );
    expect(message).toMatch(/child_events_note_has_kek_version/);
  });
});

describe("child measurements", () => {
  test("store SI integers and read them back", async () => {
    const [measurement] = await harness.db
      .insert(schema.childMeasurements)
      .values({
        id: id(20),
        childId: CHILD,
        authorId: ANNA,
        date: "2026-10-04",
        weightGrams: 7450,
        lengthMillimetres: 668,
        headMillimetres: 430,
      })
      .returning();
    expect(measurement).toMatchObject({
      date: "2026-10-04",
      weightGrams: 7450,
      lengthMillimetres: 668,
      headMillimetres: 430,
      version: 1,
    });
    const columns = rows(
      await harness.db.execute(
        sql`select column_name, data_type from information_schema.columns where table_name = 'child_measurements' and column_name in ('weight_grams', 'length_millimetres', 'head_millimetres') order by column_name`,
      ),
    );
    expect(columns.map((row) => row.data_type)).toEqual(["integer", "integer", "integer"]);
  });

  test("allow a weight on its own and refuse an empty or negative session", async () => {
    await harness.db
      .insert(schema.childMeasurements)
      .values({ id: id(21), childId: CHILD, date: "2026-10-05", weightGrams: 7500 });
    const empty = await refusal(
      harness.db
        .insert(schema.childMeasurements)
        .values({ id: id(22), childId: CHILD, date: "2026-10-06" }),
    );
    expect(empty).toMatch(/child_measurements_has_a_value/);
    const negative = await refusal(
      harness.db
        .insert(schema.childMeasurements)
        .values({ id: id(22), childId: CHILD, date: "2026-10-06", lengthMillimetres: -1 }),
    );
    expect(negative).toMatch(/child_measurements_values_are_positive/);
  });
});

describe("cascades", () => {
  test("keep a feed and clear its author when the author is deleted", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, BEN));
    const feed = await harness.db.query.childEvents.findFirst({
      where: eq(schema.childEvents.id, id(11)),
    });
    expect(feed).toMatchObject({ childId: CHILD, authorId: null });
    const guardians = await harness.db.query.childGuardians.findMany();
    expect(guardians.map((row) => row.userId)).toEqual([ANNA]);
  });

  test("delete guardians, events, measurements and child grants with the child", async () => {
    await harness.db.insert(schema.grants).values({
      id: id(30),
      ownerId: ANNA,
      granteeId: CARA,
      category: "child",
      level: "read",
      childId: CHILD,
      policyVersion: "2026-10-01",
      descriptionVersion: "1",
    });
    await harness.db.delete(schema.children).where(eq(schema.children.id, CHILD));
    expect(await harness.db.query.childGuardians.findMany()).toEqual([]);
    expect(await harness.db.query.childEvents.findMany()).toEqual([]);
    expect(await harness.db.query.childMeasurements.findMany()).toEqual([]);
    expect(await harness.db.query.grants.findMany()).toEqual([]);
    expect(await harness.db.query.children.findMany()).toHaveLength(1);
  });
});
