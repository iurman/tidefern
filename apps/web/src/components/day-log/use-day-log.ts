"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NoteShareCategory } from "@tidefern/schemas";
import type { DayLogActionError, DayLogNotice, DayLogPartError } from "@/components/ui/day-sheet";
import { browserApiClient } from "@/lib/api-browser";
import {
  EMPTY_DRAFT,
  allSaved,
  dayFingerprint,
  dayLogKey,
  deleteNote as deleteDayNote,
  draftFrom,
  isEmptyPlan,
  isOlderDay,
  isSignedOut,
  keepsShareKey,
  loadDay,
  notePlace,
  planSave,
  planUndo,
  runPlan,
  shareCategoryFor,
  shareNote as shareDayNote,
  type DayDraft,
  type DayPlan,
  type DayState,
  type LoggingStage,
  type PartResult,
} from "@/lib/day-log";
import { dayLogCopy, deleteErrorFor, entryErrorFor, noteErrorFor, shareErrorFor } from "./copy";

/** How long Undo stays after a save (DESIGN.md 5.1 step 5). */
export const UNDO_WINDOW_MS = 10_000;

export type DayLogPhase = "closed" | "loading" | "failed" | "ready";

export interface UseDayLogOptions {
  /** The day to log, `YYYY-MM-DD`; null while nothing is open (a closed sheet). */
  date: string | null;
  stage: LoggingStage;
  /**
   * The day as the server already read it (`loadDay` on the server client),
   * so the first paint needs no request. Without it the day is loaded here.
   */
  initial?: DayState | null;
}

/** What the views bind to: the day's state, the draft's seed and key, and the actions. */
export interface DayLogController {
  phase: DayLogPhase;
  day: DayState | null;
  /** The draft's key (`dayLogKey`): it changes on a load, a day change or an undo. */
  draftKey: string;
  /** Where the draft starts. */
  initialDraft: DayDraft;
  /** The day as last saved, which the draft is compared with. */
  savedDraft: DayDraft;
  loadError: string | undefined;
  /** Loads the day again; absent when trying again cannot help (the session ended). */
  retryLoad: (() => void) | undefined;
  save: (draft: DayDraft) => void;
  saving: boolean;
  /** Something is being written; the views hold day navigation until it ends. */
  busy: boolean;
  entryError: DayLogPartError | undefined;
  noteError: DayLogPartError | undefined;
  notice: DayLogNotice | undefined;
  shareNote: () => Promise<boolean>;
  sharing: boolean;
  shareError: DayLogActionError | undefined;
  deleteNote: (id: string) => Promise<boolean>;
  deletingNoteId: string | null;
  deleteError: { id: string; message: string } | null;
}

interface Session {
  date: string | null;
  phase: DayLogPhase;
  /** The status of a load that failed, 0 without an answer. */
  loadStatus: number | null;
  day: DayState | null;
  seed: DayDraft;
  key: string;
  generation: number;
  /** The fingerprint of the last `initial` prop seen, so a refreshed one is noticed once. */
  initialPrint: string | null;
}

function openSession(
  date: string | null,
  initial: DayState | null | undefined,
  generation: number,
): Session {
  const ready = date !== null && initial != null && initial.date === date;
  return {
    date,
    phase: date === null ? "closed" : ready ? "ready" : "loading",
    loadStatus: null,
    day: ready ? initial : null,
    seed: ready ? draftFrom(initial) : EMPTY_DRAFT,
    key: ready ? dayLogKey(date, initial.entry, generation) : `${date ?? "closed"}:0:${generation}`,
    generation,
    initialPrint: initial ? dayFingerprint(initial) : null,
  };
}

/** The same session with a new day and a draft seeded from it, under a new key. */
function reseed(session: Session, day: DayState): Session {
  const generation = session.generation + 1;
  return {
    ...session,
    phase: "ready",
    loadStatus: null,
    day,
    seed: draftFrom(day),
    key: dayLogKey(day.date, day.entry, generation),
    generation,
  };
}

/**
 * The client controller of the day log (DESIGN.md 5.1) over the browser
 * client: loads a day unless the server already did, saves a draft through
 * lib/day-log, offers Undo for ten seconds after a save, shares the private
 * note and deletes a shared one, and calls `router.refresh()` after every
 * write so the server parts of the page (the calendar, the ring) read
 * again. Its own state comes from the API's answers, so it never shows a
 * value the API did not return. `stage` and the dates come from the
 * server; nothing here reads the browser clock.
 *
 * A refreshed `initial` for the same day is adopted while nothing is being
 * written, unless it is an older read than the one the controller holds
 * (a refresh can trail its own writes); a draft with unsaved changes in
 * another view of the same day is then replaced, so a page shows one
 * editable view of a day at a time.
 */
