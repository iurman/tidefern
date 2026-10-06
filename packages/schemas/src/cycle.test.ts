import { describe, expect, it } from "vitest";
import {
  CycleEntry,
  CycleEntryWrite,
  CyclePrediction,
  CycleStatus,
  FLOW_CODES,
  FLOW_LABELS,
  MOOD_CODES,
  MOOD_LABELS,
  PERIOD_FLOWS,
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  cycleVocabulary,
  isPeriodFlow,
} from "./cycle";
import { FlowLevel, MoodCode, SymptomCode } from "./index";

describe("the cycle vocabulary", () => {
  it("lists exactly the index enums, in their order, each with a label", () => {
    expect(FLOW_CODES).toEqual(FlowLevel.options);
    expect(SYMPTOM_CODES).toEqual(SymptomCode.options);
    expect(MOOD_CODES).toEqual(MoodCode.options);
    for (const code of FlowLevel.options) expect(FLOW_LABELS[code]).toMatch(/^[A-Z]/);
    for (const code of SymptomCode.options) expect(SYMPTOM_LABELS[code]).toMatch(/^[A-Z]/);
    for (const code of MoodCode.options) expect(MOOD_LABELS[code]).toMatch(/^[A-Z]/);
  });

  it("answers the pickers' lists with codes and labels", () => {
    const vocabulary = cycleVocabulary();
    expect(vocabulary.flow.map((item) => item.code)).toEqual(FlowLevel.options);
    expect(vocabulary.symptoms.map((item) => item.code)).toEqual(SymptomCode.options);
    expect(vocabulary.moods.map((item) => item.code)).toEqual(MoodCode.options);
    expect(vocabulary.symptoms.find((item) => item.code === "tender_breasts")?.label).toBe(
      "Tender breasts",
    );
    const labels = [...vocabulary.flow, ...vocabulary.symptoms, ...vocabulary.moods];
    for (const item of labels) expect(item.label).not.toContain("\u2014");
  });

  it("counts light, medium and heavy as period days and nothing else", () => {
    expect(PERIOD_FLOWS).toEqual(["light", "medium", "heavy"]);
    expect(isPeriodFlow("medium")).toBe(true);
    expect(isPeriodFlow("spotting")).toBe(false);
    expect(isPeriodFlow("none")).toBe(false);
    expect(isPeriodFlow(null)).toBe(false);
    expect(isPeriodFlow(undefined)).toBe(false);
  });
});

describe("CycleEntryWrite", () => {
  it("accepts vocabulary values and an empty body", () => {
    expect(CycleEntryWrite.parse({})).toEqual({});
    expect(
      CycleEntryWrite.parse({ flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" }),
    ).toEqual({ flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" });
    expect(CycleEntryWrite.parse({ flow: null, mood: null })).toEqual({ flow: null, mood: null });
  });

  it("refuses free text, unknown keys, unknown codes and a repeated symptom", () => {
    expect(CycleEntryWrite.safeParse({ note: "slept badly" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ flow: "torrential" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ symptoms: ["cramps", "cramps"] }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ mood: "happy" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ symptoms: "cramps" }).success).toBe(false);
  });
});

describe("the response shapes", () => {
  const instant = "2026-10-05T12:00:00.000Z";
  const id = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";

  it("allow a projected entry with only the keys and the sync facts", () => {
    expect(
      CycleEntry.safeParse({ id, subjectId: id, version: 2, updatedAt: instant, deletedAt: null })
        .success,
    ).toBe(true);
    expect(
      CycleEntry.safeParse({
        id,
        subjectId: id,
        date: "2026-02-30",
        version: 1,
        updatedAt: instant,
        deletedAt: null,
      }).success,
    ).toBe(false);
  });

  it("allow a prediction without the owner only fields", () => {
    const shared = {
      subjectId: id,
      computedAt: instant,
      basis: "estimate",
      cycleLength: 28,
      sampleSize: 3,
      nextPeriod: { expected: "2026-08-21", start: "2026-08-19", end: "2026-08-23" },
      ovulation: { expected: "2026-08-07", start: "2026-08-05", end: "2026-08-09" },
      fertileWindow: { start: "2026-08-02", end: "2026-08-07" },
      uncertaintyDays: 2,
      ovulationBandDays: 2,
    };
    expect(CyclePrediction.safeParse(shared).success).toBe(true);
    expect(CyclePrediction.safeParse({ ...shared, basis: "guess" }).success).toBe(false);
  });

  it("keep the status to the derived facts", () => {
    expect(
      CycleStatus.parse({
        subjectId: id,
        date: "2026-10-05",
        cycleDay: 3,
        periodDay: 3,
        inFertileWindow: false,
      }).cycleDay,
    ).toBe(3);
    expect(CycleStatus.safeParse({ subjectId: id, date: "2026-10-05" }).success).toBe(false);
  });
});
