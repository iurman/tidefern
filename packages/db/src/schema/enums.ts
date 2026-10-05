import { pgEnum } from "drizzle-orm/pg-core";

// Every closed vocabulary in the schema is a Postgres enum, not a text
// column with a check constraint. Growing an enum is `ALTER TYPE ... ADD
// VALUE`, an additive statement the build's migration runner applies on its
// own; replacing a check constraint needs a DROP first, which the runner
// refuses outside the owner-triggered workflow. The values mirror the Zod
// enums in packages/schemas, which the API validates against before a row
// is written. The lists are written out here rather than imported so that
// drizzle-kit never has to load zod to read the schema; this package depends
// on schemas only for the vocabulary seed (src/seed/vocabulary.ts) and the
// tests that pin every list below to its Zod twin.

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

/** Household roles of architecture record 7.4. Membership grants nothing by itself. */
export const householdRoleValues = ["owner", "partner", "guardian"] as const;
export const householdRoleEnum = pgEnum("household_role", householdRoleValues);

/** A membership is active until the person leaves or is removed. */
export const membershipStatusValues = ["active", "ended"] as const;
export const membershipStatusEnum = pgEnum("membership_status", membershipStatusValues);

/**
 * Mirrors `ShareCategory` in packages/schemas: what a grant can name.
 * `journal.private` is absent on purpose; it can never be granted.
 */
export const shareCategoryValues = [
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
] as const;
export const shareCategoryEnum = pgEnum("share_category", shareCategoryValues);

/**
 * Mirrors `Category` in packages/core: every category data can be filed
 * under, the private journal included. Consents and audit events use it,
 * because collection is consented to and read for every category.
 */
export const dataCategoryValues = [
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "journal.private",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
] as const;
export const dataCategoryEnum = pgEnum("data_category", dataCategoryValues);

/** Mirrors `ShareLevel` in packages/schemas. */
export const shareLevelValues = ["summary", "read", "contribute"] as const;
export const shareLevelEnum = pgEnum("share_level", shareLevelValues);

/**
 * The legal basis of a consent row (architecture record 7.4): `necessary`
 * for data the person asked the product to hold in order to work, `consent`
 * for anything collected for a specified purpose beyond that.
 */
export const consentBasisValues = ["necessary", "consent"] as const;
export const consentBasisEnum = pgEnum("consent_basis", consentBasisValues);

/** Mirrors `FlowLevel` in packages/schemas. */
export const flowLevelValues = ["none", "spotting", "light", "medium", "heavy"] as const;
export const flowLevelEnum = pgEnum("flow_level", flowLevelValues);

/** Mirrors `SymptomCode` in packages/schemas. */
export const symptomCodeValues = [
  "cramps",
  "headache",
  "bloating",
  "fatigue",
  "tender_breasts",
  "nausea",
  "backache",
  "acne",
  "cravings",
  "insomnia",
  "spotting",
  "discharge",
  "hot_flashes",
  "dizziness",
  "mood_swings",
  "anxiety",
  "low_energy",
  "high_energy",
  "other",
] as const;
export const symptomCodeEnum = pgEnum("symptom_code", symptomCodeValues);

/** Mirrors `MoodCode` in packages/schemas. */
export const moodCodeValues = ["low", "steady", "bright"] as const;
export const moodCodeEnum = pgEnum("mood_code", moodCodeValues);

/** The lists the `vocabulary` table holds, one per picker. */
export const vocabularyKindValues = ["flow", "symptom", "mood"] as const;
export const vocabularyKindEnum = pgEnum("vocabulary_kind", vocabularyKindValues);

/** Mirrors `PredictionBasis` in packages/core. */
export const predictionBasisValues = [
  "first_guess",
  "estimate",
  "not_enough_regular_cycles",
] as const;
export const predictionBasisEnum = pgEnum("prediction_basis", predictionBasisValues);

/** Mirrors `DatingMethod` in packages/core (ACOG Committee Opinion 700). */
export const datingMethodValues = ["lmp", "ultrasound", "transfer", "manual"] as const;
export const datingMethodEnum = pgEnum("dating_method", datingMethodValues);

/** Mirrors `EndedReason` in packages/core. Shown to nobody but her. */
export const endedReasonValues = ["birth", "loss", "other"] as const;
export const endedReasonEnum = pgEnum("ended_reason", endedReasonValues);

/** Pregnancy events are appointments and milestones only; symptoms live on the day sheet. */
export const pregnancyEventKindValues = ["appointment", "milestone"] as const;
export const pregnancyEventKindEnum = pgEnum("pregnancy_event_kind", pregnancyEventKindValues);

/** Mirrors `Sex` in packages/core: what the WHO and CDC growth references are keyed by. */
export const sexValues = ["female", "male"] as const;
export const sexEnum = pgEnum("sex", sexValues);

/** What a child event records (architecture record 8.2): milestones, feeds, sleep, diapers. */
export const childEventKindValues = ["milestone", "feed", "sleep", "diaper"] as const;
export const childEventKindEnum = pgEnum("child_event_kind", childEventKindValues);

/** Mirrors `NoteCategory` in packages/schemas: where a note is filed decides who can read it. */
export const noteCategoryValues = [
  "journal.private",
  "cycle.symptoms",
  "pregnancy.overview",
] as const;
export const noteCategoryEnum = pgEnum("note_category", noteCategoryValues);

/** A photo's category follows its subject (architecture record 8.2). */
export const photoCategoryValues = ["pregnancy.photos", "child"] as const;
export const photoCategoryEnum = pgEnum("photo_category", photoCategoryValues);

/** Upload lifecycle: finalized rows start `pending` until the variants exist. */
export const photoStatusValues = ["pending", "ready", "failed"] as const;
export const photoStatusEnum = pgEnum("photo_status", photoStatusValues);

/** The server-generated renditions of a photo. */
export const photoVariantKindValues = ["thumbnail", "preview", "full"] as const;
export const photoVariantKindEnum = pgEnum("photo_variant_kind", photoVariantKindValues);

/** Outbox job states (architecture record 10.1); `dead` after five attempts. */
export const jobStatusValues = ["queued", "running", "done", "failed", "dead"] as const;
export const jobStatusEnum = pgEnum("job_status", jobStatusValues);

/** Idempotency row states (architecture record 5.3). */
export const idempotencyStateValues = ["in_flight", "done"] as const;
export const idempotencyStateEnum = pgEnum("idempotency_state", idempotencyStateValues);

/** The data rights of architecture record 11 that run as state machines. */
export const dataRequestKindValues = ["export", "closure", "access", "deletion"] as const;
export const dataRequestKindEnum = pgEnum("data_request_kind", dataRequestKindValues);

/** Where a data request stands; `cancelled` is a closure undone inside its window. */
export const dataRequestStateValues = [
  "requested",
  "in_progress",
  "completed",
  "cancelled",
  "refused",
] as const;
export const dataRequestStateEnum = pgEnum("data_request_state", dataRequestStateValues);
