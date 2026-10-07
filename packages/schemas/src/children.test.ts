import { describe, expect, it } from "vitest";

import {
  ChildEvent,
  ChildEventInput,
  ChildEventListQuery,
  ChildEventUpdate,
  ChildInput,
  ChildMeasurementInput,
  DatedListQuery,
  MilestoneCheckInput,
} from "./children";

function paths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

/** A well-formed UUID of version 4, which a client-minted id must not be. */
const V4_ID = "9b2f6c1e-4d3a-4f8b-9c2d-1e5f7a3b6c8d";
const V7_ID = "018f5e7a-3000-7000-8000-00000000f001";

/**
 * Task E12 made the guardian's consent part of every child create body, so
 * the ChildInput cases below carry it; the cases about the consent itself
 * are in their own test.
 */
const CONSENT = { given: true, textVersion: "2026-10" } as const;

describe("client-minted ids", () => {
  it("accept a UUIDv7 and refuse a v4 on every create input", () => {
    const child = { displayName: "Mo", dateOfBirth: "2026-01-01", guardianConsent: CONSENT };
    const event = { kind: "diaper", date: "2026-01-02" };
    const measurement = { date: "2026-01-02", weightGrams: 4000 };
    expect(ChildInput.safeParse({ ...child, id: V7_ID }).success).toBe(true);
    expect(ChildEventInput.safeParse({ ...event, id: V7_ID }).success).toBe(true);
    expect(ChildMeasurementInput.safeParse({ ...measurement, id: V7_ID }).success).toBe(true);
    expect(paths(ChildInput.safeParse({ ...child, id: V4_ID }))).toEqual(["id"]);
    expect(paths(ChildEventInput.safeParse({ ...event, id: V4_ID }))).toEqual(["id"]);
    expect(paths(ChildMeasurementInput.safeParse({ ...measurement, id: V4_ID }))).toEqual(["id"]);
  });
});

describe("ChildInput", () => {
  it("accepts a real date of birth and refuses one that does not exist", () => {
    expect(
      ChildInput.safeParse({
        displayName: "Mo",
        dateOfBirth: "2026-02-28",
        guardianConsent: CONSENT,
      }).success,
    ).toBe(true);
    const bad = ChildInput.safeParse({
      displayName: "Mo",
      dateOfBirth: "2026-02-31",
      guardianConsent: CONSENT,
    });
    expect(bad.success).toBe(false);
    expect(paths(bad)).toEqual(["dateOfBirth"]);
  });

  it("trims the display name and refuses an empty one", () => {
    expect(
      ChildInput.parse({
        displayName: "  Mo ",
        dateOfBirth: "2026-01-01",
        guardianConsent: CONSENT,
      }).displayName,
    ).toBe("Mo");
    expect(
      ChildInput.safeParse({
        displayName: "   ",
        dateOfBirth: "2026-01-01",
        guardianConsent: CONSENT,
      }).success,
    ).toBe(false);
  });

  it("needs the guardian's consent, given, on a version of the text the catalog holds", () => {
    const child = { displayName: "Mo", dateOfBirth: "2026-01-01" };
    expect(ChildInput.parse({ ...child, guardianConsent: CONSENT }).guardianConsent).toEqual(
      CONSENT,
    );
    expect(paths(ChildInput.safeParse(child))).toEqual(["guardianConsent"]);
    expect(
      paths(ChildInput.safeParse({ ...child, guardianConsent: { ...CONSENT, given: false } })),
    ).toEqual(["guardianConsent.given"]);
    expect(
      paths(ChildInput.safeParse({ ...child, guardianConsent: { textVersion: "2026-10" } })),
    ).toEqual(["guardianConsent.given"]);
    expect(
      paths(
        ChildInput.safeParse({ ...child, guardianConsent: { ...CONSENT, textVersion: "2026-11" } }),
      ),
    ).toEqual(["guardianConsent.textVersion"]);
    // No sentence travels from the client: prose in place of a version is refused.
    expect(
      paths(
        ChildInput.safeParse({
          ...child,
          guardianConsent: { ...CONSENT, textVersion: "I agree to everything" },
        }),
      ),
    ).toEqual(["guardianConsent.textVersion"]);
  });
});

