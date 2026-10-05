# Build progress

Append-only log. Newest entry last. Each entry records the date, the agent,
what changed, the commands and their results, decisions with reasons, open
findings and the next concrete action. Resume from the last entry and
`git status`.

## Owner actions pending (kept current by the lead; details in the newest entry)

1. Vercel connector: the MCP connection is authorized for the personal scope
   only and answers 403 for the `iurman's projects` team. Re-authorize it at
   team scope so A2, A4 and the deployment checks can use it. Until then the
   lead uses the logged-in Vercel CLI (`--scope iurmans-projects`) for
   read-only inspection.
2. Rotate the Protection Bypass for Automation value in the Vercel project
   (Settings, Deployment Protection) and store the new value with
   `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`; the current value sat in
   a plaintext repository variable until 2026-10-04.
3. Set a Vercel usage alert and record the team plan on task A2 (stated as
   Pro; not readable through the connector).

## 2026-10-04, session_019bNAugBr36XyCFxfiZJ2Xv (foundation)

Started from the empty repository (commit `32e1123`, README only).

### Done

- Analyzed both source architecture memos and recorded the comparison in
  `docs/research/SOURCE_ANALYSIS.md`. Ran an eight-dimension research
  sweep with per-dimension skeptic verification; findings and verified
  snippets in `docs/research/RESEARCH.md`.
- Vendored the Not a Robot skills (`humanize-writing`, `humanize-code`,
  `voice-profile`) and the `site-build` skill into `.agents/skills/`, with
  links in `.claude/skills/`, credits and licenses in `.agents/vendor/`.
  `install.sh --validate` logic reports all four skills conform to the
  Agent Skills spec.
- Scaffolded the pnpm + Turborepo monorepo: `apps/web` (Next.js 16.3.8,
  React 19.2.8, Tailwind 4.3.3, TypeScript 6.0.3), `packages/api` (Hono
  4.13.13, `@hono/zod-openapi` 1.6.3, Zod 4.6.5), `packages/core`,
  `packages/schemas`, `packages/design-tokens`, `packages/config`.
- Web shell: tokens generated to CSS for light and dark, system-preference
  default with a remembered choice applied before paint, self-hosted
  Newsreader and Figtree with OFL licenses, a vector reconstruction of the
  brand mark (light, dark, icon), the home page, the `/design` overview with
  live token tables and JSON and CSS exports, 404 and error pages, manifest,
  robots and sitemap gated on `SITE_INDEXABLE` and production.
- Sound and touch: synthesized Web Audio cues (hover, press, toggle,
  success, error) through one delegated `SoundProvider`, unlock on the
  first gesture, `navigator.vibrate` on touch, persistent mute in the
  header.
- API: the Hono app mounted at `/api/[[...route]]` with base path `/api`,
  `GET /api/v1/health`, `GET /api/v1/openapi.json` (OpenAPI 3.1), RFC 9457
  problem details, `private, no-store` on every response, security headers;
  `openapi/v1.json` committed with a drift gate.
- Core: calendar date helpers with time zone aware "today", cycle
  prediction with plausibility filtering and irregularity, Naegele's rule
  and gestational age, and the `can()` policy; 19 unit tests.
- CI: `ci.yml` (prose gate, generated-file freshness, format, lint, types,
  unit tests, production build, Playwright with axe), `deploy-verify.yml`
  (smoke test on every successful Vercel deployment with the protection
  bypass header), `codeql.yml`, Renovate, pull request template.
- Documents: `docs/ARCHITECTURE.md` (22 sections), `docs/BUILD_PROMPT.md`,
  `docs/BUILD_PLAN.md`, `docs/KICKOFF_PROMPT.md`, `docs/LAUNCH_RUNBOOK.md`,
  `AGENTS.md`, `CLAUDE.md`, `humanize.md`, `.env.example`, `README.md`.

### Commands and results

| Command                             | Result                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | 395 packages, pnpm 10.34.6, Node 22.22 locally (Node 24 is the target; a local engine warning is expected) |
| `pnpm check`                        | prose gate, tokens, OpenAPI, lint, typecheck, 23 unit tests, production build: all green                   |
| `pnpm test:e2e`                     | 8 Playwright cases green, including axe in both themes and 320 px reflow                                   |
| `node apps/web/scripts/capture.mjs` | screenshots of `/` and `/design` in both themes at 1440 and 390 px, inspected                              |

### Decisions made during the foundation

- ESLint: the web app stays on 9.39.5 because `eslint-config-next` 16.3.8
  pulls `eslint-plugin-react`, which crashed under ESLint 10 here
  (`getFilename is not a function`). Workspace packages use 10.12.0.
