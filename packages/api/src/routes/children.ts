import { createHash } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, TypedResponse } from "hono";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  gte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  CDC_MILESTONES_ATTRIBUTION,
  NOT_A_SCREENING_TOOL,
  checklistFor,
  diffDays,
  growthAssessment,
  listScope,
  milestoneChecklists,
  milestoneFraming,
  projectRow,
} from "@tidefern/core";
import type { Action, MilestoneItem, Scope } from "@tidefern/core";
import {
  EnvKeyProvider,
  createKeyCache,
  decryptFieldFor,
  encryptFieldFor,
  provisionChildKey,
  unwrapForSubject,
} from "@tidefern/crypto";
import type { KeyCache, KeyProvider } from "@tidefern/crypto";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";
import {
  CHILD_CONSENT_DISCLOSURES,
  Child,
  ChildEvent,
  ChildEventInput,
  ChildEventListQuery,
  ChildEventTombstone,
  ChildEventUpdate,
  ChildInput,
  ChildMeasurement,
  ChildMeasurementInput,
  ChildUpdate,
  DatedListQuery,
  Guardian,
  GuardianInput,
  Id,
  ListQuery,
  MilestoneCheck,
  MilestoneCheckInput,
  MilestoneChecklist,
  Problem,
  RealCalendarDate,
} from "@tidefern/schemas";
import type {
  ChildConsentTextVersion,
  GrowthIndicator as PlacedIndicator,
  GrowthPlacement,
} from "@tidefern/schemas";

import type { RequestActor } from "../actor";
import { requireActor, requireFreshAuth } from "../auth";
import type { ApiEnv } from "../context";
import { audit, auditActions, auditDay } from "../middleware/index";
import { problem as sharedProblem } from "../problem";
import type { ProblemCode } from "../problem";

/**
 * The children area (architecture record 8.2 and 8.4): a child is the
 * subject of every row about it, guardians hold full rights, and anyone else
 * reaches a child only through a `child` grant for that child. Every access
 * decision is core's: `listScope()` enumerates what `can()` allows for the
 * action and the route keeps the scope whose `childId` is the one addressed.
 * Row level security (B8) applies the same rule underneath in `withActor()`.
 */

export interface ChildrenOptions {
  /**
   * The database `withActor()` opens the actor's transaction on. The host's
   * pooled client is the default; the test harness passes PGlite.
   */
  db?: ActorDatabase | undefined;
  /**
   * Wraps and unwraps the children's data keys. `EnvKeyProvider` over
   * `TIDEFERN_KEK_V1` (read on first use) unless a test passes its own.
   */
  keys?: KeyProvider | undefined;
}

/**
 * The registry calls `registerChildren(app)` with nothing else, and the
 * request context carries no database, so this area keeps its runtime here.
 * Production needs no call: `withActor()` defaults to the pooled client and
 * the key provider reads the environment. The test harness calls
 * `configureChildren()` before its first request. The day the host puts the
 * database and the key provider on the context, this seam goes.
 */
const runtime: ChildrenOptions = {};

export function configureChildren(options: ChildrenOptions): void {
  runtime.db = options.db;
  runtime.keys = options.keys;
}

function keys(): KeyProvider {
  runtime.keys ??= new EnvKeyProvider();
  return runtime.keys;
}

type ProblemStatus = Parameters<typeof sharedProblem>[1];
type ProblemBody =
  ReturnType<typeof sharedProblem> extends TypedResponse<infer Body> ? Body : never;

/**
 * The shared `problem()` answers with the union of every status it accepts,
 * and a typed `app.openapi` handler only accepts the statuses its route
 * declares. This wrapper narrows the type to the literal status passed; the
 * response itself is the shared one, unchanged.
 */
function problem<Status extends ProblemStatus>(
  c: Context,
  status: Status,
  code: ProblemCode,
  extra?: Parameters<typeof sharedProblem>[3],
): Response & TypedResponse<ProblemBody, Status, "json"> {
  return sharedProblem(c, status, code, extra) as Response &
    TypedResponse<ProblemBody, Status, "json">;
}

/** The `detail` values of the 409 problems this area answers. */
export const STALE_VERSION = "stale_version";
export const LAST_GUARDIAN = "last_guardian";
export const ALREADY_GUARDIAN = "already_guardian";
export const ID_IN_USE = "id_in_use";

const EVENTS_TABLE = "child_events";
const NOTE_COLUMN = "note";

const problemContent = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

const NOT_FOUND = problemContent("No such child, or no access to it");
const UNAUTHENTICATED = problemContent("No session");
const UNAUTHENTICATED_OR_STALE = problemContent(
  "No session, or a session older than the fresh-authentication window (detail `fresh_authentication_required`)",
);
const INVALID = problemContent("Validation failed");
const CONFLICT = problemContent("Conflict");

const ChildParams = z.object({ id: Id });
const EventParams = z.object({ id: Id, eventId: Id });
const GuardianParams = z.object({ id: Id, userId: Id });
const IfMatch = z.object({
  "if-match": z.string().optional().describe("The version last seen; 409 when it moved on"),
});
const MilestonesQuery = z.object({
  age: z.coerce
    .number()
    .int()
    .min(2)
    .max(60)
    .optional()
    .describe("A checklist age in months; the child's age today when absent"),
});

const jsonBody = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
  required: true,
});

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const ChildList = z
  .object({ items: z.array(Child), nextCursor: z.string().nullable() })
  .openapi("ChildList");
const ChildEventList = z
  .object({
    items: z.array(z.union([ChildEvent, ChildEventTombstone])),
    nextCursor: z.string().nullable(),
  })
  .openapi("ChildEventList");
const ChildMeasurementList = z
  .object({ items: z.array(ChildMeasurement), nextCursor: z.string().nullable() })
  .openapi("ChildMeasurementList");

const TAG = ["children"];

export const createChildRoute = createRoute({
  method: "post",
  path: "/v1/children",
  tags: TAG,
  summary: "Create a child",
  description:
    "Creates the child in the actor's household (a household is opened when she has none), makes her its first guardian, records her consent on the child's behalf (a consents row with the child as subject and her as the consenting guardian, its purpose and text version from the catalog) and provisions the child's data key, all in one transaction. A body without the consent is refused with 422 and writes nothing.",
  middleware: [requireActor] as const,
  request: { body: jsonBody(ChildInput, "The child, with the guardian's consent") },
  responses: {
    201: jsonResponse(Child, "The child as its guardian sees it"),
    401: UNAUTHENTICATED,
    409: CONFLICT,
    422: INVALID,
  },
});

