import { describe, expect, it } from "vitest";
import {
  CDC_MILESTONES_ATTRIBUTION,
  DAYS_PER_MONTH,
  MILESTONES_VERSION,
  NOT_A_SCREENING_TOOL,
  checklistFor,
  milestoneAges,
  milestoneChecklists,
  milestoneFraming,
} from "./milestones";

const DOMAINS = ["social", "language", "cognitive", "movement"];

describe("milestone data", () => {
  it("holds the 2022 revision: 12 ages and 159 items, none empty", () => {
    expect(MILESTONES_VERSION).toBe("2022");
    expect(milestoneChecklists).toHaveLength(12);
    const items = milestoneChecklists.flatMap((checklist) => checklist.items);
    expect(items).toHaveLength(159);
    for (const item of items) {
      expect(item.text.trim()).not.toBe("");
      expect(DOMAINS).toContain(item.domain);
    }
    expect(new Set(items.map((item) => item.id)).size).toBe(159);
  });
  it("lists CDC's twelve checklist ages youngest first with CDC's labels", () => {
    expect(milestoneAges.map((age) => age.months)).toEqual([
      2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60,
    ]);
    expect(milestoneAges.map((age) => age.label)).toEqual([
      "2 months",
      "4 months",
      "6 months",
      "9 months",
      "1 year",
      "15 months",
      "18 months",
      "2 years",
      "30 months",
      "3 years",
      "4 years",
      "5 years",
    ]);
  });
  it("carries the attribution and the permanent not-a-screening line", () => {
    expect(CDC_MILESTONES_ATTRIBUTION).toBe(
      "Source: CDC. Reference to CDC materials does not imply endorsement by CDC, HHS or the U.S. Government.",
    );
    expect(NOT_A_SCREENING_TOOL).toBe("This is not a screening tool; your pediatrician is.");
  });
});

describe("checklistFor", () => {
  it("offers nothing before two months and the latest list at or below the age", () => {
    expect(checklistFor(0)).toBeNull();
    expect(checklistFor(Math.ceil(2 * DAYS_PER_MONTH) - 1)).toBeNull();
    expect(checklistFor(Math.ceil(2 * DAYS_PER_MONTH))?.months).toBe(2);
    expect(checklistFor(100)?.months).toBe(2);
    expect(checklistFor(Math.ceil(9 * DAYS_PER_MONTH))?.months).toBe(9);
    expect(checklistFor(400)?.months).toBe(12);
    expect(checklistFor(6 * 365)?.months).toBe(60);
  });
  it("uses the corrected age instead of the chronological age when one is supplied", () => {
    const chronological = Math.ceil(9 * DAYS_PER_MONTH);
    const corrected = chronological - 8 * 7;
    expect(checklistFor(chronological)?.months).toBe(9);
    expect(checklistFor(chronological, { correctedAgeDays: corrected })?.months).toBe(6);
    expect(checklistFor(30, { correctedAgeDays: 0 })).toBeNull();
  });
});

describe("milestoneFraming", () => {
  it("returns the exact sentence with CDC's age label", () => {
    expect(milestoneFraming(2)).toBe("Most children do this by 2 months.");
    expect(milestoneFraming(12)).toBe("Most children do this by 1 year.");
    expect(milestoneFraming(30)).toBe("Most children do this by 30 months.");
    expect(milestoneFraming(60)).toBe("Most children do this by 5 years.");
  });
  it("rejects an age that has no checklist", () => {
    expect(() => milestoneFraming(7)).toThrow(RangeError);
  });
});
