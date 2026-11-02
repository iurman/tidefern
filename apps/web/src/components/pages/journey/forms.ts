import { compareDates } from "@tidefern/core";
import { FRESH_AUTHENTICATION_REQUIRED, SIGN_IN_PATH } from "@/lib/auth-client";
import { journeyCopy as copy, type EndReason, type EventKind } from "./copy";

/**
 * The rules of the two forms on /journey and what each answer of the API
 * means for the person, kept apart from React so each has a test. Health
 * text goes only in request bodies; a failure always says what to do next
 * (CONTENT.md voice table), and nothing here ever reports success the API
 * did not give.
 */

/** Where a sign-in sends her back to: this page, where the form waits (a safe `?next=` path). */
export const SIGN_IN_AGAIN_PATH = `${SIGN_IN_PATH}?next=/journey`;

/** The longest detail the contract takes (PregnancyEventInput). */
export const DETAIL_MAX = 500;

/** The `detail` values of the API's problems this page tells apart (packages/api pregnancy routes). */
const STALE_VERSION = "stale_version";
const PREGNANCY_PAUSED = "pregnancy_paused";

export type EventField = "kind" | "date" | "detail";
export type EndField = "endedAt" | "reason";

/** What a failed request means for the form. */
export type Failure<F extends string> =
  /** Say it beside the field it is about. */
  | { kind: "fields"; errors: Partial<Record<F, string>> }
  /** Say it in the dialog; `refresh` when the page's own read is out of date. */
  | { kind: "message"; text: string; refresh: boolean }
  /** The session is gone: only signing in helps. */
  | { kind: "signed-out" }
  /** The ten-minute rule (architecture 6.1): sign in again, then come back. */
  | { kind: "fresh-auth" };

interface ProblemLike {
  detail?: unknown;
  errors?: unknown;
}

function problemDetail(problem: unknown): string | undefined {
  const detail = (problem as ProblemLike | null | undefined)?.detail;
  return typeof detail === "string" ? detail : undefined;
}

function fieldErrors(problem: unknown): { path: string; message: string }[] {
  const errors = (problem as ProblemLike | null | undefined)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter(
    (error): error is { path: string; message: string } =>
      typeof error === "object" &&
      error !== null &&
      typeof (error as { path?: unknown }).path === "string" &&
      typeof (error as { message?: unknown }).message === "string",
  );
}

/* ------------------------------------------------------------------------ */
/* Appointments and milestones                                               */
/* ------------------------------------------------------------------------ */

export interface EventDraft {
  kind: EventKind | null;
  /** YYYY-MM-DD once the three parts make a real day, else null. */
  date: string | null;
  detail: string;
}

/**
 * `start` is day 0 of the pregnancy (the due date minus 280 days): a day
 * before it belongs to no week of this pregnancy, so it is refused here, as
 * the ending dialog refuses one, instead of being listed under a week whose
 * dates would not contain it.
 */
export function validateEvent(
  draft: EventDraft,
  start: string,
): Partial<Record<EventField, string>> | null {
  const errors: Partial<Record<EventField, string>> = {};
  if (draft.kind === null) errors.kind = copy.event.errors.kindMissing;
  if (draft.date === null) errors.date = copy.event.errors.dateMissing;
  else if (compareDates(draft.date, start) < 0) errors.date = copy.event.errors.dateBefore;
  if (draft.detail.trim().length > DETAIL_MAX) errors.detail = copy.event.errors.detailTooLong;
  return Object.keys(errors).length === 0 ? null : errors;
}

/**
 * The body of a create or a replacement. A PUT replaces the whole event,
 * so the detail is always sent when there is one (left out, the API clears
 * it); an empty field leaves it out, which is how she clears it on
 * purpose, since an empty string is not a detail the contract takes.
 */
export function eventBody(draft: EventDraft & { kind: EventKind; date: string }): {
  kind: EventKind;
  date: string;
  detail?: string;
} {
  const detail = draft.detail.trim();
  return { kind: draft.kind, date: draft.date, ...(detail === "" ? {} : { detail }) };
}

/**
 * What a refused save or delete of an event means, by the API's status and
 * problem. A delete sends no fields, so a 422 for it is a plain failure.
 */
