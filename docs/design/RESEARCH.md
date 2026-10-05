# Design research record

Task G1, written 2026-10-05 by the Phase 1 lead from six first-hand
inspections run the same day, each checked by a second agent against the
captured evidence before a row was kept. This record changes decisions in
`docs/design/DESIGN.md` (G2), the component work (G5) and the screens (H);
it does not reopen anything `docs/ARCHITECTURE.md` already decided
(typography in 13.5, the signature moves in 13.6, the chapter structure in
13.8). Where a source disagrees with the record, the record wins and the
row says so.

## Method and evidence

Every page was opened in headless Chromium (Playwright 1.63.0, the browser
the test suite uses) with a desktop user agent at 1440 by 900 in the light
scheme, at 1440 by 900 with the OS dark scheme emulated, and at 390 by 844,
as a full-page capture plus a dump of the visible text, fonts and links. A
control counts as exercised only when a capture exists from before and
after the interaction. Pages that answered with a login wall, a paywall, a
bot check or a 404 are listed under "Inaccessible or partial" with the
status seen.

Evidence lives in two places. Captures of documentation and gallery pages
that a retained row depends on are committed, reduced to 900 px JPEGs, under
`docs/design/research/`. Everything else (about one thousand captures,
including every product's App Store and help-centre pages) stays in the
session's scratch directory (`scratchpad/research/evidence/` under the
session folder, path recorded in the progress log) and is cited by file
name with the URL and date, because marketing screenshots belong to the
companies that published them and have no place in a public repository.
Nothing was copied: no markup, CSS, icon, illustration, copy or identity
from any source appears in Tidefern.

Product and gallery names in this file are references, not endorsements,
and the galleries' own terms were read before anything was retained (see
"Licence limits").

## Galleries and the design reference

Fifteen observations survived the skeptic pass (the build prompt asks for
six to ten; the extra rows are two Phloom counter-signals and the three
component.gallery indexes the prompt names as the comparison set). Columns: entry, behaviour
and viewport inspected, evidence path, principle, Tidefern adaptation,
limits.

