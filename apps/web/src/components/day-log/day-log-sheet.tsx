"use client";
import type { Stage } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { DayLogForm, DaySheet } from "@/components/ui/day-sheet";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { dayNeighbours, isLoggingStage, type DayState, type LoggingStage } from "@/lib/day-log";
import { useDayLog, type DayLogController } from "./use-day-log";
import styles from "./day-log.module.css";

/**
 * The day log's three places, each a thin binding of `useDayLog` to the
 * shared form: the sheet over Calendar and Today, the open card on Today,
 * and the page at /log/[date]. Each takes the profile's stage and today
 * from the server (GET /v1/me and the API's today, never the browser
 * clock) and renders nothing for the `none` stage, which is never asked a
 * body question.
 */

interface DayLogBase {
  /** The profile's stage, from the server. */
  stage: Stage;
  /** Today in the profile's time zone, from the API; it bounds the next day. */
  today: string;
  /** The day as the server already read it (`loadDay` on the server client), when the page has it. */
  initial?: DayState | null;
}

/** The form's props from the controller; the frame adds its own way out. */
function formBindings(log: DayLogController, stage: LoggingStage) {
  return {
    stage,
    saved: log.savedDraft,
    otherNotes: log.day?.others ?? [],
    onSave: log.save,
    saving: log.saving,
    entryError: log.entryError,
    noteError: log.noteError,
    notice: log.notice,
    onShareNote: log.shareNote,
    sharing: log.sharing,
    shareError: log.shareError,
    onDeleteNote: log.deleteNote,
    deletingNoteId: log.deletingNoteId,
    deleteError: log.deleteError,
  };
}

export interface DayLogSheetProps extends DayLogBase {
  /** The day to open, `YYYY-MM-DD`; null keeps the sheet closed. */
  date: string | null;
  onClose: () => void;
  /** Moves the sheet to another day; without it the day buttons are off. */
  onDateChange?: (date: string) => void;
}

/**
 * The bottom sheet on phones and the dialog from 1024 px (DESIGN.md 3.4):
 * opens on `date`, loads the day unless `initial` is that day, and stays
 * open after a save to show "Saved for Monday, Oct 5" with Undo, and after
 * a failure to show what failed under the part that failed. Previous and
 * next move by one day, never past today.
 */
export function DayLogSheet({
  stage,
  today,
  date,
  onClose,
  onDateChange,
  initial,
}: DayLogSheetProps) {
  const logging = isLoggingStage(stage) ? stage : null;
  const open = logging !== null && date !== null;
  const log = useDayLog({ date: open ? date : null, stage: logging ?? "cycle", initial });
  if (logging === null) return null;
  const shown = date ?? today;
  const neighbours = date === null ? null : dayNeighbours(date, today);
  const move = onDateChange && !log.busy ? onDateChange : undefined;
  const previous = neighbours?.previous;
  const next = neighbours?.next;
  return (
    <DaySheet
      open={open}
      onClose={onClose}
      date={shown}
      onPrevious={move && previous ? () => move(previous) : undefined}
      onNext={move && next ? () => move(next) : undefined}
      loading={log.phase === "loading" || log.phase === "closed"}
      error={log.loadError}
      onRetry={log.retryLoad}
      draftKey={log.draftKey}
      initial={log.initialDraft}
      {...formBindings(log, logging)}
    />
  );
}

export interface DayLogInlineProps extends DayLogBase {
  /** The day the card logs; today when absent. */
  date?: string;
}

/**
 * The form in the page flow, for Today's open card (DESIGN.md 5.1 step 1):
 * the page draws the card and its heading around it. Cancel appears only
 * while the draft differs from what is saved, and puts it back.
 */
export function DayLogInline({ stage, today, date = today, initial }: DayLogInlineProps) {
  const logging = isLoggingStage(stage) ? stage : null;
  const log = useDayLog({ date: logging ? date : null, stage: logging ?? "cycle", initial });
  if (logging === null) return null;
  if (log.phase === "loading" || log.phase === "closed") {
    return (
      <p className={styles.status} aria-busy="true">
        Loading
      </p>
    );
  }
  if (log.phase === "failed") {
    return (
      <div className={styles.failure}>
        {/* A read that failed is background data: the text, no cue (DESIGN.md 7). */}
        <InlineFeedback tone="error">{log.loadError}</InlineFeedback>
        {log.retryLoad ? (
          <Button variant="secondary" onClick={log.retryLoad}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <DayLogForm
      key={log.draftKey}
      initial={log.initialDraft}
      secondary={{ kind: "reset" }}
      {...formBindings(log, logging)}
    />
  );
}

export interface DayLogPageProps extends DayLogBase {
  /** The day the page logs, `YYYY-MM-DD`, already checked by the route. */
  date: string;
  /** Where Close and Cancel lead: the opener. */
  closeHref?: string;
  /** The route the neighbouring days live under: `${basePath}/${date}`. */
  basePath?: string;
}

/**
 * The page at /log/[date] (DESIGN.md 3.4): the same form with an h1, the
 * previous and next day and the way back as real links, so the page works
 * as a page. `initial` comes from the route's server read.
 */
export function DayLogPage({
  stage,
  today,
  date,
  initial,
  closeHref = "/calendar",
  basePath = "/log",
}: DayLogPageProps) {
  const logging = isLoggingStage(stage) ? stage : null;
  const log = useDayLog({ date: logging ? date : null, stage: logging ?? "cycle", initial });
  if (logging === null) return null;
  const { previous, next } = dayNeighbours(date, today);
  return (
    <DaySheet
      page={{
        closeHref,
        previousHref: `${basePath}/${previous}`,
        ...(next === null ? {} : { nextHref: `${basePath}/${next}` }),
      }}
      date={date}
      loading={log.phase === "loading" || log.phase === "closed"}
      error={log.loadError}
      onRetry={log.retryLoad}
      draftKey={log.draftKey}
      initial={log.initialDraft}
      {...formBindings(log, logging)}
    />
  );
}
