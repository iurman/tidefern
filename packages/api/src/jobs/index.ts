import { claimByIds, claimDue, complete, describeError, fail } from "@tidefern/db/jobs";
import type { ActorDatabase, Job, JobType } from "@tidefern/db/jobs";

/**
 * What a handler gets besides the job: the runner's database, so a handler
 * that acts for one person opens `withActor` on it, and the instant the
 * drain started, so every job in one drain sees the same "now".
 */
export interface JobContext {
  db: ActorDatabase;
  now: Date;
}

export type JobHandler = (job: Job, context: JobContext) => Promise<void>;

/**
 * The registry: one handler per job type. A type without a handler fails
 * like any other job and reaches `dead` after five attempts, so a payload
 * written before its handler shipped shows up in the owner notice instead
 * of vanishing.
 */
export type JobHandlers = Partial<Record<JobType, JobHandler>>;

export class UnhandledJobTypeError extends Error {
  override readonly name = "UnhandledJobTypeError";

  constructor(type: string) {
    super(`no handler is registered for job type ${type}`);
  }
}

export interface DrainOutcome {
  /** How many jobs this drain claimed. */
  claimed: number;
  done: string[];
  failed: string[];
  dead: string[];
}

/**
 * Runs each claimed job once: the handler, then `complete`; on a throw,
 * `fail` with backoff. The log line names the type and the error's name,
 * never the payload.
 */
export async function runClaimed(
  db: ActorDatabase,
  handlers: JobHandlers,
  jobs: readonly Job[],
  now: Date,
): Promise<DrainOutcome> {
  const outcome: DrainOutcome = { claimed: jobs.length, done: [], failed: [], dead: [] };
  for (const job of jobs) {
    const handler = handlers[job.type as JobType];
    try {
      if (!handler) {
        throw new UnhandledJobTypeError(job.type);
      }
      await handler(job, { db, now });
      await complete(db, job.id, now);
      outcome.done.push(job.id);
    } catch (error) {
      const status = await fail(db, job.id, error, now);
      (status === "dead" ? outcome.dead : outcome.failed).push(job.id);
      console.warn("job_failed", { type: job.type, status, error: describeError(error) });
    }
  }
  return outcome;
}

/**
 * The inline drain (10.1): a request that enqueued jobs hands their ids to
 * this through `c.var.drainJobs` after its transaction commits, and the
 * host runs it after the response. Only the named jobs are claimed; one
 * that is not yet due, or that another drain already took, is left alone.
 */
export async function drainEnqueued(
  db: ActorDatabase,
  ids: readonly string[],
  handlers: JobHandlers,
  now: Date = new Date(),
): Promise<DrainOutcome> {
  return runClaimed(db, handlers, await claimByIds(db, ids, now), now);
}

/** The scheduled drain: whatever is due, up to `limit` jobs. */
export async function drainDue(
  db: ActorDatabase,
  limit: number,
  handlers: JobHandlers,
  now: Date = new Date(),
): Promise<DrainOutcome> {
  return runClaimed(db, handlers, await claimDue(db, limit, now), now);
}
