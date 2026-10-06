import { z } from "zod";

// The index re-exports this module, so importing the index back from here
// would be a cycle that ESM evaluates in the wrong order; the two primitives
// are repeated with the same shape as the index's `Id` and `CalendarDate`.
const Id = z.uuid().describe("Opaque resource identifier");
/** Architecture 5.1: an id a client mints for a create is validated as UUIDv7. */
const ClientId = z.uuidv7().describe("Optional client-minted UUIDv7 for offline-first clients");
const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .describe("Calendar date in the subject's time zone");

/**
 * The children area (architecture record 8.2, the `child` category per
 * child). Every shape here is plaintext vocabulary, numbers and dates; the
 * one free-text field, an event's note, is encrypted under the child's key
 * before it reaches a column.
 */

/** What the WHO and CDC growth references are keyed by; unset until a percentile needs it. */
export const Sex = z.enum(["female", "male"]);
export type Sex = z.infer<typeof Sex>;

/** Mirrors the `child_event_kind` enum in the database. */
export const ChildEventKind = z.enum(["milestone", "feed", "sleep", "diaper"]);
export type ChildEventKind = z.infer<typeof ChildEventKind>;

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date that exists; the regex alone accepts 2026-02-31. */
function isRealDate(value: string): boolean {
  const match = DATE_PARTS.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export const RealCalendarDate = CalendarDate.refine(
  isRealDate,
  "Expected a calendar date that exists",
);

/** RFC 3339 instant; the API answers them in UTC with three fractional digits. */
const Instant = z.iso.datetime({ offset: true });

const DisplayName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe("How the family calls the child; shown to every guardian and child grantee");

/** The create body: an offline client may mint the id (architecture record 5.1). */
export const ChildInput = z
  .object({
    id: ClientId.optional(),
    displayName: DisplayName,
    dateOfBirth: RealCalendarDate,
    sex: Sex.optional(),
  })
  .meta({ id: "ChildInput", description: "Creates a child in the actor's household" });
export type ChildInput = z.infer<typeof ChildInput>;

/** The update body replaces the three editable facts; `sex: null` clears it. */
export const ChildUpdate = z
  .object({
    displayName: DisplayName,
    dateOfBirth: RealCalendarDate,
    sex: Sex.nullable().optional(),
  })
  .meta({ id: "ChildUpdate", description: "Replaces a child's editable facts" });
export type ChildUpdate = z.infer<typeof ChildUpdate>;

/** The child as the actor may see it; `householdId` and `guardians` appear for guardians only. */
export const Child = z
  .object({
    id: Id,
    displayName: DisplayName,
    dateOfBirth: CalendarDate,
    sex: Sex.nullable(),
    householdId: Id.optional().describe("Guardians only"),
    guardians: z.array(Id).optional().describe("Guardians only: every guardian's user id"),
    createdAt: Instant,
    updatedAt: Instant,
    version: z.int().min(1),
  })
  .meta({ id: "Child", description: "A child, projected for the actor's access" });
export type Child = z.infer<typeof Child>;

export const GuardianInput = z
  .object({
    userId: Id.describe("An active member of the child's household"),
  })
  .meta({ id: "GuardianInput", description: "Adds a household member as a guardian" });
export type GuardianInput = z.infer<typeof GuardianInput>;

export const Guardian = z
  .object({
    childId: Id,
    userId: Id,
    createdAt: Instant,
  })
  .meta({ id: "Guardian", description: "One guardianship" });
export type Guardian = z.infer<typeof Guardian>;

/** The checklist item key core mints: `<months>m-<domain>-<n>`. */
export const MilestoneItemId = z
  .string()
  .regex(/^\d{1,2}m-(social|language|cognitive|movement)-\d{1,2}$/, "Expected a checklist item id");
export type MilestoneItemId = z.infer<typeof MilestoneItemId>;

const EventFields = z.object({
  id: ClientId.optional(),
  kind: ChildEventKind,
  date: RealCalendarDate,
  startedAt: Instant.optional().describe("A feed's or a sleep's start"),
  endedAt: Instant.optional().describe("A feed's or a sleep's end; never before the start"),
  milestoneId: MilestoneItemId.optional().describe("Required for a milestone, absent otherwise"),
  quantityMl: z
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe("A feed's volume in millilitres; imperial is a display choice"),
  note: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .optional()
    .describe("Free text, encrypted at rest with the child's data key"),
});

type EventFields = z.infer<typeof EventFields>;

/** The rules the database's check constraints also enforce, answered as field errors first. */
function checkEvent(value: EventFields, ctx: z.RefinementCtx): void {
  if (value.kind === "milestone" && value.milestoneId === undefined) {
    ctx.addIssue({ code: "custom", path: ["milestoneId"], message: "A milestone names its item." });
  }
  if (value.kind !== "milestone" && value.milestoneId !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["milestoneId"],
      message: "Only a milestone has an item.",
    });
  }
  if (value.kind === "sleep" && value.startedAt === undefined) {
    ctx.addIssue({ code: "custom", path: ["startedAt"], message: "A sleep has a start." });
  }
  if (value.kind !== "feed" && value.quantityMl !== undefined) {
    ctx.addIssue({ code: "custom", path: ["quantityMl"], message: "Only a feed has a volume." });
  }
  if ((value.kind === "milestone" || value.kind === "diaper") && value.endedAt !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["endedAt"],
      message: "Only a feed or a sleep spans time.",
    });
  }
  if (
    value.startedAt !== undefined &&
    value.endedAt !== undefined &&
    Date.parse(value.endedAt) < Date.parse(value.startedAt)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["endedAt"],
      message: "The end is never before the start.",
    });
  }
}

