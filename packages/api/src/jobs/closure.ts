import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { destroySubjectKey } from "@tidefern/crypto";
import { deleteNextUserRows, emailHmac, isActorId, schema, withSystem } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { enqueue } from "@tidefern/db/jobs";
import type { Job } from "@tidefern/db/jobs";

import { audit, auditActions } from "../middleware/audit";
import type { JobContext, JobHandler } from "./index";
import type { Mailer, MailMessage } from "./notice";

/**
 * Account closure, the `account.delete` job (architecture 9.2, 10.1, 11 and
 * 8.4; task I2). E8's `POST /v1/me/close` revokes every grant and every
 * other session at once, files the `data_requests` row and enqueues this
 * job for the end of the seven day window, or for now when the person chose
 * delete now. The job walks that row through its steps, one bounded step
 * per transaction, each one idempotent:
 *
 * - `requested`, the window open: revoke anything still live (normally
 *   nothing, E8 did it) and wait. The person may still undo.
 * - `requested`, the window over: delete every session, including the one
 *   kept for the undo, and move to `in_progress`.
 * - `in_progress`: destroy her DEK through D2 first, so every ciphertext
 *   under it is unreadable before a row goes; then each child she guards,
 *   handed to the remaining guardian or, when she was the last one,
 *   deleted with the child's own key; then her photos with their stored
 *   objects; then her rows table by table; then the tombstone (the HMAC of
 *   her email, the dates) and the `user` row in one transaction.
 * - `in_progress` with no user left: the processor notice to the owner,
 *   then `completed`.
 *
 * A step re-reads the row under `FOR UPDATE`, so an undo racing a step
 * waits for it, and a step that finds nothing to do moves on to the next,
 * so a second run of any step is a no-op. Every database call runs inside
 * `withSystem` on the job runner's owner-role connection (7.2): the
 * deletion crosses every person-scoped table and Better Auth's.
 */

/** The steps one call of `advanceClosure` can report. */
export type ClosureStep =
  /** No closure row with this id: purged, or never written. */
  | "missing"
  /** The row is already `completed` or `cancelled`; nothing to do. */
  | "finished"
  /** Live grants or a stray session were revoked during the window. */
  | "revoked"
  /** The undo window is still open. */
  | "waiting"
  /** The window is over: every session gone, the row is `in_progress`. */
  | "started"
  /** Her wrapped DEK is destroyed. */
  | "key"
  /** A co-guarded child now has only the remaining guardian. */
  | "child-transferred"
  /** A child she was the last guardian of is gone, with its key. */
  | "child-deleted"
  /** Her photos and their stored objects are gone. */
  | "objects"
  /** One table of her rows is gone; `table` says which. */
  | "rows"
  /** The tombstone is written and the `user` row deleted. */
  | "tombstone"
  /** The processor notice went out; the row is `completed`. */
  | "done";

export interface ClosureAdvance {
  step: ClosureStep;
  /** The row's state after the step, or null when the row is missing. */
  state: (typeof schema.dataRequestStateValues)[number] | null;
  /** For `rows`: the table name. */
  table?: string | undefined;
  /** For `waiting`: when the window ends. */
  undoUntil?: Date | undefined;
}

/**
 * The stored objects behind photo rows (R2 in production). A structural
 * slice, so the API takes the host's client without depending on it.
 */
export interface ObjectStore {
  remove(keys: readonly string[]): Promise<void>;
}

export interface ClosureSettings {
  /** `LOG_HMAC_SECRET` (17.1): keys the HMAC of the email the tombstone keeps. */
  hmacSecret?: string | undefined;
  /** The transport for the processor notice; the host's, as for every mail. */
  mailer?: Mailer | undefined;
  /** `[OWNER]` The owner's inbox the processor notice goes to (`OWNER_EMAIL`). */
  ownerEmail?: string | undefined;
  /** Where photo objects live; needed only when a photo row exists. */
  objects?: ObjectStore | undefined;
}

/** Thrown when a step needs a setting the host did not give; names the setting only. */
export class ClosureConfigurationError extends Error {
  override readonly name = "ClosureConfigurationError";

  constructor(setting: string) {
    super(`account closure needs ${setting} before it can continue`);
  }
}

