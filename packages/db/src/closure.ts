import { createHmac } from "node:crypto";

import { and, eq, inArray, isNotNull, isNull, lt, notExists, or, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { Transaction } from "./actor";
import * as schema from "./schema/index";

/**
 * The database side of account closure (architecture record 11, task I2).
 * The API's `account.delete` handler walks a closure through its steps; the
 * pieces here are the ones that only need the schema: which closures are
 * open, the keyed hash the tombstone keeps, the table-by-table deletion of
 * one person's rows in an order the foreign keys allow, and the two closure
 * duties of the daily sweep. Every function takes a transaction the caller
 * opened, `withSystem` for the deletion and the sweep, `withActor` for the
 * session check, so nothing here decides who may run it.
 */

/** A closure in one of these states locks the account (E8 files it as `requested`). */
export const OPEN_CLOSURE_STATES = ["requested", "in_progress"] as const;

/** Architecture 11: the closure tombstone (an HMAC of the email and the dates) is kept 30 days. */
export const CLOSURE_TOMBSTONE_MS = 30 * 24 * 60 * 60_000;

/**
 * The tombstone's only trace of the person: HMAC-SHA256 of the address,
 * trimmed and lower-cased, under `LOG_HMAC_SECRET`, as base64url. With the
 * secret, an address someone writes in with can be matched against it; the
 * address itself is never stored.
 */
export function emailHmac(secret: string, email: string): string {
  if (secret.length === 0) {
    throw new TypeError("emailHmac needs a non-empty secret");
  }
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("base64url");
}

/** The open closure of a person, if any: what the session layer refuses an actor for. */
export async function openClosureOf(
  tx: Transaction,
  userId: string,
): Promise<{ id: string; state: string } | undefined> {
  const [row] = await tx
    .select({ id: schema.dataRequests.id, state: schema.dataRequests.state })
    .from(schema.dataRequests)
    .where(
      and(
        eq(schema.dataRequests.userId, userId),
        eq(schema.dataRequests.kind, "closure"),
        inArray(schema.dataRequests.state, [...OPEN_CLOSURE_STATES]),
      ),
    )
    .limit(1);
  return row;
}

/** One table's share of a person's rows, deleted in a single statement. */
export interface ClosureDeletion {
  /** The table name, for the step report; never a value from the rows. */
  table: string;
  remove(tx: Transaction, userId: string): Promise<number>;
}

async function removed(query: Promise<unknown[]>): Promise<number> {
  return (await query).length;
}

function deleteWhere(table: PgTable, condition: (userId: string) => ReturnType<typeof eq>) {
  return (tx: Transaction, userId: string) =>
    removed(
      tx
        .delete(table)
        .where(condition(userId))
        .returning({ one: sql<number>`1` }),
    );
}

/**
 * The person's own rows, children aside, in an order the foreign keys
 * allow: children of a parent row before the parent, and every row that
 * names the person before the `user` row itself, which the caller deletes
 * last together with writing the tombstone. Rows whose subject column has
 * no foreign key (notes are keyed to her, but consents, audit rows and
 * photos are not) are listed explicitly, since no cascade would reach
 * them. Rows she wrote about someone else (a note about a partner, a
 * child's feed) stay with their subject; the foreign keys set their
 * author to null when the `user` row goes. Children are the caller's step
 * before this one: transfer to a remaining guardian, or delete with the
 * child's key.
 */
export const closureDeletions: readonly ClosureDeletion[] = [
  {
    // Outbox rows that name her (a reminder, a mail), waiting or already
    // finished, so no job row keeps her id after the closure. The
    // closure's own `account.delete` jobs stay: they carry this run, and
    // the tombstone step strips her id from them (`forgetClosureJobs`).
    table: "jobs",
    remove: (tx, userId) =>
      removed(
        tx
          .delete(schema.jobs)
          .where(
            and(
              sql`${schema.jobs.type} <> 'account.delete'`,
              inArray(schema.jobs.status, ["queued", "failed", "dead", "done"]),
              sql`${schema.jobs.payloadJson}::text like ${`%${userId}%`}`,
            ),
          )
          .returning({ one: sql<number>`1` }),
      ),
  },
  {
    table: "idempotency_keys",
    remove: deleteWhere(schema.idempotencyKeys, (userId) =>
      eq(schema.idempotencyKeys.actorId, userId),
    ),
  },
  {
    // Architecture 7.4: closing an account deletes the audit rows where she
    // is the subject or the actor.
    table: "audit_events",
    remove: deleteWhere(
      schema.auditEvents,
      (userId) =>
        or(
          eq(schema.auditEvents.actorId, userId),
          eq(schema.auditEvents.subjectId, userId),
        ) as ReturnType<typeof eq>,
    ),
  },
  {
    table: "notes",
    remove: deleteWhere(schema.notes, (userId) => eq(schema.notes.subjectId, userId)),
  },
  {
    table: "photo_variants",
    remove: (tx, userId) =>
      removed(
        tx
          .delete(schema.photoVariants)
          .where(
            inArray(
              schema.photoVariants.photoId,
              tx
                .select({ id: schema.photos.id })
                .from(schema.photos)
                .where(eq(schema.photos.subjectId, userId)),
            ),
          )
          .returning({ one: sql<number>`1` }),
      ),
  },
  {
    table: "photos",
    remove: deleteWhere(schema.photos, (userId) => eq(schema.photos.subjectId, userId)),
  },
  {
    table: "entry_symptoms",
    remove: deleteWhere(schema.entrySymptoms, (userId) =>
      eq(schema.entrySymptoms.subjectId, userId),
    ),
  },
  {
    table: "cycle_predictions",
    remove: deleteWhere(schema.cyclePredictions, (userId) =>
      eq(schema.cyclePredictions.subjectId, userId),
    ),
  },
  {
    table: "cycle_entries",
    remove: deleteWhere(schema.cycleEntries, (userId) => eq(schema.cycleEntries.subjectId, userId)),
  },
  {
    table: "due_date_changes",
    remove: deleteWhere(schema.dueDateChanges, (userId) =>
      eq(schema.dueDateChanges.subjectId, userId),
    ),
  },
  {
    table: "pregnancy_events",
    remove: deleteWhere(schema.pregnancyEvents, (userId) =>
      eq(schema.pregnancyEvents.subjectId, userId),
    ),
  },
  {
    table: "pregnancies",
    remove: deleteWhere(schema.pregnancies, (userId) => eq(schema.pregnancies.subjectId, userId)),
  },
  {
    table: "consents",
    remove: deleteWhere(schema.consents, (userId) => eq(schema.consents.subjectId, userId)),
  },
  {
    table: "disclosures",
    remove: deleteWhere(schema.disclosures, (userId) => eq(schema.disclosures.userId, userId)),
  },
  {
    // Already revoked at closure (E8); the rows themselves go now.
    table: "grants",
    remove: deleteWhere(
      schema.grants,
      (userId) =>
        or(eq(schema.grants.ownerId, userId), eq(schema.grants.granteeId, userId)) as ReturnType<
          typeof eq
        >,
    ),
  },
  {
    table: "invitations",
    remove: deleteWhere(schema.invitations, (userId) => eq(schema.invitations.inviterId, userId)),
  },
  {
    // A household she was in that is left with no member and no child goes
    // too; one that still holds someone, or a child, stays. Her own
    // membership rows go in the next step, so this runs while they still
    // say which households were hers.
    table: "households",
    remove: (tx, userId) => {
      const others = tx
        .select({ one: sql`1` })
        .from(schema.householdMembers)
        .where(
          and(
            eq(schema.householdMembers.householdId, schema.households.id),
            sql`${schema.householdMembers.userId} <> ${userId}`,
          ),
        );
      const kids = tx
        .select({ one: sql`1` })
        .from(schema.children)
        .where(eq(schema.children.householdId, schema.households.id));
      return removed(
        tx
          .delete(schema.households)
          .where(
            and(
              inArray(
                schema.households.id,
                tx
                  .select({ id: schema.householdMembers.householdId })
                  .from(schema.householdMembers)
                  .where(eq(schema.householdMembers.userId, userId)),
              ),
              notExists(others),
              notExists(kids),
            ),
          )
          .returning({ one: sql<number>`1` }),
      );
    },
  },
  {
    table: "household_members",
    remove: deleteWhere(schema.householdMembers, (userId) =>
      eq(schema.householdMembers.userId, userId),
    ),
  },
  {
    table: "profiles",
    remove: deleteWhere(schema.profiles, (userId) => eq(schema.profiles.userId, userId)),
  },
  {
    table: "two_factor",
    remove: deleteWhere(schema.twoFactor, (userId) => eq(schema.twoFactor.userId, userId)),
  },
  {
    table: "passkey",
    remove: deleteWhere(schema.passkey, (userId) => eq(schema.passkey.userId, userId)),
  },
  {
    table: "account",
    remove: deleteWhere(schema.account, (userId) => eq(schema.account.userId, userId)),
  },
  {
    table: "session",
    remove: deleteWhere(schema.session, (userId) => eq(schema.session.userId, userId)),
  },
];

/**
 * Whether the closure of this person will have stored objects to remove:
 * a photo of hers, or of a child she is the only guardian of (that child
 * is deleted with her). The `account.delete` handler asks this before it
 * destroys anything, so a closure that would stop at the photos for want
 * of an object store never starts.
 */
export async function closureHasPhotos(tx: Transaction, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql<number>`1` })
    .from(schema.photos)
    .where(
      or(
        eq(schema.photos.subjectId, userId),
        sql`${schema.photos.subjectId} in (
          select mine.child_id from ${schema.childGuardians} mine
          where mine.user_id = ${userId}
            and not exists (
              select 1 from ${schema.childGuardians} other
              where other.child_id = mine.child_id and other.user_id <> ${userId}
            )
        )`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Strips the person's id from her closure's own `account.delete` jobs,
 * finished or not, so that once the tombstone is written no job row links
 * the closure to her. The handler needs only the request id. Returns how
 * many payloads changed.
 */
export async function forgetClosureJobs(tx: Transaction, requestId: string): Promise<number> {
  return removed(
    tx
      .update(schema.jobs)
      .set({ payloadJson: sql`${schema.jobs.payloadJson} - 'userId'` })
      .where(
        and(
          eq(schema.jobs.type, "account.delete"),
          sql`${schema.jobs.payloadJson} ->> 'requestId' = ${requestId}`,
          sql`${schema.jobs.payloadJson} ->> 'userId' is not null`,
        ),
      )
      .returning({ one: sql<number>`1` }),
  );
}

/**
 * Runs the deletions in order and stops after the first that removed
 * anything, so one call is one bounded step and a call with nothing left
 * to delete returns null. A step that already ran removes nothing the
 * second time, which is what makes a retried run harmless.
 */
export async function deleteNextUserRows(
  tx: Transaction,
  userId: string,
): Promise<{ table: string; removed: number } | null> {
  for (const deletion of closureDeletions) {
    const count = await deletion.remove(tx, userId);
    if (count > 0) {
      return { table: deletion.table, removed: count };
    }
  }
  return null;
}

/**
 * The open closures the sweep must move along: past their undo window (or
 * delete now) and with no live `account.delete` job, because the job went
 * `dead` or was never written. The sweep enqueues one for each.
 */
export async function closuresWithoutJob(
  tx: Transaction,
  now: Date,
): Promise<{ requestId: string }[]> {
  const live = tx
    .select({ one: sql`1` })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, "account.delete"),
        inArray(schema.jobs.status, ["queued", "running", "failed"]),
        sql`${schema.jobs.payloadJson} ->> 'requestId' = ${schema.dataRequests.id}::text`,
      ),
    );
  return tx
    .select({ requestId: schema.dataRequests.id })
    .from(schema.dataRequests)
    .where(
      and(
        eq(schema.dataRequests.kind, "closure"),
        inArray(schema.dataRequests.state, [...OPEN_CLOSURE_STATES]),
        or(isNull(schema.dataRequests.undoUntil), lt(schema.dataRequests.undoUntil, now)),
        notExists(live),
      ),
    )
    .orderBy(schema.dataRequests.requestedAt);
}

/**
 * Removes closure tombstones older than 30 days (architecture 11): a
 * completed closure with no `user_id` left, only the email HMAC and the
 * dates. Returns how many went.
 */
export async function purgeClosureTombstones(tx: Transaction, now: Date): Promise<number> {
  return removed(
    tx
      .delete(schema.dataRequests)
      .where(
        and(
          eq(schema.dataRequests.kind, "closure"),
          eq(schema.dataRequests.state, "completed"),
          isNull(schema.dataRequests.userId),
          isNotNull(schema.dataRequests.emailHmac),
          lt(schema.dataRequests.completedAt, new Date(now.getTime() - CLOSURE_TOMBSTONE_MS)),
        ),
      )
      .returning({ one: sql<number>`1` }),
  );
}
