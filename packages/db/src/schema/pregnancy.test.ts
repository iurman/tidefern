import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./index";
import {
  ANNA,
  BEN,
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

/** 1 version byte, 12 IV bytes, 16 tag bytes, then ciphertext. */
const LABEL = Uint8Array.from({ length: 45 }, (_, index) => (index * 11 + 5) % 256);
const CHANGED_AT = new Date("2026-10-05T08:15:00Z");

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
});

afterAll(async () => {
  await harness.close();
});

describe("the pregnancy migration", () => {
  test("applies from empty as the fifth journal entry", async () => {
    await expectJournalApplied(harness, "0004_pregnancy");
  });

  test("pins the dating methods and ended reasons to the core types", () => {
    expect([...schema.datingMethodValues]).toEqual(["lmp", "ultrasound", "transfer", "manual"]);
    expect([...schema.endedReasonValues]).toEqual(["birth", "loss", "other"]);
    expect([...schema.pregnancyEventKindValues]).toEqual(["appointment", "milestone"]);
  });

  test("enables row level security on the three tables", async () => {
    const flags = await rowSecurityFlags(harness);
    expect(flags).toMatchObject({
      pregnancies: true,
      pregnancy_events: true,
      due_date_changes: true,
    });
  });
});

describe("pregnancies", () => {
  test("store an open pregnancy with calendar dates as strings", async () => {
    const [pregnancy] = await harness.db
      .insert(schema.pregnancies)
      .values({ id: id(1), subjectId: ANNA, dueDate: "2027-05-20", datingMethod: "lmp" })
      .returning();
    expect(pregnancy).toMatchObject({
      subjectId: ANNA,
      dueDate: "2027-05-20",
      datingMethod: "lmp",
      endedAt: null,
      endedReason: null,
      version: 1,
      deletedAt: null,
    });
    expect(pregnancy?.startedAt).toBeInstanceOf(Date);

    const columns = rows(
      await harness.db.execute(
        sql`select column_name, data_type from information_schema.columns where table_name = 'pregnancies' and column_name in ('due_date', 'ended_at', 'started_at') order by column_name`,
      ),
    );
    expect(columns).toEqual([
      { column_name: "due_date", data_type: "date" },
      { column_name: "ended_at", data_type: "date" },
      { column_name: "started_at", data_type: "timestamp with time zone" },
    ]);
  });

  test("refuse a second open pregnancy for the same subject", async () => {
    const message = await refusal(
      harness.db
        .insert(schema.pregnancies)
        .values({ id: id(2), subjectId: ANNA, dueDate: "2027-06-01", datingMethod: "manual" }),
    );
    expect(message).toMatch(/pregnancies_subject_open_unique/);
  });

  test("refuse an ending without a reason and a reason without an ending", async () => {
    const noReason = await refusal(
      harness.db
        .update(schema.pregnancies)
        .set({ endedAt: "2027-05-18" })
        .where(eq(schema.pregnancies.id, id(1))),
    );
    expect(noReason).toMatch(/pregnancies_ended_reason_matches_ended_at/);
    const noDate = await refusal(
      harness.db
        .update(schema.pregnancies)
        .set({ endedReason: "birth" })
        .where(eq(schema.pregnancies.id, id(1))),
    );
    expect(noDate).toMatch(/pregnancies_ended_reason_matches_ended_at/);
  });

  test("end the pregnancy and allow the next one for the same subject", async () => {
    await harness.db
      .update(schema.pregnancies)
      .set({ endedAt: "2027-05-18", endedReason: "birth" })
      .where(eq(schema.pregnancies.id, id(1)));
    await harness.db
      .insert(schema.pregnancies)
      .values({ id: id(2), subjectId: ANNA, dueDate: "2028-09-01", datingMethod: "ultrasound" });
    const all = await harness.db.query.pregnancies.findMany({
      where: eq(schema.pregnancies.subjectId, ANNA),
      orderBy: schema.pregnancies.id,
    });
    expect(all.map((row) => [row.endedAt, row.endedReason])).toEqual([
      ["2027-05-18", "birth"],
      [null, null],
    ]);
  });

  test("refuse a dating method or reason outside the vocabulary", async () => {
    const method = await refusal(
      harness.db.execute(
        sql`insert into pregnancies (id, subject_id, due_date, dating_method) values (${id(3)}, ${BEN}, '2027-01-01', 'guess')`,
      ),
    );
    expect(method).toMatch(/invalid input value for enum dating_method/);
    const reason = await refusal(
      harness.db.execute(
        sql`update pregnancies set ended_at = '2027-01-01', ended_reason = 'unknown' where id = ${id(2)}`,
      ),
    );
    expect(reason).toMatch(/invalid input value for enum ended_reason/);
  });
});

