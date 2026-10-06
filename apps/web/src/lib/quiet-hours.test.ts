import { describe, expect, it } from "vitest";
import {
  describeQuietHours,
  isClockTime,
  isWithinQuietHours,
  minutesOfDay,
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
});