| Entry | Behaviour and viewport inspected | Evidence | Principle | Tidefern adaptation | Limits |
| --- | --- | --- | --- | --- | --- |
| Phloom `/design/color`, "Semantic roles come in pairs" | 1440 light and dark, 390. Each role is a plate with its fill and a measured foreground token printed under it, then a matrix (page, 10 and 15 percent tint, "fill" and "ink" columns) that shows the fill word failing on paper and the ink word passing; printed ratios 2.83:1 and 2.47:1 for warn as text, and for brand 3.94:1 (fill), 5.63:1 (plate), 5.80:1 (hovered). Dark capture shows different resolved values for the same rows, so the readout is live | `research/phloom-color-section-semantic-light-1440.jpg`, `research/phloom-color-section-semantic-dark-1440.jpg`; full page `research/phloom-color-desktop-light.jpg` | A status colour is never one value: fill, foreground on the fill, and an ink weight for text on the page and on tints, each measured | Architecture 13.3 already stores one value per role with a measured surface list. G5 adds the ink member where a role is ever used as a fill (success, warning, danger, data marks) and `/design/color` prints the measured ratio beside every plate, read from the running document, with the copy-as-CSS and JSON download Phloom lacks | Phloom publishes no licence for its prose; principles are paraphrased, the rosette, the pink and plum palette and its pairing of Figtree with Instrument Serif are its identity and stay out (Tidefern keeps Figtree as its sans beside Newsreader, 13.5) |
| Phloom `/design/motion`, "Replay the cascade" | 1440 light and dark. Clicking Replay: 120 ms later only the first of six named beats is painted and the others are faded or absent; at 1.5 s all six are back. Delays (0.05 s to 0.42 s) are listed in a table and the caption says they are read from the beats module | `research/phloom-motion-replay-cascade-before-light-1440.jpg`, `research/phloom-motion-replay-cascade-mid-light-1440.jpg` | One orchestrated entrance per page with named beats, replayable from the same constants the product imports, so the demo cannot drift | G5 exports the two easings and the beat delays from one `motion-tokens` module (13.6 already requires it); `/design/motion` (G6) gets a Replay control per demo that re-reads the constants, and the chapter prints the cubic-bezier values from the module | None beyond identity |
| Phloom `/design/motion`, reduced-motion readout | 1440 light with `prefers-reduced-motion: reduce` emulated. The line reads "prefers-reduced-motion is reduce. Every demo on this page has arrived instantly and complete." with an amber dot; without emulation it reads "no-preference. Demos animate." with a green dot | `research/phloom-motion-section-reduced-motion-light-1440-reduce.jpg` | Show the visitor's own preference live and state what it changes | `/design/motion` shows the visitor's reduced-motion state from the same hook the app uses (13.6 asks for it) and the foundations chapter repeats the rule that reduced motion degrades to instant, never to hidden | None |
| Phloom section reveal (every chapter) | 1440 by 900 full-page captures show only the sections inside the first viewport; a probe found later sections at opacity 0 with a 10 px offset until scrolled into view, and the same under emulated reduced motion; a 1440 by 4000 viewport painted four sections and left the fifth blank; a scroll pass painted everything | `research/phloom-color-desktop-light.jpg` (blank below the first section) | Counter-signal: intersection-gated reveals hide content from print, find-in-page, tall windows and reduced-motion visitors, and contradict the page's own "never to absent" rule | 13.6 stands: every section renders at its final state on the server and only content above the fold takes part in the entrance; the browser suite's full-page captures (`capture.mjs`) must never show a blank section, which J3 checks | None |
| Phloom `/design/components`, page patterns | 1440 light. The empty state is a dashed boundary, a small icon tile, a serif title "No devices yet", a two-line reason and one primary action, captioned "Say what would be here, why it is not, and the one action that changes that. Never just 'No results'." Item rows carry a numbered badge and one trailing action; the filter bar shows "3 of 41" beside the input | `research/phloom-components-section-page-patterns-light-1440.jpg` | The empty-state formula: name the absence in the person's words, one sentence of why, one action | `docs/design/CONTENT.md` (G2) carries one empty-state row per surface written to this formula; the visual is the mark or the tide line, never an illustration (13.10). Item rows and the count-beside-filter pattern go to the components chapter | Prose paraphrased, not copied |
| Phloom chapter navigation on phones | 390 light on every chapter and a tap on the last "Chapters" link, which moved from Color to Type. A chapter is one long column with a back link at the top and Back and Next at the foot; no rail, no table of contents, no sticky header, so a 10,000 px chapter is reachable only by scrolling | `research/phloom-color-mobilenav-after-light-390.jpg` (the page after the tap, Type chapter at 390 px); scratch `phloom-brand-phone-light.png` for the foot links | Counter-signal: anchors that nothing lists are not navigation | 13.8's chapter rail becomes a native disclosure at the top of each chapter on phones (the public header already uses that pattern) with previous and next at the foot; every section anchor is listed in it | None |
| component.gallery, Datepicker (44 examples) | 1440 light at three scroll positions, 390. Every system uses a seven-column grid, two-letter day headers, greyed out-of-month days and one filled disc for the selection; the variations are a "Today" return, presets and a vertically scrolling calendar (Backpack) for phones. Nothing in the index draws uncertainty or a predicted range | `research/components-cg-datepicker-clip-1440-light.jpg` | The grid convention is fixed; spend the difference around it | `/calendar` keeps the convention (seven columns, two-letter headers, greyed neighbours) so nobody learns a grid; what is Tidefern's is the tide line under today's row, dashed cells for predicted days, a continuous pill for a window, and a quiet "Today" return in the month footer | Survey index; each thumbnail belongs to its design system |
| component.gallery, Empty state (16 examples) | 1440 light at three scroll positions, 390. The thumbnails fall into two families: illustration-led (Coral, Orbit, PatternFly) and one-outlined-icon (Geist, Blueprint, Base Web, Primer). Copy read in the thumbnails: Blueprint "No search results / Your search didn't match any files. Try searching for something else, or create a new file. / New file"; Elastic "Start adding cases / Add a new case or change your filter settings. / Add a case"; Orbit "No notifications / ... Invite them to get the conversation started. / Invite people"; Ant "No data" | `research/components-cg-empty-state-clip-1440-light.jpg` | The strong examples name the next thing; the weak ones state a fact; the formula is heading in the person's words, one sentence of why, one action | Confirms the Phloom formula from a second index and settles the visual: Tidefern's empty states use the mark or the tide line, never an illustration (13.10), and the copy table in `docs/design/CONTENT.md` names the next action for `/calendar`, `/family`, `/sharing` and `/activity` | Survey index; the gallery rewards illustration-led states, which the record rules out |
| component.gallery, Progress indicator (38 examples; also stepper and timeline) | 1440 light at three scroll positions, 390. "Also known as: Progress tracker, Stepper, Steps, Timeline, Meter". Vertical examples (Ant Steps: a check, a filled numbered disc with "In Progress", a grey "Waiting" disc; Base Web with the current step's form nested under it; GOLD with a left accent bar on the current row) and horizontal ones (Atlassian, Carbon, Chakra); the index glyph joins the last step with a dashed segment | `research/components-cg-progress-indicator-clip-1440-light.jpg` | A vertical list where each row has a status, a title and an optional description; only the current row carries the accent; dashed connectors read as "not yet" | The milestone timeline on `/family/[childId]` and the journey timeline on `/journey` are vertical, date-led rows; the newest sits on the warmth surface (signature move 5), the tide line marks the current week, and expected items use a dashed connector that matches the dashed predicted days; `/welcome` uses a four or five step indicator | Survey index; each system's own licence applies |
| WAI-ARIA APG Date Picker Dialog | 1440 light. Opened the dialog, then pressed every documented key and read the focused cell after each: arrows move by day and week, Home and End to the week bounds (Sunday 4, Saturday 10), PageDown and PageUp by month, Shift with Page by year, Tab reaches Cancel and OK, Enter wrote the date into the input and returned focus to the trigger, whose name became "Change Date, Saturday October 10, 2026" | `research/components-apg-kbd-open.jpg`, `research/components-apg-kbd-after-enter.jpg` | The complete keyboard contract, with focus return and the value in the trigger's name | This is the normative model 13.6 names: G5 writes it in Tidefern's words under the calendar entry and tests it, including Home and End to week bounds (React Aria goes to month bounds; Tidefern follows APG); the day sheet's date control carries the chosen date in its accessible name | W3C document licence; the blue styling and markup are not copied |
| shadcn/ui Calendar, range mode | 1440 light and dark, 390. First click on Jan 4 filled the cell; hovering Jan 11 drew a tinted band from 4 to 11 with a filled 11 (live preview); the second click committed start, middle and end as `data-range-start`, `data-range-middle`, `data-range-end` with ", selected" in each cell's name. At 390 the two months stack. On the Base UI flavour the arrow keys did not move focus in headless Chromium; on the Radix flavour they did (PageDown turned the month and focused Nov 15) | `research/components-shadcn-range-range-hover.jpg`, `research/components-shadcn-range-range-after.jpg` | Three range states exposed as data attributes, a hover preview before commit, months stacked on phones | The period range on the day sheet and `/calendar` uses the same three states on Tidefern tokens (caps on the action fill, middle on a tint, preview on the same tint at lower opacity) and the unit test 13.6 requires covers first tap, second tap, swap when earlier, hover preview and the keyboard walk, because the docs build's keyboard behaviour depended on the flavour | MIT (shadcn/ui, react-day-picker 10.0.2); Geist type and the black palette are not copied |
| Vercel Geist Calendar | 1440 light and dark. The trigger "Select Date Range" opened a popover; after two clicks the trigger read "Oct 6 - 13" with a clear control and an assertive live region announced the range; presets ("Last 7 Days", "Month to Date") are real buttons; the page's own guidance says the label is the value and never falls back to "Pick a date" once set | `research/components-geist-range-open.jpg`, `research/components-geist-range-range-after.jpg` (the trigger reading the chosen range) | The control's label is its value; common ranges are one click away | The `/calendar` list filter and the growth chart's period control read the chosen range ("Mar 2 to Jun 1") and offer presets in plain words ("Last 3 months", "Since birth", "This pregnancy"); the time fields are a counter-signal, Tidefern's calendar facts are dates plus a profile time zone, never timestamps | Documentation only; `@vercel/geist` is not a package and nothing was copied |
| Nord calendar documentation | 1440 light and dark, 390, text read for behaviour only. Values, min and max are `YYYY-MM-DD` strings; range mode is first click start, second click end, swapped when earlier, hover preview; a `today` attribute overrides the clock "when the client clock can't be trusted"; highlighted days can carry their own accessible label | `research/components-nord-calendar-desktop-light.jpg` | Calendar facts as date strings, a deterministic today for tests, and an accessible label per highlighted day | The month grid takes `YYYY-MM-DD` strings plus the profile zone (7.3), accepts a `today` prop so unit tests and the `/design/components` demo are stable, and gives every predicted day its own label ("predicted period day", "fertile window estimate") beside the dashed outline so the distinction survives without colour | Nord is proprietary (its npm licence limits use to Nordhealth staff): documentation only, no package, no CSS, no markup, no code, as 13.6 says |
| Dawn (joindawn.com), opened from details.so Health | 1440 light and dark, 390. The hero is a split pair of rounded panels: a warm gradient panel with "Your mind is always on." set bottom-right in a serif, and a photo panel with "Your support should be, too.", a two-line lede and one pill action; a dotted arc crosses the seam. Fonts sampled: Figtree body, Source Serif 4 headlines. At 390 the panels stack and the arc shortens | `research/galleries-live-dawn-desktop-light-hero.jpg` | Two statements that answer each other and one action, no centred twin buttons | A composition candidate for the home page in G2: a two-part hero where the second statement carries the single action; the gradient, the glow sections, the stock photo and the cookie dialog are rejected (13.6, 13.10, and Tidefern has nothing to consent to) | Identity not copied; the Figtree plus serif pairing is noted only as a sign the pairing reads as warm health to a curator |
| Tengile MalaMala `/about` history timeline, opened from details.so Timeline | 1440 light, 390. Each era is a large thin olive serif numeral ("1900") set between two photographs, the year repeated as a small grey label beside the caption column; at 390 the numeral sits above the photo and the caption below | `research/galleries-live-tengile-about-crop-timeline.jpg` | A large numeral paired with a small label carries a timeline without a connector line | The journey and milestone timelines pair a Figtree numeral (week, age) with a Newsreader label, signature move 4, and the tide line marks the current week; the 220-weight serif, the 22,000 px page and Inter body are rejected | Hospitality site; nothing copied |

## Trend galleries as counter-signals

The three trend galleries were inspected at 1440 light and dark and 390
(scratch captures `galleries-landinglove-*`, `galleries-rebrand-*`,
`galleries-details-*`, `galleries-inspora-*`, not committed; the rebrand
and details index pages are committed as
`research/galleries-rebrand-home-desktop-light.jpg` and
`research/galleries-details-health-tall-desktop-light-tall-top.jpg`).

- landing.love lists 634 Dark Mode entries against 88 Light Mode, with
  GSAP (191), WebGL (134) and Three.js (74) collections; every entry is a
  recording at one width, so nothing inside the gallery proves
  responsiveness. Its Health category has 27 entries and Wellness 5. Three
  live sites opened from it (Clearwater, sofi, Leandra Isler) all use
  grotesques, preloaders and pinned scroll; two were blank in a full-page
  capture. Kept from them: a serif as annotation beside a sans headline, one
  text-link or pill action instead of a pair, warmth from a tan page and
  spacing. Its footer theme toggle is a plain inversion, not a model.
- rebrand.gallery is a light, serif-led reference in its own chrome (a
  display serif wordmark across the width, serif section headings, white
  page, one filled and one outlined button, a two-choice consent panel
  whose "Essential only" removed itself and changed nothing else). Its
  Serif, Warm, Human and Healthcare filters show 20 entries each before a
  free-account wall; Healthcare is mostly loud (magenta, lime, purple,
  yellow), and the calm ones (MOAI, Phytoca, Vie, Juniper) are identities,
  not products.
- details.so indexes one recorded detail per site; its chips reward
  Features, Editorial, Minimal, Experimental, Cursor Interaction and Card
  Hover; Health has about 40 entries and Timeline about 19, eight of each
  visible before a blurred "You've seen less than 1%" wall. The index itself
  (a serif display face over a sans) sits in the corner Tidefern wants. Dawn
  and Tengile above came from it.
- inspora.design is a masonry feed of screenshots, mostly dark AI and crypto
  product shots at the time of capture; the light serif minority (a serif
  italic wordmark, a serif name under a badge, a pricing heading) is
  decoration, not product behaviour. Nothing retained.
- amicro.vercel.app (MIT) is a Motion-powered component catalogue of card
  spreads and dither charts. Two ideas transfer, both implemented on
  Tidefern's own tokens with transform and opacity only: period pills
  (week, month, cycle, year) above a quiet chart, and a pointer scrubber on
  the growth line. Its components are not adopted.
- 21st.dev's calendar listing (surveyed at 1440 and 390) shows month grids,
  event calendars and habit heatmaps; its terms vest content in its authors
  and 21st Labs for use through its platform, so it is a layout survey only.

## Product references

Eight products, through their official public material only: App Store and
Google Play listings (with the marketing screenshots read at full size),
help centres, support guides and press pages. All captures are in the
scratch directory under `products-a-*` and `products-b-*` with the URL and
date in each `.meta.json`; one Apple Support capture is committed as
`research/products-b-apple-120356-desktop-light.jpg` because its
colour-and-shape legend changes a Tidefern rule. Observations are grouped
by the surfaces the build prompt names.

### Today screens and cycle rings

- Flo's today screen is a seven-day strip (today a filled circle, predicted
  period days dotted outlines), a large "Period in: 2 days" and a "Log
  period" pill. The headline carries no uncertainty; only the dotted
  outline does (App Store screenshot 1, Play screenshot 2).