export const ChildEventInput = EventFields.superRefine(checkEvent).meta({
  id: "ChildEventInput",
  description: "A feed, a sleep, a diaper or a milestone for one day",
});
export type ChildEventInput = z.infer<typeof ChildEventInput>;

export const ChildEventUpdate = EventFields.omit({ id: true })
  .superRefine(checkEvent)
  .meta({ id: "ChildEventUpdate", description: "Replaces an event; the kind may not change" });
export type ChildEventUpdate = z.infer<typeof ChildEventUpdate>;

export const ChildEvent = z
  .object({
    id: Id,
    childId: Id,
    kind: ChildEventKind,
    date: CalendarDate,
    startedAt: Instant.nullable(),
    endedAt: Instant.nullable(),
    milestoneId: MilestoneItemId.nullable(),
    quantityMl: z.int().nullable(),
    note: z.string().nullable().describe("Decrypted for the actor after access is decided"),
    authorId: Id.nullable(),
    createdAt: Instant,
    updatedAt: Instant,
    version: z.int().min(1),
    deletedAt: z.null(),
  })
  .meta({ id: "ChildEvent", description: "One child event" });
export type ChildEvent = z.infer<typeof ChildEvent>;

/** What a sync sees of a deleted row: the key, the version and when; never the content. */
export const ChildEventTombstone = z
  .object({
    id: Id,
    childId: Id,
    updatedAt: Instant,
    version: z.int().min(1),
    deletedAt: Instant,
  })
  .meta({
    id: "ChildEventTombstone",
    description: "A deleted event; the response carries no content",
  });
export type ChildEventTombstone = z.infer<typeof ChildEventTombstone>;

export const ChildMeasurementInput = z
  .object({
    id: ClientId.optional(),
    date: RealCalendarDate,
    weightGrams: z.int().min(1).max(60_000).optional(),
    lengthMillimetres: z.int().min(1).max(2_000).optional(),
    headMillimetres: z.int().min(1).max(800).optional(),
  })
  .refine(
    (value) =>
      value.weightGrams !== undefined ||
      value.lengthMillimetres !== undefined ||
      value.headMillimetres !== undefined,
    { path: ["weightGrams"], message: "A measurement carries at least one value." },
  )
  .meta({
    id: "ChildMeasurementInput",
    description: "One measurement session in SI integers; imperial is converted at the edge",
  });
export type ChildMeasurementInput = z.infer<typeof ChildMeasurementInput>;

export const GrowthReference = z.enum(["who", "cdc"]);
export type GrowthReference = z.infer<typeof GrowthReference>;

