import { addDays, diffDays, type CalendarDate } from "./dates";

/**
 * Pregnancy dating per ACOG Committee Opinion 700 (2017, reaffirmed). The due
 * date is set once, from the last period or the first accurate ultrasound (or
 * the transfer date for an ART pregnancy), and changed rarely. The product
 * stores one due date with its method and appends every change to history.
 */

export const GESTATION_DAYS = 280;

export type DatingMethod = "lmp" | "ultrasound" | "transfer" | "manual";

export function dueDateFromLmp(lastPeriodStart: CalendarDate): CalendarDate {
  return addDays(lastPeriodStart, GESTATION_DAYS);
}

/** Due date from a scan: the scan date plus the days left of 280 at the measured gestational age. */
export function dueDateFromUltrasound(
  scanDate: CalendarDate,
  gestationalAgeDaysAtScan: number,
): CalendarDate {
  return addDays(scanDate, GESTATION_DAYS - gestationalAgeDaysAtScan);
}

/**
 * Due date for a transfer pregnancy: ACOG counts the embryo's age at transfer
 * as gestational age plus 14 days, so a day-5 embryo is 19 days along and the
 * due date is transfer plus 261 days.
 */
export function dueDateFromTransfer(
  transferDate: CalendarDate,
  embryoAgeDays: number,
): CalendarDate {
  return addDays(transferDate, GESTATION_DAYS - (embryoAgeDays + 14));
}

export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
  trimester: 1 | 2 | 3;
  /** "38w1d" style label used across clients. */
  label: string;
}

/** Gestational age on a date, counted from a due date (due date minus 280 days is day 0). */
export function gestationalAge(dueDate: CalendarDate, today: CalendarDate): GestationalAge {
  const start = addDays(dueDate, -GESTATION_DAYS);
  const totalDays = Math.max(0, diffDays(start, today));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  // ACOG: first trimester to 13w6d (day 97), second 14w0d to 27w6d (day 195), third from 28w0d.
  const trimester: 1 | 2 | 3 = totalDays < 98 ? 1 : totalDays < 196 ? 2 : 3;
  return { weeks, days, totalDays, trimester, label: `${weeks}w${days}d` };
}

/**
 * The discrepancy, in days, beyond which ACOG CO 700 says an ultrasound at the
 * given gestational age should change a due date set from the last period.
 */
export function redatingThresholdDays(gestationalAgeDaysAtScan: number): number {
  if (gestationalAgeDaysAtScan < 9 * 7) return 5;
  if (gestationalAgeDaysAtScan < 16 * 7) return 7;
  if (gestationalAgeDaysAtScan < 22 * 7) return 10;
  if (gestationalAgeDaysAtScan < 28 * 7) return 14;
  return 21;
}

/** Whether a scan-derived due date should replace one set from the last period. */
export function shouldRedate(
  currentDueDate: CalendarDate,
  scanDate: CalendarDate,
  gestationalAgeDaysAtScan: number,
): { redate: boolean; discrepancyDays: number; thresholdDays: number } {
  const scanDueDate = dueDateFromUltrasound(scanDate, gestationalAgeDaysAtScan);
  const discrepancyDays = Math.abs(diffDays(currentDueDate, scanDueDate));
  const thresholdDays = redatingThresholdDays(gestationalAgeDaysAtScan);
  return { redate: discrepancyDays > thresholdDays, discrepancyDays, thresholdDays };
}
