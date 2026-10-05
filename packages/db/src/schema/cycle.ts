import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema";
import {
  flowLevelEnum,
  moodCodeEnum,
  predictionBasisEnum,
  symptomCodeEnum,
  vocabularyKindEnum,
} from "./enums";

/**
 * The day sheet (architecture record 7.4 and 8.2). One row per subject and
 * calendar date, written with PUT; `date` is a calendar fact read in the
 * profile's time zone, never a timestamp. `date` and `flow` file under
 * `cycle.history`, `mood` under `cycle.symptoms`; the day's note is never a
 * column here, it is a `notes` row (task B7), so a grant to symptoms can
 * never carry a private note along.
 */
export const cycleEntries = pgTable(
  "cycle_entries",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    flow: flowLevelEnum("flow"),
    mood: moodCodeEnum("mood"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("cycle_entries_subject_date_unique").on(table.subjectId, table.date)],
).enableRLS();

/**
 * One row per symptom logged on a day. `subject_id` repeats the entry's
 * subject so the B8 policy can decide per row without a join.
 */
export const entrySymptoms = pgTable(
  "entry_symptoms",
  {
    id: uuid("id").primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => cycleEntries.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    code: symptomCodeEnum("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("entry_symptoms_entry_code_unique").on(table.entryId, table.code),
    index("entry_symptoms_subject_idx").on(table.subjectId),
  ],
).enableRLS();

/**
 * The derived prediction of core's `predictCycle`, regenerated on every
 * write of a period start and cleared when a pregnancy ends (architecture
 * record 8.4). One live row per subject; a regenerated row replaces it and
 * the old one keeps only its tombstone for the sync queue. The dates are
 * calendar facts and the band widths are days.
 */
export const cyclePredictions = pgTable(
  "cycle_predictions",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    basis: predictionBasisEnum("basis").notNull(),
    cycleLength: smallint("cycle_length"),
    sampleSize: smallint("sample_size").notNull().default(0),
    nextPeriodStart: date("next_period_start", { mode: "string" }),
    ovulation: date("ovulation", { mode: "string" }),
    fertileWindowStart: date("fertile_window_start", { mode: "string" }),
    fertileWindowEnd: date("fertile_window_end", { mode: "string" }),
    uncertaintyDays: smallint("uncertainty_days").notNull(),
    ovulationBandDays: smallint("ovulation_band_days").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("cycle_predictions_subject_live_unique")
      .on(table.subjectId)
      .where(sql`${table.deletedAt} is null`),
  ],
).enableRLS();

/**
 * The controlled vocabularies as rows, seeded from the Zod enums in
 * packages/schemas by `seedVocabulary` (architecture record 5.1) so the
 * vocabulary route can list them with their order. Reference data, not user
 * data: it stays outside RLS and its key is the natural `(kind, code)` pair,
 * which is what makes the seed idempotent.
 */
export const vocabulary = pgTable(
  "vocabulary",
  {
    kind: vocabularyKindEnum("kind").notNull(),
    code: text("code").notNull(),
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: "vocabulary_pkey", columns: [table.kind, table.code] })],
);
