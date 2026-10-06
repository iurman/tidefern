import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, TypedResponse } from "hono";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import {
  OVULATION_BAND_DAYS,
  addDays,
  can,
  compareDates,
  cycleDay,
  diffDays,
  plausibleCycleLengths,
  predictCycle,
  projectRow,
  todayIn,
} from "@tidefern/core";
import type {
  Access,
  CalendarDate,
  CyclePrediction as CorePrediction,
  PeriodStart,
} from "@tidefern/core";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";
import {
  CycleEntry,
  CycleEntryList,
  CycleEntryWrite,
  CyclePrediction,
  CycleStatus,
  CycleVocabulary,
  PERIOD_FLOWS,
  Problem,
  SYMPTOM_CODES,
  cycleVocabulary,
  isPeriodFlow,
} from "@tidefern/schemas";
import type { PredictionBasis, SymptomCode } from "@tidefern/schemas";

import type { RequestActor } from "../actor";
import { requireActor } from "../auth";
import type { ApiEnv } from "../context";
import { audit, auditActions } from "../middleware/audit";
import { problem } from "../problem";
import type { ProblemCode } from "../problem";

/**
 * The cycle routes (task E3): the day sheet by date range, the upsert and
 * the delete of one day, the prediction, the derived status and the
 * vocabulary. Every access decision is `can()` on a category of the storage
 * map (architecture record 8.2) and every query runs inside `withActor()`
 * so the B8 policies enforce the same rule underneath; the serializers
 * project columns through `projectRow()` so a reader never receives a field
 * from a category she was not granted. Free text never travels here: the
 * day sheet's note is task E6's own encrypted row.
 */

export interface CycleOptions {
  /**
   * The database `withActor()` opens the actor's transaction on. The pooled
   * production client is the default; the test harness passes PGlite.
   */
  db?: ActorDatabase | undefined;
}

/**
 * The registry calls `registerCycle(app)` with nothing else and the request
 * context carries no database, so this area keeps its one runtime setting
 * here. Production needs no call: `withActor()` defaults to the pooled
 * client. The test harness calls `configureCycle()` before its first
 * request. The day the host puts the database on the context, this goes.
 */
const runtime: CycleOptions = {};

export function configureCycle(options: CycleOptions): void {
  runtime.db = options.db;
}

/** The problem statuses the cycle routes declare. */
type CycleProblemStatus = 404 | 409 | 422;

/**
 * `problem()` typed to the one status a handler answers, so the response
 * matches the status the route definition lists; the body is unchanged.
 */
function fail<Status extends CycleProblemStatus>(
  c: Context<ApiEnv>,
  status: Status,
  code: ProblemCode,
  extra?: Parameters<typeof problem>[3],
) {
  return problem(c, status, code, extra) as unknown as Response &
    TypedResponse<Problem, Status, "json">;
}

const CYCLE_CATEGORIES = ["cycle.history", "cycle.symptoms"] as const;
type CycleCategory = (typeof CYCLE_CATEGORIES)[number];

/**
 * Bleeding days this many days apart or closer belong to one period, so a
 * day that was not logged inside a period does not split it in two. A
 * bleeding day further than this from the previous one starts a new period;
 * core's plausibility range (21 to 45 days) then decides whether the cycle
 * between two starts counts.
 */
export const PERIOD_GAP_DAYS = 2;

/** Architecture record 8.4: a period more than two weeks late is worth mentioning to a clinician. */
export const LATE_DAYS_TO_CARE = 14;

/** The `detail` of the 409 problem a stale `If-Match` gets. */
export const VERSION_MISMATCH = "version_mismatch";

const DEFAULT_TIME_ZONE = "UTC";

type EntryRow = typeof schema.cycleEntries.$inferSelect;
type PredictionRow = typeof schema.cyclePredictions.$inferSelect;

/* ------------------------------------------------------------------------ */
/* Access                                                                    */
/* ------------------------------------------------------------------------ */

interface CycleAccess extends Access {
  subjectId: string;
  categories: CycleCategory[];
}

/**
 * The cycle categories `can()` allows the actor on this subject for the
 * action, with the reason that applies: her own records, or a grant. Null
 * when no category is allowed, which the request flow answers with 404.
 */