/**
 * The processor notification of architecture 11, to the owner's inbox: an
 * account closed, so its contact and email logs go at the email processor.
 * No address, no id, no date, nothing about the person: the tombstone's
 * keyed hash is how the owner matches the contact.
 */
export function processorNotice(to: string): MailMessage {
  return {
    to,
    subject: "Tidefern processor notice",
    text: [
      "An account closure has finished in Tidefern.",
      "Remove the closed account's contact and its email logs at the email processor.",
      "The closure tombstone keeps a keyed hash of the address for 30 days to match it by.",
    ].join("\n"),
  };
}

type Settings = ClosureSettings;

function need<K extends keyof Settings>(
  settings: Settings,
  key: K,
  name: string,
): NonNullable<Settings[K]> {
  const value = settings[key];
  if (value === undefined || value === null || value === "") {
    throw new ClosureConfigurationError(name);
  }
  return value as NonNullable<Settings[K]>;
}

type DataRequestRow = typeof schema.dataRequests.$inferSelect;

async function lockRequest(
  tx: Transaction,
  requestId: string,
): Promise<DataRequestRow | undefined> {
  const [row] = await tx
    .select()
    .from(schema.dataRequests)
    .where(and(eq(schema.dataRequests.id, requestId), eq(schema.dataRequests.kind, "closure")))
    .for("update");
  return row;
}

/**
 * Anything that still lets someone in or out of her records: a grant in
 * either direction not yet revoked, audited before the revoke as E8 does.
 * E8 revoked everything at closure, so this normally finds nothing and
 * writes no audit row; it is here so a retried or late closure never
 * leaves a live grant behind.
 */
async function revokeLeftovers(tx: Transaction, userId: string, now: Date): Promise<number> {
  const live = await tx
    .select({
      id: schema.grants.id,
      ownerId: schema.grants.ownerId,
      category: schema.grants.category,
      childId: schema.grants.childId,
    })
    .from(schema.grants)
    .where(
      and(
        or(eq(schema.grants.ownerId, userId), eq(schema.grants.granteeId, userId)),
        isNull(schema.grants.revokedAt),
      ),
    );
  for (const grant of live) {
    await audit(tx, {
      actorId: userId,
      action: auditActions.grantRevoke,
      subjectId: grant.childId ?? grant.ownerId,
      category: grant.category,
      childId: grant.childId ?? undefined,
      occurredAt: now,
    });
  }
  if (live.length > 0) {
    await tx
      .update(schema.grants)
      .set({ revokedAt: now, updatedAt: now, version: sql`${schema.grants.version} + 1` })
      .where(
        inArray(
          schema.grants.id,
          live.map((grant) => grant.id),
        ),
      );
  }
  return live.length;
}

/**
 * Deletes the photo rows of one subject (her, or a child) and their stored
 * objects, the objects first. Returns false when there were none. A photo
 * row with no store to remove its object from stops the closure rather
 * than leaving the object behind.
 */
async function removePhotos(
  tx: Transaction,
  subjectId: string,
  settings: Settings,
): Promise<boolean> {
  const photos = await tx
    .select({ id: schema.photos.id, objectKey: schema.photos.objectKey })
    .from(schema.photos)
    .where(eq(schema.photos.subjectId, subjectId));
  if (photos.length === 0) return false;
  const ids = photos.map((photo) => photo.id);
  const variants = await tx
    .select({ objectKey: schema.photoVariants.objectKey })
    .from(schema.photoVariants)
    .where(inArray(schema.photoVariants.photoId, ids));
  const store = need(settings, "objects", "an object store");
  await store.remove([
    ...photos.map((photo) => photo.objectKey),
    ...variants.map((variant) => variant.objectKey),
  ]);
  await tx.delete(schema.photoVariants).where(inArray(schema.photoVariants.photoId, ids));
  await tx.delete(schema.photos).where(inArray(schema.photos.id, ids));
  return true;
}

/**
 * One child she guards, if any: handed to the remaining guardian (8.4,
 * "transfer, not delete"), or, when she was the last guardian, deleted
 * with its key destroyed first (9.2 item 5). The child's rows are keyed to
 * the child and encrypted under the child's own key, so a transferred
 * child keeps decrypting for the guardian who stays.
 */
