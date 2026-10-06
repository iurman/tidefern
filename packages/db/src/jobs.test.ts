import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { withActor } from "./actor";
import type { ActorDatabase } from "./actor";
import {
  BACKOFF_MS,
  CLAIM_LOCK_TIMEOUT_MS,
  JobPayloadError,
  JobTypeError,
  MAX_ATTEMPTS,
  SweepRoleError,
  assertSweepRole,
  backoffAfter,
  claimByIds,
  claimDue,
  complete,
  describeError,
  enqueue,
  fail,
  jobId,
  sweep,
  tombstonedTables,
} from "./jobs";
import type { Job, JobType } from "./jobs";
import * as schema from "./schema/index";
import { ANNA, BEN, id, insertProfile, insertUser, rows } from "./schema/testing";
import type { Harness } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * The outbox on PGlite: enqueue inside a transaction, the skip-locked claim,
 * completion, failure with backoff until `dead`, and the sweep's retention
 * purges with their counts. PGlite holds one connection, so two claimers
 * run back to back on it rather than side by side; the disjointness they
 * must show is the same either way, and B10 covers the pooled endpoint.
 */
let harness: Harness;

const NOW = new Date("2026-10-05T06:00:00Z");
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function enqueueAt(type: JobType, runAfter: Date, jobIdValue?: string): Promise<string> {
  return harness.db.transaction((tx) =>
    enqueue(tx, type, { subjectId: ANNA }, { runAfter, id: jobIdValue }),
  );
}

async function jobRow(jobIdValue: string): Promise<Job | undefined> {
  const [row] = await harness.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobIdValue));
  return row;
}

async function clearJobs(): Promise<void> {
  await harness.db.delete(schema.jobs);
}

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await insertProfile(harness, ANNA);
});

afterAll(() => harness.close());

beforeEach(clearJobs);

describe("jobId", () => {
  test("mints a version 7 UUID whose text order follows time", () => {
    const earlier = jobId(1_700_000_000_000);
    const later = jobId(1_700_000_000_001);
    expect(earlier).toMatch(UUID);
    expect(later).toMatch(UUID);
    expect(earlier < later).toBe(true);
    expect(jobId()).not.toBe(jobId());
  });
});

describe("enqueue", () => {
  test("writes a queued row inside the caller's transaction", async () => {
    const jobIdValue = await harness.db.transaction((tx) =>
      enqueue(
        tx,
        "reminder.send",
        { subjectId: ANNA, childIds: [id(1), id(2)] },
        { runAfter: NOW },
      ),
    );
    const row = await jobRow(jobIdValue);
    expect(row).toMatchObject({
      type: "reminder.send",
      payloadJson: { subjectId: ANNA, childIds: [id(1), id(2)] },
      status: "queued",
      attempts: 0,
      lockedAt: null,
      lastError: null,
    });
    expect(row?.runAfter.toISOString()).toBe(NOW.toISOString());
  });

  test("goes with the transaction when it rolls back", async () => {
    const jobIdValue = id(100);
    await expect(
      harness.db.transaction(async (tx) => {
        await enqueue(tx, "export.step", { requestId: id(5) }, { id: jobIdValue });
        throw new Error("the request failed after enqueueing");
      }),
    ).rejects.toThrow("the request failed");
    expect(await jobRow(jobIdValue)).toBeUndefined();
  });

  test("refuses a type outside the union and a payload with anything but ids", async () => {
    await expect(
      harness.db.transaction((tx) => enqueue(tx, "cycle.flow" as JobType, {})),
    ).rejects.toBeInstanceOf(JobTypeError);
    for (const payload of [
      { note: "heavy flow" },
      { "subject id": ANNA },
      { childIds: [id(1), "nausea"] },
      { date: "2026-10-05" },
    ]) {
      await expect(
        harness.db.transaction((tx) => enqueue(tx, "reminder.send", payload)),
      ).rejects.toBeInstanceOf(JobPayloadError);
    }
    expect(await harness.db.select().from(schema.jobs)).toEqual([]);
  });

  test("works from the app role, because jobs sit outside row level security", async () => {
    const jobIdValue = await withActor(
      ANNA,
      (tx) => enqueue(tx, "mail.invitation", { invitationId: id(7) }),
      harness.db,
    );
    expect((await jobRow(jobIdValue))?.status).toBe("queued");
  });
});