function cycleAccess(
  actor: RequestActor,
  subjectId: string,
  action: "read" | "summary" | "write",
): CycleAccess | null {
  const categories: CycleCategory[] = [];
  let reason: Access["reason"] | null = null;
  for (const category of CYCLE_CATEGORIES) {
    const decision = can(actor, action, { subjectId, category });
    if (!decision.allowed || decision.reason === "denied") continue;
    reason ??= decision.reason;
    categories.push(category);
  }
  return reason === null ? null : { reason, subjectId, categories };
}

function actorOf(c: Context<ApiEnv>): RequestActor {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before a cycle handler");
  return actor;
}

/* ------------------------------------------------------------------------ */
/* Queries inside the actor's transaction                                    */
/* ------------------------------------------------------------------------ */

/** The subject's profile zone when the policies let the actor read it, else the fallback. */
async function subjectTimeZone(
  tx: Transaction,
  subjectId: string,
  fallback: string,
): Promise<string> {
  const [row] = await tx
    .select({ timeZone: schema.profiles.timeZone })
    .from(schema.profiles)
    .where(and(eq(schema.profiles.userId, subjectId), isNull(schema.profiles.deletedAt)))
    .limit(1);
  return row?.timeZone ?? fallback;
}

/** One `partner.read` row per category, collapsed per day by the audit helper. */
async function auditPartnerRead(
  tx: Transaction,
  actor: RequestActor,
  subjectId: string,
  categories: readonly ("cycle.history" | "cycle.symptoms" | "cycle.status")[],
): Promise<void> {
  const day = todayIn(
    await subjectTimeZone(tx, subjectId, actor.profile?.timeZone ?? DEFAULT_TIME_ZONE),
  );
  for (const category of categories) {
    await audit(tx, {
      actorId: actor.id,
      action: auditActions.partnerRead,
      subjectId,
      category,
      day,
    });
  }
}

/**
 * The period starts a subject has logged, oldest first: the first bleeding
 * day of each run of bleeding days (`PERIOD_GAP_DAYS`). Spotting is not
 * bleeding. Core's `predictCycle` takes these as they are.
 */
export function periodStartsFrom(
  days: readonly { date: CalendarDate; flow: string | null }[],
): PeriodStart[] {
  const bleeding = days
    .filter((day) => isPeriodFlow(day.flow as (typeof PERIOD_FLOWS)[number] | null))
    .map((day) => day.date)
    .sort(compareDates);
  const starts: PeriodStart[] = [];
  let previous: CalendarDate | null = null;
  for (const date of bleeding) {
    if (previous === null || diffDays(previous, date) > PERIOD_GAP_DAYS) starts.push({ date });
    previous = date;
  }
  return starts;
}

async function periodStartsFor(tx: Transaction, subjectId: string): Promise<PeriodStart[]> {
  const days = await tx
    .select({ date: schema.cycleEntries.date, flow: schema.cycleEntries.flow })
    .from(schema.cycleEntries)
    .where(
      and(
        eq(schema.cycleEntries.subjectId, subjectId),
        isNull(schema.cycleEntries.deletedAt),
        inArray(schema.cycleEntries.flow, [...PERIOD_FLOWS]),
      ),
    )
    .orderBy(asc(schema.cycleEntries.date));
  return periodStartsFrom(days);
}

/**
 * Architecture record 8.4 rule 4: no prediction while a pregnancy continues,
 * and after one ends only period starts dated after `ended_at` count. The
 * pregnancies table is task E4's; this reads the two dates it needs.
 */
async function pregnancyBoundary(
  tx: Transaction,
  subjectId: string,
): Promise<{ active: boolean; since: CalendarDate | null }> {
  const rows = await tx
    .select({ endedAt: schema.pregnancies.endedAt })
    .from(schema.pregnancies)
    .where(and(eq(schema.pregnancies.subjectId, subjectId), isNull(schema.pregnancies.deletedAt)));
  let since: CalendarDate | null = null;
  for (const row of rows) {
    if (row.endedAt === null) return { active: true, since: null };
    if (since === null || compareDates(row.endedAt, since) > 0) since = row.endedAt;
  }
  return { active: false, since };
}

interface Computed {
  prediction: CorePrediction | null;
  /** The starts that counted: all of them, or those after the pregnancy boundary. */
  starts: PeriodStart[];
}

async function computePrediction(tx: Transaction, subjectId: string): Promise<Computed> {
  const all = await periodStartsFor(tx, subjectId);
  const boundary = await pregnancyBoundary(tx, subjectId);
  if (boundary.active) return { prediction: null, starts: [] };
  const since = boundary.since;
  const starts = since === null ? all : all.filter((start) => compareDates(start.date, since) > 0);
  const prediction = predictCycle(starts, since === null ? {} : { since });
  return { prediction, starts };
}

