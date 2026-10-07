import {
  LUTEAL_PHASE_DAYS,
  MAX_PLAUSIBLE,
  MIN_PLAUSIBLE,
  OVULATION_BAND_DAYS,
} from "@tidefern/core";
import { describe, expect, it } from "vitest";
import { estimateExplanationPlaceholder, feedingLinePlaceholder, todayCopy } from "./copy";

/** Every string in the module, with each template called on a sample. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const template = value as (...args: unknown[]) => unknown;
    // Templates take names, dates or numbers, and the log summary a list of parts.
    return strings(
      template.length === 1 && template.name === "logged"
        ? template(["Sample"])
        : template("Sample", "Sample"),
    );
  }
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const HEALTH_WORDS = ["period", "cycle", "pregnan", "fertile", "ovulation", "child", "symptom"];

describe("todayCopy", () => {
  it("carries no em dash anywhere", () => {
    const all = [...strings(todayCopy), estimateExplanationPlaceholder(), feedingLinePlaceholder];
    for (const text of all) expect(text, text).not.toContain(String.fromCharCode(0x2014));
  });

  it("keeps health words out of the title and the description, which travel in metadata", () => {
    for (const text of [todayCopy.title, todayCopy.description]) {
      for (const word of HEALTH_WORDS) expect(text.toLowerCase(), text).not.toContain(word);
    }
  });

  it("uses CONTENT.md's empty and quiet cards word for word", () => {
    expect(todayCopy.empty).toEqual({
      heading: "Nothing logged yet",
      why: "Log your last period start and Tidefern can place you in your cycle.",
      action: "Log a period",
    });
    expect(todayCopy.quiet).toEqual({
      heading: "When you are ready",
      why: "Predictions are paused until a period is logged.",
      action: "Log a period when it comes",
    });
    expect(todayCopy.partners.empty).toEqual({
      heading: "You are the only one who can see this",
      why: "Invite a partner and choose exactly what they see, category by category.",
      action: "Invite a partner",
    });
  });

  it("says what to do next in every failure", () => {
    const failures = [
      todayCopy.cycleFailed,
      todayCopy.childFailed,
      todayCopy.weekFailed,
      todayCopy.partners.failed,
      todayCopy.shared.failed("Noor"),
      todayCopy.shared.childrenFailed,
    ];
    for (const text of failures) expect(text).toMatch(/Reload the page to try again\.$/);
  });
});

describe("the owner placeholders", () => {
  it("names the estimate's numbers from packages/core, so the placeholder cannot drift", () => {
    const text = estimateExplanationPlaceholder();
    expect(text).toContain(`${MIN_PLAUSIBLE} to ${MAX_PLAUSIBLE} days`);
    expect(text).toContain(`${LUTEAL_PHASE_DAYS} days before the next period`);
    expect(text).toContain(`plus or minus ${OVULATION_BAND_DAYS} days`);
    expect(text).toContain(
      "plus or minus 4 days for a first guess or one cycle, 3 after two cycles, 2 after three or more, and 5 when",
    );
  });

  it("names the feeding line the owner writes (architecture 8.4)", () => {
    expect(feedingLinePlaceholder).toContain("architecture 8.4");
  });
});
