# Design reference coverage

Task G8, 2026-10-06. This compares what ships in `apps/web` with what the
`/design` chapters and the catalog (`apps/web/src/lib/design-catalog.ts`,
served at `/design/catalog.json` and `/design/reference.md`) describe.
Architecture 13.7 and 13.8 are the yardstick. A passing link check proves
that every link and anchor resolves. It does not prove that the pages describe
current behavior, so each gap below was found by reading the source and the
pages.

## What the catalog holds

116 patterns:

| Chapter    | Entries | What they are                                                    |
| ---------- | ------- | ---------------------------------------------------------------- |
| Overview   | 9       | Exports, chapter index, palette, semantic colors, token groups   |
| Brand      | 9       | Every section of `/design/brand`                                 |
| Color      | 11      | Every section of `/design/color`                                 |
| Type       | 6       | Every section of `/design/type`                                  |
| Components | 61      | 55 specimens in six groups, plus 6 sections on two group pages   |
| Motion     | 6       | Every section of `/design/motion`                                |
| Sound      | 7       | Every section of `/design/sound`                                 |
| Foundations | 7      | Every section of `/design/foundations`                           |

Each entry has a `name`, a `chapter`, an `href` whose fragment matches
exactly one element on its page, `sources` that exist in the repository and
a one-sentence `description`. Three checks keep it honest:

- `apps/web/src/lib/design-catalog.test.ts` requires every source path to
  exist and the specimen list to equal all six specimen groups by name,
  source and order. It also requires the exports to match their sources.
- `apps/web/tests/e2e/design-exports.spec.ts` requires every `href` to
  resolve exactly once and every `h2` with an id on every `/design` page to be
  in the catalog. It also runs the link check and the chapter order check.
- Two specimen groups (structure, patterns) are client modules. A route
  handler sees them only as client references, so the catalog writes the
  specimen list out once instead of reading the groups at request time. The
  unit test above is what stops that list from drifting.

## Shipped components and where they are documented

Every file in `apps/web/src/components/ui/` that renders a product
component has a specimen in `/design/components` except the ones below.
That covers buttons, links, feedback, toasts, skeleton, empty state,
disclosure, copy code, token swatch, the theme and sound toggles, every
form control, the shell, tab bar and rail, dialog, bottom sheet, the
sharing and settings cards, the calendar set, the cycle ring, week card,
timeline, measurement chart and the day sheet. The frame renders each in the
eight states and both themes, and declares "none" where a state has no
meaning.

Gaps:

1. `Switch` (`apps/web/src/components/ui/switch.tsx`) has no specimen of
   its own. It appears only inside the grant row and the day sheet, so its
   disabled, loading and error states are not shown on their own, and the
   settings quiet-hours control uses it directly.
2. The icon set (`apps/web/src/components/icons.tsx`) is not documented as
   a set under `/design`: no page lists the icons, the 24 px grid and 1.6 px
   stroke that Architecture 13.7 names, the drawn symptom and mood icons or
   the rule that each icon is paired with text. Icons appear only inside
   other specimens (the tab bar, rail, button, toast, day sheet and month
   grid).
3. The public header and footer (`apps/web/src/components/header.tsx`,
   `footer.tsx`) are listed in 13.7 but have no specimen. The header today
   holds the logo, one link and the two toggles; the mobile menu 13.7
   describes (a native disclosure that Escape closes) is not built yet.
4. The quick-log button on Today is a prop of the app shell
   (`onQuickLog`) that opens nothing yet. The specimen shows the shell
   without it.
5. Public page compositions in `apps/web/src/components/public/` (hero,
   chapter list, promises, statement, policy document) have no
   "page patterns" group. Architecture 13.8 lists page patterns among the
   components chapter's groups. The tide line is shown on `/design/motion`
   through the tide demo.
6. 13.8 also names a "status and identity" group and a "milestone row".
   Status and identity is split across actions and structure. The
   milestone row is the timeline's row; it has no specimen by that name.

## Chapters against 13.8

- Overview (`/design`): the exports now list the JSON tokens, the CSS
  variables, the Markdown reference, the catalog and the OpenAPI contract.
  The intro still says "the seven chapters below are the planned structure",
  which is no longer true: all seven are published. The hub does not offer
  the searchable pattern catalog that the site-build guidance suggests. The
  catalog exists as JSON and Markdown but is not rendered on the hub.
- Brand: complete for the shipped files; the mark itself is pending the
  owner's approval, as the chapter says.
- Color: matches 13.8 (both themes, measured contrast, a sandboxed checker,
  copyable variables). Settings has no "follow system" control yet, so the
  chapter points at clearing site data instead (G6 request).
- Type: 13.8 asks for editable specimens. The page on main has no editable
  text: the G3 review describes a `contentEditable` reading specimen, but
  it is not in `apps/web/src/app/(public)/design/type/page.tsx` today.
- Components: groups render real components in both themes with a width
  control. The theme is shown side by side rather than switched, which
  covers the same need. The six gaps above apply here.
- Motion, Sound and touch, Foundations: match 13.8.
- Chapter order: previous and next links now follow 13.8 (Design system,
  Brand, Color, Type and space, Components, Motion, Sound and touch,
  Foundations). Within the components chapter, the group pages run
  Actions and feedback, Forms, Structure and overlays, Calendar, Marks and
  charts, Patterns, and Patterns continues to Motion.

## Links the specimens make

Specimens use the product's real destinations with synthetic data, and
every one of them is a built route: the week card and the ring's empty
action link to `/journey` and `/log/<date>`, and the family specimens to
`/family`. The link check allows no 404 (task J3f removed the allowance it
kept for `/journey/dating`, `/journey/start`, `/family/child/milestones` and
`/log`). Every internal link must answer 200, or, for a signed-in route
(`/today`, `/calendar`, `/journey`, `/family`, `/sharing`, `/settings`,
`/settings/sound`, `/log/<date>`), the redirect to sign-in that carries the
path to return to.

## Not checked here

- Manual keyboard and screen reader passes per specimen are recorded in
  `docs/design/QA.md` (task J3), which does not exist yet.
- Forced colors (architecture 13.10) are not exercised by any `/design`
  spec.