/** The columns the cache row and the response share, from core's result. */
interface PredictionFacts {
  basis: PredictionBasis;
  cycleLength: number | null;
  sampleSize: number;
  nextPeriodStart: CalendarDate | null;
  ovulation: CalendarDate | null;
  fertileWindowStart: CalendarDate | null;
  fertileWindowEnd: CalendarDate | null;
  uncertaintyDays: number;
  ovulationBandDays: number;
}

function factsOf(prediction: CorePrediction | null): PredictionFacts {
  if (prediction === null) {
    return {
      basis: "none",
      cycleLength: null,
      sampleSize: 0,
      nextPeriodStart: null,
      ovulation: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      uncertaintyDays: 0,
      ovulationBandDays: OVULATION_BAND_DAYS,
    };
  }
  return {
    basis: prediction.basis,
    cycleLength: prediction.cycleLength,
    sampleSize: prediction.sampleSize,
    nextPeriodStart: prediction.nextPeriodStart,
    ovulation: prediction.ovulation,
    fertileWindowStart: prediction.fertileWindow?.start ?? null,
    fertileWindowEnd: prediction.fertileWindow?.end ?? null,
    uncertaintyDays: prediction.uncertaintyDays,
    ovulationBandDays: prediction.ovulationBandDays,
  };
}

function factsOfRow(row: PredictionRow): PredictionFacts {
  return {
    basis: row.basis,
    cycleLength: row.cycleLength,
    sampleSize: row.sampleSize,
    nextPeriodStart: row.nextPeriodStart,
    ovulation: row.ovulation,
    fertileWindowStart: row.fertileWindowStart,
    fertileWindowEnd: row.fertileWindowEnd,
    uncertaintyDays: row.uncertaintyDays,
    ovulationBandDays: row.ovulationBandDays,
  };
}

function sameFacts(a: PredictionFacts, b: PredictionFacts): boolean {
  return (Object.keys(a) as (keyof PredictionFacts)[]).every((key) => a[key] === b[key]);
}

