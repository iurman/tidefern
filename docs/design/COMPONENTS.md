# Component contract

Task G5, 2026-10-05. The rules every shared component follows, the files
each one owns, and the split that lets five builders work at once without
touching the same file. Architecture 13.6 (layout and motion), 13.7 (the
component list), 13.9 (accessibility) and 14.1 (sound) are the source;
`DESIGN.md` section 4 adds what each component must do; this record says
how the code is laid out so that the rules hold by construction.

## Where things live

| Path                                              | Owner        | What                                                                                              |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/ui/<name>.tsx`           | one group    | One component per file, named export, no default export                                           |
| `apps/web/src/components/ui/<name>.module.css`    | same group   | Its styles, CSS Modules, tokens only                                                              |
| `apps/web/src/components/ui/<name>.test.tsx`      | same group   | Vitest with Testing Library for logic that can fail (validation, selection, keyboard)             |
| `apps/web/src/components/ui/specimens/<group>.tsx` | same group  | The group's specimens: every component in every state, built from the real component             |
| `apps/web/src/app/(public)/design/components/<group>/page.tsx` | same group | The group's chapter page, rendered through `SpecimenFrame`                                      |
| `apps/web/src/components/ui/specimen.ts`          | lead         | `ComponentState`, `Specimen`, `SpecimenGroup` types                                               |
| `apps/web/src/components/ui/specimen-frame.tsx`   | lead         | Renders one specimen in both themes at the chosen width with the keyboard note and usage snippet  |
| `apps/web/src/components/icons.tsx`               | lead         | The icon set: one `Icon` component keyed by name, 24 px grid, 1.6 px stroke, round caps           |
| `apps/web/src/lib/motion-tokens.ts`               | lead         | Durations and easings read from the design tokens; the app and `/design/motion` both import it   |
| `apps/web/src/app/(public)/design/components/page.tsx`     | lead         | The chapter index linking the groups, written at integration                                      |

Nothing under `apps/web/src/components/ui/` imports from `apps/web/src/app/`.
Components import tokens through CSS custom properties only; no hex, no
pixel values that a token names, no Tailwind utility classes (the Tailwind
import exists for the `@theme` bridge and nothing else).

## The eight states

`default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`,
`error`, `empty`. A component that has no meaning for a state says so in
its specimen (`states: { empty: "none" }`) rather than inventing one.
Hover, focus-visible and active are real pseudo-classes in the CSS; the
frame forces them for display by wrapping the rendered component in an
element with `data-specimen-state="hover"` (or `focus-visible`, `active`),
and the module mirrors each pseudo-class rule with its forced twin on one
selector list, using the child combinator so only the component's root
is forced, never every control inside a composite:

```css
.button:hover,
[data-specimen-state="hover"] > .button {
  filter: brightness(1.04);
}
```

`render(state)` therefore returns the component's root as a single
element, and a composite (a card with buttons, the tab bar) decides what
hover or focus means on its root. The attribute name is the frame's own;
a component's own `data-state` (open, checked) is never touched.

Disabled, loading, error and empty are real props; `render(state)` passes
them (`disabled`, `loading`, `error="..."`, an empty collection).

Loading keeps the control's width and shows text ("Saving"), never a
spinner alone. Error pairs an icon or text with the color. Empty follows
the empty-state formula in `CONTENT.md`: what would be here, why it is
not, and the one action that changes that.

## Rules that hold everywhere

- Native elements first: `<button>`, `<a href>`, `<input>`, `<select>`,
  `<dialog>`, `<details>`. A `div` with a click handler is a defect. Sound
  and haptics come from the shared provider's delegation over those
  elements, so no component calls `play()` itself; a component that needs
  a cue the provider does not give (success, error) renders the visible
  text and calls `play("success")` or `play("error")` once, beside it.
- Both themes through the semantic tokens; never a per-theme override in a
  module. Forced colors: borders on every control (`border: 1px solid
  transparent` at least) so Windows high contrast draws them.
- Controls are 44 px tall (`--size-control`), primary actions 48 px
  (`--size-action`); icons 20 px (`--size-icon`) inside controls, 24 px in
  the rail and tab bar.
- Focus: the global `:focus-visible` rule in `globals.css` draws the
  outline for every element; a module never restates or removes it.
- Motion: transitions may change `background`, `color`, `border-color`,
  `transform`, `opacity` and `filter`, never a layout property (width,
  height, margin, padding, top or left); entrances use `transform` and
  `opacity` only; the durations and easings come from `motion-tokens.ts`
  and nowhere else; `transition: all` is forbidden (`pnpm css:check`
  fails on it, on `outline: none` and on a raw color in a module), and
  `@media (prefers-reduced-motion: reduce)` sets every transition and
  animation to `0ms`.
- Copy: sentence case everywhere except page titles. Numerals in Figtree
  with `font-variant-numeric: tabular-nums` where they are compared or
  counted (the `.tabular` global class, or the module's own rule).
- Health data never appears in a component's `id`, `name`, `data-*`
  attribute, `aria-label` template or default copy. Route names stay
  neutral.
- Every icon is paired with visible text or an sr-only name.
- Dates are `YYYY-MM-DD` strings; a component never calls `new Date()`
  without a value and never reads the machine's time zone. `today` is a
  prop.
- No dependency is added without its version resolved from the registry
  and the reason recorded in the group's report. The one pre-decided pin
  is `react-day-picker` 10.0.2 (`RESEARCH.md`, architecture 13.6).

## Specimens and the chapter pages

Each group exports `specimens: SpecimenGroup` from
`apps/web/src/components/ui/specimens/<group>.tsx` and renders it on its
page through `SpecimenFrame`. A specimen names the component, lists its
source path, gives one usage snippet as a string, a keyboard note, and a
`render(state)` function that returns the component in that state. The
frame draws the eight states in a row for the light theme and again for
the dark theme (the token stylesheet already scopes both themes under
`[data-theme="light"]` and `[data-theme="dark"]` on any element, so the
frame sets that attribute on a wrapper), with a width
control at 390, 720 and 1200 px that resizes the frame, not the page.
Nothing in a specimen writes to storage or changes production tokens.

Each page is a server component with one H1, the chapter rail, previous
and next links and `noindex` through `pageMetadata`. Each group adds its
own browser spec, `apps/web/tests/e2e/design-<group>.spec.ts`, that runs
`expectNoAxeViolations` from `apps/web/tests/e2e/axe.ts` on its route in
both themes and asserts one behavior per component that matters
(keyboard, selection, dismissal); nobody edits `home.spec.ts`.

## The groups

| Group       | Branch                     | Port | Components                                                                                                                                                      |
| ----------- | -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions`   | `claude/G5-actions`        | 3121 | Button (primary, secondary, quiet, destructive), text link, back link (added by the lead before the page routes), inline feedback, toast, skeleton, empty state, disclosure, copy code, token swatch, theme and sound toggles (moved from `components/` and re-exported) |
| `forms`     | `claude/G5-forms`          | 3122 | Form field, IANA time zone combobox, segmented date input, measurement input with unit toggle, segmented control, flow scale, chip group, mood selector, checkbox field (added by the lead before the page routes, G10) |
| `structure` | `claude/G5-structure`      | 3123 | Logo and mark, public header and footer (moved from `components/` and re-exported), app shell (tab bar, rail, quick-log button), dialog, bottom sheet, person and grant cards, invitation card, consent record, device row |
| `calendar`  | `claude/G5-calendar`       | 3124 | Calendar month grid and list over `react-day-picker` 10.0.2, date range selection, day cell textures, week strip                                                 |
| `marks`     | `claude/G5-marks`          | 3125 | Cycle ring, pregnancy week card, timeline, measurement chart with percentile band                                                                               |

