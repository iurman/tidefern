import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  SubjectKeyMissingError,
  createKeyCache,
  decryptFieldFor,
  encryptFieldFor,
  provisionChildKey,
  unwrapForSubject,
} from "@tidefern/crypto";
import { closureDeletions, emailHmac, schema } from "@tidefern/db";
import { claimDue } from "@tidefern/db/jobs";
import type { Job } from "@tidefern/db/jobs";

import { createApp } from "../app";
import { ACCOUNT_CLOSING } from "../auth";
import { IDEMPOTENCY_KEY_HEADER } from "../middleware/idempotency";
import { ANNA, BEN, CARA, OWN_ORIGIN } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import {
  CHILD,
  HOUSEHOLD,
  KEK,
  NOTES,
  TEXTS,
  TOKENS,
  createAccountFixture,
  withInjected,
} from "../test/account";
import type { AccountFixture } from "../test/account";
import {
  ClosureConfigurationError,
  advanceClosure,
  createClosureHandler,
  processorNotice,
} from "./closure";
import type { ClosureSettings, ObjectStore } from "./closure";
import { drainDue } from "./index";
import type { MailMessage, Mailer } from "./notice";

/**
 * The closure job (task I2) on PGlite, over E8's account fixture: Anna with
 * her key, notes, a day entry, a pregnancy, grants both ways, a household,
 * and a child she guards alone. Each suite adds a second child she guards
 * with Ben, whose feed note is sealed under that child's own key, and a
 * photo each for Anna and the lone child. The closure is filed through
 * E8's route, exactly as a person would, and then walked step by step.
 */

const CO_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f13";
const CO_EVENT = "018f5e7a-c000-7000-8000-000000000001";
const CO_NOTE = "Fed well before the walk.";
const PHOTOS = {
  anna: "018f5e7a-d000-7000-8000-000000000001",
  child: "018f5e7a-d000-7000-8000-000000000002",
} as const;
const SECRET = "test-log-hmac-secret";
const OWNER = "owner@example.com";

// Words a closure notice or a job row could leak; none may appear.
const HEALTH_WORDS = /cycle|period|pregnan|fertil|ovulat|symptom|journal|health|child|baby|feed/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class Inbox implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class Bucket implements ObjectStore {
  readonly removed: string[] = [];
  async remove(keys: readonly string[]): Promise<void> {
    this.removed.push(...keys);
  }
}

interface World {
  fixture: AccountFixture;
  client: ReturnType<typeof withInjected>;
  inbox: Inbox;
  bucket: Bucket;
  settings: ClosureSettings;
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `018f5e7a-3900-7000-8000-${keyCounter.toString(16).padStart(12, "0")}`;
}

