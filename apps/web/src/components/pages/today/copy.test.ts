import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LUTEAL_PHASE_DAYS,
  MAX_PLAUSIBLE,
  MIN_PLAUSIBLE,
  OVULATION_BAND_DAYS,
  uncertaintyFor,
} from "@tidefern/core";
import { describe, expect, it } from "vitest";
import { estimatePlaceholder, feedingLinePlaceholder, todayCopy } from "./copy";

const repository = resolve(__dirname, "../../../../../..");

/** CONTENT.md's `/today` (H2) subsection, with its line breaks folded to spaces. */
function todaySubsection(): string {
  const content = readFileSync(resolve(repository, "docs/design/CONTENT.md"), "utf8");
  const start = content.indexOf("### `/today` (H2)");
  const end = content.indexOf("\n### ", start + 1);
  expect(start, "CONTENT.md has a /today (H2) subsection").toBeGreaterThan(-1);
  return content.slice(start, end === -1 ? undefined : end).replace(/\s+/g, " ");
}

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
    const all = [...strings(todayCopy), estimatePlaceholder, feedingLinePlaceholder];
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
      todayCopy.shared.failed(null),
      todayCopy.shared.nameFailed,
      todayCopy.shared.childrenFailed,
    ];
    for (const text of failures) expect(text).toMatch(/Reload the page to try again\.$/);
  });
});

describe("the owner placeholders", () => {
  it("name only what is missing, never a source file, a package or a section number", () => {
    for (const text of [estimatePlaceholder, feedingLinePlaceholder]) {
      expect(text, text).not.toMatch(/packages\/|architecture|\d/);
    }
    expect(estimatePlaceholder).toBe("the explanation of the estimate");
    expect(feedingLinePlaceholder).toBe("the line about cycles while feeding");
  });

  it("CONTENT.md lists the numbers the estimate text must state, as packages/core has them", () => {
    const text = todaySubsection();
    expect(text).toContain(`"${estimatePlaceholder}"`);
    expect(text).toContain(`"${feedingLinePlaceholder}"`);
    expect(text).toContain(`only cycles of ${MIN_PLAUSIBLE} to ${MAX_PLAUSIBLE} days count`);
    expect(text).toContain(
      `ovulation sits ${LUTEAL_PHASE_DAYS} days before the next period as a band of plus or minus ${OVULATION_BAND_DAYS} days`,
    );
    expect(text).toContain(
      `the range is plus or minus ${uncertaintyFor(1, false)} days for a first guess or one cycle, ` +
        `${uncertaintyFor(2, false)} after two, ${uncertaintyFor(3, false)} after three or more, ` +
        `${uncertaintyFor(3, true)} when cycles vary`,
    );
  });
});
