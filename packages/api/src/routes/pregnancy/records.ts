import { and, eq, isNull } from "drizzle-orm";
import {
  can,
  categoriesFor,
  dueDateFromLmp,
  dueDateFromTransfer,
  dueDateFromUltrasound,
  gestationalAge,
  isCalendarDate,
  projectPregnancy,
  projectRow,
} from "@tidefern/core";
import type { Access, Action, Decision, Level, Pregnancy as PregnancyRecord } from "@tidefern/core";
import { decryptFieldFor, encryptFieldFor, unwrapForSubject } from "@tidefern/crypto";
import type { KeyCache, KeyProvider } from "@tidefern/crypto";
import { schema } from "@tidefern/db";
import type { Transaction } from "@tidefern/db";
import type {
  Pregnancy,
  PregnancyDatingInput,
  PregnancyEvent,
  PregnancyEventTombstone,
  PregnancyView,
} from "@tidefern/schemas";

import type { RequestActor } from "../../actor";

/**
 * The pregnancy area's reads and projections: how a row becomes the core
 * record the domain functions take, how the storage map of architecture
 * 8.2 and the paused rule of 8.4 project it for a grantee, and how an
 * event's detail is sealed and opened under the subject's key. Nothing
 * here decides access on its own; `resolveAccess` asks `can()`.
 */

export const CATEGORY = "pregnancy.overview" as const;

export type PregnancyRow = typeof schema.pregnancies.$inferSelect;
export type EventRow = typeof schema.pregnancyEvents.$inferSelect;

/** What the actor holds on the row's subject: the decision for the action and the overview level. */
export interface PregnancyAccess {
  decision: Decision;
  access: Access;
  level: Level;
}

/**
 * The one access decision per request (architecture 8.3 step 3): `can()`
 * for the action, then the categories and levels the actor holds on the
 * subject for the serializer. Null is the 404 answer, whatever the reason.
 */
export function resolveAccess(
  actor: RequestActor,
  subjectId: string,
  action: Action,
): PregnancyAccess | null {
  const decision = can(actor, action, { subjectId, category: CATEGORY });
  if (!decision.allowed) return null;
  const access = categoriesFor(actor, subjectId);
  const level = access?.levels[CATEGORY];
  if (access === null || level === undefined) return null;
  return { decision, access, level };
}

/** A column that only the owner's path of `can()` may write (the storage map files it under "owner"). */
export function ownerOnly(resolved: PregnancyAccess | null): PregnancyAccess | null {
  return resolved !== null && resolved.decision.reason === "owner" ? resolved : null;
}

/** The due date the dating input yields, computed through core; null when a date is not a real day. */
export function dueDateFor(input: PregnancyDatingInput): string | null {
  switch (input.method) {
    case "lmp":
      return isCalendarDate(input.lastPeriodStart) ? dueDateFromLmp(input.lastPeriodStart) : null;
    case "ultrasound":
      return isCalendarDate(input.scanDate)
        ? dueDateFromUltrasound(input.scanDate, input.weeks * 7 + input.days)
        : null;
    case "transfer":
      return isCalendarDate(input.transferDate)
        ? dueDateFromTransfer(input.transferDate, input.embryoAgeDays)
        : null;
    case "manual":
      return isCalendarDate(input.dueDate) ? input.dueDate : null;
  }
}

/** The field of the dating input that carries its calendar date, for a 422. */
export function dateFieldOf(input: PregnancyDatingInput): string {
  switch (input.method) {
    case "lmp":
      return "lastPeriodStart";
    case "ultrasound":
      return "scanDate";
    case "transfer":
      return "transferDate";
    case "manual":
      return "dueDate";
  }
}

