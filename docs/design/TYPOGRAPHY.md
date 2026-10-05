# Typography

The decision record for the type pairing, written to close task G3. The
pairing itself was decided in `docs/ARCHITECTURE.md` section 13.5 during
research; this record says what the specimen chapter at `/design/type`
shows, what it proved, and what it still owes.

## The decision, restated

Two faces, each with one job (architecture 13.5):

| Role                                     | Family     | Build                         |
| ---------------------------------------- | ---------- | ----------------------------- |
| Display, headings, wordmark text         | Newsreader | variable, optical size 6 to 72, weight 200 to 800 |
| Body, controls, labels and every numeral | Figtree    | variable, weight 300 to 900   |

Why Newsreader won over Fraunces, Cormorant Garamond and Instrument Serif,
and why Figtree stayed over Plus Jakarta Sans, is argued with measurements
in 13.5 and is not repeated here. The research record
(`docs/design/RESEARCH.md`, Phloom and Dawn rows) adds two observations
that reinforced it: a curated health site pairs Figtree with a serif and
reads as warm, and Phloom's Figtree plus Instrument Serif pairing is close
enough that Tidefern's identity has to come from the serif, which is why
the serif is Newsreader and not Instrument Serif.

## What the chapter shows

`/design/type` sets every specimen in the product's own tokens and fonts,
so what the page shows is what the product renders. It is a public route
with `noindex`, like the rest of the design reference.

| Section                 | Specimen                                                                                            | What it proves                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Wordmark and tagline    | The mark beside "Tidefern" in Newsreader 500 with the tracked Figtree tagline; a small panel lockup | The lockup reads at 96 px and at 48 px; the tagline survives on the warmth surface                                  |
| The scale               | One row per token from `type-display` to `type-caption`, each with its clamp and its use            | The seven steps are distinct at desktop and at 390 px without a size collapsing into its neighbour                  |
| Body and reading width  | An editable paragraph at the body size, the estimate sentence, and a caption                        | Reading width stays inside 45 to 68 characters; the estimate italic is readable at the intro size and nowhere smaller |
| Navigation and controls | Six navigation labels with a current item, a primary action, a quiet action and two chip buttons    | Figtree 600 at the small size carries labels and chips in both themes with the measured contrast of the roles        |
| Numerals                | The same four values set proportional and tabular, then display numerals beside a serif label        | Tabular figures align in a column where proportional ones drift; the numeral-beside-label move (signature move 4)    |
| Provenance              | The four font files with family, axes, size and licence                                             | Everything the page uses is self-hosted and OFL                                                                      |

The specimen chip buttons are real `<button type="button" aria-pressed>`
elements rather than styled spans; the first axe run on the page failed
on `aria-pressed` applied to a span, and a specimen that fails the
product's own accessibility gate is not a specimen.

## Files

| File                                    | Family and axes                                   | Size   | Licence |
| --------------------------------------- | ------------------------------------------------- | ------ | ------- |
| `newsreader-latin-opsz-normal.woff2`    | Newsreader, optical size 6 to 72, weight 200 to 800 | 132 KB | OFL 1.1 |
| `newsreader-latin-wght-italic.woff2`    | Newsreader italic, weight 200 to 800              | 64 KB  | OFL 1.1 |
| `figtree-latin-wght-normal.woff2`       | Figtree, weight 300 to 900                        | 20 KB  | OFL 1.1 |
| `figtree-latin-wght-italic.woff2`       | Figtree italic, weight 300 to 900                 | 21 KB  | OFL 1.1 |

Latin subsets from fontsource 5.3.0 in `apps/web/public/fonts`, with the
OFL text beside each family (`LICENSE-newsreader.txt`,
`LICENSE-figtree.txt`) because the WOFF2 files carry only the licence URL.
Loaded in `apps/web/src/app/layout.tsx` through `next/font/local` with
`display: swap` and fallback metrics adjusted to Times New Roman for the
serif and Arial for the sans. The reasoning for the weight-only italic
(64 KB against 147 KB for the optical-size italic, preloaded on every
route) is in 13.5 and stands.

## Legibility check

Captured from the production build on 2026-10-05 at 1440 px and 390 px
in both themes: `docs/design/research/g3-type-desktop-light.jpg`,
`g3-type-desktop-dark.jpg`, `g3-type-phone-light.jpg` and
`g3-type-phone-dark.jpg`.

- Every scale row is legible and distinct in both themes. The display
  line at 1440 px sits at the top of its clamp, the heading one step
  below, and the caption row is still readable at 13 px.
- At 390 px the display line wraps to two lines without a widow and the
  scale rows stack their token meta above the specimen, so nothing is
  clipped and the page has no horizontal scroll.
- The estimate sentence in Newsreader italic reads cleanly at the intro
  size in both themes. It is deliberately the only italic in the product,
  because the same face at the small size loses the counters.
- The proportional and tabular columns show the difference the rule
  exists for: "1,118" and "11,181" line up only in the tabular column.
- The chips, actions and navigation labels keep their role contrast in
  dark mode without any per-theme type change.
- axe reported no violations on `/design/type` in either theme (the e2e
  loop runs it with the home page and the design hub).

## What this task still owes

- The plan row for G3 names an outlined wordmark. The chapter sets the
  wordmark as live Newsreader at weight 500 because the outlined lockup
  (`tidefern-lockup.svg` and its dark variant) is a G4 deliverable, as
  `docs/design/ASSETS.md` records. When G4 lands, the lockup specimen
  swaps the live text for the vector and this record gains the file row.

## Rules this chapter enforces by example

- Title Case is for page titles only; labels, actions and headings are
  sentence case.
- Counters, dates and tables set `font-variant-numeric: tabular-nums`
  through the shared `.tabular` class; nothing else does.
- The estimate sentence is Newsreader italic at the intro size and never
  appears at the small or caption size.
- The wordmark is never a styled `<span>` in product chrome once the
  outlined vector exists; until then it is the `Mark` component's live
  text.