The day sheet (`DESIGN.md` 3.4) composes the bottom sheet, the flow
scale, the chip group and the mood selector, so it is built after the
wave merges, by the lead, with the chapter index.

The day-logging contract (task G9) that Today and Calendar share:

- `day-sheet.tsx` exports `DayLogForm`, the form body Today's open card,
  the sheet and the page share, and `DaySheet`, which frames it as the
  bottom sheet and dialog or, with `page`, as the page at `/log/[date]`
  (an h1, the days and Close as links). The form keeps its own draft, read
  once from `initial`; `draftKey` (`dayLogKey` in `lib/day-log.ts`: the
  date, the entry version and a reseed count) remounts it after a late
  load, a day change or an undo, never after its own save.
- `lib/day-log.ts` is the pure part: the draft to the entry write with all
  three fields, If-Match as a string for an entry and an integer for a
  note, the period rule, the Undo plan, and the calls with results per
  part. `components/day-log/` is the thin controller (`useDayLog`) and its
  three bindings (`DayLogSheet`, `DayLogInline`, `DayLogPage`); it takes
  the stage and today from the server and never reads the browser clock.
- `lib/prediction-copy.ts` holds the 13.10 sentences, and `CycleRing`
  takes the API's prediction and `latestStart` instead of period starts.
- The sheet draws flow and mood with `FlowScale` and `MoodSelector`, whose
  `null` value shows nothing chosen and stays controlled (task G9b). A
  chosen mood goes back to none through a quiet Clear beside the selector,
  passed as its `action`, because a radio group never unselects by
  pressing; focus then moves to the first mood.
- The form posts to its own URL if it is ever submitted natively and stays
  `inert` until the page hydrates, so a flow or mood code never reaches a
  URL. Its success and error lines play their cue through
  `InlineFeedback`, once per line; `cues={false}` silences them on the
  reference page, where nothing answers a press.
- A share is confirmed against the text on screen. When the saved note
  changes under a field she has not edited (a share conflict read it
  again, a share or a delete moved it), the field follows it and an open
  confirm step closes; her own edit stays for Try again. A share that got
  no answer is retried with the same Idempotency-Key, and a 409 whose read
  shows the note already filed there with the same text counts as shared.
- The flow scale and the mood selector use `SegmentedControl`'s
  `layout="columns"` (task G9b): the round pill from 26rem; narrower, equal
  columns with the control radius and the caption size that shrink
  together (five fit a 360 px phone's sheet); and below the option count
  times 3.625rem, one value per row, as the flow values are on a 320 px
  phone, so a label is never cut and the pill never folds into uneven
  rows. The group is its own size container, so it takes its width from
  its row and never sizes itself to its content; no other module styles
  its markup.

Each group owns only the files in its rows above plus its page, its
specimens file and its browser spec; `docs/design/ASSETS.md` gains icon
rows from the lead only. A group never edits `docs/BUILD_PLAN.md` or
`docs/BUILD_PROGRESS.md`: its pull request description carries the files,
commands and decisions, and the lead writes the log entry from it at the
merge. A group that needs a change in a lead-owned file writes the
request in its report and works around it locally; it never edits the
file.

## What the lead reviews

A fresh-context reviewer reads each pull request against this record,
`DESIGN.md` section 4 and architecture 13.7, and the lead checks the
captures of each group page in both themes at 1440 and 390 px before the
merge. `pnpm check` (which includes `tokens:contrast`) and `pnpm test:e2e`
are green on every push; the Vercel preview smoke is green before every
merge.
