"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { FlowLevel, MoodCode, Note, NoteCategory } from "@tidefern/schemas";
import { Icon } from "@/components/icons";
import {
  EMPTY_DRAFT,
  formatSheetDate,
  periodOn,
  sameDraft,
  shareCategoryFor,
  withPeriod,
  type DayDraft,
  type LoggingStage,
} from "@/lib/day-log";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { ChipGroup, symptomOptions } from "./chip-group";
import { flowOptions } from "./flow-scale";
import { FormField } from "./form-field";
import { InlineFeedback } from "./inline-feedback";
import { moodOptions } from "./mood-selector";
import { SegmentedControl } from "./segmented-control";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import styles from "./day-sheet.module.css";

export { formatSheetDate };

/** The API's note limit (packages/schemas notes.ts). */
export const NOTE_MAX_LENGTH = 4000;

/**
 * Who can read a note on the day, by where it is filed (architecture 8.2):
 * the private journal is hers alone; a shared note is read by the people
 * her grant for that category reaches. Never a person's name, never a
 * guess at who holds the grant.
 */
export function noteAudience(category: NoteCategory): string {
  if (category === "cycle.symptoms") return "Shared with people who can see your symptoms";
  if (category === "pregnancy.overview") {
    return "Shared with people who can see your pregnancy overview";
  }
  return "Only you can read this.";
}

/** What sharing means, said before she confirms it: where the note goes and that it is one way. */
export function shareExplanation(stage: LoggingStage): string {
  const where =
    shareCategoryFor(stage) === "pregnancy.overview" ? "your pregnancy overview" : "your symptoms";
  return `It moves out of your private notes and is filed with ${where}, so the people who can see ${where} can read it. A shared note cannot be made private again, only deleted.`;
}

/** A part of the day that failed to save, and whether Try again can help. */
export interface DayLogPartError {
  /** What went wrong and what to do next. */
  message: string;
  /** Show Try again; false when trying again cannot help, such as a session that ended. */
  retry?: boolean;
  /** Changes for every attempt that fails, so a second failure plays its cue again. */
  id?: number | string;
}

/** The line beside Save: "Saved for Monday, Oct 5." with Undo, or what an undo, share or delete did. */
export interface DayLogNotice {
  tone: "success" | "error";
  message: string;
  /** Changes for every new notice, so its cue plays once per event. */
  id?: number | string;
  /** Undo, offered for the ten seconds after a save. */
  onUndo?: () => void;
  undoing?: boolean;
  /**
   * Moves focus to the line when it arrives, for an action whose control
   * went away with it (Undo, a share, a delete), so focus never drops to
   * the page.
   */
  focus?: boolean;
}

/** The quiet action beside Save: close the sheet, follow a link back, or put the draft back. */
export type DayLogSecondary =
  { kind: "close"; onClose: () => void } | { kind: "link"; href: string } | { kind: "reset" };

export interface DayLogFormProps {
  /** Pregnancy has no Period switch and no flow scale; cycle and postpartum keep them. */
  stage: LoggingStage;
  /**
   * Where the draft starts, read once on mount. Key the form (DaySheet's
   * `draftKey`, from `dayLogKey`) so a late load, a day change or an undo
   * remounts it with new values; a save of its own never needs to.
   */
  initial: DayDraft;
  /** The day as last saved, which the draft is compared with; `initial` when absent. */
  saved?: DayDraft;
  /** Notes on the day the field does not edit (shared ones), shown read-only. */
  otherNotes?: readonly Note[];
  onSave: (draft: DayDraft) => void;
  /** The save is in flight: Save reads "Saving" and keeps its width. */
  saving?: boolean;
  /** The day's flow, symptoms and mood failed to save; shown under them with Try again. */
  entryError?: DayLogPartError;
  /** The note failed to save; shown under it with Try again. */
  noteError?: DayLogPartError;
  notice?: DayLogNotice;
  /** Shares the saved private note once she confirms; resolves true when it is shared. */
  onShareNote?: () => Promise<boolean>;
  sharing?: boolean;
  shareError?: string;
  /** Deletes one of the read-only notes once she confirms; resolves true when it is gone. */
  onDeleteNote?: (id: string) => Promise<boolean>;
  deletingNoteId?: string | null;
  deleteError?: { id: string; message: string } | null;
  secondary?: DayLogSecondary;
  /** Opens with a confirm step showing, for the reference page only. */
  defaultConfirm?: "share" | { delete: string };
}

