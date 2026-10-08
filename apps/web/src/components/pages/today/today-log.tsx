"use client";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS, type Note } from "@tidefern/schemas";
import { DayLogInline, DayLogSheet } from "@/components/day-log/day-log-sheet";
import { Button } from "@/components/ui/button";
import { useQuickLog } from "@/components/ui/quick-log";
import {
  formatSheetDate,
  savedValues,
  type DayState,
  type EntryValues,
  type LoggingStage,
} from "@/lib/day-log";
import { todayCopy } from "./copy";
import styles from "./today.module.css";

/**
 * The quick log on Today (DESIGN.md 1.2 and 5.1). One provider owns the
 * day sheet and the shell's quick-log action (`useQuickLog`): from 1024 px,
 * where the rail is and the open card shows the form in the page, the
 * action moves focus to that card; below it, where the tab bar is and the
 * card shows only a summary, the action opens the sheet as a bottom sheet.
 * Which one is decided by what is on screen when it is pressed, so it
 * follows the same container query that lays the card out.
 *
 * Both views of today read the day the server already loaded (`initial`)
 * and refresh the server parts of the page after a save, so the ring and
 * the sentences redraw from the API's answer, never from the draft.
 */

interface TodayLogContextValue {
  /** Brings the day's form to her: focus on the open card, or the sheet. */
  open: () => void;
  card: RefObject<HTMLElement | null>;
  form: RefObject<HTMLDivElement | null>;
}

const TodayLogContext = createContext<TodayLogContextValue | null>(null);

function useTodayLog(): TodayLogContextValue {
  const context = useContext(TodayLogContext);
  if (context === null) throw new Error("TodayLogProvider must wrap the open card and its actions");
  return context;
}

export interface TodayLogProviderProps {
  stage: LoggingStage;
  /** Today in the profile's time zone, from the API. */
  today: string;
  /** Today as the server read it; the sheet and the card load it themselves when absent. */
  initial: DayState | null;
  children: ReactNode;
}

export function TodayLogProvider({ stage, today, initial, children }: TodayLogProviderProps) {
  const [date, setDate] = useState<string | null>(null);
  const card = useRef<HTMLElement>(null);
  const form = useRef<HTMLDivElement>(null);

  const open = useCallback(() => {
    const inline = form.current;
    // The form is on screen when the card lays it out (from 1024 px); focusing the card scrolls to it.
    if (inline !== null && inline.getClientRects().length > 0) {
      card.current?.focus();
      return;
    }
    setDate(today);
  }, [today]);

  useQuickLog(open);

  const value = useMemo(() => ({ open, card, form }), [open]);
  return (
    <TodayLogContext.Provider value={value}>
      {children}
      <DayLogSheet
        stage={stage}
        today={today}
        date={date}
        onClose={() => setDate(null)}
        onDateChange={setDate}
        initial={initial}
      />
    </TodayLogContext.Provider>
  );
}

/** The flow in words for the summary: a period flow says so, spotting and none say what they are. */
function flowWords(flow: NonNullable<EntryValues["flow"]>): string {
  if (flow === "none") return "no flow";
  if (flow === "spotting") return FLOW_LABELS.spotting.toLowerCase();
  return `${FLOW_LABELS[flow].toLowerCase()} flow`;
}

/** Her own note, as the day sheet tells one apart from a note "Added by someone you share with". */
function isOwn(note: Note): boolean {
  return note.authorId === null || note.authorId === note.subjectId;
}

/**
 * What the card says is logged for today, in the sheet's own labels, or
 * nothing when the server could not read the day. Never a guess: only the
 * values the API returned. Every note on the day counts, as the sheet shows
 * them: her private notes, the ones she shared, and notes added by someone
 * she shares with.
 */
export function loggedSummary(day: DayState | null): string | null {
  if (day === null) return null;
  const values = savedValues(day);
  const parts: string[] = [];
  if (values.flow !== null) parts.push(flowWords(values.flow));
  for (const symptom of values.symptoms) parts.push(SYMPTOM_LABELS[symptom].toLowerCase());
  if (values.mood !== null) parts.push(`${MOOD_LABELS[values.mood].toLowerCase()} mood`);
  const own = day.others.filter(isOwn);
  const privateNotes =
    (day.note.status === "saved" ? 1 : 0) +
    own.filter((note) => note.category === "journal.private").length;
  const sharedNotes = own.filter((note) => note.category !== "journal.private").length;
  const fromOthers = day.others.length - own.length;
  if (privateNotes > 0) parts.push(todayCopy.log.privateNotes(privateNotes));
  if (sharedNotes > 0) parts.push(todayCopy.log.sharedNotes(sharedNotes));
  if (fromOthers > 0) parts.push(todayCopy.log.notesFromOthers(fromOthers));
  return parts.length === 0 ? todayCopy.log.nothing : todayCopy.log.logged(parts);
}

export interface TodayLogCardProps {
  stage: LoggingStage;
  today: string;
  initial: DayState | null;
}

/**
 * Today's open card (DESIGN.md 5.1 step 1): "Log today" with the date, the
 * form itself from 1024 px, and below that a summary of what is logged
 * with one button that opens the sheet. The card is a surface, never
 * warmth, because it hosts controls.
 */
export function TodayLogCard({ stage, today, initial }: TodayLogCardProps) {
  const { open, card, form } = useTodayLog();
  const headingId = useId();
  const summary = loggedSummary(initial);
  return (
    <section
      ref={card}
      id="log-today"
      tabIndex={-1}
      className={styles.card}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.cardHeading}>
        {todayCopy.log.heading}
      </h2>
      <p className={styles.cardDate}>{formatSheetDate(today)}</p>
      <div ref={form} className={styles.logInline}>
        <DayLogInline stage={stage} today={today} initial={initial} />
      </div>
      <div className={styles.logCompact}>
        {summary === null ? null : <p className={styles.cardText}>{summary}</p>}
        <Button variant="primary" icon="plus" onClick={open}>
          {todayCopy.log.open}
        </Button>
      </div>
    </section>
  );
}

/** A quiet card's one action ("Log a period"): the same as the shell's quick-log button. */
export function LogTodayAction({ children }: { children: ReactNode }) {
  const { open } = useTodayLog();
  return (
    <Button variant="secondary" onClick={open}>
      {children}
    </Button>
  );
}
