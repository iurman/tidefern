import type { DayLogPartError } from "@/components/ui/day-sheet";
import { formatSheetDate, isSignedOut, type NotePlace, type PartResult } from "@/lib/day-log";

/**
 * The day log's words in one module (architecture 13.10): pending says what
 * is happening, failure says what to do next, success is short and carries
 * the undo where one exists (docs/design/CONTENT.md, the voice table). No
 * string here names anything logged.
 */
export const dayLogCopy = {
  saved: (date: string) => `Saved for ${formatSheetDate(date)}.`,
  undone: (date: string) => `Changes undone for ${formatSheetDate(date)}.`,
  undoFailed: "We could not undo every change. Check this day and change it back.",
  shared: "Note shared.",
  deleted: "Note deleted.",
  loadFailed: "We could not load this day. Try again.",
  signedOut: "Your session has ended. Sign in again, then come back to this day.",
  entryFailed: "We could not save this day. Try again.",
  entryConflict: "This day was changed somewhere else. Try again to save your version.",
  noteFailed: "We could not save your note. Try again.",
  noteConflict: "This note was changed somewhere else. Try again to save your version.",
  shareFailed: "We could not share this note. Try again.",
  shareConflict: "This note changed somewhere else. Check it, then share it again.",
  shareMoved: "This note was already shared somewhere else.",
  shareGone: "This note was deleted somewhere else.",
  deleteFailed: "We could not delete this note. Try again.",
} as const;

/**
 * What the entry part's result says under the day's fields, or nothing when
 * it was saved. `attempt` numbers the save, so a second failure is a new line.
 */
export function entryErrorFor(result: PartResult | null, attempt = 0): DayLogPartError | undefined {
  if (result === null) return undefined;
  if (isSignedOut(result)) return { message: dayLogCopy.signedOut, retry: false, id: attempt };
  if (result.outcome === "conflict") return { message: dayLogCopy.entryConflict, id: attempt };
  if (result.outcome === "failed") return { message: dayLogCopy.entryFailed, id: attempt };
  return undefined;
}

/** What the note part's result says under the note, or nothing when it was saved. */
export function noteErrorFor(result: PartResult | null, attempt = 0): DayLogPartError | undefined {
  if (result === null) return undefined;
  if (isSignedOut(result)) return { message: dayLogCopy.signedOut, retry: false, id: attempt };
  if (result.outcome === "conflict") return { message: dayLogCopy.noteConflict, id: attempt };
  if (result.outcome === "failed") return { message: dayLogCopy.noteFailed, id: attempt };
  return undefined;
}

/**
 * What a share that did not go through says by the share action. `place` is
 * where the note sits after the share read it again (`notePlace`): a
 * conflict on a note still in the field means its text changed, one on a
 * note now in the list means it was shared elsewhere, and one on a note
 * that is nowhere means it was deleted.
 */
export function shareErrorFor(result: PartResult, place: NotePlace = "field"): string | undefined {
  if (isSignedOut(result)) return dayLogCopy.signedOut;
  if (result.outcome === "conflict") {
    if (place === "listed") return dayLogCopy.shareMoved;
    if (place === "absent") return dayLogCopy.shareGone;
    return dayLogCopy.shareConflict;
  }
  if (result.outcome === "failed") return dayLogCopy.shareFailed;
  return undefined;
}

/** What a delete that did not go through says under its note. */
export function deleteErrorFor(result: PartResult): string | undefined {
  if (isSignedOut(result)) return dayLogCopy.signedOut;
  if (result.outcome === "failed" || result.outcome === "conflict") return dayLogCopy.deleteFailed;
  return undefined;
}
