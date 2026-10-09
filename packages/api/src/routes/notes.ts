import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { and, asc, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { can, categoriesFor, isKnownTimeZone, projectRow } from "@tidefern/core";
import type { Category, SubjectAccess } from "@tidefern/core";
import {
  EnvKeyProvider,
  createKeyCache,
  decryptFieldFor,
  encryptFieldFor,
  unwrapForSubject,
} from "@tidefern/crypto";
import type { KeyCache, KeyProvider } from "@tidefern/crypto";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { uuidv7 } from "@tidefern/core";
import {
  Id,
  Note,
  NoteCreateInput,
  NoteList,
  NoteListQuery,
  NoteShareInput,
  NoteUpdateInput,
  Problem,
  noteCategoryValues,
} from "@tidefern/schemas";

import type { RequestActor } from "../actor";
import { requireActor } from "../auth";
import type { ApiEnv } from "../context";
import { audit, auditActions, auditDay } from "../middleware/audit";
import { problem } from "../problem";

/**
 * The notes routes (task E6; architecture 8.2, 9.2 and 11). A note is the
 * one free-text record of the cycle and pregnancy stages. Its body is
 * sealed under the subject's DEK with the AAD `notes:body:<id>`, unwrapped
 * once per request through D2's cache and decrypted only after `can()`
 * approves; its category decides who may read it, `journal.private` by
 * default, re-filed only by the share action; a delete is a hard delete.
 */

/** The AAD binding of a note's body (architecture 9.2 item 3): the table, the column and the row. */
const BODY_FIELD = { table: "notes", column: "body" } as const;

const NOTE_CATEGORIES: readonly NoteCategory[] = noteCategoryValues;

type NoteCategory = (typeof noteCategoryValues)[number];
type NoteRow = typeof schema.notes.$inferSelect;

/**
 * What a host or a test may hand these routes through Hono's environment
 * slot (`app.fetch(request, env)` and `app.request(path, init, env)`): the
 * database `withActor()` opens the actor's transaction on, and the KEK
 * provider that unwraps data keys. Absent, which is what the Next.js host
 * passes, the production database and `TIDEFERN_KEK_V1` are used. A `db`
 * and `keys` on the request context would replace this; see the E6 report.
 */
export interface NotesBindings {
  db?: ActorDatabase | undefined;
  keys?: KeyProvider | undefined;
}

/** Reads `TIDEFERN_KEK_V1` on first use, so the contract emitter and a build without it still start. */
const envKeys = new EnvKeyProvider();

function bindingsOf(c: Context<ApiEnv>): { db: ActorDatabase | undefined; keys: KeyProvider } {
  const bindings = (c.env ?? {}) as NotesBindings;
  return { db: bindings.db, keys: bindings.keys ?? envKeys };
}

/** The signed-in actor; `requireActor` on every route guarantees one. */
function actorOf(c: Context<ApiEnv>): RequestActor {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before a notes handler");
  return actor;
}

const IfMatch = z.coerce
  .number()
  .int()
  .min(1)
  .openapi({ param: { name: "If-Match", in: "header" }, description: "The version last read" });

const problemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

const unauthenticated = problemResponse("No session");
const notFound = problemResponse("No such note, or none the actor may reach");
const invalid = problemResponse("Validation failed");
const conflict = problemResponse("The version is stale, or the id is taken");

const createNoteRoute = createRoute({
  method: "post",
  path: "/v1/notes",
  tags: ["notes"],
  summary: "Create a note",
  description:
    "A new note about the signed-in person, filed in the private journal, or about a person who granted contribute access, filed under that grant's category. The body is encrypted with the subject's data key. Requires Idempotency-Key.",
  middleware: [requireActor] as const,
  request: { body: { content: { "application/json": { schema: NoteCreateInput } } } },
  responses: {
    201: { description: "The note", content: { "application/json": { schema: Note } } },
    401: unauthenticated,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

const listNotesRoute = createRoute({
  method: "get",
  path: "/v1/notes",
  tags: ["notes"],
  summary: "List notes",
  description:
    "The notes of one subject in date order, every category the actor may read; a grantee never sees the private journal and a summary grantee sees no body. With updatedSince the page is a sync feed and includes tombstones.",
  middleware: [requireActor] as const,
  request: { query: NoteListQuery },
  responses: {
    200: { description: "One page", content: { "application/json": { schema: NoteList } } },
    401: unauthenticated,
    404: notFound,
    422: invalid,
  },
});

const getNoteRoute = createRoute({
  method: "get",
  path: "/v1/notes/{id}",
  tags: ["notes"],
  summary: "Read a note",
  middleware: [requireActor] as const,
  request: { params: z.object({ id: Id }) },
  responses: {
    200: { description: "The note", content: { "application/json": { schema: Note } } },
    401: unauthenticated,
    404: notFound,
    422: invalid,
  },
});

const updateNoteRoute = createRoute({
  method: "put",
  path: "/v1/notes/{id}",
  tags: ["notes"],
  summary: "Change a note's date or body",
  description: "Takes If-Match with the version last read and answers 409 when it is stale.",
  middleware: [requireActor] as const,
  request: {
    params: z.object({ id: Id }),
    headers: z.object({ "If-Match": IfMatch }),
    body: { content: { "application/json": { schema: NoteUpdateInput } } },
  },
  responses: {
    200: { description: "The note", content: { "application/json": { schema: Note } } },
    401: unauthenticated,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

const shareNoteRoute = createRoute({
  method: "post",
  path: "/v1/notes/{id}/share",
  tags: ["notes"],
  summary: "Re-file a note under a shareable category",
  description:
    "The only way a note leaves the private journal. The owner alone may share; the change is audited. Requires Idempotency-Key; If-Match is honoured when sent.",
  middleware: [requireActor] as const,
  request: {
    params: z.object({ id: Id }),
    headers: z.object({ "If-Match": IfMatch.optional() }),
    body: { content: { "application/json": { schema: NoteShareInput } } },
  },
  responses: {
    200: { description: "The note", content: { "application/json": { schema: Note } } },
    401: unauthenticated,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

const deleteNoteRoute = createRoute({
  method: "delete",
  path: "/v1/notes/{id}",
  tags: ["notes"],
  summary: "Delete a note",
  description: "A hard delete by the owner; nothing of the note remains.",
  middleware: [requireActor] as const,
  request: { params: z.object({ id: Id }) },
  responses: {
    204: { description: "Deleted" },
    401: unauthenticated,
    404: notFound,
    422: invalid,
  },
});

/** A page boundary: the date and id of the last item, base64url, opaque to clients. */
function encodeCursor(row: Pick<NoteRow, "date" | "id">): string {
  return Buffer.from(`${row.date}|${row.id}`, "utf8").toString("base64url");
}

const CURSOR = /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/;

function decodeCursor(cursor: string): { date: string; id: string } | null {
  const match = CURSOR.exec(Buffer.from(cursor, "base64url").toString("utf8"));
  return match === null ? null : { date: match[1] as string, id: match[2] as string };
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  return code === "23505" || causeCode === "23505";
}

/**
 * The calendar day a partner read is filed under (architecture 8.3 step 6):
 * today in the subject's time zone, never the server's zone, on the real
 * clock (`auditDay`), because it is the day the read happened. The
 * subject's profile row is readable to anyone with an active grant from
 * her; without one the day falls back to UTC.
 */
async function subjectDay(tx: Transaction, subjectId: string): Promise<string> {
  const [profile] = await tx
    .select({ timeZone: schema.profiles.timeZone })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, subjectId))
    .limit(1);
  const timeZone =
    profile !== undefined && isKnownTimeZone(profile.timeZone) ? profile.timeZone : "UTC";
  return auditDay(timeZone);
}

/**
 * One row as the actor may see it, or null when the storage map keeps no
 * column for her: the owner keeps the row whole, a grantee keeps it when
 * the row's own category is granted (`projectRow` on the `notes` rule), and
 * the body is decrypted only for a level of read or above. A tombstone
 * carries no body for anyone. Decryption uses the subject's key, which the
 * caller unwrapped into the request's cache after `can()` approved.
 */
function serialize(row: NoteRow, access: SubjectAccess, keys: KeyCache): Note | null {
  // Every field below is read from the projection, so a column the map drops can never leak.
  const projected = projectRow("notes", { ...row }, access);
  const {
    id,
    subjectId,
    authorId,
    category,
    date,
    body,
    createdAt,
    updatedAt,
    version,
    deletedAt,
  } = projected;
  if (
    id === undefined ||
    subjectId === undefined ||
    authorId === undefined ||
    category === undefined ||
    date === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    version === undefined
  ) {
    return null;
  }
  const level = access.levels[category as Category];
  const note: Note = {
    id,
    subjectId,
    authorId,
    category,
    date,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    version,
  };
  if (deletedAt !== undefined && deletedAt !== null) {
    note.deletedAt = deletedAt.toISOString();
    return note;
  }
  if (body !== undefined && (level === "read" || level === "contribute")) {
    note.body = decryptFieldFor(keys, { subjectId, ...BODY_FIELD, rowId: id }, body);
  }
  return note;
}

/** The live row by id as row level security shows it to the actor; a tombstone counts as gone. */
async function findNote(tx: Transaction, id: string): Promise<NoteRow | undefined> {
  const [row] = await tx
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.id, id), isNull(schema.notes.deletedAt)))
    .limit(1);
  return row;
}

export function registerNotes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(createNoteRoute, async (c) => {
    const actor = actorOf(c);
    const { db, keys: provider } = bindingsOf(c);
    const input = c.req.valid("json");
    const subjectId = input.subject ?? actor.id;
    const category = input.category;
    // The subject is an id the actor named; can() decides whether she reaches it (8.3 step 2 and 3).
    const decision = can(actor, "write", { subjectId, category });
    if (!decision.allowed) return problem(c, 404, "not_found");
    if (decision.reason === "owner" && category !== "journal.private") {
      return problem(c, 422, "validation_failed", {
        errors: [
          {
            path: "category",
            message: "Your own notes start in the private journal. Create it, then share it.",
          },
        ],
      });
    }
    const id = input.id ?? uuidv7();
    const keys = createKeyCache();
    try {
      return await withActor(
        actor.id,
        async (tx) => {
          await unwrapForSubject(tx, subjectId, provider, keys);
          const now = new Date();
          let inserted: NoteRow | undefined;
          try {
            [inserted] = await tx
              .insert(schema.notes)
              .values({
                id,
                subjectId,
                authorId: actor.id,
                category,
                date: input.date,
                body: encryptFieldFor(keys, { subjectId, ...BODY_FIELD, rowId: id }, input.body),
                kekVersion: provider.version,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
          } catch (error) {
            if (isUniqueViolation(error)) return problem(c, 409, "conflict");
            throw error;
          }
          if (inserted === undefined) return problem(c, 404, "not_found");
          if (decision.reason === "grant") {
            await audit(tx, {
              actorId: actor.id,
              action: auditActions.partnerWrite,
              subjectId,
              category,
            });
          }
          const access = categoriesFor(actor, subjectId);
          const note = access === null ? null : serialize(inserted, access, keys);
          if (note === null) return problem(c, 404, "not_found");
          c.header("Location", `${c.req.path}/${id}`);
          return c.json(note, 201);
        },
        db,
      );
    } finally {
      keys.clear();
    }
  });

  app.openapi(listNotesRoute, async (c) => {
    const actor = actorOf(c);
    const { db, keys: provider } = bindingsOf(c);
    const query = c.req.valid("query");
    const subjectId = query.subject ?? actor.id;
    const access = categoriesFor(actor, subjectId);
    if (access === null) return problem(c, 404, "not_found");
    // The categories a note can carry that this actor was granted; a grantee never has the private journal here.
    const readable = NOTE_CATEGORIES.filter((category) => access.categories.includes(category));
    if (readable.length === 0) return problem(c, 404, "not_found");
    const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (after === null) {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: "cursor", message: "The cursor is not one this list issued." }],
      });
    }
    const conditions = [
      eq(schema.notes.subjectId, subjectId),
      inArray(schema.notes.category, readable),
      query.from === undefined ? undefined : gte(schema.notes.date, query.from),
      query.to === undefined ? undefined : lte(schema.notes.date, query.to),
      query.updatedSince === undefined
        ? isNull(schema.notes.deletedAt)
        : gt(schema.notes.updatedAt, new Date(query.updatedSince)),
      after === undefined
        ? undefined
        : or(
            gt(schema.notes.date, after.date),
            and(eq(schema.notes.date, after.date), gt(schema.notes.id, after.id)),
          ),
    ];
    const keys = createKeyCache();
    try {
      return await withActor(
        actor.id,
        async (tx) => {
          const rows = await tx
            .select()
            .from(schema.notes)
            .where(and(...conditions))
            .orderBy(asc(schema.notes.date), asc(schema.notes.id))
            .limit(query.limit + 1);
          const page = rows.slice(0, query.limit);
          const last = page[page.length - 1];
          const nextCursor =
            rows.length > query.limit && last !== undefined ? encodeCursor(last) : null;
          if (page.some((row) => row.deletedAt === null)) {
            await unwrapForSubject(tx, subjectId, provider, keys);
          }
          const items: Note[] = [];
          const categoriesRead = new Set<NoteCategory>();
          for (const row of page) {
            const note = serialize(row, access, keys);
            if (note === null) continue;
            items.push(note);
            // A tombstone reveals nothing of the category, so it is not a read to audit.
            if (row.deletedAt === null) categoriesRead.add(row.category);
          }
          if (access.reason === "grant" && categoriesRead.size > 0) {
            const day = await subjectDay(tx, subjectId);
            for (const category of categoriesRead) {
              await audit(tx, {
                actorId: actor.id,
                action: auditActions.partnerRead,
                subjectId,
                category,
                day,
              });
            }
          }
          return c.json({ items, nextCursor }, 200);
        },
        db,
      );
    } finally {
      keys.clear();
    }
  });

  app.openapi(getNoteRoute, async (c) => {
    const actor = actorOf(c);
    const { db, keys: provider } = bindingsOf(c);
    const { id } = c.req.valid("param");
    const keys = createKeyCache();
    try {
      return await withActor(
        actor.id,
        async (tx) => {
          const row = await findNote(tx, id);
          if (row === undefined) return problem(c, 404, "not_found");
          const resource = { subjectId: row.subjectId, category: row.category };
          const decision = can(actor, "summary", resource);
          const access = categoriesFor(actor, row.subjectId);
          if (!decision.allowed || access === null) return problem(c, 404, "not_found");
          await unwrapForSubject(tx, row.subjectId, provider, keys);
          const note = serialize(row, access, keys);
          if (note === null) return problem(c, 404, "not_found");
          if (decision.reason === "grant") {
            await audit(tx, {
              actorId: actor.id,
              action: auditActions.partnerRead,
              subjectId: row.subjectId,
              category: row.category,
              day: await subjectDay(tx, row.subjectId),
            });
          }
          return c.json(note, 200);
        },
        db,
      );
    } finally {
      keys.clear();
    }
  });

  app.openapi(updateNoteRoute, async (c) => {
    const actor = actorOf(c);
    const { db, keys: provider } = bindingsOf(c);
    const { id } = c.req.valid("param");
    const expected = c.req.valid("header")["If-Match"];
    const input = c.req.valid("json");
    const keys = createKeyCache();
    try {
      return await withActor(
        actor.id,
        async (tx) => {
          const row = await findNote(tx, id);
          if (row === undefined) return problem(c, 404, "not_found");
          const decision = can(actor, "write", {
            subjectId: row.subjectId,
            category: row.category,
          });
          const access = categoriesFor(actor, row.subjectId);
          if (!decision.allowed || access === null) return problem(c, 404, "not_found");
          if (row.version !== expected) return problem(c, 409, "conflict");
          await unwrapForSubject(tx, row.subjectId, provider, keys);
          const [updated] = await tx
            .update(schema.notes)
            .set({
              ...(input.date !== undefined ? { date: input.date } : {}),
              ...(input.body !== undefined
                ? {
                    body: encryptFieldFor(
                      keys,
                      { subjectId: row.subjectId, ...BODY_FIELD, rowId: row.id },
                      input.body,
                    ),
                    kekVersion: provider.version,
                  }
                : {}),
              version: row.version + 1,
              updatedAt: new Date(),
            })
            .where(and(eq(schema.notes.id, row.id), eq(schema.notes.version, expected)))
            .returning();
          // Another writer moved the version between the read and the write.
          if (updated === undefined) return problem(c, 409, "conflict");
          if (decision.reason === "grant") {
            await audit(tx, {
              actorId: actor.id,
              action: auditActions.partnerWrite,
              subjectId: row.subjectId,
              category: row.category,
            });
          }
          const note = serialize(updated, access, keys);
          if (note === null) return problem(c, 404, "not_found");
          return c.json(note, 200);
        },
        db,
      );
    } finally {
      keys.clear();
    }
  });

  app.openapi(shareNoteRoute, async (c) => {
    const actor = actorOf(c);
    const { db, keys: provider } = bindingsOf(c);
    const { id } = c.req.valid("param");
    const expected = c.req.valid("header")["If-Match"];
    const input = c.req.valid("json");
    const keys = createKeyCache();
    try {
      return await withActor(
        actor.id,
        async (tx) => {
          const row = await findNote(tx, id);
          if (row === undefined) return problem(c, 404, "not_found");
          // "share" has no grant level: can() allows the owner alone.
          const decision = can(actor, "share", {
            subjectId: row.subjectId,
            category: row.category,
          });
          const access = categoriesFor(actor, row.subjectId);
          if (!decision.allowed || access === null) return problem(c, 404, "not_found");
          if (expected !== undefined && row.version !== expected) {
            return problem(c, 409, "conflict");
          }
          await unwrapForSubject(tx, row.subjectId, provider, keys);
          let current = row;
          if (row.category !== input.category) {
            const [updated] = await tx
              .update(schema.notes)
              .set({ category: input.category, version: row.version + 1, updatedAt: new Date() })
              .where(and(eq(schema.notes.id, row.id), eq(schema.notes.version, row.version)))
              .returning();
            if (updated === undefined) return problem(c, 409, "conflict");
            current = updated;
            await audit(tx, {
              actorId: actor.id,
              action: auditActions.noteShare,
              subjectId: row.subjectId,
              category: input.category,
            });
          }
          const note = serialize(current, access, keys);
          if (note === null) return problem(c, 404, "not_found");
          return c.json(note, 200);
        },
        db,
      );
    } finally {
      keys.clear();
    }
  });

  app.openapi(deleteNoteRoute, async (c) => {
    const actor = actorOf(c);
    const { db } = bindingsOf(c);
    const { id } = c.req.valid("param");
    return withActor(
      actor.id,
      async (tx) => {
        const row = await findNote(tx, id);
        if (row === undefined) return problem(c, 404, "not_found");
        const decision = can(actor, "delete", { subjectId: row.subjectId, category: row.category });
        if (!decision.allowed) return problem(c, 404, "not_found");
        // Hard delete (architecture 11): no tombstone, nothing of the note remains.
        const removed = await tx
          .delete(schema.notes)
          .where(eq(schema.notes.id, row.id))
          .returning({ id: schema.notes.id });
        if (removed.length === 0) return problem(c, 404, "not_found");
        return c.body(null, 204);
      },
      db,
    );
  });
}
