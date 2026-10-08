import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { and, asc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  changeDueDate,
  compareDates,
  endPregnancy,
  isCalendarDate,
  shouldRedate,
  stageAfter,
} from "@tidefern/core";
import { createKeyCache } from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";
import type { PregnancyEvent, PregnancyEventTombstone } from "@tidefern/schemas";

import type { RequestActor } from "../../actor";
import type { ApiEnv } from "../../context";
import { audit, auditActions, auditDay } from "../../middleware/audit";
import { problem } from "../../problem";
import {
  createEventRoute,
  currentRoute,
  datingHistoryRoute,
  datingRoute,
  deleteEventRoute,
  endRoute,
  eventRoute,
  listEventsRoute,
  pregnancyRoute,
  startRoute,
  updateEventRoute,
} from "./contract";
import {
  CATEGORY,
  dateFieldOf,
  decodeCursor,
  dueDateFor,
  encodeCursor,
  loadEvent,
  loadPregnancy,
  openDetail,
  ownerOnly,
  ownerView,
  resolveAccess,
  sealDetail,
  serializeEvent,
  serializePregnancy,
  serializeTombstone,
  subjectTimeZone,
  toRecord,
} from "./records";
import type { PregnancyAccess, PregnancyRow } from "./records";

/** The `detail` values of the problems this area answers beyond the middleware's. */
export const PROFILE_REQUIRED = "profile_required";
export const PREGNANCY_OPEN = "pregnancy_open";
export const PREGNANCY_ENDED = "pregnancy_ended";
/** What a grantee is told instead: the neutral paused state of architecture 8.4, never "ended". */
export const PREGNANCY_PAUSED = "pregnancy_paused";
export const STALE_VERSION = "stale_version";
export const ID_IN_USE = "id_in_use";

/** The outbox job a reminder is queued as (I1's `reminder.send`), keyed by the pregnancy it is for. */
export const REMINDER_JOB_TYPE = "reminder.send";
export const REMINDER_PAYLOAD_KEY = "pregnancyId";

export interface PregnancyRouteOptions {
  db?: ActorDatabase | undefined;
  keys: KeyProvider;
}

function actorOn(c: Context<ApiEnv>): RequestActor {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before a pregnancy handler");
  return actor;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  return code === "23505" || causeCode === "23505";
}

/** A contributor's write is audited (architecture 8.3 step 6); the subject's own is not. */
async function auditWrite(
  tx: Transaction,
  actor: RequestActor,
  resolved: PregnancyAccess,
  subjectId: string,
) {
  if (resolved.decision.reason !== "grant") return;
  await audit(tx, {
    actorId: actor.id,
    action: auditActions.partnerWrite,
    subjectId,
    category: CATEGORY,
  });
}

/** A grantee's read collapses to one row per day in the subject's zone (a real day, `auditDay`). */
async function auditRead(
  tx: Transaction,
  actor: RequestActor,
  resolved: PregnancyAccess,
  subjectId: string,
  day: string,
) {
  if (resolved.decision.reason !== "grant") return;
  await audit(tx, {
    actorId: actor.id,
    action: auditActions.partnerRead,
    subjectId,
    category: CATEGORY,
    day,
  });
}

const stale = (c: Context<ApiEnv>) => problem(c, 409, "conflict", { detail: STALE_VERSION });
const ended = (c: Context<ApiEnv>) => problem(c, 409, "conflict", { detail: PREGNANCY_ENDED });
const notADay = (c: Context<ApiEnv>, path: string) =>
  problem(c, 422, "validation_failed", { errors: [{ path, message: "Not a calendar day." }] });
/** Her own requests learn that the pregnancy ended; a grantee only that it is paused. */
const closedFor = (resolved: PregnancyAccess) =>
  resolved.decision.reason === "owner" ? PREGNANCY_ENDED : PREGNANCY_PAUSED;
