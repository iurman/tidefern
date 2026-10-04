import { addDays, diffDays, type CalendarDate } from "./dates";

/**
 * Pregnancy dating. Due date from the last menstrual period follows Naegele's
 * rule (280 days). A clinician's ultrasound dated due date always wins when
 * present, and the product must let the user enter it directly.
 */

export const GESTATION_DAYS = 280;

export function dueDateFromLmp(lastPeriodStart: CalendarDate): CalendarDate {
  return addDays(lastPeriodStart, GESTATION_DAYS);
}

export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
  trimester: 1 | 2 | 3;
}

/** Gestational age on a date, counted from a due date (due date minus 280 days is day 0). */
export function gestationalAge(dueDate: CalendarDate, today: CalendarDate): GestationalAge {
  const start = addDays(dueDate, -GESTATION_DAYS);
  const totalDays = Math.max(0, diffDays(start, today));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  const trimester: 1 | 2 | 3 = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  return { weeks, days, totalDays, trimester };
}