async function livePrediction(tx: Transaction, subjectId: string): Promise<PredictionRow | null> {
  const [row] = await tx
    .select()
    .from(schema.cyclePredictions)
    .where(
      and(
        eq(schema.cyclePredictions.subjectId, subjectId),
        isNull(schema.cyclePredictions.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Keeps the one live `cycle_predictions` row equal to core's result: a new
 * row when none is live, an update when the facts changed, a tombstone when
 * no date is offered any more, and nothing when nothing changed. Runs in the
 * writer's transaction (B8 lets a contributor who logs a period write it)
 * and in the owner's reads, so a grantee's read can serve the row as it is.
 */
async function storePrediction(
  tx: Transaction,
  subjectId: string,
  prediction: CorePrediction | null,
  now: Date,
): Promise<void> {
  const live = await livePrediction(tx, subjectId);
  if (prediction === null) {
    if (live === null) return;
    await tx
      .update(schema.cyclePredictions)
      .set({ deletedAt: now, updatedAt: now, version: live.version + 1 })
      .where(eq(schema.cyclePredictions.id, live.id));
    return;
  }
  const facts = factsOf(prediction);
  if (live === null) {
    await tx.insert(schema.cyclePredictions).values({
      id: uuidv7(),
      subjectId,
      ...facts,
      basis: prediction.basis,
      computedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  if (sameFacts(facts, factsOfRow(live))) return;
  await tx
    .update(schema.cyclePredictions)
    .set({
      ...facts,
      basis: prediction.basis,
      computedAt: now,
      updatedAt: now,
      version: live.version + 1,
    })
    .where(eq(schema.cyclePredictions.id, live.id));
}

/**
 * Recomputes and stores the subject's prediction in a transaction opened as
 * the subject. Only for a grantee whose request `can()` has already allowed:
 * the prediction rests on rows outside the grant (a pregnancy filed under
 * `pregnancy.overview` ends or suspends it, architecture record 8.4), and
 * the grantee's own transaction would not see them and would predict
 * through a pregnancy. Nothing but the derived facts leaves this
 * transaction, and the only write is the derived cache row.
 */
async function refreshAsSubject(subjectId: string, now: Date): Promise<Computed> {
  return withActor(
    subjectId,
    async (tx) => {
      const computed = await computePrediction(tx, subjectId);
      await storePrediction(tx, subjectId, computed.prediction, now);
      return computed;
    },
    runtime.db,
  );
}

/* ------------------------------------------------------------------------ */
/* Serializers                                                               */
/* ------------------------------------------------------------------------ */

function instant(date: Date): string {
  return date.toISOString();
}

const SYMPTOM_ORDER = new Map<string, number>(SYMPTOM_CODES.map((code, index) => [code, index]));

function inPickerOrder(codes: readonly SymptomCode[]): SymptomCode[] {
  return [...codes].sort((a, b) => (SYMPTOM_ORDER.get(a) ?? 0) - (SYMPTOM_ORDER.get(b) ?? 0));
}

/**
 * One entry as the reader may see it: the keys and the sync facts always,
 * then the columns `projectRow()` keeps for the granted categories (the
 * storage map files `date` and `flow` under history and `mood` and the
 * symptom rows under symptoms), and nothing beyond the keys for a tombstone.
 */
function entryItem(row: EntryRow, symptoms: readonly SymptomCode[], access: Access): CycleEntry {
  const kept = projectRow(
    "cycle_entries",
    { id: row.id, subject_id: row.subjectId, date: row.date, flow: row.flow, mood: row.mood },
    access,
  );
  const item: CycleEntry = {
    id: row.id,
    subjectId: row.subjectId,
    version: row.version,
    updatedAt: instant(row.updatedAt),
    deletedAt: row.deletedAt === null ? null : instant(row.deletedAt),
  };
  if (kept.date !== undefined) item.date = kept.date;
  if (row.deletedAt !== null) return item;
  if ("flow" in kept) {
    item.flow = kept.flow ?? null;
    item.period = isPeriodFlow(kept.flow);
  }
  if ("mood" in kept) item.mood = kept.mood ?? null;
  if (access.reason === "owner" || access.categories.includes("cycle.symptoms")) {
    item.symptoms = inPickerOrder(symptoms);
  }
  return item;
}

function band(expected: CalendarDate, days: number) {
  return { expected, start: addDays(expected, -days), end: addDays(expected, days) };
}

/** The shared part of the prediction response, from the facts the cache holds. */
function predictionBody(
  subjectId: string,
  computedAt: Date,
  facts: PredictionFacts,
): CyclePrediction {
  return {
    subjectId,
    computedAt: instant(computedAt),
    basis: facts.basis,
    cycleLength: facts.cycleLength,
    sampleSize: facts.sampleSize,
    nextPeriod:
      facts.nextPeriodStart === null ? null : band(facts.nextPeriodStart, facts.uncertaintyDays),
    ovulation: facts.ovulation === null ? null : band(facts.ovulation, facts.ovulationBandDays),
    fertileWindow:
      facts.fertileWindowStart === null || facts.fertileWindowEnd === null
        ? null
        : { start: facts.fertileWindowStart, end: facts.fertileWindowEnd },
    uncertaintyDays: facts.uncertaintyDays,
    ovulationBandDays: facts.ovulationBandDays,
  };
}

/** The owner's extras: the deviation line's spread, the count, and the care line. Never on a grantee's view. */
function ownerExtras(
  body: CyclePrediction,
  computed: Computed,
  today: CalendarDate,
): CyclePrediction {
  const lengths = plausibleCycleLengths(computed.starts);
  const expected = computed.prediction?.nextPeriodStart ?? null;
  const daysLate = expected === null ? null : Math.max(0, diffDays(expected, today));
  return {
    ...body,
    irregular: computed.prediction?.irregular ?? false,
    periodsLogged: computed.starts.length,
    cycleLengthRange:
      lengths.length === 0 ? null : { min: Math.min(...lengths), max: Math.max(...lengths) },
    daysLate,
    pointToCare: daysLate !== null && daysLate > LATE_DAYS_TO_CARE,
  };
}

/* ------------------------------------------------------------------------ */
/* Cursors and headers                                                       */
/* ------------------------------------------------------------------------ */

const CursorFacts = z.object({ d: z.iso.date(), i: z.uuid() });

function encodeCursor(date: CalendarDate, id: string): string {
  return Buffer.from(JSON.stringify({ d: date, i: id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { date: CalendarDate; id: string } | null {
  try {
    const parsed = CursorFacts.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    return parsed.success ? { date: parsed.data.d, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}

const IF_MATCH = /^(?:W\/)?"?(\d{1,9})"?$/;

/** The version `If-Match` names: a bare integer or an entity tag around one. */
function versionIn(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  const match = IF_MATCH.exec(header.trim());
  return match === null ? undefined : Number(match[1]);
}

function etag(version: number): string {
  return `"${version}"`;
}

/* ------------------------------------------------------------------------ */
/* Route definitions                                                         */
/* ------------------------------------------------------------------------ */

const SubjectQuery = z
  .uuid()
  .optional()
  .describe("Whose records: the actor's own when absent, else a subject she holds a grant for");

const DateParam = z.object({
  date: z.iso.date().openapi({
    param: { name: "date", in: "path" },
    description: "The calendar day in the subject's time zone",
    example: "2026-10-05",
  }),
});

const IfMatchHeader = z.object({
  "if-match": z
    .string()
    .regex(IF_MATCH, "Expected the entry's version")
    .optional()
    .describe("The version last read; a different stored version answers 409"),
});

const problemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

const TAG = "cycle";

export const listEntriesRoute = createRoute({
  method: "get",
  path: "/v1/cycle/entries",
  tags: [TAG],
  summary: "Day entries by date range",
  description:
    "The subject's day entries, oldest first, projected to the categories the actor holds: dates and flow under cycle.history, symptoms and mood under cycle.symptoms. With updatedSince the list is a sync feed and carries tombstones.",
  middleware: [requireActor] as const,
  request: {
    query: z.object({
      subject: SubjectQuery,
      from: z.iso.date().optional().describe("First day, inclusive"),
      to: z.iso.date().optional().describe("Last day, inclusive"),
      updatedSince: z.iso
        .datetime()
        .optional()
        .describe("Only entries changed after this instant, tombstones included"),
      cursor: z.string().max(200).optional().describe("The nextCursor of the previous page"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  },
  responses: {
    200: { description: "The page", content: { "application/json": { schema: CycleEntryList } } },
    401: problemResponse("No session"),
    404: problemResponse("No such subject for this actor"),
    422: problemResponse("A filter is malformed"),
  },
});

export const putEntryRoute = createRoute({
  method: "put",
  path: "/v1/cycle/entries/{date}",
  tags: [TAG],
  summary: "Write one day",
  description:
    "Creates or replaces the day's flow, symptoms and mood in every category the actor may write; a field left out is cleared there. The subject is the actor unless a subject she may contribute to is given. The prediction is recomputed in the same transaction.",
  middleware: [requireActor] as const,
  request: {
    params: DateParam,
    query: z.object({ subject: SubjectQuery }),
    headers: IfMatchHeader,
    body: {
      required: true,
      content: { "application/json": { schema: CycleEntryWrite } },
    },
  },
  responses: {
    200: {
      description: "The day as the actor may see it",
      headers: z.object({ ETag: z.string().describe("The new version, quoted") }),
      content: { "application/json": { schema: CycleEntry } },
    },
    401: problemResponse("No session"),
    404: problemResponse("No such subject for this actor, or a field she may not write"),
    409: problemResponse("If-Match named another version"),
    422: problemResponse("The body or the date is malformed"),
  },
});

export const deleteEntryRoute = createRoute({
  method: "delete",
  path: "/v1/cycle/entries/{date}",
  tags: [TAG],
  summary: "Delete one day",
  description:
    "Writes a content-free tombstone for the day and removes its symptoms; the subject herself only. The prediction is recomputed in the same transaction.",
  middleware: [requireActor] as const,
  request: {
    params: DateParam,
    query: z.object({ subject: SubjectQuery }),
    headers: IfMatchHeader,
  },
  responses: {
    204: { description: "Deleted" },
    401: problemResponse("No session"),
    404: problemResponse("No live entry on that day for this actor"),
    409: problemResponse("If-Match named another version"),
    422: problemResponse("The date is malformed"),
  },
});

export const predictionsRoute = createRoute({
  method: "get",
  path: "/v1/cycle/predictions",
  tags: [TAG],
  summary: "The cycle prediction",
  description:
    "Computed through core from the subject's logged period starts and kept in cycle_predictions: the next period as a band, ovulation as a band, the fertile window, the basis and the counts the copy templates need. The words are the client's. Under cycle.history.",
  middleware: [requireActor] as const,
  request: { query: z.object({ subject: SubjectQuery }) },
  responses: {
    200: {
      description: "The prediction",
      content: { "application/json": { schema: CyclePrediction } },
    },
    401: problemResponse("No session"),
    404: problemResponse("No such subject for this actor"),
    422: problemResponse("The subject is malformed"),
  },
});

export const statusRoute = createRoute({
  method: "get",
  path: "/v1/cycle/status",
  tags: [TAG],
  summary: "The derived status for today",
  description:
    "Day of the cycle, day of the period while bleeding, and whether today is in the fertile window: what a partner with cycle.status sees. Derived on read, never stored, never the entries.",
  middleware: [requireActor] as const,
  request: { query: z.object({ subject: SubjectQuery }) },
  responses: {
    200: { description: "The status", content: { "application/json": { schema: CycleStatus } } },
    401: problemResponse("No session"),
    404: problemResponse("No such subject for this actor"),
    422: problemResponse("The subject is malformed"),
  },
});

export const vocabularyRoute = createRoute({
  method: "get",
  path: "/v1/cycle/vocabulary",
  tags: [TAG],
  summary: "The flow, symptom and mood lists",
  description: "The pickers' codes with their labels, in display order. The same for every actor.",
  middleware: [requireActor] as const,
  responses: {
    200: {
      description: "The lists",
      content: { "application/json": { schema: CycleVocabulary } },
    },
    401: problemResponse("No session"),
  },
});

/* ------------------------------------------------------------------------ */
/* Handlers                                                                  */
/* ------------------------------------------------------------------------ */

async function symptomsByEntry(
  tx: Transaction,
  entryIds: readonly string[],
): Promise<Map<string, SymptomCode[]>> {
  const byEntry = new Map<string, SymptomCode[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await tx
    .select({ entryId: schema.entrySymptoms.entryId, code: schema.entrySymptoms.code })
    .from(schema.entrySymptoms)
    .where(
      and(
        inArray(schema.entrySymptoms.entryId, [...entryIds]),
        isNull(schema.entrySymptoms.deletedAt),
      ),
    );
  for (const row of rows) {
    const list = byEntry.get(row.entryId) ?? [];
    list.push(row.code);
    byEntry.set(row.entryId, list);
  }
  return byEntry;
}

export function registerCycle(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(vocabularyRoute, (c) => c.json(cycleVocabulary(), 200));

  app.openapi(listEntriesRoute, async (c) => {
    const actor = actorOf(c);
    const query = c.req.valid("query");
    const subjectId = query.subject ?? actor.id;
    if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
      return fail(c, 422, "validation_failed", {
        errors: [{ path: "to", message: "Must not be before from." }],
      });
    }
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      return fail(c, 422, "validation_failed", {
        errors: [{ path: "cursor", message: "Not a cursor from this list." }],
      });
    }
    const access = cycleAccess(actor, subjectId, "read");
    if (access === null) return fail(c, 404, "not_found");

    const limit = query.limit;
    const page = await withActor(
      actor.id,
      async (tx) => {
        if (access.reason === "grant")
          await auditPartnerRead(tx, actor, subjectId, access.categories);
        const entries = schema.cycleEntries;
        const conditions = [eq(entries.subjectId, subjectId)];
        if (query.updatedSince === undefined) conditions.push(isNull(entries.deletedAt));
        else conditions.push(gt(entries.updatedAt, new Date(query.updatedSince)));
        if (query.from !== undefined) conditions.push(gte(entries.date, query.from));
        if (query.to !== undefined) conditions.push(lte(entries.date, query.to));
        if (after !== null) {
          conditions.push(
            or(
              gt(entries.date, after.date),
              and(eq(entries.date, after.date), gt(entries.id, after.id)),
            )!,
          );
        }
        const rows = await tx
          .select()
          .from(entries)
          .where(and(...conditions))
          .orderBy(asc(entries.date), asc(entries.id))
          .limit(limit + 1);
        const shown = rows.slice(0, limit);
        const symptoms =
          access.reason === "owner" || access.categories.includes("cycle.symptoms")
            ? await symptomsByEntry(
                tx,
                shown.filter((row) => row.deletedAt === null).map((row) => row.id),
              )
            : new Map<string, SymptomCode[]>();
        const items = shown.map((row) => entryItem(row, symptoms.get(row.id) ?? [], access));
        const last = shown.at(-1);
        const nextCursor =
          rows.length > limit && last !== undefined ? encodeCursor(last.date, last.id) : null;
        return { items, nextCursor };
      },
      runtime.db,
    );
    return c.json(page, 200);
  });

  app.openapi(putEntryRoute, async (c) => {
    const actor = actorOf(c);
    const { date } = c.req.valid("param");
    const query = c.req.valid("query");
    const headers = c.req.valid("header");
    const body = c.req.valid("json");
    const subjectId = query.subject ?? actor.id;
    const expectedVersion = versionIn(headers["if-match"]);

    const access = cycleAccess(actor, subjectId, "write");
    if (access === null) return fail(c, 404, "not_found");
    const writesHistory = access.categories.includes("cycle.history");
    const writesSymptoms = access.categories.includes("cycle.symptoms");
    // A field in a category the actor may not write is denied like the resource itself.
    if (
      ("flow" in body && !writesHistory) ||
      (("symptoms" in body || "mood" in body) && !writesSymptoms)
    ) {
      return fail(c, 404, "not_found");
    }

    const outcome = await withActor(
      actor.id,
      async (tx): Promise<{ kind: "stale" } | { kind: "written"; item: CycleEntry }> => {
        const entries = schema.cycleEntries;
        const [existing] = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.subjectId, subjectId), eq(entries.date, date)))
          .limit(1);
        if (
          expectedVersion !== undefined &&
          (existing === undefined || existing.version !== expectedVersion)
        ) {
          return { kind: "stale" };
        }
        const now = new Date();
        const flow = writesHistory
          ? (body.flow ?? null)
          : existing === undefined || existing.deletedAt !== null
            ? null
            : existing.flow;
        const mood = writesSymptoms
          ? (body.mood ?? null)
          : existing === undefined || existing.deletedAt !== null
            ? null
            : existing.mood;
        let row: EntryRow;
        if (existing === undefined) {
          row = {
            id: uuidv7(),
            subjectId,
            date,
            flow,
            mood,
            createdAt: now,
            updatedAt: now,
            version: 1,
            deletedAt: null,
          };
          await tx.insert(entries).values(row);
        } else {
          const next = {
            flow,
            mood,
            updatedAt: now,
            version: existing.version + 1,
            deletedAt: null,
          };
          await tx.update(entries).set(next).where(eq(entries.id, existing.id));
          row = { ...existing, ...next };
        }

        let symptoms: SymptomCode[] = [];
        if (writesSymptoms) {
          symptoms = body.symptoms ?? [];
          await tx.delete(schema.entrySymptoms).where(eq(schema.entrySymptoms.entryId, row.id));
          if (symptoms.length > 0) {
            await tx.insert(schema.entrySymptoms).values(
              symptoms.map((code) => ({
                id: uuidv7(),
                entryId: row.id,
                subjectId,
                code,
                createdAt: now,
                updatedAt: now,
              })),
            );
          }
        } else if (existing !== undefined && existing.deletedAt === null) {
          symptoms = (await symptomsByEntry(tx, [row.id])).get(row.id) ?? [];
        }

        if (access.reason === "grant") {
          for (const category of access.categories) {
            await audit(tx, {
              actorId: actor.id,
              action: auditActions.partnerWrite,
              subjectId,
              category,
              occurredAt: now,
            });
          }
        }
        if (writesHistory && access.reason === "owner") {
          const computed = await computePrediction(tx, subjectId);
          await storePrediction(tx, subjectId, computed.prediction, now);
        }
        return { kind: "written", item: entryItem(row, symptoms, access) };
      },
      runtime.db,
    );
    if (outcome.kind === "stale") {
      return fail(c, 409, "conflict", { detail: VERSION_MISMATCH });
    }
    if (writesHistory && access.reason === "grant") await refreshAsSubject(subjectId, new Date());
    return c.json(outcome.item, 200, { ETag: etag(outcome.item.version) });
  });

  app.openapi(deleteEntryRoute, async (c) => {
    const actor = actorOf(c);
    const { date } = c.req.valid("param");
    const query = c.req.valid("query");
    const headers = c.req.valid("header");
    const subjectId = query.subject ?? actor.id;
    const expectedVersion = versionIn(headers["if-match"]);
    if (!can(actor, "delete", { subjectId, category: "cycle.history" }).allowed) {
      return fail(c, 404, "not_found");
    }
    const outcome = await withActor(
      actor.id,
      async (tx): Promise<"missing" | "stale" | "deleted"> => {
        const entries = schema.cycleEntries;
        const [existing] = await tx
          .select()
          .from(entries)
          .where(
            and(
              eq(entries.subjectId, subjectId),
              eq(entries.date, date),
              isNull(entries.deletedAt),
            ),
          )
          .limit(1);
        if (existing === undefined) return "missing";
        if (expectedVersion !== undefined && existing.version !== expectedVersion) return "stale";
        const now = new Date();
        await tx.delete(schema.entrySymptoms).where(eq(schema.entrySymptoms.entryId, existing.id));
        await tx
          .update(entries)
          .set({
            flow: null,
            mood: null,
            deletedAt: now,
            updatedAt: now,
            version: existing.version + 1,
          })
          .where(eq(entries.id, existing.id));
        const computed = await computePrediction(tx, subjectId);
        await storePrediction(tx, subjectId, computed.prediction, now);
        return "deleted";
      },
      runtime.db,
    );
    if (outcome === "missing") return fail(c, 404, "not_found");
    if (outcome === "stale") return fail(c, 409, "conflict", { detail: VERSION_MISMATCH });
    return c.body(null, 204);
  });

  app.openapi(predictionsRoute, async (c) => {
    const actor = actorOf(c);
    const query = c.req.valid("query");
    const subjectId = query.subject ?? actor.id;
    const decision = can(actor, "summary", { subjectId, category: "cycle.history" });
    if (!decision.allowed || decision.reason === "denied") return fail(c, 404, "not_found");

    const now = new Date();
    if (decision.reason !== "owner") {
      await withActor(
        actor.id,
        (tx) => auditPartnerRead(tx, actor, subjectId, ["cycle.history"]),
        runtime.db,
      );
      // The shared part only: the owner's extras never reach a grantee.
      const computed = await refreshAsSubject(subjectId, now);
      return c.json(predictionBody(subjectId, now, factsOf(computed.prediction)), 200);
    }
    const body = await withActor(
      actor.id,
      async (tx): Promise<CyclePrediction> => {
        const computed = await computePrediction(tx, subjectId);
        await storePrediction(tx, subjectId, computed.prediction, now);
        const today = todayIn(actor.profile?.timeZone ?? DEFAULT_TIME_ZONE, now);
        return ownerExtras(
          predictionBody(subjectId, now, factsOf(computed.prediction)),
          computed,
          today,
        );
      },
      runtime.db,
    );
    return c.json(body, 200);
  });

  app.openapi(statusRoute, async (c) => {
    const actor = actorOf(c);
    const query = c.req.valid("query");
    const subjectId = query.subject ?? actor.id;
    const decision = can(actor, "summary", { subjectId, category: "cycle.status" });
    if (!decision.allowed || decision.reason === "denied") return fail(c, 404, "not_found");

    if (decision.reason !== "owner") {
      await withActor(
        actor.id,
        (tx) => auditPartnerRead(tx, actor, subjectId, ["cycle.status"]),
        runtime.db,
      );
    }
    // cycle.status is derived from rows the B8 policies file under
    // cycle.history and cycle.symptoms, which a status grant does not reach.
    // After can() has approved the status, the few facts it needs are read as
    // the subject and only the derived numbers leave this transaction.
    const status = await withActor(
      subjectId,
      async (tx): Promise<CycleStatus> => {
        const timeZone = await subjectTimeZone(
          tx,
          subjectId,
          actor.profile?.timeZone ?? DEFAULT_TIME_ZONE,
        );
        const today = todayIn(timeZone);
        const starts = (await periodStartsFor(tx, subjectId)).filter(
          (start) => compareDates(start.date, today) <= 0,
        );
        const latest = starts.at(-1) ?? null;
        const [todayRow] = await tx
          .select({ flow: schema.cycleEntries.flow })
          .from(schema.cycleEntries)
          .where(
            and(
              eq(schema.cycleEntries.subjectId, subjectId),
              eq(schema.cycleEntries.date, today),
              isNull(schema.cycleEntries.deletedAt),
              isNotNull(schema.cycleEntries.flow),
            ),
          )
          .limit(1);
        const bleedingToday = isPeriodFlow(todayRow?.flow ?? null);
        const computed = await computePrediction(tx, subjectId);
        const window = computed.prediction?.fertileWindow ?? null;
        return {
          subjectId,
          date: today,
          cycleDay: latest === null ? null : cycleDay(latest.date, today),
          periodDay: latest === null || !bleedingToday ? null : diffDays(latest.date, today) + 1,
          inFertileWindow:
            window !== null &&
            compareDates(window.start, today) <= 0 &&
            compareDates(today, window.end) <= 0,
        };
      },
      runtime.db,
    );
    return c.json(status, 200);
  });
}
