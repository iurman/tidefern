import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, TypedResponse } from "hono";
import { stream } from "hono/streaming";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  EnvKeyProvider,
  SubjectKeyMissingError,
  createKeyCache,
  decryptFieldFor,
  unwrapForSubject,
} from "@tidefern/crypto";
import type { KeyCache, KeyProvider } from "@tidefern/crypto";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { enqueue, jobId as uuidv7 } from "@tidefern/db/jobs";
import {
  ActivityPage,
  ActivityQuery,
  CloseInput,
  CloseState,
  CloseUndone,
  CloseAnswer,
  ExportLine,
  Problem,
} from "@tidefern/schemas";
import type {
  Problem as ProblemShape,
  ActivityEvent as ActivityEventShape,
  ClosureRequest as ClosureRequestShape,
  ExportLine as ExportLineShape,
} from "@tidefern/schemas";

import { requireActor, requireFreshAuth } from "../auth";
import type { ApiEnv } from "../context";
import { audit, auditActions } from "../middleware/audit";
import { problem } from "../problem";
import type { ProblemCode } from "../problem";

/**
 * The account area of architecture record 11: the activity view over the
 * audit log, the export streamed on demand after fresh authentication, and
 * account closure with its seven day undo window. The deletion itself is
 * task I2's job; this module writes the `data_requests` row and enqueues it.
 *
 * Every route acts on the signed-in person and on nobody else, so the
 * subject is always the actor from the session, never an id from the client.
 */

/** Architecture 7.3 and 11: a closure waits seven days unless the person chose delete now. */
export const UNDO_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** Architecture 11: every data request answers within 45 days. */
export const REQUEST_DEADLINE_MS = 45 * 24 * 60 * 60_000;

/** The content type and file name of an export carry no health word (architecture 9.1). */
export const EXPORT_CONTENT_TYPE = "application/octet-stream";
export const EXPORT_FILE_NAME = "tidefern-export.ndjson";

/** The `detail` values of the problems this module answers. */
export const CLOSURE_IN_PROGRESS = "closure_in_progress";
export const UNDO_WINDOW_CLOSED = "undo_window_closed";
export const ACTIVITY_CURSOR_INVALID = "cursor_invalid";

/**
 * The context variables a route reads its database and key provider from.
 * The host hands both to `createApp()`, but the route registry hands a route
 * only the app, so until app.ts sets these two variables a route takes them
 * from the context when a test (or a wrapping host) set them there, and
 * otherwise falls back to the production client inside `withActor()` and to
 * the environment KEK of architecture 17.1.
 */
export const DB_VARIABLE = "db";
export const KEYS_VARIABLE = "keys";

const envKeys = new EnvKeyProvider();

interface Injected {
  db?: ActorDatabase | undefined;
  keys?: KeyProvider | undefined;
}

function injected(c: Context<ApiEnv>): { db: ActorDatabase | undefined; keys: KeyProvider } {
  const vars = c.var as unknown as Injected;
  return { db: vars.db, keys: vars.keys ?? envKeys };
}

function actorOf(c: Context<ApiEnv>) {
  const actor = c.var.actor;
  const session = c.var.session;
  if (actor === null || session === null) {
    throw new Error("requireActor must run before the account handlers");
  }
  return { actor, session };
}

/** A problem response, typed as the 401 every route here documents. */
const PROBLEM = { "application/problem+json": { schema: Problem } };

/** The statuses this module answers a problem with from a handler. */
type HandlerProblemStatus = 404 | 409 | 422;

/**
 * `problem()` answered with its status narrowed to the one named, which is
 * what `app.openapi()` checks against a route's documented responses. Kept
 * here rather than in problem.ts so this area changes no shared module.
 */
function problemAt<Status extends HandlerProblemStatus>(
  c: Context,
  status: Status,
  code: ProblemCode,
  extra: Partial<Pick<ProblemShape, "detail" | "errors">> = {},
): Response & TypedResponse<ProblemShape, Status, "json"> {
  return problem(c, status, code, extra) as unknown as Response &
    TypedResponse<ProblemShape, Status, "json">;
}

// The activity view. ----------------------------------------------------------

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/;

