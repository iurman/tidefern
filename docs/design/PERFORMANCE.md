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
