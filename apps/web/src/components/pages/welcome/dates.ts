import { addDays, compareDates, isCalendarDate } from "@tidefern/core";
import type { DatingMethod, PregnancyDatingInput } from "@tidefern/schemas";
import type { DateOrder } from "@/components/ui/segmented-date-input";

export type { DateOrder };

/**
 * The dates onboarding asks for, checked in plain functions (DESIGN.md 3.2,
 * architecture 13.10). `today` is always a calendar date in the zone she
 * chose, worked out from an instant the server sent, never from the
 * browser's clock. No route refuses a date in the future, so the checks
 * that keep a typo out (a wrong year, a day still to come) live here; the
 * API stays the judge of the rest and of every derived date.
 */

/** What the three parts of a segmented date hold: nothing, some of it, or all three. */
export type DateEntry = "empty" | "partial" | "complete";

export type DateProblem =
  /** Nothing typed, and this date is needed. */
  | { kind: "required" }
  /** A part is missing; an optional date can be cleared instead. */
  | { kind: "partial"; optional: boolean }
  /** Three parts that make no date; the input says so beside itself. */
  | { kind: "invalid" }
  /** A day that has not come yet, for something that already happened. */
  | { kind: "future" }
  /** A period since the birth dated on or before the birth. */
  | { kind: "beforeBirth" }
  /** Further back than a pregnancy lasts. */
  | { kind: "tooLongAgo" }
  /** A due date outside the window a pregnancy in progress can have. */
  | { kind: "dueWindow"; from: string; to: string };

/** 42 weeks: how far back a pregnancy in progress can be dated from (its last period, a scan, a transfer). */
export const PREGNANCY_SPAN_DAYS = 294;

/** A due date given by hand can be up to 2 weeks past (42 weeks along) ... */
export const DUE_DATE_PAST_DAYS = 14;

/** ... and up to 40 weeks ahead, as for a last period that started today. */
export const DUE_DATE_AHEAD_DAYS = 280;

/**
 * What a typed date is worth: the date when the three parts make one, the
 * problem when they do not, or neither for an optional date left empty.
 * `value` is what the input reported (YYYY-MM-DD only for a real date).
 */
export function readDate(
  value: string | null,
  entry: DateEntry,
  required: boolean,
): { date: string | null; problem: DateProblem | null } {
  if (entry === "empty") return { date: null, problem: required ? { kind: "required" } : null };
  if (entry === "partial") return { date: null, problem: { kind: "partial", optional: !required } };
  if (value === null || !isCalendarDate(value)) return { date: null, problem: { kind: "invalid" } };
  return { date: value, problem: null };
}

/** A day that already happened: never after today. */
export function checkPast(date: string, today: string): DateProblem | null {
  return compareDates(date, today) > 0 ? { kind: "future" } : null;
}

/** A day a pregnancy in progress was dated from: up to today and within the last 42 weeks. */
export function checkPregnancyDay(date: string, today: string): DateProblem | null {
  const past = checkPast(date, today);
  if (past) return past;
  return compareDates(date, addDays(today, -PREGNANCY_SPAN_DAYS)) < 0
    ? { kind: "tooLongAgo" }
    : null;
}

/** A due date given by hand: from 2 weeks ago to 40 weeks ahead. */
export function checkDueDate(date: string, today: string): DateProblem | null {
  const from = addDays(today, -DUE_DATE_PAST_DAYS);
  const to = addDays(today, DUE_DATE_AHEAD_DAYS);
  if (compareDates(date, from) < 0 || compareDates(date, to) > 0) {
    return { kind: "dueWindow", from, to };
  }
  return null;
}

/** The first period since a birth: up to today, and after the birth day itself. */
export function checkSince(date: string, birth: string | null, today: string): DateProblem | null {
  const past = checkPast(date, today);
  if (past) return past;
  if (birth !== null && compareDates(date, birth) <= 0) return { kind: "beforeBirth" };
  return null;
}

/** A whole number typed into a text field, within a range, or null. */
export function wholeNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/**
 * The pregnancy dating form as typed, method first (task H1: the server
 * never trusts a due date the client derived, so she says how it was worked
 * out and gives that method's input). Numbers stay text until they are
 * read. The fields of the other methods are kept, so switching back and
 * forth loses nothing; only the chosen method's fields are sent.
 */
export interface DatingDraft {
  method: DatingMethod | null;
  lastPeriodStart: string | null;
  scanDate: string | null;
  weeks: string;
  days: string;
  transferDate: string | null;
  embryoAgeDays: string;
  dueDate: string | null;
}

export const EMPTY_DATING: DatingDraft = {
  method: null,
  lastPeriodStart: null,
  scanDate: null,
  weeks: "",
  days: "",
  transferDate: null,
  embryoAgeDays: "",
  dueDate: null,
};

/** The four date fields of the dating form. */
export type DatingDateField = "lastPeriodStart" | "scanDate" | "transferDate" | "dueDate";

export type DatingField = DatingDateField | "method" | "weeks" | "days" | "embryoAgeDays";

