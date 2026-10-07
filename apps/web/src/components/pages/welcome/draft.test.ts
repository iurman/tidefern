import { describe, expect, it } from "vitest";
import { DEFAULT_PERIOD_FLOW as DAY_SHEET_DEFAULT } from "@/lib/day-log";
import { welcomeCopy } from "./copy";
import type { DateEntry } from "./dates";
import { EMPTY_DATING } from "./dates";
import {
  DEFAULT_PERIOD_FLOW,
  EMPTY_DRAFT,
  checkAgreements,
  checkDates,
  checkStage,
  checkZone,
  dateMessage,
  displayNameFrom,
  type Draft,
} from "./draft";

const today = "2026-10-05";

function draft(patch: Partial<Draft>): Draft {
  return { ...EMPTY_DRAFT, timeZone: "Europe/Berlin", ...patch };
}

/** What each date field holds, as the step reads it from the inputs. */
function entries(map: Record<string, DateEntry>) {
  return (key: string): DateEntry => map[key] ?? "empty";
}

describe("the draft", () => {
  it("starts with nothing chosen and every box unticked", () => {
    expect(EMPTY_DRAFT.timeZone).toBe("");
    expect(EMPTY_DRAFT.stage).toBeNull();
    expect([
      EMPTY_DRAFT.consent,
      EMPTY_DRAFT.terms,
      EMPTY_DRAFT.adult,
      EMPTY_DRAFT.childConsent,
    ]).toEqual([false, false, false, false]);
  });

  it("chooses Medium for a period start, the same ruling as the day sheet's switch", () => {
    expect(DEFAULT_PERIOD_FLOW).toBe("medium");
    expect(DEFAULT_PERIOD_FLOW).toBe(DAY_SHEET_DEFAULT);
    expect(EMPTY_DRAFT.startFlow).toBe("medium");
    expect(EMPTY_DRAFT.sinceFlow).toBe("medium");
  });
});

describe("the zone and stage steps", () => {
  it("need a zone chosen from the list", () => {
    expect(checkZone(draft({ timeZone: "" }))).toEqual({
      ok: false,
      errors: { zone: welcomeCopy.zone.required },
    });
    expect(checkZone(draft({}))).toEqual({ ok: true, errors: {} });
  });

  it("need one of the four cards", () => {
    expect(checkStage(draft({})).errors).toEqual({ stage: welcomeCopy.stage.required });
    expect(checkStage(draft({ stage: "none" })).ok).toBe(true);
  });
});

