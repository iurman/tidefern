import { z } from "zod";

/**
 * The pregnancy contract (architecture 7.4, 8.2 and 8.4): one open record
 * per subject dated by ACOG CO 700, appended due date changes she alone
 * reads, events for appointments and milestones with free text only in the
 * encrypted detail, and an ending whose reason is shown to nobody but her.
 * Reusable shapes carry `.meta({ id })`, which zod-to-openapi turns into
 * named components.
 */

// Mirrors of `CalendarDate` and `Id` in index.ts. That file re-exports this
// module, so importing them back would evaluate this file before those
// bindings exist; pregnancy.test.ts pins both to the originals.
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .describe("Calendar date in the subject's time zone");
const ResourceId = z.uuid().describe("Opaque resource identifier");
const Instant = z.iso.datetime().describe("RFC 3339 instant in UTC");
const Version = z.int().min(1).describe("Row version; send it back as If-Match on an update");

/** Mirrors `DatingMethod` in packages/core (ACOG Committee Opinion 700). */
export const DatingMethod = z
  .enum(["lmp", "ultrasound", "transfer", "manual"])
  .meta({ id: "DatingMethod", description: "How the due date was worked out" });
export type DatingMethod = z.infer<typeof DatingMethod>;

/** Mirrors `EndedReason` in packages/core. Stored, and shown to nobody but her. */
export const EndedReason = z
  .enum(["birth", "loss", "other"])
  .meta({ id: "EndedReason", description: "Why a pregnancy ended; never projected for a grantee" });
export type EndedReason = z.infer<typeof EndedReason>;

/** Appointments and milestones only; symptoms in any stage live on the day sheet. */
export const PregnancyEventKind = z
  .enum(["appointment", "milestone"])
  .meta({ id: "PregnancyEventKind", description: "What a pregnancy event records" });
export type PregnancyEventKind = z.infer<typeof PregnancyEventKind>;

/**
 * The dating input, one variant per method: the last period's first day,
 * a scan with the gestational age it measured, a transfer with the
 * embryo's age in days, or a due date given as is. The API computes the
 * due date through packages/core and never trusts one the client derived.
 */
export const PregnancyDatingInput = z
  .discriminatedUnion("method", [
    z.object({
      method: z.literal("lmp"),
      lastPeriodStart: Day.describe("First day of the last period"),
    }),
    z.object({
      method: z.literal("ultrasound"),
      scanDate: Day.describe("The day of the scan"),
      weeks: z.int().min(0).max(42).describe("Gestational weeks the scan measured"),
      days: z.int().min(0).max(6).describe("Gestational days beyond the weeks"),
    }),
    z.object({
      method: z.literal("transfer"),
      transferDate: Day.describe("The day of the embryo transfer"),
      embryoAgeDays: z.int().min(1).max(7).describe("The embryo's age at transfer in days"),
    }),
    z.object({
      method: z.literal("manual"),
      dueDate: Day.describe("A due date a clinician gave"),
    }),
  ])
  .meta({ id: "PregnancyDatingInput", description: "A dating method and its input" });
export type PregnancyDatingInput = z.infer<typeof PregnancyDatingInput>;

export const PregnancyStartInput = z
  .object({
    id: z.uuidv7().optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
    dating: PregnancyDatingInput,
  })
  .meta({ id: "PregnancyStartInput", description: "Starts a pregnancy for the signed-in subject" });
export type PregnancyStartInput = z.infer<typeof PregnancyStartInput>;

/** Weeks and days counted from the due date minus 280 days, as of today in the subject's zone. */
export const GestationalAge = z
  .object({
    weeks: z.int().min(0),
    days: z.int().min(0).max(6),
    totalDays: z.int().min(0),
    trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    label: z.string().describe("The 38w1d style label every client shows"),
  })
  .meta({ id: "GestationalAge", description: "Gestational age as of today" });
export type GestationalAge = z.infer<typeof GestationalAge>;

/** Her own view of a pregnancy: the whole record. */
export const Pregnancy = z
  .object({
    id: ResourceId,
    subjectId: ResourceId,
    status: z.enum(["active", "ended"]),
    dueDate: Day,
    datingMethod: DatingMethod,
    startedAt: Instant.describe("When the record was created; not a calendar fact"),
    endedAt: Day.nullable(),
    endedReason: EndedReason.nullable(),
    gestation: GestationalAge.nullable().describe("Null once the pregnancy has ended"),
    version: Version,
    createdAt: Instant,
    updatedAt: Instant,
  })
  .meta({ id: "Pregnancy", description: "A pregnancy as its subject sees it" });
