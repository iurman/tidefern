import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { withActor, withSystem } from "./actor";
import {
  CLOSURE_TOMBSTONE_MS,
  closureDeletions,
  closuresWithoutJob,
  deleteNextUserRows,
  emailHmac,
  forgetClosureJobs,
  openClosureOf,
  purgeClosureTombstones,
} from "./closure";
import { sweep } from "./jobs";
import * as schema from "./schema/index";
import { ANNA, BEN, CARA, id, insertProfile, insertUser } from "./schema/testing";
import type { Harness } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * The database side of account closure (task I2): the open-closure read the
 * session layer uses, the keyed hash the tombstone keeps, the ordered
 * table-by-table deletion, and the sweep's two closure duties (a fresh job
 * for a closure past its window whose job is gone, the 30 day tombstone
 * purge).
 */
let harness: Harness;

const NOW = new Date("2026-10-05T06:00:00Z");
const DAY = 24 * 60 * 60_000;

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await insertUser(harness, CARA, "cara@example.test");
  await insertProfile(harness, ANNA);
  await insertProfile(harness, BEN);
});

afterAll(() => harness.close());

beforeEach(async () => {
  await harness.db.delete(schema.jobs);
  await harness.db.delete(schema.dataRequests);
});

async function closure(
  n: number,
  values: Partial<typeof schema.dataRequests.$inferInsert>,
): Promise<string> {
  const requestId = id(n);
  await harness.db.insert(schema.dataRequests).values({
    id: requestId,
    kind: "closure",
    deadlineAt: new Date(NOW.getTime() + 45 * DAY),
    ...values,
  });
  return requestId;
}

describe("emailHmac", () => {
  test("is HMAC-SHA256 of the trimmed, lower-cased address as base64url", () => {
    const expected = createHmac("sha256", "secret").update("anna@example.test").digest("base64url");
    expect(emailHmac("secret", " Anna@Example.TEST ")).toBe(expected);
    expect(emailHmac("secret", "anna@example.test")).not.toContain("anna");
    expect(emailHmac("other", "anna@example.test")).not.toBe(expected);
  });

  test("refuses an empty secret", () => {
    expect(() => emailHmac("", "anna@example.test")).toThrow(TypeError);
  });
});

describe("openClosureOf", () => {
  test("finds a requested or in-progress closure as the person herself, and nothing else", async () => {
    await closure(1, { userId: ANNA, state: "requested", undoUntil: NOW });
    await closure(2, { userId: BEN, state: "cancelled", undoUntil: NOW, completedAt: NOW });
    await closure(3, { userId: CARA, state: "in_progress" });
    expect(await withActor(ANNA, (tx) => openClosureOf(tx, ANNA), harness.db)).toEqual({
      id: id(1),
      state: "requested",
    });
    expect(await withActor(BEN, (tx) => openClosureOf(tx, BEN), harness.db)).toBeUndefined();
    expect(await withActor(CARA, (tx) => openClosureOf(tx, CARA), harness.db)).toMatchObject({
      state: "in_progress",
    });
    // The policy shows her only her own: Ben cannot see Anna's.
    expect(await withActor(BEN, (tx) => openClosureOf(tx, ANNA), harness.db)).toBeUndefined();
  });
});

