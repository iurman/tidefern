/**
 * The numbers the request middleware is tuned with, in one place so a change
 * is one diff. Everything here applies to `/v1` mutations only: reads cost
 * no state and are left to the platform's own limits.
 */

/** The methods the cross-site check, the rate limit and the idempotency rule treat as mutations. */
export const MUTATION_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutation(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export interface RateLimitRule {
  /** The fixed window, in milliseconds. */
  windowMs: number;
  /** The mutations one actor may send inside one window before the 429 problem. */
  max: number;
}

/**
 * Per actor, every `/v1` mutation together: a day sheet save, a note, a
 * grant change. Sixty a minute covers a sync burst from a phone that was
 * offline for a week (one `PUT` per day entry) with room to spare, and is
 * far above anything a person does by hand.
 *
 * The window must stay at or under 60 seconds: the counters share Better
 * Auth's `rate_limit` table, and Better Auth prunes every row whose
 * `last_request` is older than its own longest window (60 seconds for the
 * password reset and verification rules) whenever one of its windows
 * resets. A longer window here would be cut short by that prune.
 */
export const MUTATION_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 60 };

/**
 * The prefix of every rate limit key this package writes. Better Auth keys
 * its rows by client address and path, so the namespace cannot collide.
 */
export const RATE_LIMIT_KEY_PREFIX = "tidefern:v1:mutation:";

/**
 * How long an idempotency row answers replays. The same number as the
 * sweep's `RETENTION.idempotencyMs` in `@tidefern/db/jobs`; the middleware
 * also treats an older row as gone, because on Hobby the sweep runs once a
 * day and a row can outlive the window by up to a day.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

/**
 * How long an `in_flight` row is believed. A function that dies between
 * the claim and the `done` update (a host timeout, a crash) never releases
 * its row, and without this bound an honest retry with the same key would
 * be refused as in flight until the sweep. Five minutes is the host's
 * longest function duration on the Hobby plan (the entry file pins 60
 * seconds), so an `in_flight` row older than this was abandoned, not still
 * running; the middleware drops it and claims again.
 */
export const IDEMPOTENCY_IN_FLIGHT_MAX_MS = 5 * 60_000;
