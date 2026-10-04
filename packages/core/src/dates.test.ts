import { describe, expect, it } from "vitest";
import { addDays, diffDays, isCalendarDate, isKnownTimeZone, todayIn, weekStartFor } from "./dates";

describe("calendar dates", () => {
  it("validates real dates only", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-3")).toBe(false);
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("measures whole day differences", () => {
    expect(diffDays("2026-01-01", "2026-01-29")).toBe(28);
    expect(diffDays("2026-01-29", "2026-01-01")).toBe(-28);
  });
  it("derives today in a time zone, not on the server clock", () => {
    const instant = new Date("2026-10-05T03:30:00Z");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-04");
    expect(todayIn("Asia/Tokyo", instant)).toBe("2026-10-05");
  });
});

describe("time zones and week start", () => {
  it("resolves a local calendar date from an instant in any zone", () => {
    const instant = new Date("2026-10-04T06:30:00Z");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-03");
    expect(todayIn("Pacific/Auckland", instant)).toBe("2026-10-04");
  });
  it("accepts known zones and rejects made-up ones", () => {
    expect(isKnownTimeZone("Europe/Berlin")).toBe(true);
    expect(isKnownTimeZone("Mars/Olympus")).toBe(false);
  });
  it("reads the week start from the locale with Monday as the fallback", () => {
    expect(weekStartFor("en-US")).toBe(7);
    expect(weekStartFor("en-GB")).toBe(1);
  });
});
