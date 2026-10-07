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
      "As the day sheet. Undo sits beside the saved line for ten seconds and puts the day back as it was; the line plays the success cue once.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
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
    name: "Day sheet, pregnancy",
    source: `${ui}day-sheet.tsx`,
    usage: `<DaySheet stage="pregnancy" ... />`,
    keyboard:
      "As the day sheet, without the Period switch and the flow scale: symptoms, mood and the note.",
    states: defaultOnly,
    wide: true,
    render: () => (
      <DaySheet
        inline
        open
        onClose={noop}
        date={date}
        stage="pregnancy"
        initial={pregnancyDay}
        onSave={noop}
        onShareNote={notDone}
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
