import { pgEnum } from "drizzle-orm/pg-core";

// Every closed vocabulary in the schema is a Postgres enum, not a text
// column with a check constraint. Growing an enum is `ALTER TYPE ... ADD
// VALUE`, an additive statement the build's migration runner applies on its
// own; replacing a check constraint needs a DROP first, which the runner
// refuses outside the owner-triggered workflow. The values mirror the Zod
// enums in packages/schemas, which the API validates against before a row
// is written; this package does not depend on schemas, so the list is
// written out here on purpose and schema.test.ts pins it.

/** Mirrors `Stage` in packages/schemas. */
export const stageValues = ["none", "cycle", "pregnancy", "postpartum"] as const;
export const stageEnum = pgEnum("stage", stageValues);

/** A display choice; measurements are stored as SI integers regardless. */
export const unitsValues = ["metric", "imperial"] as const;
export const unitsEnum = pgEnum("units", unitsValues);

/** The three notification detail levels of architecture record 10.3. */
export const notificationDetailValues = ["generic", "gentle", "detailed"] as const;
export const notificationDetailEnum = pgEnum("notification_detail", notificationDetailValues);

/** Who a `subject_keys` row belongs to: a user or a child. */
export const subjectKindValues = ["user", "child"] as const;
export const subjectKindEnum = pgEnum("subject_kind", subjectKindValues);