export type Pregnancy = z.infer<typeof Pregnancy>;

/**
 * What a `pregnancy.overview` grantee sees while the pregnancy continues:
 * the week and the due date, never the dating method, the ending or the
 * due date history.
 */
export const PregnancyOverview = z
  .object({
    status: z.literal("active"),
    id: ResourceId,
    subjectId: ResourceId,
    dueDate: Day,
    gestation: GestationalAge,
    version: Version,
  })
  .meta({ id: "PregnancyOverview", description: "A pregnancy as a grantee sees it" });
export type PregnancyOverview = z.infer<typeof PregnancyOverview>;

/** A grantee's view once the pregnancy has ended: no week, no due date, no dates (architecture 8.4). */
export const PregnancyPaused = z.object({ status: z.literal("paused") }).meta({
  id: "PregnancyPaused",
  description: "The neutral paused state a grantee sees after an ending",
});
export type PregnancyPaused = z.infer<typeof PregnancyPaused>;

export const PregnancyView = z
  .union([Pregnancy, PregnancyOverview, PregnancyPaused])
  .meta({ id: "PregnancyView", description: "The pregnancy projected for the actor's access" });
export type PregnancyView = z.infer<typeof PregnancyView>;

export const PregnancyEndInput = z
  .object({
    endedAt: Day.describe("The calendar day the pregnancy ended"),
    reason: EndedReason,
  })
  .meta({ id: "PregnancyEndInput", description: "Ends a pregnancy; the reason stays hers" });
export type PregnancyEndInput = z.infer<typeof PregnancyEndInput>;

/** One appended change of the due date, oldest first in the history. */
export const DueDateChange = z
  .object({
    id: ResourceId,
    previousDueDate: Day,
    nextDueDate: Day,
    method: DatingMethod,
    changedAt: Instant,
  })
  .meta({ id: "DueDateChange", description: "A change of the due date, visible to her only" });
export type DueDateChange = z.infer<typeof DueDateChange>;

export const DueDateChangeList = z
  .object({
    items: z.array(DueDateChange),
    nextCursor: z.string().nullable().describe("Opaque cursor for the next page, or null"),
  })
  .meta({ id: "DueDateChangeList" });
export type DueDateChangeList = z.infer<typeof DueDateChangeList>;

/** The free text of an event goes only into `detail`, which the API encrypts under the subject's key. */
export const PregnancyEventInput = z
  .object({
    id: z.uuidv7().optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
    kind: PregnancyEventKind,
    date: Day,
    detail: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Free text, encrypted at rest with the subject's data key"),
  })
  .meta({ id: "PregnancyEventInput", description: "An appointment or milestone" });
export type PregnancyEventInput = z.infer<typeof PregnancyEventInput>;

/** An update carries the whole event again; the id is the path's. */
export const PregnancyEventUpdate = PregnancyEventInput.omit({ id: true }).meta({
  id: "PregnancyEventUpdate",
  description: "The replacement kind, date and detail of an event",
});
export type PregnancyEventUpdate = z.infer<typeof PregnancyEventUpdate>;

export const PregnancyEvent = z
  .object({
    id: ResourceId,
    pregnancyId: ResourceId,
    subjectId: ResourceId,
    authorId: ResourceId.nullable()
      .optional()
      .describe("Who wrote it; absent at the summary level"),
    kind: PregnancyEventKind,
    date: Day,
    detail: z
      .string()
      .nullable()
      .optional()
      .describe("The decrypted free text, or null; absent at the summary level"),
    version: Version,
    createdAt: Instant,
    updatedAt: Instant,
  })
  .meta({
    id: "PregnancyEvent",
    description: "An appointment or milestone as the actor may see it",
  });
export type PregnancyEvent = z.infer<typeof PregnancyEvent>;

/** What a deleted event leaves behind for a syncing client: ids and the instant, no content. */
export const PregnancyEventTombstone = z
  .object({
    id: ResourceId,
    pregnancyId: ResourceId,
    subjectId: ResourceId,
    deletedAt: Instant,
    version: Version,
  })
  .meta({
    id: "PregnancyEventTombstone",
    description: "A deleted event, listed only with updatedSince",
  });
export type PregnancyEventTombstone = z.infer<typeof PregnancyEventTombstone>;

export const PregnancyEventList = z
  .object({
    items: z.array(z.union([PregnancyEvent, PregnancyEventTombstone])),
    nextCursor: z.string().nullable().describe("Opaque cursor for the next page, or null"),
  })
  .meta({ id: "PregnancyEventList" });
export type PregnancyEventList = z.infer<typeof PregnancyEventList>;
