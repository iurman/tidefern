# Design contract

Task G2, written 2026-10-05 by the Phase 1 lead. This is the contract the
screens (group H), the shared components (G5) and the design reference (G6,
G7) build to. It sits under `docs/ARCHITECTURE.md` section 13 (tokens,
brand, color roles, theme behaviour, typography, layout, the five signature
moves, components, the reference, accessibility, content rules) and section
14 (sound and touch); nothing here reopens those decisions. Where this file
is more specific than the record, this file is the spec; where it would
contradict the record, the record wins and the line is a mistake to fix.

Sources: `docs/design/RESEARCH.md` (G1), the architecture record, and four
rendered compositions captured on 2026-10-05 from static prototypes that
used the real `tokens.css`, the self-hosted fonts and the brand vectors
(captures under `docs/design/research/g2-*.jpg`; the prototype files stayed
in the session scratch directory and are not product code).

## 1. Compositions compared

### 1.1 Marketing home

Two compositions were rendered at 1440 light and dark and at 390 light.

| | A: two statements, one action | B: editorial column with the mark beside it |
| --- | --- | --- |
| Shape | A split hero: a warmth panel carrying the tagline as the H1 and a one-line lede, beside a surface panel carrying the privacy promise as a second statement, the lede and the single action. The mark sits in the warmth panel. Then the tide line, the three chapters in a row, the tide line, four promises in two columns | One column: eyebrow, tagline H1, lede, action, with the mark in a surface tile to the right; a numbered chapter list; the promises in a panel reading column (the foundation's current page, refined) |
| Evidence | `research/g2-home-a-desktop-light.jpg`, `g2-home-a-desktop-dark.jpg`, `g2-home-a-phone-light.jpg` | `research/g2-home-b-desktop-light.jpg`, `g2-home-b-phone-light.jpg` |
| What works | Answers the two visitor questions at once ("what is this" and "is it private") with one action; the warmth panel gives the mark a place without a decorative orb; the two statements read as a conversation, which is the brand's "together" | Calm, reads like a document, the chapter list with serif numerals is already a signature; the mark tile with the tide fill is the sheet's own composition |
| What fails | At 390 px the first version put the mark behind the headline; fixed by stacking the mark above the statement inside the panel (second capture). The second statement must stay short or the panels fall out of balance | The hero leaves the privacy promise for the third screen; the mark tile is decoration without a job; the page reads as a template for any product until the chapter list |

Decision: A, with B's numbered chapter list kept below the fold instead of
A's three-column row (the row is a rule-of-three card grid in disguise), so
the home page is: header; the split hero; tide line; the numbered chapter
list; tide line; the four promises as a definition list in two columns;
footer. Reasons: the privacy promise is the product's reason to exist and
belongs above the fold; one action; the warmth surface is used once, for
the one highlighted thing (signature move 5), which here is the tagline.
The chapter row's serif eyebrow numerals move into the list.

### 1.2 `/today` in the cycle stage

| | A: ring-led | B: strip-led |
| --- | --- | --- |
| Shape | App shell (rail from 1024 px, tab bar below). The cycle ring at 260 px on the left, and on the right the date eyebrow, the cycle day as a display numeral beside a serif label, the estimate sentence in Newsreader italic, the ovulation sentence with the contraception line, and a "How this is estimated" disclosure. Tide line. Then the quick log card (flow, symptoms, mood, note) beside the partner card and the week card on warmth. The prediction footer at the end | A seven-day strip across the top with today on warmth and predicted days dashed, then "Day 12 of about 28" with the estimate sentences, a small ring to the right, the tide line, the same cards, and a floating "Log today" button on phones |
| Evidence | `research/g2-today-a-desktop-light.jpg`, `g2-today-a-desktop-dark.jpg`, `g2-today-a-phone-light.jpg` | `research/g2-today-b-desktop-light.jpg`, `g2-today-b-phone-light.jpg` |
| What works | The ring is the one thing on the screen that could only be Tidefern (frond curl, dashed uncertainty); the numeral beside the serif label is signature move 4; the estimate sentence sits exactly where the eye lands after the ring; on phones the ring then the numeral is a natural stack | The strip answers "what is today" quickly and carries the predicted-day texture; the floating button keeps logging one tap away |
| What fails | Nothing structural; the ring prototype needs the progress arc inside the track and a larger curl (section 6.1) | The ring at 150 px cannot carry the curl or the dashed bands; the floating button collides with the card headings; two time scales (strip and ring) compete for the same fact |

Decision: A. The strip is not lost: it becomes the header of the calendar
list view (section 6.3) and the week card on `/today` carries the same
day texture in words. On phones the quick log opens as a bottom sheet from
the tab bar's quick-log button (13.7), so no floating button is needed.

## 2. Page map and navigation

Public routes use the public header (logo, primary navigation, sound and
theme controls, sign in) and the footer with the two policy links.
Authenticated routes use the app shell: a left rail from 1024 px, a bottom
tab bar below it with Today, Calendar, Journey or Family (by stage; both
appear when the profile has both a pregnancy or postpartum stage and a
child), Sharing and Settings, plus the quick-log button on Today. Activity
and the account are reached from Settings. The public header is never
shown on authenticated routes.

| Route | Visitor question | Primary action | Nav |
| --- | --- | --- | --- |
| `/` | What is Tidefern and is it for me? | Create an account (or sign in) | public header |
| `/privacy`, `/health-privacy`, `/terms`, `/accessibility` | What happens to my data; what are the terms | Read; contact the inbox the owner names | footer |
| `/account/delete` | How do I delete my account? | Sign in, then close the account | footer, `/settings` |
| `/welcome` | How do I start? | Finish the five steps | none (a flow) |
| `/today` | Where am I today and what can I log? | Log today | tab bar and rail |
| `/calendar` | What happened and what is expected? | Tap a day to open its sheet | tab bar and rail |
| `/log/[date]` | What do I log for this day? | Save the day | opened from calendar or today |
| `/journey` | What week am I in and what is coming? | Add an appointment or milestone | tab bar and rail (pregnancy and postpartum) |
| `/family` | How are the children today? | Log a feed, sleep or diaper | tab bar and rail (when a child exists) |
| `/family/[childId]` | What has this child done and how are they growing? | Add a measurement or milestone | from `/family` |
| `/sharing` | Who can see what? | Invite a partner; change a category | tab bar and rail |
| `/settings` | How do I change things about me and my account? | Save a setting | tab bar and rail |
| `/activity` | What happened on my account? | Read; revoke from `/settings` | from `/settings` |
| `/design` and chapters | How is Tidefern built? | Read, copy, download | public header, footer |

Every authenticated route carries `Cache-Control: private, no-store`, the
nonce policy and noindex; public drafts carry noindex until the owner
approves them (`docs/design/CONTENT.md` holds the per-route metadata).

## 3. Sketches

Desktop is 1440 px with the 1200 px container; phone is 390 px. `[ ]` is a
control, `~~~` is the tide line, `(w)` marks the one warmth surface on the
screen, `rail` is the left rail, `tabs` the bottom tab bar.

### 3.1 `/` (home)

```text
Desktop                                              Phone
+----------------------------------------------+     +------------------+
| logo  How it works  Privacy  Design  [sign in]|     | logo    [sound][theme]
+----------------------------------------------+     +------------------+
| (w) mark            | Shared only when       |     | (w) mark         |
|     TIDEFERN        | you say so.            |     |     TIDEFERN     |
|     Life flows      | lede                   |     |     Life flows   |
|     together.       | [Create an account]    |     |     together.    |
|     lede            | status line            |     |     lede         |
+---------------------+------------------------+     +------------------+
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~     | Shared only when |
| 01  Cycles      text                         |     | you say so. lede |
| 02  Pregnancy   text                         |     | [Create account] |
| 03  Childhood   text                         |     +------------------+
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~     ~~~~~~~~~~~~~~~~~~~~
| Yours by default   | Nothing watching        |     | 01 Cycles ...    |
| Private notes ...  | Delete means delete     |     | 02 ... 03 ...    |
+----------------------------------------------+     ~~~~~~~~~~~~~~~~~~~~
| footer: closing line, Privacy, Consumer      |     | promises stacked |
| Health Data Privacy Policy, Design, API      |     | footer           |
+----------------------------------------------+     +------------------+
```

### 3.2 `/welcome` (five steps, one column, no shell)

```text
Step indicator: 1 Time zone  2 Stage  3 Dates  4 Consent  5 Passkey
+------------------------------------------------------------+
| Where are you?                      [IANA time zone combobox]|
| Your calendar days follow this zone. [Continue]              |
+------------------------------------------------------------+
Step 2: four option cards (cycle, pregnancy, postpartum, here for someone
else); step 3 asks only the body questions core returns for the stage
(last period start; due date and how it was dated; birth date and a period
since), each a segmented date input with an example line; step 4 is the
collection consent: the categories collected, purposes and uses, the
processors by name, the withdrawal sentence, one unchecked control, a
separate terms acceptance beneath it; step 5 offers a passkey with "Not now".
Phone: the same column; the indicator collapses to "Step 3 of 5".
```

### 3.3 `/today` (cycle stage; the chosen composition)

```text
Desktop                                              Phone
+----------------------------------------------+     +------------------+
| logo                                   [name]|     | logo      [name] |
+------+---------------------------------------+     +------------------+
| rail |     ring        SUNDAY, OCT 5         |     |      ring        |
|Today |   (frond curl)  12 day of your cycle  |     | SUNDAY, OCT 5    |
|Cal.  |                 estimate sentence     |     | 12 day of cycle  |
|Journ.|                 ovulation + line      |     | estimate         |
|Share |                 [How this is estimated]|    | ovulation + line |
|Sett. |~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|     | [How estimated]  |
|      | Log today            | What Alex can  |     ~~~~~~~~~~~~~~~~~~~~
|      | flow chips           | see right now  |     | Log today card   |
|      | symptom chips        | [Change sharing]|    | Alex card        |
|      | mood chips           | (w) This week  |     | (w) This week    |
|      | [Add a private note] |                |     | footer sentence  |
|      | footer sentence                       |     | tabs: Today Cal  |
+------+---------------------------------------+     |  Journey Share Set|
                                                      +------------------+
```

Stage variants on the same frame: pregnancy shows the week card (6.4) in
the ring's place; postpartum shows the child's age and the quiet card
("log a period when it comes", no fertile window); the `none` stage shows
the children or the partner summary and never a body question; the empty
state before the first log shows the ring track with no arcs and the copy
from `CONTENT.md`.

### 3.4 `/calendar` and `/log/[date]`

```text
Desktop (month view)                                 Phone (list view)
+------+---------------------------------------+     +------------------+
| rail | [Month] [List]        < October 2026 >|     | [Month] [List]   |
|      | Mo Tu We Th Fr Sa Su                  |     | week strip (today|
|      |  .  .  1  2  3  4  5  <- period: solid|     |   on warmth)     |
|      |  6  7  8  9 10 11 12  <- fertile:     |     | Sun Oct 5 (w)    |
|      |      ~~~~~~today~~~~~    dashed pill  |     |  light, cramps   |
|      | 13 14 15 16 17 18 19                  |     | Sat Oct 4        |
|      | 20 21 22 23 24 25 26  <- predicted    |     |  nothing logged  |
|      | 27 28 29 30 31        period: dashed  |     | ...              |
|      | legend: logged solid, predicted dashed|     | [Today]          |
|      | [Today]                               |     | tabs             |
+------+---------------------------------------+     +------------------+
```

The day sheet (`/log/[date]`) is a bottom sheet on phones and a dialog on
the overlay tier on desktop: date heading with previous and next day,
period toggle (one tap logs, the same tap unlogs), flow scale, symptom
chips, mood selector, a private note field with the explicit "Share this
note with..." action, Save and Cancel; the keyboard model is the APG date
picker dialog (`RESEARCH.md` decision 2).

### 3.5 `/journey`

```text
+------+---------------------------------------+
| rail | (w) Week 24 and 3 days   second trimester  Apr 3  |
|      |     [trimester bar: ===|===|---]  110 days to go   |
|      |     dating: last period, changed Mar 7 (history)   |
|      | ~~~~~~ this week ~~~~~~                            |
|      | Week 25  Mar 12 to 18   appointment: scan  [edit]  |
|      | Week 26  ...            milestone: ...             |
|      | ...                                                 |
|      | [Add an appointment] [Add a milestone]              |
|      | Something changed? [My pregnancy ended]             |
+------+---------------------------------------+
```

The ending path opens a dialog that asks the reason (private), lets her
choose the word, offers resources once, and returns to a quiet `/today`.
The partner view of the same route is the paused state (8.4). Postpartum
shows the child's age, no week, no prediction.

### 3.6 `/family` and `/family/[childId]`

```text
/family                                         /family/[childId]
+------+-------------------------------------+ +------+------------------------------+
| rail | Nora  4 weeks, 3 days   [Add child] | | rail | Nora  4 weeks, 3 days         |
|      | (w) last feed  2h ago  today: 8     | |      | [Timeline] [Growth] [Milestones]|
|      |     last sleep 53m ago today: 4h30  | |      | Growth: weight for age chart   |
|      |     last diaper 4h ago  today: 5, 2 | |      |   band 2.3 to 97.7, line with  |
|      | [Feed] [Sleep] [Diaper]             | |      |   frond curl; caption: WHO     |
|      | guardians: Mara, Alex               | |      |   0 to 24 months, approximate  |
+------+-------------------------------------+ |      |   under 8 weeks                |
                                                |      | [Add a measurement] unit toggle|
                                                +------+------------------------------+
```

### 3.7 `/sharing`

```text
+------+-----------------------------------------------+
| rail | People                                          |
|      | Alex  partner  since Mar 2                      |
|      |   Cycle status     [on ]  "day of cycle and     |
|      |                            whether it is a      |
|      |                            fertile window"      |
|      |   Cycle history    [off]  "past periods, cycle  |
|      |                            lengths, estimates"  |
|      |   Symptoms         [off]  ...                   |
|      |   Pregnancy overview, Pregnancy photos, Nora    |
|      |   Tell Alex when my period starts  [off]        |
|      |   [Remove Alex]                                 |
|      | Invitations: pending (Jo, sent Oct 3) [Withdraw]|
|      | [Invite a partner]                              |
|      | Private notes are never shared.                 |
+------+-----------------------------------------------+
```

### 3.8 `/settings` and `/activity`

Settings is a stacked list of groups (profile, time zone and units, theme
with follow system, sound level and quiet hours, notification detail with
the lock-screen preview and the sentence that email stays generic, devices,
export, close account), each toggle with one line of help beneath it.
Activity is a cursor-paginated list of audit rows (what, who, when) with
no health content and a "Load more" control.

### 3.9 `/design`

Overview with the chapter cards and exports; each chapter one column with a
disclosure listing its anchors at the top on phones and a rail from 1024
px, previous and next at the foot, every section rendered at its final
state on the server.

## 4. Components and their states

Every component in 13.7 exists in G5 with the eight states (default, hover,
focus-visible, active, disabled, loading, error, empty) in both themes and
appears in `/design/components`. The rows below add what each one must do.

| Component | Notes beyond the eight states |
| --- | --- |
| Logo and mark | Light and dark variants swap by theme; mono variant under `forced-colors`; small variant under 32 px rendered size |
| Header (public) | Primary navigation, native disclosure menu on phones (Escape closes and returns focus), sound and theme toggles, sign in |
| Tab bar and rail | Five destinations by stage; `aria-current="page"`; the quick-log button on Today; safe-area padding |
| Footer | Closing line, Privacy, Consumer Health Data Privacy Policy, Design system, API contract, the storage note |
| Text link and button | primary, secondary, quiet, destructive; 48 px primary, 44 px others; loading keeps width and shows text ("Saving") |
| Inline and toast feedback | Success is short; an error names the next step; never two for one action; `aria-live="polite"`; the cue plays only with visible text |
| Form field | Label above, optional help, control, inline error with `aria-describedby`; required marked in the label; `inputMode` and `autocomplete` set; no placeholder-as-label |
| IANA time zone combobox | Searchable list from `Intl.supportedValuesOf`; current choice shown with its current offset |
| Segmented date input | Three fields in the profile's order with an example line; `inputMode="numeric"`; validated with core's date check |
| Date range selection | First tap starts, second ends, swapped if earlier, hover preview, APG keyboard model, `data-range-start`, `-middle`, `-end`, cells named "selected" |
| Flow scale | Five values as a single-select group; `none` first; selected value on the period data color |
| Chip group (symptoms) | Multi-select; 44 px; a "More" chip opens the full list; pressed state uses the action fill |
| Mood selector | Three values, single select |
| Measurement input with unit toggle | SI stored, display converted at the edge; the toggle is a segmented control |
| Segmented control | Swaps content in place, never navigates |
| Calendar month grid and list | Seven columns, two-letter headers, greyed neighbours, logged solid, predicted dashed pills, today's row underlined by the tide line, `today` as a prop, per-day accessible label |
| Day sheet | Bottom sheet on phones, dialog on desktop; see 3.4 |
| Cycle ring | Section 6.1 |
| Pregnancy week card | Section 6.4 |
| Timeline | Vertical, date-led rows; newest on warmth; dashed connector for expected items |
| Measurement chart with band | Section 6.5 |
| Person and grant cards | Plain description per category before it can be turned on; revoke in one step |
| Invitation card | Pending with sent date, withdraw action; accepted only after sign-in by POST |
| Consent record | Categories, purposes, processors, withdrawal sentence, one unchecked control; shown again read-only in Settings |
| Device row | Browser, last seen, revoke this one, revoke others |
| Disclosure | Native `<details>`; used for "How this is estimated" and the chapter anchors |
| Dialog | Native `<dialog>` on the overlay tier with the 40 percent page scrim; focus returns to the trigger |
| Bottom sheet | Overlay tier, drag handle with a visible close button (no drag-only interaction), `overscroll-behavior: contain` |
| Skeleton and empty state | Skeleton only for values that will arrive; empty state follows the formula with the mark or the tide line |
| Theme and sound toggles | Three levels each where Settings offers them; header controls flip between two |
| Copy-code and token swatches | Reference only; copying reports success or failure in text |

## 5. Interaction models

### 5.1 Logging a day

1. From `/today` the quick log card is already open for today; from
   `/calendar` tapping a day opens the day sheet for that date.
2. The period toggle is one control: tap logs a period day, the same tap
   unlogs it. A range comes from tapping a start day and an end day in the
   calendar, with the Nord-style rules written in Tidefern's words.
3. Flow is a five-value scale with `none` first; symptoms are chips
   (multi-select, "More" opens the full vocabulary); mood is three values.
4. The note is its own field. Saving writes it as a private row; "Share
   this note with..." is an explicit action that re-files it under
   `cycle.symptoms` or `pregnancy.overview` and says what that means.
5. Save shows "Saved for Sunday, Oct 5" inline with an Undo for ten
   seconds; a failure keeps the sheet open with the error under the field
   that failed and "Try again".
6. Pending state: the Save control reads "Saving" and stays the same width;
   nothing else changes until the response.

### 5.2 Sharing a category

Turning a category on shows its plain description, the person it is for
and a confirm step; turning it off is one tap and takes effect on the next
request; both write an audit event. The partner notification switch is a
separate per-person control with the sentence that the message stays
generic.

### 5.3 Ending a pregnancy, from `/journey`

"My pregnancy ended" opens a dialog: the date, a reason (birth, loss,
other) that is never shown to anyone else, the word she wants used, the
sentence that her partner's view pauses with no notification, one
resources link, and a single confirm. `/today` then shows the quiet card.

## 6. Geometry and drawing rules

### 6.1 The cycle ring

- 260 px on desktop, 220 px on phones; track stroke 14 px in `soft-border`;
  day 1 at the top, clockwise; the ring represents the estimated cycle
  length (default 28) so day positions stay stable within a cycle.
- Logged period days: solid arc in `data-period`. Predicted period (the
  next period, from `nextPeriodStart` minus `uncertaintyDays` to the ring's
  end): dashed arc in `data-period` with no fill. Fertile window
  (`fertileWindow.start` to `end`): dashed arc in `data-fertile`. Ovulation:
  a small outlined dot in the text role at `ovulation`, with the band drawn
  as a lighter dashed arc of plus or minus `ovulationBandDays`.
- Progress: a 3 px arc in `accent` on a radius 12 px inside the track from
  day 1 to today, ending in the frond curl (a spiral of about 16 px that
  turns inward, taken from the mark). Today: a 7 px `action` dot with a 3
  px page-colored halo on the track.
- The uncertainty is drawn as the dashed arcs; a wider `uncertaintyDays`
  makes the dashed period arc longer, never a different color. First guess:
  the dashed arcs only, with the first-guess copy. Not enough regular
  cycles: track and logged arcs only, no dashed arcs, with that copy.
- Accessible name: "Cycle day 12 of about 28"; the sentences beside the
  ring carry every fact; the ring is `role="img"`.
- Reduced motion: no arc animation; otherwise the progress arc settles in
  600 ms once per page entrance, transform and opacity only.

### 6.2 Calendar day cell

44 px minimum; the number in Figtree with tabular figures; logged period
days a solid `data-period` pill behind consecutive days; the fertile
window a dashed `data-fertile` pill; predicted period a dashed
`data-period` pill; ovulation a small outlined dot under the number; today
underlined by a 1 px tide line across the row; a logged day shows a 4 px
text-colored dot. Each predicted day carries its own accessible label.

### 6.3 Calendar list view

A week strip (seven cells with the same textures, today on warmth) above a
list of days, newest first, each row the date, what was logged in words
and a chevron to the sheet. The empty state follows `CONTENT.md`.

### 6.4 Pregnancy week card

On warmth: "Week 24 and 3 days" as Figtree numerals beside a Newsreader
label, the week's date range, a three-segment trimester bar drawn with the
tide line (the current segment solid, the rest dashed), the due date, the
dating method with a link to the history she can see, and "days to go".
No renders, no fruit, no daily tips. The partner card is the paused state
once the pregnancy has ended.

### 6.5 Measurement chart with percentile band

A line chart with age on the x axis and the SI measure converted for
display on the y axis; the 2.3rd to 97.7th band as `data-band` at 40
percent fill with a 1 px solid edge in the same color, the median as a 1
px dashed line in the same color, the child's measurements as text-colored
dots joined by a 2 px line that ends in the frond curl at the newest point.
Caption: the source and age range ("WHO Child Growth Standards, 0 to 24
months; CDC after"), and "approximate in the first eight weeks" while F5
is open. A measurement beyond plus or minus 2 SD adds the pointing-to-care
sentence beneath the chart, never on a partner's view. Period pills above
the chart (Since birth, Last 3 months, Last year) swap the range in place.

## 7. Motion and sound vocabulary

Durations and easings come from `tokens.json` through the `motion-tokens`
module; cues from `SoundProvider`. Reduced motion lands instantly.

| Interaction | Motion | Sound and haptic |
| --- | --- | --- |
| Hover on any control | background 180 ms interface curve | hover tick (mouse only, `all` level) |
| Press, toggle, chip | scale 0.94 for 180 ms | press drop; toggle plays the rising variant; tap haptic on touch |
| Save a day, grant a category, add a measurement | inline confirmation fades in 180 ms | success (two rising notes) with the visible text; success haptic |
| Validation failure, request failure | error text appears 180 ms, no shake | error cue with the visible text; error haptic |
| Disclosure, sheet, dialog | 280 ms disclosure curve, transform and opacity; the scrim fades | press cue on open; nothing on close unless the person closes with a control |
| Page entrance after a navigation the person started | one cascade, 600 ms settle, above the fold only | one settle cue within 600 ms; never on back, forward, reload or load |
| Calendar month change | the grid cross-fades 180 ms, no slide | press cue on the arrow |
| Ring on `/today` | progress arc settles once, 600 ms | none (not a response to an action) |
| Marketing tide | 9 s, once, then rests | none |
| Toast arrival, timer, background data | none | none |

## 8. Theming, forced colors, print

Both themes are designed independently from the token file; nothing is
inverted; the mark swaps variants; the warmth surface never hosts a form
control; data marks keep dashed and outlined distinctions under
`forced-colors: active` and the mark uses its one-color variant. Print
styles hide the shell and keep the ring, the calendar and the chart
readable in black.

## 9. Open items

- The owner's approval of the reconstructed mark and the dark-surface
  variant (architecture 21) decides whether the brand chapter is final.
- The WHO permission question (F5) decides when the growth chart caption
  drops "approximate in the first eight weeks".
- The exact wording of the due-date change notice and the transfer
  pregnancy dating awaits the clinician reviewer (architecture 21).