async function nextChild(
  tx: Transaction,
  userId: string,
  settings: Settings,
): Promise<ClosureStep | null> {
  const [guarded] = await tx
    .select({ childId: schema.childGuardians.childId })
    .from(schema.childGuardians)
    .where(eq(schema.childGuardians.userId, userId))
    .orderBy(schema.childGuardians.childId)
    .limit(1);
  if (guarded === undefined) return null;
  const { childId } = guarded;
  const [other] = await tx
    .select({ id: schema.childGuardians.id })
    .from(schema.childGuardians)
    .where(
      and(eq(schema.childGuardians.childId, childId), ne(schema.childGuardians.userId, userId)),
    )
    .limit(1);
  if (other !== undefined) {
    await tx
      .delete(schema.childGuardians)
      .where(
        and(eq(schema.childGuardians.childId, childId), eq(schema.childGuardians.userId, userId)),
      );
    return "child-transferred";
  }
  // The last guardian: the key first, so the child's free text is
  // unreadable before any row goes, then everything keyed to the child.
  await destroySubjectKey(tx, childId);
  await removePhotos(tx, childId, settings);
  await tx
    .delete(schema.auditEvents)
    .where(or(eq(schema.auditEvents.subjectId, childId), eq(schema.auditEvents.childId, childId)));
  await tx.delete(schema.consents).where(eq(schema.consents.subjectId, childId));
  await tx.delete(schema.grants).where(eq(schema.grants.childId, childId));
  // Events, measurements and guardianships cascade with the child row.
  await tx.delete(schema.children).where(eq(schema.children.id, childId));
  return "child-deleted";
}

/**
 * Advances one closure by exactly one step in one system transaction and
 * reports which. Idempotent: run it again after any step and it either
 * does the next one or, once the closure is finished, nothing.
 */
export async function advanceClosure(
  db: ActorDatabase,
  requestId: string,
  settings: Settings,
  now: Date,
): Promise<ClosureAdvance> {
  return withSystem(async (tx) => {
    const row = await lockRequest(tx, requestId);
    if (row === undefined) return { step: "missing", state: null };
    if (row.state !== "requested" && row.state !== "in_progress") {
      return { step: "finished", state: row.state };
    }

    if (row.state === "requested") {
      if (row.userId === null) {
        throw new TypeError("a closure request names the account it closes");
      }
      if ((await revokeLeftovers(tx, row.userId, now)) > 0) {
        return { step: "revoked", state: "requested" };
      }
      if (row.undoUntil !== null && row.undoUntil > now) {
        return { step: "waiting", state: "requested", undoUntil: row.undoUntil };
      }
      // Nothing is destroyed until the run could also finish.
      need(settings, "hmacSecret", "LOG_HMAC_SECRET");
      need(settings, "mailer", "a mailer");
      need(settings, "ownerEmail", "OWNER_EMAIL");
      await tx.delete(schema.session).where(eq(schema.session.userId, row.userId));
      await tx
        .update(schema.dataRequests)
        .set({ state: "in_progress", updatedAt: now })
        .where(eq(schema.dataRequests.id, row.id));
      return { step: "started", state: "in_progress" };
    }

    const userId = row.userId;
    if (userId === null) {
      // Everything of hers is gone and the tombstone written: tell the
      // owner, then finish. A failed send rolls the state back and the
      // job retries; a send whose commit then fails is sent again, which
      // is the safe direction for a reminder to delete a contact.
      const mailer = need(settings, "mailer", "a mailer");
      await mailer.send(processorNotice(need(settings, "ownerEmail", "OWNER_EMAIL")));
      await tx
        .update(schema.dataRequests)
        .set({ state: "completed", completedAt: now, updatedAt: now })
        .where(eq(schema.dataRequests.id, row.id));
      return { step: "done", state: "completed" };
    }

    if (await destroySubjectKey(tx, userId)) {
      return { step: "key", state: "in_progress" };
    }
    const child = await nextChild(tx, userId, settings);
    if (child !== null) return { step: child, state: "in_progress" };
    if (await removePhotos(tx, userId, settings)) {
      return { step: "objects", state: "in_progress" };
    }
    const rows = await deleteNextUserRows(tx, userId);
    if (rows !== null) return { step: "rows", state: "in_progress", table: rows.table };

    const secret = need(settings, "hmacSecret", "LOG_HMAC_SECRET");
    const [person] = await tx
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    // The tombstone first: once user_id is null the row no longer cascades
    // with the user, and the check constraint wants the HMAC in its place.
    await tx
      .update(schema.dataRequests)
      .set({
        userId: null,
        emailHmac: person === undefined ? row.emailHmac : emailHmac(secret, person.email),
        updatedAt: now,
      })
      .where(eq(schema.dataRequests.id, row.id));
    await tx.delete(schema.user).where(eq(schema.user.id, userId));
    return { step: "tombstone", state: "in_progress" };
  }, db);
}