- Imports inside workspace packages carry no `.js` extension; Turbopack did
  not resolve `./app.js` to `./app.ts` in Just-in-Time packages.
- The route handler exports `maxDuration = 60` and no `dynamic` export,
  per the Next.js 16.3.8 route conventions.
- The API base path is `/api` (not `/api/v1`) so Better Auth can mount at
  `/api/auth/*` beside the versioned contract.
- The `openapi/v1.json` servers entry is `/` because the document's paths
  already carry the `/api/v1` prefix.
- Theme defaults to the system preference with a remembered explicit choice
  (reasons in `docs/ARCHITECTURE.md` section 13.4).

### Open findings

- The brand mark is a reconstruction pending the owner's approval or
  original vectors.
- The Playwright Chromium build (1243) had to be downloaded; machines with
  a preinstalled browser can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Vercel project and Neon project are not created yet (owner actions in
  `docs/LAUNCH_RUNBOOK.md`).

### Next action

Stage 0 of `docs/BUILD_PROMPT.md`: intake by the Phase 1 lead, task A1.

## 2026-10-04, same session (adversarial review outcomes)

Six independent critics reviewed the architecture record, build prompt,
plan and runbook. Accepted findings and what changed:

- Security: Neon console roles join `neon_superuser` and bypass RLS, so
  the app role is now created by the first migration and the app connects
  as that role (section 7.2); crypto-shredding was overstated while a
  weekly dump existed, so Phase 1 has no logical dump and keys live in
  `subject_keys` (sections 9.2, 19); the CSP now issues a per-request
  nonce with `strict-dynamic` through `apps/web/src/proxy.ts` and the
  browser suite asserts it; idempotency never stores response bodies;
  children have their own keys and grants carry `child_id` (code and
  tests updated); the inline outbox drain goes through a `defer` callback
  so the API never imports Next.js (code updated); fresh authentication,
  recovery, invitation semantics, cross-site checks, HMAC logging, the
  cron endpoint moved under `/api/internal` and failing closed, retention
  rules and processor notification on deletion were added.
- Buildability: the claim protocol now serializes on `origin/main`, open
  pull requests and remote branches; Stage 3's order matches the plan's
  `Needs`; the missing root scripts are named in the rows that create
  them; `pnpm check` runs the same gates as CI; Stage 0 names the
  Playwright install and the criteria for A2 and A3; preview databases
  come from Neon's Vercel integration instead of a GitHub Action; the KEK
  variable has one name; acceptance criteria were added to every product
  screen row; J7 (restore rehearsal) was added.
- Mobile portability: the `/api` prefix is permanent (the `basePath`
  option was removed; the split-out path keeps the paths); controlled
  vocabularies are closed enums in `packages/schemas`; problem types are
  URNs with a closed code list including `conflict` and
  `upgrade_required`; Better Auth derives its base URL on previews and
  trusts the preview origin pattern; sync readiness now means optional
  client ids, `version`, content-free tombstones and `updatedSince`; the
  API client takes an injectable fetch so server components call the
  mounted app in process; `GET /api/v1/me`, well-known app-link files and
  the mobile plugins are reserved.
- Design research: the `/design` reference adopts truth-from-the-running
  document, role triples, the empty-state formula, a two-easing motion
  contract, Nord's calendar semantics and a no-vendoring rule for gallery
  code.

Checks after the changes: `pnpm check` green (25 unit tests), 9 browser
tests green including the nonce assertion and the audio activation test.
Remaining critics and the research verification pass are recorded below as
they land.

### Review outcomes, part 2 (2026-10-04)

- Design system and brand critic: tokens now carry a kind and the surfaces
  they sit on; `pnpm tokens:contrast` measures all 96 pairings and gates
  `pnpm check` and CI; light accent, success and danger were darkened to
  pass; the stylesheet emits a `prefers-color-scheme` block and the `html`
  element no longer hard-codes a theme, so the system theme renders
  without JavaScript (browser test added, which caught the hard-coded
  attribute); sound preference is tri-state with token-driven cues and
  haptics; the tide animation is finite; mono and small brand variants
  exist; architecture 13.1 to 13.10 and 14.1 record the rules.
