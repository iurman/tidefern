import { describe, expect, it } from "vitest";
import {
  describeQuietHours,
  formatClockTime,
  isClockTime,
  isWithinQuietHours,
  minutesOfDay,
  msUntilQuietBoundary,
  parseQuietHours,
  serializeQuietHours,
  toMinutes,
} from "./quiet-hours";

describe("clock times", () => {
  it("accepts 24 hour HH:MM and nothing else", () => {
    expect(isClockTime("00:00")).toBe(true);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("7:00")).toBe(false);
    expect(isClockTime("07:60")).toBe(false);
    expect(isClockTime(700)).toBe(false);
    expect(isClockTime(null)).toBe(false);
  });

  it("converts to minutes since midnight and refuses bad input", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("07:30")).toBe(450);
    expect(toMinutes("23:59")).toBe(1439);
    expect(() => toMinutes("25:00")).toThrow(/Not a clock time/);
  });

  it("reads minutes of the day from a local clock reading", () => {
    expect(minutesOfDay(new Date(2026, 9, 5, 22, 15))).toBe(22 * 60 + 15);
    expect(minutesOfDay(new Date(2026, 9, 5, 0, 0))).toBe(0);
  });
});

describe("the quiet window", () => {
  it("is never quiet without a window", () => {
    expect(isWithinQuietHours(null, 0)).toBe(false);
    expect(isWithinQuietHours(null, 1439)).toBe(false);
  });

  it("silences a window inside one day, start inclusive and end exclusive", () => {
    const window = { start: "13:00", end: "14:00" };
    expect(isWithinQuietHours(window, toMinutes("12:59"))).toBe(false);
    expect(isWithinQuietHours(window, toMinutes("13:00"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("13:30"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("13:59"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("14:00"))).toBe(false);
  });

  it("silences a window that crosses midnight", () => {
    const window = { start: "22:00", end: "07:00" };
    expect(isWithinQuietHours(window, toMinutes("21:59"))).toBe(false);
    expect(isWithinQuietHours(window, toMinutes("22:00"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("23:59"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("00:00"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("03:30"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("06:59"))).toBe(true);
    expect(isWithinQuietHours(window, toMinutes("07:00"))).toBe(false);
    expect(isWithinQuietHours(window, toMinutes("12:00"))).toBe(false);
  });

  it("treats an equal start and end as no window", () => {
    expect(isWithinQuietHours({ start: "09:00", end: "09:00" }, toMinutes("09:00"))).toBe(false);
    expect(isWithinQuietHours({ start: "09:00", end: "09:00" }, toMinutes("15:00"))).toBe(false);
  });

  it("wraps minutes outside the day instead of failing", () => {
    const window = { start: "22:00", end: "07:00" };
    expect(isWithinQuietHours(window, 24 * 60 + toMinutes("23:00"))).toBe(true);
    expect(isWithinQuietHours(window, -60)).toBe(true);
  });
});

describe("storage", () => {
  it("round trips a window", () => {
    const window = { start: "22:00", end: "07:00" };
    expect(parseQuietHours(serializeQuietHours(window))).toEqual(window);
  });

  it("reads anything malformed as no quiet hours", () => {
    expect(parseQuietHours(null)).toBeNull();
    expect(parseQuietHours("")).toBeNull();
    expect(parseQuietHours("not json")).toBeNull();
    expect(parseQuietHours('{"start":"22:00"}')).toBeNull();
    expect(parseQuietHours('{"start":"22:00","end":"7:00"}')).toBeNull();
    expect(parseQuietHours('["22:00","07:00"]')).toBeNull();
  });

  it("keeps only the two fields it knows", () => {
    expect(parseQuietHours('{"start":"22:00","end":"07:00","note":"x"}')).toEqual({
      start: "22:00",
      end: "07:00",
    });
  });
});

describe("the sentence", () => {
  it("names the window or says there is none", () => {
    expect(describeQuietHours({ start: "22:00", end: "07:00" })).toBe("Quiet from 22:00 to 07:00");
    expect(describeQuietHours({ start: "09:00", end: "09:00" })).toBe("No quiet hours");
    expect(describeQuietHours(null)).toBe("No quiet hours");
  });

  it("prints the times in the locale's form when given a formatter", () => {
    expect(formatClockTime("22:00", "en-US")).toMatch(/^10:00\sPM$/);
    expect(formatClockTime("07:05", "en-US")).toMatch(/^07:05\sAM$/);
    expect(formatClockTime("22:00", "en-GB")).toBe("22:00");
    expect(
      describeQuietHours({ start: "22:00", end: "07:00" }, (time) =>
        formatClockTime(time, "en-GB"),
      ),
    ).toBe("Quiet from 22:00 to 07:00");
  });
});

describe("the next boundary", () => {
  const window = { start: "22:00", end: "07:00" };

  it("is the start when outside the window and the end when inside", () => {
    expect(msUntilQuietBoundary(window, new Date(2026, 9, 5, 21, 0))).toBe(60 * 60_000);
    expect(msUntilQuietBoundary(window, new Date(2026, 9, 5, 23, 30))).toBe(450 * 60_000);
    expect(msUntilQuietBoundary(window, new Date(2026, 9, 6, 6, 59, 30))).toBe(30_000);
  });

  it("counts a boundary at the current minute as passed", () => {
    expect(msUntilQuietBoundary(window, new Date(2026, 9, 5, 22, 0, 0))).toBe(9 * 60 * 60_000);
    expect(msUntilQuietBoundary(window, new Date(2026, 9, 6, 7, 0, 10))).toBe(
      15 * 60 * 60_000 - 10_000,
    );
  });

  it("is null without a window", () => {
    expect(msUntilQuietBoundary(null, new Date())).toBeNull();
    expect(msUntilQuietBoundary({ start: "09:00", end: "09:00" }, new Date())).toBeNull();
  });
});