/** The radio groups' "nothing chosen yet": no option carries it, so no radio is checked. */
const UNSET = "unset";
type FlowChoice = FlowLevel | typeof UNSET;
type MoodChoice = MoodCode | typeof UNSET;

const noSubscription = () => () => {};

/** False in the server's HTML and while it hydrates, then true. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function PartFailure({
  error,
  cue,
  saving,
  onRetry,
}: {
  error: DayLogPartError;
  cue: boolean;
  saving: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.failure}>
      <InlineFeedback key={error.id ?? error.message} tone="error" cue={cue}>
        {error.message}
      </InlineFeedback>
      {error.retry === false ? null : (
        <Button variant="secondary" onClick={onRetry} loading={saving} loadingText="Saving">
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * The form body of the day sheet (DESIGN.md 3.4 and 5.1), shared by the
 * sheet, the page at /log/[date] and Today's open card: the Period switch
 * and the flow scale (not in pregnancy), the symptom chips with the API's
 * labels, the mood, the notes already shared (read-only, labelled by who can
 * read them), the private note with its explicit share, then Save. It keeps
 * a draft and hands it back on Save; it never writes anything itself.
 *
 * The form posts to its own URL if it is ever submitted natively, and its
 * controls stay inert until the page hydrates, so a tap before the scripts
 * arrive can never put a flow or a mood code into a URL.
 */
