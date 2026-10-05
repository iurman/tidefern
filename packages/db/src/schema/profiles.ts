import { sql } from "drizzle-orm";
import { check, integer, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema";
import { notificationDetailEnum, stageEnum, unitsEnum } from "./enums";

/**
 * One row per user, keyed by the Better Auth user id (a uuid, matching the
 * generated `user.id` column). Calendar facts elsewhere are dates read in
 * `time_zone`, an IANA name the API validates with core's isKnownTimeZone.
 * `age_attested_at` records the sign-up attestation of being 18 or older;
 * no date of birth is stored (architecture record 7.4).
 *
 * The B8 policies bind this table to the actor; `.enableRLS()` here already
 * leaves the app role with zero rows until they land.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    timeZone: text("time_zone").notNull(),
    stage: stageEnum("stage").notNull().default("none"),
    // Intl convention: 1 is Monday, 7 is Sunday.
    weekStart: smallint("week_start").notNull().default(1),
    units: unitsEnum("units").notNull().default("metric"),
    notificationDetail: notificationDetailEnum("notification_detail").notNull().default("generic"),
    ageAttestedAt: timestamp("age_attested_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    // A content-free tombstone for the sync queue (architecture record 7.3).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [check("profiles_week_start_range", sql`${table.weekStart} between 1 and 7`)],
).enableRLS();
