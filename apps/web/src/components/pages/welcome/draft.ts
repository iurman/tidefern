import type { PregnancyDatingInput, Stage } from "@tidefern/schemas";
import { formatCalendarDate } from "@/components/ui/format-date";
import { welcomeCopy } from "./copy";
import { checkPast, checkSince, datingFrom, EMPTY_DATING, readDate } from "./dates";
import type { DateEntry, DateProblem, DatingDateField, DatingDraft, DatingProblem } from "./dates";

/**
 * What she has entered, held in memory only (the brief's saving order:
 * nothing about her body reaches storage before she consents, and a reload
 * before the consent step starts again), with the checks each step runs
 * when she presses Continue. Pure: the step reads what each date field
 * holds and passes it in as `entry`.
 */

/** The flows that make a day a period day; the other two never start one. */
export type PeriodFlow = "light" | "medium" | "heavy";

export interface Draft {
  /** The IANA zone she chose; empty until she chooses one. */
  timeZone: string;
  stage: Stage | null;
  /** Cycle: the last period's first day, optional. */
  start: string | null;
  startFlow: PeriodFlow;
  /** Pregnancy: the dating form, method first. */
  dating: DatingDraft;
  /** Postpartum: the child, with the guardian's consent on the child's behalf. */
  childName: string;
  birth: string | null;
  childConsent: boolean;
  /** Postpartum: the first period since the birth, optional. */
  since: string | null;
  sinceFlow: PeriodFlow;
  /** The agreement step's three boxes, each unticked until she ticks it. */
  consent: boolean;
  terms: boolean;
  adult: boolean;
}

/**
 * The wave's period ruling (G9, DESIGN.md 5.1): a period day needs a flow,
 * so the scale shows Medium chosen, visible and changeable before saving.
 * The day sheet's `DEFAULT_PERIOD_FLOW` in lib/day-log.ts is the same
 * value; draft.test.ts pins the two together.
 */
export const DEFAULT_PERIOD_FLOW: PeriodFlow = "medium";

export const EMPTY_DRAFT: Draft = {
  timeZone: "",
  stage: null,
  start: null,
  startFlow: DEFAULT_PERIOD_FLOW,
  dating: EMPTY_DATING,
  childName: "",
  birth: null,
  childConsent: false,
  since: null,
  sinceFlow: DEFAULT_PERIOD_FLOW,
  consent: false,
  terms: false,
  adult: false,
};

/** The `data-date-key` of each date field outside the dating form. */
export const DATE_KEYS = { start: "start", birth: "birth", since: "since" } as const;

export type FieldKey =
  | "zone"
  | "stage"
  | "start"
  | "childName"
  | "birth"
  | "childConsent"
  | "since"
  | "consent"
  | "terms"
  | "adult"
  | `dating.${DatingDateField | "method" | "weeks" | "days" | "embryoAgeDays"}`;

export type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * A step's check: the words to show under each field, and whether she may
 * go on. They differ for a date whose three parts make no date: the input
 * prints its own line for that, so there is no word to add, and the step
 * still stops.
 */
export interface Checked {
  ok: boolean;
  errors: FieldErrors;
}

const dates = welcomeCopy.dates;
const dating = welcomeCopy.dating;

/** The words for a date problem; undefined where the input already says it. */
export function dateMessage(problem: DateProblem): string | undefined {
  switch (problem.kind) {
    case "required":
      return dates.required;
    case "partial":
      return problem.optional ? dates.partialOptional : dates.partial;
    case "invalid":
      return undefined;
    case "future":
      return dates.future;
    case "beforeBirth":
      return dates.beforeBirth;
    case "tooLongAgo":
      return dates.tooLongAgo;
    case "dueWindow":
      return dates.dueWindow(
        formatCalendarDate(problem.from, "full"),
        formatCalendarDate(problem.to, "full"),
      );
  }
}