/**
 * Makes sure a later run will pick the closure up: one `account.delete`
 * job for the request, due at `runAfter`, unless another live one (not the
 * job running now) already exists. Ids only in the payload.
 */
async function ensureFollowUp(
  db: ActorDatabase,
  current: Job,
  requestId: string,
  runAfter: Date,
): Promise<void> {
  await withSystem(async (tx) => {
    const [live] = await tx
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.type, "account.delete"),
          ne(schema.jobs.id, current.id),
          inArray(schema.jobs.status, ["queued", "running", "failed"]),
          sql`${schema.jobs.payloadJson} ->> 'requestId' = ${requestId}`,
        ),
      )
      .limit(1);
    if (live !== undefined) return;
    const userId = current.payloadJson["userId"];
    await enqueue(
      tx,
      "account.delete",
      typeof userId === "string" ? { requestId, userId } : { requestId },
      { runAfter },
    );
  }, db);
}

/** Steps one run may take before it hands the rest to a follow-up job. */
export const MAX_STEPS_PER_RUN = 100;

/**
 * Wall-clock budget of one run, well inside the API route's 60 second
 * `maxDuration` and Hobby's 300 second ceiling (10.1). When it runs out,
 * the rest waits for a follow-up job due at once.
 */
export const CLOSURE_RUN_BUDGET_MS = 20_000;

export interface ClosureHandlerOptions {
  /** The settings, read on every run so a host can configure them after start. */
  settings: () => Settings;
  budgetMs?: number | undefined;
  /** Milliseconds, for the budget; tests pass a fake. */
  clock?: (() => number) | undefined;
}

/**
 * The `account.delete` handler: steps the closure until it waits, finishes
 * or spends its budget. Each step commits on its own, so a timeout loses
 * at most the step in flight, and the job's retries (I1's backoff) pick it
 * up from there.
 */
export function createClosureHandler(options: ClosureHandlerOptions): JobHandler {
  const budget = options.budgetMs ?? CLOSURE_RUN_BUDGET_MS;
  const clock = options.clock ?? Date.now;
  return async (job: Job, context: JobContext) => {
    const requestId = job.payloadJson["requestId"];
    if (typeof requestId !== "string" || !isActorId(requestId)) {
      throw new TypeError("an account.delete job names its request by id");
    }
    const settings = options.settings();
    const started = clock();
    for (let step = 0; step < MAX_STEPS_PER_RUN; step += 1) {
      const result = await advanceClosure(context.db, requestId, settings, context.now);
      if (result.step === "missing" || result.step === "finished" || result.step === "done") {
        return;
      }
      if (result.step === "waiting") {
        await ensureFollowUp(context.db, job, requestId, result.undoUntil ?? context.now);
        return;
      }
      if (clock() - started >= budget) break;
    }
    await ensureFollowUp(context.db, job, requestId, context.now);
  };
}

let configured: Settings = {};

/**
 * The host's part of the settings, as `configureSharing` does for the
 * invitation mail: the mailer `@tidefern/auth/server` chose, and an object
 * store once photos have one. Anything not given here falls back to the
 * environment: `LOG_HMAC_SECRET` and `OWNER_EMAIL`.
 */
export function configureClosure(settings: Settings): void {
  configured = { ...settings };
}

export function closureSettings(): Settings {
  return {
    hmacSecret: configured.hmacSecret ?? process.env["LOG_HMAC_SECRET"],
    ownerEmail: configured.ownerEmail ?? process.env["OWNER_EMAIL"],
    mailer: configured.mailer,
    objects: configured.objects,
  };
}

/** The registry's `account.delete` entry. */
export const accountDeleteHandler: JobHandler = createClosureHandler({ settings: closureSettings });