- Clue's ring carries a red period arc fading to dotted outlines for
  predicted days, a teal fertile arc with a white ovulation dot, a "Day 13"
  badge riding the ring at today, and the centre says "2 weeks until your
  next period" and "Potential fertile day" (App Store screenshot 1). The
  prediction is a range in words, not a date.
- Natural Cycles' Today ring prints the date and cycle day above a two-word
  status ("Not fertile" green, "Use protection" red), the morning
  temperature in a chip, and a card beneath that narrates what the model
  expects next ("Ovulation predicted ... Cycle Day 17. Keep an eye out for
  a rise in temperature!"); brown means "More data needed" (help-centre
  screenshots in `products-b-nc-help-red-green` and
  `products-b-nc-help-birth-control`).
- Glow's today screen is a day strip "CD15, 16, 17, 18 (OVU), 19" with a
  green fertile run and "Most fertile days in 3 days", under badges
  ("Listed with the FDA", "2X+ Higher Accuracy") (App Store screenshot 1).
- Ovia opens on a stage picker ("I am... tracking my cycle, trying to
  conceive, tracking my pregnancy, postpartum, managing peri/menopause")
  with a "Show fertility content" toggle (App Store screenshot 1).

What Tidefern adopts: the cycle day as a numeral riding the ring with a
label (Clue), a second element under the ring that says what comes next in
words (Natural Cycles' narration becomes the Newsreader italic estimate
sentence of 13.10), and "more data needed" as the first-guess copy. What
it does differently: the ring never shows a binary fertile or not-fertile
verdict, never uses red and green as two states, never prints a date
without the estimate sentence, and never carries a regulatory badge; the
headline is the range, not a countdown.

### Day logging

- Flo logs symptoms as large round illustrated icons with ticks, grouped in
  a sheet (App Store screenshot 3). Clue asks at onboarding "What do you
  want to track?" with one-row chips carrying a coloured icon (App Store
  screenshot 3). Ovia's day view has a left rail of category icons, a
  symptoms search, chip groups by body region with "nothing" as the first
  chip in each group, and a flow row "Light, Medium, Heavy" (App Store
  screenshots 2 and 7).