export type DatingProblem =
  DateProblem | { kind: "method" } | { kind: "range"; field: "weeks" | "days" | "embryoAgeDays" };

export type DatingErrors = Partial<Record<DatingField, DatingProblem>>;

/** The schema's ranges for the numbers a method takes. */
export const DATING_RANGES = {
  weeks: { min: 0, max: 42 },
  days: { min: 0, max: 6 },
  embryoAgeDays: { min: 1, max: 7 },
} as const;

function numberIn(
  draft: DatingDraft,
  field: keyof typeof DATING_RANGES,
  errors: DatingErrors,
): number | null {
  const { min, max } = DATING_RANGES[field];
  const value = wholeNumber(draft[field], min, max);
  if (value === null) errors[field] = { kind: "range", field };
  return value;
}

function dayIn(
  draft: DatingDraft,
  field: DatingDateField,
  entry: (field: DatingDateField) => DateEntry,
  check: (date: string) => DateProblem | null,
  errors: DatingErrors,
): string | null {
  const { date, problem } = readDate(draft[field], entry(field), true);
  if (problem) {
    errors[field] = problem;
    return null;
  }
  const out = date === null ? null : check(date);
  if (out) {
    errors[field] = out;
    return null;
  }
  return date;
}

/**
 * The dating input POST /v1/pregnancies takes, from the form, or the
 * problems that stop it. `entry` says what each date field holds, read from
 * the inputs, so "nothing typed" and "half typed" get different words.
 */
export function datingFrom(
  draft: DatingDraft,
  today: string,
  entry: (field: DatingDateField) => DateEntry,
): { dating: PregnancyDatingInput } | { errors: DatingErrors } {
  const errors: DatingErrors = {};
  switch (draft.method) {
    case null:
      return { errors: { method: { kind: "method" } } };
    case "lmp": {
      const lastPeriodStart = dayIn(
        draft,
        "lastPeriodStart",
        entry,
        (date) => checkPregnancyDay(date, today),
        errors,
      );
      return lastPeriodStart === null ? { errors } : { dating: { method: "lmp", lastPeriodStart } };
    }
    case "ultrasound": {
      const scanDate = dayIn(
        draft,
        "scanDate",
        entry,
        (date) => checkPregnancyDay(date, today),
        errors,
      );
      const weeks = numberIn(draft, "weeks", errors);
      const days = numberIn(draft, "days", errors);
      return scanDate === null || weeks === null || days === null
        ? { errors }
        : { dating: { method: "ultrasound", scanDate, weeks, days } };
    }
    case "transfer": {
      const transferDate = dayIn(
        draft,
        "transferDate",
        entry,
        (date) => checkPregnancyDay(date, today),
        errors,
      );
      const embryoAgeDays = numberIn(draft, "embryoAgeDays", errors);
      return transferDate === null || embryoAgeDays === null
        ? { errors }
        : { dating: { method: "transfer", transferDate, embryoAgeDays } };
    }
    case "manual": {
      const dueDate = dayIn(draft, "dueDate", entry, (date) => checkDueDate(date, today), errors);
      return dueDate === null ? { errors } : { dating: { method: "manual", dueDate } };
    }
  }
}

/** The date field a method asks for. */
export function dateFieldOf(method: DatingMethod): DatingDateField {
  switch (method) {
    case "lmp":
      return "lastPeriodStart";
    case "ultrasound":
      return "scanDate";
    case "transfer":
      return "transferDate";
    case "manual":
      return "dueDate";
  }
}

/** The day of the month at or after which an example date reads the same in any field order. */
const UNAMBIGUOUS_DAY = 13;

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/**
 * An example for a date that already happened: about a month back, moved
 * to a day of the month past the twelfth, so "09 23 2026" cannot be read as
 * the ninth of some month whatever order the fields are in.
 */
export function pastExample(today: string): string {
  const date = addDays(today, -30);
  const day = dayOfMonth(date);
  return day < UNAMBIGUOUS_DAY ? addDays(date, -day) : date;
}

/** An example for a date still to come: about five months on, past the twelfth of its month. */
export function futureExample(today: string): string {
  const date = addDays(today, 150);
  const day = dayOfMonth(date);
  return day < UNAMBIGUOUS_DAY ? addDays(date, UNAMBIGUOUS_DAY - day) : date;
}

/**
 * The order she types a date in, from the browser's locale: month first in
 * the United States, day first in most of the world. The profile holds no
 * date order, and output stays in en-US for Phase 1 (architecture 13.10).
 * Month first when the locale says nothing usable.
 */
export function dateOrderFor(locale: string | undefined): DateOrder {
  try {
    const order = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    })
      .formatToParts(Date.UTC(2027, 3, 23))
      .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
      .map((part) => part.type.charAt(0))
      .join("");
    if (order === "dmy" || order === "mdy" || order === "ymd") return order;
  } catch {
    // An unknown locale tag: fall through to month first.
  }
  return "mdy";
}