async function createWorld(): Promise<World> {
  const fixture = await createAccountFixture();
  const { db } = fixture.harness;
  await db.insert(schema.children).values({
    id: CO_CHILD,
    householdId: HOUSEHOLD,
    displayName: "Lu",
    dateOfBirth: "2024-06-01",
  });
  await db.insert(schema.childGuardians).values([
    { id: "018f5e7a-c000-7000-8000-000000000011", childId: CO_CHILD, userId: ANNA },
    { id: "018f5e7a-c000-7000-8000-000000000012", childId: CO_CHILD, userId: BEN },
  ]);
  await provisionChildKey(db, CO_CHILD, KEK);
  await provisionChildKey(db, CHILD, KEK);
  const keys = createKeyCache();
  await unwrapForSubject(db, CO_CHILD, KEK, keys);
  await db.insert(schema.childEvents).values({
    id: CO_EVENT,
    childId: CO_CHILD,
    authorId: ANNA,
    kind: "feed",
    date: "2026-10-01",
    note: encryptFieldFor(
      keys,
      { subjectId: CO_CHILD, table: "child_events", column: "note", rowId: CO_EVENT },
      CO_NOTE,
    ),
    kekVersion: KEK.version,
  });
  keys.clear();
  await db.insert(schema.childEvents).values({
    id: "018f5e7a-c000-7000-8000-000000000002",
    childId: CHILD,
    authorId: ANNA,
    kind: "sleep",
    date: "2026-10-01",
  });
  await db.insert(schema.photos).values([
    {
      id: PHOTOS.anna,
      subjectId: ANNA,
      authorId: ANNA,
      category: "pregnancy.photos",
      objectKey: "objects/a1",
      contentType: "image/jpeg",
      byteLength: 10,
    },
    {
      id: PHOTOS.child,
      subjectId: CHILD,
      childId: CHILD,
      authorId: ANNA,
      category: "child",
      objectKey: "objects/c1",
      contentType: "image/jpeg",
      byteLength: 10,
    },
  ]);
  await db.insert(schema.photoVariants).values({
    id: "018f5e7a-d000-7000-8000-000000000011",
    photoId: PHOTOS.anna,
    variant: "thumbnail",
    objectKey: "objects/a1-thumb",
    width: 10,
    height: 10,
    byteLength: 5,
  });
  const app = createApp({ auth: fixture.auth, db, log: { sink: () => undefined } });
  const client = withInjected(app, { db, keys: KEK });
  const inbox = new Inbox();
  const bucket = new Bucket();
  return {
    fixture,
    client,
    inbox,
    bucket,
    settings: { hmacSecret: SECRET, mailer: inbox, ownerEmail: OWNER, objects: bucket },
  };
}