/** An opaque cursor: the row's instant and id, base64url. */
export function encodeActivityCursor(occurredAt: Date, id: string): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeActivityCursor(raw: string): { occurredAt: Date; id: string } | null {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const match = CURSOR.exec(text);
  if (match === null) return null;
  const occurredAt = new Date(match[1] as string);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { occurredAt, id: match[2] as string };
}

export const activityRoute = createRoute({
  method: "get",
  path: "/v1/me/activity",
  tags: ["account"],
  summary: "The actor's activity",
  description:
    "Audit events where the actor did something or something was done to her records, newest first, cursor paginated. Each row says what, who, whose and when; never content.",
  middleware: [requireActor] as const,
  request: { query: ActivityQuery },
  responses: {
    200: {
      description: "A page of activity",
      content: { "application/json": { schema: ActivityPage } },
    },
    401: { description: "No session", content: PROBLEM },
    422: { description: "A bad cursor or limit", content: PROBLEM },
  },
});

/**
 * The instant is compared at millisecond precision, because the cursor
 * carries a JavaScript date while `occurred_at` is a timestamptz with
 * microseconds; without the truncation a row between two milliseconds
 * would be skipped at a page boundary.
 */
const occurredAtMs = sql`date_trunc('milliseconds', ${schema.auditEvents.occurredAt})`;

