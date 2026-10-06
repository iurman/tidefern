import { z } from "zod";

/**
 * The notes area (architecture 8.2 and 9.2). A note is the one place free
 * text lives for the cycle and pregnancy stages: its body is encrypted at
 * rest under the subject's data key, its category decides who may ever read
 * it, and `journal.private` is where every note starts. A note leaves the
 * private journal only through the explicit share action, never through a
 * column on a day entry and never on create.
 *
 * This module imports nothing from the package index on purpose: the index
 * re-exports it, and a module cycle would read the index's constants before
 * they exist. The three category values are pinned to `NoteCategory` in the
 * index by `notes.test.ts`.
 */

/** The categories a note can be filed under; the same list as `NoteCategory` in the index. */
export const noteCategoryValues = [
  "journal.private",
  "cycle.symptoms",
  "pregnancy.overview",
] as const;

const NoteFiling = z
  .enum(noteCategoryValues)
  .describe("Where the note is filed, which decides who may ever read it");

/** The two categories a private note can be re-filed into; a note never becomes private again. */
export const NoteShareCategory = z.enum(["cycle.symptoms", "pregnancy.overview"]).meta({
  id: "NoteShareCategory",
  description:
    "A shareable category the note is re-filed into. The private journal is never granted.",
});
export type NoteShareCategory = z.infer<typeof NoteShareCategory>;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-02-30` matches the pattern and is not a day; the boundary refuses it before a query does. */
function isRealCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A calendar date in the subject's time zone, checked to be a real day. */
export const NoteDate = z
  .string()
  .regex(DATE, "Expected YYYY-MM-DD")
  .refine(isRealCalendarDate, "Expected a real calendar date")
  .describe("Calendar date in the subject's time zone");

const NoteBody = z
  .string()
  .min(1)
  .max(4000)
  .describe("Free text; encrypted at rest with the subject's data key, never logged");

const NoteId = z.uuid().describe("Opaque resource identifier");

/** An RFC 3339 instant with exactly three fractional digits and Z, as the API emits them. */
const Instant = z.iso.datetime({ precision: 3 });

export const NoteCreateInput = z
  .object({
    id: NoteId.optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
    subject: NoteId.optional().describe(
      "Whose note this is: the signed-in person when absent. Another person's id needs a contribute grant from them in the category given.",
    ),
    date: NoteDate,
    category: NoteFiling.default("journal.private").describe(
      "Your own notes always start in journal.private; the share action re-files one. A note about another person is filed under the category their grant covers.",
    ),
    body: NoteBody,
  })
  .meta({ id: "NoteCreateInput", description: "A new note. The body is the only free text." });
export type NoteCreateInput = z.infer<typeof NoteCreateInput>;

export const NoteUpdateInput = z
  .object({
    date: NoteDate.optional(),
    body: NoteBody.optional(),
  })
  .refine((input) => input.date !== undefined || input.body !== undefined, {
    message: "Expected a date or a body",
    path: ["body"],
  })
  .meta({
    id: "NoteUpdateInput",
    description:
      "Changes to a note's date or body. The category changes only through the share action.",
  });
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>;

export const NoteShareInput = z
  .object({ category: NoteShareCategory })
  .meta({ id: "NoteShareInput", description: "Re-files the note under a shareable category." });
export type NoteShareInput = z.infer<typeof NoteShareInput>;

export const Note = z
  .object({
    id: NoteId,
    subjectId: NoteId.describe("Whose note this is"),
    authorId: NoteId.nullable().describe("Who wrote it; null once the author's account is gone"),
    category: NoteFiling,
    date: NoteDate,
    body: NoteBody.optional().describe(
      "Decrypted for the owner and a read or contribute grantee; absent for a summary grantee and on a tombstone",
    ),
    createdAt: Instant,
    updatedAt: Instant,
    version: z.int().min(1).describe("Sent back as If-Match on an update"),
    deletedAt: Instant.optional().describe(
      "Set on a tombstone in a sync list; the row holds nothing else",
    ),
  })
  .meta({ id: "Note", description: "A note as the signed-in actor may see it." });
export type Note = z.infer<typeof Note>;

/**
 * The list filters are dates and ids only (architecture 9.1): a category
 * never rides in a query string, so the list carries every note category
 * the actor may read and each item names its own.
 */
export const NoteListQuery = z
  .object({
    subject: NoteId.optional().describe(
      "Whose notes: the signed-in person when absent, or a person who granted access",
    ),
    from: NoteDate.optional().describe("First date, inclusive"),
    to: NoteDate.optional().describe("Last date, inclusive"),
    updatedSince: Instant.optional().describe(
      "Only notes changed after this instant, tombstones included, for a sync client",
    ),
    cursor: z.string().max(200).optional().describe("The nextCursor of the previous page"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: "Expected from to be on or before to",
    path: ["to"],
  });
export type NoteListQuery = z.infer<typeof NoteListQuery>;

export const NoteList = z
  .object({
    items: z.array(Note),
    nextCursor: z.string().nullable().describe("Opaque; pass back as cursor for the next page"),
  })
  .meta({ id: "NoteList", description: "One page of notes in date order." });
export type NoteList = z.infer<typeof NoteList>;
