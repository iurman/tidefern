import { describe, expect, it } from "vitest";
import { todayIn } from "@tidefern/core";

import { ClockConfigurationError, calendarClock, frozenInstant, realCalendarClock } from "./clock";

/**
 * The calendar clock on its own (task E11): set, unset, refused on
 * production, and a value that names no instant. The inputs mirror the
 * seed's own `resolveSeedNow` tests in packages/db, because the server must
 * read the variable exactly as the seed does or the two disagree on the
 * cast's today.
 */
const INSTANT = "2026-10-05T03:30:00Z";

describe("frozenInstant", () => {
  it("is null when the variable is unset or blank, so the calendar is the real one", () => {
    expect(frozenInstant({})).toBeNull();
    expect(frozenInstant({ TIDEFERN_FAKE_NOW: "" })).toBeNull();
    expect(frozenInstant({ TIDEFERN_FAKE_NOW: "   " })).toBeNull();
    expect(frozenInstant({ VERCEL_ENV: "production" })).toBeNull();
  });

  it("reads an ISO 8601 instant, trimmed, as the seed does", () => {
    expect(frozenInstant({ TIDEFERN_FAKE_NOW: INSTANT })).toEqual(new Date(INSTANT));
    expect(frozenInstant({ TIDEFERN_FAKE_NOW: ` ${INSTANT} ` })).toEqual(new Date(INSTANT));
  });

  it("reads a bare date as midnight UTC on that day, CI's 2026-10-05 included", () => {
    expect(frozenInstant({ TIDEFERN_FAKE_NOW: "2026-10-05" })?.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("is honoured anywhere but production, previews and development included", () => {
    for (const vercelEnv of ["preview", "development", undefined]) {
      expect(frozenInstant({ TIDEFERN_FAKE_NOW: INSTANT, VERCEL_ENV: vercelEnv })).toEqual(
        new Date(INSTANT),
      );
    }
  });

  it("refuses the variable on production with an error that names it", () => {
    const attempt = () => frozenInstant({ TIDEFERN_FAKE_NOW: INSTANT, VERCEL_ENV: "production" });
    expect(attempt).toThrow(ClockConfigurationError);
    expect(attempt).toThrow(/TIDEFERN_FAKE_NOW must not be set when VERCEL_ENV is production/);
  });

  it("refuses a value that names no instant instead of falling back to the real clock", () => {
    for (const value of ["yesterday", "2026-13-45", "the day after tomorrow"]) {
      const attempt = () => frozenInstant({ TIDEFERN_FAKE_NOW: value });
      expect(attempt).toThrow(ClockConfigurationError);
      expect(attempt).toThrow(/TIDEFERN_FAKE_NOW is not an ISO 8601 instant/);
    }
  });
});

describe("calendarClock", () => {
  it("answers the frozen instant for any moment and says it is frozen", () => {
    const clock = calendarClock({ TIDEFERN_FAKE_NOW: INSTANT });
    expect(clock.frozenAt).toBe("2026-10-05T03:30:00.000Z");
    expect(clock.now()).toEqual(new Date(INSTANT));
    expect(clock.now(new Date("2031-01-01T00:00:00Z"))).toEqual(new Date(INSTANT));
  });

  it("hands out copies, so no caller can move the frozen instant", () => {
    const clock = calendarClock({ TIDEFERN_FAKE_NOW: INSTANT });
    clock.now().setUTCFullYear(1999);
    expect(clock.now()).toEqual(new Date(INSTANT));
    expect(Object.isFrozen(clock)).toBe(true);
  });

  it("reads each zone's own day from the frozen instant", () => {
    // Midnight UTC on 5 October is 02:00 in Berlin and 17:00 on 4 October in
    // Vancouver: the seed counts Noor's today as the 5th and Mira's as the 4th.
    const clock = calendarClock({ TIDEFERN_FAKE_NOW: "2026-10-05" });
    expect(clock.today("Europe/Berlin")).toBe("2026-10-05");
    expect(clock.today("America/Vancouver")).toBe("2026-10-04");
    expect(clock.today("Pacific/Auckland", new Date("2031-01-01T00:00:00Z"))).toBe("2026-10-05");
  });

  it("is the real clock when unfrozen: the moment it is given, or now", () => {
    const real = new Date("2026-10-06T22:30:00Z");
    expect(realCalendarClock.frozenAt).toBeNull();
    expect(realCalendarClock.now(real)).toBe(real);
    expect(realCalendarClock.today("Europe/Berlin", real)).toBe("2026-10-07");
    const before = Date.now();
    const now = realCalendarClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(calendarClock({}).today("UTC")).toBe(todayIn("UTC", new Date()));
  });

  it("refuses on production when it is built, before any day is read", () => {
    expect(() =>
      calendarClock({ TIDEFERN_FAKE_NOW: "2026-10-05", VERCEL_ENV: "production" }),
    ).toThrow(ClockConfigurationError);
  });
});