describe("deleteNextUserRows", () => {
  test("deletes one table per call in the listed order, then reports nothing left", async () => {
    await harness.db.insert(schema.cycleEntries).values([
      { id: id(101), subjectId: CARA, date: "2026-09-28", flow: "light" },
      { id: id(102), subjectId: BEN, date: "2026-09-28", flow: "light" },
    ]);
    await harness.db.insert(schema.entrySymptoms).values({
      id: id(103),
      entryId: id(101),
      subjectId: CARA,
      code: "cramps",
    });
    await harness.db.insert(schema.consents).values({
      id: id(104),
      subjectId: CARA,
      category: "cycle.history",
      basis: "necessary",
      purpose: "Keep the calendar.",
      policyVersion: "2026-10",
      textHash: "0".repeat(64),
    });
    await harness.db.insert(schema.auditEvents).values([
      { id: id(105), actorId: BEN, action: "partner.read", subjectId: CARA },
      { id: id(106), actorId: BEN, action: "partner.read", subjectId: BEN },
    ]);
    const steps: string[] = [];
    for (;;) {
      const step = await withSystem((tx) => deleteNextUserRows(tx, CARA), harness.db);
      if (step === null) break;
      expect(step.removed).toBeGreaterThan(0);
      steps.push(step.table);
    }
    expect(steps).toEqual(["audit_events", "entry_symptoms", "cycle_entries", "consents"]);
    const order = closureDeletions.map((deletion) => deletion.table);
    expect([...steps].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(steps);
    // A second call finds nothing: a retried step is a no-op.
    expect(await withSystem((tx) => deleteNextUserRows(tx, CARA), harness.db)).toBeNull();
    // Ben's rows, and the audit row Ben wrote about himself, stay.
    expect(
      await harness.db
        .select()
        .from(schema.cycleEntries)
        .where(eq(schema.cycleEntries.id, id(102))),
    ).toHaveLength(1);
    expect(
      await harness.db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.id, id(106))),
    ).toHaveLength(1);
    await harness.db.delete(schema.cycleEntries);
    await harness.db.delete(schema.auditEvents);
  });

  test("removes a household left with nobody, and keeps one that still holds someone", async () => {
    const lonely = id(201);
    const shared = id(202);
    await harness.db.insert(schema.households).values([{ id: lonely }, { id: shared }]);
    await harness.db.insert(schema.householdMembers).values([
      { id: id(203), householdId: lonely, userId: CARA, role: "owner" },
      { id: id(204), householdId: shared, userId: CARA, role: "owner" },
      { id: id(205), householdId: shared, userId: BEN, role: "partner" },
    ]);
    const steps: string[] = [];
    for (;;) {
      const step = await withSystem((tx) => deleteNextUserRows(tx, CARA), harness.db);
      if (step === null) break;
      steps.push(step.table);
    }
    expect(steps).toEqual(["households", "household_members"]);
    const left = await harness.db.select({ id: schema.households.id }).from(schema.households);
    expect(left.map((row) => row.id)).toEqual([shared]);
    const members = await harness.db.select().from(schema.householdMembers);
    expect(members.map((row) => row.userId)).toEqual([BEN]);
    await harness.db.delete(schema.households);
  });

  test("leaves the closure's own job and takes every other job that names her, finished ones too", async () => {
    await harness.db.insert(schema.jobs).values([
      { id: id(301), type: "account.delete", payloadJson: { requestId: id(1), userId: CARA } },
      { id: id(302), type: "reminder.send", payloadJson: { subjectId: CARA } },
      { id: id(303), type: "reminder.send", payloadJson: { subjectId: BEN } },
      { id: id(304), type: "reminder.send", payloadJson: { subjectId: CARA }, status: "done" },
    ]);
    expect(await withSystem((tx) => deleteNextUserRows(tx, CARA), harness.db)).toEqual({
      table: "jobs",
      removed: 2,
    });
    const left = await harness.db.select({ id: schema.jobs.id }).from(schema.jobs);
    expect(left.map((row) => row.id).sort()).toEqual([id(301), id(303)]);
  });

  test("forgetClosureJobs strips her id from that closure's jobs only, finished or not", async () => {
    await harness.db.insert(schema.jobs).values([
      { id: id(311), type: "account.delete", payloadJson: { requestId: id(1), userId: CARA } },
      {
        id: id(312),
        type: "account.delete",
        payloadJson: { requestId: id(1), userId: CARA },
        status: "done",
      },
      { id: id(313), type: "account.delete", payloadJson: { requestId: id(2), userId: BEN } },
      { id: id(314), type: "reminder.send", payloadJson: { requestId: id(1), userId: CARA } },
    ]);
    expect(await withSystem((tx) => forgetClosureJobs(tx, id(1)), harness.db)).toBe(2);
    const rows = await harness.db
      .select({ id: schema.jobs.id, payloadJson: schema.jobs.payloadJson })
      .from(schema.jobs);
    const payloadOf = (jobId: string) => rows.find((row) => row.id === jobId)?.payloadJson;
    expect(payloadOf(id(311))).toEqual({ requestId: id(1) });
    expect(payloadOf(id(312))).toEqual({ requestId: id(1) });
    expect(payloadOf(id(313))).toEqual({ requestId: id(2), userId: BEN });
    expect(payloadOf(id(314))).toEqual({ requestId: id(1), userId: CARA });
    // A second call finds nothing left to strip.
    expect(await withSystem((tx) => forgetClosureJobs(tx, id(1)), harness.db)).toBe(0);
  });
});