const badCursor = (c: Context<ApiEnv>) =>
  problem(c, 422, "validation_failed", {
    errors: [{ path: "cursor", message: "The cursor is not one this list issued." }],
  });

/**
 * The pregnancy area (architecture 8.2 and 8.4): start, the current view
 * by subject, dating with its owner-only history, events with an encrypted
 * detail, and the ending whose reason is hers alone. Every query runs in
 * the actor's transaction, so B8's policies enforce the same rule `can()`
 * decided; a denied or absent record is 404 either way. The gestation a
 * view shows is counted to today on the calendar clock (`c.var.clock`); the
 * day a grantee's read is audited under is the real one (`auditDay`).
 */
export function registerPregnancy(app: OpenAPIHono<ApiEnv>, options: PregnancyRouteOptions): void {
  const { db, keys } = options;

  app.openapi(startRoute, async (c) => {
    const actor = actorOn(c);
    const body = c.req.valid("json");
    const profile = actor.profile;
    if (profile === null) {
      return problem(c, 422, "validation_failed", {
        detail: PROFILE_REQUIRED,
        errors: [{ path: "profile", message: "Create the profile first; it holds the time zone." }],
      });
    }
    const dueDate = dueDateFor(body.dating);
    if (dueDate === null) {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: `dating.${dateFieldOf(body.dating)}`, message: "Not a calendar day." }],
      });
    }
    // The subject is the signed-in actor; can() answers from the owner path.
    const resolved = ownerOnly(resolveAccess(actor, actor.id, "write"));
    if (resolved === null) return problem(c, 404, "not_found");
    const id = body.id ?? uuidv7();
    const now = new Date();
    let outcome: { row: PregnancyRow } | { conflict: typeof PREGNANCY_OPEN | typeof ID_IN_USE };
    try {
      outcome = await withActor(
        actor.id,
        async (tx) => {
          const [open] = await tx
            .select({ id: schema.pregnancies.id })
            .from(schema.pregnancies)
            .where(
              and(
                eq(schema.pregnancies.subjectId, actor.id),
                isNull(schema.pregnancies.endedAt),
                isNull(schema.pregnancies.deletedAt),
              ),
            )
            .limit(1);
          if (open !== undefined) return { conflict: PREGNANCY_OPEN };
          const [row] = await tx
            .insert(schema.pregnancies)
            .values({
              id,
              subjectId: actor.id,
              dueDate,
              datingMethod: body.dating.method,
              startedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (row === undefined) throw new Error("the pregnancy insert returned no row");
          await tx
            .update(schema.profiles)
            .set({
              stage: stageAfter(toRecord(row)),
              updatedAt: now,
              version: sql`${schema.profiles.version} + 1`,
            })
            .where(eq(schema.profiles.userId, actor.id));
          return { row };
        },
        db,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      outcome = { conflict: ID_IN_USE };
    }
    if ("conflict" in outcome) return problem(c, 409, "conflict", { detail: outcome.conflict });
    // ownerOnly above: the starter is the subject, so the answer is her whole record.
    const view = ownerView(outcome.row, c.var.clock.today(profile.timeZone, now));
    c.header("Location", `${c.req.path}/${outcome.row.id}`);
    return c.json(view, 201);
  });

  app.openapi(currentRoute, async (c) => {
    const actor = actorOn(c);
    const subject = c.req.valid("query").subject ?? actor.id;
    const resolved = resolveAccess(actor, subject, "summary");
    if (resolved === null) return problem(c, 404, "not_found");
    const found = await withActor(
      actor.id,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(schema.pregnancies)
          .where(
            and(eq(schema.pregnancies.subjectId, subject), isNull(schema.pregnancies.deletedAt)),
          )
          .orderBy(sql`${schema.pregnancies.startedAt} desc`, sql`${schema.pregnancies.id} desc`)
          .limit(1);
        if (row === undefined) return null;
        const zone = await subjectTimeZone(tx, subject);
        await auditRead(tx, actor, resolved, subject, auditDay(zone));
        return { row, today: c.var.clock.today(zone) };
      },
      db,
    );
    if (found === null) return problem(c, 404, "not_found");
    const view = serializePregnancy(found.row, resolved.access, found.today);
    if (view === null) return problem(c, 404, "not_found");
    return c.json(view, 200);
  });

  // Registered after /current, so that static path is matched first.
  app.openapi(pregnancyRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const found = await withActor(
      actor.id,
      async (tx) => {
        const row = await loadPregnancy(tx, id);
        if (row === null) return null;
        const resolved = resolveAccess(actor, row.subjectId, "summary");
        if (resolved === null) return null;
        const zone = await subjectTimeZone(tx, row.subjectId);
        await auditRead(tx, actor, resolved, row.subjectId, auditDay(zone));
        return { row, resolved, today: c.var.clock.today(zone) };
      },
      db,
    );
    if (found === null) return problem(c, 404, "not_found");
    const view = serializePregnancy(found.row, found.resolved.access, found.today);
    if (view === null) return problem(c, 404, "not_found");
    return c.json(view, 200);
  });

  app.openapi(datingRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const expected = Number(c.req.valid("header")["if-match"]);
    const body = c.req.valid("json");
    const next = dueDateFor(body);
    if (next === null) {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: dateFieldOf(body), message: "Not a calendar day." }],
      });
    }
    const now = new Date();
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const row = await loadPregnancy(tx, id);
        if (row === null) return { status: 404 as const };
        const resolved = resolveAccess(actor, row.subjectId, "write");
        if (resolved === null) return { status: 404 as const };
        if (row.version !== expected) return { status: 409 as const, detail: STALE_VERSION };
        if (row.endedAt !== null) return { status: 409 as const, detail: closedFor(resolved) };
        const today = c.var.clock.today(await subjectTimeZone(tx, row.subjectId), now);
        // ACOG CO 700 (architecture 8.4): a scan replaces a due date set from the
        // last period only past the discrepancy band for the age it measured;
        // inside the band the date stands and nothing changes. A due date given
        // as is ("manual") is her or her clinician's call and is never second-guessed.
        if (body.method === "ultrasound" && row.datingMethod === "lmp") {
          const verdict = shouldRedate(row.dueDate, body.scanDate, body.weeks * 7 + body.days);
          if (!verdict.redate) return { status: 200 as const, row, resolved, today };
        }
        const record = toRecord(row);
        const changed = changeDueDate(record, {
          next,
          method: body.method,
          changedAt: now.toISOString(),
        });
        if (changed === record) return { status: 200 as const, row, resolved, today };
        // The history holds changes of the date (its CHECK refuses previous = next);
        // the same date confirmed by another method only updates the method.
        if (changed.dueDate !== row.dueDate) {
          await tx.insert(schema.dueDateChanges).values({
            id: uuidv7(),
            pregnancyId: row.id,
            subjectId: row.subjectId,
            previousDueDate: row.dueDate,
            nextDueDate: changed.dueDate,
            method: changed.datingMethod,
            changedAt: now,
          });
        }
        const [updated] = await tx
          .update(schema.pregnancies)
          .set({
            dueDate: changed.dueDate,
            datingMethod: changed.datingMethod,
            updatedAt: now,
            version: sql`${schema.pregnancies.version} + 1`,
          })
          .where(and(eq(schema.pregnancies.id, row.id), eq(schema.pregnancies.version, expected)))
          .returning();
        if (updated === undefined) return { status: 409 as const, detail: STALE_VERSION };
        await auditWrite(tx, actor, resolved, row.subjectId);
        return { status: 200 as const, row: updated, resolved, today };
      },
      db,
    );
    if (outcome.status === 404) return problem(c, 404, "not_found");
    if (outcome.status === 409) return problem(c, 409, "conflict", { detail: outcome.detail });
    const view = serializePregnancy(outcome.row, outcome.resolved.access, outcome.today);
    if (view === null) return problem(c, 404, "not_found");
    return c.json(view, 200);
  });

  app.openapi(datingHistoryRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const { cursor, limit } = c.req.valid("query");
    const after = cursor === undefined ? null : decodeCursor(cursor, 2);
    if (cursor !== undefined && after === null) return badCursor(c);
    const page = await withActor(
      actor.id,
      async (tx) => {
        const row = await loadPregnancy(tx, id);
        if (row === null) return null;
        // The history is filed under "owner" in the storage map: hers alone.
        if (ownerOnly(resolveAccess(actor, row.subjectId, "read")) === null) return null;
        const afterInstant = after === null ? null : new Date(after[0] ?? "");
        if (afterInstant !== null && Number.isNaN(afterInstant.getTime())) return "cursor";
        const changes = await tx
          .select()
          .from(schema.dueDateChanges)
          .where(
            and(
              eq(schema.dueDateChanges.pregnancyId, row.id),
              afterInstant === null
                ? undefined
                : or(
                    gt(schema.dueDateChanges.changedAt, afterInstant),
                    and(
                      eq(schema.dueDateChanges.changedAt, afterInstant),
                      gt(schema.dueDateChanges.id, after?.[1] ?? ""),
                    ),
                  ),
            ),
          )
          .orderBy(asc(schema.dueDateChanges.changedAt), asc(schema.dueDateChanges.id))
          .limit(limit + 1);
        return changes;
      },
      db,
    );
    if (page === null) return problem(c, 404, "not_found");
    if (page === "cursor") return badCursor(c);
    const items = page.slice(0, limit).map((change) => ({
      id: change.id,
      previousDueDate: change.previousDueDate,
      nextDueDate: change.nextDueDate,
      method: change.method,
      changedAt: change.changedAt.toISOString(),
    }));
    const last = items[items.length - 1];
    const nextCursor =
      page.length > limit && last !== undefined ? encodeCursor([last.changedAt, last.id]) : null;
    return c.json({ items, nextCursor }, 200);
  });

  app.openapi(createEventRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    // The schema checks the shape; a day such as 2026-02-30 is refused here, not by Postgres.
    if (!isCalendarDate(body.date)) return notADay(c, "date");
    const eventId = body.id ?? uuidv7();
    const now = new Date();
    const cache = createKeyCache();
    let outcome:
      { status: 404 } | { status: 409; detail: string } | { status: 201; event: PregnancyEvent };
    try {
      outcome = await withActor(
        actor.id,
        async (tx) => {
          const row = await loadPregnancy(tx, id);
          if (row === null) return { status: 404 as const };
          const resolved = resolveAccess(actor, row.subjectId, "write");
          if (resolved === null) return { status: 404 as const };
          // A grantee's view of an ended pregnancy is paused; only she adds to it afterwards.
          if (row.endedAt !== null && resolved.decision.reason !== "owner") {
            return { status: 409 as const, detail: PREGNANCY_PAUSED };
          }
          const sealed =
            body.detail === undefined
              ? null
              : await sealDetail(tx, cache, keys, row.subjectId, eventId, body.detail);
          const [inserted] = await tx
            .insert(schema.pregnancyEvents)
            .values({
              id: eventId,
              pregnancyId: row.id,
              subjectId: row.subjectId,
              authorId: actor.id,
              kind: body.kind,
              date: body.date,
              label: sealed?.label ?? null,
              kekVersion: sealed?.kekVersion ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (inserted === undefined) throw new Error("the event insert returned no row");
          await auditWrite(tx, actor, resolved, row.subjectId);
          const event = serializeEvent(inserted, resolved, body.detail ?? null);
          if (event === null) return { status: 404 as const };
          return { status: 201 as const, event };
        },
        db,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      outcome = { status: 409, detail: ID_IN_USE };
    } finally {
      cache.clear();
    }
    if (outcome.status === 404) return problem(c, 404, "not_found");
    if (outcome.status === 409) return problem(c, 409, "conflict", { detail: outcome.detail });
    c.header("Location", `${c.req.path}/${outcome.event.id}`);
    return c.json(outcome.event, 201);
  });

  app.openapi(listEventsRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const { from, to, updatedSince, cursor, limit } = c.req.valid("query");
    if (from !== undefined && !isCalendarDate(from)) return notADay(c, "from");
    if (to !== undefined && !isCalendarDate(to)) return notADay(c, "to");
    const after = cursor === undefined ? null : decodeCursor(cursor, 2);
    if (cursor !== undefined && after === null) return badCursor(c);
    const since = updatedSince === undefined ? null : new Date(updatedSince);
    const cache = createKeyCache();
    let page:
      | null
      | { items: (PregnancyEvent | PregnancyEventTombstone)[]; nextCursor: string | null }
      | { empty: true };
    try {
      page = await withActor(
        actor.id,
        async (tx) => {
          const row = await loadPregnancy(tx, id);
          if (row === null) return null;
          const resolved = resolveAccess(actor, row.subjectId, "summary");
          if (resolved === null) return null;
          const day = auditDay(await subjectTimeZone(tx, row.subjectId));
          await auditRead(tx, actor, resolved, row.subjectId, day);
          // Paused for a grantee: no dates of any kind (architecture 8.4).
          if (row.endedAt !== null && resolved.decision.reason !== "owner") return { empty: true };
          const rows = await tx
            .select()
            .from(schema.pregnancyEvents)
            .where(
              and(
                eq(schema.pregnancyEvents.pregnancyId, row.id),
                since === null
                  ? isNull(schema.pregnancyEvents.deletedAt)
                  : gt(schema.pregnancyEvents.updatedAt, since),
                from === undefined ? undefined : gte(schema.pregnancyEvents.date, from),
                to === undefined ? undefined : lte(schema.pregnancyEvents.date, to),
                after === null
                  ? undefined
                  : or(
                      gt(schema.pregnancyEvents.date, after[0] ?? ""),
                      and(
                        eq(schema.pregnancyEvents.date, after[0] ?? ""),
                        gt(schema.pregnancyEvents.id, after[1] ?? ""),
                      ),
                    ),
              ),
            )
            .orderBy(asc(schema.pregnancyEvents.date), asc(schema.pregnancyEvents.id))
            .limit(limit + 1);
          const items: (PregnancyEvent | PregnancyEventTombstone)[] = [];
          for (const event of rows.slice(0, limit)) {
            if (event.deletedAt !== null) {
              items.push(serializeTombstone(event, event.deletedAt));
              continue;
            }
            const detail =
              resolved.level === "summary"
                ? null
                : await openDetail(tx, cache, keys, event.subjectId, event.id, event.label);
            const serialized = serializeEvent(event, resolved, detail);
            if (serialized !== null) items.push(serialized);
          }
          const last = rows[Math.min(rows.length, limit) - 1];
          const nextCursor =
            rows.length > limit && last !== undefined ? encodeCursor([last.date, last.id]) : null;
          return { items, nextCursor };
        },
        db,
      );
    } finally {
      cache.clear();
    }
    if (page === null) return problem(c, 404, "not_found");
    if ("empty" in page) return c.json({ items: [], nextCursor: null }, 200);
    return c.json(page, 200);
  });

  app.openapi(eventRoute, async (c) => {
    const actor = actorOn(c);
    const { id, eventId } = c.req.valid("param");
    const cache = createKeyCache();
    let event: PregnancyEvent | null;
    try {
      event = await withActor(
        actor.id,
        async (tx) => {
          const row = await loadPregnancy(tx, id);
          if (row === null) return null;
          const resolved = resolveAccess(actor, row.subjectId, "summary");
          if (resolved === null) return null;
          const day = auditDay(await subjectTimeZone(tx, row.subjectId));
          await auditRead(tx, actor, resolved, row.subjectId, day);
          // Paused for a grantee: no dates of any kind (architecture 8.4), as in the list.
          if (row.endedAt !== null && resolved.decision.reason !== "owner") return null;
          const found = await loadEvent(tx, row.id, eventId);
          if (found === null) return null;
          const detail =
            resolved.level === "summary"
              ? null
              : await openDetail(tx, cache, keys, found.subjectId, found.id, found.label);
          return serializeEvent(found, resolved, detail);
        },
        db,
      );
    } finally {
      cache.clear();
    }
    if (event === null) return problem(c, 404, "not_found");
    return c.json(event, 200);
  });

  app.openapi(updateEventRoute, async (c) => {
    const actor = actorOn(c);
    const { id, eventId } = c.req.valid("param");
    const expected = Number(c.req.valid("header")["if-match"]);
    const body = c.req.valid("json");
    if (!isCalendarDate(body.date)) return notADay(c, "date");
    const now = new Date();
    const cache = createKeyCache();
    let outcome:
      { status: 404 } | { status: 409; detail: string } | { status: 200; event: PregnancyEvent };
    try {
      outcome = await withActor(
        actor.id,
        async (tx) => {
          const row = await loadPregnancy(tx, id);
          if (row === null) return { status: 404 as const };
          const resolved = resolveAccess(actor, row.subjectId, "write");
          if (resolved === null) return { status: 404 as const };
          const event = await loadEvent(tx, row.id, eventId);
          if (event === null) return { status: 404 as const };
          if (event.version !== expected) return { status: 409 as const, detail: STALE_VERSION };
          if (row.endedAt !== null && resolved.decision.reason !== "owner") {
            return { status: 409 as const, detail: PREGNANCY_PAUSED };
          }
          const sealed =
            body.detail === undefined
              ? null
              : await sealDetail(tx, cache, keys, row.subjectId, event.id, body.detail);
          const [updated] = await tx
            .update(schema.pregnancyEvents)
            .set({
              kind: body.kind,
              date: body.date,
              label: sealed?.label ?? null,
              kekVersion: sealed?.kekVersion ?? null,
              updatedAt: now,
              version: sql`${schema.pregnancyEvents.version} + 1`,
            })
            .where(
              and(
                eq(schema.pregnancyEvents.id, event.id),
                eq(schema.pregnancyEvents.version, expected),
              ),
            )
            .returning();
          if (updated === undefined) return { status: 409 as const, detail: STALE_VERSION };
          await auditWrite(tx, actor, resolved, row.subjectId);
          const serialized = serializeEvent(updated, resolved, body.detail ?? null);
          if (serialized === null) return { status: 404 as const };
          return { status: 200 as const, event: serialized };
        },
        db,
      );
    } finally {
      cache.clear();
    }
    if (outcome.status === 404) return problem(c, 404, "not_found");
    if (outcome.status === 409) return problem(c, 409, "conflict", { detail: outcome.detail });
    return c.json(outcome.event, 200);
  });

  app.openapi(deleteEventRoute, async (c) => {
    const actor = actorOn(c);
    const { id, eventId } = c.req.valid("param");
    const expected = Number(c.req.valid("header")["if-match"]);
    const now = new Date();
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const row = await loadPregnancy(tx, id);
        if (row === null) return 404 as const;
        // Deletion is the subject's alone: can() has no grant level for it.
        if (resolveAccess(actor, row.subjectId, "delete") === null) return 404 as const;
        const event = await loadEvent(tx, row.id, eventId);
        if (event === null) return 404 as const;
        if (event.version !== expected) return 409 as const;
        // A content-free tombstone (architecture 7.3): the sealed detail goes with the row.
        const [updated] = await tx
          .update(schema.pregnancyEvents)
          .set({
            label: null,
            kekVersion: null,
            deletedAt: now,
            updatedAt: now,
            version: sql`${schema.pregnancyEvents.version} + 1`,
          })
          .where(
            and(
              eq(schema.pregnancyEvents.id, event.id),
              eq(schema.pregnancyEvents.version, expected),
            ),
          )
          .returning({ id: schema.pregnancyEvents.id });
        return updated === undefined ? (409 as const) : (204 as const);
      },
      db,
    );
    if (outcome === 404) return problem(c, 404, "not_found");
    if (outcome === 409) return stale(c);
    return c.body(null, 204);
  });

  app.openapi(endRoute, async (c) => {
    const actor = actorOn(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    // A day that is not on the calendar is named as such, as the event routes do,
    // so the "early" refusal below only ever means a day before day 0.
    if (!isCalendarDate(body.endedAt)) return notADay(c, "endedAt");
    const now = new Date();
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const row = await loadPregnancy(tx, id);
        if (row === null) return { status: 404 as const };
        // The reason is hers alone (the storage map files it under "owner"), so only she writes it.
        const resolved = ownerOnly(resolveAccess(actor, row.subjectId, "write"));
        if (resolved === null) return { status: 404 as const };
        if (row.endedAt !== null) return { status: 409 as const };
        let result: ReturnType<typeof endPregnancy>;
        try {
          result = endPregnancy(toRecord(row), { endedAt: body.endedAt, reason: body.reason });
        } catch (error) {
          if (error instanceof RangeError)
            return { status: 422 as const, refused: "early" as const };
          throw error;
        }
        // An ending is something that has happened: a day after today in her
        // zone, on the calendar clock, is refused before anything is written.
        const today = c.var.clock.today(await subjectTimeZone(tx, row.subjectId), now);
        if (compareDates(body.endedAt, today) > 0) {
          return { status: 422 as const, refused: "future" as const };
        }
        const [updated] = await tx
          .update(schema.pregnancies)
          .set({
            endedAt: result.pregnancy.endedAt,
            endedReason: result.pregnancy.endedReason,
            updatedAt: now,
            version: sql`${schema.pregnancies.version} + 1`,
          })
          .where(and(eq(schema.pregnancies.id, row.id), isNull(schema.pregnancies.endedAt)))
          .returning();
        if (updated === undefined) return { status: 409 as const };
        await tx
          .update(schema.profiles)
          .set({
            stage: result.effects.stage,
            updatedAt: now,
            version: sql`${schema.profiles.version} + 1`,
          })
          .where(eq(schema.profiles.userId, actor.id));
        if (result.effects.clearPredictions) {
          await tx
            .delete(schema.cyclePredictions)
            .where(eq(schema.cyclePredictions.subjectId, row.subjectId));
        }
        if (result.effects.cancelReminders) {
          await tx
            .delete(schema.jobs)
            .where(
              and(
                eq(schema.jobs.type, REMINDER_JOB_TYPE),
                eq(schema.jobs.status, "queued"),
                sql`${schema.jobs.payloadJson} ->> ${REMINDER_PAYLOAD_KEY} = ${row.id}`,
              ),
            );
        }
        return { status: 200 as const, row: updated, resolved, today };
      },
      db,
    );
    if (outcome.status === 404) return problem(c, 404, "not_found");
    if (outcome.status === 409) return ended(c);
    if (outcome.status === 422) {
      const message =
        outcome.refused === "future"
          ? "Not a day that has happened yet."
          : "Not a day after the pregnancy began.";
      return problem(c, 422, "validation_failed", { errors: [{ path: "endedAt", message }] });
    }
    const view = serializePregnancy(outcome.row, outcome.resolved.access, outcome.today);
    if (view === null || view.status !== "ended") return problem(c, 404, "not_found");
    return c.json(view, 200);
  });
}
