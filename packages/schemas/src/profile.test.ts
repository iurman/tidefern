import { describe, expect, it } from "vitest";

import { ShareCategory, Stage } from "./index";
import {
  CHILD_CONSENT_DISCLOSURES,
  CONSENT_DISCLOSURES,
  ConsentInput,
  ConsentRecord,
  ConsentWithdrawal,
  DataCategory,
  DataSummary,
  GuardianConsentInput,
  IdempotentReplay,
  Profile,
  ProfileInput,
  TimeZone,
  childConsentTextVersions,
  consentTextVersions,
  isSupportedTimeZone,
} from "./profile";

const disclosure = {
  categories: ["cycle.history", "journal.private"],
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
  it("accepts the categories she agreed to with the text and terms versions", () => {
    expect(ConsentInput.parse(disclosure)).toEqual(disclosure);
  });

  it("refuses an empty category list, a repeated category and a category outside the vocabulary", () => {
    expect(ConsentInput.safeParse({ ...disclosure, categories: [] }).success).toBe(false);
    expect(
      ConsentInput.safeParse({ ...disclosure, categories: ["cycle.history", "cycle.history"] })
        .success,
    ).toBe(false);
    expect(ConsentInput.safeParse({ ...disclosure, categories: ["everything"] }).success).toBe(
      false,
    );
  });

  it("carries no sentence from the client: a purpose object, an unknown version or prose as a version is refused", () => {
    expect(
      ConsentInput.safeParse({
        ...disclosure,
        categories: [{ category: "cycle.history", basis: "consent", purpose: "All of it." }],
      }).success,
    ).toBe(false);
    expect(ConsentInput.safeParse({ ...disclosure, textVersion: "2026-11" }).success).toBe(false);
    expect(
      ConsentInput.safeParse({ ...disclosure, termsVersion: "I had a loss in May" }).success,
    ).toBe(false);
    expect(ConsentInput.safeParse({ ...disclosure, termsVersion: "2026-10.1" }).success).toBe(true);
  });
});

describe("CONSENT_DISCLOSURES", () => {
  it("has a sentence and a basis for every category in every version, and names processors", () => {
    expect(Object.keys(CONSENT_DISCLOSURES)).toEqual([...consentTextVersions]);
    for (const version of consentTextVersions) {
      const catalog = CONSENT_DISCLOSURES[version];
      expect(Object.keys(catalog.categories).sort()).toEqual([...DataCategory.options].sort());
      for (const item of Object.values(catalog.categories)) {
        expect(item.purpose.trim().length).toBeGreaterThan(0);
        expect(item.purpose.length).toBeLessThanOrEqual(500);
        expect(["necessary", "consent"]).toContain(item.basis);
      }
      expect(catalog.processors.length).toBeGreaterThan(0);
    }
  });
});

describe("the guardian's consent on a child's behalf", () => {
  it("has a child-category purpose, a basis and the full text for every version", () => {
    expect(Object.keys(CHILD_CONSENT_DISCLOSURES)).toEqual([...childConsentTextVersions]);
    for (const version of childConsentTextVersions) {
      const disclosure = CHILD_CONSENT_DISCLOSURES[version];
      expect(disclosure.category).toBe("child");
      expect(DataCategory.options).toContain(disclosure.category);
      expect(["necessary", "consent"]).toContain(disclosure.basis);
      expect(disclosure.purpose.trim().length).toBeGreaterThan(0);
      expect(disclosure.purpose.length).toBeLessThanOrEqual(500);
      // The form shows the text in full before the box; it names who consents for whom.
      expect(disclosure.text).toContain("On the child's behalf");
      expect(disclosure.text.length).toBeGreaterThan(disclosure.purpose.length);
    }
  });

  it("is collected as a box the guardian checked and the version of the text shown, no sentence", () => {
    const given = { given: true, textVersion: "2026-10" };
    expect(GuardianConsentInput.parse(given)).toEqual(given);
    expect(GuardianConsentInput.safeParse({ ...given, given: false }).success).toBe(false);
    expect(GuardianConsentInput.safeParse({ textVersion: "2026-10" }).success).toBe(false);
    expect(GuardianConsentInput.safeParse({ ...given, textVersion: "2026-11" }).success).toBe(
      false,
    );
    expect(GuardianConsentInput.safeParse({ given: true }).success).toBe(false);
    // An unknown key such as a purpose sentence is dropped, never carried to a row.
    expect(GuardianConsentInput.parse({ ...given, purpose: "Anything at all." })).toEqual(given);
  });
});

describe("the response shapes", () => {
  it("give the consent record its first row's id, which is what a replay answers", () => {
    const id = "018f5e7a-5000-7000-8000-000000000001";
    expect(
      ConsentRecord.safeParse({
        id,
        textHash: "a".repeat(64),
        textVersion: "2026-10",
        termsVersion: "2026-10",
        processors: ["Vercel"],
        items: [],
      }).success,
    ).toBe(true);
    expect(IdempotentReplay.parse({ id })).toEqual({ id });
    expect(IdempotentReplay.safeParse({ id: "latest" }).success).toBe(false);
  });

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
      disclosures: [],
    });
    expect(parsed.people[0]?.grants[0]?.level).toBe("summary");
    expect(
      DataSummary.safeParse({
        categories: [{ category: "cycle.history", count: -1 }],
        processors: [],
        people: [],
        disclosures: [],
      }).success,
    ).toBe(false);
    // The disclosure ledger is part of the answer even when it is empty.
    expect(DataSummary.safeParse({ categories: [], processors: [], people: [] }).success).toBe(
      false,
    );
  });
});
