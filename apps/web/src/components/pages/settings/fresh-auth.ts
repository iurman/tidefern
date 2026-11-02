import { freshAuthRequired, sessionGone } from "@/lib/auth-client";

/**
 * Architecture 6.1: exporting, closing the account and withdrawing consent
 * need a sign-in from the last ten minutes. The API's `requireFreshAuth`
 * counts from the session's creation, which GET /v1/me reports as
 * `session.authenticatedAt`, so the page can say before the press that a
 * fresh sign-in comes first instead of letting a confirmed action be
 * refused. The server still decides: a refusal it answers is handled the
 * same way.
 */
export const FRESH_AUTH_WINDOW_MS = 10 * 60_000;

/**
 * Taken off the window so the page stops offering the action a little
 * before the API would refuse it, rather than letting a press made in the
 * last seconds arrive too late.
 */
export const FRESH_AUTH_MARGIN_MS = 10_000;

/**
 * How many milliseconds the session still counts as fresh, measured on the
 * server's clock at render (zero or less: sign in again first), or null
 * when the page has no session read to tell (the locked view, where GET
 * /v1/me is refused, leaves it to the API).
 */
export function freshForMs(
  authenticatedAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (authenticatedAt === null || authenticatedAt === undefined) return null;
  const at = Date.parse(authenticatedAt);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at + FRESH_AUTH_WINDOW_MS - FRESH_AUTH_MARGIN_MS - nowMs);
}

/** The fields of a refusal the page acts on: the status and the problem's code and detail. */
export interface CallProblem {
  status: number;
  code?: string | undefined;
  detail?: string | undefined;
}

/** The problem body openapi-fetch parsed for a refused call, with the status from the response. */
export function problemFrom(error: unknown, status: number): CallProblem {
  const body =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  return {
    status,
    code: typeof body.code === "string" ? body.code : undefined,
    detail: typeof body.detail === "string" ? body.detail : undefined,
  };
}

/** The `detail` of the 401 an account that is closing gets everywhere but its data rights. */
const ACCOUNT_CLOSING = "account_closing";

/**
 * What a refusal asks of the page before anything else: a fresh sign-in
 * (the ten-minute rule), the locked view (the account started closing
 * elsewhere), sign in again (the session is gone), or nothing, when the
 * refusal is the call's own to explain.
 */
export function refusalStep(problem: CallProblem): "fresh-auth" | "closing" | "sign-in" | null {
  const error = { ...problem, statusText: "" };
  if (freshAuthRequired(error)) return "fresh-auth";
  if (problem.status === 401 && problem.detail === ACCOUNT_CLOSING) return "closing";
  if (sessionGone(error)) return "sign-in";
  return null;
}