export function DayLogForm({
  stage,
  initial,
  saved = initial,
  otherNotes = [],
  onSave,
  saving = false,
  entryError,
  noteError,
  notice,
  onShareNote,
  sharing = false,
  shareError,
  onDeleteNote,
  deletingNoteId = null,
  deleteError = null,
  secondary,
  defaultConfirm,
}: DayLogFormProps) {
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<DayDraft>(initial);
  const [confirmingShare, setConfirmingShare] = useState(defaultConfirm === "share");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(
    typeof defaultConfirm === "object" ? defaultConfirm.delete : null,
  );
  const periodLabelId = useId();
  const periodHelpId = useId();
  const shareTitleId = useId();
  const otherNotesId = useId();
  const shareTitle = useRef<HTMLParagraphElement>(null);
  const shareRow = useRef<HTMLDivElement>(null);
  const noticeLine = useRef<HTMLDivElement>(null);
  /** Where focus goes after the next render; set only by her own presses, never on mount. */
  const focusNext = useRef<"share-title" | "share-button" | null>(null);
  const dirty = !sameDraft(saved, draft);
  const noteChanged = draft.note !== saved.note;
  const hasSavedNote = saved.note.trim() !== "";
  const tracksPeriod = stage !== "pregnancy";
  const noticeId = notice?.id;
  const noticeTakesFocus = notice?.focus === true;

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === "share-title") shareTitle.current?.focus();
    else shareRow.current?.querySelector("button")?.focus();
  });

  useEffect(() => {
    if (noticeTakesFocus) noticeLine.current?.focus();
  }, [noticeId, noticeTakesFocus]);

  function update(patch: Partial<DayDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function submit() {
    if (saving) return;
    onSave(draft);
  }

  function openShare() {
    focusNext.current = "share-title";
    setConfirmingShare(true);
  }

  function keepPrivate() {
    focusNext.current = "share-button";
    setConfirmingShare(false);
  }

  async function confirmShare() {
    if (!onShareNote || sharing) return;
    if (await onShareNote()) {
      setConfirmingShare(false);
      // The note now lives with the shared ones; the field is for a new private note.
      setDraft((current) => ({ ...current, note: "" }));
    }
  }

  async function confirmDelete(id: string) {
    if (!onDeleteNote || deletingNoteId !== null) return;
    if (await onDeleteNote(id)) setConfirmingDelete(null);
  }

  let secondaryAction: ReactNode = null;
  if (secondary?.kind === "close") {
    secondaryAction = (
      <Button variant="quiet" onClick={secondary.onClose} disabled={saving}>
        {dirty ? "Cancel" : "Close"}
      </Button>
    );
  } else if (secondary?.kind === "link") {
    secondaryAction = (
      <Button variant="quiet" href={secondary.href}>
        {dirty ? "Cancel" : "Close"}
      </Button>
    );
  } else if (secondary?.kind === "reset" && dirty) {
    secondaryAction = (
      <Button variant="quiet" onClick={() => setDraft(saved)} disabled={saving}>
        Cancel
      </Button>
    );
  }

  return (
    <form
      className={styles.form}
      method="post"
      inert={!hydrated}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {tracksPeriod ? (
        <>
          <div className={styles.periodRow}>
            <div>
              <p id={periodLabelId} className={styles.periodLabel}>
                Period
              </p>
              <p id={periodHelpId} className={styles.periodHelp}>
                One press logs a period day and picks Medium below; change it before you save. The
                same press takes it back.
              </p>
            </div>
            <Switch
              checked={periodOn(draft)}
              onChange={(on) => setDraft((current) => withPeriod(current, on))}
              aria-labelledby={periodLabelId}
              aria-describedby={periodHelpId}
            />
          </div>
          <SegmentedControl<FlowChoice>
            label="Flow"
            options={flowOptions}
            value={draft.flow ?? UNSET}
            onChange={(flow) => {
              if (flow !== UNSET) update({ flow });
            }}
            tone="period"
          />
        </>
      ) : null}

      <ChipGroup
        label="Symptoms"
        options={symptomOptions}
        selected={draft.symptoms}
        onChange={(symptoms) => update({ symptoms })}
        visible={6}
      />

      <SegmentedControl<MoodChoice>
        label="Mood"
        options={moodOptions}
        value={draft.mood ?? UNSET}
        onChange={(mood) => {
          if (mood !== UNSET) update({ mood });
        }}
      />

      {entryError ? <PartFailure error={entryError} cue saving={saving} onRetry={submit} /> : null}

      {otherNotes.length > 0 ? (
        <div className={styles.otherNotes}>
          <p id={otherNotesId} className={styles.otherNotesLabel}>
            Notes on this day
          </p>
          <ul className={styles.otherList} aria-labelledby={otherNotesId}>
            {otherNotes.map((note) => (
              <OtherNote
                key={note.id}
                note={note}
                confirming={confirmingDelete === note.id}
                deleting={deletingNoteId === note.id}
                error={deleteError?.id === note.id ? deleteError.message : undefined}
                onAsk={onDeleteNote ? () => setConfirmingDelete(note.id) : undefined}
                onKeep={() => setConfirmingDelete(null)}
                onConfirm={() => confirmDelete(note.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <FormField label="Private note" help={noteAudience("journal.private")}>
        {(control) => (
          <Textarea
            {...control}
            autoComplete="off"
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            value={draft.note}
            onChange={(event) => update({ note: event.currentTarget.value })}
          />
        )}
      </FormField>
      {noteError ? (
        <PartFailure error={noteError} cue={!entryError} saving={saving} onRetry={submit} />
      ) : null}

      {onShareNote && hasSavedNote ? (
        <div className={styles.share} ref={shareRow}>
          {confirmingShare ? (
            <div className={styles.confirm} role="group" aria-labelledby={shareTitleId}>
              <p id={shareTitleId} className={styles.confirmTitle} ref={shareTitle} tabIndex={-1}>
                Share this note?
              </p>
              <p className={styles.confirmText}>{shareExplanation(stage)}</p>
              <div className={styles.confirmActions}>
                <Button
                  variant="secondary"
                  icon="sharing"
                  onClick={confirmShare}
                  loading={sharing}
                  loadingText="Sharing"
                >
                  Share note
                </Button>
                <Button variant="quiet" onClick={keepPrivate} disabled={sharing}>
                  Keep it private
                </Button>
              </div>
              {shareError ? (
                <InlineFeedback tone="error" cue>
                  {shareError}
                </InlineFeedback>
              ) : null}
            </div>
          ) : (
            <>
              <Button
                variant="quiet"
                icon="sharing"
                onClick={openShare}
                disabled={noteChanged || saving}
              >
                Share this note with...
              </Button>
              {noteChanged ? (
                <p className={styles.shareHelp}>Save the note first, then share it.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={saving} loadingText="Saving">
          Save
        </Button>
        {secondaryAction}
      </div>
      {notice ? (
        <div className={styles.notice} hidden={dirty} ref={noticeLine} tabIndex={-1}>
          <InlineFeedback key={notice.id ?? notice.message} tone={notice.tone} cue>
            {notice.message}
          </InlineFeedback>
          {notice.onUndo && !dirty ? (
            <Button
              variant="quiet"
              icon="undo"
              onClick={notice.onUndo}
              loading={notice.undoing}
              loadingText="Undoing"
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className={styles.footnote}>
        <Icon name="today-marker" size={20} /> Saved days show a dot on the calendar.
      </p>
    </form>
  );
}

function OtherNote({
  note,
  confirming,
  deleting,
  error,
  onAsk,
  onKeep,
  onConfirm,
}: {
  note: Note;
  confirming: boolean;
  deleting: boolean;
  error: string | undefined;
  onAsk: (() => void) | undefined;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const labelId = useId();
  const confirmId = useId();
  const item = useRef<HTMLLIElement>(null);
  const confirmTitle = useRef<HTMLParagraphElement>(null);
  /** Where focus goes after the next render; set only by her own presses, never on mount. */
  const focusNext = useRef<"confirm" | "button" | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === "confirm") confirmTitle.current?.focus();
    else item.current?.querySelector("button")?.focus();
  });

  return (
    <li className={styles.otherNote} ref={item}>
      <p id={labelId} className={styles.otherLabel}>
        {noteAudience(note.category)}
      </p>
      {note.authorId !== null && note.authorId !== note.subjectId ? (
        <p className={styles.otherBy}>Added by someone you share with.</p>
      ) : null}
      {note.body !== undefined ? <p className={styles.otherBody}>{note.body}</p> : null}
      {onAsk && confirming ? (
        <div className={styles.confirm} role="group" aria-labelledby={confirmId}>
          <p id={confirmId} className={styles.confirmTitle} ref={confirmTitle} tabIndex={-1}>
            Delete this note?
          </p>
          <p className={styles.confirmText}>
            It is removed for you and for everyone who can read it, and it cannot be brought back.
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="destructive"
              onClick={onConfirm}
              loading={deleting}
              loadingText="Deleting"
            >
              Delete note
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                focusNext.current = "button";
                onKeep();
              }}
              disabled={deleting}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : onAsk ? (
        <Button
          variant="quiet"
          onClick={() => {
            focusNext.current = "confirm";
            onAsk();
          }}
          aria-describedby={labelId}
        >
          Delete this note
        </Button>
      ) : null}
      {error ? (
        <InlineFeedback tone="error" cue>
          {error}
        </InlineFeedback>
      ) : null}
    </li>
  );
}

interface DaySheetCommon extends Omit<DayLogFormProps, "initial" | "secondary"> {
  /** The day being logged, `YYYY-MM-DD`; the title says it and nothing else. */
  date: string;
  /** Where the draft starts; nothing logged when absent. */
  initial?: DayDraft;
  /**
   * The draft's key (`dayLogKey` from lib/day-log): a change remounts the
   * draft from `initial` without closing the sheet. The date when absent.
   */
  draftKey?: string;
  /** The day is still arriving: the body reads "Loading". */
  loading?: boolean;
  /** The day could not be loaded: shown beneath the title, with Try again when `onRetry` is given. */
  error?: string;
  onRetry?: () => void;
}

export interface DaySheetDialogProps extends DaySheetCommon {
  page?: undefined;
  open: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Draws the open sheet in the page flow instead of the top layer. Documentation only. */
  inline?: boolean;
}

/** Page mode for /log/[date]: an h1, the neighbouring days and the way back as real links. */
export interface DayPageLinks {
  closeHref: string;
  previousHref?: string;
  /** Absent on today: a day that has not happened has nothing to log. */
  nextHref?: string;
  /** 1 on the route; the reference page, which has its own h1, passes 3. */
  headingLevel?: 1 | 3;
}

export interface DaySheetPageProps extends DaySheetCommon {
  page: DayPageLinks;
}

export type DaySheetProps = DaySheetDialogProps | DaySheetPageProps;

/**
 * The day sheet (DESIGN.md 3.4): the bottom sheet on phones and a dialog
 * from 1024 px over Calendar and Today, or with `page` the same form as the
 * page at /log/[date]. The title is the date and never anything logged.
 */
export function DaySheet(props: DaySheetProps) {
  const { initial = EMPTY_DRAFT, draftKey, loading = false, error, onRetry } = props;
  const formProps = {
    stage: props.stage,
    saved: props.saved,
    otherNotes: props.otherNotes,
    onSave: props.onSave,
    saving: props.saving,
    entryError: props.entryError,
    noteError: props.noteError,
    notice: props.notice,
    onShareNote: props.onShareNote,
    sharing: props.sharing,
    shareError: props.shareError,
    onDeleteNote: props.onDeleteNote,
    deletingNoteId: props.deletingNoteId,
    deleteError: props.deleteError,
    defaultConfirm: props.defaultConfirm,
  };
  const title = formatSheetDate(props.date);
  const retry = onRetry ? (
    <Button variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  ) : null;

  if (props.page) {
    const { page } = props;
    const secondary: DayLogSecondary = { kind: "link", href: page.closeHref };
    return (
      <DayPage title={title} links={page}>
        {loading ? (
          <p className={styles.loading}>Loading</p>
        ) : error ? (
          <div className={styles.loadFailure}>
            {/* A read that failed is background data: the text, no cue (DESIGN.md 7). */}
            <InlineFeedback tone="error">{error}</InlineFeedback>
            {retry}
          </div>
        ) : (
          <DayLogForm
            key={draftKey ?? props.date}
            {...formProps}
            initial={initial}
            secondary={secondary}
          />
        )}
      </DayPage>
    );
  }

  const { open, onClose, onPrevious, onNext, inline = false } = props;
  const dayNav = (
    <div className={styles.dayNav}>
      <Button variant="quiet" icon="chevron-left" onClick={onPrevious} disabled={!onPrevious}>
        Previous day
      </Button>
      <Button variant="quiet" icon="chevron-right" onClick={onNext} disabled={!onNext}>
        Next day
      </Button>
    </div>
  );
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      loading={loading}
      error={error}
      inline={inline}
    >
      {error ? (
        // The sentence is under the title; Try again comes straight after it, then the other days.
        <div className={styles.sheetFailure}>
          {retry}
          {dayNav}
        </div>
      ) : (
        <>
          {dayNav}
          <DayLogForm
            key={draftKey ?? props.date}
            {...formProps}
            initial={initial}
            secondary={{ kind: "close", onClose }}
          />
        </>
      )}
    </BottomSheet>
  );
}

function DayPage({
  title,
  links,
  children,
}: {
  title: string;
  links: DayPageLinks;
  children: ReactNode;
}) {
  const titleId = useId();
  const Heading = links.headingLevel === 3 ? "h3" : "h1";
  return (
    <section className={styles.page} aria-labelledby={titleId}>
      <div className={styles.pageTop}>
        <Heading id={titleId} className={styles.pageTitle}>
          {title}
        </Heading>
        <Button variant="quiet" icon="close" href={links.closeHref}>
          Close
        </Button>
      </div>
      <nav className={styles.dayNav} aria-label="Previous and next day">
        {links.previousHref ? (
          <Button variant="quiet" icon="chevron-left" href={links.previousHref}>
            Previous day
          </Button>
        ) : (
          <span />
        )}
        {links.nextHref ? (
          <Button variant="quiet" icon="chevron-right" href={links.nextHref}>
            Next day
          </Button>
        ) : null}
      </nav>
      {children}
    </section>
  );
}