async function activityPage(
  tx: Transaction,
  me: string,
  limit: number,
  after: { occurredAt: Date; id: string } | null,
): Promise<ActivityEventShape[]> {
  const mine = or(eq(schema.auditEvents.actorId, me), eq(schema.auditEvents.subjectId, me));
  const condition =
    after === null
      ? mine
      : and(
          mine,
          sql`(${occurredAtMs}, ${schema.auditEvents.id}) < (${after.occurredAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        );
  const rows = await tx
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      actorId: schema.auditEvents.actorId,
      subjectId: schema.auditEvents.subjectId,
      category: schema.auditEvents.category,
      childId: schema.auditEvents.childId,
      occurredAt: schema.auditEvents.occurredAt,
    })
    .from(schema.auditEvents)
    .where(condition)
    .orderBy(desc(occurredAtMs), desc(schema.auditEvents.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    subjectId: row.subjectId,
    ...(row.category !== null ? { category: row.category } : {}),
    ...(row.childId !== null ? { childId: row.childId } : {}),
    occurredAt: row.occurredAt.toISOString(),
  }));
}

// The export. -------------------------------------------------------------------

export const exportRoute = createRoute({
  method: "get",
  path: "/v1/me/export",
  tags: ["account"],
  summary: "Export the actor's own data",
  description:
    "Streams the person's own rows as newline-delimited JSON, one ExportLine per line: an ExportHeader first, then one ExportRecord per row with encrypted text decrypted on the fly, then an ExportEnd with the record count. The status is sent before the rows, so a file that does not end with the ExportEnd line was cut off and is incomplete. Built on demand inside the actor's transaction and never stored. Requires an authentication within the last ten minutes and is recorded in the activity view.",
  middleware: [requireActor, requireFreshAuth()] as const,
  responses: {
    200: {
      description:
        "The export as an attachment: newline-delimited JSON, each line one ExportLine (the ExportHeader first, then ExportRecord rows, then the ExportEnd that marks the file complete)",
      content: { [EXPORT_CONTENT_TYPE]: { schema: ExportLine } },
    },
    401: {
      description:
        "No session, or one authenticated too long ago (detail fresh_authentication_required)",
      content: PROBLEM,
    },
  },
});

type Plain = Record<string, unknown>;

/** A row as JSON: dates as instants, ciphertext never, and the named columns dropped. */
function plain(row: Readonly<Record<string, unknown>>, omit: readonly string[] = []): Plain {
  const out: Plain = {};
  for (const [key, value] of Object.entries(row)) {
    if (omit.includes(key) || value instanceof Uint8Array) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

const ENCRYPTED = ["kekVersion"] as const;

/**
 * Every row of the person's own, in the order a reader would expect, each
 * written as it is read so nothing is assembled in memory beyond one table
 * at a time. Only rows whose subject is the person: a child's rows belong to
 * the child and stay with the guardians.
 */
async function writeExport(
  tx: Transaction,
  me: string,
  cache: KeyCache,
  write: (line: ExportLineShape) => Promise<void>,
): Promise<void> {
  await write({ kind: "export", format: 1, subjectId: me, generatedAt: new Date().toISOString() });
  let records = 0;
  const record = (kind: string, data: Plain) => {
    records += 1;
    return write({ kind, data });
  };

  const [profile] = await tx
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, me))
    .limit(1);
  if (profile !== undefined) await record("profile", plain(profile));

  for (const row of await tx
    .select()
    .from(schema.consents)
    .where(and(eq(schema.consents.subjectId, me), isNull(schema.consents.deletedAt)))
    .orderBy(schema.consents.grantedAt, schema.consents.id)) {
    await record("consent", plain(row));
  }

  const entries = await tx
    .select()
    .from(schema.cycleEntries)
    .where(and(eq(schema.cycleEntries.subjectId, me), isNull(schema.cycleEntries.deletedAt)))
    .orderBy(schema.cycleEntries.date);
  const symptoms = await tx
    .select({ entryId: schema.entrySymptoms.entryId, code: schema.entrySymptoms.code })
    .from(schema.entrySymptoms)
    .where(and(eq(schema.entrySymptoms.subjectId, me), isNull(schema.entrySymptoms.deletedAt)))
    .orderBy(schema.entrySymptoms.entryId, schema.entrySymptoms.code);
  for (const entry of entries) {
    const codes = symptoms.filter((row) => row.entryId === entry.id).map((row) => row.code);
    await record("cycleEntry", { ...plain(entry), symptoms: codes });
  }

  for (const row of await tx
    .select()
    .from(schema.cyclePredictions)
    .where(
      and(eq(schema.cyclePredictions.subjectId, me), isNull(schema.cyclePredictions.deletedAt)),
    )) {
    await record("cyclePrediction", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.pregnancies)
    .where(and(eq(schema.pregnancies.subjectId, me), isNull(schema.pregnancies.deletedAt)))
    .orderBy(schema.pregnancies.startedAt)) {
    await record("pregnancy", plain(row));
  }
  for (const row of await tx
    .select()
    .from(schema.pregnancyEvents)
    .where(and(eq(schema.pregnancyEvents.subjectId, me), isNull(schema.pregnancyEvents.deletedAt)))
    .orderBy(schema.pregnancyEvents.date, schema.pregnancyEvents.id)) {
    const label =
      row.label === null
        ? null
        : decryptFieldFor(
            cache,
            { subjectId: me, table: "pregnancy_events", column: "label", rowId: row.id },
            row.label,
          );
    await record("pregnancyEvent", { ...plain(row, ENCRYPTED), label });
  }
  for (const row of await tx
    .select()
    .from(schema.dueDateChanges)
    .where(eq(schema.dueDateChanges.subjectId, me))
    .orderBy(schema.dueDateChanges.changedAt)) {
    await record("dueDateChange", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.subjectId, me), isNull(schema.notes.deletedAt)))
    .orderBy(schema.notes.date, schema.notes.id)) {
    const body = decryptFieldFor(
      cache,
      { subjectId: me, table: "notes", column: "body", rowId: row.id },
      row.body,
    );
    await record("note", { ...plain(row, ENCRYPTED), body });
  }

  for (const row of await tx
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.subjectId, me), isNull(schema.photos.deletedAt)))
    .orderBy(schema.photos.createdAt)) {
    const caption =
      row.caption === null
        ? null
        : decryptFieldFor(
            cache,
            { subjectId: me, table: "photos", column: "caption", rowId: row.id },
            row.caption,
          );
    await record("photo", { ...plain(row, [...ENCRYPTED, "objectKey"]), caption });
  }

  for (const row of await tx
    .select()
    .from(schema.grants)
    .where(or(eq(schema.grants.ownerId, me), eq(schema.grants.granteeId, me)))
    .orderBy(schema.grants.createdAt, schema.grants.id)) {
    await record("grant", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.userId, me))
    .orderBy(schema.householdMembers.joinedAt)) {
    await record("householdMembership", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.childGuardians)
    .where(eq(schema.childGuardians.userId, me))
    .orderBy(schema.childGuardians.createdAt)) {
    await record("guardianship", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.auditEvents)
    .where(or(eq(schema.auditEvents.actorId, me), eq(schema.auditEvents.subjectId, me)))
    .orderBy(schema.auditEvents.occurredAt, schema.auditEvents.id)) {
    await record("activity", plain(row, ["dedupeKey"]));
  }

  for (const row of await tx
    .select()
    .from(schema.dataRequests)
    .where(eq(schema.dataRequests.userId, me))
    .orderBy(schema.dataRequests.requestedAt)) {
    await record("dataRequest", plain(row));
  }

  for (const row of await tx
    .select()
    .from(schema.disclosures)
    .where(eq(schema.disclosures.userId, me))
    .orderBy(schema.disclosures.createdAt)) {
    await record("disclosure", plain(row));
  }

  // Last, and only once every record is out: the response is already 200
  // when the first line leaves, so a failure partway shows as a file with no
  // end line rather than as a status.
  await write({ kind: "end", records });
}

// Account closure. ----------------------------------------------------------------

export const closeRoute = createRoute({
  method: "post",
  path: "/v1/me/close",
  tags: ["account"],
  summary: "Close the account",
  description:
    "Revokes every other session and every grant held or given, files the closure request, and enqueues the deletion job: due when the undo window ends, or at once for delete now. Requires an authentication within the last ten minutes and an Idempotency-Key. Answers the request with its deadlines; a replay with the same Idempotency-Key answers the request's id only (ClosureReplay, with the replay header), so read GET /v1/me/close for the state.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: { body: { content: { "application/json": { schema: CloseInput } }, required: true } },
  responses: {
    200: {
      description:
        "The closure request, or on a replay of the same Idempotency-Key its id only (ClosureReplay)",
      content: { "application/json": { schema: CloseAnswer } },
    },
    400: { description: "No Idempotency-Key", content: PROBLEM },
    401: {
      description:
        "No session, or one authenticated too long ago (detail fresh_authentication_required)",
      content: PROBLEM,
    },
    409: {
      description: "A closure is already open (detail closure_in_progress)",
      content: PROBLEM,
    },
    422: { description: "An unknown mode", content: PROBLEM },
  },
});

export const closeStateRoute = createRoute({
  method: "get",
  path: "/v1/me/close",
  tags: ["account"],
  summary: "Whether the account is closing",
  description: "The open closure request with its deadlines, or null.",
  middleware: [requireActor] as const,
  responses: {
    200: { description: "The state", content: { "application/json": { schema: CloseState } } },
    401: { description: "No session", content: PROBLEM },
  },
});

export const closeUndoRoute = createRoute({
  method: "post",
  path: "/v1/me/close/undo",
  tags: ["account"],
  summary: "Undo the closure",
  description:
    "Cancels an open closure inside its undo window and removes its deletion job. The sessions and grants revoked at closure stay revoked, and the answer says so. Requires an Idempotency-Key.",
  middleware: [requireActor] as const,
  responses: {
    200: {
      description: "The cancelled request",
      content: { "application/json": { schema: CloseUndone } },
    },
    400: { description: "No Idempotency-Key", content: PROBLEM },
    401: { description: "No session", content: PROBLEM },
    404: { description: "No open closure", content: PROBLEM },
    409: {
      description:
        "The window has passed, or the person chose delete now (detail undo_window_closed)",
      content: PROBLEM,
    },
  },
});

type DataRequestRow = typeof schema.dataRequests.$inferSelect;

const OPEN_STATES = ["requested", "in_progress"] as const;

/** The one closure that is still open for the person, if any. */
async function openClosure(tx: Transaction, me: string): Promise<DataRequestRow | undefined> {
  const [row] = await tx
    .select()
    .from(schema.dataRequests)
    .where(
      and(
        eq(schema.dataRequests.userId, me),
        eq(schema.dataRequests.kind, "closure"),
        inArray(schema.dataRequests.state, [...OPEN_STATES]),
      ),
    )
    .orderBy(desc(schema.dataRequests.requestedAt))
    .limit(1);
  return row;
}

function closureBody(row: DataRequestRow): ClosureRequestShape {
  return {
    id: row.id,
    mode: row.undoUntil === null ? "now" : "undo-window",
    state: row.state,
    requestedAt: row.requestedAt.toISOString(),
    undoUntil: row.undoUntil === null ? null : row.undoUntil.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
  };
}

/**
 * Holds the person's closure lock to the end of the transaction. Two closes
 * with different Idempotency-Keys, or a close and a consent withdrawal,
 * would otherwise both pass the open-closure check under READ COMMITTED,
 * and the second would meet the one-open-closure index (B13) as a 500; with
 * the lock the second waits and then sees the first one's row. Both ways
 * into a closure take it: this module's close and the profile area's
 * consent withdrawal.
 */
export async function lockClosure(tx: Transaction, me: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`account.close:${me}`}, 0))`,
  );
}