export const GrowthIndicator = z.enum([
  "weightForAge",
  "lengthForAge",
  "weightForLength",
  "headCircumferenceForAge",
]);
export type GrowthIndicator = z.infer<typeof GrowthIndicator>;

const GrowthBand = z.object({
  percentile: z.number(),
  label: z.string(),
  value: z.int().describe("In the measurement's unit: grams or millimetres"),
});

/** Where one value sits on its reference; context for a parent, never a diagnosis. */
export const GrowthPlacement = z
  .object({
    indicator: GrowthIndicator,
    reference: GrowthReference,
    percentile: z.number().min(0).max(100),
    z: z.number(),
    approximate: z
      .boolean()
      .describe("True in the first eight weeks on the WHO reference; shown as approximate"),
    bands: z.object({ low: GrowthBand, median: GrowthBand, high: GrowthBand }),
  })
  .meta({ id: "GrowthPlacement", description: "One value placed on the WHO or CDC reference" });
export type GrowthPlacement = z.infer<typeof GrowthPlacement>;

export const ChildMeasurement = z
  .object({
    id: Id,
    childId: Id,
    date: CalendarDate,
    weightGrams: z.int().nullable(),
    lengthMillimetres: z.int().nullable(),
    headMillimetres: z.int().nullable(),
    placements: z
      .array(GrowthPlacement)
      .describe("Empty until the child's sex is set or when no vendored table covers the age"),
    pointToCare: z
      .boolean()
      .optional()
      .describe(
        "Guardians only: a value beyond two standard deviations; the client pairs it with the one pointing-to-care sentence",
      ),
    authorId: Id.nullable(),
    createdAt: Instant,
    updatedAt: Instant,
    version: z.int().min(1),
  })
  .meta({ id: "ChildMeasurement", description: "One measurement session with its placements" });
export type ChildMeasurement = z.infer<typeof ChildMeasurement>;

export const MilestoneDomain = z.enum(["social", "language", "cognitive", "movement"]);
export type MilestoneDomain = z.infer<typeof MilestoneDomain>;

export const MilestoneCheck = z
  .object({
    id: MilestoneItemId,
    domain: MilestoneDomain,
    text: z.string().describe("CDC's wording, unchanged"),
    checked: z.boolean(),
    checkedOn: CalendarDate.nullable(),
    eventId: Id.nullable().describe("The milestone event that records the check-off"),
  })
  .meta({ id: "MilestoneCheck", description: "One checklist item with the child's check-off" });
export type MilestoneCheck = z.infer<typeof MilestoneCheck>;

export const MilestoneChecklist = z
  .object({
    childId: Id,
    months: z.int().min(2).max(60),
    label: z.string(),
    framing: z.string().describe("Most children do this by <age>."),
    notScreeningLine: z.string(),
    attribution: z.string(),
    items: z.array(MilestoneCheck),
  })
  .meta({
    id: "MilestoneChecklist",
    description: "The CDC checklist for one age with the child's check-offs",
  });
export type MilestoneChecklist = z.infer<typeof MilestoneChecklist>;

/** The item travels in the body: a checklist key beside a child id in a request line would be a fact about the child. */
export const MilestoneCheckInput = z
  .object({
    itemId: MilestoneItemId,
    checked: z.boolean(),
    date: RealCalendarDate.optional().describe("The day of the check-off; today when absent"),
  })
  .meta({ id: "MilestoneCheckInput", description: "Checks or unchecks one checklist item" });
export type MilestoneCheckInput = z.infer<typeof MilestoneCheckInput>;

/** The query of every syncable list (architecture record 5.1). */
export const ListQuery = z.object({
  cursor: z.string().optional().describe("Opaque; from the previous page's nextCursor"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof ListQuery>;

export const DatedListQuery = ListQuery.extend({
  from: RealCalendarDate.optional(),
  to: RealCalendarDate.optional(),
  updatedSince: Instant.optional().describe("Rows changed since, tombstones included"),
});
export type DatedListQuery = z.infer<typeof DatedListQuery>;

/** The events list also narrows by kind: a vocabulary value, never free text. */
export const ChildEventListQuery = DatedListQuery.extend({
  kind: ChildEventKind.optional(),
});
export type ChildEventListQuery = z.infer<typeof ChildEventListQuery>;
