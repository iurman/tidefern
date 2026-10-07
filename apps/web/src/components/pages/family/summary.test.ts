import { describe, expect, it } from "vitest";
import { event } from "./fixtures";
import { eventMoment, isOngoingSleep, summarizeDay } from "./summary";

const plain = (text: string | null) => text?.replace(/\u00a0/g, " ") ?? null;
const now = new Date("2026-10-05T00:00:00.000Z");
const base = { today: "2026-10-04", timeZone: "America/Vancouver", now };

describe("eventMoment", () => {
  it("reads the start, or when the event was logged", () => {
    expect(eventMoment(event({ startedAt: "2026-10-04T02:00:00.000Z" }))).toBe(
      "2026-10-04T02:00:00.000Z",
    );
    expect(eventMoment(event({ createdAt: "2026-10-04T22:00:00.000Z" }))).toBe(
      "2026-10-04T22:00:00.000Z",
    );
  });
});

describe("summarizeDay", () => {
  it("gives the time since each last event and today's counts, as the seeded Ilo has them", () => {
    const sleep = event({
      kind: "sleep",
      startedAt: "2026-10-04T15:00:00.000Z",
      endedAt: "2026-10-04T21:00:00.000Z",
    });
    const diaper = event({
      kind: "diaper",
      diaperContents: "mixed",
      startedAt: "2026-10-04T22:00:00.000Z",
    });
    const feed = event({
      kind: "feed",
      feedMethod: "breast",
      date: "2026-10-03",
      startedAt: "2026-10-04T02:00:00.000Z",
    });
    const summary = summarizeDay({
      ...base,
      last: { feed, sleep, diaper },
      todayEvents: [sleep, diaper],
    });
    expect(plain(summary.feed.lastSince)).toBe("22 h ago");
    expect(summary.feed.today).toBe(0);
    expect(plain(summary.sleep.lastSince)).toBe("3 h ago");
    expect(summary.sleep.ongoingSince).toBeNull();
    expect(summary.sleep.todayMinutes).toBe(360);
    expect(summary.sleep.todayCount).toBe(1);
    expect(plain(summary.diaper.lastSince)).toBe("2 h ago");
    expect(summary.diaper).toMatchObject({ today: 1, wet: 1, dirty: 1, known: true });
  });

  it("counts a mixed diaper as wet and dirty, and hides the split when nothing says", () => {
    const diapers = [
      event({ kind: "diaper", diaperContents: "wet" }),
      event({ kind: "diaper", diaperContents: "wet" }),
      event({ kind: "diaper", diaperContents: "dirty" }),
      event({ kind: "diaper", diaperContents: "mixed" }),
      event({ kind: "diaper" }),
    ];
    const summary = summarizeDay({
      ...base,
      last: { feed: null, sleep: null, diaper: diapers[4] ?? null },
      todayEvents: diapers,
    });
    expect(summary.diaper).toMatchObject({ today: 5, wet: 3, dirty: 2, known: true });
    const unknown = summarizeDay({
      ...base,
      last: { feed: null, sleep: null, diaper: null },
      todayEvents: [event({ kind: "diaper" })],
    });
    expect(unknown.diaper).toMatchObject({ today: 1, wet: 0, dirty: 0, known: false });
  });

  it("names a sleep going on now by its start instead of a time since, and leaves it out of today's total", () => {
    const asleep = event({ kind: "sleep", startedAt: "2026-10-04T21:15:00.000Z" });
    expect(isOngoingSleep(asleep)).toBe(true);
    const summary = summarizeDay({
      ...base,
      last: { feed: null, sleep: asleep, diaper: null },
      todayEvents: [asleep],
    });
    expect(plain(summary.sleep.ongoingSince)).toBe("2:15 PM");
    expect(summary.sleep.lastSince).toBeNull();
    expect(summary.sleep.todayMinutes).toBe(0);
    expect(summary.sleep.todayCount).toBe(0);
  });

  it("says nothing was logged when a kind has no event, and counts only today's", () => {
    const yesterday = event({ kind: "feed", date: "2026-10-03" });
    const summary = summarizeDay({
      ...base,
      last: { feed: yesterday, sleep: null, diaper: null },
      todayEvents: [yesterday, event({ kind: "feed" }), event({ kind: "feed" })],
    });
    expect(summary.feed.today).toBe(2);
    expect(summary.sleep.lastSince).toBeNull();
    expect(summary.diaper.lastSince).toBeNull();
    expect(summary.diaper.today).toBe(0);
  });
});