/**
 * The revoke of architecture 11 that both ways into a closure share, run
 * in the person's own `withActor()` transaction once her closure request
 * is written: every grant she gave or holds is revoked at `at`, each with
 * its `grant.revoke` audit row, then every session but the one making the
 * request ends, so she can still undo from it.
 *
 * The grants go through `revoke_closure_grants()` (migration 0011), because
 * that is the step her own policies refuse: `grants_update` is the owner's
 * or a guardian's, so a grant someone gave her would match no row and stay
 * live, and her audit policy refuses a row about a child she no longer
 * guards. The function acts only on `current_actor()`'s grants and only
 * while her closure is open, which is why the request row comes first.
 * Better Auth's `session` table sits outside row level security, and the
 * app role may write it.
 */
export async function revokeAtClosure(
  tx: Transaction,
  me: string,
  sessionId: string,
  at: Date,
): Promise<void> {
  const result = (await tx.execute(
    sql`select revoke_closure_grants(${at.toISOString()}::timestamptz) as ok`,
  )) as { rows: { ok: boolean | null }[] };
  if (result.rows[0]?.ok !== true) {
    // No open closure of hers in this transaction: a caller out of order.
    throw new Error("the closure's grants could not be revoked");
  }
  await tx
    .delete(schema.session)
    .where(and(eq(schema.session.userId, me), ne(schema.session.id, sessionId)));
}

