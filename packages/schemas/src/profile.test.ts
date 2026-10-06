import { describe, expect, it } from "vitest";

import { ShareCategory, Stage } from "./index";
import {
  ConsentInput,
  ConsentWithdrawal,
  DataCategory,
  DataSummary,
  Profile,
  ProfileInput,
  TimeZone,
  isSupportedTimeZone,
} from "./profile";

const disclosure = {
  categories: [
    {
      category: "cycle.history",
      basis: "necessary",
      purpose: "Keep the dates you log so the calendar and the estimates work.",
    },
    {
      category: "journal.private",
      basis: "necessary",
      purpose: "Keep your notes, encrypted, so you can read them later.",
    },
  ],
  processors: ["Vercel", "Neon (Databricks, Inc.)", "Resend"],
  textVersion: "2026-10",
  termsVersion: "2026-10",
};

describe("TimeZone", () => {
  it("accepts a canonical IANA name the runtime supports", () => {
    expect(TimeZone.parse("Europe/Berlin")).toBe("Europe/Berlin");
    expect(TimeZone.parse("America/Vancouver")).toBe("America/Vancouver");
    expect(isSupportedTimeZone("Asia/Tokyo")).toBe(true);
  });

  it("accepts current IANA names and UTC that the runtime list spells differently or omits", () => {
    // Node's list carries Asia/Calcutta and Europe/Kiev and no UTC; a browser may send either spelling.
    for (const zone of ["Asia/Kolkata", "Asia/Calcutta", "Europe/Kyiv", "UTC", "Etc/UTC"]) {
      expect(TimeZone.safeParse(zone).success, zone).toBe(true);
    }
  });

  it("refuses an unknown name, an empty string and a UTC offset", () => {
    expect(TimeZone.safeParse("Mars/Olympus").success).toBe(false);
    expect(TimeZone.safeParse("").success).toBe(false);
    expect(TimeZone.safeParse("+02:00").success).toBe(false);
    expect(TimeZone.safeParse("-0500").success).toBe(false);
    expect(TimeZone.safeParse("Foo/Bar").success).toBe(false);
    expect(isSupportedTimeZone("not a zone")).toBe(false);
  });
});

describe("ProfileInput", () => {
  it("fills the display defaults and keeps the stage and time zone as given", () => {
    const parsed = ProfileInput.parse({ timeZone: "Europe/Berlin", stage: "cycle" });
    expect(parsed).toEqual({
      displayName: null,
      timeZone: "Europe/Berlin",
      stage: "cycle",
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
    });
  });

  it("refuses a week start outside 1 to 7, an empty display name and a false attestation", () => {
    const base = { timeZone: "Europe/Berlin", stage: "none" };
    expect(ProfileInput.safeParse({ ...base, weekStart: 0 }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...base, weekStart: 8 }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...base, displayName: "   " }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...base, ageAttested: false }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...base, ageAttested: true }).success).toBe(true);
  });

  it("speaks the same stages as the shared Stage enum", () => {
    expect(ProfileInput.shape.stage.options).toEqual(Stage.options);
    expect(Profile.shape.stage.options).toEqual(Stage.options);
  });
});

describe("DataCategory", () => {
  it("is every share category plus the private journal", () => {
    expect(DataCategory.options).toEqual([
      ...ShareCategory.options.slice(0, 3),
      "journal.private",
      ...ShareCategory.options.slice(3),
    ]);
    for (const category of ShareCategory.options) {
      expect(DataCategory.options).toContain(category);
    }
    expect(DataCategory.options).toHaveLength(ShareCategory.options.length + 1);
  });
});

describe("ConsentInput", () => {
  it("accepts the disclosure the page showed", () => {
    expect(ConsentInput.parse(disclosure)).toEqual(disclosure);
  });

  it("refuses an empty category list, a repeated category and no processors", () => {
    expect(ConsentInput.safeParse({ ...disclosure, categories: [] }).success).toBe(false);
    expect(
      ConsentInput.safeParse({
        ...disclosure,
        categories: [disclosure.categories[0], disclosure.categories[0]],
      }).success,
    ).toBe(false);
    expect(ConsentInput.safeParse({ ...disclosure, processors: [] }).success).toBe(false);
  });

  it("refuses a category outside the vocabulary and an empty purpose", () => {
    expect(
      ConsentInput.safeParse({
        ...disclosure,
        categories: [{ category: "everything", basis: "consent", purpose: "All of it." }],
      }).success,
    ).toBe(false);
    expect(
      ConsentInput.safeParse({
        ...disclosure,
        categories: [{ category: "cycle.history", basis: "consent", purpose: " " }],
      }).success,
    ).toBe(false);
  });
});

describe("the response shapes", () => {
  it("name the closure a withdrawal starts with its undo deadline", () => {
    const parsed = ConsentWithdrawal.parse({
      id: "018f5e7a-5000-7000-8000-000000000001",
      withdrawnAt: "2026-10-05T10:00:00.000Z",
      closure: {
        requestId: "018f5e7a-5000-7000-8000-000000000002",
        state: "requested",
        undoUntil: "2026-10-12T10:00:00.000Z",
      },
    });
    expect(parsed.closure.state).toBe("requested");
  });

  it("hold counts, processors with a contact page and people with their grants", () => {
    const parsed = DataSummary.parse({
      categories: [{ category: "cycle.history", count: 3 }],
      processors: [
        {
          name: "Vercel",
          receives: "Runs the application",
          contact: "https://vercel.com/legal/dpa",
        },
      ],
      people: [
        {
          personId: "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20",
          displayName: "Ben",
          grants: [
            {
              id: "018f5e7a-2000-7000-8000-000000000001",
              category: "cycle.status",
              level: "summary",
              createdAt: "2026-10-01T08:00:00.000Z",
            },
          ],
        },
      ],
    });
    expect(parsed.people[0]?.grants[0]?.level).toBe("summary");
    expect(
      DataSummary.safeParse({
        categories: [{ category: "cycle.history", count: -1 }],
        processors: [],
        people: [],
      }).success,
    ).toBe(false);
  });
});
