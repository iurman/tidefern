import { z } from "zod";
import type { FlowLevel, MoodCode, SymptomCode } from "./index";

/**
 * The cycle area of the contract (task E3): the day entry as the API answers
 * it, the write body of the day sheet, the prediction, the derived status
 * and the vocabulary with its labels.
 *
 * Only types come from ./index. The index re-exports this module, so a
 * runtime import from it would be a cycle that leaves every binding in its
 * temporal dead zone while this file evaluates. The three label maps below
 * are instead pinned to the index enums by `satisfies`, so a value added to
 * `FlowLevel`, `SymptomCode` or `MoodCode` fails to compile here until it
 * has a label, and the test proves the code lists match at runtime.
 */

/** Sentence case, plain words, in picker order; the day sheet shows these. */
export const FLOW_LABELS = {
  none: "None",
  spotting: "Spotting",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
} as const satisfies Record<FlowLevel, string>;

export const SYMPTOM_LABELS = {
  cramps: "Cramps",
  headache: "Headache",
  bloating: "Bloating",
  fatigue: "Fatigue",
  tender_breasts: "Tender breasts",
  nausea: "Nausea",
  backache: "Backache",
  acne: "Acne",
  cravings: "Cravings",
  insomnia: "Trouble sleeping",
  spotting: "Spotting",
  discharge: "Discharge",
  hot_flashes: "Hot flashes",
  dizziness: "Dizziness",
  mood_swings: "Mood swings",
  anxiety: "Anxiety",
  low_energy: "Low energy",
  high_energy: "High energy",
  other: "Something else",
} as const satisfies Record<SymptomCode, string>;

export const MOOD_LABELS = {
  low: "Low",
  steady: "Steady",
  bright: "Bright",
} as const satisfies Record<MoodCode, string>;

function codesOf<Code extends string>(labels: Readonly<Record<Code, string>>): [Code, ...Code[]] {
  return Object.keys(labels) as [Code, ...Code[]];
}

export const FLOW_CODES = codesOf(FLOW_LABELS);
export const SYMPTOM_CODES = codesOf(SYMPTOM_LABELS);
export const MOOD_CODES = codesOf(MOOD_LABELS);

/**
 * The flow levels that make a day a period day. Spotting is not bleeding, so
 * a day of spotting neither starts a period nor extends one; `none` is an
 * explicit "no bleeding today".
 */
export const PERIOD_FLOWS = ["light", "medium", "heavy"] as const satisfies readonly FlowLevel[];

export function isPeriodFlow(flow: FlowLevel | null | undefined): boolean {
  return flow !== null && flow !== undefined && (PERIOD_FLOWS as readonly string[]).includes(flow);
}

const Uuid = z.uuid().describe("Opaque resource identifier");

/** A real calendar date, so February 30 is refused, not only the shape. */
const Day = z.iso.date().describe("Calendar date in the subject's time zone, YYYY-MM-DD");

const Instant = z.iso
  .datetime()
  .describe("RFC 3339 instant in UTC with three fractional digits and Z");

/**
 * The day entry as the API answers it. Every field outside the keys and the
 * sync facts is filed under a category by the storage map (architecture
 * record 8.2): `date`, `flow` and the derived `period` under
 * `cycle.history`, `symptoms` and `mood` under `cycle.symptoms`. A reader who
 * holds one category never receives the other's fields, so each of them is
 * optional here; a tombstone carries the keys and the sync facts only.
 */
export const CycleEntry = z
  .object({
    id: Uuid,
    subjectId: Uuid.describe("Whose body the entry is about"),
    date: Day.optional().describe("Under cycle.history; absent for a reader without it"),
    flow: z.enum(FLOW_CODES).nullable().optional().describe("Under cycle.history"),
    period: z
      .boolean()
      .optional()
      .describe("Derived from flow: true for light, medium or heavy. Under cycle.history"),
    symptoms: z.array(z.enum(SYMPTOM_CODES)).optional().describe("Under cycle.symptoms"),
    mood: z.enum(MOOD_CODES).nullable().optional().describe("Under cycle.symptoms"),
    version: z.int().min(1).describe("The value If-Match carries on the next update"),
    updatedAt: Instant,
    deletedAt: Instant.nullable().describe("Set on a tombstone; the entry then carries no facts"),
  })
  .meta({
    id: "CycleEntry",
    description:
      "One day of the cycle for one subject, projected to the categories the reader holds.",
  });
export type CycleEntry = z.infer<typeof CycleEntry>;

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * What PUT /v1/cycle/entries/{date} accepts: vocabulary values only. The day
 * replaces its fields in every category the writer may write, so a field
 * left out is cleared there. The day sheet's note is never here; it is its
 * own encrypted row (task E6), which is why unknown keys are refused rather
 * than dropped. There is no separate period flag: a period day is a day
 * whose flow is light, medium or heavy.
 */
