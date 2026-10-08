import { describe, expect, it } from "vitest";
import {
  childAge,
  formatClock,
  formatDuration,
  formatElapsed,
  formatTimeSince,
  formatVolume,
  minutesBetween,
} from "./format";

/** Assertions read with plain spaces; the module joins numbers and units with no-break spaces. */
const plain = (text: string) => text.replace(/\u00a0/g, " ");

describe("formatTimeSince", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");

  it("says minutes under an hour, hours under a day, then days", () => {
    expect(formatTimeSince("2026-10-05T11:59:30.000Z", now)).toBe("just now");
    expect(plain(formatTimeSince("2026-10-05T11:55:00.000Z", now))).toBe("5 min ago");
    expect(plain(formatTimeSince("2026-10-05T11:00:01.000Z", now))).toBe("59 min ago");
    expect(plain(formatTimeSince("2026-10-05T11:00:00.000Z", now))).toBe("1 h ago");
    expect(plain(formatTimeSince("2026-10-05T09:07:00.000Z", now))).toBe("2 h ago");
    expect(formatTimeSince("2026-10-04T12:00:00.000Z", now)).toBe("1 day ago");
    expect(formatTimeSince("2026-10-02T11:00:00.000Z", now)).toBe("3 days ago");
  });

  it("reads an instant ahead of now as just now, and refuses a non-instant", () => {
    expect(formatTimeSince("2026-10-05T12:10:00.000Z", now)).toBe("just now");
    expect(() => formatTimeSince("yesterday", now)).toThrow(TypeError);
  });
});

describe("formatClock", () => {
  it("prints the time of day in the profile's zone, not the machine's", () => {
    const instant = "2026-10-04T22:00:00.000Z";
    expect(plain(formatClock(instant, "America/Vancouver"))).toBe("3:00 PM");
    expect(plain(formatClock(instant, "America/New_York"))).toBe("6:00 PM");
    expect(plain(formatClock(instant, "Europe/Berlin"))).toBe("12:00 AM");
    expect(formatClock(instant, "America/Vancouver")).not.toMatch(/[ \u202f]/);
  });
});

describe("durations", () => {
  it("counts whole minutes between two instants and never goes negative", () => {
    expect(minutesBetween("2026-10-04T15:00:00.000Z", "2026-10-04T21:00:00.000Z")).toBe(360);
    expect(minutesBetween("2026-10-04T15:00:00.000Z", "2026-10-04T15:12:29.000Z")).toBe(12);
    expect(minutesBetween("2026-10-04T15:00:00.000Z", "2026-10-04T14:00:00.000Z")).toBe(0);
  });

  it("says minutes, whole hours, or hours and minutes", () => {
    expect(plain(formatDuration(0))).toBe("0 min");
    expect(plain(formatDuration(45))).toBe("45 min");
    expect(plain(formatDuration(120))).toBe("2 h");
    expect(plain(formatDuration(270))).toBe("4 h 30 min");
  });

  it("draws a running timer as minutes and seconds, with hours once it passes one", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(312_400)).toBe("05:12");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("00:00");
  });
});

describe("formatVolume", () => {
  it("shows millilitres to the nearest 10 ml", () => {
    expect(plain(formatVolume(90, "metric"))).toBe("90 ml");
    expect(plain(formatVolume(94, "metric"))).toBe("90 ml");
    expect(plain(formatVolume(95, "metric"))).toBe("100 ml");
    expect(plain(formatVolume(118, "metric"))).toBe("120 ml");
    expect(plain(formatVolume(4, "metric"))).toBe("under 10 ml");
  });

  it("shows fluid ounces to the nearest half ounce", () => {
    // 90 ml is 3.04 fl oz, 105 ml 3.55, 118 ml 3.99, 120 ml 4.06.
    expect(plain(formatVolume(90, "imperial"))).toBe("3 fl oz");
    expect(plain(formatVolume(105, "imperial"))).toBe("3.5 fl oz");
    expect(plain(formatVolume(118, "imperial"))).toBe("4 fl oz");
    expect(plain(formatVolume(120, "imperial"))).toBe("4 fl oz");
    expect(plain(formatVolume(5, "imperial"))).toBe("under 0.5 fl oz");
  });
});

describe("childAge", () => {
  it("uses the one age wording", () => {
    expect(childAge("2026-08-23", "2026-10-04")).toBe("6 weeks");
    expect(childAge("2024-04-04", "2026-10-04")).toBe("2 years, 6 months");
    expect(childAge("2026-10-04", "2026-10-04")).toBe("Born today");
  });

  it("reads a birth still tomorrow in the viewer's zone as born today", () => {
    expect(childAge("2026-10-05", "2026-10-04")).toBe("Born today");
  });
});