function call(
  world: World,
  method: "GET" | "POST",
  path: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  return Promise.resolve(
    world.client.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(sessionHeaders(token) as Record<string, string>),
        ...(method === "POST"
          ? {
              origin: OWN_ORIGIN,
              "content-type": "application/json",
              [IDEMPOTENCY_KEY_HEADER]: newKey(),
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

async function close(world: World, mode: "undo-window" | "now", token: string = TOKENS.anna) {
  const response = await call(world, "POST", "/me/close", token, { mode });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { id: string; undoUntil: string | null };
  return {
    requestId: body.id,
    undoUntil: body.undoUntil === null ? null : new Date(body.undoUntil),
  };
}

async function requestRow(world: World, requestId: string) {
  const [row] = await world.fixture.harness.db
    .select()
    .from(schema.dataRequests)
    .where(eq(schema.dataRequests.id, requestId));
  return row;
}

async function closureJobs(world: World): Promise<Job[]> {
  return world.fixture.harness.db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.type, "account.delete"));
}

function count(world: World, table: PgTable, where: SQL | undefined): Promise<number> {
  return world.fixture.harness.db.$count(table, where);
}

describe("a closure with the undo window, walked one step at a time", () => {
  let world: World;
  let requestId: string;
  let undoUntil: Date;
  const db = () => world.fixture.harness.db;

  beforeAll(async () => {
    world = await createWorld();
    const closed = await close(world, "undo-window");
    requestId = closed.requestId;
    undoUntil = closed.undoUntil ?? new Date(0);
  });
  afterAll(async () => {
    await world.fixture.harness.close();
  });

  const advance = (now: Date, settings: ClosureSettings = world.settings) =>
    advanceClosure(db(), requestId, settings, now);
  const inWindow = () => new Date(undoUntil.getTime() - 60_000);
  const afterWindow = () => new Date(undoUntil.getTime() + 60_000);

  it("waits while the window is open and destroys nothing", async () => {
    expect(await advance(inWindow())).toEqual({
      step: "waiting",
      state: "requested",
      undoUntil,
    });
    expect((await requestRow(world, requestId))?.state).toBe("requested");
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, ANNA))).toBe(1);
    expect(await count(world, schema.session, eq(schema.session.userId, ANNA))).toBe(1);
  });

  it("locks the account: every other route answers 401 account_closing, the undo route still answers", async () => {
    const notes = await call(world, "GET", "/notes", TOKENS.anna);
    expect(notes.status).toBe(401);
    expect(((await notes.json()) as { detail?: string }).detail).toBe(ACCOUNT_CLOSING);
    const me = await call(world, "GET", "/me", TOKENS.anna);
    expect(me.status).toBe(401);
    const state = await call(world, "GET", "/me/close", TOKENS.anna);
    expect(state.status).toBe(200);
    // Ben is not closing and reads his own records as before.
    expect((await call(world, "GET", "/me", TOKENS.ben)).status).toBe(200);
  });

  it("revokes a grant still live during the window once, and a second run writes no second audit row", async () => {
    const stray = "018f5e7a-2000-7000-8000-0000000000ff";
    await db().insert(schema.grants).values({
      id: stray,
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.history",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    const revokes = () =>
      count(
        world,
        schema.auditEvents,
        and(eq(schema.auditEvents.actorId, ANNA), eq(schema.auditEvents.action, "grant.revoke")),
      );
    const before = await revokes();
    expect(await advance(inWindow())).toMatchObject({ step: "revoked", state: "requested" });
    expect(await revokes()).toBe(before + 1);
    const [grant] = await db().select().from(schema.grants).where(eq(schema.grants.id, stray));
    expect(grant?.revokedAt).not.toBeNull();
    expect(await advance(inWindow())).toMatchObject({ step: "waiting" });
    expect(await revokes()).toBe(before + 1);
  });

  it("refuses to start deleting without the secret, the mailer or the owner address, and changes nothing", async () => {
    for (const missing of ["hmacSecret", "mailer", "ownerEmail"] as const) {
      const settings = { ...world.settings, [missing]: undefined };
      await expect(advance(afterWindow(), settings)).rejects.toBeInstanceOf(
        ClosureConfigurationError,
      );
    }
    expect((await requestRow(world, requestId))?.state).toBe("requested");
    expect(await count(world, schema.session, eq(schema.session.userId, ANNA))).toBe(1);
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, ANNA))).toBe(1);
  });

  it("starts after the window: the session kept for the undo goes and the request is in progress", async () => {
    expect(await advance(afterWindow())).toEqual({ step: "started", state: "in_progress" });
    expect(await count(world, schema.session, eq(schema.session.userId, ANNA))).toBe(0);
    // The undo is over: the route has no session left to answer to.
    const undo = await call(world, "POST", "/me/close/undo", TOKENS.anna);
    expect(undo.status).toBe(409);
  });

  it("destroys her key first: the note rows are still there and no longer decrypt", async () => {
    expect(await advance(afterWindow())).toEqual({ step: "key", state: "in_progress" });
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, ANNA))).toBe(0);
    const [note] = await db()
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, NOTES.annaPrivate));
    expect(note).toBeDefined();
    const cache = createKeyCache();
    await expect(unwrapForSubject(db(), ANNA, KEK, cache)).rejects.toBeInstanceOf(
      SubjectKeyMissingError,
    );
    expect(() =>
      decryptFieldFor(
        cache,
        { subjectId: ANNA, table: "notes", column: "body", rowId: NOTES.annaPrivate },
        note?.body ?? new Uint8Array(),
      ),
    ).toThrow();
  });

  it("deletes the child she guarded alone, with its key, its photo and its object", async () => {
    expect(await advance(afterWindow())).toEqual({ step: "child-deleted", state: "in_progress" });
    expect(await count(world, schema.children, eq(schema.children.id, CHILD))).toBe(0);
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, CHILD))).toBe(0);
    expect(await count(world, schema.childEvents, eq(schema.childEvents.childId, CHILD))).toBe(0);
    expect(await count(world, schema.photos, eq(schema.photos.subjectId, CHILD))).toBe(0);
    expect(
      await count(
        world,
        schema.auditEvents,
        or(eq(schema.auditEvents.subjectId, CHILD), eq(schema.auditEvents.childId, CHILD)),
      ),
    ).toBe(0);
    expect(await count(world, schema.grants, eq(schema.grants.childId, CHILD))).toBe(0);
    expect(world.bucket.removed).toEqual(["objects/c1"]);
  });

  it("hands the co-guarded child to Ben, who keeps decrypting it with the child's own key", async () => {
    expect(await advance(afterWindow())).toEqual({
      step: "child-transferred",
      state: "in_progress",
    });
    const guardians = await db()
      .select({ userId: schema.childGuardians.userId })
      .from(schema.childGuardians)
      .where(eq(schema.childGuardians.childId, CO_CHILD));
    expect(guardians).toEqual([{ userId: BEN }]);
    const [event] = await db()
      .select()
      .from(schema.childEvents)
      .where(eq(schema.childEvents.id, CO_EVENT));
    // Her authorship is cleared with her user row later; the event stays the child's.
    const cache = createKeyCache();
    await unwrapForSubject(db(), CO_CHILD, KEK, cache);
    expect(
      decryptFieldFor(
        cache,
        { subjectId: CO_CHILD, table: "child_events", column: "note", rowId: CO_EVENT },
        event?.note ?? new Uint8Array(),
      ),
    ).toBe(CO_NOTE);
    cache.clear();
  });

  it("removes her photos and their stored objects", async () => {
    expect(await advance(afterWindow())).toEqual({ step: "objects", state: "in_progress" });
    expect(await count(world, schema.photos, eq(schema.photos.subjectId, ANNA))).toBe(0);
    expect(world.bucket.removed.slice(1).sort()).toEqual(["objects/a1", "objects/a1-thumb"]);
  });

  it("deletes her rows one table per step, in the order the foreign keys allow", async () => {
    const tables: string[] = [];
    for (;;) {
      const result = await advance(afterWindow());
      if (result.step !== "rows") {
        expect(result).toEqual({ step: "tombstone", state: "in_progress" });
        break;
      }
      tables.push(result.table ?? "");
    }
    const order = closureDeletions.map((deletion) => deletion.table);
    expect(new Set(tables).size).toBe(tables.length);
    expect([...tables].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(tables);
    for (const table of [
      "audit_events",
      "notes",
      "entry_symptoms",
      "cycle_entries",
      "due_date_changes",
      "pregnancy_events",
      "pregnancies",
      "consents",
      "grants",
      "household_members",
      "profiles",
    ]) {
      expect(tables).toContain(table);
    }
    // The household still holds Ben and the co-guarded child, so it stays.
    expect(tables).not.toContain("households");
    expect(await count(world, schema.households, eq(schema.households.id, HOUSEHOLD))).toBe(1);
  });

  it("writes the tombstone: no user row, no address, only the keyed hash and the dates", async () => {
    expect(await count(world, schema.user, eq(schema.user.id, ANNA))).toBe(0);
    const row = await requestRow(world, requestId);
    expect(row).toMatchObject({
      userId: null,
      kind: "closure",
      state: "in_progress",
      emailHmac: emailHmac(SECRET, "anna@example.com"),
    });
    expect(JSON.stringify(row)).not.toContain("anna@");
    // Nothing anywhere still names her.
    for (const [table, column] of [
      [schema.notes, schema.notes.subjectId],
      [schema.cycleEntries, schema.cycleEntries.subjectId],
      [schema.consents, schema.consents.subjectId],
      [schema.auditEvents, schema.auditEvents.subjectId],
      [schema.auditEvents, schema.auditEvents.actorId],
      [schema.grants, schema.grants.ownerId],
      [schema.grants, schema.grants.granteeId],
      [schema.householdMembers, schema.householdMembers.userId],
      [schema.profiles, schema.profiles.userId],
    ] as const) {
      expect(await count(world, table, eq(column, ANNA))).toBe(0);
    }
    const [event] = await db()
      .select({ authorId: schema.childEvents.authorId })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.id, CO_EVENT));
    expect(event?.authorId).toBeNull();
  });

  it("sends the owner the content-free processor notice and finishes", async () => {
    expect(world.inbox.sent).toHaveLength(0);
    expect(await advance(afterWindow())).toEqual({ step: "done", state: "completed" });
    expect(world.inbox.sent).toEqual([processorNotice(OWNER)]);
    const [mail] = world.inbox.sent;
    const text = `${mail?.subject ?? ""}\n${mail?.text ?? ""}`;
    expect(text).not.toMatch(HEALTH_WORDS);
    expect(text).not.toContain("anna");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    const row = await requestRow(world, requestId);
    expect(row?.state).toBe("completed");
    expect(row?.completedAt?.getTime()).toBe(afterWindow().getTime());
  });

  it("does nothing on any later run: no second mail, no change", async () => {
    expect(await advance(afterWindow())).toEqual({ step: "finished", state: "completed" });
    const handler = createClosureHandler({ settings: () => world.settings });
    const [job] = await closureJobs(world);
    expect(job).toBeDefined();
    if (job !== undefined) await handler(job, { db: db(), now: afterWindow() });
    expect(world.inbox.sent).toHaveLength(1);
    expect((await requestRow(world, requestId))?.state).toBe("completed");
  });

  it("leaves Ben's own records readable", async () => {
    const [note] = await db()
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, NOTES.benPrivate));
    const cache = createKeyCache();
    await unwrapForSubject(db(), BEN, KEK, cache);
    expect(
      decryptFieldFor(
        cache,
        { subjectId: BEN, table: "notes", column: "body", rowId: NOTES.benPrivate },
        note?.body ?? new Uint8Array(),
      ),
    ).toBe(TEXTS.benPrivate);
    cache.clear();
  });
});

