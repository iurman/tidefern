import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema";
import { datingMethodEnum, endedReasonEnum, pregnancyEventKindEnum } from "./enums";
import { bytea } from "./keys";

/**
 * The pregnancy record of architecture record 7.4 and 8.4, the shape core's
 * `Pregnancy` serializes. Several per subject over time, one open at a time.
 * `due_date` and `ended_at` are calendar facts; `started_at` is the instant
 * the record was created. `ended_reason` is written together with
 * `ended_at` and projected for nobody but her (the storage map in 8.2).
 */
export const pregnancies = pgTable(
  "pregnancies",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    datingMethod: datingMethodEnum("dating_method").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: date("ended_at", { mode: "string" }),
    endedReason: endedReasonEnum("ended_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pregnancies_subject_idx").on(table.subjectId),
    uniqueIndex("pregnancies_subject_open_unique")
      .on(table.subjectId)
      .where(sql`${table.endedAt} is null and ${table.deletedAt} is null`),
    check(
      "pregnancies_ended_reason_matches_ended_at",
      sql`(${table.endedAt} is null) = (${table.endedReason} is null)`,
    ),
  ],
).enableRLS();

/**
 * Appointments and milestones (architecture record 7.4); symptoms in any
 * stage live on the day sheet. The event's day is a calendar fact. Its
 * label is free text, so it is stored encrypted under the subject's DEK with
 * the sibling `kek_version` (architecture record 7.3), or left empty. The
 * author may be a partner with a `contribute` grant; the subject owns the
 * row either way.
 */
export const pregnancyEvents = pgTable(
  "pregnancy_events",
  {
    id: uuid("id").primaryKey(),
    pregnancyId: uuid("pregnancy_id")
      .notNull()
      .references(() => pregnancies.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    kind: pregnancyEventKindEnum("kind").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    label: bytea("label"),
    kekVersion: text("kek_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("pregnancy_events_pregnancy_date_idx").on(table.pregnancyId, table.date),
    index("pregnancy_events_subject_idx").on(table.subjectId),
    check(
      "pregnancy_events_label_has_kek_version",
      sql`(${table.label} is null) = (${table.kekVersion} is null)`,
    ),
  ],
).enableRLS();

/**
 * Every change of the due date, appended by core's `changeDueDate` and never
 * edited (architecture record 8.4): the previous and the new value, the
 * dating method, and the instant she acted. Projected for her only; a
 * partner's view follows the new due date without a notification.
 */
export const dueDateChanges = pgTable(
  "due_date_changes",
  {
    id: uuid("id").primaryKey(),
    pregnancyId: uuid("pregnancy_id")
      .notNull()
      .references(() => pregnancies.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    previousDueDate: date("previous_due_date", { mode: "string" }).notNull(),
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    method: datingMethodEnum("method").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("due_date_changes_pregnancy_idx").on(table.pregnancyId, table.changedAt),
    check("due_date_changes_is_a_change", sql`${table.previousDueDate} <> ${table.nextDueDate}`),
  ],
).enableRLS();
