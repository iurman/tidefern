import { diffDays, isCalendarDate } from "@tidefern/core";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Whole calendar months from `from` to `to`, both `YYYY-MM-DD`; a month counts once its day is reached. */
function wholeMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/**
 * A child's age in words, the one wording every screen uses (Today after a
 * birth, Journey's postpartum view, Family; DESIGN.md 3.6 shows "4 weeks,
 * 3 days"): days for the first two weeks, weeks and days to thirteen
 * weeks, whole months to two years, then years and months to five, then
 * years. Both arguments are calendar facts in the profile's time zone;
 * `today` comes from the API, never from the machine clock.
 */
export function formatChildAge(dateOfBirth: string, today: string): string {
  if (!isCalendarDate(dateOfBirth) || !isCalendarDate(today)) {
    throw new TypeError("formatChildAge takes two YYYY-MM-DD dates");
  }
  const days = diffDays(dateOfBirth, today);
  if (days < 0) throw new RangeError("The date of birth is after today");
  if (days === 0) return "Born today";
  if (days < 14) return plural(days, "day");
  if (days < 91) {
    const weeks = Math.floor(days / 7);
    const rest = days % 7;
    return rest === 0 ? plural(weeks, "week") : `${plural(weeks, "week")}, ${plural(rest, "day")}`;
  }
  const months = wholeMonths(dateOfBirth, today);
  if (months < 24) return plural(months, "month");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (months < 60 && rest > 0) return `${plural(years, "year")}, ${plural(rest, "month")}`;
  return plural(years, "year");
}
