"use client";
import { DaySheet } from "../day-sheet";
import type { ComponentState, Specimen, SpecimenGroup } from "../specimen";
import { SpecimenFrame } from "../specimen-frame";

const ui = "apps/web/src/components/ui/";

const noop = () => {};

const daySheet: Specimen = {
  name: "Day sheet",
  source: `${ui}day-sheet.tsx`,
  usage: [
    `<DaySheet`,
    `  open={open}`,
    `  onClose={close}`,
    `  date="2026-10-05"`,
    `  initial={entry}`,
    `  onSave={save}`,
    `  onShareNote={openSharing}`,
    `  saving={saving}`,
    `/>`,
  ].join("\n"),
  keyboard:
    "Focus lands on the close button; Tab moves through previous and next day, the period switch, the flow radios (while a period is logged), the symptom chips, the mood radios, the note, the sharing action, Save and Cancel; Space flips the switch and the chips; Escape closes the sheet and focus returns to the opener.",
  // The sheet is a composition: hover, focus and active belong to the controls inside it, and the sheet has no disabled state of its own.
  states: { hover: "none", "focus-visible": "none", active: "none", disabled: "none" },
  wide: true,
  render: (state: ComponentState) => (
    <DaySheet
      inline
      open
      onClose={noop}
      date="2026-10-05"
      initial={
        state === "empty"
          ? undefined
          : { period: true, flow: "light", symptoms: ["cramps", "fatigue"], mood: "steady" }
      }
      onSave={noop}
      onShareNote={noop}
      onPrevious={noop}
      onNext={noop}
      loading={state === "loading"}
      error={state === "error" ? "We could not save this day. Try again." : undefined}
    />
  ),
};

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
  specimens: [daySheet],
};

export function PatternsSpecimens() {
  return <SpecimenFrame group={specimens} />;
}
