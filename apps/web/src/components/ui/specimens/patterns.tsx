"use client";
import type { Note } from "@tidefern/schemas";
import { EMPTY_DRAFT, type DayDraft } from "@/lib/day-log";
import { DayLogForm, DaySheet } from "../day-sheet";
import type { ComponentState, Specimen, SpecimenGroup } from "../specimen";
import { SpecimenFrame } from "../specimen-frame";

const ui = "apps/web/src/components/ui/";

const noop = () => {};
/** The reference page never writes: a share or a delete it is asked for resolves as not done. */
const notDone = async () => false;
/*
 * Every sheet here passes cues={false}: nobody pressed anything on the
 * reference page, and a navigation plays only the settle cue (DESIGN.md 7),
 * so its saved and failed lines stay silent.
 */

const date = "2026-10-05";

/** A day with a period logged: what the sheet opens with when the day already has an entry. */
const periodDay: DayDraft = {
  flow: "medium",
  symptoms: ["cramps", "fatigue"],
  mood: "steady",
  note: "",
};

const withNote: DayDraft = { ...periodDay, note: "Slept badly; the hot water bottle helped." };

/** A day of spotting: not a period, so the switch is off and the scale keeps Spotting. */
const spottingDay: DayDraft = { flow: "spotting", symptoms: ["bloating"], mood: null, note: "" };

const pregnancyDay: DayDraft = {
  flow: null,
  symptoms: ["nausea", "fatigue"],
  mood: "low",
  note: "",
};

/** The saved note with a sentence she has added and not saved yet. */
const editedNote: DayDraft = { ...withNote, note: `${withNote.note} Then a short walk.` };

/** The private note as a conflict read it back: the text the field now shows. */
const changedNote: DayDraft = { ...periodDay, note: "Slept badly; better after lunch." };

const signedOut = "Your session has ended. Sign in again, then come back to this day.";

/** A note filed under symptoms by the share action: read-only, labelled by who can read it. */
const sharedNote: Note = {
  id: "018f5e7a-5eed-7040-8000-000000000002",
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  authorId: "018f5e7a-5eed-7000-8000-000000000001",
  category: "cycle.symptoms",
  date,
  body: "Steadier today. Sharing this one.",
  createdAt: "2026-10-05T07:30:00.000Z",
  updatedAt: "2026-10-05T07:40:00.000Z",
  version: 2,
};

/** A note someone she shares her pregnancy overview with added to her day. */
const contributorNote: Note = {
  id: "018f5e7a-5eed-7040-8000-000000000003",
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  authorId: "018f5e7a-5eed-7000-8000-000000000004",
  category: "pregnancy.overview",
  date,
  body: "Drove her to the appointment. Home by noon.",
  createdAt: "2026-10-05T12:10:00.000Z",
  updatedAt: "2026-10-05T12:10:00.000Z",
  version: 1,
};

const none = { hover: "none", "focus-visible": "none", active: "none", disabled: "none" } as const;

/** A variant shows one state of the sheet; the eight-state grid is the first specimen's. */
const defaultOnly = { ...none, loading: "none", error: "none", empty: "none" } as const;

const sheetUsage = [
  `<DaySheet`,
  `  open={open}`,
  `  onClose={close}`,
  `  date="2026-10-05"`,
  `  stage="cycle"`,
  `  draftKey={dayLogKey(date, day.entry, generation)}`,
  `  initial={draftFrom(day)}`,
  `  onSave={save}`,
  `  onShareNote={share}`,
  `  saving={saving}`,
  `/>`,
].join("\n");

const keyboard =
  "Focus lands on the close button; Tab moves through previous and next day, the Period switch, the flow radios, the symptom chips, the mood radios, the note, the sharing action, Save and Cancel; Space flips the switch and the chips; Escape closes the sheet and focus returns to the opener.";

const daySheet: Specimen = {
  name: "Day sheet",
  source: `${ui}day-sheet.tsx`,
  usage: sheetUsage,
  keyboard,
  // The sheet is a composition: hover, focus and active belong to the controls inside it, and the sheet has no disabled state of its own.
  states: none,
  wide: true,
  render: (state: ComponentState) => (
    <DaySheet
      inline
      cues={false}
      open
      onClose={noop}
      date={date}
      stage="cycle"
      initial={state === "empty" ? undefined : withNote}
      onSave={noop}
      onShareNote={notDone}
      onPrevious={noop}
      loading={state === "loading"}
      error={state === "error" ? "We could not load this day. Try again." : undefined}
      onRetry={noop}
    />
  ),
};

