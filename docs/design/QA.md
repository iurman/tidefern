# Review loop findings

The log of findings from the review loops (`docs/BUILD_PROMPT.md` section
10, task J3), one row per finding: where it is, how severe, the evidence
that showed it, the correction and what verifies it. The first rows are the
known web defects fixed before the full audit (task J3b); J3's audit of
copy, visuals, behavior, motion, performance and privacy fills the rest.

Severity: critical blocks a flow or exposes data; high breaks a stated
rule or an essential path; medium is visible and wrong but has a way
around; low is polish.

Captures named below live with the wave's evidence (`J1-evidence/`,
`J3b-evidence/` beside the reports), not in the repository; the specs
named run in CI.

| location | severity | evidence | correction | verification |
| --- | --- | --- | --- | --- |
| `(app)` layout session gate (`apps/web/src/app/(app)/layout.tsx`) | high | A signed-out visitor to `/settings` was sent to `/sign-in` with nothing of the page they asked for, and the sign-in landed them on `/today`; `flows/auth.spec.ts` asserted `/today` for the "and back" step | The proxy hands the page's path (never its query) to the render in a request header; the layout redirects to `/sign-in?next=<path>` through `signInPathFor`, which keeps only a path `safeNextPath` accepts and drops `next` for Today. `safeNextPath` now also refuses any `%`, so no encoded slash, backslash or dot passes | `flows/auth.spec.ts` (back on `/settings` and on `/log/2026-10-01` after sign-in, the query dropped, encoded and protocol-relative `next` land on Today); `auth-client.test.ts` (open-redirect cases); `(app)/layout.test.tsx` |
| Week strip, list view of `/calendar` (`day-cell.module.css`) | medium | `J3b-evidence/before/J3b-before-list-390-light.jpg`: today (Monday Oct 5) on warmth with the period coming in from Saturday; the pill's open start ran flat to the item's edge over the warmth box's rounded corners, so the box read as clipped | A row's first day whose window began earlier, and a row's last day whose window goes on, stop the pill 4 px short of the edge and fade it out over 20 px with a mask, so it reads as continuing and the warmth corners show | `calendar-edges.spec.ts` at 1440, 390 and 320 in both themes; `J3b-evidence/J3b-calendar-list-*` |
| Month grid of `/calendar` at 390 px (`day-cell.module.css`) | medium | `J1-evidence/J1-shell-calendar-top-390-dark.jpg`: the period through Sunday Oct 4 and the expected period through Sunday Nov 1 ran flat into the grid's right edge, and Monday Oct 5 started flat at the left, reading as cut off | The same rule as the strip: the continuing end stops inside the grid and fades | `calendar-edges.spec.ts`; `J3b-evidence/J3b-calendar-month-*` at 1440, 390 and 320 |
| Public header (`apps/web/src/components/header.tsx`) | high | DESIGN.md sections 2 and 4 and CONTENT.md's `/` row name "Sign in" in the header; it had only "Design system", and nothing at all below 601 px | `PublicNav`: Design system and an outlined Sign in in the bar; below 601 px a disclosure button ("Menu", `aria-expanded`, `aria-controls`) opens them as a panel under the bar; Escape, a press outside, a link or a route change closes it, and Escape returns focus to the button; the press cue comes from the shared SoundProvider. Without JavaScript the links show as a plain list on their own row | `public.spec.ts` (Sign in on every public page, the menu by pointer and keyboard, axe on the open menu in both themes, 390 and 320 reflow, no-JavaScript list); `flows/sweep.spec.ts` keyboard path at 390; `public-nav.test.tsx`; `J3b-evidence/J3b-header-*` |
| Social card alt text (`apps/web/src/lib/site.ts`, `apps/web/src/app/opengraph-image.alt.txt`) | low | The same words were written in two places with nothing tying them | `SOCIAL_CARD_ALT` in `site.ts` is the source for the home page's card; Next's file convention needs the `.alt.txt`, so `site.test.ts` pins the file equal to it | `site.test.ts` |
