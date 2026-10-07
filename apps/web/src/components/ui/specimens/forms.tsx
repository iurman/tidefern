import type { ComponentState, SpecimenGroup } from "../specimen";
import { CheckboxField } from "../checkbox-field";
import { ChipGroup, symptomOptions } from "../chip-group";
import { FlowScale } from "../flow-scale";
import { FormField } from "../form-field";
import { MeasurementInput } from "../measurement-input";
import { MoodSelector } from "../mood-selector";
import { SegmentedControl } from "../segmented-control";
import { SegmentedDateInput } from "../segmented-date-input";
import { Textarea } from "../textarea";
import { TextInput } from "../text-input";
import { TimeZoneCombobox } from "../time-zone-combobox";

/**
 * The forms group: every component in every state, built from the real
 * component. Each render passes only serializable props, so the server page
 * can call it; the components keep their own state in the browser. The
 * instant the combobox reads offsets at is fixed, never the clock.
 */

const now = "2026-10-05T12:00:00Z";

/* A short list for the open and empty combobox specimens, so the server and
   the browser render the same options; the default specimen searches the
   runtime's whole IANA list. */
const sampleZones = [
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Europe/London",
  "Asia/Tokyo",
  "Pacific/Auckland",
];

const viewOptions = [
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
];

const common = (state: ComponentState) => ({
  disabled: state === "disabled",
});

