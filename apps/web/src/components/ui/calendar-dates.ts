import { addDays, compareDates, isCalendarDate, type CalendarDate } from "@tidefern/core";

/**
 * Date plumbing shared by the calendar components. Every day is a
 * `YYYY-MM-DD` string; the only `Date` objects are UTC midnights handed to
 * react-day-picker with `timeZone="UTC"`, so the machine's zone never moves a
 * day. Nothing here calls `new Date()` without a value.
 */

/** Monday 1 through Sunday 7, the Intl convention `weekStartFor` in core uses. */
export type WeekStart = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A logged fact is solid, a prediction dashed, an estimate dotted (RESEARCH.md decision 1). */
export type DayTexture = "logged" | "predicted" | "estimated";

/** Where a day sits in a window, so the pill rounds only at its ends. */
export type DayEdge = "start" | "middle" | "end" | "single";

export interface DayWindow {
  start: CalendarDate;
  end: CalendarDate;
  texture: DayTexture;
  /** Words appended to each day's accessible name, written by the caller. */
  words?: string;
}

export interface DayMark {
  date: CalendarDate;
  /** Words appended to the day's accessible name, written by the caller. */
  words?: string;
}

export interface DayFacts {
  texture?: DayTexture;
  edge?: DayEdge;
  /** The small outlined dot under the number. */
  point?: boolean;
  /** The 4 px text-colored dot that marks a day with an entry. */
  noted?: boolean;
  words: string[];
}

export function toUtcDate(date: CalendarDate): Date {
  if (!isCalendarDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

export function fromUtcDate(date: Date): CalendarDate {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function firstOfMonth(date: CalendarDate): CalendarDate {
  if (!isCalendarDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  return `${date.slice(0, 7)}-01`;
}

/** The index react-day-picker takes: 0 for Sunday through 6 for Saturday. */
export function weekStartIndex(weekStart: WeekStart): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (weekStart % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** The first day of the week that holds `date`. */
export function startOfWeek(date: CalendarDate, weekStart: WeekStart): CalendarDate {
  const sundayFirst = toUtcDate(date).getUTCDay();
  const isoDay = sundayFirst === 0 ? 7 : sundayFirst;
  const back = (isoDay - weekStart + 7) % 7;
  return addDays(date, -back);
}

/** Every day from `start` to `end` inclusive, in order; empty when end is before start. */
export function daysBetween(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  const days: CalendarDate[] = [];
  if (compareDates(start, end) > 0) return days;
  let cursor = start;
  while (compareDates(cursor, end) <= 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function format(date: CalendarDate, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(toUtcDate(date));
}

/** "Sunday, October 5, 2026" */
export function longDate(date: CalendarDate, locale: string): string {
  return format(date, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** "Sun, Oct 5" */
export function shortDate(date: CalendarDate, locale: string): string {
  return format(date, locale, { weekday: "short", month: "short", day: "numeric" });
}

/** "October 2026" */
export function monthCaption(date: CalendarDate, locale: string): string {
  return format(date, locale, { month: "long", year: "numeric" });
}

/** "Mo", the two-letter column header. */
export function weekdayHeader(date: CalendarDate, locale: string): string {
  return format(date, locale, { weekday: "short" }).slice(0, 2);
}

/** "Monday", the column header's full name. */
export function weekdayName(date: CalendarDate, locale: string): string {
  return format(date, locale, { weekday: "long" });
}

const texturePriority: DayTexture[] = ["logged", "predicted", "estimated"];

/**
 * Collapses windows and marks into one record per day. When windows overlap,
 * a logged texture wins over a predicted one and a predicted one over an
 * estimate; the words of every window and mark on a day are all kept.
 */
export function dayFacts(input: {
  windows?: DayWindow[];
  points?: DayMark[];
  noted?: DayMark[];
}): Map<CalendarDate, DayFacts> {
  const facts = new Map<CalendarDate, DayFacts>();
  const factsFor = (date: CalendarDate): DayFacts => {
    const existing = facts.get(date);
    if (existing) return existing;
    const created: DayFacts = { words: [] };
    facts.set(date, created);
    return created;
  };
  const windows = [...(input.windows ?? [])].sort(
    (a, b) => texturePriority.indexOf(a.texture) - texturePriority.indexOf(b.texture),
  );
  for (const window of windows) {
    const days = daysBetween(window.start, window.end);
    days.forEach((date, index) => {
      const day = factsFor(date);
      if (window.words) day.words.push(window.words);
      if (day.texture) return;
      day.texture = window.texture;
      const first = index === 0;
      const last = index === days.length - 1;
      day.edge = first && last ? "single" : first ? "start" : last ? "end" : "middle";
    });
  }
  for (const mark of input.points ?? []) {
    const day = factsFor(mark.date);
    day.point = true;
    if (mark.words) day.words.push(mark.words);
  }
  for (const mark of input.noted ?? []) {
    const day = factsFor(mark.date);
    day.noted = true;
    if (mark.words) day.words.push(mark.words);
  }
  return facts;
}

/**
 * The accessible name of one day: "Today, Sunday, October 5, 2026, selected,
 * period logged". The template itself names only the date and the two
 * interface states; every other word comes from the caller.
 */
export function dayAccessibleName(input: {
  date: CalendarDate;
  today: CalendarDate;
  locale: string;
  selected?: boolean;
  words?: string[];
}): string {
  const parts: string[] = [];
  if (input.date === input.today) parts.push("Today");
  parts.push(longDate(input.date, input.locale));
  if (input.selected) parts.push("selected");
  parts.push(...(input.words ?? []));
  return parts.join(", ");
}
