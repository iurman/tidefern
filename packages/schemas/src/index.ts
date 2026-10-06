import { z } from "zod";

/** Calendar facts are dates, never timestamps. ISO 8601 YYYY-MM-DD. */
export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .describe("Calendar date in the subject's time zone");
export type CalendarDate = z.infer<typeof CalendarDate>;

/** Opaque identifiers only. UUIDv7 on the server, never sequential. */
export const Id = z.uuid().describe("Opaque resource identifier");

/** RFC 9457 problem details. The only error shape the API emits. */
export const Problem = z.object({
  type: z
    .string()
    .regex(/^urn:tidefern:problem:[a-z_]+$/)
    .describe("A stable URN that identifies the problem type; it never depends on a domain"),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z
    .enum([
      "validation_failed",
      "unauthenticated",
      "forbidden",
      "not_found",
      "conflict",
      "rate_limited",
      "upgrade_required",
      "internal",
    ])
    .describe(
      "Stable machine-readable code. forbidden is used only for origin and cross-site failures; denied access is not_found.",
    ),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe("Field level validation errors when applicable"),
});
export type Problem = z.infer<typeof Problem>;

export const Health = z.object({
  status: z.literal("ok"),
  service: z.literal("tidefern-api"),
  version: z.string(),
  time: z.iso.datetime(),
});
export type Health = z.infer<typeof Health>;

/** Sharing is explicit, category scoped and revocable. Membership alone grants nothing. */
export const ShareCategory = z.enum([
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
]);
export type ShareCategory = z.infer<typeof ShareCategory>;

export const ShareLevel = z.enum(["summary", "read", "contribute"]);
export type ShareLevel = z.infer<typeof ShareLevel>;

/**
 * A body stage, or `none` for a household member who tracks nothing about
 * her own body (a partner, a guardian). Nobody is asked to pick a stage that
 * is not theirs.
 */
export const Stage = z.enum(["none", "cycle", "pregnancy", "postpartum"]);
export type Stage = z.infer<typeof Stage>;

/**
 * Controlled vocabularies are closed enums so they can live in plaintext
 * columns and render as pickers in every client. Free text goes only into
 * fields the API encrypts. Adding a value is additive; clients show an
 * unknown value as "other" and never fail to parse.
 */
export const FlowLevel = z.enum(["none", "spotting", "light", "medium", "heavy"]);
export type FlowLevel = z.infer<typeof FlowLevel>;

export const SymptomCode = z.enum([
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
]);
export type SymptomCode = z.infer<typeof SymptomCode>;

export const MoodCode = z.enum(["low", "steady", "bright"]);
export type MoodCode = z.infer<typeof MoodCode>;

/**
 * A day entry holds only vocabulary values. Free text never rides on it: the
 * day sheet's note is a separate `NoteInput`, stored encrypted in its own row
 * under `journal.private` unless the author files it elsewhere, so a grant to
 * symptoms can never carry a private note along.
 */
export const CycleEntryInput = z.object({
  id: z.uuid().optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
  date: CalendarDate,
  flow: FlowLevel.optional(),
  symptoms: z.array(SymptomCode).max(30).default([]),
  mood: MoodCode.optional(),
});
export type CycleEntryInput = z.infer<typeof CycleEntryInput>;

/** Where a note is filed decides who can ever read it. Private is the default. */
export const NoteCategory = z.enum(["journal.private", "cycle.symptoms", "pregnancy.overview"]);
export type NoteCategory = z.infer<typeof NoteCategory>;

export const NoteInput = z.object({
  id: z.uuid().optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
  date: CalendarDate,
  category: NoteCategory.default("journal.private"),
  body: z.string().min(1).max(4000).describe("Encrypted at rest with the subject's data key"),
});
export type NoteInput = z.infer<typeof NoteInput>;

export * from "./notes";
export * from "./sharing";
export * from "./pregnancy";
export * from "./children";
export * from "./account";
export * from "./cycle";
/** Task E2: the profile, consent and data summary shapes. */
export * from "./profile";
