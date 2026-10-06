import { describe, expect, it } from "vitest";
import {
  dayAccessibleName,
  dayFacts,
  daysBetween,
  firstOfMonth,
  fromUtcDate,
  monthCaption,
  startOfWeek,
  toUtcDate,
  weekdayHeader,
  weekdayName,
  weekStartIndex,
} from "./calendar-dates";

describe("calendar dates", () => {
  it("round-trips a calendar date through a UTC instant whatever the machine zone", () => {
    const date = toUtcDate("2026-10-05");
    expect(date.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(fromUtcDate(date)).toBe("2026-10-05");
    expect(() => toUtcDate("2026-02-30")).toThrow(RangeError);
  });

  it("finds the first of the month and the start of the week for any week start", () => {
    expect(firstOfMonth("2026-10-05")).toBe("2026-10-01");
    expect(startOfWeek("2026-10-05", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-05", 7)).toBe("2026-10-04");
    expect(startOfWeek("2026-10-04", 1)).toBe("2026-09-28");
    expect(startOfWeek("2026-10-07", 6)).toBe("2026-10-03");
    expect(weekStartIndex(1)).toBe(1);
    expect(weekStartIndex(7)).toBe(0);
  });

  it("lists the days of a window inclusively and nothing for a reversed one", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(daysBetween("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
    expect(daysBetween("2026-10-06", "2026-10-05")).toEqual([]);
  });

  it("formats in the given locale from UTC", () => {
    expect(monthCaption("2026-10-05", "en-US")).toBe("October 2026");
    expect(weekdayHeader("2026-10-05", "en-US")).toBe("Mo");
    expect(weekdayName("2026-10-05", "en-US")).toBe("Monday");
    expect(weekdayHeader("2026-10-05", "de-DE")).toBe("Mo");
  });
});

describe("dayFacts", () => {
  it("gives each day of a window its edge and keeps the caller's words", () => {
    const facts = dayFacts({
      windows: [{ start: "2026-10-01", end: "2026-10-03", texture: "logged", words: "logged" }],
    });
    expect(facts.get("2026-10-01")).toEqual({
      texture: "logged",
      edge: "start",
      words: ["logged"],
    });
    expect(facts.get("2026-10-02")).toEqual({
      texture: "logged",
      edge: "middle",
      words: ["logged"],
    });
    expect(facts.get("2026-10-03")).toEqual({ texture: "logged", edge: "end", words: ["logged"] });
    expect(facts.get("2026-10-04")).toBeUndefined();
  });

  it("marks a one-day window as single and lets a logged texture win over an estimate", () => {
    const facts = dayFacts({
      windows: [
        { start: "2026-10-11", end: "2026-10-16", texture: "estimated", words: "estimated" },
        { start: "2026-10-12", end: "2026-10-12", texture: "logged", words: "logged" },
      ],
      points: [{ date: "2026-10-16", words: "point" }],
      noted: [{ date: "2026-10-12" }],
    });
    expect(facts.get("2026-10-12")).toEqual({
      texture: "logged",
      edge: "single",
      noted: true,
      words: ["logged", "estimated"],
    });
    expect(facts.get("2026-10-16")).toEqual({
      texture: "estimated",
      edge: "end",
      point: true,
      words: ["estimated", "point"],
    });
  });
});

describe("dayAccessibleName", () => {
  const locale = "en-US";

  it("names the date alone for a plain day", () => {
    expect(dayAccessibleName({ date: "2026-10-06", today: "2026-10-05", locale })).toBe(
      "Tuesday, October 6, 2026",
    );
  });

  it("puts today first, selected after the date and the caller's words last", () => {
    expect(
      dayAccessibleName({
        date: "2026-10-05",
        today: "2026-10-05",
        locale,
        selected: true,
        words: ["period logged", "cramps logged"],
      }),
    ).toBe("Today, Monday, October 5, 2026, selected, period logged, cramps logged");
  });

  it("carries no words of its own", () => {
    const name = dayAccessibleName({ date: "2026-10-30", today: "2026-10-05", locale });
    expect(name).toBe("Friday, October 30, 2026");
  });
});
