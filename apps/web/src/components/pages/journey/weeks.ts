import { GESTATION_DAYS, addDays, diffDays, type CalendarDate } from "@tidefern/core";

/**
 * The week-by-week list counted from the due date (ACOG CO 700, the same
 * arithmetic as core's `gestationalAge`): day 0 is the due date minus 280
 * days, week N runs from day 7N to day 7N + 6, and the due date opens week
 * 40. Pure functions over calendar strings, so the server render, the tests
 * and any later client agree, and nothing here reads a clock.
 */

/** Day 0 of the pregnancy: the due date minus 280 days. */
export function pregnancyStart(dueDate: CalendarDate): CalendarDate {
  return addDays(dueDate, -GESTATION_DAYS);
}

/** The week a calendar day falls in; a day before day 0 counts in week 0. */
export function weekOf(dueDate: CalendarDate, date: CalendarDate): number {
  return Math.max(0, Math.floor(diffDays(pregnancyStart(dueDate), date) / 7));
}

/** The first and last day of a week. */
export function weekSpan(dueDate: CalendarDate, week: number): { start: string; end: string } {
  const start = addDays(pregnancyStart(dueDate), week * 7);
  return { start, end: addDays(start, 6) };
}

/**
 * Today in the subject's zone as the API counted it: the gestation it sent
 * is days since day 0, so day 0 plus those days is the day the API used.
 * A grantee's zone can differ from the subject's, and the card, the week
 * marker and the Expected rows must agree with the week the API reported.
 */
export function countedToday(dueDate: CalendarDate, totalDays: number): CalendarDate {
  return addDays(pregnancyStart(dueDate), totalDays);
}

export interface WeekGroup<T> {
  week: number;
  start: string;
  end: string;
  items: T[];
}

export interface WeekByWeek<T> {
  /** Weeks before this one that hold something, oldest first. */
  earlier: WeekGroup<T>[];
  /** This week, whether or not it holds anything, then each later week that does. */
  ahead: WeekGroup<T>[];
}

/**
 * Groups dated items by the week they fall in (DESIGN.md 3.5: plain rows,
 * "Week 25, Mar 12 to 18, appointment: scan"). This week always leads the
 * weeks ahead, under the tide line marker, so the list says where today is
 * even when nothing is planned; past and later weeks appear only when they
 * hold something. Items keep the order they came in (the API lists events
 * by date, oldest first).
 */
export function weekByWeek<T extends { date: CalendarDate }>(
  dueDate: CalendarDate,
  today: CalendarDate,
  items: readonly T[],
): WeekByWeek<T> {
  const current = weekOf(dueDate, today);
  const byWeek = new Map<number, T[]>();
  for (const item of items) {
    const week = weekOf(dueDate, item.date);
    const list = byWeek.get(week);
    if (list === undefined) byWeek.set(week, [item]);
    else list.push(item);
  }
  const group = (week: number): WeekGroup<T> => ({
    week,
    ...weekSpan(dueDate, week),
    items: byWeek.get(week) ?? [],
  });
  const filled = [...byWeek.keys()].sort((a, b) => a - b);
  return {
    earlier: filled.filter((week) => week < current).map(group),
    ahead: [group(current), ...filled.filter((week) => week > current).map(group)],
  };
}