- Product and legal critic: consent is modelled as the Act defines it
  (own step, unchecked, categories, purposes, processors, withdrawal
  sentence, `text_hash`); free text left the day entry (`NoteInput` with a
  `journal.private` default, storage map in 8.2, serializer projection
  rule in 8.3); the pregnancy-ending rules, due-date history, postpartum
  content, pointing-to-care sentence, age attestation and child-data
  questions are written in 8.4; the HBNR and MHMDA rows cite the actual
  mechanics; an FDA general-wellness row and a claims register (J8) were
  added; `/health-privacy` is a separate page linked from every public
  page by its required label, shipped now as a marked draft with a smoke
  test; notifications stay generic by email in Phase 1 and partner
  notifications are a per-person switch; the homepage's three overstated
  promises were rewritten; `packages/core` cycle math now uses the six-day
  window ending on ovulation, ignores logging gaps in the irregularity
  check, declines to predict without a plausible cycle, scales
  uncertainty, and supports `since` for the post-pregnancy reset (23 unit
  tests).

Checks after the changes: `pnpm check` green (28 unit tests), 12 browser
tests green.

### Research integration, part 2 (2026-10-04)

- Hosting verification: the `hono/vercel` deprecation is dated to 4.13.10
  (not 4.13.9) and every `hono/<runtime>` adapter moved that day; Node 20
  is disabled on Vercel since 2026-10-01 (the record pins 24.x and names
  22.x the only fallback); `relatedProjects` and global-change deploys are
  recorded for the split-out path; Vercel Workflows is the escape for jobs
  over 300 seconds; the TypeScript 6 rationale rests on typescript-eslint
  alone.
- Agent practices: `CLAUDE.md` gained Claude-only compaction notes under
  the `@AGENTS.md` import; `pnpm skills:check` validates spec frontmatter,
  names, the 500 line ceiling and that every `.claude/skills` symlink
  resolves, and runs in `pnpm check` and CI; the build prompt opens with
  the autonomy and scope blocks, lists human-only actions, starts every
  session from the progress log, the plan and the git log followed by the
  smoke tests, and closes tasks only after a fresh-context review.
- Compliance deltas: New York's bill passed both houses but is not law;
  the HBNR penalty figure, the no-banner basis for strictly necessary
  storage, WCAG 2.2's 3.3.8 and the `wcag22aa` axe tags, Vercel's DPA
  covering Pro only, Neon under the Databricks agreement, and Resend's AI
  subprocessors are all in sections 9.5, 9.6, 13.9 and 21.
- Product domain: `packages/core` gained due dates from scan and transfer,
  ACOG CO 700 redating bands, the ovulation band, exact unit conversions,
  time zone validation and locale week start (32 unit tests); the record
  explains the six day fertile window ending on ovulation with the two day
  band, the luteal evidence, the post-birth restart event, loss copy, the
  growth engine and milestone data with their licensing, and the copy
  templates every prediction surface uses (13.10); plan rows F1, F4, H2
  and H5 carry the acceptance criteria.
- Typography: Newsreader and Figtree are final with the measured reasons
  recorded; the roman Newsreader file is now the optical-size build with a
  Times New Roman metric fallback; the brand asset pipeline (G4) names the
  Next.js file conventions and safe zones verified in research.

Checks after the changes: `pnpm check` green (37 unit tests), 12 browser
tests green.

### Verification pass (2026-10-04)

- Data and auth: pool `max` 2; the GRANT migration is a drizzle-kit custom
  migration with `entities.roles` set to Neon; the Better Auth adapter
  import, the multi-host `baseURL` with the narrow preview pattern,
  telemetry off, `trustDevice` off, the built-in sign-in rate limit and
  the shared `storageState` for browser tests, the production-mode
  integration job, and the opaque KMS encryption context are recorded.
- Contract and CI: every action is pinned to a verified commit digest,
  `ci.yml` accepts `workflow_dispatch`, Renovate holds `typescript` below
  7 and the web app's `eslint` below 10 and never automerges 0.x; the
  oasdiff step is pinned with `fail-on: ERR` and `review: false`; schemas
  use `.meta({ id })` from plain zod and `.openapi()` stays inside the API
  package.
- Sound and dark mode: the sound module starts the context on mount when
  sticky activation already exists, treats `interrupted` as standard, and
  reads state after creation; theme sync listens for cross-tab storage
  changes and rewrites the theme-color metas on an explicit choice; the
  viewport declares `color-scheme: light dark`; warmth never hosts a form
  control; the two stored preference keys are documented for `/privacy`
  with the UK PECR Schedule A1 basis.

### Verification pass, part 2 (2026-10-04)

- Galleries: Nord is documentation only (proprietary packages), the day
  picker is pinned explicitly with a range test, `text-wrap: balance` is
  the heading default, `oklch` needs no fallback, and the Vercel guideline
  file is never vendored verbatim because it carries em dashes.
