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
import { childEventKindEnum, sexEnum } from "./enums";
import { bytea } from "./keys";
import { households } from "./relationships";

/**
 * A child belongs to a household and is co-owned by its guardians
 * (architecture record 7.4 and 8.1); the child is the subject of every row
 * about it, and `subject_keys` holds its own wrapped key. `date_of_birth` is
 * a calendar fact. `sex` is what the WHO and CDC growth references are keyed
 * by and may be left unset until a measurement needs a percentile. The
 * household reference is `RESTRICT`: a household with children is wound
 * down explicitly (transfer, then closure), never by a cascade.
 */
export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    sex: sexEnum("sex"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("children_household_idx").on(table.householdId)],
).enableRLS();

/** Guardianship, many to many, each guardian with full rights over the child. */
export const childGuardians = pgTable(
  "child_guardians",
  {
    id: uuid("id").primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("child_guardians_child_user_unique").on(table.childId, table.userId),
    index("child_guardians_user_idx").on(table.userId),
  ],
).enableRLS();

/**
 * Milestones, feeds, sleep and diapers (architecture record 8.2). The day is
 * a calendar fact; a feed or a sleep also carries instants, a sleep as a
 * span. `milestone_id` is core's checklist item key (`<months>m-<domain>-<n>`)
 * and is set exactly for milestones. `quantity_ml` is the SI volume of a
 * feed. Any free text goes in `note`, encrypted under the child's DEK with
 * the sibling `kek_version`. The author may be any guardian or a partner
 * with a `contribute` grant for this child.
 */
export const childEvents = pgTable(
  "child_events",
  {
    id: uuid("id").primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    kind: childEventKindEnum("kind").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    milestoneId: text("milestone_id"),
    quantityMl: integer("quantity_ml"),
    note: bytea("note"),
    kekVersion: text("kek_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("child_events_child_date_idx").on(table.childId, table.date),
    check(
      "child_events_milestone_id_matches_kind",
      sql`(${table.kind} = 'milestone') = (${table.milestoneId} is not null)`,
    ),
    check(
      "child_events_span_is_ordered",
      sql`${table.endedAt} is null or ${table.startedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    check(
      "child_events_quantity_is_positive",
      sql`${table.quantityMl} is null or ${table.quantityMl} > 0`,
    ),
    check(
      "child_events_note_has_kek_version",
      sql`(${table.note} is null) = (${table.kekVersion} is null)`,
    ),
  ],
).enableRLS();

/**
 * One measurement session: weight in grams, length in millimetres and head
 * circumference in millimetres, each optional but at least one present.
 * Stored as SI integers and converted at the edge with the exact NIST
 * factors in packages/core (architecture record 7.4); imperial is a display
 * choice. Percentiles are computed on read by core's growth engine from
 * `date` and the child's date of birth and sex, never stored.
 */
export const childMeasurements = pgTable(
  "child_measurements",
  {
    id: uuid("id").primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    weightGrams: integer("weight_grams"),
    lengthMillimetres: integer("length_millimetres"),
    headMillimetres: integer("head_millimetres"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("child_measurements_child_date_idx").on(table.childId, table.date),
    check(
      "child_measurements_has_a_value",
      sql`${table.weightGrams} is not null or ${table.lengthMillimetres} is not null or ${table.headMillimetres} is not null`,
    ),
    check(
      "child_measurements_values_are_positive",
      sql`(${table.weightGrams} is null or ${table.weightGrams} > 0) and (${table.lengthMillimetres} is null or ${table.lengthMillimetres} > 0) and (${table.headMillimetres} is null or ${table.headMillimetres} > 0)`,
    ),
  ],
).enableRLS();
