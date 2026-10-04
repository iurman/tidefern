import { addDays, compareDates, diffDays, type CalendarDate } from "./dates";

/**
 * Deterministic cycle math shared by the web client, the API and future mobile
 * clients. Predictions are estimates for planning, not medical advice, and the
 * product copy must say so.
 */

export interface PeriodStart {
  date: CalendarDate;
}

export interface CyclePrediction {
  /** Average cycle length used for the estimate, in days. */
  cycleLength: number;
  /** Number of completed cycles the average was drawn from. */
  sampleSize: number;
  nextPeriodStart: CalendarDate;
  /** Estimated ovulation, luteal phase assumed at 14 days. */
  ovulation: CalendarDate;
  /** Six day fertile window ending the day after estimated ovulation. */
  fertileWindow: { start: CalendarDate; end: CalendarDate };
  /** Plus or minus days the person should expect around the prediction. */
  uncertaintyDays: number;
  irregular: boolean;
}

export const DEFAULT_CYCLE_LENGTH = 28;
export const LUTEAL_PHASE_DAYS = 14;
const MIN_PLAUSIBLE = 21;
const MAX_PLAUSIBLE = 45;
const MAX_SAMPLES = 6;

/** Lengths of completed cycles, newest last, from a list of period start dates. */
export function cycleLengths(starts: PeriodStart[]): number[] {
  const sorted = [...starts].sort((a, b) => compareDates(a.date, b.date));
  const lengths: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;
    lengths.push(diffDays(previous.date, current.date));
  }
  return lengths;
}

/** Average of the most recent plausible cycles, falling back to 28 when there is nothing to average. */
export function averageCycleLength(starts: PeriodStart[]): { length: number; sampleSize: number } {
  const plausible = cycleLengths(starts)
    .filter((length) => length >= MIN_PLAUSIBLE && length <= MAX_PLAUSIBLE)
    .slice(-MAX_SAMPLES);
  if (plausible.length === 0) return { length: DEFAULT_CYCLE_LENGTH, sampleSize: 0 };
  const sum = plausible.reduce((total, length) => total + length, 0);
  return { length: Math.round(sum / plausible.length), sampleSize: plausible.length };
}

export function isIrregular(starts: PeriodStart[]): boolean {
  const lengths = cycleLengths(starts).slice(-MAX_SAMPLES);
  if (lengths.length < 3) return false;
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  return max - min > 7;
}

export function predictCycle(starts: PeriodStart[]): CyclePrediction | null {
  if (starts.length === 0) return null;
  const latest = [...starts].sort((a, b) => compareDates(a.date, b.date)).at(-1);
  if (!latest) return null;
  const { length, sampleSize } = averageCycleLength(starts);
  const nextPeriodStart = addDays(latest.date, length);
  const ovulation = addDays(nextPeriodStart, -LUTEAL_PHASE_DAYS);
  const irregular = isIrregular(starts);
  return {
    cycleLength: length,
    sampleSize,
    nextPeriodStart,
    ovulation,
    fertileWindow: { start: addDays(ovulation, -5), end: addDays(ovulation, 1) },
    uncertaintyDays: sampleSize === 0 ? 4 : irregular ? 5 : 2,
    irregular,
  };
}

/** One-based day of the current cycle for a given date. */
export function cycleDay(latestPeriodStart: CalendarDate, today: CalendarDate): number {
  return diffDays(latestPeriodStart, today) + 1;
}