- Fonts: the roman Newsreader file is the optical-size build; the italic's
  preload cost is accepted knowingly; fontsource builds drop `case`,
  `sups` and `ordn`; the OFL sidecar is what satisfies the license; the
  icon master keeps separable layers and no `ImageResponse` route is
  planned because Satori cannot parse variable fonts.
- Product domain: contraception software is a device class with at least
  two authorized products, which the record now cites as the reason for
  the copy rule; the infant growth tables come from CDC's hosting of the
  WHO files; clinical and regulatory quotes are vendored with dates since
  the sources refuse non-browser clients; bottle volumes round at display.
- Compliance: MHMDA section numbers corrected (050 security, 060
  processors, 070 sale, 080 geofencing, 090 CPA); consent becomes a
  per-category lawful basis (necessary or specified-purpose consent) with
  a child's guardian consenting on the child's behalf; a `disclosures`
  ledger backs the access right; the appeal and data security duties are
  named; the breach plan keeps proof of notice and relies on access
  logging; the processor register lists the subprocessor pages to watch;
  the build prompt's scope block carries the test guidance and names new
  third-party recipients as a human-only decision.

Checks after the changes: `pnpm check` green (37 unit tests), 12 browser
tests green.

### Completeness pass (2026-10-04)

The research workflow finished (8 dimensions, 7 skeptic verifications, a
completeness critic; `docs/research/RESEARCH.md` regenerated with a status
preface saying the repository wins where a snippet disagrees). The critic's
findings and what changed:

- Turborepo strict environment mode would have hidden every Phase 1 secret
  from `turbo run build` and `turbo run test`: `turbo.json` now declares
  hash-affecting variables in `globalEnv`, every secret and test switch in
  `globalPassThroughEnv`, and `.env*` as build inputs; 17.1 explains the
  rule and the "add the variable to `turbo.json` in the same change" duty.
- The Vercel build command ran a root script from `apps/web` and would
  have applied destructive migrations automatically: it is now
  `pnpm -w db:migrate && next build`, the runner refuses destructive SQL
  without `MIGRATE_DESTRUCTIVE=1`, and an owner-triggered
  `migrate-production.yml` workflow is task B12.
- Neon's Vercel integration forks previews from the default branch, not
  from a chosen `staging`: `staging` becomes the Neon default branch,
  production a protected non-default branch, previews reuse the staging
  KEK and are not seeded at build; `withActor()` runs `SET LOCAL ROLE`
  unconditionally because the injected role can bypass RLS; B10 checks
  both environments; A4 records the mapping.
- CI cannot run authenticated browser tests without a database: task B11
  adds the `postgres:18.6` service, migrate and seed steps, test env and
  the rule that `@smoke` never authenticates; `TIDEFERN_FAKE_NOW` freezes
  "today" outside production.
- Code: `global-error.tsx`, `instrumentation.ts` recording only route
  pattern, type and digest, the HSTS header with `includeSubDomains`
  (asserted in the browser suite), `outputFileTracingRoot` at the repo
  root, the protection-bypass cookie header for Playwright, manifest
  `scope` and `id`, the `retry` prop name, `postgres:18.6` in compose, a
  pull-request gate that rejects commit messages with an em dash.
- Record: direct-to-R2 uploads are mandatory under Vercel's 4.5 MB body
  limit and photo display uses unoptimized presigned URLs; the error hook
  and the named exclusion of Vercel Analytics and Speed Insights; one WAF
  rate-limit rule on Hobby; CAA must authorize `letsencrypt.org`; previews
  never hold a Resend key; Hobby's single concurrent deployment and
  rollback mechanics with the undo step; KEK escrow; the household
  non-commercial reasoning for staying on Hobby until the attorney or the
  first outside user says otherwise; offline means `navigator.onLine` plus
  pending states; J2 names the Lighthouse and bundle tooling; J5 compares
  the deployed commit with `main`; `AGENTS.md` names the Phase 1 packages.

Checks after the changes: `pnpm check` green (37 unit tests), 12 browser
tests green. The research workflow and the review workflow are both
complete; nothing is still running.

## 2026-10-04, lead session 8517de27 (Phase 1 intake, task A1)

Started from commit `43f34d0` on `main` (clean tree). Branch
`claude/A1-intake`, draft pull request titled `A1: repository intake`.

### Read