describe("the dates step", () => {
  const dates = welcomeCopy.dates;

  it("lets the cycle's period start be skipped, but not half typed, and never in the future", () => {
    expect(checkDates(draft({ stage: "cycle" }), today, entries({}))).toEqual({
      ok: true,
      errors: {},
    });
    expect(
      checkDates(draft({ stage: "cycle" }), today, entries({ start: "partial" })).errors,
    ).toEqual({
      start: dates.partialOptional,
    });
    expect(
      checkDates(
        draft({ stage: "cycle", start: "2026-10-06" }),
        today,
        entries({ start: "complete" }),
      ).errors,
    ).toEqual({ start: dates.future });
    expect(
      checkDates(
        draft({ stage: "cycle", start: "2026-09-23" }),
        today,
        entries({ start: "complete" }),
      ),
    ).toEqual({ ok: true, errors: {} });
  });

  it("stops a date that does not exist without adding words: the input says it", () => {
    const checked = checkDates(
      draft({ stage: "cycle", start: null }),
      today,
      entries({ start: "complete" }),
    );
    expect(checked).toEqual({ ok: false, errors: {} });
  });

  it("hands over the pregnancy's dating input once it checks out", () => {
    const checked = checkDates(
      draft({
        stage: "pregnancy",
        dating: { ...EMPTY_DATING, method: "lmp", lastPeriodStart: "2026-07-27" },
      }),
      today,
      entries({ "dating.lastPeriodStart": "complete" }),
    );
    expect(checked).toEqual({
      ok: true,
      errors: {},
      dating: { method: "lmp", lastPeriodStart: "2026-07-27" },
    });
  });

  it("words each pregnancy problem under its own field", () => {
    expect(checkDates(draft({ stage: "pregnancy" }), today, entries({})).errors).toEqual({
      "dating.method": welcomeCopy.dating.methodRequired,
    });
    const scan = checkDates(
      draft({
        stage: "pregnancy",
        dating: { ...EMPTY_DATING, method: "ultrasound", weeks: "60", days: "" },
      }),
      today,
      entries({}),
    );
    expect(scan.errors).toEqual({
      "dating.scanDate": dates.required,
      "dating.weeks": welcomeCopy.dating.weeksRange,
      "dating.days": welcomeCopy.dating.daysRange,
    });
    const due = checkDates(
      draft({
        stage: "pregnancy",
        dating: { ...EMPTY_DATING, method: "manual", dueDate: "2028-01-01" },
      }),
      today,
      entries({ "dating.dueDate": "complete" }),
    );
    expect(due.errors).toEqual({
      "dating.dueDate": "Enter a due date between Sep 21, 2026 and Jul 12, 2027.",
    });
  });

  it("asks postpartum for the baby's name, the birth date and the guardian's box", () => {
    expect(checkDates(draft({ stage: "postpartum" }), today, entries({})).errors).toEqual({
      childName: dates.childNameRequired,
      birth: dates.required,
      childConsent: dates.childConsentRequired,
    });
    expect(
      checkDates(
        draft({ stage: "postpartum", childName: " Ilo ", birth: "2026-08-20", childConsent: true }),
        today,
        entries({ birth: "complete" }),
      ),
    ).toEqual({ ok: true, errors: {} });
  });

  it("puts the period since after the birth", () => {
    const checked = checkDates(
      draft({
        stage: "postpartum",
        childName: "Ilo",
        birth: "2026-08-20",
        childConsent: true,
        since: "2026-08-19",
      }),
      today,
      entries({ birth: "complete", since: "complete" }),
    );
    expect(checked.errors).toEqual({ since: dates.beforeBirth });
  });

  it("asks nothing of here for someone else", () => {
    expect(checkDates(draft({ stage: "none" }), today, entries({}))).toEqual({
      ok: true,
      errors: {},
    });
  });
});

describe("the agreement step", () => {
  const consent = welcomeCopy.consent;

  it("needs the consent, the terms and the age, each ticked on its own", () => {
    expect(checkAgreements(draft({}), true).errors).toEqual({
      consent: consent.required,
      terms: consent.termsRequired,
      adult: consent.adultRequired,
    });
    expect(checkAgreements(draft({ consent: true, terms: true }), true).errors).toEqual({
      adult: consent.adultRequired,
    });
    expect(checkAgreements(draft({ consent: true, terms: true, adult: true }), true).ok).toBe(true);
  });

  it("asks no consent where nothing about her body is collected, and still the terms and the age", () => {
    expect(checkAgreements(draft({}), false).errors).toEqual({
      terms: consent.termsRequired,
      adult: consent.adultRequired,
    });
    expect(checkAgreements(draft({ terms: true, adult: true }), false).ok).toBe(true);
  });
});

describe("words and names", () => {
  it("words every date problem but the one the input words itself", () => {
    expect(dateMessage({ kind: "invalid" })).toBeUndefined();
    expect(dateMessage({ kind: "tooLongAgo" })).toBe(welcomeCopy.dates.tooLongAgo);
    expect(dateMessage({ kind: "partial", optional: false })).toBe(welcomeCopy.dates.partial);
  });

  it("takes the sign-up name for the profile, trimmed to the 80 characters it holds", () => {
    expect(displayNameFrom("  Sam  ")).toBe("Sam");
    expect(displayNameFrom("   ")).toBeNull();
    expect(displayNameFrom(undefined)).toBeNull();
    expect(displayNameFrom("a".repeat(100))).toHaveLength(80);
  });
});
