import { describe, expect, it } from "vitest";
import { RANGES_ATTRIBUTION_PLACEHOLDER, rangePlaceholder, rangesFor } from "./ranges";

describe("rangesFor", () => {
  it("gives a newborn the feed and wet diaper ranges and no sleep range", () => {
    expect(rangesFor("2026-09-24", "2026-10-04")).toEqual({
      feed: { id: "feed-newborn", publisher: "American Academy of Pediatrics" },
      wetDiaper: { id: "wet-diaper-after-first-days", publisher: "American Academy of Pediatrics" },
    });
    expect(rangesFor("2026-10-01", "2026-10-04").wetDiaper?.id).toBe("wet-diaper-first-days");
  });

  it("gives the seeded Ilo, past a month and under four, no range at all", () => {
    expect(rangesFor("2026-08-23", "2026-10-04")).toEqual({});
  });

  it("starts the sleep range at four months and gives Sol the 1 to 2 year one", () => {
    expect(rangesFor("2026-06-04", "2026-10-03").sleep).toBeUndefined();
    expect(rangesFor("2026-06-04", "2026-10-04").sleep).toEqual({
      id: "sleep-4-to-12-months",
      publisher: "American Academy of Sleep Medicine",
    });
    expect(rangesFor("2024-04-04", "2026-10-04")).toEqual({
      sleep: { id: "sleep-1-to-2-years", publisher: "American Academy of Sleep Medicine" },
    });
  });

  it("gives nothing for a birth still ahead in the viewer's zone or a date that is not one", () => {
    expect(rangesFor("2026-10-05", "2026-10-04")).toEqual({});
    expect(rangesFor("someday", "2026-10-04")).toEqual({});
  });
});

describe("placeholders", () => {
  it("mark the line and the attribution for the owner, and state no figure", () => {
    const line = rangePlaceholder({
      id: "feed-newborn",
      publisher: "American Academy of Pediatrics",
    });
    expect(line).toBe(
      "[OWNER] range line feed-newborn, with its source line (American Academy of Pediatrics)",
    );
    expect(line).not.toMatch(/\d/);
    expect(RANGES_ATTRIBUTION_PLACEHOLDER).toMatch(/^\[OWNER\] /);
  });
});