`AGENTS.md`, `humanize.md`, `README.md`, `docs/ARCHITECTURE.md` end to end,
`docs/BUILD_PLAN.md`, this log, `docs/research/SOURCE_ANALYSIS.md`, the
`site-build` skill with all six references, the brand sheet image. Ten
reader subagents mapped `docs/research/RESEARCH.md` (four ranges), the
`humanize-writing` and `humanize-code` skills with their references, the
token file and brand package, the web shell code, the API, core and
schemas packages, and the CI workflows and runbook; a completeness critic
spot-checked their citations. Their findings are recorded below under
"Reader maps" once the run finished.

### Commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | first run failed: `ERR_PNPM_FETCH_403` on `hono-4.13.13.tgz`, blocked by safe-chain's minimum package age (hono 4.13.13 was published 2026-10-04T03:53Z and the lockfile pins it); pnpm exited 0 but linked nothing. The owner then ran it with `--safe-chain-skip-minimum-package-age`: 422 packages, done in 9.1s, engine warning for local Node 26.7.0 (expected). One build script ignored (`unrs-resolver`), which the previous session saw too. |
| `pnpm --filter web exec playwright install chromium` | passed; Chromium 1243 already present (Playwright prints a fallback-build notice for this OS) |
| `pnpm check` | passed: prose 117 files, skills 4, tokens, contrast 96 pairings, brand 5 files, OpenAPI, Prettier, then `turbo run lint typecheck test build` with 13 of 13 tasks successful; 37 unit tests (core 32, api 5) |
| `pnpm test:e2e` | first run could not bind port 3000: a three-day-old `next-server` from another checkout (`~/.codex/worktrees/0a53/crm`) holds it and answers 500; left untouched. Rerun in external mode against `pnpm start --port 3100`: `12 passed (6.5s)` |
| `node apps/web/scripts/capture.mjs` (against port 3100) | 8 screenshots of `/` and `/design` in both themes at 1440 and 390 px, written to the session scratchpad and inspected: the mark swaps to its dark variant, the warm panel reads in both themes, nothing clips or overflows at 390 px, the header navigation link is hidden on phones (known, G5). Not committed; J3 owns `docs/design/qa/` |
| Version confirmation (`npm view`, 2026-10-04) | see the table below |
| `gh auth status` | logged in as `iurman`; no open pull requests; remote branches `main` and the merged `claude/friendly-johnson-lrt79s` |
| `gh run list` | CI and CodeQL green on `main` (37250792049, 37250792077); `Verify deployment` red on every deployment since the project was connected |
| `vercel project inspect tidefern --scope iurmans-projects` (read only) | project `prj_9KHWVBhkBPNa3sgbkPs8IzOwqXUA`, team `iurman's projects`, root `apps/web`, Node 24.x, Next.js preset, default build command (A4 sets the migrate step later) |
| `curl https://tidefern.app/` and `/api/v1/health` | 200 and 200; the domain resolves through Cloudflare name servers; deployment URLs (`*-iurmans-projects.vercel.app`) answer 302 to Vercel's SSO page |

Versions in architecture section 4.2 against the registry on 2026-10-04:

| Package | Pinned | Registry latest | Drift |
| --- | --- | --- | --- |
| turbo | 2.11.7 | 2.11.7 | none |
| next, eslint-config-next | 16.3.8 | 16.3.8 | none |
| react, react-dom | 19.2.8 | 19.3.0 | newer minor exists; not bumped (the pair `create-next-app` installs with 16.3.8 stays) |
| typescript | 6.0.3 | 7.0.2 | expected, recorded in 4.2 |
| eslint | 10.12.0 (9.39.5 in web) | 10.12.0 | none |
| typescript-eslint | 8.71.0 | 8.71.0 | none |
| tailwindcss | 4.3.3 | 4.3.3 | none |
| hono, @hono/zod-openapi, zod | 4.13.13, 1.6.3, 4.6.5 | same | none |
| vitest | 5.0.3 | 5.0.3 | none |
| playwright, @playwright/test, @axe-core/playwright | 1.63.0, 1.63.0, 4.13.0 | same | none |
| sharp | 0.35.5 | 0.35.5 | none |
| pnpm | 10.34.6 | 12.9.1 | expected, recorded in 4.2 |
| Node | 24.x, `.nvmrc` 24.21.0 | 24.21.0 is the current 24 line; 26.10.0 is current | none; this machine runs Node 26.7.0, so the engine warning is expected |
| Not yet installed (Phase 1): drizzle-orm 0.45.3, drizzle-kit 0.31.11, pg 8.23.1, better-auth 1.7.7, @better-auth/passkey 1.7.7, @better-auth/drizzle-adapter 1.7.7, @electric-sql/pglite 0.5.8, openapi-typescript 7.13.0, openapi-fetch 0.17.0, react-day-picker 10.0.2, @vercel/functions 3.9.11 | as in 4.2 | same | none |

