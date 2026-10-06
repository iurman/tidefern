import { createHash } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { and, asc, count, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { can, listScope, stageAfter } from "@tidefern/core";
import type { Category, Pregnancy, Stage } from "@tidefern/core";
import { isActorId, schema, withActor } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { enqueue, jobId as uuidv7 } from "@tidefern/db/jobs";
import {
  ConsentInput,
  ConsentList,
  ConsentRecord,
  ConsentWithdrawal,
  DataSummary,
  Id,
  Problem,
  Profile,
  ProfileInput,
} from "@tidefern/schemas";
import type { Consent, DataCategory, Processor } from "@tidefern/schemas";

import { requireActor, requireFreshAuth } from "../auth";
import type { ApiEnv } from "../context";
import { problem } from "../problem";

/**
 * Task E2: the profile, the collection consent and the data summary
 * (architecture record 6.1, 7.4, 11 and 12.2). Every route here is about
 * the signed-in person herself: the subject is the actor the session
 * resolved, never an id from the client, and every query runs inside her
 * `withActor()` transaction so row level security decides underneath. The
 * one resource a guardian can reach, a child's consent, goes through
 * `can()` before anything is read from it.
 */

/** The seven day undo window of a closure (architecture record 7.3 and 11). */
export const CLOSURE_UNDO_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** The 45 day clock a data request runs on (architecture record 11). */
export const DATA_REQUEST_DEADLINE_MS = 45 * 24 * 60 * 60_000;

/** The job type I1 defines for the closure; I2 adds its handler. */
export const CLOSURE_JOB_TYPE = "account.delete";

/** The `detail` values of the problems this module answers. */
export const IF_MATCH_REQUIRED = "if_match_required";
export const IF_MATCH_INVALID = "if_match_invalid";
export const STALE_VERSION = "stale_version";
export const AGE_ATTESTATION_REQUIRED = "age_attestation_required";
/** An active record decides the stage; the record's own route ends it. */
export const STAGE_LOCKED_BY_RECORD = "stage_locked_by_record";
/** This stage follows a record started through its own route. */
export const STAGE_NEEDS_RECORD = "stage_needs_record";
export const CONSENT_ALREADY_WITHDRAWN = "consent_already_withdrawn";
/** A child's consent is withdrawn with the child's records, through the child's closure path. */
export const CHILD_CONSENT_NOT_WITHDRAWN_HERE = "child_consent_not_withdrawn_here";
export const CURSOR_INVALID = "cursor_invalid";

/**
 * The processors of architecture record 9.5 as the data summary lists them
 * (architecture record 11: every processor with its contact). The contact
 * is the online mechanism each vendor publishes for data processing
 * matters, as recorded in docs/research/RESEARCH.md and
 * docs/LAUNCH_RUNBOOK.md; the owner confirms the list before launch.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Vercel",
    receives:
      "Runs the application and handles data in memory while serving requests; holds the allowlisted request logs and the secrets",
    contact: "https://vercel.com/legal/dpa",
  },
  {
    name: "Neon (Databricks, Inc.)",
    receives: "Hosts the database; free text is stored encrypted",
    contact: "https://www.databricks.com/legal/dpa",
  },
  {
    name: "GitHub",
    receives: "Source code and CI logs; no personal data",
    contact: "https://github.com/customer-terms/github-data-protection-agreement",
  },
  {
    name: "Resend",
    receives: "Email addresses and generic subjects and bodies",
    contact: "https://resend.com/legal/dpa",
  },
  {
    name: "Cloudflare",
    receives: "DNS queries; no personal data in Phase 1",
    contact: "https://www.cloudflare.com/cloudflare-customer-dpa/",
  },
];

const problemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

/**
 * Every `/v1` route can answer the middleware's problems (a missing key,
 * a cross-site origin, the rate limit) and the error handler's 500, so the
 * two ranges are declared beside the route's own codes.
 */
const commonProblems = {
  401: problemResponse("No session, or no fresh authentication where the route needs one"),
  "4XX": problemResponse("A refused request (RFC 9457 problem details)"),
  "5XX": problemResponse("Something went wrong (RFC 9457 problem details)"),
};

const ifMatchHeader = z.object({
  "if-match": z
    .string()
    .optional()
    .openapi({ description: "The profile version last read; required on an update" }),
});

const idempotencyHeader = z.object({
  "idempotency-key": z.uuid().openapi({ description: "A UUID the client mints per attempt" }),
});

const consentListQuery = z.object({
  cursor: z
    .string()
    .max(200)
    .optional()
    .openapi({ description: "The `nextCursor` of the previous page" }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const getProfileRoute = createRoute({
  method: "get",
  path: "/v1/me/profile",
  tags: ["profile"],
  summary: "The signed-in person's profile",
  middleware: [requireActor] as const,
  responses: {
    200: {
      description: "The profile",
      headers: z.object({ etag: z.string().openapi({ description: "The version, quoted" }) }),
      content: { "application/json": { schema: Profile } },
    },
    404: problemResponse("No profile yet; onboarding creates it with PUT"),
    ...commonProblems,
  },
});

export const putProfileRoute = createRoute({
  method: "put",
  path: "/v1/me/profile",
  tags: ["profile"],
  summary: "Create or replace the signed-in person's profile",
  description:
    "The whole profile each time. The first PUT creates it and must carry the age attestation; a later PUT replaces it and must carry If-Match with the version last read. A stage that contradicts an active record is refused with 422.",
  middleware: [requireActor] as const,
  request: {
    headers: ifMatchHeader,
    body: {
      required: true,
      content: { "application/json": { schema: ProfileInput } },
    },
  },
  responses: {
    200: {
      description: "The profile was replaced",
      headers: z.object({ etag: z.string().openapi({ description: "The new version, quoted" }) }),
      content: { "application/json": { schema: Profile } },
    },
    201: {
      description: "The profile was created",
      headers: z.object({ etag: z.string().openapi({ description: "The version, quoted" }) }),
      content: { "application/json": { schema: Profile } },
    },
    409: problemResponse("If-Match names a version that is no longer current"),
    422: problemResponse("Validation failed, or the stage change is one the domain forbids"),
    ...commonProblems,
  },
});

export const createConsentRoute = createRoute({
  method: "post",
  path: "/v1/me/consents",
  tags: ["profile"],
  summary: "Record the collection consent as the page showed it",
  description:
    "One row per category, each bound to a SHA-256 of the whole disclosure (categories, purposes, processors, text version, terms version). A consent is immutable; a new disclosure is a new record.",
  middleware: [requireActor] as const,
  request: {
    headers: idempotencyHeader,
    body: {
      required: true,
      content: { "application/json": { schema: ConsentInput } },
    },
  },
  responses: {
    201: {
      description: "The consent rows written",
      content: { "application/json": { schema: ConsentRecord } },
    },
    422: problemResponse("Validation failed"),
    ...commonProblems,
  },
});

export const listConsentsRoute = createRoute({
  method: "get",
  path: "/v1/me/consents",
  tags: ["profile"],
  summary: "The consents the signed-in person gave, her own and those for children she guards",
  middleware: [requireActor] as const,
  request: { query: consentListQuery },
  responses: {
    200: {
      description: "A page of consents, oldest first",
      content: { "application/json": { schema: ConsentList } },
    },
    422: problemResponse("Validation failed"),
    ...commonProblems,
  },
});

export const withdrawConsentRoute = createRoute({
  method: "post",
  path: "/v1/me/consents/{id}/withdraw",
  tags: ["profile"],
  summary: "Withdraw the collection consent and start account closure",
  description:
    "Needs fresh authentication. Every active consent of the person is withdrawn at one instant, a closure request with a seven day undo window is written and the closure job is queued for the end of that window. A child's consent is withdrawn with the child's records through the child's closure path, not here.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: {
    params: z.object({ id: Id }),
    headers: idempotencyHeader,
  },
  responses: {
    200: {
      description: "Withdrawn; the closure that follows",
      content: { "application/json": { schema: ConsentWithdrawal } },
    },
    404: problemResponse("No such consent for this person"),
    409: problemResponse("Already withdrawn"),
    422: problemResponse("A child's consent is not withdrawn here"),
    ...commonProblems,
  },
});

export const dataSummaryRoute = createRoute({
  method: "get",
  path: "/v1/me/data-summary",
  tags: ["profile"],
  summary: "What is held: categories with counts, processors with contacts, people with grants",
  middleware: [requireActor] as const,
  responses: {
    200: {
      description: "The summary; the export carries the data itself",
      content: { "application/json": { schema: DataSummary } },
    },
    ...commonProblems,
  },
});

type ProfileRow = typeof schema.profiles.$inferSelect;
type ConsentRow = typeof schema.consents.$inferSelect;
type ActivePregnancyRow = Pick<
  typeof schema.pregnancies.$inferSelect,
  "id" | "subjectId" | "dueDate" | "datingMethod" | "startedAt"
>;

/** The actor the route middleware guaranteed. */
function actorOf(c: Context<ApiEnv>) {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before the profile handlers");
  return actor;
}

/**
 * The database the routes open the actor's transaction on: the one the
 * host or a test bound as `db` on the Hono environment, or the db package's
 * production client when nothing is bound, which is the handle the Next.js
 * host passes to `createApp` as well.
 */
export function databaseFor(c: Context<ApiEnv>): ActorDatabase | undefined {
  const bindings = c.env as unknown as { db?: ActorDatabase } | undefined;
  return bindings?.db;
}

function profileBody(row: ProfileRow): Profile {
  return {
    displayName: row.displayName,
    timeZone: row.timeZone,
    stage: row.stage,
    weekStart: row.weekStart,
    units: row.units,
    notificationDetail: row.notificationDetail,
    ageAttestedAt: row.ageAttestedAt.toISOString(),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function consentBody(row: ConsentRow): Consent {
  return {
    id: row.id,
    subjectId: row.subjectId,
    consentingGuardianId: row.consentingGuardianId,
    category: row.category,
    basis: row.basis,
    purpose: row.purpose,
    textVersion: row.policyVersion,
    textHash: row.textHash,
    grantedAt: row.grantedAt.toISOString(),
    withdrawnAt: row.withdrawnAt === null ? null : row.withdrawnAt.toISOString(),
  };
}

/**
 * The version an `If-Match` header names: a positive integer, optionally
 * quoted as the `ETag` the profile responses carry, with or without the
 * weak marker. `null` for anything else.
 */
export function parseIfMatch(raw: string): number | null {
  const bare = raw
    .trim()
    .replace(/^W\//i, "")
    .replace(/^"(.*)"$/, "$1");
  return /^[1-9]\d{0,8}$/.test(bare) ? Number(bare) : null;
}

/**
 * SHA-256 of the disclosure the page showed, in a canonical order so the
 * same disclosure hashes the same whatever order a client lists it in.
 */
export function disclosureHash(input: ConsentInput): string {
  const canonical = JSON.stringify({
    categories: [...input.categories]
      .sort((a, b) => a.category.localeCompare(b.category))
      .map(({ category, basis, purpose }) => ({ category, basis, purpose })),
    processors: [...input.processors].sort(),
    textVersion: input.textVersion,
    termsVersion: input.termsVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return isActorId(id) ? id.toLowerCase() : null;
}

function asCorePregnancy(row: ActivePregnancyRow): Pregnancy {
  return {
    id: row.id,
    subjectId: row.subjectId,
    dueDate: row.dueDate,
    datingMethod: row.datingMethod,
    startedAt: row.startedAt.toISOString(),
    endedAt: null,
    endedReason: null,
    dueDateChanges: [],
  };
}

interface StageRefusal {
  detail: string;
  message: string;
}

/**
 * The stage changes the domain forbids (core's stages.ts): while a record
 * is active the stage is whatever `stageAfter` says and only the record's
 * own route changes it; the `pregnancy` stage is entered only by starting
 * that record through its own route. The first choice at onboarding is not
 * a change, so `current` is null then and only the first rule applies.
 */
export function stageChangeRefusal(
  current: Stage | null,
  next: Stage,
  active: ActivePregnancyRow | undefined,
): StageRefusal | null {
  if (active !== undefined) {
    const required = stageAfter(asCorePregnancy(active));
    if (next !== required) {
      return {
        detail: STAGE_LOCKED_BY_RECORD,
        message: "An active record decides this stage; end it through its own route first.",
      };
    }
    return null;
  }
  if (current !== null && current !== "pregnancy" && next === "pregnancy") {
    return {
      detail: STAGE_NEEDS_RECORD,
      message: "This stage follows a record started through its own route.",
    };
  }
  return null;
}

async function activePregnancyFor(
  tx: Transaction,
  subjectId: string,
): Promise<ActivePregnancyRow | undefined> {
  const [row] = await tx
    .select({
      id: schema.pregnancies.id,
      subjectId: schema.pregnancies.subjectId,
      dueDate: schema.pregnancies.dueDate,
      datingMethod: schema.pregnancies.datingMethod,
      startedAt: schema.pregnancies.startedAt,
    })
    .from(schema.pregnancies)
    .where(
      and(
        eq(schema.pregnancies.subjectId, subjectId),
        isNull(schema.pregnancies.endedAt),
        isNull(schema.pregnancies.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

type PutOutcome =
  | { kind: "created"; row: ProfileRow }
  | { kind: "updated"; row: ProfileRow }
  | { kind: "stale" }
  | { kind: "refused"; detail: string; path: string; message: string };

async function putProfile(
  tx: Transaction,
  actorId: string,
  input: ProfileInput,
  ifMatch: number | null | undefined,
  now: Date,
): Promise<PutOutcome> {
  const [existing] = await tx
    .select()
    .from(schema.profiles)
    .where(and(eq(schema.profiles.userId, actorId), isNull(schema.profiles.deletedAt)))
    .limit(1);
  const active = await activePregnancyFor(tx, actorId);
  const fields = {
    displayName: input.displayName,
    timeZone: input.timeZone,
    stage: input.stage,
    weekStart: input.weekStart,
    units: input.units,
    notificationDetail: input.notificationDetail,
  };

  if (existing === undefined) {
    if (input.ageAttested !== true) {
      return {
        kind: "refused",
        detail: AGE_ATTESTATION_REQUIRED,
        path: "ageAttested",
        message: "Creating the profile needs the attestation of being 18 or older.",
      };
    }
    const refusal = stageChangeRefusal(null, input.stage, active);
    if (refusal !== null) {
      return { kind: "refused", detail: refusal.detail, path: "stage", message: refusal.message };
    }
    const [row] = await tx
      .insert(schema.profiles)
      .values({
        userId: actorId,
        ...fields,
        ageAttestedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
      .returning();
    if (row === undefined) throw new Error("the profile insert returned no row");
    return { kind: "created", row };
  }

  if (ifMatch === undefined) {
    return {
      kind: "refused",
      detail: IF_MATCH_REQUIRED,
      path: "If-Match",
      message: "Replacing the profile needs If-Match with the version last read.",
    };
  }
  if (ifMatch === null) {
    return {
      kind: "refused",
      detail: IF_MATCH_INVALID,
      path: "If-Match",
      message: "If-Match must be the version, optionally quoted.",
    };
  }
  if (ifMatch !== existing.version) return { kind: "stale" };
  const refusal = stageChangeRefusal(existing.stage, input.stage, active);
  if (refusal !== null) {
    return { kind: "refused", detail: refusal.detail, path: "stage", message: refusal.message };
  }
  const [row] = await tx
    .update(schema.profiles)
    .set({ ...fields, updatedAt: now, version: existing.version + 1 })
    .where(and(eq(schema.profiles.userId, actorId), eq(schema.profiles.version, existing.version)))
    .returning();
  // The version guard in the WHERE lost a race with another writer.
  if (row === undefined) return { kind: "stale" };
  return { kind: "updated", row };
}

type WithdrawOutcome =
  | { kind: "withdrawn"; body: ConsentWithdrawal; jobId: string | null }
  | { kind: "missing" }
  | { kind: "already" }
  | { kind: "child" };

/**
 * The closure a withdrawal starts (architecture record 11): one open
 * closure request per person, with the undo window and the 45 day clock,
 * and the deletion job queued for the end of the window. A withdrawal
 * while a closure is already open reuses it rather than queueing a second
 * job.
 */
async function startClosure(
  tx: Transaction,
  actorId: string,
  now: Date,
): Promise<{
  requestId: string;
  state: "requested" | "in_progress";
  undoUntil: Date;
  jobId: string | null;
}> {
  const [open] = await tx
    .select({
      id: schema.dataRequests.id,
      state: schema.dataRequests.state,
      undoUntil: schema.dataRequests.undoUntil,
    })
    .from(schema.dataRequests)
    .where(
      and(
        eq(schema.dataRequests.userId, actorId),
        eq(schema.dataRequests.kind, "closure"),
        inArray(schema.dataRequests.state, ["requested", "in_progress"]),
      ),
    )
    .orderBy(asc(schema.dataRequests.id))
    .limit(1);
  if (open !== undefined && (open.state === "requested" || open.state === "in_progress")) {
    return {
      requestId: open.id,
      state: open.state,
      undoUntil: open.undoUntil ?? now,
      jobId: null,
    };
  }
  const requestId = uuidv7();
  const undoUntil = new Date(now.getTime() + CLOSURE_UNDO_WINDOW_MS);
  await tx.insert(schema.dataRequests).values({
    id: requestId,
    userId: actorId,
    kind: "closure",
    state: "requested",
    requestedAt: now,
    deadlineAt: new Date(now.getTime() + DATA_REQUEST_DEADLINE_MS),
    undoUntil,
    createdAt: now,
    updatedAt: now,
  });
  const jobId = await enqueue(
    tx,
    CLOSURE_JOB_TYPE,
    { userId: actorId, requestId },
    { runAfter: undoUntil },
  );
  return { requestId, state: "requested", undoUntil, jobId };
}

async function withdrawConsent(
  tx: Transaction,
  actor: ReturnType<typeof actorOf>,
  consentId: string,
  now: Date,
): Promise<WithdrawOutcome> {
  const [row] = await tx
    .select()
    .from(schema.consents)
    .where(and(eq(schema.consents.id, consentId), isNull(schema.consents.deletedAt)))
    .limit(1);
  if (row === undefined) return { kind: "missing" };
  // A child's consent names the child as subject and the guardian who gave it.
  const resource =
    row.consentingGuardianId === null
      ? { subjectId: row.subjectId, category: row.category as Category }
      : { subjectId: row.subjectId, category: row.category as Category, childId: row.subjectId };
  const decision = can(actor, "delete", resource);
  if (!decision.allowed) return { kind: "missing" };
  if (decision.reason === "guardian") return { kind: "child" };
  if (row.withdrawnAt !== null) return { kind: "already" };

  await tx
    .update(schema.consents)
    .set({ withdrawnAt: now, updatedAt: now, version: row.version + 1 })
    .where(
      and(
        eq(schema.consents.subjectId, actor.id),
        isNull(schema.consents.withdrawnAt),
        isNull(schema.consents.deletedAt),
      ),
    );
  const closure = await startClosure(tx, actor.id, now);
  return {
    kind: "withdrawn",
    jobId: closure.jobId,
    body: {
      id: row.id,
      withdrawnAt: now.toISOString(),
      closure: {
        requestId: closure.requestId,
        state: closure.state,
        undoUntil: closure.undoUntil.toISOString(),
      },
    },
  };
}

type CountedTable = {
  category: DataCategory;
  count: (tx: Transaction, actorId: string) => Promise<number>;
};

async function countRows(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}

/**
 * The person's own rows per category, from every table the storage map
 * (architecture record 8.2) files there. `cycle.status` is derived on read
 * and has no rows. Child tables are counted per guarded child below.
 */
const OWN_TABLES: readonly CountedTable[] = [
  {
    category: "cycle.history",
    count: async (tx, actorId) =>
      (await countRows(
        tx
          .select({ n: count() })
          .from(schema.cycleEntries)
          .where(
            and(eq(schema.cycleEntries.subjectId, actorId), isNull(schema.cycleEntries.deletedAt)),
          ),
      )) +
      (await countRows(
        tx
          .select({ n: count() })
          .from(schema.cyclePredictions)
          .where(
            and(
              eq(schema.cyclePredictions.subjectId, actorId),
              isNull(schema.cyclePredictions.deletedAt),
            ),
          ),
      )),
  },
  {
    category: "cycle.symptoms",
    count: async (tx, actorId) =>
      (await countRows(
        tx
          .select({ n: count() })
          .from(schema.entrySymptoms)
          .where(
            and(
              eq(schema.entrySymptoms.subjectId, actorId),
              isNull(schema.entrySymptoms.deletedAt),
            ),
          ),
      )) + (await countNotes(tx, actorId, "cycle.symptoms")),
  },
  {
    category: "journal.private",
    count: (tx, actorId) => countNotes(tx, actorId, "journal.private"),
  },
  {
    category: "pregnancy.overview",
    count: async (tx, actorId) =>
      (await countRows(
        tx
          .select({ n: count() })
          .from(schema.pregnancies)
          .where(
            and(eq(schema.pregnancies.subjectId, actorId), isNull(schema.pregnancies.deletedAt)),
          ),
      )) +
      (await countRows(
        tx
          .select({ n: count() })
          .from(schema.pregnancyEvents)
          .where(
            and(
              eq(schema.pregnancyEvents.subjectId, actorId),
              isNull(schema.pregnancyEvents.deletedAt),
            ),
          ),
      )) +
      (await countNotes(tx, actorId, "pregnancy.overview")),
  },
  {
    category: "pregnancy.photos",
    count: (tx, actorId) =>
      countRows(
        tx
          .select({ n: count() })
          .from(schema.photos)
          .where(
            and(
              eq(schema.photos.subjectId, actorId),
              eq(schema.photos.category, "pregnancy.photos"),
              isNull(schema.photos.deletedAt),
            ),
          ),
      ),
  },
];

function countNotes(
  tx: Transaction,
  actorId: string,
  category: "journal.private" | "cycle.symptoms" | "pregnancy.overview",
): Promise<number> {
  return countRows(
    tx
      .select({ n: count() })
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.subjectId, actorId),
          eq(schema.notes.category, category),
          isNull(schema.notes.deletedAt),
        ),
      ),
  );
}

async function countChildRows(tx: Transaction, childIds: readonly string[]): Promise<number> {
  if (childIds.length === 0) return 0;
  const ids = [...childIds];
  const children = await countRows(
    tx
      .select({ n: count() })
      .from(schema.children)
      .where(and(inArray(schema.children.id, ids), isNull(schema.children.deletedAt))),
  );
  const events = await countRows(
    tx
      .select({ n: count() })
      .from(schema.childEvents)
      .where(and(inArray(schema.childEvents.childId, ids), isNull(schema.childEvents.deletedAt))),
  );
  const measurements = await countRows(
    tx
      .select({ n: count() })
      .from(schema.childMeasurements)
      .where(
        and(
          inArray(schema.childMeasurements.childId, ids),
          isNull(schema.childMeasurements.deletedAt),
        ),
      ),
  );
  const photos = await countRows(
    tx
      .select({ n: count() })
      .from(schema.photos)
      .where(
        and(
          inArray(schema.photos.childId, ids),
          eq(schema.photos.category, "child"),
          isNull(schema.photos.deletedAt),
        ),
      ),
  );
  return children + events + measurements + photos;
}

async function dataSummary(
  tx: Transaction,
  actor: ReturnType<typeof actorOf>,
): Promise<DataSummary> {
  // The subjects the policy lets this actor list as her own: herself with
  // every category, and each child she guards. Grants she holds reach
  // other people's data and are not "held about her", so they are skipped.
  const scopes = listScope(actor, "read");
  const own = scopes.find((scope) => scope.reason === "owner");
  const childIds = scopes
    .filter((scope) => scope.reason === "guardian")
    .map((scope) => scope.childId)
    .filter((childId): childId is string => childId !== undefined);

  const categories: DataSummary["categories"] = [{ category: "cycle.status", count: 0 }];
  for (const table of OWN_TABLES) {
    const n = own === undefined ? 0 : await table.count(tx, own.subjectId);
    categories.push({ category: table.category, count: n });
  }
  categories.push({ category: "child", count: await countChildRows(tx, childIds) });

  const given = await tx
    .select({
      id: schema.grants.id,
      granteeId: schema.grants.granteeId,
      category: schema.grants.category,
      level: schema.grants.level,
      childId: schema.grants.childId,
      createdAt: schema.grants.createdAt,
      displayName: schema.profiles.displayName,
    })
    .from(schema.grants)
    .leftJoin(
      schema.profiles,
      and(eq(schema.profiles.userId, schema.grants.granteeId), isNull(schema.profiles.deletedAt)),
    )
    .where(
      and(
        eq(schema.grants.ownerId, actor.id),
        isNull(schema.grants.revokedAt),
        isNull(schema.grants.deletedAt),
      ),
    )
    .orderBy(asc(schema.grants.createdAt), asc(schema.grants.id));

  const people = new Map<string, DataSummary["people"][number]>();
  for (const grant of given) {
    let person = people.get(grant.granteeId);
    if (person === undefined) {
      person = { personId: grant.granteeId, displayName: grant.displayName, grants: [] };
      people.set(grant.granteeId, person);
    }
    person.grants.push({
      id: grant.id,
      category: grant.category,
      level: grant.level,
      ...(grant.childId !== null ? { childId: grant.childId } : {}),
      createdAt: grant.createdAt.toISOString(),
    });
  }

  return { categories, processors: [...PROCESSORS], people: [...people.values()] };
}

/** Adds the profile, consent and data summary routes; called once from the registry. */
export function registerProfile(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(getProfileRoute, async (c) => {
    const actor = actorOf(c);
    const [row] = await withActor(
      actor.id,
      (tx) =>
        tx
          .select()
          .from(schema.profiles)
          .where(and(eq(schema.profiles.userId, actor.id), isNull(schema.profiles.deletedAt)))
          .limit(1),
      databaseFor(c),
    );
    if (row === undefined) return problem(c, 404, "not_found");
    c.header("ETag", `"${row.version}"`);
    return c.json(profileBody(row), 200);
  });

  app.openapi(putProfileRoute, async (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const rawIfMatch = c.req.header("if-match");
    const ifMatch = rawIfMatch === undefined ? undefined : parseIfMatch(rawIfMatch);
    const now = new Date();
    const outcome = await withActor(
      actor.id,
      (tx) => putProfile(tx, actor.id, input, ifMatch, now),
      databaseFor(c),
    );
    switch (outcome.kind) {
      case "created":
        c.header("ETag", `"${outcome.row.version}"`);
        return c.json(profileBody(outcome.row), 201);
      case "updated":
        c.header("ETag", `"${outcome.row.version}"`);
        return c.json(profileBody(outcome.row), 200);
      case "stale":
        return problem(c, 409, "conflict", { detail: STALE_VERSION });
      case "refused":
        return problem(c, 422, "validation_failed", {
          detail: outcome.detail,
          errors: [{ path: outcome.path, message: outcome.message }],
        });
    }
  });

  app.openapi(createConsentRoute, async (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const now = new Date();
    const textHash = disclosureHash(input);
    // The subject is the actor by construction (`/me`): no decision to make,
    // and B8's insert policy refuses any other subject underneath.
    const rows = await withActor(
      actor.id,
      (tx) =>
        tx
          .insert(schema.consents)
          .values(
            input.categories.map((item) => ({
              id: uuidv7(),
              subjectId: actor.id,
              consentingGuardianId: null,
              category: item.category,
              basis: item.basis,
              purpose: item.purpose,
              policyVersion: input.textVersion,
              textHash,
              grantedAt: now,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .returning(),
      databaseFor(c),
    );
    rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const record: ConsentRecord = {
      textHash,
      textVersion: input.textVersion,
      termsVersion: input.termsVersion,
      processors: input.processors,
      items: rows.map(consentBody),
    };
    return c.json(record, 201);
  });

  app.openapi(listConsentsRoute, async (c) => {
    const actor = actorOf(c);
    const { cursor, limit } = c.req.valid("query");
    const after = cursor === undefined ? undefined : decodeCursor(cursor);
    if (after === null) {
      return problem(c, 422, "validation_failed", {
        detail: CURSOR_INVALID,
        errors: [{ path: "cursor", message: "The cursor is not one this list issued." }],
      });
    }
    // Her own consents and those for the children she guards, the subjects
    // listScope names for her; a grant never reaches a consent.
    const subjects = listScope(actor, "read")
      .filter((scope) => scope.reason !== "grant")
      .map((scope) => scope.subjectId);
    const rows = await withActor(
      actor.id,
      (tx) =>
        tx
          .select()
          .from(schema.consents)
          .where(
            and(
              or(
                inArray(schema.consents.subjectId, subjects),
                eq(schema.consents.consentingGuardianId, actor.id),
              ),
              isNull(schema.consents.deletedAt),
              ...(after === undefined ? [] : [gt(schema.consents.id, after)]),
            ),
          )
          .orderBy(asc(schema.consents.id))
          .limit(limit + 1),
      databaseFor(c),
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const body: ConsentList = {
      items: page.map(consentBody),
      nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last.id) : null,
    };
    return c.json(body, 200);
  });

  app.openapi(withdrawConsentRoute, async (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const now = new Date();
    const outcome = await withActor(
      actor.id,
      (tx) => withdrawConsent(tx, actor, id, now),
      databaseFor(c),
    );
    switch (outcome.kind) {
      case "missing":
        return problem(c, 404, "not_found");
      case "already":
        return problem(c, 409, "conflict", { detail: CONSENT_ALREADY_WITHDRAWN });
      case "child":
        return problem(c, 422, "validation_failed", {
          detail: CHILD_CONSENT_NOT_WITHDRAWN_HERE,
          errors: [
            {
              path: "id",
              message:
                "A child's consent is withdrawn with the child's records, through the child's closure path.",
            },
          ],
        });
      case "withdrawn":
        // The job is due at the end of the undo window, so the inline drain
        // would claim nothing now; the scheduled sweep picks it up then.
        return c.json(outcome.body, 200);
    }
  });

  app.openapi(dataSummaryRoute, async (c) => {
    const actor = actorOf(c);
    const body = await withActor(actor.id, (tx) => dataSummary(tx, actor), databaseFor(c));
    return c.json(body, 200);
  });
}