describe("ChildEventInput", () => {
  it("accepts a feed with a span and a volume, and a milestone naming its item", () => {
    expect(
      ChildEventInput.safeParse({
        kind: "feed",
        date: "2026-10-01",
        startedAt: "2026-10-01T06:00:00.000Z",
        endedAt: "2026-10-01T06:20:00.000Z",
        quantityMl: 120,
      }).success,
    ).toBe(true);
    expect(
      ChildEventInput.safeParse({
        kind: "milestone",
        date: "2026-10-01",
        milestoneId: "2m-social-1",
      }).success,
    ).toBe(true);
  });

  it("names the field each rule breaks", () => {
    const cases: [unknown, string][] = [
      [{ kind: "milestone", date: "2026-10-01" }, "milestoneId"],
      [{ kind: "feed", date: "2026-10-01", milestoneId: "2m-social-1" }, "milestoneId"],
      [{ kind: "sleep", date: "2026-10-01" }, "startedAt"],
      [{ kind: "diaper", date: "2026-10-01", quantityMl: 10 }, "quantityMl"],
      [{ kind: "diaper", date: "2026-10-01", endedAt: "2026-10-01T06:00:00.000Z" }, "endedAt"],
      [
        {
          kind: "sleep",
          date: "2026-10-01",
          startedAt: "2026-10-01T06:00:00.000Z",
          endedAt: "2026-10-01T05:00:00.000Z",
        },
        "endedAt",
      ],
    ];
    for (const [body, path] of cases) {
      expect(paths(ChildEventInput.safeParse(body))).toContain(path);
    }
  });

  it("takes a feed's method with what each method carries, and a diaper's contents", () => {
    const feed = { kind: "feed", date: "2026-10-01", startedAt: "2026-10-01T06:00:00.000Z" };
    for (const body of [
      { ...feed, feedMethod: "breast", side: "left", endedAt: "2026-10-01T06:15:00.000Z" },
      { ...feed, feedMethod: "breast" },
      { ...feed, feedMethod: "bottle", quantityMl: 90 },
      { ...feed, feedMethod: "bottle" },
      { ...feed, feedMethod: "solids" },
      // A feed without a method keeps the rules feeds had before it: a side, a volume, or both.
      { ...feed, side: "right", quantityMl: 60 },
      { kind: "diaper", date: "2026-10-01", diaperContents: "wet" },
      { kind: "diaper", date: "2026-10-01", diaperContents: "dirty" },
      { kind: "diaper", date: "2026-10-01", diaperContents: "mixed" },
      { kind: "diaper", date: "2026-10-01" },
    ]) {
      expect(ChildEventInput.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }
    expect(ChildEventUpdate.safeParse({ ...feed, feedMethod: "solids" }).success).toBe(true);
  });

  it("names the field each method and contents rule breaks, on create and on replace", () => {
    const feed = { kind: "feed", date: "2026-10-01" };
    const cases: [unknown, string[]][] = [
      [
        {
          kind: "sleep",
          date: "2026-10-01",
          startedAt: "2026-10-01T20:00:00.000Z",
          feedMethod: "breast",
        },
        ["feedMethod"],
      ],
      [{ kind: "diaper", date: "2026-10-01", feedMethod: "bottle" }, ["feedMethod"]],
      [
        { kind: "milestone", date: "2026-10-01", milestoneId: "2m-social-1", feedMethod: "solids" },
        ["feedMethod"],
      ],
      [{ ...feed, diaperContents: "wet" }, ["diaperContents"]],
      [
        {
          kind: "sleep",
          date: "2026-10-01",
          startedAt: "2026-10-01T20:00:00.000Z",
          diaperContents: "mixed",
        },
        ["diaperContents"],
      ],
      [{ ...feed, feedMethod: "bottle", side: "left" }, ["side"]],
      [{ ...feed, feedMethod: "solids", side: "both" }, ["side"]],
      [{ ...feed, feedMethod: "breast", quantityMl: 60 }, ["quantityMl"]],
      [{ ...feed, feedMethod: "solids", quantityMl: 30 }, ["quantityMl"]],
      [{ ...feed, feedMethod: "solids", side: "left", quantityMl: 30 }, ["side", "quantityMl"]],
      [{ ...feed, feedMethod: "formula" }, ["feedMethod"]],
      [{ kind: "diaper", date: "2026-10-01", diaperContents: "leaked" }, ["diaperContents"]],
    ];
    for (const [body, expected] of cases) {
      expect(paths(ChildEventInput.safeParse(body)), JSON.stringify(body)).toEqual(expected);
      expect(paths(ChildEventUpdate.safeParse(body)), JSON.stringify(body)).toEqual(expected);
    }
  });
});

describe("ChildEvent", () => {
  it("always answers a feed's method and a diaper's contents, null when there is none", () => {
    const event = {
      id: V7_ID,
      childId: V7_ID,
      kind: "feed",
      date: "2026-10-01",
      startedAt: "2026-10-01T06:00:00.000Z",
      endedAt: null,
      milestoneId: null,
      quantityMl: 90,
      side: null,
      feedMethod: "bottle",
      diaperContents: null,
      note: null,
      authorId: null,
      createdAt: "2026-10-01T06:05:00.000Z",
      updatedAt: "2026-10-01T06:05:00.000Z",
      version: 1,
      deletedAt: null,
    };
    expect(ChildEvent.parse(event)).toEqual(event);
    const withoutMethod: Record<string, unknown> = { ...event };
    delete withoutMethod.feedMethod;
    expect(paths(ChildEvent.safeParse(withoutMethod))).toEqual(["feedMethod"]);
    const withoutContents: Record<string, unknown> = { ...event };
    delete withoutContents.diaperContents;
    expect(paths(ChildEvent.safeParse(withoutContents))).toEqual(["diaperContents"]);
  });
});

describe("ChildMeasurementInput", () => {
  it("needs at least one value", () => {
    expect(paths(ChildMeasurementInput.safeParse({ date: "2026-10-01" }))).toEqual(["weightGrams"]);
    expect(ChildMeasurementInput.safeParse({ date: "2026-10-01", weightGrams: 3400 }).success).toBe(
      true,
    );
  });
});

describe("MilestoneCheckInput", () => {
  it("takes a checklist item key and nothing else", () => {
    expect(MilestoneCheckInput.safeParse({ itemId: "12m-language-2", checked: true }).success).toBe(
      true,
    );
    expect(MilestoneCheckInput.safeParse({ itemId: "walks early", checked: true }).success).toBe(
      false,
    );
  });
});

describe("the list queries", () => {
  it("defaults the limit to 50 and keeps it within 1 to 200", () => {
    expect(DatedListQuery.parse({}).limit).toBe(50);
    expect(DatedListQuery.parse({ limit: "200" }).limit).toBe(200);
    expect(DatedListQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(DatedListQuery.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("filters events by a kind from the vocabulary only", () => {
    expect(ChildEventListQuery.parse({ kind: "sleep" }).kind).toBe("sleep");
    expect(ChildEventListQuery.safeParse({ kind: "bath" }).success).toBe(false);
  });

  it("reads events oldest first unless asked for newest first, and in no other order", () => {
    expect(ChildEventListQuery.parse({}).order).toBe("asc");
    expect(ChildEventListQuery.parse({ order: "desc", kind: "feed", limit: "1" })).toMatchObject({
      order: "desc",
      kind: "feed",
      limit: 1,
    });
    expect(ChildEventListQuery.safeParse({ order: "newest" }).success).toBe(false);
    expect(ChildEventListQuery.safeParse({ order: "DESC" }).success).toBe(false);
  });
});