export const listChildrenRoute = createRoute({
  method: "get",
  path: "/v1/children",
  tags: TAG,
  summary: "The children the actor can reach",
  description: "Guarded children with their guardians, and children reached through a child grant.",
  middleware: [requireActor] as const,
  request: { query: ListQuery },
  responses: { 200: jsonResponse(ChildList, "The children"), 401: UNAUTHENTICATED, 422: INVALID },
});

export const getChildRoute = createRoute({
  method: "get",
  path: "/v1/children/{id}",
  tags: TAG,
  summary: "One child",
  middleware: [requireActor] as const,
  request: { params: ChildParams },
  responses: { 200: jsonResponse(Child, "The child"), 401: UNAUTHENTICATED, 404: NOT_FOUND },
});

export const updateChildRoute = createRoute({
  method: "put",
  path: "/v1/children/{id}",
  tags: TAG,
  summary: "Update a child",
  middleware: [requireActor] as const,
  request: { params: ChildParams, headers: IfMatch, body: jsonBody(ChildUpdate, "The facts") },
  responses: {
    200: jsonResponse(Child, "The child"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    409: CONFLICT,
    422: INVALID,
  },
});

export const addGuardianRoute = createRoute({
  method: "post",
  path: "/v1/children/{id}/guardians",
  tags: TAG,
  summary: "Add a guardian",
  description: "A guardian adds an active member of the child's household as a co-guardian.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: { params: ChildParams, body: jsonBody(GuardianInput, "The member") },
  responses: {
    201: jsonResponse(Guardian, "The guardianship"),
    401: UNAUTHENTICATED_OR_STALE,
    404: NOT_FOUND,
    409: CONFLICT,
    422: INVALID,
  },
});

export const removeGuardianRoute = createRoute({
  method: "delete",
  path: "/v1/children/{id}/guardians/{userId}",
  tags: TAG,
  summary: "End a guardianship",
  description: "A guardian leaves, or ends a co-guardianship; the last guardian cannot leave.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: { params: GuardianParams },
  responses: {
    204: { description: "Ended" },
    401: UNAUTHENTICATED_OR_STALE,
    404: NOT_FOUND,
    409: CONFLICT,
  },
});

export const createEventRoute = createRoute({
  method: "post",
  path: "/v1/children/{id}/events",
  tags: TAG,
  summary: "Log an event",
  description:
    "A feed, a sleep, a diaper or a milestone; the note is encrypted with the child's key.",
  middleware: [requireActor] as const,
  request: { params: ChildParams, body: jsonBody(ChildEventInput, "The event") },
  responses: {
    201: jsonResponse(ChildEvent, "The event"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    409: CONFLICT,
    422: INVALID,
  },
});

export const listEventsRoute = createRoute({
  method: "get",
  path: "/v1/children/{id}/events",
  tags: TAG,
  summary: "Events by date",
  description:
    "Oldest first by day and id, or with `order=desc` newest first by day and then by when each event happened (its start, or when it was logged), so `kind=feed&order=desc&limit=1` is the last feed; `updatedSince` returns every row changed since, deleted ones as tombstones.",
  middleware: [requireActor] as const,
  request: { params: ChildParams, query: ChildEventListQuery },
  responses: {
    200: jsonResponse(ChildEventList, "The events"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    422: INVALID,
  },
});

export const updateEventRoute = createRoute({
  method: "put",
  path: "/v1/children/{id}/events/{eventId}",
  tags: TAG,
  summary: "Replace an event",
  middleware: [requireActor] as const,
  request: { params: EventParams, headers: IfMatch, body: jsonBody(ChildEventUpdate, "The event") },
  responses: {
    200: jsonResponse(ChildEvent, "The event"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    409: CONFLICT,
    422: INVALID,
  },
});

export const deleteEventRoute = createRoute({
  method: "delete",
  path: "/v1/children/{id}/events/{eventId}",
  tags: TAG,
  summary: "Delete an event",
  description: "Leaves a tombstone, content free in every response, for offline clients to sync.",
  middleware: [requireActor] as const,
  request: { params: EventParams },
  responses: { 204: { description: "Deleted" }, 401: UNAUTHENTICATED, 404: NOT_FOUND },
});

export const createMeasurementRoute = createRoute({
  method: "post",
  path: "/v1/children/{id}/measurements",
  tags: TAG,
  summary: "Record a measurement",
  description:
    "SI integers stored as given; the answer places each value on the WHO or CDC reference.",
  middleware: [requireActor] as const,
  request: { params: ChildParams, body: jsonBody(ChildMeasurementInput, "The measurement") },
  responses: {
    201: jsonResponse(ChildMeasurement, "The measurement with its placements"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    409: CONFLICT,
    422: INVALID,
  },
});

export const listMeasurementsRoute = createRoute({
  method: "get",
  path: "/v1/children/{id}/measurements",
  tags: TAG,
  summary: "Measurements by date",
  middleware: [requireActor] as const,
  request: { params: ChildParams, query: DatedListQuery },
  responses: {
    200: jsonResponse(ChildMeasurementList, "The measurements"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    422: INVALID,
  },
});

export const milestonesRoute = createRoute({
  method: "get",
  path: "/v1/children/{id}/milestones",
  tags: TAG,
  summary: "The checklist for an age",
  description:
    "CDC's checklist for the age with the child's check-offs. Surveillance and conversation, never screening.",
  middleware: [requireActor] as const,
  request: { params: ChildParams, query: MilestonesQuery },
  responses: {
    200: jsonResponse(MilestoneChecklist, "The checklist"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    422: INVALID,
  },
});

export const checkMilestoneRoute = createRoute({
  method: "put",
  path: "/v1/children/{id}/milestones",
  tags: TAG,
  summary: "Check or uncheck an item",
  description:
    "Records a check-off as a milestone event, or removes it. The item travels in the body so that no request line pairs a child with a checklist item.",
  middleware: [requireActor] as const,
  request: { params: ChildParams, body: jsonBody(MilestoneCheckInput, "The item") },
  responses: {
    200: jsonResponse(MilestoneCheck, "The item as it now stands"),
    401: UNAUTHENTICATED,
    404: NOT_FOUND,
    422: INVALID,
  },
});

type ChildRow = typeof schema.children.$inferSelect;
type EventRow = typeof schema.childEvents.$inferSelect;
type MeasurementRow = typeof schema.childMeasurements.$inferSelect;

function actorOf(c: Context<ApiEnv>): RequestActor {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before a children handler");
  return actor;
}

/** The one scope `can()` allows for this child and action, or null: the route answers 404 then. */
function childScope(actor: RequestActor, childId: string, action: Action): Scope | null {
  return listScope(actor, action).find((scope) => scope.childId === childId) ?? null;
}

/**
 * The zone the actor's own days are read in, UTC until she has a profile:
 * the day her partner read is filed under (`auditDay`, the real day), and
 * the today a child's checklist age and an undated check-off are counted
 * to (the calendar clock's).
 */
function actorZone(actor: RequestActor): string {
  return actor.profile?.timeZone ?? "UTC";
}

/** A partner's read or write (reason `grant`) is audited; a guardian's is not (architecture 8.3 step 6). */
async function auditPartner(
  tx: Transaction,
  actor: RequestActor,
  scope: Scope,
  childId: string,
  action: "read" | "write",
): Promise<void> {
  if (scope.reason !== "grant") return;
  await audit(tx, {
    actorId: actor.id,
    action: action === "read" ? auditActions.partnerRead : auditActions.partnerWrite,
    subjectId: childId,
    category: "child",
    childId,
    ...(action === "read" ? { day: auditDay(actorZone(actor)) } : {}),
  });
}

async function findChild(tx: Transaction, childId: string): Promise<ChildRow | null> {
  const [row] = await tx
    .select()
    .from(schema.children)
    .where(and(eq(schema.children.id, childId), isNull(schema.children.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function guardiansOf(tx: Transaction, childId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: schema.childGuardians.userId })
    .from(schema.childGuardians)
    .where(eq(schema.childGuardians.childId, childId))
    .orderBy(asc(schema.childGuardians.createdAt), asc(schema.childGuardians.id));
  return rows.map((row) => row.userId);
}

/** Resolves the child and the scope for the action in one place; null means 404. */
async function loadChild(
  tx: Transaction,
  actor: RequestActor,
  childId: string,
  action: Action,
): Promise<{ child: ChildRow; scope: Scope } | null> {
  const scope = childScope(actor, childId, action);
  if (scope === null) return null;
  const child = await findChild(tx, childId);
  if (child === null) return null;
  return { child, scope };
}

const instant = (value: Date): string => value.toISOString();

/**
 * Every serializer projects through the storage map (architecture 8.2): a
 * child row files wholly under `child`, so a grantee keeps every column it
 * names, and the guardian-only facts (`householdId`, the guardians) are added
 * afterwards for a guardian only.
 */
function serializeChild(row: ChildRow, guardians: string[] | null, scope: Scope): Child {
  const base = projectRow(
    "children",
    {
      id: row.id,
      displayName: row.displayName,
      dateOfBirth: row.dateOfBirth,
      sex: row.sex,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      version: row.version,
    },
    scope,
  ) as Child;
  if (scope.reason === "guardian") {
    base.householdId = row.householdId;
    if (guardians !== null) base.guardians = guardians;
  }
  return base;
}

function serializeEvent(row: EventRow, note: string | null, scope: Scope): ChildEvent {
  return projectRow(
    EVENTS_TABLE,
    {
      id: row.id,
      childId: row.childId,
      kind: row.kind,
      date: row.date,
      startedAt: row.startedAt === null ? null : instant(row.startedAt),
      endedAt: row.endedAt === null ? null : instant(row.endedAt),
      milestoneId: row.milestoneId,
      quantityMl: row.quantityMl,
      side: row.side,
      feedMethod: row.feedMethod,
      diaperContents: row.diaperContents,
      note,
      authorId: row.authorId,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      version: row.version,
      deletedAt: null,
    },
    scope,
  ) as ChildEvent;
}

function serializeTombstone(row: EventRow, deletedAt: Date): ChildEventTombstone {
  return {
    id: row.id,
    childId: row.childId,
    updatedAt: instant(row.updatedAt),
    version: row.version,
    deletedAt: instant(deletedAt),
  };
}

const INDICATORS: readonly {
  indicator: PlacedIndicator;
  value: (row: MeasurementRow) => number | null;
  needsLength: boolean;
}[] = [
  { indicator: "weightForAge", value: (row) => row.weightGrams, needsLength: false },
  { indicator: "lengthForAge", value: (row) => row.lengthMillimetres, needsLength: false },
  { indicator: "headCircumferenceForAge", value: (row) => row.headMillimetres, needsLength: false },
  { indicator: "weightForLength", value: (row) => row.weightGrams, needsLength: true },
];

/**
 * Places each present value on its reference through core. Nothing is
 * computed here beyond picking the inputs: the z, the percentile, the
 * reference choice and the approximate flag are the engine's. Empty until
 * the child's sex is set, and for any indicator no vendored table covers.
 */
function placements(
  row: MeasurementRow,
  child: ChildRow,
): { placements: GrowthPlacement[]; farOutside: boolean } {
  if (child.sex === null) return { placements: [], farOutside: false };
  const ageDays = diffDays(child.dateOfBirth, row.date);
  if (ageDays < 0) return { placements: [], farOutside: false };
  const out: GrowthPlacement[] = [];
  let farOutside = false;
  for (const { indicator, value, needsLength } of INDICATORS) {
    const measured = value(row);
    if (measured === null) continue;
    if (needsLength && row.lengthMillimetres === null) continue;
    const assessment = growthAssessment({
      sex: child.sex,
      ageDays,
      indicator,
      value: measured,
      ...(needsLength ? { lengthMm: row.lengthMillimetres as number } : {}),
    });
    if (assessment === null) continue;
    farOutside = farOutside || assessment.farOutsideBand;
    out.push({
      indicator,
      reference: assessment.reference,
      percentile: assessment.percentile,
      z: assessment.z,
      approximate: assessment.approximate,
      bands: assessment.bands,
    });
  }
  return { placements: out, farOutside };
}

/**
 * `pointToCare` exists on a guardian's answer only (architecture 8.4: the
 * sentence never appears on a partner's view), and `farOutsideBand` itself
 * is never sent, since it is the same bit.
 */
function serializeMeasurement(
  row: MeasurementRow,
  child: ChildRow,
  scope: Scope,
): ChildMeasurement {
  const placed = placements(row, child);
  const base = projectRow(
    "child_measurements",
    {
      id: row.id,
      childId: row.childId,
      date: row.date,
      weightGrams: row.weightGrams,
      lengthMillimetres: row.lengthMillimetres,
      headMillimetres: row.headMillimetres,
      placements: placed.placements,
      authorId: row.authorId,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      version: row.version,
    },
    scope,
  ) as ChildMeasurement;
  if (scope.reason === "guardian") base.pointToCare = placed.farOutside;
  return base;
}

/** `If-Match: 3`, `"3"` or `W/"3"`; absent means the client takes the row as it is. */
function staleVersion(header: string | undefined, version: number): boolean {
  if (header === undefined) return false;
  const seen = header
    .trim()
    .replace(/^W\//, "")
    .replace(/^"(.*)"$/, "$1");
  return Number(seen) !== version;
}

function encodeCursor(parts: Record<string, string>): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): Record<string, string> | null | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    for (const value of Object.values(parsed)) if (typeof value !== "string") return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

function invalidCursor(c: Context<ApiEnv>) {
  return problem(c, 422, "validation_failed", {
    errors: [{ path: "cursor", message: "The cursor is not one this list issued." }],
  });
}

/**
 * The position a children-list cursor names: exactly an id, checked before it
 * reaches a query, so a cursor this list never issued (a forged id, or another
 * list's cursor) is a 422 and not a database error. Null means refuse;
 * undefined means the first page.
 */
function childrenCursor(
  raw: Record<string, string> | null | undefined,
): { i: string } | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const { i, ...rest } = raw;
  if (Object.keys(rest).length > 0) return null;
  if (i === undefined || !Id.safeParse(i).success) return null;
  return { i };
}

/**
 * The position a measurements cursor names: exactly a real day and an id,
 * checked the same way as `childrenCursor`.
 */
function measurementCursor(
  raw: Record<string, string> | null | undefined,
): { d: string; i: string } | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const { d, i, ...rest } = raw;
  if (Object.keys(rest).length > 0) return null;
  if (d === undefined || !RealCalendarDate.safeParse(d).success) return null;
  if (i === undefined || !Id.safeParse(i).success) return null;
  return { d, i };
}

/**
 * When an event happened, for the newest-first order: its start, or when it
 * was logged when it has none (a diaper or a milestone logged without a
 * time). `created_at` is never null, so neither is this.
 */
const EVENT_MOMENT = sql`coalesce(${schema.childEvents.startedAt}, ${schema.childEvents.createdAt})`;

/**
 * The same instant as UTC text at the column's full precision, the form a
 * newest-first cursor carries: a JavaScript `Date` keeps milliseconds only,
 * and a cursor rounded to them would skip or repeat rows that differ below.
 */
const EVENT_MOMENT_TEXT = sql<string>`to_char(${EVENT_MOMENT} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const MOMENT_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * A moment as `EVENT_MOMENT_TEXT` writes it, for a time that exists (2026-02-31 does not)
 * and that Postgres can cast: JavaScript reads year 0000 as 1 BC, but Postgres has no year
 * zero and refuses it, so a moment must fall in year 0001 or later.
 */
function isMomentText(value: string): boolean {
  if (!MOMENT_TEXT.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() >= 1 &&
    parsed.toISOString().slice(0, 23) === value.slice(0, 23)
  );
}

/** Where an events page ends: the day and the id, and the moment for the newest-first order. */
interface EventCursor {
  d: string;
  i: string;
  t?: string;
}

/**
 * The position an events cursor names, checked before any of it reaches a
 * query, so a cursor this list never issued is a 422 and not a database
 * error: a real day and a uuid, and for the newest-first order its marker
 * and a moment. A cursor continues only the order that issued it. Null means
 * refuse; undefined means the first page.
 */
function eventCursor(
  raw: Record<string, string> | null | undefined,
  newestFirst: boolean,
): EventCursor | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const { d, i, t, o } = raw;
  if (d === undefined || !RealCalendarDate.safeParse(d).success) return null;
  if (i === undefined || !Id.safeParse(i).success) return null;
  if (!newestFirst) return o === undefined && t === undefined ? { d, i } : null;
  if (o !== "desc" || t === undefined || !isMomentText(t)) return null;
  return { d, i, t };
}

/** The rows after an events cursor in the order it was issued for. */
function afterEventCursor(after: EventCursor): SQL | undefined {
  const { childEvents } = schema;
  if (after.t === undefined) {
    return or(
      gt(childEvents.date, after.d),
      and(eq(childEvents.date, after.d), gt(childEvents.id, after.i)),
    );
  }
  return or(
    lt(childEvents.date, after.d),
    and(eq(childEvents.date, after.d), sql`${EVENT_MOMENT} < ${after.t}::timestamptz`),
    and(
      eq(childEvents.date, after.d),
      sql`${EVENT_MOMENT} = ${after.t}::timestamptz`,
      lt(childEvents.id, after.i),
    ),
  );
}

/**
 * SHA-256 of the guardian's consent as the form showed it, over a canonical
 * JSON form of the catalog entry and its version, the way the collection
 * consent hashes its disclosure (`disclosureHash` in ./profile). The row
 * keeps it as `text_hash`, so the exact words agreed to stay provable after
 * a later version changes them.
 */
export function guardianConsentHash(version: ChildConsentTextVersion): string {
  const disclosure = CHILD_CONSENT_DISCLOSURES[version];
  const canonical = JSON.stringify({
    category: disclosure.category,
    basis: disclosure.basis,
    purpose: disclosure.purpose,
    text: disclosure.text,
    textVersion: version,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  return code === "23505" || causeCode === "23505";
}

/** The checklist item for an id, from any age's list. */
function milestoneItem(itemId: string): (MilestoneItem & { months: number }) | null {
  for (const checklist of milestoneChecklists) {
    const item = checklist.items.find((candidate) => candidate.id === itemId);
    if (item !== undefined) return { ...item, months: checklist.months };
  }
  return null;
}

async function encryptNote(
  tx: Transaction,
  keys: KeyProvider,
  cache: KeyCache,
  childId: string,
  rowId: string,
  note: string,
): Promise<{ note: Uint8Array; kekVersion: string }> {
  await unwrapForSubject(tx, childId, keys, cache);
  return {
    note: encryptFieldFor(
      cache,
      { subjectId: childId, table: EVENTS_TABLE, column: NOTE_COLUMN, rowId },
      note,
    ),
    kekVersion: keys.version,
  };
}

/** Opens every note in the page with one unwrap of the child's key, after the scope was decided. */
async function decryptNotes(
  tx: Transaction,
  keys: KeyProvider,
  cache: KeyCache,
  childId: string,
  rows: EventRow[],
): Promise<Map<string, string | null>> {
  const notes = new Map<string, string | null>();
  if (rows.some((row) => row.note !== null)) await unwrapForSubject(tx, childId, keys, cache);
  for (const row of rows) {
    notes.set(
      row.id,
      row.note === null
        ? null
        : decryptFieldFor(
            cache,
            { subjectId: childId, table: EVENTS_TABLE, column: NOTE_COLUMN, rowId: row.id },
            row.note,
          ),
    );
  }
  return notes;
}

export function registerChildren(app: OpenAPIHono<ApiEnv>, options: ChildrenOptions = {}): void {
  if (options.db !== undefined || options.keys !== undefined) configureChildren(options);

  app.openapi(createChildRoute, async (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const childId = input.id ?? uuidv7();
    let result: { child: ChildRow; guardians: string[] } | "id_in_use";
    try {
      result = await withActor(
        actor.id,
        async (tx) => {
          const [membership] = await tx
            .select({ householdId: schema.householdMembers.householdId })
            .from(schema.householdMembers)
            .where(
              and(
                eq(schema.householdMembers.userId, actor.id),
                eq(schema.householdMembers.status, "active"),
              ),
            )
            .orderBy(asc(schema.householdMembers.joinedAt), asc(schema.householdMembers.id))
            .limit(1);
          let householdId = membership?.householdId;
          if (householdId === undefined) {
            householdId = uuidv7();
            await tx.insert(schema.households).values({ id: householdId });
            await tx
              .insert(schema.householdMembers)
              .values({ id: uuidv7(), householdId, userId: actor.id, role: "owner" });
          }
          // No RETURNING here: B8's select policy shows a child to its guardians
          // only, and the creator becomes one with the next insert.
          await tx.insert(schema.children).values({
            id: childId,
            householdId,
            displayName: input.displayName,
            dateOfBirth: input.dateOfBirth,
            sex: input.sex ?? null,
          });
          await tx
            .insert(schema.childGuardians)
            .values({ id: uuidv7(), childId, userId: actor.id });
          // Her consent on the child's behalf (architecture 8.4), after the guardian row:
          // B8's consents policy admits a guardian recording her own consent for a child
          // she guards. The catalog supplies every word; the client sent only the version.
          // `granted_at` takes the transaction's now(), the child's `created_at` exactly.
          const { textVersion } = input.guardianConsent;
          const consent = CHILD_CONSENT_DISCLOSURES[textVersion];
          await tx.insert(schema.consents).values({
            id: uuidv7(),
            subjectId: childId,
            consentingGuardianId: actor.id,
            category: consent.category,
            basis: consent.basis,
            purpose: consent.purpose,
            policyVersion: textVersion,
            textHash: guardianConsentHash(textVersion),
          });
          // After the guardian row: B8's subject_keys policy admits a guardian's insert.
          await provisionChildKey(tx, childId, keys());
          const child = await findChild(tx, childId);
          if (child === null) throw new Error("the new child is not visible to its guardian");
          return { child, guardians: [actor.id] };
        },
        runtime.db,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        result = "id_in_use";
      } else {
        throw error;
      }
    }
    if (result === "id_in_use") return problem(c, 409, "conflict", { detail: ID_IN_USE });
    const scope: Scope = {
      reason: "guardian",
      subjectId: childId,
      categories: ["child"],
      level: "contribute",
      childId,
    };
    return c.json(serializeChild(result.child, result.guardians, scope), 201);
  });

  app.openapi(listChildrenRoute, async (c) => {
    const actor = actorOf(c);
    const { limit, cursor } = c.req.valid("query");
    const after = childrenCursor(decodeCursor(cursor));
    if (after === null) return invalidCursor(c);
    const scopes = new Map<string, Scope>();
    for (const scope of listScope(actor, "summary")) {
      if (scope.childId !== undefined && !scopes.has(scope.childId))
        scopes.set(scope.childId, scope);
    }
    if (scopes.size === 0) return c.json({ items: [], nextCursor: null }, 200);
    const page = await withActor(
      actor.id,
      async (tx) => {
        const conditions = [
          inArray(schema.children.id, [...scopes.keys()]),
          isNull(schema.children.deletedAt),
        ];
        if (after !== undefined) conditions.push(gt(schema.children.id, after.i));
        const rows = await tx
          .select()
          .from(schema.children)
          .where(and(...conditions))
          .orderBy(asc(schema.children.id))
          .limit(limit + 1);
        const items: Child[] = [];
        for (const row of rows.slice(0, limit)) {
          const scope = scopes.get(row.id);
          if (scope === undefined) continue;
          await auditPartner(tx, actor, scope, row.id, "read");
          const guardians = scope.reason === "guardian" ? await guardiansOf(tx, row.id) : null;
          items.push(serializeChild(row, guardians, scope));
        }
        const last = items[items.length - 1];
        return {
          items,
          nextCursor:
            rows.length > limit && last !== undefined ? encodeCursor({ i: last.id }) : null,
        };
      },
      runtime.db,
    );
    return c.json(page, 200);
  });

  app.openapi(getChildRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const found = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "summary");
        if (loaded === null) return null;
        await auditPartner(tx, actor, loaded.scope, id, "read");
        const guardians = loaded.scope.reason === "guardian" ? await guardiansOf(tx, id) : null;
        return serializeChild(loaded.child, guardians, loaded.scope);
      },
      runtime.db,
    );
    if (found === null) return problem(c, 404, "not_found");
    return c.json(found, 200);
  });

  app.openapi(updateChildRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const ifMatch = c.req.valid("header")["if-match"];
    const input = c.req.valid("json");
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "write");
        if (loaded === null) return null;
        if (staleVersion(ifMatch, loaded.child.version)) return "stale" as const;
        const [updated] = await tx
          .update(schema.children)
          .set({
            displayName: input.displayName,
            dateOfBirth: input.dateOfBirth,
            sex: input.sex ?? null,
            updatedAt: new Date(),
            version: loaded.child.version + 1,
          })
          .where(and(eq(schema.children.id, id), eq(schema.children.version, loaded.child.version)))
          .returning();
        if (updated === undefined) return "stale" as const;
        await auditPartner(tx, actor, loaded.scope, id, "write");
        const guardians = loaded.scope.reason === "guardian" ? await guardiansOf(tx, id) : null;
        return serializeChild(updated, guardians, loaded.scope);
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    if (outcome === "stale") return problem(c, 409, "conflict", { detail: STALE_VERSION });
    return c.json(outcome, 200);
  });

  app.openapi(addGuardianRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const { userId } = c.req.valid("json");
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        // Adding a guardian is a "share": owner or guardian only, never a grant.
        const loaded = await loadChild(tx, actor, id, "share");
        if (loaded === null) return null;
        const [member] = await tx
          .select({ id: schema.householdMembers.id })
          .from(schema.householdMembers)
          .where(
            and(
              eq(schema.householdMembers.householdId, loaded.child.householdId),
              eq(schema.householdMembers.userId, userId),
              eq(schema.householdMembers.status, "active"),
            ),
          )
          .limit(1);
        if (member === undefined) return "not_member" as const;
        if ((await guardiansOf(tx, id)).includes(userId)) return "already" as const;
        const [row] = await tx
          .insert(schema.childGuardians)
          .values({ id: uuidv7(), childId: id, userId })
          .returning();
        if (row === undefined) throw new Error("the guardian insert returned no row");
        await audit(tx, {
          actorId: actor.id,
          action: auditActions.grantCreate,
          subjectId: id,
          category: "child",
          childId: id,
        });
        const guardian: Guardian = {
          childId: row.childId,
          userId: row.userId,
          createdAt: instant(row.createdAt),
        };
        return guardian;
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    if (outcome === "not_member") {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: "userId", message: "Not an active member of the child's household." }],
      });
    }
    if (outcome === "already") return problem(c, 409, "conflict", { detail: ALREADY_GUARDIAN });
    return c.json(outcome, 201);
  });

  app.openapi(removeGuardianRoute, async (c) => {
    const actor = actorOf(c);
    const { id, userId } = c.req.valid("param");
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "delete");
        if (loaded === null) return null;
        const guardians = await guardiansOf(tx, id);
        if (!guardians.includes(userId)) return null;
        if (guardians.length === 1) return "last" as const;
        // Audited before the row goes: afterwards a leaving guardian no longer holds the child's key.
        await audit(tx, {
          actorId: actor.id,
          action: auditActions.grantRevoke,
          subjectId: id,
          category: "child",
          childId: id,
        });
        await tx
          .delete(schema.childGuardians)
          .where(
            and(eq(schema.childGuardians.childId, id), eq(schema.childGuardians.userId, userId)),
          );
        return "ended" as const;
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    if (outcome === "last") return problem(c, 409, "conflict", { detail: LAST_GUARDIAN });
    return c.body(null, 204);
  });

  app.openapi(createEventRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const eventId = input.id ?? uuidv7();
    const cache = createKeyCache();
    let outcome: ChildEvent | null | "id_in_use";
    try {
      outcome = await withActor(
        actor.id,
        async (tx) => {
          const loaded = await loadChild(tx, actor, id, "write");
          if (loaded === null) return null;
          const sealed =
            input.note === undefined
              ? { note: null, kekVersion: null }
              : await encryptNote(tx, keys(), cache, id, eventId, input.note);
          const [row] = await tx
            .insert(schema.childEvents)
            .values({
              id: eventId,
              childId: id,
              authorId: actor.id,
              kind: input.kind,
              date: input.date,
              startedAt: input.startedAt === undefined ? null : new Date(input.startedAt),
              endedAt: input.endedAt === undefined ? null : new Date(input.endedAt),
              milestoneId: input.milestoneId ?? null,
              quantityMl: input.quantityMl ?? null,
              side: input.side ?? null,
              feedMethod: input.feedMethod ?? null,
              diaperContents: input.diaperContents ?? null,
              note: sealed.note,
              kekVersion: sealed.kekVersion,
            })
            .returning();
          if (row === undefined) throw new Error("the event insert returned no row");
          await auditPartner(tx, actor, loaded.scope, id, "write");
          return serializeEvent(row, input.note ?? null, loaded.scope);
        },
        runtime.db,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      outcome = "id_in_use";
    } finally {
      cache.clear();
    }
    if (outcome === null) return problem(c, 404, "not_found");
    if (outcome === "id_in_use") return problem(c, 409, "conflict", { detail: ID_IN_USE });
    return c.json(outcome, 201);
  });

  app.openapi(listEventsRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const { limit, cursor, from, to, updatedSince, kind, order } = c.req.valid("query");
    const newestFirst = order === "desc";
    const after = eventCursor(decodeCursor(cursor), newestFirst);
    if (after === null) return invalidCursor(c);
    const cache = createKeyCache();
    try {
      const page = await withActor(
        actor.id,
        async (tx) => {
          const loaded = await loadChild(tx, actor, id, "read");
          if (loaded === null) return null;
          const conditions = [eq(schema.childEvents.childId, id)];
          if (from !== undefined) conditions.push(gte(schema.childEvents.date, from));
          if (to !== undefined) conditions.push(lte(schema.childEvents.date, to));
          if (kind !== undefined) conditions.push(eq(schema.childEvents.kind, kind));
          if (updatedSince === undefined) {
            conditions.push(isNull(schema.childEvents.deletedAt));
          } else {
            conditions.push(gt(schema.childEvents.updatedAt, new Date(updatedSince)));
          }
          if (after !== undefined) {
            const beyond = afterEventCursor(after);
            if (beyond !== undefined) conditions.push(beyond);
          }
          const rows = await tx
            .select({ ...getTableColumns(schema.childEvents), moment: EVENT_MOMENT_TEXT })
            .from(schema.childEvents)
            .where(and(...conditions))
            .orderBy(
              ...(newestFirst
                ? [
                    desc(schema.childEvents.date),
                    sql`${EVENT_MOMENT} desc`,
                    desc(schema.childEvents.id),
                  ]
                : [asc(schema.childEvents.date), asc(schema.childEvents.id)]),
            )
            .limit(limit + 1);
          const kept = rows.slice(0, limit);
          const live = kept.filter((row) => row.deletedAt === null);
          const notes = await decryptNotes(tx, keys(), cache, id, live);
          await auditPartner(tx, actor, loaded.scope, id, "read");
          const items = kept.map((row) =>
            row.deletedAt === null
              ? serializeEvent(row, notes.get(row.id) ?? null, loaded.scope)
              : serializeTombstone(row, row.deletedAt),
          );
          const last = kept[kept.length - 1];
          let nextCursor: string | null = null;
          if (rows.length > limit && last !== undefined) {
            nextCursor = encodeCursor(
              newestFirst
                ? { o: "desc", d: last.date, t: last.moment, i: last.id }
                : { d: last.date, i: last.id },
            );
          }
          return { items, nextCursor };
        },
        runtime.db,
      );
      if (page === null) return problem(c, 404, "not_found");
      return c.json(page, 200);
    } finally {
      cache.clear();
    }
  });

  app.openapi(updateEventRoute, async (c) => {
    const actor = actorOf(c);
    const { id, eventId } = c.req.valid("param");
    const ifMatch = c.req.valid("header")["if-match"];
    const input = c.req.valid("json");
    const cache = createKeyCache();
    try {
      const outcome = await withActor(
        actor.id,
        async (tx) => {
          const loaded = await loadChild(tx, actor, id, "write");
          if (loaded === null) return null;
          const [current] = await tx
            .select()
            .from(schema.childEvents)
            .where(
              and(
                eq(schema.childEvents.id, eventId),
                eq(schema.childEvents.childId, id),
                isNull(schema.childEvents.deletedAt),
              ),
            )
            .limit(1);
          if (current === undefined) return null;
          if (current.kind !== input.kind) return "kind" as const;
          if (staleVersion(ifMatch, current.version)) return "stale" as const;
          const sealed =
            input.note === undefined
              ? { note: null, kekVersion: null }
              : await encryptNote(tx, keys(), cache, id, eventId, input.note);
          const [row] = await tx
            .update(schema.childEvents)
            .set({
              date: input.date,
              startedAt: input.startedAt === undefined ? null : new Date(input.startedAt),
              endedAt: input.endedAt === undefined ? null : new Date(input.endedAt),
              milestoneId: input.milestoneId ?? null,
              quantityMl: input.quantityMl ?? null,
              side: input.side ?? null,
              feedMethod: input.feedMethod ?? null,
              diaperContents: input.diaperContents ?? null,
              note: sealed.note,
              kekVersion: sealed.kekVersion,
              updatedAt: new Date(),
              version: current.version + 1,
            })
            .where(
              and(
                eq(schema.childEvents.id, eventId),
                eq(schema.childEvents.version, current.version),
              ),
            )
            .returning();
          if (row === undefined) return "stale" as const;
          await auditPartner(tx, actor, loaded.scope, id, "write");
          return serializeEvent(row, input.note ?? null, loaded.scope);
        },
        runtime.db,
      );
      if (outcome === null) return problem(c, 404, "not_found");
      if (outcome === "stale") return problem(c, 409, "conflict", { detail: STALE_VERSION });
      if (outcome === "kind") {
        return problem(c, 422, "validation_failed", {
          errors: [{ path: "kind", message: "An event keeps its kind; log another instead." }],
        });
      }
      return c.json(outcome, 200);
    } finally {
      cache.clear();
    }
  });

  app.openapi(deleteEventRoute, async (c) => {
    const actor = actorOf(c);
    const { id, eventId } = c.req.valid("param");
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "delete");
        if (loaded === null) return null;
        const [current] = await tx
          .select({ version: schema.childEvents.version })
          .from(schema.childEvents)
          .where(
            and(
              eq(schema.childEvents.id, eventId),
              eq(schema.childEvents.childId, id),
              isNull(schema.childEvents.deletedAt),
            ),
          )
          .limit(1);
        if (current === undefined) return null;
        const now = new Date();
        // A tombstone (architecture 7.3): every response carries only the key, the version and
        // when. The stored row still keeps `kind` and `date`, because B6's NOT NULL constraints
        // require them; the request to relax them or purge on the 7.3 schedule is with the lead.
        const removed = await tx
          .update(schema.childEvents)
          .set({
            deletedAt: now,
            updatedAt: now,
            version: current.version + 1,
            note: null,
            kekVersion: null,
            quantityMl: null,
            side: null,
            feedMethod: null,
            diaperContents: null,
            startedAt: null,
            endedAt: null,
          })
          .where(
            and(
              eq(schema.childEvents.id, eventId),
              eq(schema.childEvents.version, current.version),
            ),
          )
          .returning({ id: schema.childEvents.id });
        if (removed.length === 0) return null;
        await auditPartner(tx, actor, loaded.scope, id, "write");
        return "deleted";
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    return c.body(null, 204);
  });

  app.openapi(createMeasurementRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const measurementId = input.id ?? uuidv7();
    let outcome: ChildMeasurement | null | "id_in_use" | "before_birth";
    try {
      outcome = await withActor(
        actor.id,
        async (tx) => {
          const loaded = await loadChild(tx, actor, id, "write");
          if (loaded === null) return null;
          if (diffDays(loaded.child.dateOfBirth, input.date) < 0) return "before_birth" as const;
          const [row] = await tx
            .insert(schema.childMeasurements)
            .values({
              id: measurementId,
              childId: id,
              authorId: actor.id,
              date: input.date,
              weightGrams: input.weightGrams ?? null,
              lengthMillimetres: input.lengthMillimetres ?? null,
              headMillimetres: input.headMillimetres ?? null,
            })
            .returning();
          if (row === undefined) throw new Error("the measurement insert returned no row");
          await auditPartner(tx, actor, loaded.scope, id, "write");
          return serializeMeasurement(row, loaded.child, loaded.scope);
        },
        runtime.db,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      outcome = "id_in_use";
    }
    if (outcome === null) return problem(c, 404, "not_found");
    if (outcome === "id_in_use") return problem(c, 409, "conflict", { detail: ID_IN_USE });
    if (outcome === "before_birth") {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: "date", message: "A measurement is never dated before the birth." }],
      });
    }
    return c.json(outcome, 201);
  });

  app.openapi(listMeasurementsRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const { limit, cursor, from, to, updatedSince } = c.req.valid("query");
    const after = measurementCursor(decodeCursor(cursor));
    if (after === null) return invalidCursor(c);
    const page = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "read");
        if (loaded === null) return null;
        const conditions = [
          eq(schema.childMeasurements.childId, id),
          isNull(schema.childMeasurements.deletedAt),
        ];
        if (from !== undefined) conditions.push(gte(schema.childMeasurements.date, from));
        if (to !== undefined) conditions.push(lte(schema.childMeasurements.date, to));
        if (updatedSince !== undefined) {
          conditions.push(gt(schema.childMeasurements.updatedAt, new Date(updatedSince)));
        }
        if (after !== undefined) {
          const beyond = or(
            gt(schema.childMeasurements.date, after.d),
            and(
              eq(schema.childMeasurements.date, after.d),
              gt(schema.childMeasurements.id, after.i),
            ),
          );
          if (beyond !== undefined) conditions.push(beyond);
        }
        const rows = await tx
          .select()
          .from(schema.childMeasurements)
          .where(and(...conditions))
          .orderBy(asc(schema.childMeasurements.date), asc(schema.childMeasurements.id))
          .limit(limit + 1);
        const kept = rows.slice(0, limit);
        await auditPartner(tx, actor, loaded.scope, id, "read");
        const last = kept[kept.length - 1];
        return {
          items: kept.map((row) => serializeMeasurement(row, loaded.child, loaded.scope)),
          nextCursor:
            rows.length > limit && last !== undefined
              ? encodeCursor({ d: last.date, i: last.id })
              : null,
        };
      },
      runtime.db,
    );
    if (page === null) return problem(c, 404, "not_found");
    return c.json(page, 200);
  });

  app.openapi(milestonesRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const { age } = c.req.valid("query");
    if (age !== undefined && !milestoneChecklists.some((checklist) => checklist.months === age)) {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: "age", message: "Not a checklist age." }],
      });
    }
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "read");
        if (loaded === null) return null;
        const checklist =
          age === undefined
            ? // Before two months there is no list yet; the first one is what a parent sees.
              (checklistFor(
                diffDays(loaded.child.dateOfBirth, c.var.clock.today(actorZone(actor))),
              ) ?? milestoneChecklists[0])
            : milestoneChecklists.find((candidate) => candidate.months === age);
        if (checklist === undefined) throw new Error("the checklist data has no ages");
        const itemIds = checklist.items.map((item) => item.id);
        const checks = await tx
          .select({
            id: schema.childEvents.id,
            milestoneId: schema.childEvents.milestoneId,
            date: schema.childEvents.date,
          })
          .from(schema.childEvents)
          .where(
            and(
              eq(schema.childEvents.childId, id),
              eq(schema.childEvents.kind, "milestone"),
              inArray(schema.childEvents.milestoneId, itemIds),
              isNull(schema.childEvents.deletedAt),
            ),
          )
          .orderBy(asc(schema.childEvents.date), asc(schema.childEvents.id));
        const byItem = new Map<string, { id: string; date: string }>();
        for (const check of checks) {
          if (check.milestoneId !== null) byItem.set(check.milestoneId, check);
        }
        await auditPartner(tx, actor, loaded.scope, id, "read");
        const body: MilestoneChecklist = {
          childId: id,
          months: checklist.months,
          label: checklist.label,
          framing: milestoneFraming(checklist.months),
          notScreeningLine: NOT_A_SCREENING_TOOL,
          attribution: CDC_MILESTONES_ATTRIBUTION,
          items: checklist.items.map((item) => {
            const check = byItem.get(item.id);
            return {
              id: item.id,
              domain: item.domain,
              text: item.text,
              checked: check !== undefined,
              checkedOn: check?.date ?? null,
              eventId: check?.id ?? null,
            };
          }),
        };
        return body;
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    return c.json(outcome, 200);
  });

  app.openapi(checkMilestoneRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const item = milestoneItem(input.itemId);
    if (item === null) {
      return problem(c, 422, "validation_failed", {
        errors: [{ path: "itemId", message: "Not a checklist item." }],
      });
    }
    const outcome = await withActor(
      actor.id,
      async (tx) => {
        const loaded = await loadChild(tx, actor, id, "write");
        if (loaded === null) return null;
        const existing = await tx
          .select({
            id: schema.childEvents.id,
            date: schema.childEvents.date,
            version: schema.childEvents.version,
          })
          .from(schema.childEvents)
          .where(
            and(
              eq(schema.childEvents.childId, id),
              eq(schema.childEvents.kind, "milestone"),
              eq(schema.childEvents.milestoneId, item.id),
              isNull(schema.childEvents.deletedAt),
            ),
          )
          .orderBy(asc(schema.childEvents.date), asc(schema.childEvents.id));
        const now = new Date();
        let check: { id: string; date: string } | null = existing[existing.length - 1] ?? null;
        if (input.checked) {
          if (check === null) {
            const date = input.date ?? c.var.clock.today(actorZone(actor), now);
            const eventId = uuidv7();
            await tx.insert(schema.childEvents).values({
              id: eventId,
              childId: id,
              authorId: actor.id,
              kind: "milestone",
              date,
              milestoneId: item.id,
            });
            check = { id: eventId, date };
          } else if (input.date !== undefined && input.date !== check.date) {
            const [moved] = await tx
              .update(schema.childEvents)
              .set({
                date: input.date,
                updatedAt: now,
                version: (existing.at(-1)?.version ?? 1) + 1,
              })
              .where(eq(schema.childEvents.id, check.id))
              .returning({ id: schema.childEvents.id, date: schema.childEvents.date });
            if (moved !== undefined) check = moved;
          }
        } else if (existing.length > 0) {
          // An uncheck leaves tombstones, like any delete, so an offline client learns of it. The
          // stored row keeps `kind`, `date` and `milestone_id` (B6's constraints); no response does.
          for (const row of existing) {
            await tx
              .update(schema.childEvents)
              .set({
                deletedAt: now,
                updatedAt: now,
                version: row.version + 1,
                note: null,
                kekVersion: null,
              })
              .where(eq(schema.childEvents.id, row.id));
          }
          check = null;
        }
        await auditPartner(tx, actor, loaded.scope, id, "write");
        const body: MilestoneCheck = {
          id: item.id,
          domain: item.domain,
          text: item.text,
          checked: check !== null,
          checkedOn: check?.date ?? null,
          eventId: check?.id ?? null,
        };
        return body;
      },
      runtime.db,
    );
    if (outcome === null) return problem(c, 404, "not_found");
    return c.json(outcome, 200);
  });
}
