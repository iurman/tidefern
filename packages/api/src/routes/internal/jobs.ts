import { createHash, timingSafeEqual } from "node:crypto";

import { Hono } from "hono";
import { sweep } from "@tidefern/db/jobs";
import type { ActorDatabase, SweepCounts } from "@tidefern/db/jobs";

import { drainDue } from "../../jobs/index";
import type { JobHandlers } from "../../jobs/index";
import { enqueueReminders } from "../../jobs/reminders";
import { deadQueueNotice } from "../../jobs/notice";
import type { Mailer } from "../../jobs/notice";
import { problem } from "../../problem";

/** Jobs per scheduled run; a daily Hobby run has 300 s and the drain is one batch. */
export const DEFAULT_CLAIM_LIMIT = 25;

export interface JobsOptions {
  /**
   * The job runner's connection. The sweep deletes under forced row level
   * security, so this must be the owner role (`DATABASE_URL_UNPOOLED`, 7.2);
   * on the app role the sweep refuses.
   */
  db: ActorDatabase;
  /** One handler per job type; `jobHandlers` from `./jobs/handlers` in the hosts. */
  handlers?: JobHandlers | undefined;
  /** `CRON_SECRET`. Unset means the endpoint answers 404 to everyone (17.1). */
  cronSecret?: string | undefined;
  /** Where the dead-queue notice goes; both must be set for it to be sent. */
  mailer?: Mailer | undefined;
  ownerEmail?: string | undefined;
  claimLimit?: number | undefined;
  /** The clock, for tests. */
  now?: (() => Date) | undefined;
}

export type NoticeOutcome = "sent" | "skipped" | "none";

export interface JobsRunReport {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
  sweep: SweepCounts;
  notice: NoticeOutcome;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * `Authorization: Bearer <secret>`, compared in constant time. Both sides
 * are hashed first so the comparison runs over equal lengths and a length
 * mismatch is not a faster path.
 */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header || secret.length === 0) {
    return false;
  }
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return false;
  }
  return timingSafeEqual(digest(parts[1]), digest(secret));
}

/**
 * `GET /api/internal/jobs/run` (architecture 10.1): outside `/v1`, a plain
 * Hono sub-app so it never enters the OpenAPI document. Vercel Cron sends
 * the bearer itself; wherever `CRON_SECRET` is unset, or the bearer is
 * wrong, the answer is the 404 problem, so the route does not exist as far
 * as a caller can tell. A run drains what is due, sweeps, and sends the
 * owner a count-only notice when any job is dead.
 */
export function internalJobs(options: JobsOptions) {
  const app = new Hono();
  app.get("/jobs/run", async (c) => {
    const secret = options.cronSecret;
    if (!secret || !bearerMatches(c.req.header("authorization"), secret)) {
      return problem(c, 404, "not_found");
    }
    const now = options.now?.() ?? new Date();
    await enqueueReminders(options.db, now);
    const outcome = await drainDue(
      options.db,
      options.claimLimit ?? DEFAULT_CLAIM_LIMIT,
      options.handlers ?? {},
      now,
    );
    const counts = await sweep(options.db, now);
    let notice: NoticeOutcome = "none";
    if (counts.deadJobs > 0) {
      if (options.mailer && options.ownerEmail) {
        await options.mailer.send(deadQueueNotice(options.ownerEmail, counts.deadJobs));
        notice = "sent";
      } else {
        notice = "skipped";
        console.warn("jobs_dead_notice_skipped", { deadJobs: counts.deadJobs });
      }
    }
    const report: JobsRunReport = {
      claimed: outcome.claimed,
      done: outcome.done.length,
      failed: outcome.failed.length,
      dead: outcome.dead.length,
      sweep: counts,
      notice,
    };
    return c.json(report, 200);
  });
  return app;
}