const variants: Specimen[] = [
  {
    name: "Day sheet, spotting day",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet stage="cycle" initial={{ flow: "spotting", symptoms, mood: null, note: "" }} ... />`,
    keyboard:
      "As the day sheet. Spotting is not a period, so the switch reads Off and the scale keeps Spotting; Save keeps it.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={spottingDay}
        onSave={noop}
      />
    ),
  },
  {
    name: "Day sheet, saving",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... saving={saving} />`,
    keyboard:
      "As the day sheet. While the save is in flight Save reads Saving at the same width and ignores presses; nothing else changes until the answer.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        saved={periodDay}
        onSave={noop}
        saving
      />
    ),
  },
  {
    name: "Day sheet, saved",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... notice={{ tone: "success", message: "Saved for Monday, Oct 5.", onUndo: undo }} />`,
    keyboard:
      "As the day sheet. Undo sits beside the saved line for ten seconds and puts the day back as it was; in the product the line plays the success cue once, and this page plays none.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        onSave={noop}
        notice={{ tone: "success", message: "Saved for Monday, Oct 5.", id: 1, onUndo: noop }}
      />
    ),
  },
  {
    name: "Day sheet, undo in flight",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... notice={{ ...savedLine, onUndo: undo, undoing }} />`,
    keyboard:
      "As the day sheet. Undo reads Undoing at the same width and keeps focus until the compensating writes answer, even past the ten seconds.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        onSave={noop}
        notice={{
          tone: "success",
          message: "Saved for Monday, Oct 5.",
          id: 1,
          onUndo: noop,
          undoing: true,
        }}
      />
    ),
  },
  {
    name: "Day sheet, undo failed",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... notice={{ tone: "error", message: undoFailed, focus: true }} />`,
    keyboard:
      "As the day sheet. An undo that could not put every part back says so beside Save and takes focus, since the Undo it answered is gone; the form shows what the day now holds.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        onSave={noop}
        notice={{
          tone: "error",
          message: "We could not undo every change. Check this day and change it back.",
          id: 1,
        }}
      />
    ),
  },
  {
    name: "Day sheet, a part failed",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... entryError={{ message: entryConflict }} noteError={{ message: noteFailed }} />`,
    keyboard:
      "As the day sheet. Each failure sits under the part that failed with its own Try again; the sheet stays open and the draft stays as it was.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        saved={periodDay}
        onSave={noop}
        entryError={{
          message: "This day was changed somewhere else. Try again to save your version.",
        }}
        noteError={{ message: "We could not save your note. Try again." }}
      />
    ),
  },
  {
    name: "Day sheet, session ended",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... entryError={{ message: signedOut, retry: false }} />`,
    keyboard:
      "As the day sheet. Trying again cannot help once the session has ended, so the line under the day's fields has no Try again, and it is said once though both parts failed.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        saved={periodDay}
        onSave={noop}
        entryError={{ message: signedOut, retry: false }}
      />
    ),
  },
  {
    name: "Day sheet, session ended on load",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... error={signedOut} />`,
    keyboard:
      "As the day sheet. The day could not be read because the session has ended: the sentence sits under the title with no Try again, and the day buttons still move.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        onSave={noop}
        onPrevious={noop}
        error={signedOut}
      />
    ),
  },
  {
    name: "Day sheet, shared note",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... otherNotes={[sharedNote]} onDeleteNote={remove} />`,
    keyboard:
      "As the day sheet. A shared note is text, not a field: Tab reaches its Delete this note action, which asks before it deletes.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        otherNotes={[sharedNote]}
        onSave={noop}
        onShareNote={notDone}
        onDeleteNote={notDone}
      />
    ),
  },
  {
    name: "Day sheet, deleting a note",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... otherNotes={[sharedNote]} onDeleteNote={remove} />`,
    keyboard:
      "As the day sheet. Delete this note opens the confirm step in place and moves focus to its question; Delete note removes the note for everyone who can read it, and Keep it closes the step and returns focus to Delete this note.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        otherNotes={[sharedNote]}
        onSave={noop}
        onShareNote={notDone}
        onDeleteNote={notDone}
        defaultConfirm={{ delete: sharedNote.id }}
      />
    ),
  },
  {
    name: "Day sheet, delete in flight",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... deletingNoteId={deletingNoteId} />`,
    keyboard:
      "As the day sheet. Delete note reads Deleting at the same width, and Keep it waits for the answer.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        otherNotes={[sharedNote]}
        onSave={noop}
        onShareNote={notDone}
        onDeleteNote={notDone}
        defaultConfirm={{ delete: sharedNote.id }}
        deletingNoteId={sharedNote.id}
      />
    ),
  },
  {
    name: "Day sheet, delete failed",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... deleteError={{ id: note.id, message: deleteFailed }} />`,
    keyboard:
      "As the day sheet. The failure sits under the note it is about, and the confirm step stays open, so Delete note tries again.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={periodDay}
        otherNotes={[sharedNote]}
        onSave={noop}
        onShareNote={notDone}
        onDeleteNote={notDone}
        defaultConfirm={{ delete: sharedNote.id }}
        deleteError={{ id: sharedNote.id, message: "We could not delete this note. Try again." }}
      />
    ),
  },
  {
    name: "Day sheet, note edited",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... initial={draft} saved={saved} onShareNote={share} />`,
    keyboard:
      "As the day sheet. While the note differs from what is saved, Share this note with... is off and says why, so a share always sends the text on screen; Cancel puts the saved text back.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={editedNote}
        saved={withNote}
        onSave={noop}
        onShareNote={notDone}
      />
    ),
  },
  {
    name: "Day sheet, sharing a note",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... initial={dayWithNote} onShareNote={share} sharing={sharing} />`,
    keyboard:
      "As the day sheet. Share this note with... opens the confirm step in place; Share note re-files it, Keep it private closes the step.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        onSave={noop}
        onShareNote={notDone}
        defaultConfirm="share"
      />
    ),
  },
  {
    name: "Day sheet, share in flight",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... sharing={sharing} />`,
    keyboard:
      "As the day sheet. Share note reads Sharing at the same width, and Keep it private waits for the answer.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        onSave={noop}
        onShareNote={notDone}
        defaultConfirm="share"
        sharing
      />
    ),
  },
  {
    name: "Day sheet, share failed",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... shareError={{ message: shareFailed, id: attempt }} />`,
    keyboard:
      "As the day sheet. The failure sits in the confirm step under its actions; the note did not change, so Share note tries the same share again.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={withNote}
        onSave={noop}
        onShareNote={notDone}
        defaultConfirm="share"
        shareError={{ message: "We could not share this note. Try again.", id: 1 }}
      />
    ),
  },
  {
    name: "Day sheet, note changed elsewhere",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet ... initial={draftFrom(dayReadAgain)} shareError={{ message: shareConflict, id: attempt }} />`,
    keyboard:
      "As the day sheet. A share that met a newer note closes its confirm step, puts the note's current text in the field and moves focus to the line that says so; Share this note with... starts again from the text on screen.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="cycle"
        initial={changedNote}
        onSave={noop}
        onShareNote={notDone}
        shareError={{
          message: "This note changed somewhere else. Check it, then share it again.",
          id: 1,
        }}
      />
    ),
  },
  {
    name: "Day sheet, pregnancy",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet stage="pregnancy" otherNotes={notes} ... />`,
    keyboard:
      "As the day sheet, without the Period switch and the flow scale: symptoms, mood, the notes on the day and her note. A note someone she shares with added is filed under her pregnancy overview and says who wrote it; Tab reaches its Delete this note action.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        cues={false}
        open
        onClose={noop}
        date={date}
        stage="pregnancy"
        initial={pregnancyDay}
        otherNotes={[contributorNote]}
        onSave={noop}
        onShareNote={notDone}
        onDeleteNote={notDone}
      />
    ),
  },
  {
    name: "Day sheet, as a page",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet\n  page={{ closeHref: "/calendar", previousHref: "/log/2026-10-03", nextHref: "/log/2026-10-05" }}\n  date="2026-10-04"\n  ...\n/>`,
    keyboard:
      "The page at /log/[date]: the date is the page's heading; Close, Previous day and Next day are links, so the page works before and without its scripts.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        cues={false}
        page={{
          closeHref: "/calendar",
          previousHref: "/log/2026-10-03",
          nextHref: "/log/2026-10-05",
          headingLevel: 3,
        }}
        date="2026-10-04"
        stage="cycle"
        initial={periodDay}
        onSave={noop}
      />
    ),
  },
  {
    name: "Day log form",
    source: `${ui}day-sheet.tsx`,
    usage: `<DayLogForm\n  key={draftKey}\n  stage="cycle"\n  initial={draft}\n  saved={saved}\n  onSave={save}\n  secondary={{ kind: "reset" }}\n/>`,
    keyboard:
      "The sheet's form on its own, for Today's open card: the page draws the card and its heading. Cancel appears only while the draft differs from what is saved.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DayLogForm
        cues={false}
        stage="postpartum"
        initial={EMPTY_DRAFT}
        onSave={noop}
        secondary={{ kind: "reset" }}
      />
    ),
  },
];

/**
 * The compositions the product uses as one thing. This is a client module
 * because the day sheet takes handlers, which cannot cross the server
 * boundary as props; the page renders `PatternsSpecimens` and writes its own
 * title and lede.
 */
export const specimens: SpecimenGroup = {
  slug: "patterns",
  title: "Patterns",
  lede: "Compositions the product uses as one thing: the day sheet first, built from the sheet, the flow scale, the chips, the mood selector and the note field, so the pieces are never recombined ad hoc on a route.",
  specimens: [daySheet, ...variants],
};

export function PatternsSpecimens() {
  return <SpecimenFrame group={specimens} />;
}
