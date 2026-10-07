import { sql } from "drizzle-orm";
import { todayIn } from "@tidefern/core";
import { auditActions, isAuditAction, schema } from "@tidefern/db";
import type { AuditAction, Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";

/**
 * The neutral action names the audit log holds (architecture 8.3 step 6).
 * The list lives in packages/db since task C7, because the session hooks in
 * packages/auth write the same log and cannot import this package; the
 * routes keep importing it from here.
 */
export { auditActions };
export type { AuditAction };

export type AuditCategory = (typeof schema.dataCategoryValues)[number];

export interface AuditEvent {
  /** The signed-in actor; the row is accepted only in her own name (B8's insert policy). */
  actorId: string;
  action: AuditAction;
  /** Whose records: the person, or the child for a child record. */
  subjectId: string;
  category?: AuditCategory | undefined;
  childId?: string | undefined;
  /**
   * For a partner read: the calendar day in the subject's time zone as
   * `YYYY-MM-DD` (the caller computes it with `auditDay()`). Reads collapse
   * to one row per actor, subject, category and day.
   */
  day?: string | undefined;
  occurredAt?: Date | undefined;
}

/**
 * The day a partner read is filed under (`AuditEvent.day`): today in the
 * subject's zone on the real clock. It is the day the read happened and
 * must agree with the row's `occurred_at`, so it never follows the calendar
 * clock (clock.ts): an audit time is one of the instants that stay real
 * when `TIDEFERN_FAKE_NOW` freezes the calendar.
 */
export function auditDay(timeZone: string, now: Date = new Date()): string {
  return todayIn(timeZone, now);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The dedupe key of a partner read: one row per actor, subject, category and day. */
export function readDedupeKey(
  event: Pick<AuditEvent, "actorId" | "subjectId" | "category" | "day">,
): string {
  if (event.category === undefined) {
    throw new TypeError("a partner read audit needs the category that was read");
  }
  if (event.day === undefined || !DAY.test(event.day)) {
    throw new TypeError("a partner read audit needs the day as YYYY-MM-DD");
  }
  return `${event.actorId}/${event.subjectId}/${event.category}/${event.day}`;
}

/**
 * Appends one audit row inside the actor's transaction, so B8's policy
 * decides whether the actor may write about that subject (herself, a
 * child she guards, a person who granted to her, or that child) and the
 * row commits or rolls back with the change it records. For a grant
 * revocation call it before the revoke in the same transaction: once the
 * grant is gone the grantee no longer holds the subject's key and the
 * policy refuses her row.
 *
 * Returns the new row's id, or null when a partner read collapsed onto the
 * day's existing row.
 */
export async function audit(tx: Transaction, event: AuditEvent): Promise<string | null> {
  if (!isAuditAction(event.action)) {
    throw new TypeError(`unknown audit action: ${event.action}`);
  }
  const dedupeKey = event.action === auditActions.partnerRead ? readDedupeKey(event) : null;
  const id = uuidv7();
  const inserted = await tx
    .insert(schema.auditEvents)
    .values({
      id,
      actorId: event.actorId,
      action: event.action,
      subjectId: event.subjectId,
      category: event.category ?? null,
      childId: event.childId ?? null,
      dedupeKey,
      ...(event.occurredAt !== undefined ? { occurredAt: event.occurredAt } : {}),
    })
    .onConflictDoNothing({
      target: schema.auditEvents.dedupeKey,
      where: sql`${schema.auditEvents.dedupeKey} is not null`,
    })
    .returning({ id: schema.auditEvents.id });
  return inserted[0]?.id ?? null;
}