export function useDayLog({ date, stage, initial }: UseDayLogOptions): DayLogController {
  const router = useRouter();
  const [session, setSession] = useState<Session>(() => openSession(date, initial, 0));
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [results, setResults] = useState<{
    entry: PartResult;
    note: PartResult;
    attempt: number;
  } | null>(null);
  const [notice, setNotice] = useState<Omit<DayLogNotice, "onUndo" | "undoing"> | null>(null);
  const [undo, setUndo] = useState<DayPlan | null>(null);
  const [shareError, setShareError] = useState<DayLogActionError | undefined>(undefined);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  /** One write at a time; a ref, because a second press can land before React re-renders. */
  const busyRef = useRef(false);
  /** The day before the first save of a run of attempts, which Undo returns to. */
  const baseline = useRef<DayState | null>(null);
  /** The id a new private note gets, kept across retries so a lost answer never makes two notes. */
  const pendingNoteId = useRef<string | null>(null);
  /**
   * The Idempotency-Key of a share that got no answer, kept for the next
   * press on the same note, version and category, so a retry meets the
   * first attempt instead of a version that attempt already moved.
   */
  const shareAttempt = useRef<{
    noteId: string;
    version: number;
    category: NoteShareCategory;
    key: string;
  } | null>(null);
  const noticeCount = useRef(0);
  /** Numbers each failed share, so a second failure is a new line with its own cue. */
  const shareCount = useRef(0);
  /** Numbers each save, so a failure line after Try again is a new line with its own cue. */
  const saveCount = useRef(0);
  const dateRef = useRef(date);
  const busy = saving || undoing || sharing || deletingNoteId !== null;

  useEffect(() => {
    // The refs belong to one day; the state below is reset during render.
    dateRef.current = date;
    baseline.current = null;
    pendingNoteId.current = null;
    shareAttempt.current = null;
  }, [date]);

  if (session.date !== date) {
    // Another day, or the sheet closed: everything about the last day goes.
    setSession(openSession(date, initial, session.generation + 1));
    setResults(null);
    setNotice(null);
    setUndo(null);
    setShareError(undefined);
    setDeleteError(null);
  } else if (date !== null && initial != null && initial.date === date && !busy) {
    const print = dayFingerprint(initial);
    if (print !== session.initialPrint) {
      const current = session.day;
      if (current === null) {
        setSession(reseed({ ...session, initialPrint: print }, initial));
      } else if (print !== dayFingerprint(current) && !isOlderDay(initial, current)) {
        // A newer read of the day from the server (another view or device wrote it).
        setSession(reseed({ ...session, initialPrint: print }, initial));
        setResults(null);
        setUndo(null);
      } else {
        setSession({ ...session, initialPrint: print });
      }
    }
  }

  useEffect(() => {
    if (session.phase !== "loading" || session.date === null) return undefined;
    const forDate = session.date;
    const generation = session.generation;
    let cancelled = false;
    void loadDay(browserApiClient(), forDate).then((result) => {
      if (cancelled) return;
      setSession((current) => {
        if (current.date !== forDate || current.generation !== generation) return current;
        return result.ok
          ? reseed(current, result.day)
          : { ...current, phase: "failed", loadStatus: result.status };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session.phase, session.date, session.generation]);

  useEffect(() => {
    // An undo she started keeps its Undoing control until it answers, even past the window.
    if (undo === null || undoing) return undefined;
    const timer = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [undo, undoing]);

  /**
   * A new line beside Save. `focus` when the control she pressed went away
   * with the action; `keepWhileEditing` for a share or a delete, which leave
   * the draft alone, so the line shows even while the draft has changes.
   */
  function nextNotice(
    tone: DayLogNotice["tone"],
    message: string,
    { focus = false, keepWhileEditing = false } = {},
  ) {
    noticeCount.current += 1;
    setNotice({
      tone,
      message,
      id: noticeCount.current,
      ...(focus ? { focus } : {}),
      ...(keepWhileEditing ? { keepWhileEditing } : {}),
    });
  }

  /** A new action puts away the lines a share or a delete left behind. */
  function clearActionErrors() {
    setShareError(undefined);
    setDeleteError(null);
  }

  /** Applies a day the API answered with, unless the person has moved to another day meanwhile. */
  function applyDay(day: DayState, reseedDraft: boolean): boolean {
    if (dateRef.current !== day.date) return false;
    setSession((current) =>
      current.date !== day.date
        ? current
        : reseedDraft
          ? reseed(current, day)
          : { ...current, day },
    );
    return true;
  }

  async function save(draft: DayDraft): Promise<void> {
    const day = session.day;
    if (day === null || busyRef.current) return;
    busyRef.current = true;
    clearActionErrors();
    const client = browserApiClient();
    pendingNoteId.current ??= client.newId();
    const plan = planSave(day, draft, pendingNoteId.current);
    baseline.current ??= day;
    setSaving(true);
    const result = await runPlan(client, day, plan);
    busyRef.current = false;
    setSaving(false);
    const wrote = result.entry.outcome !== "unchanged" || result.note.outcome !== "unchanged";
    if (plan.note?.kind === "create") {
      const status = result.note.status ?? 0;
      // A create that landed uses its id up; one the server refused outright frees it too.
      // Without an answer (0) or with a server error the id stays for the retry.
      if (result.note.outcome === "saved" || (status >= 400 && status < 500)) {
        pendingNoteId.current = null;
      }
    }
    if (wrote) router.refresh();
    if (!applyDay(result.day, false)) return;
    saveCount.current += 1;
    setResults({ entry: result.entry, note: result.note, attempt: saveCount.current });
    if (allSaved(result.entry, result.note)) {
      const before = baseline.current;
      baseline.current = null;
      const plan = before === null ? null : planUndo(before, result.day);
      setUndo(plan !== null && !isEmptyPlan(plan) ? plan : null);
      nextNotice("success", dayLogCopy.saved(day.date));
    } else {
      setUndo(null);
      setNotice(null);
    }
  }

  async function runUndo(): Promise<void> {
    const day = session.day;
    if (day === null || undo === null || busyRef.current) return;
    busyRef.current = true;
    clearActionErrors();
    setUndoing(true);
    const result = await runPlan(browserApiClient(), day, undo);
    busyRef.current = false;
    setUndoing(false);
    setUndo(null);
    router.refresh();
    // The draft goes back to what the day now holds, whatever the undo managed.
    if (!applyDay(result.day, true)) return;
    setResults(null);
    if (allSaved(result.entry, result.note)) {
      nextNotice("success", dayLogCopy.undone(day.date), { focus: true });
    } else {
      nextNotice("error", dayLogCopy.undoFailed, { focus: true });
    }
  }

  async function shareNote(): Promise<boolean> {
    const day = session.day;
    if (day === null || day.note.status !== "saved" || busyRef.current) return false;
    busyRef.current = true;
    setSharing(true);
    clearActionErrors();
    const client = browserApiClient();
    const { id: noteId, version } = day.note;
    const category = shareCategoryFor(stage);
    const kept = shareAttempt.current;
    const key =
      kept !== null &&
      kept.noteId === noteId &&
      kept.version === version &&
      kept.category === category
        ? kept.key
        : client.newId();
    const { day: next, result } = await shareDayNote(client, day, category, key);
    shareAttempt.current = keepsShareKey(result) ? { noteId, version, category, key } : null;
    busyRef.current = false;
    setSharing(false);
    if (result.outcome === "saved") router.refresh();
    if (!applyDay(next, false)) return false;
    if (result.outcome === "saved") {
      // There is no undo for a share, and the plan before it may now point at the shared note.
      setUndo(null);
      baseline.current = null;
      nextNotice("success", dayLogCopy.shared, { focus: true, keepWhileEditing: true });
      return true;
    }
    // A conflict carries the note as it is now: the form shows its current
    // text (or that it moved), so she checks it before she shares again.
    shareCount.current += 1;
    setShareError({
      message: shareErrorFor(result, notePlace(next, noteId)) ?? dayLogCopy.shareFailed,
      id: shareCount.current,
    });
    return false;
  }

  async function deleteNote(id: string): Promise<boolean> {
    const day = session.day;
    if (day === null || busyRef.current) return false;
    busyRef.current = true;
    setDeletingNoteId(id);
    clearActionErrors();
    const { day: next, result } = await deleteDayNote(browserApiClient(), day, id);
    busyRef.current = false;
    setDeletingNoteId(null);
    if (result.outcome === "saved") router.refresh();
    if (!applyDay(next, false)) return false;
    if (result.outcome === "saved") {
      setUndo(null);
      nextNotice("success", dayLogCopy.deleted, { focus: true, keepWhileEditing: true });
      return true;
    }
    setDeleteError({ id, message: deleteErrorFor(result) ?? dayLogCopy.deleteFailed });
    return false;
  }

  function retryLoad() {
    setSession((current) =>
      current.date === null
        ? current
        : { ...current, phase: "loading", loadStatus: null, generation: current.generation + 1 },
    );
  }

  const signedOutOnLoad = session.phase === "failed" && session.loadStatus === 401;
  const entryError = entryErrorFor(results?.entry ?? null, results?.attempt);
  const noteResult = results?.note ?? null;
  // An ended session is said once, under the day's fields, though both parts failed on it.
  const noteError =
    entryError?.retry === false && noteResult !== null && isSignedOut(noteResult)
      ? undefined
      : noteErrorFor(noteResult, results?.attempt);

  return {
    phase: session.phase,
    day: session.day,
    draftKey: session.key,
    initialDraft: session.seed,
    savedDraft: session.day === null ? EMPTY_DRAFT : draftFrom(session.day),
    loadError:
      session.phase !== "failed"
        ? undefined
        : signedOutOnLoad
          ? dayLogCopy.signedOut
          : dayLogCopy.loadFailed,
    retryLoad: signedOutOnLoad ? undefined : retryLoad,
    save: (draft) => void save(draft),
    saving,
    busy,
    entryError,
    noteError,
    notice:
      notice === null
        ? undefined
        : { ...notice, ...(undo === null ? {} : { onUndo: () => void runUndo(), undoing }) },
    shareNote,
    sharing,
    shareError,
    deleteNote,
    deletingNoteId,
    deleteError,
  };
}
