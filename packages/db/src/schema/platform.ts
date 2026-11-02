import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema";
import { children } from "./children";
import {
  dataCategoryEnum,
  dataRequestKindEnum,
  dataRequestStateEnum,
  idempotencyStateEnum,
  jobStatusEnum,
  noteCategoryEnum,
  photoCategoryEnum,
  photoStatusEnum,
  photoVariantKindEnum,
} from "./enums";
import { bytea } from "./keys";

/**
 * Notes (architecture record 7.4 and 8.2). The day sheet's note is a row
 * here, filed under `journal.private` unless the author re-files it under a
 * shareable category; the row's own category is what the policy reads. The
 * body is free text, so it is stored encrypted under the subject's DEK with
 * the sibling `kek_version` (architecture record 7.3). A partner's note
 * about her has `author_id` set to the partner and `subject_id` to her; she
 * owns it and it stays hers when the partner's account goes.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    category: noteCategoryEnum("category").notNull().default("journal.private"),
    date: date("date", { mode: "string" }).notNull(),
    body: bytea("body").notNull(),
    kekVersion: text("kek_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("notes_subject_date_idx").on(table.subjectId, table.date)],
).enableRLS();

/**
 * Photo metadata only (architecture record 7.4 and 9.1): the object key in
 * R2, the upload status, the content type, size and dimensions, an
 * encrypted caption and the day she says it was taken. Never the original
 * filename and never EXIF; the bytes live in R2 and are reached through
 * short-lived presigned URLs. The subject is her or a child, so `subject_id`
 * carries no foreign key, and `child_id` is set exactly for a child photo so
 * the `child` policy can scope it.
 */
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id").notNull(),
    childId: uuid("child_id").references(() => children.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    category: photoCategoryEnum("category").notNull(),
    status: photoStatusEnum("status").notNull().default("pending"),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: bytea("caption"),
    kekVersion: text("kek_version"),
    takenOn: date("taken_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("photos_object_key_unique").on(table.objectKey),
    index("photos_subject_created_idx").on(table.subjectId, table.createdAt),
    check(
      "photos_child_id_matches_category",
      sql`(${table.category} = 'child') = (${table.childId} is not null)`,
    ),
    check(
      "photos_caption_has_kek_version",
      sql`(${table.caption} is null) = (${table.kekVersion} is null)`,
    ),
    check("photos_byte_length_is_positive", sql`${table.byteLength} > 0`),
  ],
).enableRLS();

