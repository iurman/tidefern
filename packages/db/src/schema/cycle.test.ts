import { FlowLevel, MoodCode, SymptomCode } from "@tidefern/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withSystem } from "../actor";
import { VOCABULARY_LISTS, seedVocabulary, vocabularyRows } from "../seed/vocabulary";
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

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
});

afterAll(async () => {
  await harness.close();
});

describe("the cycle migration", () => {
  test("applies from empty as the fourth journal entry", async () => {
    await expectJournalApplied(harness, "0003_cycle");
  });

  test("pins the flow, symptom and mood enums to the schemas package", () => {
    expect([...schema.flowLevelValues]).toEqual(FlowLevel.options);
    expect(schema.flowLevelEnum.enumValues).toEqual(FlowLevel.options);
    expect([...schema.symptomCodeValues]).toEqual(SymptomCode.options);
    expect(schema.symptomCodeEnum.enumValues).toEqual(SymptomCode.options);
    expect([...schema.moodCodeValues]).toEqual(MoodCode.options);
    expect(schema.moodCodeEnum.enumValues).toEqual(MoodCode.options);
    expect([...schema.predictionBasisValues]).toEqual([
      "first_guess",
      "estimate",
      "not_enough_regular_cycles",
    ]);
  });

  test("enables row level security on the three user-data tables and not on vocabulary", async () => {
    const flags = await rowSecurityFlags(harness);
    expect(flags).toMatchObject({
      cycle_entries: true,
      entry_symptoms: true,
      cycle_predictions: true,
      vocabulary: false,
    });
  });
});