export async function loadPregnancy(tx: Transaction, id: string): Promise<PregnancyRow | null> {
  const [row] = await tx
    .select()
    .from(schema.pregnancies)
    .where(and(eq(schema.pregnancies.id, id), isNull(schema.pregnancies.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function loadEvent(
  tx: Transaction,
  pregnancyId: string,
  eventId: string,
): Promise<EventRow | null> {
  const [row] = await tx
    .select()
    .from(schema.pregnancyEvents)
    .where(
      and(
        eq(schema.pregnancyEvents.id, eventId),
        eq(schema.pregnancyEvents.pregnancyId, pregnancyId),
        isNull(schema.pregnancyEvents.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The subject's IANA zone, in which "today" is read (architecture 7.3).
 * A related reader may see the profile row under B8's policy; a subject
 * without a profile yet is read in UTC.
 */
export async function subjectTimeZone(tx: Transaction, subjectId: string): Promise<string> {
  const [row] = await tx
    .select({ timeZone: schema.profiles.timeZone })
    .from(schema.profiles)
    .where(and(eq(schema.profiles.userId, subjectId), isNull(schema.profiles.deletedAt)))
    .limit(1);
  return row?.timeZone ?? "UTC";
}

/** The core record for a row; the history is loaded by its own route, so the list here is empty. */
export function toRecord(row: PregnancyRow): PregnancyRecord {
  return {
    id: row.id,
    subjectId: row.subjectId,
    dueDate: row.dueDate,
    datingMethod: row.datingMethod,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt,
    endedReason: row.endedReason,
    dueDateChanges: [],
  };
}

/** The row under the storage map's column names, so `projectRow` sees the names 8.2 files. */
function storageColumns(row: PregnancyRow) {
  return {
    id: row.id,
    subject_id: row.subjectId,
    due_date: row.dueDate,
    dating_method: row.datingMethod,
    started_at: row.startedAt,
    ended_at: row.endedAt,
    ended_reason: row.endedReason,
    version: row.version,
  };
}

/** Her whole record, for the routes only she reaches (start and end). */
export function ownerView(row: PregnancyRow, today: string): Pregnancy {
  const record = toRecord(row);
  const view = projectPregnancy(record, "owner");
  return {
    id: row.id,
    subjectId: row.subjectId,
    status: view.status,
    dueDate: row.dueDate,
    datingMethod: row.datingMethod,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt,
    endedReason: row.endedReason,
    gestation: view.status === "active" ? gestationalAge(row.dueDate, today) : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The pregnancy for the actor's access: her whole record, or for a grantee
 * the columns the storage map files under `pregnancy.overview` (never the
 * reason) narrowed by core's partner projection, which freezes an ended
 * pregnancy to the paused state with no dates (architecture 8.4).
 */
export function serializePregnancy(
  row: PregnancyRow,
  access: Access,
  today: string,
): PregnancyView | null {
  if (access.reason === "owner") return ownerView(row, today);
  const columns = projectRow("pregnancies", storageColumns(row), access);
  if (columns.due_date === undefined || columns.version === undefined) return null;
  const partner = projectPregnancy(toRecord(row), "partner");
  if (partner.status === "paused") return { status: "paused" };
  return {
    status: "active",
    id: partner.id,
    subjectId: row.subjectId,
    dueDate: partner.dueDate,
    gestation: gestationalAge(partner.dueDate, today),
    version: columns.version,
  };
}

function eventColumns(row: EventRow) {
  return {
    id: row.id,
    pregnancy_id: row.pregnancyId,
    subject_id: row.subjectId,
    author_id: row.authorId,
    kind: row.kind,
    date: row.date,
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/**
 * An event for the actor's access and level. The storage map files every
 * column under `pregnancy.overview`; the level then decides how much of it
 * the card shows: a summary grantee sees the kind and the day, a reader
 * also the author and the decrypted detail.
 */
export function serializeEvent(
  row: EventRow,
  resolved: PregnancyAccess,
  detail: string | null,
): PregnancyEvent | null {
  const columns = projectRow("pregnancy_events", eventColumns(row), resolved.access);
  if (
    columns.id === undefined ||
    columns.pregnancy_id === undefined ||
    columns.subject_id === undefined ||
    columns.kind === undefined ||
    columns.date === undefined ||
    columns.version === undefined ||
    columns.created_at === undefined ||
    columns.updated_at === undefined
  ) {
    return null;
  }
  const base: PregnancyEvent = {
    id: columns.id,
    pregnancyId: columns.pregnancy_id,
    subjectId: columns.subject_id,
    kind: columns.kind,
    date: columns.date,
    version: columns.version,
    createdAt: columns.created_at.toISOString(),
    updatedAt: columns.updated_at.toISOString(),
  };
  if (resolved.level === "summary") return base;
  return { ...base, authorId: columns.author_id ?? null, detail };
}

export function serializeTombstone(row: EventRow, deletedAt: Date): PregnancyEventTombstone {
  return {
    id: row.id,
    pregnancyId: row.pregnancyId,
    subjectId: row.subjectId,
    deletedAt: deletedAt.toISOString(),
    version: row.version,
  };
}

/** The AAD binding of an event's detail: the table, the column and the row (architecture 9.2). */
function detailLocation(subjectId: string, rowId: string) {
  return { subjectId, table: "pregnancy_events", column: "label", rowId };
}

/** Seals the detail under the subject's key; the key is unwrapped once per request through the cache. */
export async function sealDetail(
  tx: Transaction,
  cache: KeyCache,
  keys: KeyProvider,
  subjectId: string,
  rowId: string,
  detail: string,
): Promise<{ label: Uint8Array; kekVersion: string }> {
  await unwrapForSubject(tx, subjectId, keys, cache);
  return {
    label: encryptFieldFor(cache, detailLocation(subjectId, rowId), detail),
    // A successful unwrap proves the row was wrapped under this provider's version.
    kekVersion: keys.version,
  };
}

/** Opens a sealed detail, or answers null for an event without one. */
export async function openDetail(
  tx: Transaction,
  cache: KeyCache,
  keys: KeyProvider,
  subjectId: string,
  rowId: string,
  label: Uint8Array | null,
): Promise<string | null> {
  if (label === null) return null;
  await unwrapForSubject(tx, subjectId, keys, cache);
  return decryptFieldFor(cache, detailLocation(subjectId, rowId), label);
}

/** Opaque list cursors: base64url of the ordering columns of the last item. */
export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string, length: number): string[] | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== length) return null;
    return parsed.every((part) => typeof part === "string") ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}