- Apple logs on the same strip you read: swipe to a day, tap it to log a
  period, tap the solid circle again to unmark it; flow level and other
  categories sit below the strip (iPhone User Guide, logging page).

Tidefern adopts the one-tap period toggle that undoes with the same tap
(Apple), chips grouped with a "nothing" option (Ovia) and a flow row below
the strip. It keeps the day sheet's note as its own private row (8.2), which
none of the four do, and draws symptom icons itself on the 24 px grid
(13.7) rather than illustrated tiles.

### Prediction uncertainty

- Apple's calendar legend encodes logged versus predicted by fill and
  outline, not hue alone: a solid red circle is a logged period day, red
  stripes a predicted one, a light green oval with a solid outline a logged
  pregnancy day and with a dotted outline "may still be pregnant", a light
  blue oval the six-day fertile window ("What the colors mean",
  support.apple.com/en-us/120356; committed capture). Its disclaimers are
  two short sentences at the end of the page: "Cycle Tracking should not
  be used as a form of birth control." and "Data from Cycle Tracking should
  not be used to diagnose a health condition." The method is written out in
  plain words (period predictions from logged lengths; the fertile window
  by subtracting 13 days from the next start; a positive ovulation test
  moves day five of the window).
- Flo hides fertile predictions when hormonal contraception is logged,
  when the predicted cycle is under 21 or over 60 days ("so we don't
  mislead you"), and while a delay is shown; a late period greys the
  prediction rather than moving it a day (help centre). Glow greys a late
  prediction and waits for the period to be logged (help centre). Clue's
  calendar draws logged days saturated and predicted days outlined, with a
  "Switch for different predictions" chip row for symptoms (Play
  screenshot 3).
- Natural Cycles widens the cautious state with uncertainty: the first cycles
  carry a larger red buffer, missing readings produce more
  red days, an excluded temperature is drawn struck through with "Excluded
  by the algorithm" under it, and brown days are explained as "the
  algorithm needs a few more days" (help centre).

Tidefern adopts: logged is solid, predicted is dashed or striped, estimate
is dotted, the same three textures on the ring, the month grid and the
journey timeline (a rule for `/design/components`); the two-sentence
disclaimer as the short form of the 13.10 footer, placed under the estimate
sentence on `/today`; a "How this is estimated" disclosure written from
`packages/core` so it cannot drift; a wider dashed arc when there are fewer
or more variable cycles, and a visible reason on any logged cycle the
estimate ignored (the 21 to 45 day floor in `cycle.ts`). It differs from
Flo and Glow by never greying a late prediction silently: the "too
different from each other to estimate" template says why, and the deviation
nudge (13.10) first opens the calendar list so the data can be checked, as
Apple's "Review Cycle History" does.

### Pregnancy weeks and the end of a pregnancy

- Flo and Clue show a fetus illustration, "7 weeks, 5 days" or "31 weeks +
  0 days" with the due date and a fruit-size comparison; Glow adds "Today
  You May Experience: Heartburn, 64.7% Likelihood" from pooled data; Sprout's
  week card reads "Week 7", "Your baby is 7w 4d", the week's date range, a
  three-segment trimester bar with "227 days to go", and the due date (App
  Store screenshot 4). Natural Cycles' Follow Pregnancy pairs a baby row
  (weight, length) with a "Your Body" row (help-centre screenshot).
- Apple's pregnancy setup accepts the last period, a due date, gestational
  age as weeks and days "as of" a date, or an embryo transfer date with a 3
  or 5 day embryo; the summary prints trimester, due date and gestational
  age; a logged "Bleeding During Pregnancy" prompts contacting the care
  team (iPhone User Guide, pregnancy page; support.apple.com/en-us/120075).
  Ending a pregnancy asks which factor the cycle should assume next.
- Clue's loss flow: More menu, "I'm no longer pregnant", an optional
  reason, support resources, "change your mode once you feel ready", then
  hide the pregnancy cycle from averages (help centre). Glow's Nurture has a
  "Healing from a Loss" status (help centre). Flo's loss flow is not
  documented in anything fetched; Ovia's public material has none, and a
  public review asks for one.

Tidefern adopts Sprout's week card shape (week and day, date range,
trimester segments, due date) drawn with the tide line and signature move
4, without renders, fruit or daily tips; Apple's four dating inputs for
`/welcome` (the transfer date arrives when F2's dating method is wired to
`dueDateFromTransfer`, already in core); the care sentence of 8.4 attached
to a bleeding entry on the day sheet in pregnancy mode; and Clue's
user-timed exit, which 8.4 already specifies (reason private, partner view
paused, no automatic predictions). It never shows pooled-data likelihoods.

