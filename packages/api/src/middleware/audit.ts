import { sql } from "drizzle-orm";
import { schema } from "@tidefern/db";
import type { Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";

/**
 * The neutral action names the audit log holds (architecture 8.3 step 6).
 * A read of a shared category by someone other than the subject, a write
 * by such a partner, and every change to a grant. The set grows with the
 * E tasks; a name never carries a category or a fact, the columns do.
 */
export const auditActions = {
  partnerRead: "partner.read",
  partnerWrite: "partner.write",
  grantCreate: "grant.create",
  grantUpdate: "grant.update",
  grantRevoke: "grant.revoke",
  noteShare: "note.share",
} as const;

export type AuditAction = (typeof auditActions)[keyof typeof auditActions];

const ACTIONS: ReadonlySet<string> = new Set(Object.values(auditActions));

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
   * `YYYY-MM-DD` (the caller computes it with `todayIn()`). Reads collapse
   * to one row per actor, subject, category and day.
   */
  day?: string | undefined;
  occurredAt?: Date | undefined;
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
  if (!ACTIONS.has(event.action)) {
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
