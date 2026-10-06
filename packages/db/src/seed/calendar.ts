/**
 * Calendar arithmetic for the seed. A calendar fact is a `YYYY-MM-DD`
 * string read in a profile's time zone, never a timestamp (architecture
 * record 7.3), so every date the seed writes is "today in that zone" moved
 * by a whole number of days. `dateIn` and `shiftDays` mirror `todayIn` and
 * `addDays` in packages/core; this package does not depend on core and the
 * seed needs nothing else from it.
 */

/** A `YYYY-MM-DD` string. */
export type CalendarDate = string;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The calendar date `now` falls on for a person in the given IANA time zone. */
export function dateIn(now: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `date` moved by a whole number of days; a negative count moves back. */
export function shiftDays(date: CalendarDate, days: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) + days * DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

/** An instant a number of hours before `now`; negative hours land after it. */
export function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}

/** An instant a number of days before `now`; negative days land after it. */
export function daysBefore(now: Date, days: number): Date {
  return hoursBefore(now, days * 24);
}