describe("claimDue", () => {
  test("takes the due jobs in due order, marks them running and counts the attempt", async () => {
    const second = await enqueueAt("reminder.send", new Date(NOW.getTime() - HOUR));
    const first = await enqueueAt("reminder.send", new Date(NOW.getTime() - 2 * HOUR));
    const future = await enqueueAt("reminder.send", new Date(NOW.getTime() + HOUR));

    const claimed = await claimDue(harness.db, 10, NOW);
    expect(claimed.map((job) => job.id)).toEqual([first, second]);
    for (const job of claimed) {
      expect(job.status).toBe("running");
      expect(job.attempts).toBe(1);
      expect(job.lockedAt?.toISOString()).toBe(NOW.toISOString());
    }
    expect((await jobRow(future))?.status).toBe("queued");
  });

  test("honours the limit and refuses a bad one", async () => {
    for (let n = 0; n < 3; n += 1) {
      await enqueueAt("photo.process", NOW);
    }
    expect(await claimDue(harness.db, 2, NOW)).toHaveLength(2);
    await expect(claimDue(harness.db, 0, NOW)).rejects.toBeInstanceOf(RangeError);
    await expect(claimDue(harness.db, 1.5, NOW)).rejects.toBeInstanceOf(RangeError);
  });

  test("never hands the same job to two claimers", async () => {
    const ids = [];
    for (let n = 0; n < 4; n += 1) {
      ids.push(await enqueueAt("export.step", NOW));
    }
    const [left, right] = await Promise.all([
      claimDue(harness.db, 2, NOW),
      claimDue(harness.db, 2, NOW),
    ]);
    const taken = [...left, ...right].map((job) => job.id);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(new Set(taken).size).toBe(4);
    expect(taken.sort()).toEqual([...ids].sort());
    expect(await claimDue(harness.db, 2, NOW)).toEqual([]);
  });

  test("reclaims a running job only once its lock has gone stale", async () => {
    const jobIdValue = await enqueueAt("account.delete", NOW);
    await claimDue(harness.db, 1, NOW);
    expect(await claimDue(harness.db, 1, new Date(NOW.getTime() + 60_000))).toEqual([]);
    const reclaimed = await claimDue(
      harness.db,
      1,
      new Date(NOW.getTime() + CLAIM_LOCK_TIMEOUT_MS + 1000),
    );
    expect(reclaimed.map((job) => [job.id, job.attempts])).toEqual([[jobIdValue, 2]]);
  });
});

describe("claimByIds", () => {
  test("claims only the named jobs that are due", async () => {
    const named = await enqueueAt("mail.verification", NOW);
    const other = await enqueueAt("mail.verification", NOW);
    const future = await enqueueAt("mail.verification", new Date(NOW.getTime() + HOUR));
    const claimed = await claimByIds(harness.db, [named, future, id(999)], NOW);
    expect(claimed.map((job) => job.id)).toEqual([named]);
    expect((await jobRow(other))?.status).toBe("queued");
    expect((await jobRow(future))?.status).toBe("queued");
    expect(await claimByIds(harness.db, [], NOW)).toEqual([]);
  });

  test("refuses an id that is not a UUID", async () => {
    await expect(claimByIds(harness.db, ["reminder"], NOW)).rejects.toBeInstanceOf(TypeError);
  });
});