describe("undo inside the window", () => {
  let world: World;
  beforeAll(async () => {
    world = await createWorld();
  });
  afterAll(async () => {
    await world.fixture.harness.close();
  });

  it("cancels the closure: the job finds it cancelled and deletes nothing", async () => {
    const { requestId, undoUntil } = await close(world, "undo-window");
    const [job] = await closureJobs(world);
    const undo = await call(world, "POST", "/me/close/undo", TOKENS.anna);
    expect(undo.status).toBe(200);
    expect((await requestRow(world, requestId))?.state).toBe("cancelled");
    // The account answers again once the closure is cancelled.
    expect((await call(world, "GET", "/me", TOKENS.anna)).status).toBe(200);

    const after = new Date((undoUntil ?? new Date()).getTime() + 60_000);
    expect(
      await advanceClosure(world.fixture.harness.db, requestId, world.settings, after),
    ).toEqual({ step: "finished", state: "cancelled" });
    // A job that slipped past the undo's delete still finds nothing to do.
    const handler = createClosureHandler({ settings: () => world.settings });
    if (job !== undefined) await handler(job, { db: world.fixture.harness.db, now: after });
    expect(await count(world, schema.user, eq(schema.user.id, ANNA))).toBe(1);
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, ANNA))).toBe(1);
    expect(await count(world, schema.children, eq(schema.children.id, CHILD))).toBe(1);
    expect(world.inbox.sent).toHaveLength(0);
    expect(await closureJobs(world)).toHaveLength(0);
  });
});

