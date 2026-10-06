import { describe, expect, it } from "vitest";

import {
  ChildEventInput,
  ChildEventListQuery,
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

describe("client-minted ids", () => {
  it("accept a UUIDv7 and refuse a v4 on every create input", () => {
    const child = { displayName: "Mo", dateOfBirth: "2026-01-01" };
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
    expect(ChildInput.safeParse({ displayName: "Mo", dateOfBirth: "2026-02-28" }).success).toBe(
      true,
    );
    const bad = ChildInput.safeParse({ displayName: "Mo", dateOfBirth: "2026-02-31" });
    expect(bad.success).toBe(false);
    expect(paths(bad)).toEqual(["dateOfBirth"]);
  });

  it("trims the display name and refuses an empty one", () => {
    expect(ChildInput.parse({ displayName: "  Mo ", dateOfBirth: "2026-01-01" }).displayName).toBe(
      "Mo",
    );
    expect(ChildInput.safeParse({ displayName: "   ", dateOfBirth: "2026-01-01" }).success).toBe(
      false,
    );
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
});