export const specimens: SpecimenGroup = {
  slug: "forms",
  title: "Forms",
  lede: "One field anatomy, native controls underneath, and the person's own order and units. Every control here is a real input, so sound, focus and the keyboard come for free.",
  specimens: [
    {
      name: "Form field",
      source: "apps/web/src/components/ui/form-field.tsx",
      usage: `<FormField
  label="Email"
  required
>
  {(control) => (
    <TextInput
      {...control}
      type="email"
      autoComplete="email"
    />
  )}
</FormField>`,
      keyboard: "Tab reaches the control; the label, help and error are read with it.",
      /* A field never saves itself and never pressed: loading and active have no meaning here. */
      states: { loading: "none", active: "none" },
      render: (state) => (
        <FormField
          label="Email"
          help="Only for signing in and account messages."
          required
          error={state === "error" ? "Enter the email address you signed up with." : undefined}
          {...common(state)}
        >
          {(control) => (
            <TextInput
              {...control}
              type="email"
              autoComplete="email"
              defaultValue={state === "empty" ? "" : "ada@example.com"}
            />
          )}
        </FormField>
      ),
    },
    {
      name: "Text input",
      source: "apps/web/src/components/ui/text-input.tsx",
      usage: `<TextInput
  type="text"
  autoComplete="name"
/>`,
      keyboard: "Tab focuses; typing edits. In the product it always sits inside a FormField.",
      states: { loading: "none", active: "none" },
      render: (state) => (
        <TextInput
          aria-label="Name"
          type="text"
          autoComplete="name"
          defaultValue={state === "empty" ? "" : "Ada"}
          invalid={state === "error"}
          {...common(state)}
        />
      ),
    },
    {
      name: "Textarea",
      source: "apps/web/src/components/ui/textarea.tsx",
      usage: `<Textarea
  autoComplete="off"
  rows={3}
/>`,
      keyboard: "Tab focuses; Enter adds a line. Resizes vertically only.",
      states: { loading: "none", active: "none" },
      render: (state) => (
        <Textarea
          aria-label="Note"
          autoComplete="off"
          defaultValue={state === "empty" ? "" : "Slept well. Walked by the water."}
          invalid={state === "error"}
          {...common(state)}
        />
      ),
    },
    {
      name: "Time zone combobox",
      source: "apps/web/src/components/ui/time-zone-combobox.tsx",
      usage: `<TimeZoneCombobox
  label="Where are you?"
  now={nowIso}
  defaultValue={zone}
  onChange={setZone}
/>`,
      keyboard:
        "Type to filter. Down and Up move through the list, Home and End jump, Enter chooses, Escape closes and restores the chosen zone.",
      /* The list is built in the browser in one pass: nothing loads. The input never presses: no active. */
      states: { loading: "none", active: "none" },
      render: (state) => (
        <TimeZoneCombobox
          label="Where are you?"
          help="Your calendar days follow this zone."
          now={now}
          defaultValue={state === "empty" ? "Atlantis/Nowhere" : "Europe/Berlin"}
          zones={state === "empty" ? sampleZones : undefined}
          defaultOpen={state === "empty"}
          error={state === "error" ? "Choose a zone from the list." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Segmented date input",
      source: "apps/web/src/components/ui/segmented-date-input.tsx",
      usage: `<SegmentedDateInput
  label="Due date"
  order={dateOrder}
  onChange={setDate}
/>`,
      keyboard:
        "Tab moves between the parts; a full part moves on by itself. Digits only; letters are dropped.",
      states: { loading: "none", active: "none" },
      render: (state) => (
        <SegmentedDateInput
          label="Due date"
          order="dmy"
          defaultValue={state === "empty" ? undefined : "2027-04-03"}
          error={state === "error" ? "Enter a date in the next 10 months." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Measurement input",
      source: "apps/web/src/components/ui/measurement-input.tsx",
      usage: `<MeasurementInput
  label="Weight"
  kind="weight"
  defaultUnit={units}
  onChange={setGrams}
/>`,
      keyboard:
        "Tab reaches the number, then the unit toggle; Left and Right change the unit and the number redraws in it.",
      states: { loading: "none", active: "none" },
      render: (state) => (
        <MeasurementInput
          label="Weight"
          kind="weight"
          help="Stored in grams; shown in the unit you choose."
          defaultValue={state === "empty" ? null : 3402}
          defaultUnit="imperial"
          error={state === "error" ? "Enter a weight between 0.5 and 30 kg." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Segmented control",
      source: "apps/web/src/components/ui/segmented-control.tsx",
      usage: `<SegmentedControl
  label="View"
  options={views}
  value={view}
  onChange={setView}
/>`,
      keyboard:
        "One tab stop; Left and Right (or Up and Down) move the choice and select it. Content swaps in place; the URL never changes.",
      /* A fixed set of segments: nothing loads and nothing can be empty. */
      states: { loading: "none", empty: "none" },
      render: (state) => (
        <SegmentedControl
          label="View"
          options={viewOptions}
          defaultValue="month"
          error={state === "error" ? "Choose a view to continue." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Flow scale",
      source: "apps/web/src/components/ui/flow-scale.tsx",
      usage: `<FlowScale
  label="Flow"
  value={entry.flow}
  onChange={setFlow}
/>`,
      keyboard: "One tab stop; arrow keys move between the five values and select as they go.",
      states: { loading: "none", empty: "none" },
      render: (state) => (
        <FlowScale
          label="Flow"
          defaultValue="light"
          error={state === "error" ? "Choose one value for this day." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Chip group",
      source: "apps/web/src/components/ui/chip-group.tsx",
      usage: `<ChipGroup
  label="Symptoms"
  options={symptomOptions}
  selected={entry.symptoms}
  onChange={setSymptoms}
/>`,
      keyboard:
        "Tab moves between chips; Space or Enter presses one. More reveals the rest in place.",
      /* The vocabulary is fixed in the schema; a group with nothing to choose does not occur. */
      states: { loading: "none", empty: "none" },
      render: (state) => (
        <ChipGroup
          label="Symptoms"
          options={symptomOptions}
          visible={6}
          defaultSelected={["cramps", "fatigue"]}
          error={state === "error" ? "Choose up to 30." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Mood selector",
      source: "apps/web/src/components/ui/mood-selector.tsx",
      usage: `<MoodSelector
  label="Mood"
  value={entry.mood}
  onChange={setMood}
/>`,
      keyboard: "One tab stop; arrow keys move between the three values and select as they go.",
      states: { loading: "none", empty: "none" },
      render: (state) => (
        <MoodSelector
          label="Mood"
          defaultValue="steady"
          error={state === "error" ? "Choose one value for this day." : undefined}
          {...common(state)}
        />
      ),
    },
    {
      name: "Checkbox field",
      source: "apps/web/src/components/ui/checkbox-field.tsx",
      usage: `<CheckboxField
  label="I am 18 or older"
  help="Tidefern is for adults. No date of birth is stored."
  name="ageAttested"
  required
  error={ageError}
/>`,
      keyboard:
        "Tab reaches the box; Space ticks and unticks it. A click or tap anywhere on the field does the same; a link in the label or the help is followed instead.",
      /* Every state has a meaning: empty is nothing ticked yet, error an agreement left unticked,
         loading the checklist use (an item that saves on its own). The label is the age
         attestation of architecture 8.4, not a milestone: a milestone list carries the 13.10
         framing and the not-a-screening-tool line once for the whole list, never per item. */
      render: (state) => (
        <CheckboxField
          label="I am 18 or older"
          help="Tidefern is for adults. No date of birth is stored."
          required
          defaultChecked={state !== "empty" && state !== "error"}
          loading={state === "loading"}
          error={state === "error" ? "Confirm you are 18 or older to continue." : undefined}
          {...common(state)}
        />
      ),
    },
  ],
};
