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
| Public header at 600 px and below (`apps/web/src/app/globals.css`) | low | Review of J3b: `.site-nav { order: 3 }` painted the Menu button after the sound and theme toggles while it comes before them in the source, so Tab ran logo, Menu, its links, then back left to the toggles; without JavaScript the links row sat below the toggles but came first in Tab order (WCAG 2.4.3) | No reordering: with JavaScript the button sits before the toggles, as in the source; without it the links take the row between the logo and the toggles | `public.spec.ts` checks every header control paints after the one Tab visits before it at 1440, 390, 320 and without JavaScript; `flows/sweep.spec.ts` checks Tab from Menu moves right; `J3b-evidence/J3b-header-closed-*` |
| Public header Menu button, open (`apps/web/src/app/globals.css`) | low | Review of J3b: the only open cue was the `--panel` fill, about 1.1:1 on the dark bar, and phones hide the icon swap, so in dark the open button looked closed | The open button takes the pressed chip's action fill, text and border, which hold in both themes | `public.spec.ts` (the open button's fill and border differ from the closed one and from the bar in both themes); `J3b-evidence/J3b-header-open-*` |
| Public header phone panel (`apps/web/src/app/globals.css`) | low | Review of J3b: the panel snapped between `display: none` and `flex`, against DESIGN.md section 7's disclosure motion | The panel fades and lifts 6 px over `--duration-disclosure` on `--ease-disclosure` (`@starting-style` and a discrete `display` transition), and lands at once under reduced motion | `public.spec.ts` waits for the open panel to settle at full opacity before axe |

## Behavior and accessibility

Task J3f, loop 3. Already automated before this loop, and run again here
on the seeded production build: `flows/sweep.spec.ts` (every public route
signed out and every persona's routes: axe with the wcag22aa tags in both
themes at 1440 and 390, no sideways scroll at 320, Tab from the top to the
skip link and main, every frame element reached with a ring it did not
draw at rest and none under the tab bar, every sheet and dialog opened from
the keyboard, closed with Escape and focus back on its control, the phone
header menu by keyboard), the flow suites (auth, onboarding per stage,
logging, sharing, settings, deletion and closure to removal on fresh
accounts), and the no-JavaScript checks for the design chapters, the
public header and `/log/<date>`. Checked by hand in this loop, with the
scripts and outputs beside the wave's reports (`J3f-evidence/`): reading
with JavaScript off on every public and policy page at 390 (`nojs/`:
every page shows its H1 and full text, nothing at opacity 0); a 1440 by
900 window at 200 percent (a 720 by 450 viewport) walked with Tab on 13
public and signed-in routes, every focused element in view and none under
the tab bar (`zoom-200.txt`); touch targets at 390 on 31 routes
(`targets-390.txt`); and the contrast of states axe cannot see, at rest,
hover, pressed and keyboard focus in both themes on the action and form
chapters, Today, Sound, Sharing and Sign in: every enabled control's text
at or above 4.5:1 in every state and every focus ring at or above 3:1
against the surface it sits on, colored surfaces included
(`contrast-states.txt`).

| location | severity | evidence | correction | verification |
| --- | --- | --- | --- | --- |
| Every form that scripts handle (sign-in and its second step, sign-up, both reset forms, two-factor, profile, invite, the family sheets) | critical | With JavaScript off, or a press before hydration on a slow phone, the forms submitted natively as a GET: `/sign-in?email=someone%40example.test&password=not-a-real-password`, the same for sign-up with the name and for reset with the email (`J3f-evidence/nojs-submit-before.txt`). The password and the address landed in the address bar, the history and the host's request log | Every such form carries `method="post"`. A POST to a page renders the page again with nothing in the address, and with scripts on `onSubmit` still prevents the native submit. `/log/<date>` and onboarding already posted | `privacy.spec.ts`: with scripts off the three public auth forms submit as POST and the address stays bare; on every route of the walk (public, every persona, a new account) every form on the page posts |
| Today's empty state for a new account, the cycle ring (`components/ui/cycle-ring.tsx`) and the week card (`week-card.tsx`) | high | The ring's "Log a period" defaulted to `/log`, which is no route, and Today's empty hero passes no address, so a new account's first action answered 404; the week card defaulted to `/journey/dating` and `/journey/start`; the marks chapter's specimens linked all of them and `/family/child/milestones`, and the design link check allowed those 404s by name | The ring defaults to the day page for `today` (`/log/<today>`), the week card's links to `/journey`, the specimens to built routes; the design link check allows no 404 any more | `cycle-ring.test.tsx`, `week-card.test.tsx`; `design-exports.spec.ts`; `privacy.spec.ts` follows every same-origin link the walk met, a new account's empty states included, and fails on any that lands on an error |
| `/sign-in`, `/sign-up`, `/reset` without JavaScript | medium | The forms render and now post safely, but a press reloads the empty form with no sentence saying sign-in needs scripts (`J3f-evidence/nojs/`) | Open: needs one sentence in CONTENT.md; asked of the lead and J3e | Not yet |
| Text links standing alone at 390: the public footer (26 px tall), the app's policy line (38 px), "Forgot your password?", "Create an account", "Back to sign in" (22 px) | low | `targets-390.txt`. All pass WCAG 2.5.8 (axe's target-size rule is clean on every route in the sweep), but sit under DESIGN.md's 44 px for controls if links count as controls | Open: a styling call for J3e (pad the links to 44 px, or record that standalone text links are exempt) | Not yet |

## Motion and sound

