import type { ApiClient, components } from "@tidefern/api-client";
import { childConsentTextVersions } from "@tidefern/schemas";
import type { ChildEvent, MilestoneCheck } from "./types";

/**
 * The family screens' writes over the browser client, each answering with
 * what happened rather than throwing, so a control can say it in words
 * (CONTENT.md voice table: failure says what to do next). Nothing here reads
 * the DOM or React; the client controllers decide what to show.
 *
 * Creates carry an id and an Idempotency-Key the caller keeps across retries
 * of the same body (architecture 5.3): a retry after a lost answer meets the
 * first attempt instead of making a second row, and a replay answers `{ id }`
 * alone, which is all a caller reads before it re-reads the page.
 */

export type Failure =
  /** The browser says there is no network; nothing was sent. */
  | { kind: "offline" }
  /** The session ended (401); trying again cannot help until she signs in. */
  | { kind: "signedOut" }
  /** The API refused a field (422); `errors` carry the paths it named. */
  | { kind: "invalid"; errors: { path: string; message: string }[] }
  /** The row moved on elsewhere (409). */
  | { kind: "conflict" }
  /** The child or the row is not reachable any more (404). */
  | { kind: "notFound" }
  /** Anything else: a server error, or no answer at all (status 0). */
  | { kind: "failed"; status: number };

export type Result<T> = { ok: true; value: T } | ({ ok: false } & Failure);

/** One create's identity, minted once and kept while the same body is retried. */
export interface Attempt {
  id: string;
  key: string;
  /** The body it was minted for; a changed body gets a new attempt. */
  fingerprint: string;
}

/** The kept attempt when the body is the same, else a new one from the client's minter. */
export function attemptFor(
  client: Pick<ApiClient, "newId">,
  previous: Attempt | null,
  body: unknown,
): Attempt {
  const fingerprint = JSON.stringify(body);
  if (previous !== null && previous.fingerprint === fingerprint) return previous;
  return { id: client.newId(), key: client.newId(), fingerprint };
}

/** Whether a failure should keep the attempt for the next press: only when the request may have landed. */
export function keepsAttempt(failure: Failure): boolean {
  return failure.kind === "failed" || failure.kind === "offline";
}

function problemErrors(body: unknown): { path: string; message: string }[] {
  if (typeof body !== "object" || body === null || !("errors" in body)) return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { path?: unknown }).path === "string" &&
    typeof (entry as { message?: unknown }).message === "string"
      ? [
          {
            path: (entry as { path: string }).path,
            message: (entry as { message: string }).message,
          },
        ]
      : [],
  );
}

function failureFor(status: number, body: unknown): Failure {
  if (status === 401) return { kind: "signedOut" };
  if (status === 422) return { kind: "invalid", errors: problemErrors(body) };
  if (status === 409) return { kind: "conflict" };
  if (status === 404) return { kind: "notFound" };
  return { kind: "failed", status };
}

/** Runs one call; a thrown fetch (no network, an aborted request) is status 0. */
async function send<T>(
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>,
  success: number,
): Promise<Result<T | undefined>> {
  try {
    const { data, error, response } = await request();
    if (response.status === success) return { ok: true, value: data };
    return { ok: false, ...failureFor(response.status, error) };
  } catch {
    return { ok: false, kind: "failed", status: 0 };
  }
}

/**
 * GET /v1/me for today in the profile's zone on the API's calendar clock, read
 * right before an event is filed: a page left open past midnight still files
 * a night feed under the day it happens, not the day the page was drawn. No
 * day (no profile) is a failure, so nothing is filed under a guessed date.
 */
export async function currentDay(client: ApiClient): Promise<Result<string>> {
  const result = await send(() => client.GET("/api/v1/me"), 200);
  if (!result.ok) return result;
  const today = result.value?.today;
  if (typeof today !== "string") return { ok: false, kind: "failed", status: 200 };
  return { ok: true, value: today };
}

type EventInput = components["schemas"]["ChildEventInput"];

/** The event body without the id, which the attempt supplies. */
export type NewEvent = Omit<EventInput, "id">;

/** POST /v1/children/{id}/events: a feed, a sleep that starts now, or a diaper. Answers the event id. */
export async function logEvent(
  client: ApiClient,
  childId: string,
  body: NewEvent,
  attempt: Attempt,
): Promise<Result<string>> {
  const result = await send(
    () =>
      client.POST("/api/v1/children/{id}/events", {
        params: { path: { id: childId } },
        headers: { "Idempotency-Key": attempt.key },
        body: { ...body, id: attempt.id },
      }),
    201,
  );
  return result.ok ? { ok: true, value: attempt.id } : result;
}

