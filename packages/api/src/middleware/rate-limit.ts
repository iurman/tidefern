import type { MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { withActor } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";

import type { ApiEnv } from "../context";
import { problem } from "../problem";
import { MUTATION_RATE_LIMIT, RATE_LIMIT_KEY_PREFIX, isMutation } from "./limits";
import type { RateLimitRule } from "./limits";

export interface RateLimitOptions {
  /** The rule; `MUTATION_RATE_LIMIT` unless a test narrows it. */
  rule?: RateLimitRule | undefined;
  /** The clock, for tests. */
  now?: (() => number) | undefined;
}

export interface RateLimitDecision {
  /** How many mutations the actor has sent in the current window, this one included. */
  count: number;
  /** When the current window opened, in epoch milliseconds. */
  windowStart: number;
  allowed: boolean;
  /** Whole seconds until the window resets; zero when allowed. */
  retryAfterSeconds: number;
}

/**
 * Counts one mutation for the actor in a fixed window and says whether it
 * fits. The counter is a row in Better Auth's `rate_limit` table (`key`,
 * `count`, `last_request`), which already is a fixed-window counter keyed
 * by text, so no table was added: our keys carry their own prefix and, for
 * them, `last_request` holds the window's opening instant. One upsert does
 * the read, the reset and the increment, so two concurrent requests cannot
 * both see the count below the limit; it runs as the actor through
 * `withActor`, like every other query route code makes.
 */
export async function countMutation(
  db: ActorDatabase | undefined,
  actorId: string,
  rule: RateLimitRule = MUTATION_RATE_LIMIT,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${actorId}`;
  const expiredBefore = now - rule.windowMs;
  const row = await withActor(
    actorId,
    async (tx) => {
      // The transaction's `execute` is typed by the driver, so the row shape is named here.
      const result = (await tx.execute(sql`
        insert into rate_limit (key, count, last_request)
        values (${key}, 1, ${now}::bigint)
        on conflict (key) do update set
          count = case
            when rate_limit.last_request <= ${expiredBefore}::bigint then 1
            else rate_limit.count + 1
          end,
          last_request = case
            when rate_limit.last_request <= ${expiredBefore}::bigint then ${now}::bigint
            else rate_limit.last_request
          end
        returning count, last_request
      `)) as { rows: { count: number | string; last_request: number | string | bigint }[] };
      const first = result.rows[0];
      if (first === undefined) throw new Error("the rate limit upsert returned no row");
      return first;
    },
    db,
  );
  const count = Number(row.count);
  const windowStart = Number(row.last_request);
  const allowed = count <= rule.max;
  return {
    count,
    windowStart,
    allowed,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000)),
  };
}

/**
 * The per-actor limit on `/v1` mutations (architecture 8.3). An anonymous
 * mutation is not counted: it has no actor to count for, costs nothing
 * beyond the route's own 401, and the sign-in paths carry Better Auth's own
 * limits. Over the limit the answer is the 429 problem with `Retry-After`.
 */
export function rateLimit(
  db: ActorDatabase | undefined,
  options: RateLimitOptions = {},
): MiddlewareHandler<ApiEnv> {
  const rule = options.rule ?? MUTATION_RATE_LIMIT;
  const now = options.now ?? Date.now;
  return async (c, next) => {
    const actor = c.var.actor;
    if (actor === null || !isMutation(c.req.method)) return next();
    const decision = await countMutation(db, actor.id, rule, now());
    if (!decision.allowed) {
      c.header("Retry-After", String(decision.retryAfterSeconds));
      return problem(c, 429, "rate_limited");
    }
    return next();
  };
}