describe("the sweep's closure duties", () => {
  test("gives a closure past its window with no live job a fresh one, and leaves the rest", async () => {
    // Past the window, its job dead: needs a new one.
    const stuck = await closure(11, {
      userId: ANNA,
      state: "requested",
      undoUntil: new Date(NOW.getTime() - 1000),
    });
    await harness.db.insert(schema.jobs).values({
      id: id(411),
      type: "account.delete",
      payloadJson: { requestId: stuck, userId: ANNA },
      status: "dead",
      attempts: 5,
    });
    // In progress (delete now), no job at all: needs one.
    const orphan = await closure(12, { userId: BEN, state: "in_progress" });
    // Inside the window: its job waits for the end, nothing to do.
    await closure(13, {
      userId: CARA,
      state: "requested",
      undoUntil: new Date(NOW.getTime() + DAY),
    });
    // Past the window but with a queued job: nothing to do.
    const queued = await closure(14, {
      emailHmac: "hash",
      state: "in_progress",
    });
    await harness.db.insert(schema.jobs).values({
      id: id(414),
      type: "account.delete",
      payloadJson: { requestId: queued },
    });

    const due = await withSystem((tx) => closuresWithoutJob(tx, NOW), harness.db);
    expect(due.map((row) => row.requestId).sort()).toEqual([stuck, orphan].sort());

    const counts = await sweep(harness.db, NOW);
    expect(counts.closures).toBe(2);
    const fresh = await harness.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"));
    const added = fresh.filter((job) => job.id !== id(414));
    // The request id alone: no new job names the person.
    expect(added.map((job) => job.payloadJson)).toEqual(
      expect.arrayContaining([{ requestId: stuck }, { requestId: orphan }]),
    );
    expect(added).toHaveLength(2);
    for (const job of added) {
      expect(job.type).toBe("account.delete");
      expect(job.runAfter.getTime()).toBe(NOW.getTime());
    }
    // A second sweep finds every closure with a live job and adds nothing.
    expect((await sweep(harness.db, NOW)).closures).toBe(0);
  });

  test("removes a completed closure tombstone after 30 days and keeps a younger one", async () => {
    const old = await closure(21, {
      emailHmac: "old",
      state: "completed",
      completedAt: new Date(NOW.getTime() - CLOSURE_TOMBSTONE_MS - 1000),
    });
    const young = await closure(22, {
      emailHmac: "young",
      state: "completed",
      completedAt: new Date(NOW.getTime() - CLOSURE_TOMBSTONE_MS + DAY),
    });
    // An old completed request that still names a person is not a tombstone.
    const named = await closure(23, {
      userId: BEN,
      state: "completed",
      completedAt: new Date(NOW.getTime() - 60 * DAY),
    });
    expect(await withSystem((tx) => purgeClosureTombstones(tx, NOW), harness.db)).toBe(1);
    const left = await harness.db.select({ id: schema.dataRequests.id }).from(schema.dataRequests);
    expect(left.map((row) => row.id).sort()).toEqual([young, named].sort());
    expect(left.map((row) => row.id)).not.toContain(old);

    await closure(24, {
      emailHmac: "older",
      state: "completed",
      completedAt: new Date(NOW.getTime() - 31 * DAY),
    });
    expect((await sweep(harness.db, NOW)).closureTombstones).toBe(1);
  });
});