/**
 * PUT /v1/children/{id}/events/{eventId} with the sleep's end. The PUT
 * replaces the whole event, so every field the sleep carries goes back with
 * it (an omitted note would be cleared), and If-Match names the version the
 * page read, so an end recorded elsewhere answers 409 instead of being
 * overwritten.
 */
export async function endSleep(
  client: ApiClient,
  childId: string,
  sleep: Pick<ChildEvent, "id" | "date" | "startedAt" | "note" | "version">,
  endedAt: string,
): Promise<Result<undefined>> {
  const startedAt = sleep.startedAt;
  if (startedAt === null) return { ok: false, kind: "conflict" };
  const result = await send(
    () =>
      client.PUT("/api/v1/children/{id}/events/{eventId}", {
        params: {
          path: { id: childId, eventId: sleep.id },
          header: { "if-match": String(sleep.version) },
        },
        body: {
          kind: "sleep",
          date: sleep.date,
          startedAt,
          // An end before the recorded start (a device clock behind another) is refused by the
          // API; the start is the floor.
          endedAt: Date.parse(endedAt) < Date.parse(startedAt) ? startedAt : endedAt,
          ...(sleep.note === null ? {} : { note: sleep.note }),
        },
      }),
    200,
  );
  return result.ok ? { ok: true, value: undefined } : result;
}

/** DELETE /v1/children/{id}/events/{eventId}: the Undo. One already gone counts as undone. */
export async function removeEvent(
  client: ApiClient,
  childId: string,
  eventId: string,
): Promise<Result<undefined>> {
  const result = await send(
    () =>
      client.DELETE("/api/v1/children/{id}/events/{eventId}", {
        params: { path: { id: childId, eventId } },
      }),
    204,
  );
  if (result.ok || result.kind === "notFound") return { ok: true, value: undefined };
  return result;
}

export interface NewChild {
  displayName: string;
  dateOfBirth: string;
  sex?: "female" | "male";
}

/** The version of the guardian's consent text the add-a-child form shows. */
export const CHILD_CONSENT_VERSION = childConsentTextVersions[childConsentTextVersions.length - 1];

/**
 * POST /v1/children with the guardian's consent on the child's behalf: sent
 * only after she ticked the box under the full text (`given` is the literal
 * true the contract demands), with the version of the text she was shown.
 */
export async function addChild(
  client: ApiClient,
  body: NewChild,
  attempt: Attempt,
): Promise<Result<string>> {
  if (CHILD_CONSENT_VERSION === undefined) return { ok: false, kind: "failed", status: 0 };
  const version = CHILD_CONSENT_VERSION;
  const result = await send(
    () =>
      client.POST("/api/v1/children", {
        headers: { "Idempotency-Key": attempt.key },
        body: { ...body, id: attempt.id, guardianConsent: { given: true, textVersion: version } },
      }),
    201,
  );
  return result.ok ? { ok: true, value: attempt.id } : result;
}

export interface NewMeasurement {
  date: string;
  weightGrams?: number;
  lengthMillimetres?: number;
  headMillimetres?: number;
}

/** POST /v1/children/{id}/measurements in SI integers; the API refuses a date before birth on `date`. */
export async function addMeasurement(
  client: ApiClient,
  childId: string,
  body: NewMeasurement,
  attempt: Attempt,
): Promise<Result<string>> {
  const result = await send(
    () =>
      client.POST("/api/v1/children/{id}/measurements", {
        params: { path: { id: childId } },
        headers: { "Idempotency-Key": attempt.key },
        body: { ...body, id: attempt.id },
      }),
    201,
  );
  return result.ok ? { ok: true, value: attempt.id } : result;
}

/**
 * PUT /v1/children/{id}/milestones: the item travels in the body, never the
 * path, so no request line pairs a child with a checklist item. Answers the
 * item as it now stands.
 */
export async function checkMilestone(
  client: ApiClient,
  childId: string,
  itemId: string,
  checked: boolean,
): Promise<Result<MilestoneCheck>> {
  const result = await send(
    () =>
      client.PUT("/api/v1/children/{id}/milestones", {
        params: { path: { id: childId } },
        body: { itemId, checked },
      }),
    200,
  );
  if (!result.ok) return result;
  if (result.value === undefined) return { ok: false, kind: "failed", status: 200 };
  return { ok: true, value: result.value };
}
