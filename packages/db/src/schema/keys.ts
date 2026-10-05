import { customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { subjectKindEnum } from "./enums";

// drizzle-orm 0.45.3 ships no bytea column; this is the one place it is
// declared. Both drivers (node-postgres and PGlite) hand bytea back as a
// Uint8Array (a Buffer in node-postgres, which is one), so the round trip
// is bytes in, bytes out.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value;
  },
});

/**
 * One wrapped data encryption key per subject, user or child. The key is
 * stored only wrapped under the KEK that `kek_provider` and `kek_version`
 * name (architecture record 9.2), and `subject_id` carries no foreign key
 * because a child id and a user id both land here.
 *
 * NO LOGICAL DUMP MAY INCLUDE THIS TABLE. Account deletion destroys the
 * wrapped key so the live rows become unreadable at once; copies exist only
 * in Neon's point-in-time history and age out with it. Any pg_dump or export
 * added later excludes `subject_keys` (architecture record 9.2, item 5).
 */
export const subjectKeys = pgTable("subject_keys", {
  subjectId: uuid("subject_id").primaryKey(),
  kind: subjectKindEnum("kind").notNull(),
  wrappedDek: bytea("wrapped_dek").notNull(),
  kekProvider: text("kek_provider").notNull(),
  kekVersion: text("kek_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
}).enableRLS();
