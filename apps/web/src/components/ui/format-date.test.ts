import { describe, expect, it } from "vitest";
import { formatCalendarDate } from "./format-date";

describe("formatCalendarDate", () => {
  it("prints a calendar date as month and day, or with the year", () => {
    expect(formatCalendarDate("2026-10-03")).toBe("Oct 3");
    expect(formatCalendarDate("2026-03-02", "full")).toBe("Mar 2, 2026");
  });

  it("keeps the day whatever the machine's zone is", () => {
    expect(formatCalendarDate("2026-12-31")).toBe("Dec 31");
    expect(formatCalendarDate("2026-01-01")).toBe("Jan 1");
  });

  it("refuses anything that is not YYYY-MM-DD", () => {
    expect(() => formatCalendarDate("2026-13-01")).toThrow();
    expect(() => formatCalendarDate("2026-10-03T00:00:00Z")).toThrow();
  });
});