Task J3f, loop 4. Frames were sampled on the production build with
motion allowed and with reduced motion, reading each animated element's
computed opacity, transform and running animations at set times, with a
screenshot per frame (`J3f-evidence/motion/`, `J3f-motion.txt`). What
DESIGN.md section 7 specifies and was seen: the marketing tide drifts once
over 9 s and rests (finished at 9000 ms, nothing running and nothing
infinite after); the ring's arc settles once over 600 ms after the page
streams in; the calendar's month change cross-fades in 180 ms; the day
sheet rises over 280 ms; Escape in the middle of the rise closes it and
returns focus to the day; a resize from 1440 to 390 in the middle of the
rise lands the sheet whole at full opacity; navigating away in the middle
of the ring's settle and coming back leaves nothing half drawn; under
reduced motion every one of them is at its final state in the first frame
and the month swaps with no fade. Sound: automation grants sticky
activation, so the shared context is already running, and still not one
oscillator starts while any public or signed-in route loads and settles;
a click to another tab of the shell plays exactly one settle cue
(`privacy.spec.ts`). Mute, the middle level, quiet hours and the silence
on back and forward were already gated in `sound.spec.ts` and
`sound-provider.test.tsx`.

| location | severity | evidence | correction | verification |
| --- | --- | --- | --- | --- |
| `play()` and `haptic()` (`apps/web/src/lib/sound.ts`) | medium | Nothing checked the page's visibility, so a success or error cue from a save that finished after the person switched tabs (InlineFeedback plays on mount) sounded from a background tab, and a settle cue could too; architecture 14.1 lists background data among the silent cases | Both stay silent while `document.visibilityState` is `hidden`; `play()` answers `hidden`, and the sample and the chapter print "This tab was in the background, so it stayed silent." | `sound.test.ts` (silent and no vibration while hidden, plays again once visible, the person's own Off still named first); `sound.spec.ts` (hidden: the sentence and no oscillator; shown again: one press drop) |
| Page entrance after a navigation the person started (DESIGN.md 7: one cascade, 600 ms settle, above the fold only) | medium | Not built: right after a click from Today to Sharing the only animations running are the link's own color transitions (`J3f-motion.txt`, "entrance") | Open: the beats per page are a design decision DESIGN.md does not name; asked of the lead. The settle cue's arm in `SoundProvider` already knows which navigations qualify | Not yet |

## Performance and privacy

Task J3f, loop 5. `privacy.spec.ts` now holds these as gates on every run
against the production build: every public route signed out, every
persona's routes, a new account's onboarding and empty states, and client
navigations in the shell. It fails on a request to any other origin, a
console error or uncaught exception, a failed request or an error status
(the not-found route excepted), an HTML page without the nonce policy
(`script-src` with a nonce and `strict-dynamic`, never `unsafe-inline`,
`frame-ancestors 'none'`, no other origin in any directive), HSTS,
`nosniff`, the referrer and permissions policies, frame denial,
`private, no-store` or noindex; an API answer without exactly
`private, no-store` and the API's own policy; a static file without the
security headers; a signed-in client navigation's payload that may be
stored; a health word in a signed-in title, page path or query value, or
a query parameter outside a neutral set; a cue on load; a form that would
submit as a GET; a new-tab link without `noopener`; and a link that lands
on an error. `privacy-rules.spec.ts` proves each rule rejects the
regression it exists for. The seeded run found no third-party request, no
console error and no failed request on any route. The server log of the
seeded run carries only the allowlisted fields (request id, method, route
template, status, latency, the HMAC of the actor): no body, no query
string, no email, no free text.

| location | severity | evidence | correction | verification |
| --- | --- | --- | --- | --- |
| API security headers on Vercel (`packages/api/src/app.ts`) | high | `curl -D - https://tidefern.app/api/v1/health` answered `strict-transport-security: max-age=15552000`, `x-frame-options: SAMEORIGIN` and `referrer-policy: no-referrer`, Hono's `secureHeaders()` defaults, while every page answered the site's two years, `DENY` and `strict-origin-when-cross-origin` (`J3f-evidence/production-headers.txt`). Locally Next.js laid its headers over the API's; on Vercel the function's own headers win | `middleware/security-headers.ts` gives the API the site's values and its own `default-src 'none'; frame-ancestors 'none'` policy, so it is right on any host, a split `api.` deployment included | `security-headers.test.ts` on a success, the contract, a refusal and an unknown route; `privacy.spec.ts` holds every API answer to the site's values, which catches it on a deployment run. Production re-read after merge: pending |
| Preview deployments | low | A plain `curl` of the branch's head preview (`tidefern-2viqtn0lr-iurmans-projects.vercel.app`) meets Vercel Authentication on every path: 302 to the SSO page with `x-robots-tag: noindex`, `cache-control: no-store`, HSTS and `DENY`, so nothing indexes; the app's own preview headers and robots.txt sit behind it (`preview-headers.txt`). Reading behind it needs the bypass secret or a share link, which this loop did not create | None needed for indexing. The deploy smoke (`deploy-verify.yml`, with the bypass) runs `home.spec.ts`'s noindex check against each preview; production answers `X-Robots-Tag: noindex, nofollow` and `Disallow: /` while `SITE_INDEXABLE` is unset, as the record says | `preview-headers.txt`, `production-headers.txt` |
| API log lines name the resource in the route template (`/api/v1/pregnancies/:id`) | low | The seeded run's server log. The record allows the route template and the actor is an HMAC, but architecture 9.1 also says even "visited `/pregnancy`" is derived health data under MHMDA, and a template beside a stable actor hash says this actor has a pregnancy record | Open: a decision for the lead and the owner (keep, or log a neutral route class instead of the template) | Not yet |