/**
 * Locks and revokes at once (architecture 11), in one transaction so none
 * of it lands without the rest, and as the person herself: `withActor()`
 * on the request pool, which is `tidefern_app` on CI and in production
 * (7.2), where `withSystem()` gets no system context. The request row is
 * written before the revoke because `revoke_closure_grants()` acts only
 * while her closure is open. The subject of every row is the signed-in
 * person; nothing from the request body names whose account this is.
 */
async function closeAccount(
  db: ActorDatabase | undefined,
  me: string,
  sessionId: string,
  mode: "undo-window" | "now",
): Promise<{ request: DataRequestRow; jobId: string } | "open"> {
  return withActor(
    me,
    async (tx) => {
      await lockClosure(tx, me);
      if ((await openClosure(tx, me)) !== undefined) return "open";
      const now = new Date();
      const undoUntil = mode === "undo-window" ? new Date(now.getTime() + UNDO_WINDOW_MS) : null;

      const [request] = await tx
        .insert(schema.dataRequests)
        .values({
          id: uuidv7(),
          userId: me,
          kind: "closure",
          state: "requested",
          requestedAt: now,
          deadlineAt: new Date(now.getTime() + REQUEST_DEADLINE_MS),
          undoUntil,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (request === undefined) throw new Error("the closure request was not written");

      await revokeAtClosure(tx, me, sessionId, now);

      const jobId = await enqueue(
        tx,
        "account.delete",
        { requestId: request.id, userId: me },
        { runAfter: undoUntil ?? now },
      );
      await audit(tx, {
        actorId: me,
        action: auditActions.accountClose,
        subjectId: me,
        occurredAt: now,
      });
      return { request, jobId };
    },
    db,
  );
}

async function undoClosure(
  db: ActorDatabase | undefined,
  me: string,
): Promise<DataRequestRow | "none" | "closed"> {
  return withActor(
    me,
    async (tx) => {
      const open = await openClosure(tx, me);
      if (open === undefined) return "none";
      const now = new Date();
      if (open.state !== "requested" || open.undoUntil === null || open.undoUntil < now) {
        return "closed";
      }
      const [cancelled] = await tx
        .update(schema.dataRequests)
        .set({ state: "cancelled", completedAt: now, updatedAt: now })
        .where(eq(schema.dataRequests.id, open.id))
        .returning();
      if (cancelled === undefined) throw new Error("the closure request was not cancelled");
      // The deletion job that was waiting for the window, cancelled in the
      // same transaction as 8.4 does for reminders; the handler also checks
      // the request's state, so a job that already ran is harmless.
      await tx
        .delete(schema.jobs)
        .where(
          and(
            eq(schema.jobs.type, "account.delete"),
            eq(schema.jobs.status, "queued"),
            sql`${schema.jobs.payloadJson} ->> 'requestId' = ${open.id}`,
          ),
        );
      await audit(tx, {
        actorId: me,
        action: auditActions.accountCloseUndo,
        subjectId: me,
        occurredAt: now,
      });
      return cancelled;
    },
    db,
  );
}

// Registration. ---------------------------------------------------------------------

/** The account routes; one line in routes/index.ts calls this. */
export function registerAccount(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(activityRoute, async (c) => {
    const { actor } = actorOf(c);
    const { db } = injected(c);
    const { cursor, limit } = c.req.valid("query");
    let after: { occurredAt: Date; id: string } | null = null;
    if (cursor !== undefined) {
      after = decodeActivityCursor(cursor);
      if (after === null) {
        return problemAt(c, 422, "validation_failed", {
          detail: ACTIVITY_CURSOR_INVALID,
          errors: [{ path: "cursor", message: "The cursor is not one this list issued." }],
        });
      }
    }
    const rows = await withActor(
      actor.id,
      (tx) => activityPage(tx, actor.id, limit + 1, after),
      db,
    );
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > limit && last !== undefined
        ? encodeActivityCursor(new Date(last.occurredAt), last.id)
        : null;
    return c.json({ items, nextCursor }, 200);
  });

  app.openapi(exportRoute, async (c) => {
    const { actor } = actorOf(c);
    const { db, keys } = injected(c);
    const me = actor.id;
    const cache = createKeyCache();
    // The key and the audit row first, in their own transaction, so a
    // missing key or a refused audit row answers before any byte streams.
    try {
      await withActor(
        me,
        async (tx) => {
          try {
            await unwrapForSubject(tx, me, keys, cache);
          } catch (error) {
            // A person who never wrote free text has no key yet, and so no
            // ciphertext to open: her export simply carries no decrypted field.
            if (!(error instanceof SubjectKeyMissingError)) throw error;
          }
          await audit(tx, { actorId: me, action: auditActions.exportCreate, subjectId: me });
        },
        db,
      );
    } catch (error) {
      cache.clear();
      throw error;
    }
    c.header("Content-Type", EXPORT_CONTENT_TYPE);
    c.header("Content-Disposition", `attachment; filename="${EXPORT_FILE_NAME}"`);
    return stream(
      c,
      async (out) => {
        try {
          await withActor(
            me,
            (tx) =>
              writeExport(tx, me, cache, async (line) => {
                await out.writeln(JSON.stringify(line));
              }),
            db,
          );
        } finally {
          cache.clear();
        }
      },
      async (error) => {
        // The name only: a database error can quote the row it was reading.
        console.error("export_stream_error", { name: error.name });
      },
    );
  });

  app.openapi(closeRoute, async (c) => {
    const { actor, session } = actorOf(c);
    const { db } = injected(c);
    const { mode } = c.req.valid("json");
    const outcome = await closeAccount(db, actor.id, session.id, mode);
    if (outcome === "open") {
      return problemAt(c, 409, "conflict", { detail: CLOSURE_IN_PROGRESS });
    }
    c.var.drainJobs([outcome.jobId]);
    return c.json(closureBody(outcome.request), 200);
  });

  app.openapi(closeStateRoute, async (c) => {
    const { actor } = actorOf(c);
    const { db } = injected(c);
    const open = await withActor(actor.id, (tx) => openClosure(tx, actor.id), db);
    return c.json({ request: open === undefined ? null : closureBody(open) }, 200);
  });

  app.openapi(closeUndoRoute, async (c) => {
    const { actor } = actorOf(c);
    const { db } = injected(c);
    const outcome = await undoClosure(db, actor.id);
    if (outcome === "none") return problemAt(c, 404, "not_found");
    if (outcome === "closed") {
      return problemAt(c, 409, "conflict", { detail: UNDO_WINDOW_CLOSED });
    }
    return c.json(
      {
        request: closureBody(outcome),
        sessionsRestored: false as const,
        grantsRestored: false as const,
      },
      200,
    );
  });
}
