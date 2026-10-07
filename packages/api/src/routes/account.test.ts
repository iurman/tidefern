import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";
import {
  ActivityPage,
  CloseState,
  CloseUndone,
  ClosureReplay,
  ClosureRequest,
  ExportEnd,
  ExportHeader,
  ExportLine,
  ExportRecord,
  Problem,
} from "@tidefern/schemas";

import { createApp } from "../app";
import { ACCOUNT_CLOSING, FRESH_AUTHENTICATION_REQUIRED } from "../auth";
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../middleware/idempotency";
import { ANNA, BEN, CARA, OWN_ORIGIN } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import {
  AUDIT,
  CHILD,
  ENTRIES,
  GRANTS,
  KEK,
  NOTES,
  SESSIONS,
  TEXTS,
  TOKENS,
  asAppRole,
  createAccountFixture,
  withInjected,
} from "../test/account";
import type { AccountFixture } from "../test/account";
import {
  ACTIVITY_CURSOR_INVALID,
  CLOSURE_IN_PROGRESS,
  EXPORT_CONTENT_TYPE,
  EXPORT_FILE_NAME,
  REQUEST_DEADLINE_MS,
  UNDO_WINDOW_CLOSED,
  UNDO_WINDOW_MS,
  decodeActivityCursor,
  encodeActivityCursor,
} from "./account";

// Words a health app could leak into a header or a file name; none may appear there.
const HEALTH_WORDS = /cycle|period|pregnan|symptom|journal|note|health|child|baby/i;

const KEYS = {
  annaClose: "018f5e7a-3100-7000-8000-000000000001",
  annaCloseAgain: "018f5e7a-3100-7000-8000-000000000002",
  annaUndo: "018f5e7a-3100-7000-8000-000000000003",
  annaUndoAgain: "018f5e7a-3100-7000-8000-000000000004",
  annaReclose: "018f5e7a-3100-7000-8000-000000000005",
  annaLateUndo: "018f5e7a-3100-7000-8000-000000000006",
  benUndo: "018f5e7a-3100-7000-8000-000000000007",
  benNow: "018f5e7a-3100-7000-8000-000000000008",
  benNowUndo: "018f5e7a-3100-7000-8000-000000000009",
  staleClose: "018f5e7a-3100-7000-8000-00000000000a",
  badMode: "018f5e7a-3100-7000-8000-00000000000b",
  anonymous: "018f5e7a-3100-7000-8000-00000000000c",
} as const;

type Client = ReturnType<typeof withInjected>;

/**
 * The whole app on the fixture's database, or on `database` when given:
 * the app-role blocks pass `asAppRole(...)` so every request path runs as
 * `tidefern_app`, as it does on CI and in production.
 */
function build(fixture: AccountFixture, database: ActorDatabase = fixture.harness.db): Client {
  const app = createApp({
    auth: fixture.auth,
    db: database,
    log: { sink: () => undefined },
  });
  return withInjected(app, { db: database, keys: KEK });
}

/**
 * Drizzle wraps a driver error in "Failed query: ..." and keeps the
 * Postgres error as `cause`; the policy name lives there.
 */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : (error as Error).message;
  }
  throw new Error("expected the query to be refused");
}

const get = (client: Client, path: string, token?: string) =>
  client.request(`/api/v1${path}`, {
    headers: token === undefined ? {} : sessionHeaders(token),
  });

