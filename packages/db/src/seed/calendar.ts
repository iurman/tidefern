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

/** How far the zone's wall clock runs ahead of UTC at `at`, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wall - (at.getTime() - at.getUTCMilliseconds());
}

/**
 * The instant it is noon on `date` in the given IANA time zone. Clock
 * changes happen at night, so noon exists exactly once on every calendar
 * date, a 23-hour or a 25-hour one included, and an instant placed there
 * reads back as that date in that zone at any `now`. The offset is
 * measured at a first guess and again at the answer, so a change between
 * the two cannot skew it.
 */
export function noonIn(date: CalendarDate, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wallNoon = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
  const guess = wallNoon - zoneOffsetMs(new Date(wallNoon), timeZone);
  return new Date(wallNoon - zoneOffsetMs(new Date(guess), timeZone));
}
