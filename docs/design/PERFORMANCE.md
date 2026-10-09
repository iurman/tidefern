# Performance

Lab measurements of the production build against the budgets in
`docs/ARCHITECTURE.md` section 15 (Performance row): 1.5 MB initial
transfer, 200 KB compressed first-route JavaScript, LCP 2.5 s and CLS 0.1,
all as lab proxies. Task J2 set this up; rerun it after any change that
adds a dependency to a client component or touches fonts.

These are lab numbers from one machine against a local server, with
simulated throttling. They prove nothing about field performance: no real
phone, network, cache state or person produced them.

## Summary

Task J2b made the four proposed fixes and measured each; its numbers and
what is still over budget are in [J2b: the fixes,
measured](#j2b-the-fixes-measured) at the end. In short: first-route
JavaScript is now met on `/today` and `/family` and missed by 7 to 20 KB on
`/calendar`, `/sharing` and `/settings`; LCP is still missed on every route
(closest: `/settings` at 2.71 s), and on `/today` for a person with a
prediction it is 0.37 s slower than after fix 2, the cost of no longer
preloading the italic. The rest of this summary
and the sections up to "A performance gate" are J2's record, unchanged.

Measured 2026-10-09 (UTC) on the build of `main` at `0b31e7d` plus this task's
tooling (no application change).

| Budget                             | Signed-out routes        | Signed-in routes        |
| ---------------------------------- | ------------------------ | ----------------------- |
| Initial transfer, 1.5 MB           | Met (524 to 550 KB)      | Met (613 to 720 KB)     |
| First-route JavaScript, 200 KB     | Met (164 to 192 KB)      | Missed (251 to 362 KB)  |
| LCP, 2.5 s                         | Missed (3.27 to 4.45 s)  | Missed (3.62 to 5.33 s) |
| CLS, 0.1                           | Met (0 to 0.008)         | Met (0 to 0.059)        |

The fixes for both misses sit in shared packages or change a recorded
typography decision, so this task makes no application change; they are
listed under [Proposed fixes](#proposed-fixes) with measured or estimated
effects.

## Method

- Tool: Lighthouse 13.5.0 (CLI), dev dependency of `apps/web`, run by
  `apps/web/scripts/perf/lighthouse.mjs`.
- Browser: Playwright's Chromium, Google Chrome for Testing
  153.0.8010.12, headless. The script resolves it from `@playwright/test`
  or takes `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Lighthouse 13's CLI has
  no `--chrome-path` flag; its help says to set `CHROME_PATH`, which the
  script does. This is the one deviation from the plan's wording.
- Form factor: mobile (`--form-factor=mobile`), Lighthouse's default
  Moto G Power emulation, 412 x 823 at 1.75x.
- Throttling: Lighthouse's default simulated throttling
  (`--throttling-method=simulate`): RTT 150 ms, throughput 1638.4 Kbps,
  request latency 562.5 ms, download 1474.56 Kbps, upload 675 Kbps, CPU
  slowdown 4x. The page loads unthrottled and Lighthouse's Lantern model
  estimates the timings from the recorded network and CPU graph.
- Server: `next start` on the Turbopack production build, seeded with the
  synthetic cast and CI's test-only settings (`TIDEFERN_FAKE_NOW=2026-10-05`),
  on 127.0.0.1. Responses are gzip compressed by `next start`.
- Routes: `/`, `/privacy`, `/sign-in`, `/design` signed out; `/today` as
  Noor and as Mira, `/calendar`, `/sharing` and `/settings` as Noor,
  `/family` as Pia. The script signs each persona in once through
  `POST /api/auth/sign-in/email` and sends the session cookie with
  `--extra-headers`. Lighthouse saves each report with a copy of that
  header, also on a run that ends in a runtime error and a nonzero exit, so
  the script rewrites every report Lighthouse leaves with the header
  replaced by `[redacted]` as soon as Lighthouse exits, before the run
  counts as passed or failed. It deletes a report it cannot read or that
  still contains a cookie value, scrubs cookie values from error text, and
  refuses a run that ended on another path. Signed-in routes run only
  against a loopback server.
- Runs: three per route; the table shows the run Lighthouse's own
  `computeMedianRun` picks (closest to the median FCP and TTI). A run
  with no FCP or TTI value is left out of the median and listed as a
  failure.
- Script transfer: the sum of `transferSize` over every request of
  resource type `Script` in the navigation's network records, so it is the
  compressed bytes on the wire for the first load. Total transfer is
  Lighthouse's `total-byte-weight`.
- Machine: AMD Ryzen AI 9 HX 370 (24 threads), 94 GB, Linux 7.2.8 x64
  (Bazzite), Node 26.7.0. Other builds shared the machine during the run:
  Lighthouse's benchmark index ranged from 362 to 4006 across the 30 runs,
  which shows in the timing spread below.

Rerun with a seeded production server on a spare port:

```sh
pnpm --filter web perf:lighthouse http://127.0.0.1:3252
pnpm --filter web perf:analyze   # webpack composition, see Bundle findings
pnpm --filter web perf:test      # unit tests for the helpers (also part of the web test script)
```

JSON reports and `summary.md` land in `apps/web/perf-reports/<timestamp>/`,
which is gitignored.

## Results

Median run of three. "(over)" marks a missed budget.

| Route     | Persona    | Score | LCP           | CLS   | TBT    | Total transfer | Script transfer (compressed) |
| --------- | ---------- | ----- | ------------- | ----- | ------ | -------------- | ---------------------------- |
| /         | signed out | 92    | 3.27 s (over) | 0.000 | 24 ms  | 524.1 KB       | 163.9 KB in 10 files         |
| /privacy  | signed out | 91    | 3.54 s (over) | 0.000 | 46 ms  | 534.5 KB       | 168.7 KB in 10 files         |
| /sign-in  | signed out | 84    | 4.45 s (over) | 0.008 | 88 ms  | 550.1 KB       | 191.7 KB in 12 files         |
| /design   | signed out | 89    | 3.70 s (over) | 0.000 | 59 ms  | 535.9 KB       | 168.7 KB in 10 files         |
| /today    | Noor       | 67    | 5.33 s (over) | 0.059 | 486 ms | 705.4 KB       | 339.1 KB in 16 files (over)  |
| /today    | Mira       | 76    | 5.06 s (over) | 0.055 | 239 ms | 702.5 KB       | 339.1 KB in 16 files (over)  |
| /calendar | Noor       | 74    | 3.62 s (over) | 0.000 | 656 ms | 720.2 KB       | 361.9 KB in 16 files (over)  |
| /family   | Pia        | 76    | 5.24 s (over) | 0.038 | 237 ms | 691.9 KB       | 333.7 KB in 15 files (over)  |
| /sharing  | Noor       | 85    | 3.84 s (over) | 0.000 | 217 ms | 710.2 KB       | 352.2 KB in 17 files (over)  |
| /settings | Noor       | 84    | 4.46 s (over) | 0.000 | 58 ms  | 613.2 KB       | 250.9 KB in 14 files (over)  |

Spread across the three runs (lowest to highest):

| Route              | Score    | LCP              | TBT                |
| ------------------ | -------- | ---------------- | ------------------ |
| /                  | 88 to 92 | 3.27 to 3.85 s   | 24 to 50 ms        |
| /privacy           | 88 to 91 | 3.54 to 3.84 s   | 37 to 53 ms        |
| /sign-in           | 84 to 85 | 4.45 to 4.45 s   | 40 to 94 ms        |
| /design            | 78 to 91 | 3.54 to 4.61 s   | 19 to 266 ms       |
| /today (Noor)      | 54 to 73 | 5.08 to 5.57 s   | 325 to 1124 ms     |
| /today (Mira)      | 50 to 80 | 5.06 to 5.65 s   | 133 to 2158 ms     |
| /calendar          | 54 to 79 | 3.62 to 4.92 s   | 190 to 3528 ms     |
| /family            | 56 to 76 | 5.22 to 5.28 s   | 237 to 1321 ms     |
| /sharing           | 81 to 89 | 3.39 to 4.30 s   | 180 to 245 ms      |
| /settings          | 84 to 93 | 3.17 to 4.46 s   | 26 to 100 ms       |

Byte counts were identical in every run of a route; the timings were not.

## Budgets

### Initial transfer: met

The heaviest first load is `/calendar` at 720 KB, under half the 1.5 MB
budget. Fonts are the largest single part on every route: the four
preloaded WOFF2 files weigh 240 KB together (Newsreader optical-size
roman 132 KB, Newsreader italic 64 KB, Figtree roman 20 KB, Figtree
italic 21 KB).

### First-route JavaScript: met signed out, missed signed in

Signed out, the framework and React make up nearly all of it (164 KB on
`/`); `/sign-in` adds the auth client and WebAuthn (192 KB). Signed in,
two chunks push it past the budget:

- Zod, 100.1 KB compressed (418.6 KB uncompressed) in one chunk, on
  `/today`, `/calendar`, `/family` and `/sharing`. Client
  components import constants and labels (`SYMPTOM_LABELS`, `FlowLevel`,
  `MoodCode`, `TERMS_VERSION` and others) from `@tidefern/schemas`; its
  modules build Zod schemas at the top level and the package does not
  declare `sideEffects: false`, so every schema and Zod itself ship. The
  schemas import `{ z } from "zod"`, the namespace object, and Turbopack
  keeps all of `zod/v4/locales` with it: about 219 KB of the Zod code
  is locale messages the app never uses.
- `@tidefern/core`, 44.3 KB compressed (107.4 KB uncompressed), on every
  signed-in route measured. Client
  components import date helpers (`addDays`, `compareDates`,
  `isCalendarDate`) from the package root, which pulls in the WHO and
  CDC growth tables (`growth-data.json`, 88 KB source) and the CDC
  milestone checklists (17 KB) on every app route, not only the child
  pages that chart them.

`/calendar` adds react-day-picker and date-fns (23.5 KB compressed);
`/settings` and `/sharing` add the auth client and WebAuthn.

Measured experiment, not committed: with `"sideEffects": false` in the
`package.json` of `@tidefern/core` and `@tidefern/schemas`, the core
chunk drops away and script transfer falls by 49 to 52 KB (`/today`
339.1 to 290.0 KB, `/calendar` 361.9 to 309.8 KB, `/family` 333.7 to
281.4 KB). Zod stays, because the schemas themselves are still imported.
Removing the Zod chunk from client routes as well (100.1 KB) would bring
`/today` to about 190 KB and `/family` to about 181 KB; `/calendar`
(about 210 KB), `/sharing` (about 202 KB) and `/settings` (about 207 KB,
no Zod there, only the core fix applies) would still sit just over and
need a closer look.

### LCP: missed on every route

In Lantern's estimate, the LCP time grows with every byte requested
before the LCP paint, weighted toward high-priority requests. The four
fonts are preloaded at high priority on every route, and the scripts
follow. Three things stand out:

- Fonts. Measured experiment, not committed: with the two italic faces
  removed (85 KB less preloaded), LCP fell from 3.54 to 2.95 s on `/`,
  3.46 to 3.02 s on `/privacy` and 3.39 to 2.79 s on `/settings`. Still
  over budget, but the largest single lever. The Figtree italic is not
  used by any style in `apps/web/src` (the estimate sentence, the only
  italic in the product per `TYPOGRAPHY.md`, is Newsreader).
- Streaming. On `/today`, `/family` and `/sign-in` the LCP element (a
  fact line, a summary line, the button label) paints after
  DOMContentLoaded, once the streamed content or the client form arrives,
  so its estimate includes the whole script graph. Their LCP is the
  highest (4.45 to 5.33 s).
- The home hero. On `/` the LCP element is the 200 px brand mark
  (`/brand/tidefern-mark.svg`, 12 KB), fetched at low priority.

CLS stays at or under 0.059 everywhere; the one shift Lighthouse names
on `/today` and `/family` is the footer policy line moving down when the
streamed content arrives.

## Bundle findings

Next 16 builds with Turbopack. `@next/bundle-analyzer` only sees webpack
builds (its own code warns and does nothing under Turbopack), so the
analysis uses both tools the installed Next documents
(`node_modules/next/dist/docs/01-app/02-guides/package-bundling.md`):

- `next experimental-analyze --output` (Turbopack, the production
  bundler) for the route views. Its data files are binary and meant for
  the bundled viewer, so this was read in the viewer, not scripted. For
  `/today` it shows Zod at 398 KB uncompressed, 219 KB of it locales,
  and `packages/core` at 130 KB with `growth-data.json` at 110 KB.
- `@next/bundle-analyzer` for a scripted per-route breakdown:
  `pnpm --filter web perf:analyze` runs
  `ANALYZE=true ANALYZE_MODE=json next build --webpack --experimental-build-mode=compile`
  into `.next/analyze-webpack` and prints, per key route, the initial
  chunks and the packages inside them. The analyzer is wired in
  `apps/web/next.config.ts` only when `ANALYZE=true`; without it the
  config is the same object as before and the production build is
  untouched. Compile mode skips prerendering, which fails under webpack on
  `/design/tokens.css` (a URL path argument the Turbopack build accepts).

The webpack build is a different bundle: its framework chunks come to
about 241 KB compressed on the signed-out routes against 164 KB from
Turbopack, and it tree-shakes Zod's locales that Turbopack keeps. Use it
for composition, not for budget numbers. On `/today` it attributes the
initial chunks to Next (59 percent of source bytes), React DOM (16), Zod
(11), the app's own code (6), `@tidefern/core` (4) and
`@tidefern/schemas` (2).

## Proposed fixes

Outside this task's files; each needs a decision from the lead.

1. Add `"sideEffects": false` to `packages/core/package.json` and confirm
   no module in the package relies on import side effects. What was
   measured: the flag in both `@tidefern/core` and `@tidefern/schemas`
   together, on `/today`, `/calendar` and `/family` only, gave minus 49 to
   52 KB script (see the experiment above). Core alone was not measured,
   nor were `/settings` and `/sharing`; the drop came from the core chunk
   leaving while Zod stayed, so most of it is expected from the core flag,
   but rerun this script after the change to get the real number.
2. Keep Zod out of client routes: move the constants, labels and types
   that client components use into a Zod-free module of
   `@tidefern/schemas` with its own export path (or mark the package
   side-effect free once constants and schemas live in separate files),
   and import `* as z from "zod"` so unused parts such as the locales can
   be dropped where Zod is still needed. Estimated minus 100 KB on
   `/today`, `/calendar`, `/family` and `/sharing`.
3. Fonts: stop preloading the italic faces, or drop the Figtree italic
   that no style uses (measured with both italics removed: minus 85 KB
   and 0.4 to 0.6 s LCP). This touches the typography decision in
   section 13.5 and `ASSETS.md`.
4. Give the home hero mark `fetchpriority="high"` and look at whether the
   streamed routes can paint their headline before the data arrives.

## Dependency side effect of the tooling

Adding Lighthouse brought `@opentelemetry/api@1.9.1` into the install
tree (through its `@sentry/node` and `@opentelemetry/core` chain). On
`main` the lockfile only declares it as an optional peer of other
packages and installs no copy. With a copy present, pnpm now resolves the
optional peer of `next@16.3.8`, `better-auth@1.7.7`, `drizzle-orm@0.45.3`
and `vitest` against it, and Vercel installs dev dependencies for the
build, so the production server resolves it too.
`next/dist/server/lib/trace/tracer.js` requires `@opentelemetry/api`
first and falls back to its compiled copy (1.6.0) only when that fails, so
the server now loads the external 1.9.1 module.

What this changes at runtime, as far as the code shows: nothing the app
does. `apps/web/src/instrumentation.ts` defines only `onRequestError` and
no file registers an OpenTelemetry SDK, so every tracer is the API's
no-op proxy. Both copies keep their registry on the same global key
(`Symbol.for("opentelemetry.js.api.1")`), so a provider registered later
by anything would be seen the same way by either copy. What changes is
which module file is resolved and traced into the server output. Keeping
it out of the production graph would need a pnpm peer setting in
`pnpm-workspace.yaml`, outside this task's files; that is a request for
the lead.

## A performance gate

Not added in this task. Byte budgets would make a stable gate: script and
total transfer were identical across runs, so a per-route check of
compressed script bytes from the Lighthouse network records (or from the
build output) with about 5 percent headroom would not flap. Timing
metrics would not: on this shared machine TBT on one route ranged from
133 to 2158 ms and the score from 50 to 80. LCP, TBT or the score could
only be gated on a dedicated runner, with five or more runs per route and
a threshold well above the median.

## J2b: the fixes, measured

Measured 2026-10-09 (UTC) by task J2b. The lead approved the four proposed
fixes above; each landed as its own commit and each commit was built and
measured in turn, so every row below is one build on the same machine,
the same day, with the same method as J2 (Lighthouse 13.5.0, Chrome for
Testing 153.0.8010.12 headless, mobile form factor, simulated throttling,
`next start` on the seeded Turbopack production build with
`TIDEFERN_FAKE_NOW=2026-10-05`, three runs per route, Lighthouse's
`computeMedianRun`). Other builds shared the machine: the benchmark index
ranged from 2405 to 4481 across the 180 runs. The base was rerun first so
the comparison does not lean on another day's timings; its byte counts
match J2's exactly and its timings fall inside J2's spread.

These are still lab numbers from one machine against a local server. They
prove nothing about field performance: no real phone, network, cache state
or person produced them.

### What changed

| Step | Commit | Change |
| ---- | ------ | ------ |
| Base | `c1e8032` | `main` after J2 |
| 1 | `8323e8d` | `"sideEffects": false` in `packages/core/package.json` |
| 2 | `6a4ba09` | `@tidefern/schemas/constants`, the Zod-free entry; client imports moved to it; `import * as z from "zod"` in the schema modules; the client-graph guard test |
| 3 | `de8c5be` | Only the roman faces preloaded; the Newsreader italic in its own `next/font/local` call with `preload: false`; the Figtree italic removed |
| 4 | `92695d1` to `50ce08b` | The hero mark at high priority (three commits; see fix 4) |

Fix 1: every module in `packages/core/src` was read for import side
effects with a TypeScript AST pass over the top-level statements: constant
declarations, one `new Set`, one `Object.keys`, one `.map` over the bundled
milestone JSON and nothing that registers, mutates a global or polyfills.
The flag goes on the package as a whole; no `sideEffects` array was needed.

Fix 2: `@tidefern/schemas` itself is not marked side-effect free, and
should not be: its schemas call `.meta({ id })`, which registers each one
in Zod's global registry for the OpenAPI emitter, a side effect of
importing the module. The constants entry holds no schema, imports only
types, and is re-exported by the schema modules, so the root entry's
public surface is unchanged (a schemas test checks every constant is the
same binding from both entries) and `openapi/v1.json` did not change. The
two client checks that used a Zod schema (`InvitationInput.inviteeEmail`
and `InvitationAcceptInput.token`) now use plain functions with the same
pattern and length, which the schemas then use too; a test compares each
function with its schema over valid and invalid samples and pins the
address pattern to the installed Zod's `z.regexes.email`.
`apps/web/src/lib/client-bundle.test.ts` walks the module graph from every
`"use client"` file through relative and `@/` imports and fails on any
import of `zod` or of the `@tidefern/schemas` root entry that is not a
declaration-level `import type` (an inline `import { type X }` can still
compile to a bare import that evaluates the module). Run against the
pre-J2b `flow-scale.tsx`, it fails and names the file.

Fix 3: no style in `apps/web/src` sets Figtree in italic. The one
`font-style: italic` is the `.estimate` class, in Newsreader; there is no
`<em>`, `<cite>`, `<dfn>`, `<var>`, `<address>` or text-bearing `<i>`,
and no italic utility class. The captures below show the estimate sentence
in the Newsreader italic as before.

Fix 4 took three commits, because the first did nothing measurable and
the reports showed why. Step one gave the hero's two `<img>` elements
(one per theme) `loading="lazy"` and `fetchpriority="high"`, the theme
image pattern the installed Next docs give. The request still went out at
Low: the header's 36 px mark uses the same file, comes first in the
document, and React emits a low-priority `<link rel="preload" as="image">`
for every eager image in the shell, so the hero shared that request. Step
two added a React `preload()` per system theme with `fetchpriority` high,
which React deduped against its own earlier preload. Step three makes
every mark variant lazy: React emits no preload for a lazy image, a hidden
lazy image is never fetched, and the hero's preload is then the request.
After it, the mark loads at High from the head (Lighthouse's "fetchpriority
should be applied" check passes) and every route downloads one mark file
instead of two, 12 KB less. A viewer whose chosen theme differs from her
system's still fetches one 12 KB file the page does not show, since the
media-matched preload sits in the head. The mark she does see is covered
by the inline preference script in the root layout: on `/`, when the
stored theme differs from the system theme, it appends a high-priority
preload for the shown variant before the body parses, so her hero mark
no longer waits for layout to find a lazy image (review answer, J2b).

The streamed signed-in routes: `/family`, `/journey`, `/activity` and the
child page already render their heading (or, for the child page, the way
back) in `loading.tsx` before the data, so nothing changes there. `/today`
cannot: its heading is the date (`me.today`) and sits inside a different
structure in each of its six hero variants (cycle, empty, quiet,
pregnancy, shared, failed). Rendering it before the data would mean a
Suspense boundary inside the page around everything but the heading and a
skeleton per variant that holds the heading in the same place, or one
layout for the heading shared by all six; neither is small, and the LCP
element on `/today` is the fact line, not the heading, so it would not move
LCP. `/calendar`, `/sharing` and `/settings` have no `loading.tsx` and are
not streamed: their first HTML already carries the page.

### Script transfer per step (compressed, first load)

Byte counts were identical in every run of a route. "(over)" is over the
200 KB budget.

| Route | Persona | Base (J2) | 1 core | 2 Zod | 3 fonts | 4 hero (head) | Change |
| ----- | ------- | --------- | ------ | ----- | ------- | ------------- | ------ |
| / | signed out | 163.9 KB | 163.9 | 163.9 | 163.9 | 164.0 | 0 |
| /privacy | signed out | 168.7 KB | 168.7 | 168.7 | 168.7 | 168.8 | 0 |
| /sign-in | signed out | 191.7 KB | 191.7 | 191.7 | 191.7 | 191.8 | 0 |
| /design | signed out | 168.7 KB | 168.7 | 168.7 | 168.7 | 168.8 | 0 |
| /today | Noor | 339.1 KB (over) | 295.1 (over) | 196.4 | 196.4 | 196.7 | minus 142.4 KB, met |
| /today | Mira | 339.1 KB (over) | 295.1 (over) | 196.4 | 196.4 | 196.7 | minus 142.4 KB, met |
| /calendar | Noor | 361.9 KB (over) | 317.9 (over) | 219.2 (over) | 219.2 (over) | 219.5 (over) | minus 142.4 KB, missed by 19.5 KB |
| /family | Pia | 333.7 KB (over) | 289.8 (over) | 191.2 | 191.2 | 191.5 | minus 142.2 KB, met |
| /sharing | Noor | 352.2 KB (over) | 308.2 (over) | 209.6 (over) | 209.6 (over) | 209.8 (over) | minus 142.4 KB, missed by 9.8 KB |
| /settings | Noor | 250.9 KB (over) | 206.9 (over) | 206.9 (over) | 206.9 (over) | 207.1 (over) | minus 43.8 KB, missed by 7.1 KB |

Fix 1 took 44.0 KB off every signed-in route (the core chunk with the
growth and milestone tables left), a little less than J2's estimate of 49
to 52 KB for both flags together. Fix 2 took 98.7 KB off every route that
imported a label (Zod and the schemas left); `/settings` imported none.
The webpack analysis at head (`pnpm --filter web perf:analyze`) lists
neither `zod` nor `@tidefern/core` in any key route's initial chunks;
`@tidefern/schemas` appears at 12.4 KB of source, the constants entry's
catalogs. The 0.1 to 0.3 KB growth at step 4 is the mark's priority and preload code.

### Total transfer per step

| Route | Persona | Base | 1 core | 2 Zod | 3 fonts | 4 hero (head) |
| ----- | ------- | ---- | ------ | ----- | ------- | ------------- |
| / | signed out | 524.0 KB | 524.1 | 524.1 | 439.1 | 427.7 |
| /privacy | signed out | 534.5 KB | 534.5 | 534.5 | 449.7 | 437.9 |
| /sign-in | signed out | 550.1 KB | 550.1 | 550.1 | 465.2 | 453.4 |
| /design | signed out | 535.9 KB | 535.9 | 535.9 | 451.0 | 437.9 |
| /today | Noor | 705.4 KB | 661.5 | 562.7 | 541.4 | 517.8 |
| /today | Mira | 702.5 KB | 658.6 | 559.8 | 474.9 | 451.3 |
| /calendar | Noor | 720.2 KB | 676.2 | 577.4 | 556.1 | 532.5 |
| /family | Pia | 691.9 KB | 647.9 | 549.2 | 464.4 | 440.7 |
| /sharing | Noor | 710.2 KB | 666.2 | 567.5 | 482.7 | 459.0 |
| /settings | Noor | 613.2 KB | 569.2 | 569.2 | 484.3 | 460.7 |

Fonts went from 234 KB on every route to 150 KB transferred (the two roman
files, 152,156 bytes on disk; a KB here is 1,024 bytes of transfer size),
plus the 64 KB italic only where a page sets the estimate sentence: on
`/today` for Noor and on `/calendar`, not on `/today` for Mira (no
prediction yet) or anywhere else measured. Step 4's 11 to 24 KB is the
second mark file no longer fetched.

### LCP per step

Median run (Lighthouse's pick, closest to the median FCP and TTI, so not
always the middle LCP), with the range of the three runs. Budget 2.5 s;
every value below is over it.

| Route | Persona | Base | 1 core | 2 Zod | 3 fonts | 4 hero (head) |
| ----- | ------- | ---- | ------ | ----- | ------- | ------------- |
| / | signed out | 3.85 s (3.54 to 3.85) | 3.55 | 3.85 | 3.39 | 3.31 s (3.01 to 3.31) |
| /privacy | signed out | 3.54 s (3.54 to 3.92) | 3.47 | 3.54 | 2.93 | 2.93 s (2.93 to 2.94) |
| /sign-in | signed out | 4.36 s (4.36 to 4.37) | 4.38 | 4.38 | 3.84 | 3.83 s (3.76 to 3.83) |
| /design | signed out | 3.54 s (3.54 to 3.54) | 3.53 | 3.53 | 2.93 | 2.93 s (2.93 to 2.93) |
| /today | Noor | 5.06 s (5.04 to 5.06) | 4.81 | 4.29 | 4.65 | 4.66 s (4.54 to 4.67) |
| /today | Mira | 5.05 s (5.05 to 5.06) | 4.82 | 4.30 | 4.25 | 4.22 s (4.21 to 4.22) |
| /calendar | Noor | 4.39 s (3.32 to 4.39) | 4.16 | 3.69 | 3.16 | 3.46 s (3.46 to 3.46) |
| /family | Pia | 5.21 s (5.21 to 5.21) | 4.92 | 4.32 | 3.54 | 3.46 s (3.46 to 3.51) |
| /sharing | Noor | 3.09 s (3.09 to 4.75) | 3.69 | 3.39 | 2.56 | 3.01 s (3.01 to 3.46) |
| /settings | Noor | 2.57 s (2.57 to 3.39) | 3.77 | 3.76 | 2.64 | 2.71 s (2.71 to 2.71) |

CLS did not change at any step (0 to 0.059, the same values as J2 per
route; the `/today` and `/family` shift is still the footer line moving
down when the streamed content arrives). TBT stayed under 135 ms on every
median run at head.

What each fix did to LCP, read with the run spread in mind (the same
build moved by 0.4 to 1.7 s between runs on some routes):

- Fixes 1 and 2 helped the streamed routes, whose LCP waits on the script
  graph: `/today` 5.06 to 4.29 s, `/family` 5.21 to 4.32 s. Elsewhere the
  changes sit inside the spread.
- Fix 3 is the largest lever on the routes without the estimate sentence,
  as J2 measured: minus 0.5 to 0.8 s on `/privacy`, `/design`, `/sign-in`
  and `/family`; `/today` for Mira barely moved (4.30 to 4.25 s), her LCP
  waiting on the streamed empty state rather than on fonts. On `/today` for Noor it costs 0.37 s
  (4.29 to 4.66 s at head). Her page sets the estimate sentence, so the
  italic is still downloaded, but now late: the browser discovers it when
  the streamed hero arrives, about 540 ms into the observed load, where the
  old preload started with the roman fonts at about 185 ms, and Lantern counts that late high-priority
  request into the LCP estimate even though the LCP element (the fact
  line) is roman. With `display: swap` a real browser paints the sentence
  in the adjusted fallback first, so the lab cost probably overstates the
  field one; that is a reading of the model, not a measurement. `/calendar`
  sets the sentence too and moved the other way (3.69 to 3.16 s at step 3).
  A per-route preload was tried and dropped: declaring the italic again in
  a module that only `/today` imported made Next preload it on every
  signed-in route (`/settings` included) under a second file name, so it
  would have downloaded twice on the pages that set the sentence.
- Fix 4: on `/` the LCP element is the hero mark. Its request is now High
  and starts at 96 ms with the fonts; the LCP breakdown at head is 83 ms to
  first byte, 13 ms load delay, 26 ms load and 39 ms render delay in the
  observed load, so the simulated 3.0 to 3.3 s is the page's render-blocking
  CSS and fonts under throttling, not the image. The step 3 and step 4 runs
  of `/` (2.93 to 3.39 s both) do not separate.

### Budgets at head

| Budget | Signed-out routes | Signed-in routes | Remaining cause |
| ------ | ----------------- | ---------------- | --------------- |
| Initial transfer, 1.5 MB | Met (428 to 453 KB) | Met (441 to 533 KB) | None |
| First-route JavaScript, 200 KB | Met (164 to 192 KB) | Met on `/today` (196.7 KB) and `/family` (191.5 KB); missed on `/calendar` (219.5 KB), `/sharing` (209.8 KB), `/settings` (207.1 KB) | `/calendar`: react-day-picker and date-fns (about 23.5 KB compressed, J2's measure). `/sharing` and `/settings`: the better-auth client and `@simplewebauthn/browser` (43.7 and 27.2 KB of source in the webpack analysis), loaded up front for the passkey and fresh sign-in controls |
| LCP, 2.5 s | Missed (2.93 to 3.83 s) | Missed (2.71 to 4.66 s) | Render-blocking CSS and the two preloaded roman fonts (150 KB) on every route; on the streamed routes (`/today`, `/family`) the LCP text arrives with the streamed content, after the script graph |
| CLS, 0.1 | Met (0 to 0.008) | Met (0 to 0.059) | None |

Closing the JavaScript gap would mean loading the auth client and WebAuthn
only when a passkey or fresh sign-in control is used (a dynamic import on
`/settings` and `/sharing`) and the day picker's locale and formatting
code more narrowly on `/calendar`; both are outside this task. LCP would
need the CSS split per route group or inlined for the first paint, a
smaller roman Newsreader (the 132 KB optical-size build is the largest
request on every route), or both, and a decision on 13.5's optical-size
choice; also outside this task.

### Proposed byte-budget gate (not added)

Byte counts were identical across every run of a route in both J2 and
J2b, so a gate on them would not flap. The proposal: a check that reads
the Lighthouse network records (or the build's route manifest) for the
key routes and fails when a route's compressed script transfer exceeds its
ceiling. Ceilings at head plus about 5 percent, rounded up, except where
the architecture budget is lower:

| Route | Persona | Script at head | Ceiling | Total at head | Ceiling |
| ----- | ------- | -------------- | ------- | ------------- | ------- |
| / | signed out | 164.0 KB | 173 KB | 427.7 KB | 450 KB |
| /privacy | signed out | 168.8 KB | 178 KB | 437.9 KB | 460 KB |
| /sign-in | signed out | 191.8 KB | 200 KB | 453.4 KB | 477 KB |
| /design | signed out | 168.8 KB | 178 KB | 437.9 KB | 460 KB |
| /today | Noor | 196.7 KB | 200 KB | 517.8 KB | 544 KB |
| /today | Mira | 196.7 KB | 200 KB | 451.3 KB | 474 KB |
| /calendar | Noor | 219.5 KB | 231 KB | 532.5 KB | 560 KB |
| /family | Pia | 191.5 KB | 200 KB | 440.7 KB | 463 KB |
| /sharing | Noor | 209.8 KB | 221 KB | 459.0 KB | 482 KB |
| /settings | Noor | 207.1 KB | 218 KB | 460.7 KB | 484 KB |

The three routes over the 200 KB budget get ratchet ceilings, not
budget ceilings, so the gate stops growth without failing on day one; each
ceiling drops to 200 KB when its route gets there. `/today`, `/family` and
`/sign-in` sit within 9 KB of the budget, so the next client dependency on
them would fail the gate, which is the point. Running it needs the seeded
server, so it belongs in CI's `verify` job after the browser suite, not in
`pnpm check`. Timing metrics stay out of any gate for the reasons in "A
performance gate" above.

### The byte-budget gate

Added by task J3d: CI's `verify` job runs `pnpm --filter web perf:bytes`
against the seeded server right after the browser suite, and fails with the
route, the number and the ceiling when a key route's compressed script
transfer or total transfer is over its ceiling. The ceilings are the table
above, kept in `apps/web/scripts/perf/budgets.json` (KB of 1,024 bytes).
To lower a ceiling, edit that file in the same pull request that made the
route smaller; a script ceiling above 200 drops to 200 once its route gets
there. Raising one needs a reason recorded here.

It reads bytes without Lighthouse: each route loads once in a fresh
Playwright Chromium context (the full browser, not the headless shell, so
the favicon is fetched as a person's browser would) with Lighthouse's
mobile screen, and the DevTools network events give each request's
`encodedDataLength`, the same transfer size Lighthouse reports. That is
one browser for all ten routes and no simulated timings, about 30 seconds
locally. Script transfer matches Lighthouse to 0.1 KB on every route.
Total transfer comes out 29 to 32 KB under Lighthouse's, because
Lighthouse also fetches `/icon.svg` a second time and the web manifest for
its own checks; so the total ceilings carry 11 to 14 percent headroom
rather than 5.

Three runs on the same build and seed gave the same script bytes to the
byte on every route. Total transfer moved by at most 103 bytes between
runs, because each HTML document and RSC payload carries a fresh CSP nonce
that compresses a little differently each time; against ceilings 50 KB or
more above the measured totals, that cannot change a verdict.