describe("delete now", () => {
  let world: World;
  beforeAll(async () => {
    world = await createWorld();
  });
  afterAll(async () => {
    await world.fixture.harness.close();
  });

  it("queues a job that holds ids only and runs at once", async () => {
    const { requestId, undoUntil } = await close(world, "now");
    expect(undoUntil).toBeNull();
    const jobs = await closureJobs(world);
    expect(jobs).toHaveLength(1);
    const payload = jobs[0]?.payloadJson ?? {};
    expect(Object.keys(payload).sort()).toEqual(["requestId", "userId"]);
    for (const value of Object.values(payload)) expect(value).toMatch(UUID);
    expect(payload).toEqual({ requestId, userId: ANNA });
    expect(JSON.stringify(jobs[0])).not.toMatch(HEALTH_WORDS);
  });

  it("skips the wait: one drain finishes the whole closure", async () => {
    const handlers = {
      "account.delete": createClosureHandler({ settings: () => world.settings }),
    };
    const outcome = await drainDue(
      world.fixture.harness.db,
      10,
      handlers,
      new Date(Date.now() + 1000),
    );
    expect(outcome.done).toHaveLength(1);
    expect(outcome.failed).toEqual([]);
    expect(await count(world, schema.user, eq(schema.user.id, ANNA))).toBe(0);
    const [request] = await world.fixture.harness.db
      .select()
      .from(schema.dataRequests)
      .where(eq(schema.dataRequests.kind, "closure"));
    expect(request).toMatchObject({ state: "completed", userId: null });
    expect(world.inbox.sent).toEqual([processorNotice(OWNER)]);
    // The co-guarded child stays with Ben; the lone child is gone.
    expect(await count(world, schema.children, eq(schema.children.id, CO_CHILD))).toBe(1);
    expect(await count(world, schema.children, eq(schema.children.id, CHILD))).toBe(0);
    // No follow-up was needed.
    expect((await closureJobs(world)).filter((job) => job.status !== "done")).toEqual([]);
  });
});