/** The server-generated renditions of a photo, removed in the same job as the photo. */
export const photoVariants = pgTable(
  "photo_variants",
  {
    id: uuid("id").primaryKey(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    variant: photoVariantKindEnum("variant").notNull(),
    objectKey: text("object_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteLength: integer("byte_length").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("photo_variants_photo_variant_unique").on(table.photoId, table.variant),
    uniqueIndex("photo_variants_object_key_unique").on(table.objectKey),
  ],
).enableRLS();

/**
 * The append-only audit log (architecture record 7.4 and 11): who did what
 * to whose records, in which category, when, and nothing of the content.
 * `action` is a neutral dotted name from `auditActions` in ../audit.ts
 * (`grant.create`, `session.sign_in`), which the API and the session hooks
 * in packages/auth both write from; it is not a vocabulary a person picks
 * from, so it is text.
 * `dedupe_key` is what the writer sets for a partner read, one per actor,
 * subject, category and day, so repeated reads collapse to one row; the
 * partial unique index makes the second insert a no-op. Rows are kept one
 * year and go when the subject or the actor closes their account.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    subjectId: uuid("subject_id").notNull(),
    category: dataCategoryEnum("category"),
    childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_subject_created_idx").on(table.subjectId, table.createdAt),
    index("audit_events_actor_occurred_idx").on(table.actorId, table.occurredAt),
    uniqueIndex("audit_events_dedupe_key_unique")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
  ],
).enableRLS();

/** Ids only, never content (architecture record 10.1). */
export type JobPayload = Record<string, string | string[]>;

/**
 * The outbox (architecture record 10.1), written in the same transaction as
 * the change that caused the work. Drains claim rows with `SELECT ... FOR
 * UPDATE SKIP LOCKED`; a claimed row carries `locked_at`. Every job is
 * retried with backoff and moved to `dead` after five attempts, where the
 * sweep's owner notice finds it. Not subject-scoped, so no RLS; jobs that
 * act for one person run inside `withActor`.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").$type<JobPayload>().notNull().default({}),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    status: jobStatusEnum("status").notNull().default("queued"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jobs_status_run_after_idx").on(table.status, table.runAfter)],
);

/**
 * Idempotency rows (architecture record 5.3): one per actor and key, written
 * `in_flight` before the handler runs and set to `done` afterwards with the
 * created resource's id, the response status and a hash of the response
 * body (task E1). A replay answers the stored status and, for a created
 * resource, its id and location; no request or response body is ever stored
 * here, because for notes it would hold decrypted text outside the encrypted
 * column. The sweep deletes rows older than 24 hours. Not subject-scoped, so
 * no RLS.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: uuid("key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    state: idempotencyStateEnum("state").notNull().default("in_flight"),
    resourceId: uuid("resource_id"),
    responseStatus: integer("response_status"),
    responseHash: text("response_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_actor_key_unique").on(table.actorId, table.key),
    check(
      "idempotency_keys_done_has_response",
      sql`(${table.state} = 'done') = (${table.responseStatus} is not null and ${table.responseHash} is not null)`,
    ),
  ],
);

/**
 * The state machines of architecture record 11: export, closure, access and
 * deletion requests, each with the 45 day `deadline_at` and, for a closure,
 * the `undo_until` of the seven day window. A request from someone without
 * an account (an invitee, a former partner) has no `user_id` and is keyed by
 * `email_hmac`, so the 45 day clock runs for them too.
 */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    emailHmac: text("email_hmac"),
    kind: dataRequestKindEnum("kind").notNull(),
    state: dataRequestStateEnum("state").notNull().default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    undoUntil: timestamp("undo_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("data_requests_user_idx").on(table.userId),
    index("data_requests_state_deadline_idx").on(table.state, table.deadlineAt),
    // One open closure per person (task B13): a second guard behind the
    // advisory lock the close route takes, so two concurrent closures can
    // never both be filed. The open states are the ones the account and
    // profile routes treat as open.
    uniqueIndex("data_requests_open_closure_unique")
      .on(table.userId)
      .where(sql`${table.kind} = 'closure' and ${table.state} in ('requested', 'in_progress')`),
    check(
      "data_requests_has_a_requester",
      sql`${table.userId} is not null or ${table.emailHmac} is not null`,
    ),
    check(
      "data_requests_undo_is_for_closure",
      sql`${table.undoUntil} is null or ${table.kind} = 'closure'`,
    ),
    check(
      "data_requests_completed_matches_state",
      sql`(${table.state} in ('completed', 'cancelled', 'refused')) = (${table.completedAt} is not null)`,
    ),
  ],
).enableRLS();

/**
 * Daily aggregate counts only (architecture record 7.4): product and
 * operational counters by day and name, never a user id or anything that
 * could become one. Kept 90 days. No RLS, because nothing here belongs to a
 * person.
 */
export const productEvents = pgTable(
  "product_events",
  {
    id: uuid("id").primaryKey(),
    day: date("day", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_events_day_name_unique").on(table.day, table.name),
    check("product_events_count_is_not_negative", sql`${table.count} >= 0`),
  ],
);

/**
 * The per-user ledger of every third party or affiliate data was shared
 * with, with a contact mechanism for each (RCW 19.373.040(1)(a)). Empty in
 * v1, because a grant to a partner is a disclosure to a consumer, not
 * sharing; the access right returns this list.
 */
export const disclosures = pgTable(
  "disclosures",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    contact: text("contact").notNull(),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("disclosures_user_idx").on(table.userId)],
).enableRLS();
