import * as z from "zod";

/**
 * The account area (architecture record 11): the activity view over the
 * audit log, the on-demand export and account closure with its undo window.
 * Nothing here carries health content: an activity row says what happened,
 * to whose records, in which category and when; the export's rows travel
 * only in the response body.
 *
 * This module imports nothing from ./index. The index re-exports it, and an
 * import back would read `Id` while the index is still loading.
 */
const Id = z.uuid().describe("Opaque resource identifier");

/**
 * Every category data can be filed under, the private journal included,
 * because the audit log records reads of every category. Mirrors
 * `dataCategoryValues` in packages/db.
 */
export const DataCategory = z.enum([
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "journal.private",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
]);
export type DataCategory = z.infer<typeof DataCategory>;

/** A neutral dotted name owned by the API, such as `grant.revoke`; never a fact. */
export const ActivityAction = z
  .string()
  .regex(/^[a-z]+(\.[a-z_]+)+$/, "Expected a dotted action name")
  .describe("What happened, as a neutral dotted name such as grant.revoke or export.create");
export type ActivityAction = z.infer<typeof ActivityAction>;

export const ActivityEvent = z
  .object({
    id: Id,
    action: ActivityAction,
    actorId: Id.describe("Who did it"),
    subjectId: Id.describe("Whose records it concerned: the person, or a child"),
    category: DataCategory.optional().describe("The category touched, when the action has one"),
    childId: Id.optional().describe("The child, for an action on a child record"),
    occurredAt: z.iso.datetime(),
  })
  .meta({
    id: "ActivityEvent",
    description: "One row of the activity view: what, who, whose and when, with no content.",
  });
export type ActivityEvent = z.infer<typeof ActivityEvent>;

export const ActivityPage = z
  .object({
    items: z.array(ActivityEvent).describe("Newest first"),
    nextCursor: z
      .string()
      .nullable()
      .describe("Opaque; send it back as cursor for the next page. Null on the last page."),
  })
  .meta({ id: "ActivityPage", description: "A page of the actor's activity, newest first." });
export type ActivityPage = z.infer<typeof ActivityPage>;

/** The query of a cursor paginated list (architecture record 5.1): limit 1 to 200, default 50. */
export const ActivityQuery = z.object({
  cursor: z.string().min(1).max(200).optional().describe("The nextCursor of the previous page"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

/**
 * How the person wants the account closed: `undo-window` holds the
 * deletion for seven days during which the closure can be undone, `now`
 * starts the deletion at once with no undo.
 */
export const CloseMode = z.enum(["undo-window", "now"]);
export type CloseMode = z.infer<typeof CloseMode>;

export const CloseInput = z
  .object({ mode: CloseMode })
  .meta({ id: "CloseInput", description: "The closure mode. Fresh authentication is required." });
export type CloseInput = z.infer<typeof CloseInput>;

/** Where a data request stands; `cancelled` is a closure undone inside its window. */
export const DataRequestState = z.enum([
  "requested",
  "in_progress",
  "completed",
  "cancelled",
  "refused",
]);
export type DataRequestState = z.infer<typeof DataRequestState>;

export const ClosureRequest = z
  .object({
    id: Id,
    mode: CloseMode,
    state: DataRequestState,
    requestedAt: z.iso.datetime(),
    undoUntil: z.iso
      .datetime()
      .nullable()
      .describe("Until when the closure can be undone; null when the person chose delete now"),
    deadlineAt: z.iso.datetime().describe("The 45 day clock every data request runs on"),
  })
  .meta({
    id: "ClosureRequest",
    description:
      "An account closure: every other session and every grant is revoked, the request is filed, and the deletion job runs when the undo window ends.",
  });
export type ClosureRequest = z.infer<typeof ClosureRequest>;

/**
 * What a replayed close answers (architecture 5.3 as built in E1): the
 * stored status and the request's id, never a re-rendered body. Read
 * `GET /v1/me/close` for the state.
 */
export const ClosureReplay = z
  .object({ id: Id.describe("The closure request the first call filed") })
  .meta({
    id: "ClosureReplay",
    description:
      "The answer to a close replayed with the same Idempotency-Key: the request's id only. Read GET /v1/me/close for its state.",
  });
export type ClosureReplay = z.infer<typeof ClosureReplay>;

/** The 200 of `POST /v1/me/close`: the request, or its id alone on a replay. */
export const CloseAnswer = z.union([ClosureRequest, ClosureReplay]);
export type CloseAnswer = z.infer<typeof CloseAnswer>;

export const CloseState = z
  .object({
    request: z
      .union([ClosureRequest, z.null()])
      .describe("The open closure, or null when the account is not closing"),
  })
  .meta({
    id: "CloseState",
    description: "Whether the account is closing, and the request if so.",
  });
export type CloseState = z.infer<typeof CloseState>;

export const CloseUndone = z
  .object({
    request: ClosureRequest,
    sessionsRestored: z
      .literal(false)
      .describe("The sessions revoked at closure stay revoked; sign in again on other devices"),
    grantsRestored: z
      .literal(false)
      .describe("The grants revoked at closure stay revoked; share again from the sharing screen"),
  })
  .meta({
    id: "CloseUndone",
    description:
      "A closure cancelled inside its window. The request is cancelled and its deletion job removed; nothing revoked comes back.",
  });
export type CloseUndone = z.infer<typeof CloseUndone>;

/** The first line of an export: which person, when, and the line format version. */
export const ExportHeader = z
  .object({
    kind: z.literal("export"),
    format: z.literal(1),
    subjectId: Id,
    generatedAt: z.iso.datetime(),
  })
  .meta({ id: "ExportHeader", description: "The first line of an export file." });
export type ExportHeader = z.infer<typeof ExportHeader>;

/** Every other line: one stored row of the person's own, decrypted where the column is encrypted. */
export const ExportRecord = z
  .object({
    kind: z
      .string()
      .regex(/^(?!export$|end$)[a-z][A-Za-z]*$/)
      .describe(
        "Which kind of row, such as profile, note or cycleEntry; never export or end, which name the first and last lines",
      ),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({
    id: "ExportRecord",
    description:
      "One row of the person's own data, with encrypted text decrypted and nothing from any other subject.",
  });
export type ExportRecord = z.infer<typeof ExportRecord>;

/**
 * The last line, written only after every record: a file that does not end
 * with it was cut off (the response is already 200 when the first byte
 * leaves, so a failure partway can only show as a missing end).
 */
export const ExportEnd = z
  .object({
    kind: z.literal("end"),
    records: z.number().int().min(0).describe("How many ExportRecord lines came before this one"),
  })
  .meta({
    id: "ExportEnd",
    description:
      "The last line of a complete export file. A file without it is incomplete and should be requested again.",
  });
export type ExportEnd = z.infer<typeof ExportEnd>;

export const ExportLine = z.union([ExportHeader, ExportEnd, ExportRecord]);
export type ExportLine = z.infer<typeof ExportLine>;