describe("complete", () => {
  test("marks a running job done and clears its lock", async () => {
    const jobIdValue = await enqueueAt("reminder.send", NOW);
    expect(await complete(harness.db, jobIdValue, NOW)).toBe(false);
    await claimDue(harness.db, 1, NOW);
    expect(await complete(harness.db, jobIdValue, NOW)).toBe(true);
    expect(await jobRow(jobIdValue)).toMatchObject({ status: "done", lockedAt: null });
    expect(await claimDue(harness.db, 1, new Date(NOW.getTime() + DAY))).toEqual([]);
  });
});

describe("fail", () => {
  test("backs off by attempt and gives up after the fifth", () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffAfter)).toEqual([...BACKOFF_MS, null, null]);
    expect(MAX_ATTEMPTS).toBe(5);
  });

  test("pushes run_after out by the backoff, then moves the job to dead", async () => {
    const jobIdValue = await enqueueAt("keys.rewrap", NOW);
    let at = NOW;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const [claimed] = await claimDue(harness.db, 1, at);
      expect(claimed?.id).toBe(jobIdValue);
      expect(claimed?.attempts).toBe(attempt);
      const status = await fail(harness.db, jobIdValue, new Error("provider down"), at);
      const row = await jobRow(jobIdValue);
      if (attempt < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[attempt - 1] as number;
        expect(status).toBe("failed");
        expect(row?.runAfter.getTime()).toBe(at.getTime() + wait);
        expect(await claimDue(harness.db, 1, new Date(at.getTime() + wait - 1))).toEqual([]);
        at = row?.runAfter as Date;
      } else {
        expect(status).toBe("dead");
        expect(row?.runAfter.getTime()).toBe(at.getTime());
      }
      expect(row?.lockedAt).toBeNull();
    }
    expect(await claimDue(harness.db, 1, new Date(at.getTime() + DAY))).toEqual([]);
  });

  test("records the error's name and code, never its message", async () => {
    const jobIdValue = await enqueueAt("reminder.send", NOW);
    await claimDue(harness.db, 1, NOW);
    const refused = Object.assign(new Error("Key (subject_id)=(a-real-looking-value) exists"), {
      code: "23505",
    });
    refused.name = "DatabaseError";
    await fail(harness.db, jobIdValue, refused, NOW);
    const row = await jobRow(jobIdValue);
    expect(row?.lastError).toBe("DatabaseError 23505");
    expect(row?.lastError).not.toContain("Key");
    expect(describeError(new TypeError("x"))).toBe("TypeError");
    expect(describeError("boom")).toBe("string");
  });

  test("answers null for a job that is not running", async () => {
    const jobIdValue = await enqueueAt("reminder.send", NOW);
    expect(await fail(harness.db, jobIdValue, new Error("x"), NOW)).toBeNull();
    expect(await fail(harness.db, id(404), new Error("x"), NOW)).toBeNull();
    expect((await jobRow(jobIdValue))?.status).toBe("queued");
  });
});

