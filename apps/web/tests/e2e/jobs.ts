import type { APIRequestContext } from "@playwright/test";
import { baseOrigin } from "./session";

/**
 * The scheduled job run, called from a spec (task J3d): `GET
 * /api/internal/jobs/run` with the cron's bearer, the same request Vercel
 * Cron sends (architecture 10.1). It enqueues the day's reminders, drains
 * every due job (an account closure among them), sweeps and answers counts
 * only. The route exists only on a server that has the job runner: the
 * owner role's direct string in `DATABASE_URL_UNPOOLED` and a `CRON_SECRET`;
 * a closure also needs `OWNER_EMAIL` for the processor notice. CI's seeded
 * server has all three as test-only values, and the Playwright step gets
 * the same `CRON_SECRET`; anywhere else the route answers 404 to everyone.
 */

const JOBS_RUN_PATH = "/api/internal/jobs/run";

/** What one run reports (`JobsRunReport` in packages/api); the sweep's counts are left out. */
export interface JobsRun {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
}

const notMounted =
  "the job runner is not mounted: start the seeded server with DATABASE_URL_UNPOOLED (the owner URL), " +
  "CRON_SECRET and OWNER_EMAIL, and give Playwright the same CRON_SECRET (.github/workflows/ci.yml)";

/** Runs the due jobs once and returns the counts; throws when the runner is not there. */
export async function runDueJobs(request: APIRequestContext): Promise<JobsRun> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error(`CRON_SECRET is not set for the browser suite; ${notMounted}`);
  const response = await request.get(`${baseOrigin()}${JOBS_RUN_PATH}`, {
    headers: { authorization: `Bearer ${secret}` },
    // A run drains batch after batch, within the host's 60 second maxDuration.
    timeout: 90_000,
  });
  if (response.status() === 404) throw new Error(notMounted);
  if (!response.ok()) {
    throw new Error(`${JOBS_RUN_PATH} answered ${response.status()}`);
  }
  const report = (await response.json()) as JobsRun;
  return {
    claimed: report.claimed,
    done: report.done,
    failed: report.failed,
    dead: report.dead,
  };
}