function datingMessage(problem: DatingProblem): string | undefined {
  if (problem.kind === "method") return dating.methodRequired;
  if (problem.kind === "range") {
    if (problem.field === "weeks") return dating.weeksRange;
    if (problem.field === "days") return dating.daysRange;
    return dating.embryoAgeRange;
  }
  return dateMessage(problem);
}

function finish(errors: FieldErrors, blocked: boolean): Checked {
  return { ok: !blocked && Object.keys(errors).length === 0, errors };
}

/** Step 1: a zone chosen from the list. */
export function checkZone(draft: Draft): Checked {
  return finish(draft.timeZone === "" ? { zone: welcomeCopy.zone.required } : {}, false);
}

/** Step 2: one of the four cards. */
export function checkStage(draft: Draft): Checked {
  return finish(draft.stage === null ? { stage: welcomeCopy.stage.required } : {}, false);
}

/** One date outside the dating form: read, then held to `check`. */
function checkOne(
  key: "start" | "birth" | "since",
  value: string | null,
  entry: DateEntry,
  required: boolean,
  check: (date: string) => DateProblem | null,
  errors: FieldErrors,
): { date: string | null; blocked: boolean } {
  const read = readDate(value, entry, required);
  const problem = read.problem ?? (read.date === null ? null : check(read.date));
  if (problem === null) return { date: read.date, blocked: false };
  const message = dateMessage(problem);
  if (message !== undefined) errors[key] = message;
  return { date: null, blocked: true };
}

/**
 * Step 3: only what core asks for her stage. The result carries the dating
 * input for a pregnancy, ready for POST /v1/pregnancies, so the consent
 * step sends exactly what this step checked.
 */
export function checkDates(
  draft: Draft,
  today: string,
  entry: (key: string) => DateEntry,
): Checked & { dating?: PregnancyDatingInput } {
  const errors: FieldErrors = {};
  let blocked = false;
  switch (draft.stage) {
    case "cycle": {
      blocked = checkOne(
        "start",
        draft.start,
        entry(DATE_KEYS.start),
        false,
        (date) => checkPast(date, today),
        errors,
      ).blocked;
      return finish(errors, blocked);
    }
    case "pregnancy": {
      const result = datingFrom(draft.dating, today, (field) => entry(`dating.${field}`));
      if ("dating" in result) return { ...finish(errors, false), dating: result.dating };
      for (const [field, problem] of Object.entries(result.errors)) {
        if (problem === undefined) continue;
        const message = datingMessage(problem);
        if (message !== undefined) errors[`dating.${field}` as FieldKey] = message;
      }
      return finish(errors, true);
    }
    case "postpartum": {
      if (draft.childName.trim() === "") errors.childName = dates.childNameRequired;
      const birth = checkOne(
        "birth",
        draft.birth,
        entry(DATE_KEYS.birth),
        true,
        (date) => checkPast(date, today),
        errors,
      );
      if (!draft.childConsent) errors.childConsent = dates.childConsentRequired;
      const since = checkOne(
        "since",
        draft.since,
        entry(DATE_KEYS.since),
        false,
        (date) => checkSince(date, birth.date, today),
        errors,
      );
      return finish(errors, birth.blocked || since.blocked);
    }
    case "none":
    case null:
      return finish(errors, false);
  }
}

/**
 * Step 4: the collection consent when her stage asks one, and, separately
 * beneath it, the terms and the age attestation. Each is its own unticked
 * box; ticking one never ticks another.
 */
export function checkAgreements(draft: Draft, asksConsent: boolean): Checked {
  const consent = welcomeCopy.consent;
  const errors: FieldErrors = {};
  if (asksConsent && !draft.consent) errors.consent = consent.required;
  if (!draft.terms) errors.terms = consent.termsRequired;
  if (!draft.adult) errors.adult = consent.adultRequired;
  return finish(errors, false);
}

/** The sign-up name as the profile's display name: trimmed, at most the 80 characters the profile takes. */
export function displayNameFrom(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, 80).trim();
  return trimmed === "" ? null : trimmed;
}
