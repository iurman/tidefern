/**
 * A model of Better Auth's sign-in and sign-up limiter, so the browser
 * suite paces itself and never trips it (architecture 15: tests never relax
 * the rate limit, and a run must not be answered 429).
 *
 * Better Auth 1.7 (`dist/api/rate-limiter/index.mjs`, its database storage)
 * keeps one row per client and path, `/sign-in/email` and `/sign-up/email`
 * apart, and its built-in rule allows three requests per ten seconds. The
 * window is not a sliding one: every allowed request moves `lastRequest` to
 * its own arrival, and the count starts again at one only once ten seconds
 * pass with no request at all. So a run that signs in every few seconds
 * keeps counting, and the fourth request in such a chain is refused unless
 * the client first waits ten seconds from the last one.
 *
 * The model counts from the moment a request leaves the test, which is a
 * little before the server records it, so it adds a margin to the window
 * and treats a bucket as quiet only once the margin has passed too. Erring
 * that way costs a short wait at worst, never a 429.
 */

/** The built-in rule for `/sign-in*`, `/sign-up*`, `/change-password*` and `/change-email*`. */
export const LIMITER_WINDOW_MS = 10_000;
export const LIMITER_MAX = 3;
/** Time between a request leaving the test and the server recording it, with room to spare. */
export const LIMITER_MARGIN_MS = 750;

export interface Bucket {
  /** Requests the server has counted since its count last started again. */
  count: number;
  /** When the latest of them left the test, in epoch milliseconds. */
  last: number;
}

export interface Slot {
  /** How long to wait before sending the next request. */
  waitMs: number;
  /** The bucket once that request is sent, after the wait. */
  next: Bucket;
}

/**
 * When the next request on a path may go, given the bucket so far (none
 * before the path's first request) and the time now: at once while fewer
 * than three requests are in the current chain, or once the chain has been
 * quiet for the window and the margin. The returned bucket counts the
 * request as sent at the end of the wait.
 */
export function nextSlot(bucket: Bucket | undefined, now: number): Slot {
  const quietAt = bucket === undefined ? now : bucket.last + LIMITER_WINDOW_MS + LIMITER_MARGIN_MS;
  if (bucket === undefined || now >= quietAt) {
    return { waitMs: 0, next: { count: 1, last: now } };
  }
  if (bucket.count < LIMITER_MAX) {
    return { waitMs: 0, next: { count: bucket.count + 1, last: now } };
  }
  return { waitMs: quietAt - now, next: { count: 1, last: quietAt } };
}

/**
 * The buckets kept between workers, from the JSON the session helper
 * writes. Anything that is not a bucket is dropped, so a damaged file
 * costs at most an unpaced request, never a crash.
 */
export function parseBuckets(text: string): Record<string, Bucket> {
  const parsed: unknown = JSON.parse(text);
  const buckets: Record<string, Bucket> = {};
  if (parsed === null || typeof parsed !== "object") return buckets;
  for (const [path, value] of Object.entries(parsed)) {
    const { count, last } = (value ?? {}) as Partial<Bucket>;
    if (Number.isInteger(count) && Number.isFinite(last)) {
      buckets[path] = { count: count as number, last: last as number };
    }
  }
  return buckets;
}

/** The path of an auth URL as the limiter keys it: `/sign-in/email` for `.../api/auth/sign-in/email?x`. */
export function limiterPath(url: string): string | null {
  const pathname = new URL(url, "http://127.0.0.1").pathname;
  const at = pathname.indexOf("/api/auth/");
  if (at < 0) return null;
  const path = pathname.slice(at + "/api/auth".length);
  return /^\/(sign-in|sign-up|change-password|change-email)/.test(path) ? path : null;
}
