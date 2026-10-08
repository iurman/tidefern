import { ACCOUNT_CLOSING } from "@tidefern/api-client";
import { CLOSING_PATH, FRESH_AUTHENTICATION_REQUIRED, SIGN_IN_PATH } from "@/lib/auth-client";
import { sharingCopy as copy } from "./copy";

/**
 * What a call from the sharing screen came back with, flattened from the
 * typed client's answer: the data of a 2xx, or the status and the problem's
 * `code` and `detail` (RFC 9457). Status 0 means the request never got an
 * answer (offline, or the connection dropped). `replayed` marks a refusal
 * the API served from a stored idempotency row instead of the handler,
 * which carries the status and code but never the detail.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; detail?: string; replayed?: true };

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

/** Set by the API on an answer served from a stored idempotency row (packages/api idempotency). */
const REPLAYED_HEADER = "Idempotency-Replayed";

/** The 409 detail for a key whose first request is still running (packages/api idempotency). */
export const IDEMPOTENCY_KEY_IN_FLIGHT = "idempotency_key_in_flight";

/** The `detail` values the sharing routes answer with (`sharingDetails` in packages/api), compared by value. */
export const sharingDetails = {
  householdChoiceRequired: "household_choice_required",
  householdOwnerMustHandOver: "household_owner_must_hand_over",
  coGuardianshipUnresolved: "co_guardianship_unresolved",
  invitationPending: "invitation_pending",
  staleVersion: "stale_version",
  memberOfAnotherHousehold: "member_of_another_household",
  mailUnavailable: "mail_unavailable",
} as const;

function field(error: unknown, name: "code" | "detail"): string | undefined {
  if (typeof error !== "object" || error === null || !(name in error)) return undefined;
  const value = (error as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Runs one typed-client call and flattens its answer. A thrown fetch (no
 * answer at all) is status 0. Nothing is logged: a request body here can
 * hold an invitation token.
 */
export async function attempt<T>(
  call: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ApiResult<T>> {
  try {
    const { data, error, response } = await call();
    if (response.ok) return { ok: true, data: data as T };
    const code = field(error, "code");
    const detail = field(error, "detail");
    return {
      ok: false,
      status: response.status,
      ...(code === undefined ? {} : { code }),
      ...(detail === undefined ? {} : { detail }),
      ...(response.headers.get(REPLAYED_HEADER) === "true" ? { replayed: true as const } : {}),
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The API's ten-minute rule (architecture 6.1): the next step is a fresh sign-in, never a retry. */
export function needsFreshSignIn(failure: ApiFailure): boolean {
  return failure.status === 401 && failure.detail === FRESH_AUTHENTICATION_REQUIRED;
}

/**
 * Where a refusal sends the person instead of a sentence: a 401 that is
 * neither the fresh-sign-in rule nor a closing account means the session is
 * gone (sign in), and a closing account goes to its locked view. Null when
 * the page should say something instead.
 */
export function leaveFor(failure: ApiFailure): string | null {
  if (failure.status !== 401 || needsFreshSignIn(failure)) return null;
  return failure.detail === ACCOUNT_CLOSING ? CLOSING_PATH : SIGN_IN_PATH;
}

/**
 * A full navigation, so the next page reads the session on the server. One
 * function so a component test can see where a refusal sent the person.
 */
export function goTo(path: string): void {
  window.location.assign(path);
}

/** Sign in again, then come back to /sharing (`?next=` is checked by `safeNextPath`). */
export const SIGN_IN_AGAIN_PATH = `${SIGN_IN_PATH}?next=${encodeURIComponent("/sharing")}`;

/** The sentences shared by every failure that is not specific to one action. */
function general(failure: ApiFailure): string | null {
  if (failure.status === 0) return copy.failure.offline;
  if (failure.status === 429) return copy.failure.tooMany;
  if (failure.status >= 500) return copy.failure.server;
  return null;
}

/**
 * Whether a change was refused because the page is behind the server: a
 * stale `If-Match` (409 `stale_version`) or a person or grant that is no
 * longer there (404). The page reads again and says so.
 */
export function isStale(failure: ApiFailure): boolean {
  return (
    failure.status === 404 ||
    (failure.status === 409 && failure.detail === sharingDetails.staleVersion)
  );
}

/** A failed grant or notify change: what to do next. */
export function describeChangeFailure(failure: ApiFailure): string {
  if (isStale(failure)) return copy.failure.changedElsewhere;
  return general(failure) ?? copy.failure.save;
}

/** A failed or refused removal. The co-guardian refusal has its own sentence, built by the page. */
export function describeRemoveFailure(failure: ApiFailure, name: string): string {
  if (failure.status === 404) return copy.failure.changedElsewhere;
  return general(failure) ?? copy.remove.failed(name);
}

/** Whether a removal was refused because the person is the only other guardian of a child. */
export function isCoGuardianRefusal(failure: ApiFailure): boolean {
  return failure.status === 409 && failure.detail === sharingDetails.coGuardianshipUnresolved;
}

/** A failed or refused invitation. */
export function describeInviteFailure(failure: ApiFailure): string {
  if (failure.status === 409 && failure.detail === sharingDetails.invitationPending) {
    return copy.invite.pendingAlready;
  }
  if (failure.status === 409 && failure.detail === sharingDetails.memberOfAnotherHousehold) {
    return copy.invite.memberElsewhere;
  }
  if (failure.status === 503) return copy.invite.mailUnavailable;
  if (failure.status === 422) return copy.invite.emailInvalid;
  return general(failure) ?? copy.invite.failed;
}

/**
 * A failed withdrawal. The API answers 404 for every invitation that is no
 * longer open, whether it was accepted, withdrawn elsewhere or expired, and
 * never says which, so the sentence names none of them.
 */
export function describeWithdrawFailure(failure: ApiFailure): string {
  if (failure.status === 404) return copy.withdraw.closed;
  return general(failure) ?? copy.withdraw.failed;
}

/**
 * Whether the server settled this request, so a retry under the same
 * `Idempotency-Key` would only replay it: any answer except none at all
 * (status 0, which may have been a success) and the 409 for a first request
 * still running. A 4xx changed nothing and a 5xx released the key, so the
 * next press is a new request with a new key.
 */
export function settledByServer(failure: ApiFailure): boolean {
  if (failure.status === 0) return false;
  return !(failure.status === 409 && failure.detail === IDEMPOTENCY_KEY_IN_FLIGHT);
}

/** What an acceptance that did not join comes to: a choice to make, or a sentence. */
export type AcceptRefusal =
  | { kind: "choose" }
  | { kind: "hand-over" }
  | { kind: "not-open" }
  | { kind: "failed"; sentence: string };

/**
 * A refused acceptance. A 404 (and a 422, which a checked token never
 * gets) is one answer for an invitation that expired, was withdrawn, was
 * sent to another address or to an unverified one: the page never says
 * which, as the API never does.
 */
export function describeAcceptRefusal(failure: ApiFailure): AcceptRefusal {
  if (failure.status === 409 && failure.detail === sharingDetails.householdChoiceRequired) {
    return { kind: "choose" };
  }
  if (failure.status === 409 && failure.detail === sharingDetails.householdOwnerMustHandOver) {
    return { kind: "hand-over" };
  }
  if (failure.status === 404 || failure.status === 422) return { kind: "not-open" };
  return { kind: "failed", sentence: general(failure) ?? copy.accept.failed };
}
