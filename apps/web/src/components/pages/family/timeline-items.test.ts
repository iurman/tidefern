import { describe, expect, it } from "vitest";
import { event } from "./fixtures";
import { eventDetail, eventTitle, timelineItemsFrom } from "./timeline-items";

const plain = (text: string | undefined) => text?.replace(/\u00a0/g, " ");
const zone = "America/Vancouver";

describe("eventTitle", () => {
  it("names a feed by how it was given, its side and its volume in the profile's units", () => {
    expect(eventTitle(event({ kind: "feed", feedMethod: "breast", side: "left" }), "metric")).toBe(
      "Breast feed, left side",
    );
    expect(eventTitle(event({ kind: "feed", feedMethod: "breast" }), "metric")).toBe("Breast feed");
    expect(
      plain(eventTitle(event({ kind: "feed", feedMethod: "bottle", quantityMl: 90 }), "metric")),
    ).toBe("Bottle feed, 90 ml");
    expect(
      plain(eventTitle(event({ kind: "feed", feedMethod: "bottle", quantityMl: 90 }), "imperial")),
    ).toBe("Bottle feed, 3 fl oz");
    expect(eventTitle(event({ kind: "feed", feedMethod: "solids" }), "metric")).toBe("Solids");
    expect(eventTitle(event({ kind: "feed" }), "metric")).toBe("Feed");
    expect(eventTitle(event({ kind: "feed", side: "both" }), "metric")).toBe("Feed, both sides");
  });

  it("gives a sleep its length, or says it is going on", () => {
    expect(
      plain(
        eventTitle(
          event({
            kind: "sleep",
            startedAt: "2026-10-04T15:00:00.000Z",
            endedAt: "2026-10-04T21:00:00.000Z",
          }),
          "metric",
        ),
      ),
    ).toBe("Sleep, 6 h");
    expect(
      eventTitle(event({ kind: "sleep", startedAt: "2026-10-04T21:15:00.000Z" }), "metric"),
    ).toBe("Sleep, going on now");
  });

  it("says what a diaper held, a mixed one as wet and dirty", () => {
    expect(eventTitle(event({ kind: "diaper", diaperContents: "mixed" }), "metric")).toBe(
      "Diaper, wet and dirty",
    );
    expect(eventTitle(event({ kind: "diaper" }), "metric")).toBe("Diaper");
  });

  it("titles a milestone with CDC's wording from the vendored checklist", () => {
    expect(eventTitle(event({ kind: "milestone", milestoneId: "2m-social-1" }), "metric")).toBe(
      "Milestone: Calms down when spoken to or picked up",
    );
    expect(eventTitle(event({ kind: "milestone", milestoneId: "99m-social-9" }), "metric")).toBe(
      "Milestone",
    );
  });
});

describe("eventDetail", () => {
  it("times an event in the profile's zone and carries its note", () => {
    expect(
      plain(
        eventDetail(
          event({
            kind: "feed",
            startedAt: "2026-10-04T02:00:00.000Z",
            note: "Settled quickly after the feed.",
          }),
          zone,
        ),
      ),
    ).toBe("7:00 PM. Note: Settled quickly after the feed.");
    expect(
      plain(
        eventDetail(
          event({
            kind: "sleep",
            startedAt: "2026-10-04T06:00:00.000Z",
            endedAt: "2026-10-04T13:00:00.000Z",
          }),
          zone,
        ),
      ),
    ).toBe("11:00 PM to 6:00 AM");
    expect(
      plain(eventDetail(event({ kind: "sleep", startedAt: "2026-10-04T21:15:00.000Z" }), zone)),
    ).toBe("Since 2:15 PM");
    expect(
      plain(eventDetail(event({ kind: "diaper", createdAt: "2026-10-04T22:00:00.000Z" }), zone)),
    ).toBe("3:00 PM");
    expect(
      eventDetail(event({ kind: "milestone", milestoneId: "2m-social-1" }), zone),
    ).toBeUndefined();
  });
});

describe("timelineItemsFrom", () => {
  it("keeps the API's newest-first order and keys each row by the event id", () => {
    const newest = event({ kind: "diaper", date: "2026-10-04" });
    const older = event({ kind: "milestone", date: "2026-10-01", milestoneId: "2m-social-1" });
    const items = timelineItemsFrom([newest, older], { timeZone: zone, units: "metric" });
    expect(items.map((item) => item.key)).toEqual([newest.id, older.id]);
    expect(items[1]).toEqual({
      key: older.id,
      date: "2026-10-01",
      title: "Milestone: Calms down when spoken to or picked up",
    });
  });
});