### The red deployment check

`deploy-verify.yml` failed on all nine deployments because of two GitHub
settings, not the application:

1. The repository variable meant to be `PRODUCTION_URL` was named
   `PRODUCTION_URLPRODUCTION_URL`, so production smoke tests ran against the
   deployment's unique URL, which sits behind Vercel Authentication and
   redirects to SSO; the workflow's 401 check never fires on that 302, so
   the first `curl | grep "Tidefern"` failed. Fixed: `PRODUCTION_URL` set to
   `https://tidefern.app`, the misnamed variable deleted, run 37250822707
   rerun: green. `Testing https://tidefern.app`, the home page and the
   API answered, and the browser smoke subset reported `3 passed (3.1s)`
   against Chromium 1243. That run is the passing `Verify deployment` the
   build prompt names as A2's confirmation for production.
2. `VERCEL_AUTOMATION_BYPASS_SECRET` exists only as a repository variable,
   so `secrets.VERCEL_AUTOMATION_BYPASS_SECRET` is empty and previews cannot
   be reached. This session is not permitted to write repository secrets;
   owner action 2 above.

Follow-up for J5: the workflow should treat a redirect to
`vercel.com/sso-api` as "protected" and say so, instead of following it and
failing on the content check.

### A2 and A3 status

A2: the Vercel project is connected and deploys every push; production
serves at `https://tidefern.app` and its `Verify deployment` run is green
(above). Previews stay unverified until owner action 2. The team's plan is
stated by the owner as Pro and could not be read through the connector
(scope); recorded as stated, not verified. The usage alert is an owner
setting. The GitHub `deployment` payloads Vercel sends carry
`environment` exactly `Production` and `Preview` (read once from
`gh api repos/iurman/tidefern/deployments`), which answers the open
question in architecture section 21 and matches the workflow's filter.
A2 is marked `blocked` in the plan on the preview secret and the usage
alert, with production done. A3: no database URL is present
locally (`.env.local` does not exist); the Neon side is checked when B1 and
B10 touch it. A4 is checked when `packages/db` exists.

### Decisions

- The safe-chain age guard is the owner's security control; the lead does
  not bypass it. Everything that needs `node_modules` waits for owner
  action 1; reading, version confirmation, GitHub settings and the plan
  bookkeeping proceeded.
- The A1 branch was pushed without a local `pnpm check` or `pnpm test:e2e`
  (both blocked by the install); it changes only `docs/`, and CI runs the
  same gates on the pull request. This exception is recorded here and not
  repeated for code changes.
- Commit messages carry no model names, per the architecture record, so
  no co-author trailer is added.

### Reader maps (ten readers, one critic; 11 agents, 0 errors, 138 tool calls)

The maps are evidence for the lead, not decisions. Where a research
snippet disagrees with the architecture record, the record wins
(`docs/research/RESEARCH.md` line 3 says so itself). What the critic
confirmed by reading the cited lines, grouped by what it changes:

Code follow-ups found in the foundation (not fixed in A1; each belongs
to the task named):

- `packages/api/src/problem.ts` lists six problem codes while
  `packages/schemas` lists eight; `conflict` and `upgrade_required`
  cannot be emitted although 409 and 426 are accepted. E1.
- `packages/schemas` `CalendarDate` checks shape only; `packages/core`
  `isCalendarDate` rejects impossible dates with a `RangeError`, so an
  invalid date in a request would become a 500. Refine at the boundary. E3.
- `apps/web/src/app/global-error.tsx` renders light colors only. G5.
- The header link is hidden under 600 px with no replacement and never
  carries `aria-current`; the app shell in G5 replaces it.
- Page colors `#F7F5EF` and `#0F1A17` are repeated by hand in five
  files; `tokens.css` is the generated source. G5.
- `apps/web/src/app/api/[[...route]]/route.ts` comments on a 300 s
  Hobby ceiling; the owner states Pro. Correct the comment with A2.
- `scripts/brand/generate-icons.mjs` named by G4 does not exist yet.

Document follow-ups:

