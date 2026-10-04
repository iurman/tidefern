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
  type: z.url().describe("A URI that identifies the problem type"),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().describe("Stable machine-readable code such as validation_failed"),
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

export const Stage = z.enum(["cycle", "pregnancy", "postpartum"]);
export type Stage = z.infer<typeof Stage>;

export const CycleEntryInput = z.object({
  date: CalendarDate,
  flow: z.enum(["none", "spotting", "light", "medium", "heavy"]).optional(),
  symptoms: z.array(z.string().min(1).max(40)).max(30).default([]),
  mood: z.enum(["low", "steady", "bright"]).optional(),
  note: z.string().max(4000).optional().describe("Encrypted at rest with the subject's data key"),
});
export type CycleEntryInput = z.infer<typeof CycleEntryInput>;