describe("cycle entries and symptoms", () => {
  test("store a day with flow, mood and symptoms and read the date back as a string", async () => {
    const [entry] = await harness.db
      .insert(schema.cycleEntries)
      .values({ id: id(1), subjectId: ANNA, date: "2026-10-03", flow: "medium", mood: "steady" })
      .returning();
    expect(entry).toMatchObject({
      subjectId: ANNA,
      date: "2026-10-03",
      flow: "medium",
      mood: "steady",
      version: 1,
      deletedAt: null,
    });
    expect(entry?.createdAt).toBeInstanceOf(Date);

    await harness.db.insert(schema.entrySymptoms).values([
      { id: id(2), entryId: id(1), subjectId: ANNA, code: "cramps" },
      { id: id(3), entryId: id(1), subjectId: ANNA, code: "fatigue" },
    ]);
    const symptoms = await harness.db.query.entrySymptoms.findMany({
      where: eq(schema.entrySymptoms.entryId, id(1)),
      orderBy: schema.entrySymptoms.id,
    });
    expect(symptoms.map((row) => row.code)).toEqual(["cramps", "fatigue"]);

    const [column] = rows(
      await harness.db.execute(
        sql`select data_type from information_schema.columns where table_name = 'cycle_entries' and column_name = 'date'`,
      ),
    );
    expect(column).toEqual({ data_type: "date" });
  });

  test("allow a day with no flow and no mood", async () => {
    const [quiet] = await harness.db
      .insert(schema.cycleEntries)
      .values({ id: id(4), subjectId: ANNA, date: "2026-10-04" })
      .returning();
    expect(quiet).toMatchObject({ flow: null, mood: null });
  });

  test("refuse a second entry for the same subject and date, and allow another subject's", async () => {
    const message = await refusal(
      harness.db
        .insert(schema.cycleEntries)
        .values({ id: id(5), subjectId: ANNA, date: "2026-10-03", flow: "light" }),
    );
    expect(message).toMatch(/cycle_entries_subject_date_unique/);
    await harness.db
      .insert(schema.cycleEntries)
      .values({ id: id(6), subjectId: BEN, date: "2026-10-03" });
  });

  test("refuse the same symptom twice on one day and a code outside the vocabulary", async () => {
    const twice = await refusal(
      harness.db
        .insert(schema.entrySymptoms)
        .values({ id: id(7), entryId: id(1), subjectId: ANNA, code: "cramps" }),
    );
    expect(twice).toMatch(/entry_symptoms_entry_code_unique/);
    const unknown = await refusal(
      harness.db.execute(
        sql`insert into entry_symptoms (id, entry_id, subject_id, code) values (${id(8)}, ${id(1)}, ${ANNA}, 'sneezing')`,
      ),
    );
    expect(unknown).toMatch(/invalid input value for enum symptom_code/);
  });

  test("refuse a flow outside the vocabulary", async () => {
    const message = await refusal(
      harness.db.execute(
        sql`insert into cycle_entries (id, subject_id, date, flow) values (${id(9)}, ${ANNA}, '2026-10-05', 'torrential')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum flow_level/);
  });

  test("delete the symptoms with their entry", async () => {
    await harness.db.delete(schema.cycleEntries).where(eq(schema.cycleEntries.id, id(1)));
    expect(await harness.db.query.entrySymptoms.findMany()).toEqual([]);
  });
});

describe("cycle predictions", () => {
  test("store the prediction shape core computes", async () => {
    const [prediction] = await harness.db
      .insert(schema.cyclePredictions)
      .values({
        id: id(20),
        subjectId: ANNA,
        basis: "estimate",
        cycleLength: 28,
        sampleSize: 3,
        nextPeriodStart: "2026-10-31",
        ovulation: "2026-10-17",
        fertileWindowStart: "2026-10-12",
        fertileWindowEnd: "2026-10-17",
        uncertaintyDays: 2,
        ovulationBandDays: 2,
      })
      .returning();
    expect(prediction).toMatchObject({
      basis: "estimate",
      cycleLength: 28,
      sampleSize: 3,
      nextPeriodStart: "2026-10-31",
      ovulation: "2026-10-17",
      fertileWindowStart: "2026-10-12",
      fertileWindowEnd: "2026-10-17",
      uncertaintyDays: 2,
      ovulationBandDays: 2,
      version: 1,
    });
    expect(prediction?.computedAt).toBeInstanceOf(Date);
  });

  test("keep one live prediction per subject and let a tombstoned one stay", async () => {
    const message = await refusal(
      harness.db.insert(schema.cyclePredictions).values({
        id: id(21),
        subjectId: ANNA,
        basis: "first_guess",
        uncertaintyDays: 4,
        ovulationBandDays: 2,
      }),
    );
    expect(message).toMatch(/cycle_predictions_subject_live_unique/);

    await harness.db
      .update(schema.cyclePredictions)
      .set({ deletedAt: new Date("2026-10-05T09:00:00Z") })
      .where(eq(schema.cyclePredictions.id, id(20)));
    await harness.db.insert(schema.cyclePredictions).values({
      id: id(22),
      subjectId: ANNA,
      basis: "not_enough_regular_cycles",
      uncertaintyDays: 5,
      ovulationBandDays: 2,
    });
    const all = await harness.db.query.cyclePredictions.findMany({
      where: eq(schema.cyclePredictions.subjectId, ANNA),
      orderBy: schema.cyclePredictions.id,
    });
    expect(all.map((row) => [row.basis, row.deletedAt === null])).toEqual([
      ["estimate", false],
      ["not_enough_regular_cycles", true],
    ]);
  });

  test("delete predictions with the subject", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, ANNA));
    expect(await harness.db.query.cyclePredictions.findMany()).toEqual([]);
    expect(await harness.db.query.cycleEntries.findMany()).toHaveLength(1);
  });
});

describe("the vocabulary seed", () => {
  test("writes every code from the schemas package in picker order", async () => {
    const inserted = await withSystem((tx) => seedVocabulary(tx), harness.db);
    const expected = vocabularyRows();
    expect(inserted).toBe(expected.length);
    expect(expected).toHaveLength(
      FlowLevel.options.length + SymptomCode.options.length + MoodCode.options.length,
    );

    const stored = await harness.db.query.vocabulary.findMany({
      orderBy: [schema.vocabulary.kind, schema.vocabulary.position],
    });
    const byKind = (kind: keyof typeof VOCABULARY_LISTS) =>
      stored.filter((row) => row.kind === kind).map((row) => row.code);
    expect(byKind("flow")).toEqual(FlowLevel.options);
    expect(byKind("symptom")).toEqual(SymptomCode.options);
    expect(byKind("mood")).toEqual(MoodCode.options);
    expect(stored.map((row) => row.kind)).toEqual(
      expect.arrayContaining([...schema.vocabularyKindValues]),
    );
  });

  test("is idempotent: the second run inserts nothing and changes nothing", async () => {
    const before = await harness.db.query.vocabulary.findMany({
      orderBy: [schema.vocabulary.kind, schema.vocabulary.position],
    });
    const inserted = await withSystem((tx) => seedVocabulary(tx), harness.db);
    expect(inserted).toBe(0);
    const after = await harness.db.query.vocabulary.findMany({
      orderBy: [schema.vocabulary.kind, schema.vocabulary.position],
    });
    expect(after).toEqual(before);
  });

  test("matches the database enums code for code", () => {
    expect([...VOCABULARY_LISTS.flow]).toEqual([...schema.flowLevelValues]);
    expect([...VOCABULARY_LISTS.symptom]).toEqual([...schema.symptomCodeValues]);
    expect([...VOCABULARY_LISTS.mood]).toEqual([...schema.moodCodeValues]);
  });
});