export function eventFailure(
  status: number,
  problem: unknown,
  action: "save" | "delete" = "save",
): Failure<EventField> {
  const e = copy.event.errors;
  const generic = action === "delete" ? e.removeFailed : e.failed;
  if (status === 0) return { kind: "message", text: e.offline, refresh: false };
  if (status === 401) return { kind: "signed-out" };
  if (status === 404) return { kind: "message", text: e.gone, refresh: true };
  if (status === 409) {
    const detail = problemDetail(problem);
    if (detail === STALE_VERSION) return { kind: "message", text: e.stale, refresh: true };
    if (detail === PREGNANCY_PAUSED) return { kind: "message", text: e.paused, refresh: true };
    return { kind: "message", text: generic, refresh: false };
  }
  if (status === 422 && action === "save") {
    const errors: Partial<Record<EventField, string>> = {};
    for (const error of fieldErrors(problem)) {
      if (error.path === "date") errors.date = e.dateInvalid;
      else if (error.path === "kind") errors.kind = e.kindMissing;
      else if (error.path === "detail") errors.detail = e.detailTooLong;
    }
    if (Object.keys(errors).length > 0) return { kind: "fields", errors };
  }
  if (status === 429) return { kind: "message", text: e.limited, refresh: false };
  return { kind: "message", text: generic, refresh: false };
}

/* ------------------------------------------------------------------------ */
/* Ending a pregnancy                                                        */
/* ------------------------------------------------------------------------ */

export interface EndDraft {
  date: string | null;
  reason: EndReason | null;
}

/**
 * The ending's own rules before anything is sent: a real day, not after
 * today in her zone (the API refuses it too) and not before the pregnancy
 * began, and a reason, which nobody but her ever sees.
 */
export function validateEnd(
  draft: EndDraft,
  bounds: { today: string; start: string },
): Partial<Record<EndField, string>> | null {
  const errors: Partial<Record<EndField, string>> = {};
  const e = copy.end.errors;
  if (draft.date === null) errors.endedAt = e.dateMissing;
  else if (compareDates(draft.date, bounds.today) > 0) errors.endedAt = e.dateFuture;
  else if (compareDates(draft.date, bounds.start) < 0) errors.endedAt = e.dateBefore;
  if (draft.reason === null) errors.reason = e.reasonMissing;
  return Object.keys(errors).length === 0 ? null : errors;
}

/** The API's two refusals of an ending day, by the message it names the field with. */
const FUTURE_MESSAGE = "Not a day that has happened yet.";

/** What a refused ending means, by the API's status and problem. */
export function endFailure(status: number, problem: unknown): Failure<EndField> {
  const e = copy.end.errors;
  if (status === 0) return { kind: "message", text: e.offline, refresh: false };
  if (status === 401) {
    return problemDetail(problem) === FRESH_AUTHENTICATION_REQUIRED
      ? { kind: "fresh-auth" }
      : { kind: "signed-out" };
  }
  if (status === 404) return { kind: "message", text: e.gone, refresh: true };
  if (status === 409) return { kind: "message", text: e.ended, refresh: true };
  if (status === 422) {
    const errors: Partial<Record<EndField, string>> = {};
    for (const error of fieldErrors(problem)) {
      if (error.path === "endedAt") {
        errors.endedAt = error.message === FUTURE_MESSAGE ? e.dateFuture : e.dateBefore;
      } else if (error.path === "reason") errors.reason = e.reasonMissing;
    }
    if (Object.keys(errors).length > 0) return { kind: "fields", errors };
    return { kind: "message", text: e.failed, refresh: false };
  }
  if (status === 429) return { kind: "message", text: e.limited, refresh: false };
  return { kind: "message", text: e.failed, refresh: false };
}

/* ------------------------------------------------------------------------ */
/* Idempotency keys                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The Idempotency-Key for a create (architecture 5.3). A retry of the same
 * body reuses its key, so a create whose answer was lost replays instead of
 * landing twice; a changed body gets a new one, because the API refuses a
 * key reused with a different body. A form takes a fresh memory each time
 * it opens, so a stored refusal (a stale sign-in, say) is never replayed.
 */
export function keyMemory(newKey: () => string): (body: unknown) => string {
  let last: { body: string; key: string } | null = null;
  return (body) => {
    const serialized = JSON.stringify(body);
    if (last === null || last.body !== serialized) last = { body: serialized, key: newKey() };
    return last.key;
  };
}