describe("pregnancy events and due date changes", () => {
  test("store an appointment with an encrypted label and a milestone without one", async () => {
    const [appointment, milestone] = await harness.db
      .insert(schema.pregnancyEvents)
      .values([
        {
          id: id(10),
          pregnancyId: id(2),
          subjectId: ANNA,
          authorId: BEN,
          kind: "appointment",
          date: "2028-03-14",
          label: LABEL,
          kekVersion: "v1",
        },
        { id: id(11), pregnancyId: id(2), subjectId: ANNA, kind: "milestone", date: "2028-02-01" },
      ])
      .returning();
    expect(appointment).toMatchObject({
      authorId: BEN,
      kind: "appointment",
      date: "2028-03-14",
      kekVersion: "v1",
      version: 1,
    });
    expect(appointment?.label).toBeInstanceOf(Uint8Array);
    expect(Array.from(appointment?.label ?? [])).toEqual(Array.from(LABEL));
    expect(milestone).toMatchObject({ authorId: null, label: null, kekVersion: null });

    const [stored] = rows(
      await harness.db.execute(
        sql`select pg_typeof(label)::text as type, octet_length(label) as bytes from pregnancy_events where id = ${id(10)}`,
      ),
    );
    expect(stored).toEqual({ type: "bytea", bytes: 45 });
  });

  test("refuse a label without its kek version", async () => {
    const message = await refusal(
      harness.db.insert(schema.pregnancyEvents).values({
        id: id(12),
        pregnancyId: id(2),
        subjectId: ANNA,
        kind: "appointment",
        date: "2028-03-15",
        label: LABEL,
      }),
    );
    expect(message).toMatch(/pregnancy_events_label_has_kek_version/);
  });

  test("append a due date change and refuse one that changes nothing", async () => {
    const [change] = await harness.db
      .insert(schema.dueDateChanges)
      .values({
        id: id(20),
        pregnancyId: id(2),
        subjectId: ANNA,
        previousDueDate: "2028-09-01",
        nextDueDate: "2028-09-05",
        method: "ultrasound",
        changedAt: CHANGED_AT,
      })
      .returning();
    expect(change).toMatchObject({
      previousDueDate: "2028-09-01",
      nextDueDate: "2028-09-05",
      method: "ultrasound",
    });
    expect(change?.changedAt.toISOString()).toBe(CHANGED_AT.toISOString());

    const message = await refusal(
      harness.db.insert(schema.dueDateChanges).values({
        id: id(21),
        pregnancyId: id(2),
        subjectId: ANNA,
        previousDueDate: "2028-09-05",
        nextDueDate: "2028-09-05",
        method: "manual",
        changedAt: CHANGED_AT,
      }),
    );
    expect(message).toMatch(/due_date_changes_is_a_change/);
  });

  test("keep the event and clear the author when the author is deleted", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, BEN));
    const kept = await harness.db.query.pregnancyEvents.findFirst({
      where: eq(schema.pregnancyEvents.id, id(10)),
    });
    expect(kept).toMatchObject({ subjectId: ANNA, authorId: null });
  });

  test("delete events and changes with their pregnancy", async () => {
    await harness.db.delete(schema.pregnancies).where(eq(schema.pregnancies.id, id(2)));
    expect(await harness.db.query.pregnancyEvents.findMany()).toEqual([]);
    expect(await harness.db.query.dueDateChanges.findMany()).toEqual([]);
    expect(await harness.db.query.pregnancies.findMany()).toHaveLength(1);
  });
});