### Child timelines, feeds, sleep and growth

- Huckleberry's home is one card per category (sleep, nursing, bottle,
  diaper, pumping) showing the time since the last event and its amount
  under a "next nap near 7:30 PM" banner; its week view puts one column per
  day with blocks at the time of day (App Store screenshots 2 and 3).
  Sprout's baby screen stacks cards that each carry the last event, the
  time since, and today's running total ("8 feeds, 4 breast, 4 bottles
  16.74 oz") (App Store screenshot 1). Ovia Parenting shows "Nora, 4 weeks,
  3 days" with four tiles of elapsed time and a feeding form with breast
  left and right durations (App Store screenshots 1 to 4).
- Huckleberry's help centre says percentiles use WHO data for 0 to 24
  months, that WHO charts are not adjusted for prematurity so a preterm
  child gets no percentiles, and that its day and week views use the
  child's day-start time while list and summary views use the calendar
  day, which is why totals disagree.

No product's growth chart rendering was reachable through public
material: the listings show feeds, sleep and milestones, Huckleberry's
help centre describes its WHO percentiles in words, and Sprout's listing
text names WHO and CDC charts without a screenshot in the frames that
render. The chart design therefore rests on the architecture's own rules
(13.3 data marks, 13.6 the frond curl, F1's bands) and on Natural Cycles'
shaded-band-behind-a-line construction noted above.

Tidefern adopts the card order last event, time since, today's total
(Sprout) with the newest event on the warmth surface, "time since" as
Figtree numerals beside a Newsreader label, running timers as shared rows
any guardian can stop, one day-start definition stated in `/settings`, the
chart caption naming the reference population and its age range, and
corrected age or an honest empty state for a preterm child (F1 already
marks percentiles under 56 days as approximate; F4 takes a corrected age).
The day-column week view is recorded as a Phase 2 pattern; Phase 1's
timeline is a list. Pooled "What's typical" comparisons and next-nap
notifications with detail are not adopted (9.1, 10.3).

### Partner and caregiver sharing

- Flo for Partners is one view-only bundle: cycle phase and daily
  insights, with symptoms, notes and calendar detail hidden; the partner is
  told on a mode switch; "Stop sharing" revokes; the partner tiles show
  "Her day today" (help centre and App Store screenshot 4).
- Glow shares bidirectionally with no customisation; items hidden by
  design carry a "Hidden from partner" icon (help centre).
- Natural Cycles' Partner View is opt-in from Settings: an email
  invitation that expires after one use, a "Sharing starting date", a
  default set listed in nouns (days, ovulation status, predictions,
  temperatures and the reason for exclusions, period and spotting), optional
  trackers toggled one by one, more than one partner, revocation by the
  same toggle (help centre; the marketing tab after clicking "Partner view"
  shows "Today, your partner has logged:" with intimate chips as the
  headline).
- Ovia separates Caregivers (full child data) from Family and Friends (no
  health data) (listing text; its help centre does not resolve).
  Huckleberry shares by logging in with the same account on the partner's
  phone (help centre).

Tidefern's model (8.1, 8.2) is already finer than all of these: explicit
per-category, per-level grants with default deny, instant revocation,
`child_id` per grant, an audit trail, and `journal.private` never
shareable. From the research it adds a sharing start date on a grant
(E7), keeps single-use invitation tokens (already in E7), shows a partner
the categories logged today ("logged mood today") rather than the values
unless the grant names that category, and writes the plain description of
each category in nouns on `/sharing` (H6). Shared logins are the pattern
Tidefern rejects.

### Privacy and regulatory posture

- Natural Cycles states "The only FDA-cleared birth control app", "98%
  when used as intended, 93% with typical use", a comparison bar chart, and
  "No method of contraception is 100% effective" (site and help centre).
  Clue's App Store privacy label says "Medical Device: Yes"; Glow's listing
  says "Listed with the FDA".
- App Store privacy labels: Flo "Data Used to Track You: Purchases,
  Location, Identifiers, Usage Data"; Glow adds Contact Info; Clue lists
  Identifiers only and is the only one of the four to declare
  accessibility features (VoiceOver, Larger Text, Dark Interface, Reduced
  Motion); Ovia lists no tracking block. Flo promotes Anonymous Mode
  (Oblivious HTTP through a relay, open sourced).
- Apple explains privacy inside the feature help (encrypted when locked,
  end-to-end with two-factor authentication) and adds "The information you
  add about yourself in Health is yours to use and share."

Tidefern makes none of the regulatory claims and never prints an
effectiveness number; every fertile element keeps the contraception line
(3.5 of the build prompt, 9.6 of the record). It adopts the habit of a
privacy sentence where the feature is explained (the sharing screen and
`/design/foundations` say what Tidefern can and cannot read, linking to
`/health-privacy`), and the citation habit when a reference band is shown
(WHO and CDC named inline, F1). It does not need Anonymous Mode because it
collects no advertising identifiers in the first place (9.1).

## Decisions this research changes

Each item names the task that carries it.

1. Logged is solid, predicted is dashed or striped, estimate is dotted, on
   the ring, the month grid and the journey timeline, with an accessible
   label per predicted day. G5, `/design/components`.
2. The calendar keyboard model is the APG Date Picker Dialog, Home and End
   to week bounds, tested with the range rules (first tap, second tap,
   swap, hover preview) against the pinned `react-day-picker`. G5.
3. The month grid takes `YYYY-MM-DD` strings and a `today` prop; demos and
   tests pass it explicitly. G5, J1.
4. A window (predicted period, fertile window) is one continuous pill
   behind consecutive days, dashed when predicted; the tide line is the
   today marker; the cycle day prints in the cell. G5, H3.
5. Range-bearing controls read their value as their label and offer plain
   presets; no time inputs anywhere. G5, H3, H5.
6. The estimate sentence sits directly under the ring with the short
   two-sentence disclaimer, and a "How this is estimated" disclosure
   written from `packages/core`. H2, G6 foundations.
7. The deviation nudge opens the calendar list first and is suppressed
   during pregnancy and postpartum. H2, H3.
8. `/welcome` accepts the last period, a due date, or weeks and days as of
   a date; the transfer date joins when the schema carries embryo age. H1.
9. Child cards show last event, time since, today's total, in that order;
   one day-start definition in `/settings`; timers are shared rows. H5, H7.
10. Growth charts caption their source and age range; preterm children get
    corrected age or an honest empty state. H5.
11. `/sharing` describes each category in nouns, a grant carries a sharing
    start date, and a partner's `/today` summary names categories, not
    values. E7, H2, H6.
12. Empty states follow the formula; the copy table lives in
    `docs/design/CONTENT.md`. G2, every H task.
13. `/design` chapters list every anchor in a disclosure on phones; nothing
    is revealed on scroll; full-page captures must never show a blank
    section. G6, J3.
14. `/design/color` prints measured ratios from the running document and
    offers copy-as-CSS and a JSON download; roles that act as fills gain an
    ink member. G5, G6.
15. Settings toggles carry one line of help text beneath them, including
    "Remembered on this device" on the two stored preferences. H7.

## Skills and dependencies

- The Vercel `web-design-guidelines` audit is installed as a wrapper skill
  at `.agents/skills/web-design-guidelines` (linked from
  `.claude/skills`), pinned to `vercel-labs/web-interface-guidelines`
  commit `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1` (190 lines, 7 em dashes,
  MIT with the full licence text) and the upstream skill at
  `vercel-labs/agent-skills` commit
  `063bee94c3f4df8453406c830b0a7df0f2860278` (MIT declared in its README
  only; no licence file at that commit). The rule file is fetched at audit
  time, never vendored, because the prose gate would reject it. The wrapper
  records the overrides: sentence case below page titles (rule at line
  144), `text-wrap: balance` only, neutral state only in URLs (lines 97 and
  99 would otherwise demand query-parameter sync for the day sheet), font
  preload and GIF rules not applicable, no virtualization library on the
  audit's say-so.
- `find-skills` was not installed; no concrete gap needed it.
- `react-day-picker`: the registry's latest on 2026-10-05 is 10.0.2 (MIT,
  published 2026-09-30; the last 9.x is 9.14.0), on a line being renamed
  `@daypicker/react`. The shadcn registry item pins `react-day-picker@latest`
  and its copied `calendar.tsx` uses the 9-era snake_case `classNames`
  keys, which the v10 upgrade guide says shadcn users must update. G5 pins
  10.0.2 explicitly, verifies the copied keys against that version and adds
  the range test (13.6).