describe("sweep", () => {
  test("finds every table with a deleted_at column", async () => {
    const catalog = rows(
      await harness.db.execute(
        sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'deleted_at' order by table_name`,
      ),
    ).map((row) => row.table_name);
    expect(
      tombstonedTables()
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(catalog);
    expect(catalog).toContain("notes");
    expect(catalog).toContain("cycle_entries");
  });

  test("removes expired rows, counts them, and leaves the rest", async () => {
    const oldAudit = id(200);
    const freshAudit = id(201);
    await harness.db.insert(schema.idempotencyKeys).values([
      {
        id: id(210),
        actorId: ANNA,
        key: id(211),
        route: "entries.put",
        requestHash: "a",
        createdAt: new Date(NOW.getTime() - 25 * HOUR),
      },
      {
        id: id(212),
        actorId: ANNA,
        key: id(213),
        route: "entries.put",
        requestHash: "b",
        createdAt: new Date(NOW.getTime() - HOUR),
      },
    ]);
    await harness.db.insert(schema.notes).values([
      {
        id: id(220),
        subjectId: ANNA,
        date: "2026-08-01",
        body: Uint8Array.from([1]),
        kekVersion: "v1",
        deletedAt: new Date(NOW.getTime() - 31 * DAY),
      },
      {
        id: id(221),
        subjectId: ANNA,
        date: "2026-10-01",
        body: Uint8Array.from([1]),
        kekVersion: "v1",
        deletedAt: new Date(NOW.getTime() - DAY),
      },
      {
        id: id(222),
        subjectId: ANNA,
        date: "2026-10-04",
        body: Uint8Array.from([1]),
        kekVersion: "v1",
      },
    ]);
    await harness.db.insert(schema.cycleEntries).values([
      {
        id: id(230),
        subjectId: ANNA,
        date: "2026-07-01",
        deletedAt: new Date(NOW.getTime() - 40 * DAY),
      },
      { id: id(231), subjectId: ANNA, date: "2026-10-04" },
    ]);
    await harness.db.insert(schema.auditEvents).values([
      {
        id: oldAudit,
        actorId: BEN,
        action: "grant.read",
        subjectId: ANNA,
        createdAt: new Date(NOW.getTime() - 400 * DAY),
      },
      {
        id: freshAudit,
        actorId: BEN,
        action: "grant.read",
        subjectId: ANNA,
        createdAt: new Date(NOW.getTime() - 10 * DAY),
      },
    ]);
    await harness.db.insert(schema.productEvents).values([
      { id: id(240), day: "2026-06-01", name: "sweep.run", count: 1 },
      { id: id(241), day: "2026-10-01", name: "sweep.run", count: 1 },
    ]);
    await harness.db.insert(schema.jobs).values({
      id: id(250),
      type: "reminder.send",
      payloadJson: { subjectId: ANNA },
      status: "dead",
      attempts: 5,
    });

    const counts = await sweep(harness.db, NOW);
    expect(counts).toMatchObject({
      idempotencyKeys: 1,
      auditEvents: 1,
      productEvents: 1,
      closures: 0,
      deadJobs: 1,
    });
    expect(counts.tombstones["notes"]).toBe(1);
    expect(counts.tombstones["cycle_entries"]).toBe(1);
    expect(Object.values(counts.tombstones).reduce((sum, n) => sum + n, 0)).toBe(2);

    expect((await harness.db.select().from(schema.idempotencyKeys)).map((row) => row.id)).toEqual([
      id(212),
    ]);
    expect((await harness.db.select().from(schema.notes)).map((row) => row.id).sort()).toEqual([
      id(221),
      id(222),
    ]);
    expect((await harness.db.select().from(schema.cycleEntries)).map((row) => row.id)).toEqual([
      id(231),
    ]);
    expect((await harness.db.select().from(schema.auditEvents)).map((row) => row.id)).toEqual([
      freshAudit,
    ]);
    expect((await harness.db.select().from(schema.productEvents)).map((row) => row.day)).toEqual([
      "2026-10-01",
    ]);

    const again = await sweep(harness.db, NOW);
    expect(again.idempotencyKeys + again.auditEvents + again.productEvents).toBe(0);
    expect(Object.values(again.tombstones).every((n) => n === 0)).toBe(true);
    expect(again.deadJobs).toBe(1);
  });

  test("refuses to run as the app role instead of silently purging nothing", async () => {
    const asApp: ActorDatabase = {
      transaction: (fn) =>
        harness.db.transaction(async (tx) => {
          await tx.execute(sql`set local role tidefern_app`);
          return fn(tx);
        }),
    };
    await expect(sweep(asApp, NOW)).rejects.toBeInstanceOf(SweepRoleError);
  });

  test("assertSweepRole makes the same check before a runner drains", async () => {
    const asApp: ActorDatabase = {
      transaction: (fn) =>
        harness.db.transaction(async (tx) => {
          await tx.execute(sql`set local role tidefern_app`);
          return fn(tx);
        }),
    };
    await expect(assertSweepRole(harness.db)).resolves.toBeUndefined();
    await expect(assertSweepRole(asApp)).rejects.toBeInstanceOf(SweepRoleError);
  });
});
