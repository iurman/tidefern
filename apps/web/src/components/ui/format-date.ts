import { isCalendarDate } from "@tidefern/core";

/**
 * Calendar facts are `YYYY-MM-DD` strings (architecture 13.10). This module
 * is the one place the structure components turn them into words, so a later
 * locale is a translation here and not a rewrite. The formatter reads the
 * string as a UTC date so no machine time zone can shift the day.
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

export function formatCalendarDate(date: string, style: "monthDay" | "full" = "monthDay"): string {
  if (!isCalendarDate(date)) throw new Error("formatCalendarDate expects YYYY-MM-DD");
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const value = new Date(Date.UTC(year, month - 1, day));
  return style === "full" ? monthDayYear.format(value) : monthDay.format(value);
}