export const CycleEntryWrite = z
  .strictObject({
    flow: z.enum(FLOW_CODES).nullable().optional(),
    symptoms: z
      .array(z.enum(SYMPTOM_CODES))
      .max(30)
      .refine(unique, "Each symptom at most once")
      .optional(),
    mood: z.enum(MOOD_CODES).nullable().optional(),
  })
  .meta({
    id: "CycleEntryWrite",
    description: "The day sheet's values for one date. No free text travels here.",
  });
export type CycleEntryWrite = z.infer<typeof CycleEntryWrite>;

export const CycleEntryList = z
  .object({
    items: z.array(CycleEntry),
    nextCursor: z
      .string()
      .nullable()
      .describe("Opaque; pass it back as cursor for the next page, null on the last"),
  })
  .meta({ id: "CycleEntryList" });
export type CycleEntryList = z.infer<typeof CycleEntryList>;

/**
 * What the prediction rests on. The three named states are core's
 * `PredictionBasis`; `none` means no date is offered because nothing is
 * logged yet or a pregnancy is in progress or has just ended and no period
 * has been logged since (architecture record 8.4).
 */
export const PredictionBasis = z.enum([
  "none",
  "first_guess",
  "estimate",
  "not_enough_regular_cycles",
]);
export type PredictionBasis = z.infer<typeof PredictionBasis>;

export const DateRange = z.object({ start: Day, end: Day }).meta({ id: "DateRange" });
export type DateRange = z.infer<typeof DateRange>;

/** An estimated date with the band the uncertainty draws around it. */
export const DateBand = z
  .object({ expected: Day, start: Day, end: Day })
  .meta({ id: "DateBand", description: "An estimate and the band drawn around it" });
export type DateBand = z.infer<typeof DateBand>;

/**
 * The numbers and dates the prediction copy of architecture record 13.10
 * renders; the words are the client's. Everything here files under
 * `cycle.history`. The fields marked owner only never appear on a grantee's
 * response: the deviation nudge and the care line are hers.
 */
export const CyclePrediction = z
  .object({
    subjectId: Uuid,
    computedAt: Instant,
    basis: PredictionBasis,
    cycleLength: z.int().nullable().describe("Average length used, in days; null when no date"),
    sampleSize: z.int().min(0).describe("Completed plausible cycles the average rests on"),
    nextPeriod: DateBand.nullable().describe("The expected start and the band of uncertainty"),
    ovulation: DateBand.nullable().describe("Always a band, never a day"),
    fertileWindow: DateRange.nullable().describe(
      "Five days before estimated ovulation and the day",
    ),
    uncertaintyDays: z.int().min(0),
    ovulationBandDays: z.int().min(0),
    irregular: z.boolean().optional().describe("Owner only"),
    periodsLogged: z.int().min(0).optional().describe("Owner only: period starts logged"),
    cycleLengthRange: z
      .object({ min: z.int(), max: z.int() })
      .nullable()
      .optional()
      .describe("Owner only: the spread of the recent plausible cycles, for the deviation line"),
    daysLate: z
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe("Owner only: days past the expected start as of today, 0 when not yet due"),
    pointToCare: z
      .boolean()
      .optional()
      .describe("Owner only: true when the period is more than two weeks late"),
  })
  .meta({
    id: "CyclePrediction",
    description: "An estimate from logged dates, never medical advice or contraception.",
  });
export type CyclePrediction = z.infer<typeof CyclePrediction>;

/**
 * The `cycle.status` card, derived on read and never stored: what a partner
 * with the status category sees, and nothing more.
 */
export const CycleStatus = z
  .object({
    subjectId: Uuid,
    date: Day.describe("Today in the subject's time zone"),
    cycleDay: z.int().min(1).nullable().describe("One based, from the latest period start"),
    periodDay: z.int().min(1).nullable().describe("One based while bleeding, else null"),
    inFertileWindow: z.boolean(),
  })
  .meta({ id: "CycleStatus", description: "The derived status for today" });
export type CycleStatus = z.infer<typeof CycleStatus>;

export const VocabularyItem = z.object({ code: z.string(), label: z.string() });
export type VocabularyItem = z.infer<typeof VocabularyItem>;

export const CycleVocabulary = z
  .object({
    flow: z.array(VocabularyItem),
    symptoms: z.array(VocabularyItem),
    moods: z.array(VocabularyItem),
  })
  .meta({ id: "CycleVocabulary", description: "The pickers' lists, in display order" });
export type CycleVocabulary = z.infer<typeof CycleVocabulary>;

function items<Code extends string>(labels: Readonly<Record<Code, string>>): VocabularyItem[] {
  return codesOf(labels).map((code) => ({ code, label: labels[code] }));
}

/** The vocabulary response, the same for every actor. */
export function cycleVocabulary(): CycleVocabulary {
  return { flow: items(FLOW_LABELS), symptoms: items(SYMPTOM_LABELS), moods: items(MOOD_LABELS) };
}
