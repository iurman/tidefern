import { addDays, compareDates, diffDays, type CalendarDate } from "./dates";

/**
 * Deterministic cycle math shared by the web client, the API and future mobile
 * clients. Predictions are estimates for planning, not medical advice, never a
 * way to prevent or achieve pregnancy, and the product copy must say so.
 */

export interface PeriodStart {
  date: CalendarDate;
}

/**
 * How much the estimate rests on. `first_guess` means one logged period and
 * the 28 day default; `estimate` means at least one completed cycle in the
 * plausible range; `not_enough_regular_cycles` means periods were logged but
 * no completed cycle fell inside 21 to 45 days, so no date is offered.
 */
export type PredictionBasis = "first_guess" | "estimate" | "not_enough_regular_cycles";

export interface CyclePrediction {
  basis: PredictionBasis;
  /** Average cycle length used for the estimate, in days; null when no date is offered. */
  cycleLength: number | null;
  /** Number of completed plausible cycles the average was drawn from. */
  sampleSize: number;
  nextPeriodStart: CalendarDate | null;
  /** Estimated ovulation, luteal phase assumed at 14 days. */
  ovulation: CalendarDate | null;
  /**
   * Six day fertile window: the five days before estimated ovulation and the
   * day of ovulation itself (Wilcox, Dunson and Baird, BMJ 2000).
   */
  fertileWindow: { start: CalendarDate; end: CalendarDate } | null;
  /** Plus or minus days the person should expect around the prediction. */
  uncertaintyDays: number;
  /**
   * Plus or minus days around estimated ovulation. The 14 day luteal phase is
   * a convention (ACOG); measured luteal phases average 12.4 days with a wide
   * range (Bull 2019), and NHS gives 12 to 16 days, so ovulation is always a
   * band, never a day.
   */
  ovulationBandDays: number;
  irregular: boolean;
}

export interface PredictionOptions {
  /**
   * Only period starts strictly after this date count, for example the date a
   * pregnancy ended. Until a period is logged after it there is no prediction,
   * and the first prediction after it carries at least five days of uncertainty.
   */
  since?: CalendarDate;
}

export const DEFAULT_CYCLE_LENGTH = 28;
export const LUTEAL_PHASE_DAYS = 14;
/** ACOG's range for adult and adolescent cycles, used to drop logging gaps. */
export const MIN_PLAUSIBLE = 21;
export const MAX_PLAUSIBLE = 45;
const MAX_SAMPLES = 6;
const UNCERTAINTY_AFTER_RESET = 5;
export const OVULATION_BAND_DAYS = 2;

function sortedStarts(starts: PeriodStart[]): PeriodStart[] {
  return [...starts].sort((a, b) => compareDates(a.date, b.date));
}

/** Lengths of completed cycles, newest last, from a list of period start dates. */
export function cycleLengths(starts: PeriodStart[]): number[] {
  const sorted = sortedStarts(starts);
  const lengths: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;
    lengths.push(diffDays(previous.date, current.date));
  }
  return lengths;
}

/** The most recent completed cycles inside the plausible range, newest last. */
export function plausibleCycleLengths(starts: PeriodStart[]): number[] {
  return cycleLengths(starts)
    .filter((length) => length >= MIN_PLAUSIBLE && length <= MAX_PLAUSIBLE)
    .slice(-MAX_SAMPLES);
}

/** Average of the most recent plausible cycles, falling back to 28 when there is nothing to average. */
export function averageCycleLength(starts: PeriodStart[]): { length: number; sampleSize: number } {
  const plausible = plausibleCycleLengths(starts);
  if (plausible.length === 0) return { length: DEFAULT_CYCLE_LENGTH, sampleSize: 0 };
  const sum = plausible.reduce((total, length) => total + length, 0);
  return { length: Math.round(sum / plausible.length), sampleSize: plausible.length };
}

/** Irregular when recent plausible cycles differ by more than a week. Logging gaps do not count. */
export function isIrregular(starts: PeriodStart[]): boolean {
  const lengths = plausibleCycleLengths(starts);
  if (lengths.length < 3) return false;
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  return max - min > 7;
}

/** Uncertainty grows as the sample shrinks and when cycles are irregular. */
export function uncertaintyFor(sampleSize: number, irregular: boolean): number {
  if (irregular) return 5;
  if (sampleSize <= 1) return 4;
  if (sampleSize === 2) return 3;
  return 2;
}

export function predictCycle(
  starts: PeriodStart[],
  options: PredictionOptions = {},
): CyclePrediction | null {
  const since = options.since;
  const counted = since ? starts.filter((start) => compareDates(start.date, since) > 0) : starts;
  if (counted.length === 0) return null;
  const latest = sortedStarts(counted).at(-1);
  if (!latest) return null;
  const irregular = isIrregular(counted);
  const { length, sampleSize } = averageCycleLength(counted);
  const resetFloor = since ? UNCERTAINTY_AFTER_RESET : 0;

  if (sampleSize === 0 && counted.length >= 2) {
    return {
      basis: "not_enough_regular_cycles",
      cycleLength: null,
      sampleSize: 0,
      nextPeriodStart: null,
      ovulation: null,
      fertileWindow: null,
      uncertaintyDays: Math.max(uncertaintyFor(0, irregular), resetFloor),
      ovulationBandDays: OVULATION_BAND_DAYS,
      irregular,
    };
  }

  const nextPeriodStart = addDays(latest.date, length);
  const ovulation = addDays(nextPeriodStart, -LUTEAL_PHASE_DAYS);
  return {
    basis: sampleSize === 0 ? "first_guess" : "estimate",
    cycleLength: length,
    sampleSize,
    nextPeriodStart,
    ovulation,
    fertileWindow: { start: addDays(ovulation, -5), end: ovulation },
    uncertaintyDays: Math.max(uncertaintyFor(sampleSize, irregular), resetFloor),
    ovulationBandDays: OVULATION_BAND_DAYS,
    irregular,
  };
}

/** One-based day of the current cycle for a given date. */
export function cycleDay(latestPeriodStart: CalendarDate, today: CalendarDate): number {
  return diffDays(latestPeriodStart, today) + 1;
}
