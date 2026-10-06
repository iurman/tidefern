import { randomBytes } from "node:crypto";

import {
  and,
  asc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  is,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";

import { isActorId, withSystem } from "./actor";
import type { ActorDatabase, Transaction } from "./actor";
import { closuresWithoutJob, purgeClosureTombstones } from "./closure";
import * as schema from "./schema/index";
import type { JobPayload } from "./schema/platform";

export type { ActorDatabase, Transaction } from "./actor";
export type { JobPayload } from "./schema/platform";

/**
 * The outbox of architecture record 10.1. A job is written in the same
 * transaction as the change that caused it (`enqueue`), claimed by a drain
 * with `SELECT ... FOR UPDATE SKIP LOCKED` (`claimDue`, `claimByIds`), and
 * then either `complete`d or `fail`ed with backoff until it is `dead`. The
 * daily `sweep` runs the retention purges and reports what it removed.
 *
 * `jobs` carries no row level security (7.2): a job names ids, never
 * content, and a handler that acts for one person opens `withActor` itself.
 */

/**
 * Every job type the handlers know. The names are neutral on purpose: they
 * appear in `jobs.type`, in log lines and in the dead-queue count, so none of
 * them may say what a person tracks.
 */
export const jobTypeValues = [
  "mail.verification",
  "mail.invitation",
  "reminder.send",
  "export.step",
  "account.delete",
  "photo.process",
  "keys.rewrap",
] as const;

export type JobType = (typeof jobTypeValues)[number];

export type Job = typeof schema.jobs.$inferSelect;

export type JobStatus = Job["status"];

/** A fifth failure moves the job to `dead` (10.1). */
export const MAX_ATTEMPTS = 5;

/**
 * A `running` row whose lock is older than this is a drain that died
 * mid-job (a function timeout, a crashed process), so it is claimable
 * again. Three times the Hobby function ceiling of 300 seconds.
 */
export const CLAIM_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * How long a failed job waits before the next attempt, indexed by the
 * number of attempts already made. The inline drain retries within the
 * request's `defer`; anything longer waits for the next sweep.
 */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const;

export const RETENTION = {
  /** Idempotency rows (5.3). */
  idempotencyMs: 24 * 60 * 60_000,
  /** Tombstoned rows, on every table with a `deleted_at` column (7.3). */
  tombstoneMs: 30 * 24 * 60 * 60_000,
  /** The append-only audit log (11). */
  auditMs: 365 * 24 * 60 * 60_000,
  /** Daily counters (7.4, 19). */
  productEventDays: 90,
} as const;

export class JobTypeError extends TypeError {
  override readonly name = "JobTypeError";
}

export class JobPayloadError extends TypeError {
  override readonly name = "JobPayloadError";
}

/** Thrown when the sweep runs on a connection the policies treat as the app role. */
export class SweepRoleError extends Error {
  override readonly name = "SweepRoleError";

  constructor() {
    super(
      "The sweep deletes rows under row level security and needs the owner role: " +
        "run it on DATABASE_URL_UNPOOLED, never on the tidefern_app connection.",
    );
  }
}

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then random bits with
 * the version and variant set. Time-ordered ids keep the claim scan
 * (`run_after, id`) cheap and let a dead row be dated at a glance.
 */
export function jobId(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  // 48 bits of milliseconds as a 16-bit high word and a 32-bit low word, so
  // no BigInt is needed and the web build's lower target type-checks this.
  const high = Math.floor(now / 0x1_0000_0000);
  const low = now % 0x1_0000_0000;
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isJobType(value: string): value is JobType {
  return (jobTypeValues as readonly string[]).includes(value);
}

const PAYLOAD_KEY = /^[a-z][A-Za-z0-9]*$/;

/**
 * Ids only (10.1): every value is a UUID or a list of UUIDs under a short
 * camelCase key. The database cannot check this, so the writer does.
 */
export function assertIdsOnly(payload: JobPayload): void {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new JobPayloadError("a job payload is an object of ids");
  }
  for (const [key, value] of Object.entries(payload)) {
    if (!PAYLOAD_KEY.test(key)) {
      throw new JobPayloadError(`payload key ${JSON.stringify(key)} is not a plain camelCase name`);
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item !== "string" || !isActorId(item)) {
        throw new JobPayloadError(
          `payload key ${JSON.stringify(key)} holds something other than ids`,
        );
      }
    }
  }
}

export interface EnqueueOptions {
  /** When the job becomes due; now by default. */
  runAfter?: Date | undefined;
  /** A caller-minted id, for a test or an idempotent writer; a UUIDv7 otherwise. */
  id?: string | undefined;
}