- `docs/LAUNCH_RUNBOOK.md` contradicts itself on the Neon default branch
  (staging at lines 43 to 49, production at line 52); the record's
  section 7.5 says staging. It also claims `deploy-verify` compares the
  deployed commit with `main` (not built yet, J5), says the foundation is
  unmerged (stale since pull request #3), and reasons from Hobby limits
  while the owner states Pro. J4 rewrites it.
- `docs/BUILD_PROMPT.md` section 7 names tasks E1 to E10; the plan ends
  at E9. The plan lists A6 as an owner task but group A has only A1 to A5.
- `packages/design-tokens/brand/README.md` says the tagline uses the
  "Sea Glass accent color", but `tide` (`#6EA7A0`) is never text in the
  token file; the text role is `accent`. G4 settles the wording. The
  mono and small mark variants exist on disk but have no documented use.
- Research snippets use `app.user_id`, `packages/db/src/schema/auth.ts`,
  `DATABASE_URL_DIRECT`, a stored idempotency `response_body`, pnpm 12
  and a `pgRole(...).existing()` role; the record and the plan say
  `app.actor_id`, `packages/db/src/auth-schema.ts`,
  `DATABASE_URL_UNPOOLED`, no stored bodies, pnpm 10.34.6 and a role the
  first migration creates. B1, C1 and E1 follow the record.
- The envelope snippet's AAD is `userId:table.column:rowId`; the record
  and D1 say `table:column:row_id`. D1 follows the record.
- `.github/renovate.json` uses `matchCurrentVersion "!/^0/"` for the
  0.x rule; the critic asks that it be checked against Renovate's docs
  before anyone relies on it.
- `humanize.md` sets `register: warm, plain, calm`, which the skill's
  calibration grammar does not define (it accepts casual, neutral,
  formal). Harmless; the project rules carry the meaning.

Two reader claims were wrong and are not carried forward: the pull
request template exists (`.github/PULL_REQUEST_TEMPLATE.md`), and
`packages/api/scripts/emit-openapi.ts` exists. Three line citations were
off by one; the content was right.

### Owner actions resolved in this session

Owner action 1 (install) and owner action 2 (the bypass secret) were run
by the owner from the session prompt; the plaintext variable was deleted
afterwards (`gh variable list` shows only `PRODUCTION_URL`). Rotation of
the bypass value in Vercel is still recommended because it sat in a
repository variable. Owner action 3 (connector scope) stays open.

### Next action

A1 closes with this entry. Next: claim G1 (design research record) on
`claude/G1-research`.

## 2026-10-05, lead session 061fed2d (Phase 1 build, Stage 1 onward)

Started from commit `8f8cadd` on `main` (clean tree; A1 merged as pull
request #4). Lead branch `claude/G1-research`. The owner suspended the
session-boundary rule for this run: the session continues past commits and
merges until the plan is finished or every open task waits on the owner.

### Read

`docs/BUILD_PROGRESS.md`, `docs/BUILD_PLAN.md`, `git log --oneline -n 30`,
`docs/ARCHITECTURE.md` end to end, `docs/BUILD_PROMPT.md`, the four skills
under `.agents/skills` with their references, `humanize.md`,
`docs/research/RESEARCH.md` end to end (all eight dimensions, the skeptic
verdicts and the completeness critique), and the existing code in
`apps/web/src`, `packages/api/src`, `packages/core/src`,
`packages/schemas/src`, `packages/design-tokens`.

### Commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed in 578 ms (store already warm; one build script ignored, `unrs-resolver`, as before) |
| `pnpm check` | passed: prose, skills, tokens, contrast, brand, OpenAPI, Prettier, then `turbo run lint typecheck test build` 13 of 13 tasks (all cache hits against `8f8cadd`) |
| `pnpm --filter web start --port 3100` then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm test:e2e` | `12 passed (7.4s)`; port 3000 is still held by the unrelated three-day-old server and was left alone |

### Decisions

- Claims. G1 is claimed by the lead. F1, F4, F2, F3 and D1 are claimed in
  this same commit for subagents of this session, so the plan shows the
  tasks as taken before any branch exists; each subagent opens its own draft
  pull request titled with its id, works in its own git worktree and on its
  own `claude/<id>-<topic>` branch from `origin/main`, and never edits the
  plan or this log. The lead merges each pull request after a fresh-context
  review, then records `done` with evidence and the log entry in its own
  small commit. This keeps five parallel branches off the two files every
  task would otherwise collide on.
- Subagent pull requests touch only their group's paths. The core tasks
  each insert one export line into `packages/core/src/index.ts` at a
  distinct position (after `cycle`, `pregnancy`, `units` and `policy`
  respectively) so the four merges do not conflict.
- Each parallel checkout runs the browser suite against its own production
  server on ports 3101 to 3105, because 3000 is held and 3100 is the lead's.
- The owner-actions block at the top was reduced to what is still open:
  the install workaround is no longer needed (the owner authorized the
  `--safe-chain-skip-minimum-package-age` flag for this run and the store
  is warm) and the bypass secret is stored.

### Next action

Launch the F1, F4, F2, F3 and D1 workflow (implement, fresh-context review,
fix), then start G1: the gallery and product research record.

### First wave merged (2026-10-05, lead session 061fed2d)

Fifteen subagents (five implementers, five fresh-context reviewers, five
fix passes) ran as one workflow for F1, F4, F2, F3 and D1, three more for
B1, and twelve for the G1 research (six researchers, six skeptics). Every
pull request was merged by the lead with squash after its review answers
were read and its diff inspected.

| Task | Pull request | Merge | Unit tests | Notes |
| --- | --- | --- | --- | --- |
| F2 | #6 | `68833ab` | 14 in `stages.test.ts` | review added an ending-before-day-0 guard and `changedAt` validation |
| F3 | #9 | `7c30535` | 16 in `policy-filters.test.ts` | review added the first-grant-wins dedupe; a unique partial index on grants goes to B3 |
| D1 | #8 | `981e0ed` | 13 in `packages/crypto` | review added `kekProvider` on wrapped keys and canonical base64 checks on the KEK |
| F1 | #11 | `24719a3` | 18 in `growth.test.ts` | review measured up to 9 percentile points of error in the first weeks from monthly WHO rows; the fix flags percentiles under 56 days as approximate; new task F5 vendors the daily tables after the owner's WHO decision |
| F4 | #10 | `8c86782` | 7 in `milestones.test.ts` | rebased after F1; the two branches both exported `DAYS_PER_MONTH`, so milestones now imports the growth engine's constant |
| B1 | #7 | `56be184` | 8 PGlite tests | rebased twice (D1 and F1 moved `pnpm-lock.yaml` and the root scripts); review added notice logging to the migration runner |

Checks on every merged head: `pnpm check` green in the subagent's worktree
and in CI (`verify`), CodeQL green, and the preview smoke test green where
Vercel built a preview. Vercel skipped the previews for the D1 and B1 fix
heads as "Not affected" (neither package is a dependency of `apps/web`), so
those merges rest on the previous head's preview smoke test plus CI; the
production smoke test after each merge passed (runs on `68833ab`,
`7c30535`, `24719a3` and later heads all `success`).

Process notes:

- The harness creates subagent worktrees under `.claude/worktrees/`, which
  Prettier walked in the lead checkout; `.gitignore` and `.prettierignore`
  now exclude it.
- GitHub refuses a draft pull request with no commits, so every subagent
  branch starts with one real or empty commit; squash merges remove it.
- Killing the `pnpm start` wrapper leaves `next-server` on its port; the
  briefs now say to kill the listener found with `ss -ltnp`.
- One lead mistake, corrected: the rebased F4 branch was pushed before its
  gate result was read, and the gate had failed on the duplicate constant.
  The fix was pushed within minutes with a green gate; no merge happened
  in between.
- A force push after a rebase did not retrigger the pull request checks on
  B1 while the pull request was still conflicting; an empty commit after
  the second rebase did.

### G1 closed

`docs/design/RESEARCH.md` records fifteen gallery and documentation
observations with committed captures under `docs/design/research/`
(23 JPEGs, 1.3 MB), the trend galleries as
counter-signals, eight product references grouped by surface, fifteen
decisions handed to G2, G5, G6, G7, E7, H1 to H7 and J3, the pinned
guidelines skill, the `react-day-picker` 10.0.2 pin decision, and the
inaccessible and licence tables. The skeptics confirmed or partially
confirmed every observation the record keeps; the one correction (the
size of Natural Cycles' first-cycle buffer) was applied. A fresh-context
review of the pull request then found two gaps (the Apple legend clip
missed the legend; the empty-state and progress-indicator indexes were not
rows) and four smaller ones; all six were fixed before the merge. The pinned
Vercel guidelines audit skill lives in `.agents/skills/web-design-guidelines`.

Owner question surfaced by F1: whether Tidefern may vendor WHO's own daily
expanded tables (task F5); until then the first eight weeks of a growth
percentile are labelled approximate.

### Next action

Second wave running as one workflow: C1 and B12 in parallel, then B2 and
C5, then B3 to B7 on one branch (one generated migration per task, in
order). The lead claims G2 once this branch merges and writes
`docs/design/DESIGN.md`, `CONTENT.md` and `ASSETS.md`.
