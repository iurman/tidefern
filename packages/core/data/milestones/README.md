# CDC milestone checklists

`2022.json` holds the text of CDC's "Learn the Signs. Act Early." developmental
milestone checklists, 2022 revision: 12 ages and 159 items. The file is
versioned by the revision year; a later CDC revision goes in a new file next to
this one and `packages/core/src/milestones.ts` switches to it on purpose.

## What is in the file

- `version`: the CDC revision year.
- `source`: the index page the checklists were captured from and the date.
- `attribution`: the "Source: CDC" sentence with the non-endorsement clause
  that CDC's reuse terms require. Show it wherever the checklists appear.
- `notScreeningLine`: the permanent line shown next to every list.
- `ages[]`: one entry per checklist with `months` (2, 4, 6, 9, 12, 15, 18, 24,
  30, 36, 48, 60), CDC's own `label` ("2 months", "1 year", "30 months") and
  `items[]`.
- `items[]`: `id` (`<months>m-<domain>-<n>`, stable for check-off records),
  `domain` (`social`, `language`, `cognitive`, `movement`, mapping CDC's four
  headings in order) and `text`, CDC's wording unchanged, including its curly
  quotes.

Only the milestone text is here. Photos, videos, tips, the "share with your
doctor" prompts and the app links on the CDC pages were left out on purpose:
media on CDC pages may be contractor owned, and the rest is not checklist data.

## Where it came from

Captured 2026-10-05 from the per-age pages, rendered in Chromium because
cdc.gov answers plain HTTP clients with 403:

- https://www.cdc.gov/act-early/milestones/index.html (links the twelve ages)
- https://www.cdc.gov/act-early/milestones/2-months.html
- https://www.cdc.gov/act-early/milestones/4-months.html
- https://www.cdc.gov/act-early/milestones/6-months.html
- https://www.cdc.gov/act-early/milestones/9-months.html
- https://www.cdc.gov/act-early/milestones/1-year.html
- https://www.cdc.gov/act-early/milestones/15-months.html
- https://www.cdc.gov/act-early/milestones/18-months.html
- https://www.cdc.gov/act-early/milestones/2-years.html
- https://www.cdc.gov/act-early/milestones/30-months.html
- https://www.cdc.gov/act-early/milestones/3-years.html
- https://www.cdc.gov/act-early/milestones/4-years.html
- https://www.cdc.gov/act-early/milestones/5-years.html
- https://www.cdc.gov/act-early/milestones/key-points.html

The per-age pages said "last reviewed on May 15, 2026" and the key points page
"Feb. 16, 2026" on the capture date. On each age page the items sit under the
heading "What most babies do by ..." or "What most children do by ...", one
`h3` per domain. The item count per page matches the 159 total that Zubler et
al. 2022 (Pediatrics 149(3) e2021052138) report for the revision.

## The framing CDC gives

Each age page: "Developmental milestones are things most children (75% or
more) can do by a certain age." The key points page: "Milestones were placed at
ages by which at least 75% of children would be expected to exhibit them" and
the checklists "should not be used as screening or diagnostic tools to detect
developmental delays." The index page: "Learn the Signs. Act Early. resources
are not a substitute for standardized, validated developmental screening
tools." That is why the product shows "Most children do this by <age>." and
never scores a child.