/**
 * Writes one job inside the caller's transaction so it commits with the
 * change that caused it, or not at all. Returns the job id so the request
 * can hand it to the inline drain after the commit.
 */
export async function enqueue(
  tx: Transaction,
  type: JobType,
  payload: JobPayload = {},
  options: EnqueueOptions = {},
): Promise<string> {
  if (!isJobType(type)) {
    throw new JobTypeError(`unknown job type ${JSON.stringify(type)}`);
  }
  assertIdsOnly(payload);
  const id = options.id ?? jobId();
  await tx.insert(schema.jobs).values({
    id,
    type,
    payloadJson: payload,
    runAfter: options.runAfter ?? new Date(),
  });
  return id;
}

function byDueOrder(a: Job, b: Job): number {
  const byTime = a.runAfter.getTime() - b.runAfter.getTime();
  return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The claim itself: the matching rows are locked with `FOR UPDATE SKIP
 * LOCKED`, so two drains running at once never take the same row, then
 * marked `running` with the lock time and one more attempt. The returned
 * rows are in due order.
 */
async function claim(
  tx: Transaction,
  condition: ReturnType<typeof and>,
  limit: number,
  now: Date,
): Promise<Job[]> {
  const candidates = tx
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(condition)
    .orderBy(asc(schema.jobs.runAfter), asc(schema.jobs.id))
    .limit(limit)
    .for("update", { skipLocked: true });
  const claimed = await tx
    .update(schema.jobs)
    .set({
      status: "running",
      lockedAt: now,
      attempts: sql`${schema.jobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(inArray(schema.jobs.id, candidates))
    .returning();
  return claimed.sort(byDueOrder);
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("claim limit must be a positive integer");
  }
}

/**
 * Claims up to `limit` jobs that are due: `queued` or `failed` with
 * `run_after` in the past, plus any `running` row whose lock has gone stale.
 */
export async function claimDue(
  db: ActorDatabase,
  limit: number,
  now: Date = new Date(),
): Promise<Job[]> {
  assertLimit(limit);
  const stale = new Date(now.getTime() - CLAIM_LOCK_TIMEOUT_MS);
  return db.transaction((tx) =>
    claim(
      tx,
      or(
        and(inArray(schema.jobs.status, ["queued", "failed"]), lte(schema.jobs.runAfter, now)),
        and(eq(schema.jobs.status, "running"), lt(schema.jobs.lockedAt, stale)),
      ),
      limit,
      now,
    ),
  );
}

/**
 * Claims only the named jobs, when they are due and not already taken: the
 * inline drain's call, right after the request that enqueued them commits.
 */
export async function claimByIds(
  db: ActorDatabase,
  ids: readonly string[],
  now: Date = new Date(),
): Promise<Job[]> {
  if (ids.length === 0) {
    return [];
  }
  for (const id of ids) {
    if (!isActorId(id)) {
      throw new TypeError("claimByIds needs UUID job ids");
    }
  }
  return db.transaction((tx) =>
    claim(
      tx,
      and(
        inArray(schema.jobs.id, [...ids]),
        inArray(schema.jobs.status, ["queued", "failed"]),
        lte(schema.jobs.runAfter, now),
      ),
      ids.length,
      now,
    ),
  );
}

/** Marks a running job `done`. Returns false when the row was not running. */
export async function complete(
  db: ActorDatabase,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db.transaction((tx) =>
    tx
      .update(schema.jobs)
      .set({ status: "done", lockedAt: null, lastError: null, updatedAt: now })
      .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "running")))
      .returning({ id: schema.jobs.id }),
  );
  return updated.length === 1;
}

/**
 * What `last_error` records: the error's name and, when the driver set one,
 * its code. Never the message, because a database error can quote the row
 * it refused and a job row must stay free of content.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code.length > 0 ? `${error.name} ${code}` : error.name;
  }
  return typeof error;
}

/** The wait before the next attempt, or null when the job has used them all. */
export function backoffAfter(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) {
    return null;
  }
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1] ?? null;
}

/**
 * Records a failed attempt. The job goes back to `failed` with its next
 * `run_after` pushed out by the backoff for its attempt count, or to `dead`
 * after the fifth attempt, where the sweep's owner notice counts it.
 */
export async function fail(
  db: ActorDatabase,
  id: string,
  error: unknown,
  now: Date = new Date(),
): Promise<JobStatus | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ attempts: schema.jobs.attempts, status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, id))
      .for("update");
    if (!row || row.status !== "running") {
      return null;
    }
    const wait = backoffAfter(row.attempts);
    const status: JobStatus = wait === null ? "dead" : "failed";
    await tx
      .update(schema.jobs)
      .set({
        status,
        lockedAt: null,
        lastError: describeError(error),
        runAfter: wait === null ? now : new Date(now.getTime() + wait),
        updatedAt: now,
      })
      .where(eq(schema.jobs.id, id));
    return status;
  });
}

export interface SweepCounts {
  idempotencyKeys: number;
  /** Rows removed per table, keyed by table name. */
  tombstones: Record<string, number>;
  auditEvents: number;
  productEvents: number;
  /**
   * Open closures past their undo window whose `account.delete` job was
   * missing or dead, each given a fresh job due now (task I2).
   */
  closures: number;
  /** Closure tombstones removed after their 30 days (architecture 11). */
  closureTombstones: number;
  /** Jobs sitting in `dead` after the sweep; the owner notice reports this count. */
  deadJobs: number;
}

interface TombstonedTable {
  table: PgTable;
  name: string;
  deletedAt: PgColumn;
}

/** Every table in the schema with a `deleted_at` column, in schema order. */
export function tombstonedTables(): TombstonedTable[] {
  const found: TombstonedTable[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) {
      continue;
    }
    const columns: Record<string, PgColumn> = getTableColumns(value);
    const deletedAt = columns["deletedAt"];
    if (deletedAt && deletedAt.name === "deleted_at") {
      found.push({ table: value, name: getTableName(value), deletedAt });
    }
  }
  return found;
}

async function purge(
  tx: Transaction,
  table: PgTable,
  condition: ReturnType<typeof lt>,
): Promise<number> {
  const removed = await tx
    .delete(table)
    .where(condition)
    .returning({ one: sql<number>`1` });
  return removed.length;
}

/** `YYYY-MM-DD` in UTC for a `date` column cutoff. */
function dayBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

async function assertSystemContext(tx: Transaction): Promise<void> {
  const [context] = (
    (await tx.execute(sql`select is_system() as system`)) as {
      rows: Record<string, unknown>[];
    }
  ).rows;
  if (context?.system !== true) {
    throw new SweepRoleError();
  }
}

/**
 * The check the sweep makes, on its own: resolves when the connection is one
 * the policies treat as system (the owner role under `withSystem`) and
 * throws `SweepRoleError` on the app role. A runner that drains and then
 * sweeps calls this first, so a wrong connection is refused before any job
 * is claimed rather than after the drain has already run.
 */
export async function assertSweepRole(db: ActorDatabase): Promise<void> {
  await withSystem(assertSystemContext, db);
}

/**
 * The retention purges of 10.1, in one system transaction, with the number
 * of rows each removed. Idempotency rows go after 24 hours, tombstoned rows
 * after 30 days, audit events after a year, daily counters after 90 days,
 * closure tombstones after 30 days; and every open closure whose window has
 * passed without a live deletion job gets one (task I2). The purges run under
 * forced row level security, so the connection must be the owner role:
 * on the app role `is_system()` is false and the sweep refuses rather than
 * silently removing nothing.
 */
export async function sweep(db: ActorDatabase, now: Date = new Date()): Promise<SweepCounts> {
  return withSystem(async (tx) => {
    await assertSystemContext(tx);
    const idempotencyKeys = await purge(
      tx,
      schema.idempotencyKeys,
      lt(schema.idempotencyKeys.createdAt, new Date(now.getTime() - RETENTION.idempotencyMs)),
    );
    const tombstones: Record<string, number> = {};
    const tombstoneCutoff = new Date(now.getTime() - RETENTION.tombstoneMs);
    for (const { table, name, deletedAt } of tombstonedTables()) {
      tombstones[name] = await purge(tx, table, lt(deletedAt, tombstoneCutoff));
    }
    const auditEvents = await purge(
      tx,
      schema.auditEvents,
      lt(schema.auditEvents.createdAt, new Date(now.getTime() - RETENTION.auditMs)),
    );
    const productEvents = await purge(
      tx,
      schema.productEvents,
      lt(schema.productEvents.day, dayBefore(now, RETENTION.productEventDays)),
    );
    let closures = 0;
    for (const { requestId, userId } of await closuresWithoutJob(tx, now)) {
      await enqueue(tx, "account.delete", userId === null ? { requestId } : { requestId, userId }, {
        runAfter: now,
      });
      closures += 1;
    }
    const closureTombstones = await purgeClosureTombstones(tx, now);
    const [dead] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "dead"));
    return {
      idempotencyKeys,
      tombstones,
      auditEvents,
      productEvents,
      closures,
      closureTombstones,
      deadJobs: dead?.count ?? 0,
    };
  }, db);
}