const post = (
  client: Client,
  path: string,
  key: string | undefined,
  body?: unknown,
  token?: string,
) =>
  client.request(`/api/v1${path}`, {
    method: "POST",
    headers: {
      ...(token === undefined ? {} : (sessionHeaders(token) as Record<string, string>)),
      origin: OWN_ORIGIN,
      "content-type": "application/json",
      ...(key === undefined ? {} : { [IDEMPOTENCY_KEY_HEADER]: key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/**
 * Parses a body and fails when the raw JSON carries anything the schema
 * would strip: zod objects drop unknown keys, so a projection check run on
 * the parsed value alone could never see a leaked column.
 */
function exact<Schema extends z.ZodType>(shape: Schema, raw: unknown): z.infer<Schema> {
  const parsed = shape.parse(raw);
  expect(parsed).toStrictEqual(raw);
  return parsed;
}

async function problemOf(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  return exact(Problem, await response.json());
}

/** An export body split into its header, its records and its end line, each parsed exactly. */
function exportOf(text: string) {
  const raw = text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
  const lines = raw.map((line) => exact(ExportLine, line));
  expect(lines.length).toBeGreaterThanOrEqual(2);
  const header = exact(ExportHeader, raw[0]);
  const end = exact(ExportEnd, raw[raw.length - 1]);
  const records = raw.slice(1, -1).map((line) => exact(ExportRecord, line));
  expect(end.records).toBe(records.length);
  expect(lines).toHaveLength(records.length + 2);
  return { header, records, end };
}

describe("GET /v1/me/activity", () => {
  let fixture: AccountFixture;
  let client: Client;

  beforeAll(async () => {
    fixture = await createAccountFixture();
    client = build(fixture);
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  it("answers 401 without a session", async () => {
    const response = await get(client, "/me/activity");
    expect(response.status).toBe(401);
    expect((await problemOf(response)).code).toBe("unauthenticated");
  });

  it("lists the rows where the person is actor or subject, newest first, with no content", async () => {
    const response = await get(client, "/me/activity", TOKENS.anna);
    expect(response.status).toBe(200);
    const page = exact(ActivityPage, await response.json());
    expect(page.items.map((item) => item.id)).toEqual([
      AUDIT.caraReadsAnna,
      AUDIT.benReadsAnna,
      AUDIT.annaGrantChild,
      AUDIT.annaGrantStatus,
      AUDIT.annaGrantSymptoms,
    ]);
    expect(page.nextCursor).toBeNull();
    const allowed = new Set([
      "id",
      "action",
      "actorId",
      "subjectId",
      "category",
      "childId",
      "occurredAt",
    ]);
    for (const item of page.items) {
      for (const key of Object.keys(item)) expect(allowed.has(key)).toBe(true);
      expect(item.actorId === ANNA || item.subjectId === ANNA).toBe(true);
      expect(item.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    const childRow = page.items.find((item) => item.id === AUDIT.annaGrantChild);
    expect(childRow).toMatchObject({ subjectId: CHILD, childId: CHILD, category: "child" });
  });

  it("never shows another person's rows: Cara reading the child is not Anna's activity", async () => {
    const page = exact(ActivityPage, await (await get(client, "/me/activity", TOKENS.anna)).json());
    const ids = page.items.map((item) => item.id);
    expect(ids).not.toContain(AUDIT.caraReadsChild);
    expect(ids).not.toContain(AUDIT.benGrantCara);
    expect(ids).not.toContain(AUDIT.caraEarlyMicro);

    const ben = exact(ActivityPage, await (await get(client, "/me/activity", TOKENS.ben)).json());
    for (const item of ben.items) {
      expect(item.actorId === BEN || item.subjectId === BEN).toBe(true);
    }
    expect(ben.items.map((item) => item.id)).toEqual([AUDIT.benGrantCara, AUDIT.benReadsAnna]);
  });

  it("walks every page with an opaque cursor, keeping two rows inside one millisecond apart", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor === null ? "?limit=1" : `?limit=1&cursor=${cursor}`;
      const response = await get(client, `/me/activity${query}`, TOKENS.cara);
      expect(response.status).toBe(200);
      const page = exact(ActivityPage, await response.json());
      expect(page.items.length).toBeLessThanOrEqual(1);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (cursor !== null) expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(seen).toEqual([
      AUDIT.caraReadsChild,
      AUDIT.caraReadsAnna,
      AUDIT.caraLateMicro,
      AUDIT.caraEarlyMicro,
    ]);
  });

  it("pages Anna's list two at a time to the same order as one page", async () => {
    const first = exact(
      ActivityPage,
      await (await get(client, "/me/activity?limit=2", TOKENS.anna)).json(),
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = exact(
      ActivityPage,
      await (
        await get(client, `/me/activity?limit=2&cursor=${first.nextCursor ?? ""}`, TOKENS.anna)
      ).json(),
    );
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
      AUDIT.caraReadsAnna,
      AUDIT.benReadsAnna,
      AUDIT.annaGrantChild,
      AUDIT.annaGrantStatus,
    ]);
  });

  it("answers 422 for a cursor it did not issue and for a limit outside 1 to 200", async () => {
    const forged = Buffer.from("not a cursor", "utf8").toString("base64url");
    const bad = await get(client, `/me/activity?cursor=${forged}`, TOKENS.anna);
    expect(bad.status).toBe(422);
    const body = await problemOf(bad);
    expect(body.code).toBe("validation_failed");
    expect(body.detail).toBe(ACTIVITY_CURSOR_INVALID);
    expect(body.errors?.[0]?.path).toBe("cursor");

    for (const limit of ["0", "201", "ten"]) {
      const response = await get(client, `/me/activity?limit=${limit}`, TOKENS.anna);
      expect(response.status).toBe(422);
      const problem = await problemOf(response);
      expect(problem.code).toBe("validation_failed");
      expect(problem.errors?.some((error) => error.path === "limit")).toBe(true);
    }
  });

  it("round-trips a cursor and refuses a malformed one", () => {
    const at = new Date("2026-10-05T12:00:00.123Z");
    const cursor = encodeActivityCursor(at, AUDIT.benReadsAnna);
    expect(decodeActivityCursor(cursor)).toEqual({ occurredAt: at, id: AUDIT.benReadsAnna });
    expect(decodeActivityCursor("")).toBeNull();
    expect(
      decodeActivityCursor(Buffer.from(`${at.toISOString()}|zzz`).toString("base64url")),
    ).toBeNull();
  });
});

describe("GET /v1/me/export", () => {
  let fixture: AccountFixture;
  let client: Client;

  beforeAll(async () => {
    fixture = await createAccountFixture();
    client = build(fixture);
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  async function exportAuditRows(actorId: string) {
    return fixture.harness.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.actorId, actorId),
          eq(schema.auditEvents.action, "export.create"),
        ),
      );
  }

  it("answers 401 without a session", async () => {
    const response = await get(client, "/me/export");
    expect(response.status).toBe(401);
    const body = await problemOf(response);
    expect(body.code).toBe("unauthenticated");
    expect(body.detail).toBeUndefined();
  });

  it("refuses a session authenticated more than ten minutes ago, and writes no audit row", async () => {
    const response = await get(client, "/me/export", TOKENS.annaStale);
    expect(response.status).toBe(401);
    expect((await problemOf(response)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
    expect(await exportAuditRows(ANNA)).toHaveLength(0);
  });

  it("streams the person's own rows with the notes decrypted and nothing from another subject", async () => {
    const response = await get(client, "/me/export", TOKENS.anna);
    expect(response.status).toBe(200);

    const type = response.headers.get("content-type") ?? "";
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(type).toBe(EXPORT_CONTENT_TYPE);
    expect(disposition).toBe(`attachment; filename="${EXPORT_FILE_NAME}"`);
    expect(type).not.toMatch(HEALTH_WORDS);
    expect(disposition).not.toMatch(HEALTH_WORDS);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const text = await response.text();
    const { header, records } = exportOf(text);
    expect(header).toMatchObject({ kind: "export", format: 1, subjectId: ANNA });

    // The decrypted texts are there, as plain strings.
    const notes = records.filter((line) => line.kind === "note");
    expect(notes.map((line) => ("data" in line ? line.data.body : null)).sort()).toEqual(
      [TEXTS.annaPrivate, TEXTS.annaShared].sort(),
    );
    const event = records.find((line) => line.kind === "pregnancyEvent");
    expect(event !== undefined && "data" in event ? event.data.label : null).toBe(
      TEXTS.annaEventLabel,
    );

    // Nothing of Ben's: not his note, not his day entry.
    expect(text).not.toContain(TEXTS.benPrivate);
    expect(text).not.toContain(NOTES.benPrivate);
    expect(text).not.toContain(ENTRIES.ben);

    // Every subject-keyed row is Anna's, and no key version or ciphertext travels.
    for (const line of records) {
      if (!("data" in line)) continue;
      if (line.kind === "grant" || line.kind === "activity") continue;
      const owner = line.data.subjectId ?? line.data.userId;
      if (owner !== undefined) expect(owner).toBe(ANNA);
      expect(Object.keys(line.data)).not.toContain("kekVersion");
    }
    const entry = records.find((line) => line.kind === "cycleEntry");
    expect(entry !== undefined && "data" in entry ? entry.data.symptoms : null).toEqual([
      "cramps",
      "nausea",
    ]);

    // Grants in both directions, and only those that involve her.
    const grants = records
      .filter((line) => line.kind === "grant")
      .map((line) => ("data" in line ? line.data.id : null));
    expect(grants.sort()).toEqual(
      [
        GRANTS.annaToBenSymptoms,
        GRANTS.annaToCaraStatus,
        GRANTS.annaToCaraChild,
        GRANTS.benToAnnaHistory,
      ].sort(),
    );
  });

  it("records the export in the activity view", async () => {
    const rows = await exportAuditRows(ANNA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: ANNA, subjectId: ANNA, category: null });
    const page = exact(ActivityPage, await (await get(client, "/me/activity", TOKENS.anna)).json());
    expect(page.items[0]).toMatchObject({ action: "export.create", actorId: ANNA });
  });

  it("gives Ben his own export without any of Anna's text", async () => {
    const response = await get(client, "/me/export", TOKENS.ben);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(exportOf(text).header.subjectId).toBe(BEN);
    expect(text).toContain(TEXTS.benPrivate);
    expect(text).not.toContain(TEXTS.annaPrivate);
    expect(text).not.toContain(TEXTS.annaShared);
    expect(text).not.toContain(TEXTS.annaEventLabel);
    expect(text).not.toContain(ENTRIES.anna);
  });

  it("gives Cara, a summary grantee of Anna and of the child, nothing of theirs but the grants", async () => {
    const response = await get(client, "/me/export", TOKENS.cara);
    expect(response.status).toBe(200);
    const text = await response.text();
    const { header, records } = exportOf(text);
    expect(header.subjectId).toBe(CARA);
    const kinds = new Set(records.map((line) => line.kind));
    expect([...kinds].sort()).toEqual(["activity", "grant"]);
    for (const secret of [
      TEXTS.annaPrivate,
      TEXTS.annaShared,
      TEXTS.annaEventLabel,
      ENTRIES.anna,
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

/**
 * What the closure blocks read back, through the harness's own superuser
 * connection, which sees every row whatever role the app ran as.
 */
function closureReads(db: () => AccountFixture["harness"]["db"]) {
  return {
    async sessionsOf(userId: string) {
      const rows = await db()
        .select({ id: schema.session.id })
        .from(schema.session)
        .where(eq(schema.session.userId, userId));
      return rows.map((row) => row.id).sort();
    },

    async grantsInvolving(userId: string) {
      return db()
        .select()
        .from(schema.grants)
        .where(or(eq(schema.grants.ownerId, userId), eq(schema.grants.granteeId, userId)));
    },

    async closureRows(userId: string) {
      return db()
        .select()
        .from(schema.dataRequests)
        .where(and(eq(schema.dataRequests.userId, userId), eq(schema.dataRequests.kind, "closure")))
        .orderBy(schema.dataRequests.requestedAt);
    },

    async deleteJobs() {
      return db().select().from(schema.jobs).where(eq(schema.jobs.type, "account.delete"));
    },

    async auditRows(actorId: string, action: string) {
      return db()
        .select()
        .from(schema.auditEvents)
        .where(and(eq(schema.auditEvents.actorId, actorId), eq(schema.auditEvents.action, action)));
    },
  };
}

describe("account closure", () => {
  let fixture: AccountFixture;
  let client: Client;
  let closure: ClosureRequest;

  beforeAll(async () => {
    fixture = await createAccountFixture();
    client = build(fixture);
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  const db = () => fixture.harness.db;
  const { sessionsOf, grantsInvolving, closureRows, deleteJobs, auditRows } = closureReads(db);

  it("answers 401 without a session and 401 fresh_authentication_required for a stale one", async () => {
    const anonymous = await post(client, "/me/close", KEYS.anonymous, { mode: "now" });
    expect(anonymous.status).toBe(401);
    expect((await problemOf(anonymous)).detail).toBeUndefined();

    const stale = await post(
      client,
      "/me/close",
      KEYS.staleClose,
      { mode: "now" },
      TOKENS.annaStale,
    );
    expect(stale.status).toBe(401);
    expect((await problemOf(stale)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);

    expect(await closureRows(ANNA)).toHaveLength(0);
    expect(await sessionsOf(ANNA)).toHaveLength(4);
    expect(await auditRows(ANNA, "account.close")).toHaveLength(0);
  });

  it("answers 422 for an unknown mode and 400 without an Idempotency-Key", async () => {
    const bad = await post(client, "/me/close", KEYS.badMode, { mode: "later" }, TOKENS.anna);
    expect(bad.status).toBe(422);
    const body = await problemOf(bad);
    expect(body.code).toBe("validation_failed");
    expect(body.errors?.some((error) => error.path === "mode")).toBe(true);

    const keyless = await post(client, "/me/close", undefined, { mode: "now" }, TOKENS.anna);
    expect(keyless.status).toBe(400);
    expect(await closureRows(ANNA)).toHaveLength(0);
  });

  it("reports no closure before one is asked for", async () => {
    const response = await get(client, "/me/close", TOKENS.anna);
    expect(response.status).toBe(200);
    expect(exact(CloseState, await response.json())).toEqual({ request: null });
    expect((await get(client, "/me/close")).status).toBe(401);
  });

  it("revokes at once, files the request, enqueues the deletion for the end of the window and answers the deadlines", async () => {
    const before = Date.now();
    const response = await post(
      client,
      "/me/close",
      KEYS.annaClose,
      { mode: "undo-window" },
      TOKENS.anna,
    );
    expect(response.status).toBe(200);
    closure = exact(ClosureRequest, await response.json());
    expect(closure).toMatchObject({ mode: "undo-window", state: "requested" });
    const requestedAt = Date.parse(closure.requestedAt);
    expect(requestedAt).toBeGreaterThanOrEqual(before - 1);
    expect(Date.parse(closure.undoUntil ?? "")).toBe(requestedAt + UNDO_WINDOW_MS);
    expect(Date.parse(closure.deadlineAt)).toBe(requestedAt + REQUEST_DEADLINE_MS);

    // Every other session of hers is gone; the one that asked stays, and Ben's are untouched.
    expect(await sessionsOf(ANNA)).toEqual([SESSIONS.anna]);
    expect(await sessionsOf(BEN)).toEqual([SESSIONS.ben, SESSIONS.benStale].sort());

    // Every grant she gave or holds is revoked; Ben's grant to Cara is not hers and stays.
    for (const grant of await grantsInvolving(ANNA)) {
      expect(grant.revokedAt?.getTime()).toBe(requestedAt);
      expect(grant.version).toBe(2);
    }
    const [benToCara] = await db()
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, GRANTS.benToCaraStatus));
    expect(benToCara?.revokedAt).toBeNull();

    // The closure is the open request (enforcing it on other routes is the
    // session layer's, a request to the lead).
    const rows = await closureRows(ANNA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: closure.id, state: "requested" });

    // The deletion job waits for the window and carries ids only.
    const jobs = await deleteJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payloadJson).toEqual({ requestId: closure.id, userId: ANNA });
    expect(jobs[0]?.runAfter.getTime()).toBe(Date.parse(closure.undoUntil ?? ""));
    expect(jobs[0]?.status).toBe("queued");
  });

  it("writes the closure and one revocation row per grant, the child grant against the child", async () => {
    const closed = await auditRows(ANNA, "account.close");
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ subjectId: ANNA, category: null, childId: null });

    const revoked = await auditRows(ANNA, "grant.revoke");
    expect(
      revoked.map((row) => `${row.subjectId}/${row.category ?? ""}/${row.childId ?? ""}`).sort(),
    ).toEqual(
      [
        `${ANNA}/cycle.symptoms/`,
        `${ANNA}/cycle.status/`,
        `${CHILD}/child/${CHILD}`,
        `${BEN}/cycle.history/`,
      ].sort(),
    );
  });

  it("replays the same request instead of closing twice", async () => {
    const replay = await post(
      client,
      "/me/close",
      KEYS.annaClose,
      { mode: "undo-window" },
      TOKENS.anna,
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(exact(ClosureReplay, await replay.json())).toEqual({ id: closure.id });
    expect(await closureRows(ANNA)).toHaveLength(1);
    expect(await auditRows(ANNA, "account.close")).toHaveLength(1);
  });

  it("answers 409 closure_in_progress for a second closure", async () => {
    const again = await post(
      client,
      "/me/close",
      KEYS.annaCloseAgain,
      { mode: "now" },
      TOKENS.anna,
    );
    expect(again.status).toBe(409);
    expect((await problemOf(again)).detail).toBe(CLOSURE_IN_PROGRESS);
    expect(await closureRows(ANNA)).toHaveLength(1);
    expect(await deleteJobs()).toHaveLength(1);
  });

  it("answers the open request as the state", async () => {
    const state = exact(CloseState, await (await get(client, "/me/close", TOKENS.anna)).json());
    expect(state.request).toEqual(closure);
  });

  it("answers 404 to someone else's undo: Ben has no closure of his own", async () => {
    const response = await post(client, "/me/close/undo", KEYS.benUndo, undefined, TOKENS.ben);
    expect(response.status).toBe(404);
    expect((await problemOf(response)).code).toBe("not_found");
    expect((await closureRows(ANNA))[0]?.state).toBe("requested");
  });

  it("undoes inside the window: cancelled, the job gone, sessions and grants still revoked", async () => {
    const response = await post(client, "/me/close/undo", KEYS.annaUndo, undefined, TOKENS.anna);
    expect(response.status).toBe(200);
    const body = exact(CloseUndone, await response.json());
    expect(body.sessionsRestored).toBe(false);
    expect(body.grantsRestored).toBe(false);
    expect(body.request).toMatchObject({ id: closure.id, state: "cancelled", mode: "undo-window" });

    const [row] = await closureRows(ANNA);
    expect(row?.state).toBe("cancelled");
    expect(row?.completedAt).not.toBeNull();
    expect(await deleteJobs()).toHaveLength(0);
    expect(await sessionsOf(ANNA)).toEqual([SESSIONS.anna]);
    const active = await db()
      .select()
      .from(schema.grants)
      .where(
        and(
          or(eq(schema.grants.ownerId, ANNA), eq(schema.grants.granteeId, ANNA)),
          isNull(schema.grants.revokedAt),
        ),
      );
    expect(active).toHaveLength(0);

    const undone = await auditRows(ANNA, "account.close.undo");
    expect(undone).toHaveLength(1);
    expect(undone[0]).toMatchObject({ subjectId: ANNA });

    const state = exact(CloseState, await (await get(client, "/me/close", TOKENS.anna)).json());
    expect(state.request).toBeNull();
  });

  it("answers 404 to an undo when nothing is open", async () => {
    const response = await post(
      client,
      "/me/close/undo",
      KEYS.annaUndoAgain,
      undefined,
      TOKENS.anna,
    );
    expect(response.status).toBe(404);
  });

  it("answers 409 undo_window_closed once the window has passed", async () => {
    const reclose = await post(
      client,
      "/me/close",
      KEYS.annaReclose,
      { mode: "undo-window" },
      TOKENS.anna,
    );
    expect(reclose.status).toBe(200);
    const second = exact(ClosureRequest, await reclose.json());
    expect(second.id).not.toBe(closure.id);
    // No grant was left to revoke the second time.
    expect(await auditRows(ANNA, "grant.revoke")).toHaveLength(4);

    await db()
      .update(schema.dataRequests)
      .set({ undoUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.dataRequests.id, second.id));
    const late = await post(client, "/me/close/undo", KEYS.annaLateUndo, undefined, TOKENS.anna);
    expect(late.status).toBe(409);
    expect((await problemOf(late)).detail).toBe(UNDO_WINDOW_CLOSED);
    const rows = await closureRows(ANNA);
    expect(rows.map((row) => row.state)).toEqual(["cancelled", "requested"]);
    expect(await deleteJobs()).toHaveLength(1);
  });

  it("deletes now with no window, and refuses an undo of it", async () => {
    const before = Date.now();
    const response = await post(client, "/me/close", KEYS.benNow, { mode: "now" }, TOKENS.ben);
    expect(response.status).toBe(200);
    const request = exact(ClosureRequest, await response.json());
    expect(request).toMatchObject({ mode: "now", undoUntil: null, state: "requested" });

    expect(await sessionsOf(BEN)).toEqual([SESSIONS.ben]);
    const benGrants = await grantsInvolving(BEN);
    expect(benGrants.every((grant) => grant.revokedAt !== null)).toBe(true);

    const [job] = await db()
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, "account.delete"), inArray(schema.jobs.status, ["queued"])))
      .orderBy(schema.jobs.createdAt)
      .then((rows) => rows.filter((row) => row.payloadJson.userId === BEN));
    expect(job?.runAfter.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(job?.runAfter.getTime()).toBeLessThanOrEqual(Date.now());

    const undo = await post(client, "/me/close/undo", KEYS.benNowUndo, undefined, TOKENS.ben);
    expect(undo.status).toBe(409);
    expect((await problemOf(undo)).detail).toBe(UNDO_WINDOW_CLOSED);
    expect((await closureRows(BEN))[0]?.state).toBe("requested");
  });

  it("leaves Cara, who closed nothing, with her session and no request", async () => {
    expect(await sessionsOf(CARA)).toEqual([SESSIONS.cara]);
    expect(await closureRows(CARA)).toHaveLength(0);
  });
});

/**
 * Task E10: `DATABASE_URL` names `tidefern_app` on CI and in production
 * (architecture 7.2), and `is_system()` is false for that role by design.
 * Before E10 the close ran `withSystem()` on that pool and answered 500
 * with the `data_requests` policy error, which PGlite's superuser hid from
 * the block above. Here every request path runs as the app role.
 */
describe("account closure on the app role connection", () => {
  let fixture: AccountFixture;
  let client: Client;
  let closure: ClosureRequest;

  beforeAll(async () => {
    fixture = await createAccountFixture();
    client = build(fixture, asAppRole(fixture.harness.db));
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  const db = () => fixture.harness.db;
  const { sessionsOf, grantsInvolving, closureRows, deleteJobs, auditRows } = closureReads(db);

  it("closes with the undo window and revokes every grant in both directions, the one she holds too", async () => {
    const response = await post(
      client,
      "/me/close",
      KEYS.annaClose,
      { mode: "undo-window" },
      TOKENS.anna,
    );
    expect(response.status).toBe(200);
    closure = exact(ClosureRequest, await response.json());
    expect(closure).toMatchObject({ mode: "undo-window", state: "requested" });
    const requestedAt = Date.parse(closure.requestedAt);

    // Ben's grant to her is one her own update policy refuses (grants_update
    // is the owner's or a guardian's), so it is the one that proves the path.
    const grants = await grantsInvolving(ANNA);
    expect(grants.map((grant) => grant.id).sort()).toEqual(
      [
        GRANTS.annaToBenSymptoms,
        GRANTS.annaToCaraStatus,
        GRANTS.annaToCaraChild,
        GRANTS.benToAnnaHistory,
      ].sort(),
    );
    for (const grant of grants) {
      expect(grant.revokedAt?.getTime()).toBe(requestedAt);
      expect(grant.updatedAt.getTime()).toBe(requestedAt);
      expect(grant.version).toBe(2);
    }
    const [benToCara] = await db()
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, GRANTS.benToCaraStatus));
    expect(benToCara?.revokedAt).toBeNull();
    expect(benToCara?.version).toBe(1);

    expect(await sessionsOf(ANNA)).toEqual([SESSIONS.anna]);
    expect(await sessionsOf(BEN)).toEqual([SESSIONS.ben, SESSIONS.benStale].sort());

    const rows = await closureRows(ANNA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: closure.id, state: "requested" });
    const jobs = await deleteJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payloadJson).toEqual({ requestId: closure.id, userId: ANNA });
    expect(jobs[0]?.runAfter.getTime()).toBe(Date.parse(closure.undoUntil ?? ""));
    expect(jobs[0]?.status).toBe("queued");

    // One revocation row per grant at the request's instant, the child grant
    // against the child, and the closure itself.
    const revoked = await auditRows(ANNA, "grant.revoke");
    expect(
      revoked.map((row) => `${row.subjectId}/${row.category ?? ""}/${row.childId ?? ""}`).sort(),
    ).toEqual(
      [
        `${ANNA}/cycle.symptoms/`,
        `${ANNA}/cycle.status/`,
        `${CHILD}/child/${CHILD}`,
        `${BEN}/cycle.history/`,
      ].sort(),
    );
    for (const row of revoked) {
      expect(row.occurredAt.getTime()).toBe(requestedAt);
      expect(row.dedupeKey).toBeNull();
    }
    const closed = await auditRows(ANNA, "account.close");
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ subjectId: ANNA, category: null, childId: null });
  });

  it("locks the account at once: GET /v1/me answers 401 account_closing, the state route the request", async () => {
    const me = await get(client, "/me", TOKENS.anna);
    expect(me.status).toBe(401);
    expect((await problemOf(me)).detail).toBe(ACCOUNT_CLOSING);
    const state = exact(CloseState, await (await get(client, "/me/close", TOKENS.anna)).json());
    expect(state.request).toEqual(closure);
  });

  it("answers a second close with 409 closure_in_progress and writes nothing", async () => {
    const again = await post(
      client,
      "/me/close",
      KEYS.annaCloseAgain,
      { mode: "now" },
      TOKENS.anna,
    );
    expect(again.status).toBe(409);
    expect((await problemOf(again)).detail).toBe(CLOSURE_IN_PROGRESS);
    expect(await closureRows(ANNA)).toHaveLength(1);
    expect(await deleteJobs()).toHaveLength(1);
    expect(await auditRows(ANNA, "grant.revoke")).toHaveLength(4);
  });

  it("undoes inside the window and lets her back in, with every grant still revoked", async () => {
    const response = await post(client, "/me/close/undo", KEYS.annaUndo, undefined, TOKENS.anna);
    expect(response.status).toBe(200);
    const body = exact(CloseUndone, await response.json());
    expect(body.request).toMatchObject({ id: closure.id, state: "cancelled" });
    expect(await deleteJobs()).toHaveLength(0);
    expect(await auditRows(ANNA, "account.close.undo")).toHaveLength(1);

    expect((await get(client, "/me", TOKENS.anna)).status).toBe(200);
    expect((await grantsInvolving(ANNA)).filter((grant) => grant.revokedAt === null)).toEqual([]);
  });

  it("deletes now and revokes the grant Ben still had", async () => {
    const response = await post(client, "/me/close", KEYS.benNow, { mode: "now" }, TOKENS.ben);
    expect(response.status).toBe(200);
    const request = exact(ClosureRequest, await response.json());
    expect(request).toMatchObject({ mode: "now", undoUntil: null, state: "requested" });

    const [benToCara] = await db()
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, GRANTS.benToCaraStatus));
    expect(benToCara?.revokedAt?.getTime()).toBe(Date.parse(request.requestedAt));
    expect((await grantsInvolving(BEN)).every((grant) => grant.revokedAt !== null)).toBe(true);
    expect(await sessionsOf(BEN)).toEqual([SESSIONS.ben]);
    expect(await auditRows(BEN, "grant.revoke")).toHaveLength(1);
  });
});

/**
 * A grant the person still owns over a child she no longer guards: Anna
 * gave Cara a child grant, then stepped down with Ben still guarding Mo
 * (removing a guardian leaves the grants she gave in place). Her own audit
 * policy now refuses a row about Mo (`can_use_key`), so only the definer
 * function the close calls can record that revocation.
 */
describe("closing after stepping down as the guardian of a child she shared", () => {
  let fixture: AccountFixture;
  let client: Client;
  let appRole: ActorDatabase;

  beforeAll(async () => {
    fixture = await createAccountFixture();
    const { db } = fixture.harness;
    await db
      .insert(schema.childGuardians)
      .values({ id: "018f5e7a-a000-7000-8000-000000000004", childId: CHILD, userId: BEN });
    await db
      .delete(schema.childGuardians)
      .where(and(eq(schema.childGuardians.childId, CHILD), eq(schema.childGuardians.userId, ANNA)));
    appRole = asAppRole(db);
    client = build(fixture, appRole);
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  it("would be refused that audit row as herself", async () => {
    const message = await refusal(
      withActor(
        ANNA,
        (tx) =>
          tx.insert(schema.auditEvents).values({
            id: "018f5e7a-6000-7000-8000-0000000000e1",
            actorId: ANNA,
            action: "grant.revoke",
            subjectId: CHILD,
            category: "child",
            childId: CHILD,
          }),
        appRole,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "audit_events"/);
  });

  it("still closes, revoking that grant with its row against the child", async () => {
    const response = await post(
      client,
      "/me/close",
      KEYS.annaClose,
      { mode: "undo-window" },
      TOKENS.anna,
    );
    expect(response.status).toBe(200);
    const request = exact(ClosureRequest, await response.json());

    const [childGrant] = await fixture.harness.db
      .select()
      .from(schema.grants)
      .where(eq(schema.grants.id, GRANTS.annaToCaraChild));
    expect(childGrant?.revokedAt?.getTime()).toBe(Date.parse(request.requestedAt));
    const rows = await fixture.harness.db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.actorId, ANNA),
          eq(schema.auditEvents.action, "grant.revoke"),
          eq(schema.auditEvents.subjectId, CHILD),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "child", childId: CHILD });
  });
});