describe("a run that spends its budget", () => {
  let world: World;
  beforeAll(async () => {
    world = await createWorld();
  });
  afterAll(async () => {
    await world.fixture.harness.close();
  });

  it("stops after a step and leaves a follow-up job due at once, ids only", async () => {
    const { requestId } = await close(world, "now", TOKENS.ben);
    let tick = 0;
    const handler = createClosureHandler({
      settings: () => world.settings,
      budgetMs: 1,
      clock: () => (tick += 10),
    });
    const now = new Date(Date.now() + 1000);
    const [job] = await claimDue(world.fixture.harness.db, 1, now);
    expect(job).toBeDefined();
    if (job === undefined) return;
    await handler(job, { db: world.fixture.harness.db, now });
    // One step only: the window is over, so it started.
    expect((await requestRow(world, requestId))?.state).toBe("in_progress");
    expect(await count(world, schema.subjectKeys, eq(schema.subjectKeys.subjectId, BEN))).toBe(1);
    const queued = (await closureJobs(world)).filter((row) => row.status === "queued");
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payloadJson).toEqual({ requestId, userId: BEN });
    expect(queued[0]?.runAfter.getTime()).toBe(now.getTime());
  });

  it("an early run during the window leaves one job due when the window ends", async () => {
    const { requestId, undoUntil } = await close(world, "undo-window", TOKENS.anna);
    const [original] = (await closureJobs(world)).filter(
      (row) => row.payloadJson["requestId"] === requestId,
    );
    expect(original).toBeDefined();
    if (original === undefined) return;
    // Pretend the original was lost: the run makes sure one is waiting.
    await world.fixture.harness.db.delete(schema.jobs).where(eq(schema.jobs.id, original.id));
    const handler = createClosureHandler({ settings: () => world.settings });
    await handler(original, { db: world.fixture.harness.db, now: new Date() });
    const waiting = (await closureJobs(world)).filter(
      (row) => row.payloadJson["requestId"] === requestId,
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.runAfter.getTime()).toBe(undoUntil?.getTime());
    // A second early run adds no second job.
    await handler(original, { db: world.fixture.harness.db, now: new Date() });
    expect(
      (await closureJobs(world)).filter((row) => row.payloadJson["requestId"] === requestId),
    ).toHaveLength(1);
  });

  it("refuses a job whose payload does not name a request by id", async () => {
    const handler = createClosureHandler({ settings: () => world.settings });
    const [job] = await closureJobs(world);
    if (job === undefined) return;
    await expect(
      handler(
        { ...job, payloadJson: { requestId: "not-an-id" } },
        {
          db: world.fixture.harness.db,
          now: new Date(),
        },
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
