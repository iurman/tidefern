/**
 * Calendar date helpers. A calendar date is a YYYY-MM-DD string with no time
 * zone, because a period logged at 11 pm is still that day wherever the server runs.
 */
export type CalendarDate = string;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): value is CalendarDate {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function assertDate(value: string): asserts value is CalendarDate {
  if (!isCalendarDate(value)) throw new RangeError(`Invalid calendar date: ${value}`);
}

function toUtc(value: CalendarDate): number {
  assertDate(value);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): CalendarDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Whole days from a to b. Positive when b is after a. */
export function diffDays(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toUtc(a) - toUtc(b);
}

/** Today's calendar date for a person in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
