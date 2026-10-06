import type { CalendarDate } from "@tidefern/core";

/**
 * Date wording for the marks group. A calendar date is a YYYY-MM-DD string
 * (architecture 13.10), so it is read in UTC and printed in en-US without
 * ever consulting the machine's time zone. Phase 1 is en-US only; a later
 * locale changes these formatters, not the components.
 */

const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function atMidnightUtc(date: CalendarDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "Oct 7" */
export function formatDay(date: CalendarDate): string {
  return monthDay.format(atMidnightUtc(date));
}

/** "Mar 14, 2027" */
export function formatDayWithYear(date: CalendarDate): string {
  return monthDayYear.format(atMidnightUtc(date));
}

/** "Sep 22 to 26" inside one month, "Sep 29 to Oct 2" across months, "Oct 7" for one day. */
export function formatDaySpan(start: CalendarDate, end: CalendarDate): string {
  if (start === end) return formatDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${formatDay(start)} to ${Number(end.slice(8, 10))}`
    : `${formatDay(start)} to ${formatDay(end)}`;
}

/** "1 day", "3 days" */
export function pluralDays(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? "day" : "days"}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st", for a rounded percentile. */
export function ordinal(value: number): string {
  const rounded = Math.round(value);
  const remainder100 = rounded % 100;
  const remainder10 = rounded % 10;
  const suffix =
    remainder100 >= 11 && remainder100 <= 13
      ? "th"
      : remainder10 === 1
        ? "st"
        : remainder10 === 2
          ? "nd"
          : remainder10 === 3
            ? "rd"
            : "th";
  return `${rounded}${suffix}`;
}