- Nord stays documentation only (proprietary licence, confirmed from the
  npm tarball by the skills researcher and recorded in 13.6).
- Typography is decided (13.5); G3 renders the specimens and writes
  `docs/design/TYPOGRAPHY.md` as the decision record.
- Growth and milestone data provenance is recorded by F1 and F4 in
  `packages/core/data/SOURCES.md` (WHO and CDC LMS tables from CDC's
  hosting; CDC 2022 milestone checklists); `docs/design/ASSETS.md` (G2)
  points at it rather than repeating it.

## Inaccessible or partial

| Page | What happened |
| --- | --- |
| rebrand.gallery filter pages and `/bento/moai` | 200, then an in-page free-account wall after 20 entries; 3 of 22 shots shown on the entry; filters and facets are Pro-only even with an account |
| details.so category pages and `/vault` | 200, eight entries then a blurred "You've seen less than 1%" wall; the full library is Pro, code blocks are Max; nothing from the vault was opened |
| landing.love | No wall; ads cover content on every page; everything inside is a recording, so responsiveness was verified only on the live sites opened from it |
| Phloom | All seven pages 200; three parallel requests drew 503s on the first try, sequential requests did not; no theme toggle exists on the design pages despite the colour chapter saying so |
| shadcn/ui Base UI calendar docs | 200; arrow keys did not move focus in headless Chromium on the Base flavour, while the Radix flavour behaved; recorded as a thing to verify in the pinned build, not a verdict on the library |
| Flo help-centre search pages | 200 but the dumps hold no result links, so Flo's loss flow stays undocumented here |
| Ovia help centre | support.oviahealth.com and help.oviahealth.com do not resolve; oviahealth.com/support, /help, /faq and /press are 404 |
| Glow press pages | glowing.com/press, /newsroom and /news are 404; support.glowing.com works |
| Clue help centre | 403 to curl, 200 in Chromium |
| Natural Cycles | `/how-it-works` is 404 (the live slug is `/how-does-natural-cycles-work`); the web app is behind login and was not attempted; a cookie modal covers every marketing hero |
| Sprout App Store ids guessed in the brief | 404; the real listings are id441977097 and id551448817 |
| App Store carousels | Only the first few marketing screenshots render without scrolling the carousel; they were read at full size through their `srcset` |

## Licence limits

21st.dev content is the property of its authors and 21st Labs, usable
through its platform with a link back on redistribution: survey only. Nord
is proprietary: documentation only. Phloom publishes no licence: principles
paraphrased, identity untouched. shadcn/ui, react-day-picker, HeroUI, Primer
and amicro are MIT and Carbon is Apache-2.0, but nothing from them is
vendored either; the calendar is built on the pinned `react-day-picker`
through shadcn's generator as 13.6 says. W3C examples are under the W3C
document and software licences; the pattern is followed, the markup is
not copied. Every product screenshot is its company's marketing material,
read for behaviour and kept out of the repository.
