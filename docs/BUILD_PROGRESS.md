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
4. Dependabot alerts are disabled on the repository (the API answers 404 for
   vulnerability alerts); enable them under Settings, Code security, so the
   lockfile pins get advisories. The lead cannot change this setting.
5. Neon (A3, A4, B10): a `tidefern` project exists (Postgres 18,
   `production` as the default branch and the Vercel production branch,
   `vercel-dev`, the Vercel integration installed, history retention 6
   hours). Still to do per `docs/LAUNCH_RUNBOOK.md` (Neon): `staging` and
   `dev` branches with `staging` as the integration's default, the 7-day
   retention the plan asks for production, a consumption notification,
   `DATABASE_URL` as the `tidefern_app` role after the first production
   migration, then the real-branch role and RLS checks with the lead.
6. F5: answer the WHO permission question in architecture section 21
   before the daily WHO tables are vendored.
7. J7: the restore rehearsal with the lead, once A3 is done
   (`docs/LAUNCH_RUNBOOK.md`, Restore).
8. The `[OWNER]` inputs in `docs/design/CONTENT.md` and `docs/INCIDENT.md`.
9. Neon branch limit: the integration's blocking check fails with "Branch
   limit exceeded", so every Vercel preview after a branch's first push is
   built but never aliased. Delete the eight stale preview branches in the
   `tidefern` project (`preview/claude/friendly-johnson-lrt79s`,
   `preview/claude/G1-research`, `F2-stages`, `B1-db-skeleton`,
   `D1-crypto`, `F3-policy-filters`, `F4-milestones`, `F1-growth`), or turn
   off per-preview branching. Until then the lead smokes each head
   commit's own deployment URL.
10. Set `OWNER_EMAIL` in Vercel production and confirm `CRON_SECRET` is set
    there; without the secret the daily cron still answers 404 (I3).
11. Approve or change the infant range lines and their source lines in
    `docs/design/CONTENT.md` ("Context ranges on /family", F6), and have
    the attorney answer the question at the end of `docs/CLAIMS.md`
    section 2 (quoting the AAP and AASM under their terms).
12. Approve or reword the public header's phone "Menu" label and the
    mark-only logo the header shows under 380 px (J3b).
13. Decide how a fresh account on a Vercel preview verifies its email:
    the console mailer now withholds every link (tokens are credentials
    and preview logs keep them), and previews have no capture endpoint.
    Options: a test inbox through the real mailer on previews only, or
    seeded verified accounts on preview branches (J3c).

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

### G2 closed, B12 merged (2026-10-05, lead session 061fed2d)

Production smoke after the G1 merge (`a53ca5e`): Verify deployment
succeeded at 16:56 UTC. B12 (PR #12, migration safety gate) merged by
squash as `37ba2cf` after its fix pass (dollar-quoted bodies scanned as
one token); CI verify and CodeQL green, the Vercel preview skipped as not
affected (package-only change), production smoke on `37ba2cf` succeeded
at 17:06 UTC.

A5 verified by reading the settings: the main ruleset requires the
`verify` and `CodeQL` checks and a pull request, and forbids force pushes
and deletion; secret scanning and push protection are on; the
`VERCEL_AUTOMATION_BYPASS_SECRET` secret and the `PRODUCTION_URL` variable
exist. Dependabot alerts are off, which only the owner can change (owner
action 4).

G2 (PR #13): `docs/design/DESIGN.md` (compositions compared with sixteen
captures of two home and two `/today` compositions in both themes at 1440
and 390 px, the page map, desktop and phone sketches for every 12.1 route,
component notes, interaction models, geometry, motion and sound, theming),
`docs/design/CONTENT.md` (per-route content inventory, voice, empty
states, owner inputs marked) and `docs/design/ASSETS.md` (fonts, vectors
with dimensions, icons, raster set, data tables). Decisions: home
composition A (two statements, one action) with B's numbered chapter list;
`/today` composition A (ring-led), the strip moves to the calendar list
header; line vocabulary solid, dashed, dotted from research decision 1; the
small mark threshold is 48 px per 13.2 and the G4 plan row is corrected
when G4 is claimed; the `/today` disclaimer reuses the 13.10 ovulation
tail so no new prediction wording enters.

A fresh-context review found two majors (phone sketches missing for six
routes and no sketch at all for seven; dark captures missing for both B
compositions and all phone captures) and ten minors (a non-13.10
disclaimer sentence, a template count, the missing "weeks and days" dating
input, dashed used where decision 1 says dotted, warmth used twice on two
screens, the 32 versus 48 px mark threshold, an unnamed track token,
vectors and icons without dimensions, a five-tab count that can be six,
and no progress entry). All twelve were fixed in the branch before the
merge; the capture script gained `--phone-dark` and `--jpeg`.

Commands: `pnpm prose:check` passed across 161 files; `pnpm check` and
`pnpm test:e2e` results are in the PR and the merge commit.

### Next action

Fix the nine G3 review findings on `claude/G3-type` (PR #15), rebase it on
main, mark G3 done, merge. Then merge C1 when its review answers arrive so
the second wave workflow continues with B2 and C5.

### G3 closed, G2 and C1 merged (2026-10-05, lead session 061fed2d)

G2 (PR #13) merged by squash as `0a90568`; C1 (PR #14, Better Auth server
config and the generated identity schema, 30 auth tests, review found no
finding) merged by squash as `c364415`. Both were package-only or
docs-only changes for Vercel, so their previews were skipped and the
production smoke results are recorded in the next entry.

G3 (PR #15): `/design/type` sets the wordmark and tagline lockup on the
surface and panel tiers, the seven-step scale from the tokens, the footer
sentence at reading width, the Newsreader italic estimate sentence,
navigation labels, actions and chip buttons, proportional against tabular
numerals, display numerals beside a serif label, and the provenance table,
in both themes; `docs/design/TYPOGRAPHY.md` is the decision record citing
architecture 13.5 with the file sizes, licence, legibility check and what
G4 still owes (the outlined wordmark). The design hub links the chapter;
the e2e axe loop covers it and a test asserts that a Newsreader and a
Figtree face report loaded and that the tabular column uses tabular
figures.

A fresh-context review found three majors (a citation to a file not yet
on the branch, a claim about the tagline on the panel that the page did
not show, and the missing plan row and log entry) and six minors (the
wordmark attributed to the wrong component, an overstated tabular rule,
no base caption rule, an editable paragraph with no press cue, a font
assertion that only checked assignment, and a widow claim the capture
contradicted). All nine were fixed: the panel lockup carries the tagline,
a `.caption` rule exists, the reading specimen is the footer sentence
rather than an editable paragraph, the test checks `document.fonts` for a
loaded face of each family, and the record was corrected.

Commands on the final branch: `pnpm check` exit 0 (core 87, crypto 13,
api 5 and the db and auth suites); `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100
pnpm test:e2e` 13 passed (8.7s); `pnpm prose:check` passed. The first gate
rerun after the review fix failed `web:lint` on an apostrophe in JSX text
(`react/no-unescaped-entities`); the sentence was reworded and the gate
rerun before the push.

### Next action

Merge G3 after CI, record the production smoke results for `0a90568`,
`c364415` and the G3 merge, then let the second wave continue (B2 and C5
start once the workflow sees the C1 merge). The lead's next own task is
G4 (brand assets) once G5's component work is scheduled, or the review of
B2 when it arrives.

### G5 contract and G4 claimed (2026-10-05, lead session 061fed2d)

Production smoke: `0a90568` (G2) and `c364415` (C1) both succeeded. The
second wave workflow saw the C1 merge and started B2 and C5.

The lead claimed G5 (and G4 on its own branch, `claude/G4-brand`, with a
draft pull request) and wrote the shared scaffolding that the
component groups build on, so five builders can work at once without
touching the same file: `docs/design/COMPONENTS.md` (file layout, the
eight states, the rules that hold everywhere, the specimen shape, the
five groups with their branches and ports, what the lead reviews);
`apps/web/src/lib/motion-tokens.ts` (durations and easings read from the
token file; the app and `/design/motion` import the same module, as 13.6
asks); `apps/web/src/components/ui/specimen.ts` and `specimen-frame.tsx`
(the eight-state, two-theme frame with the width control, source link,
keyboard note and usage snippet); `apps/web/src/components/icons.tsx`
(the navigation, control and calendar icons on the 24 px grid; symptom
and mood icons follow). Component unit tests run with Vitest 5.0.3 in
jsdom 30.1.1 through Testing Library (react 16.3.3, user-event 14.6.7,
jest-dom 7.0.1) and `@vitejs/plugin-react` 6.1.1, all resolved from the
registry and pinned exactly; `apps/web` gained a `test` script so
`pnpm check` runs them. Two tests prove the harness: the motion tokens
parse and order correctly, and the frame renders every state once per
theme and forces only the pseudo-class states.

Decisions: CSS Modules per component with tokens only (no Tailwind
utilities; the import stays for the `@theme` bridge); native elements so
the sound provider's delegation covers every control; the frame forces
hover, focus-visible and active through a `data-specimen-state` wrapper that each
module mirrors on the same selector list as the pseudo-class; the day
sheet is composed by the lead after the wave merges; G4 is delegated as a
bounded script task under the lead's review of the rendered assets.

Gate on this branch: `pnpm check` exit 0 (web 6 unit tests, auth 30,
db 23, core 87, crypto 13, api 5); `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3126
pnpm test:e2e` 12 passed. A fresh-context review found six majors
(transition rule stricter than the design contract, no settle easing in
the token file, logo, header and footer assigned to no group, the e2e
route array as a five-way merge hazard, the forced-state selector
reaching every descendant, no gate behind the "lint forbids transition:
all" sentence) and six minors; all twelve were fixed before the merge:
`ease-settle` joined the token file, `apps/web/tests/e2e/axe.ts` holds
the shared axe check and each group gets its own spec, the frame uses
`data-specimen-state` with the child combinator, `scripts/check-css.mjs`
runs in `pnpm check` and CI, the width control owns its wrapper, the
icons were corrected, and the motion module fails loudly on a missing
token.

Open finding: since about 17:16 UTC Vercel has posted only "inactive"
statuses for preview deployments (B2, C5) and no GitHub deployment at
all for the G3 branch, so the smoke workflow stopped firing for previews
although the deployments are Ready; production deployments still report.
`deploy-verify.yml` gained a `workflow_dispatch` trigger (PR #20, "A5:
manual smoke test dispatch") so the lead can run the same smoke test
against a preview alias by hand until Vercel's integration recovers.

### Next action

Merge G3 once its preview smoke reports. Merge this contract after a
fresh-context review, then launch the G4 and G5 workflow (five component
groups and the brand script, each implement, review, fix on its own
branch), review each group's captures in both themes, merge in order, and
compose the day sheet and the `/design/components` index.

### Second wave closed, G5 scaffolding merged, third wave launched (2026-10-05, lead session 061fed2d)

Merged by squash, in order: B2 (PR #16, `a3c8e0d`), C5 (PR #17,
`4e2b0c8`), B3 to B7 (PR #19, `f78d2a8`, five migrations in one branch
because the drizzle journal is ordered), the G5 scaffolding (PR #18,
`73912c3`). The plan marks C1, B12, B2, C5 and B3 to B7 done with their
evidence. The second wave workflow ran 17 agents with no error: each task
implemented in its own worktree, reviewed fresh and fixed. Reviews found
nothing on C1, one minor on B2, three minors on C5 and one major plus
three minors on B3 to B7 (a stale base, fixed by rebasing); every answer
is in the pull request bodies, which carry the commands and results.

Decisions recorded from the reports: the Resend transport throws on a
half configuration in production rather than printing links into the
production log; Better Auth's generated timestamps stay `timestamp`
without time zone because the generated file is byte-checked, and the
hand-written tables use `timestamptz`, a difference C2 and B8 must keep
in view; four tables carry no `updated_at` by design (`subject_keys`,
`vocabulary`, `due_date_changes`, `audit_events`) and a catalog test pins
that list; the 72 hour invitation expiry is the API's rule (E7), not a
check constraint; `rateLimit.enabled: true` also limits the dev server,
and the architecture prose that says otherwise is reconciled in C2 or
B11.

Deployment checks this wave: Vercel cancels the preview and production
builds of package-only merges as not affected, so B2, C5 and B3 to B7
have no smoke run of their own; production kept serving the G3 build,
whose smoke succeeded. The manual dispatch added to `deploy-verify.yml`
(PR #20, `a9d79a0`) ran the smoke against the G3 preview (run
37351505881, success) and the G5 contract preview (runs 37355883648 and
the earlier one, success). The contract's last two commits (the
verification residues, one icon path, and the db test timeout) got no
preview build of their own from Vercel before the merge; the smoke that
covers them is the production run after `73912c3`. Latest
deployment-triggered smoke runs at the time of writing: 73912c3:completed:success ba72c6d:completed:success a9d79a0:completed:success c364415:completed:success.

CI flake turned fix: the db migration test timed out at Vitest's 5 s
default twice on the contract branch, each time right after the new web
unit tests ran alongside it on the two-core runner; `packages/db`
vitest config now allows 30 s for tests and hooks (the PGlite boot), and
the suite passed on the next run. Labelled as an environment failure,
not an application defect.

Third wave launched as one workflow of up to 18 agents: the five G5
component groups (actions, forms, structure, calendar, marks) and G4, each
implement in a worktree on its own branch, fresh review, fix; briefs in
the session scratchpad (`g5/briefs.md`), binding contract in
`docs/design/COMPONENTS.md`. The lead merges each group after reading its
captures in both themes, then composes the day sheet and the
`/design/components` index.

### Next action

Merge the third wave's pull requests in the order they become ready
(actions and forms first, since structure's cards use buttons and
calendar's day sheet uses the chips), rerunning each gate after a rebase.
Then H9 (public pages) and the lead's day sheet and components index;
then B8 (RLS) and B9 (seed) as subagent tasks now that B2 to B7 are on
main, D2 after B2, and C2 after C1, B3 and B6.

### State note: session paused at its usage limit (2026-10-05, lead session 061fed2d)

The lead session reached its usage limit with two workflows still
running; they keep working after this note. Resume with a fresh session
that reads this entry first.

Running when the session paused:

- Third wave (run `wf_ed8bcdf8-9c7`): G5 groups actions, forms,
  structure, calendar, marks on `claude/G5-<group>` (ports 3121 to 3125)
  and G4 on `claude/G4-brand` (PR #21, port 3127); briefs in the session
  scratchpad `g5/briefs.md`, contract in `docs/design/COMPONENTS.md`.
  Each task ends with a ready pull request titled `<ID>: ...` and a
  report with "Review answers".
- Fourth wave (run `wf_502ba6d5-0ed`): B8 (`claude/B8-rls`, port 3131),
  D2 (`claude/D2-dek-provisioning`, 3132) and C2 (`claude/C2-auth-mount`,
  3133) in parallel; I1 (`claude/I1-outbox`, 3134) starts only after the
  lead merges B8 (the workflow polls origin/main for migration 0007 for up
  to 180 minutes). Briefs in the scratchpad `wave4/briefs.md`. The plan
  claims these four rows for subagents of this session.

What the next lead does, in order: for each ready pull request read its
report's "Review answers", check `gh pr checks`, and for a branch that
touches `apps/web` run the smoke by hand when Vercel posts no deployment
event (`gh workflow run "Verify deployment" --ref main -f
url=https://tidefern-git-<branch-slug>-iurmans-projects.vercel.app -f
ref=<branch> -f production=false`; package-only branches get a canceled
preview and rest on the production smoke). Merge by squash with a body
that carries the gate results; rebase stacked branches; rerun the gate
after every rebase; then mark the row done with evidence and log it.
Merge order: G5 actions and forms before structure and calendar; B8
before I1; D2 and C2 in any order. After the waves: the lead composes the
day sheet and the `/design/components` index, then H9, B9 (needs D2),
E1 (needs C2 and B7), B11, then the H routes.

Scratchpad paths above live under
`/tmp/claude-1000/-var-home-urmani-Documents-Personal-tidefern/061fed2d-057f-48fe-b8fb-f902264944ef/scratchpad/`;
if that directory is gone, the pull request bodies carry the same
evidence and the briefs are reconstructible from `COMPONENTS.md` and the
plan rows.

### Third and fourth waves landing (2026-10-06, lead session 061fed2d)

Merged by squash since the state note: the CI timeout fix for the api,
auth and crypto suites (PR #31, `4292568`), G4 (PR #21, `318f226`), D2
(PR #24, `9c505d4`), B8 (PR #27, `694667c`), C2 (PR #25, `e41c19f`),
G5 forms (PR #28, `fad7018`), G5 marks (PR #29, `eb82952`) and G5 actions
(PR #26, `3db3eb8`). The plan marks G4, D2, B8 and C2 done with evidence;
G5 stays in progress until structure and calendar merge and the lead
composes the day sheet and the `/design/components` index. The fourth
wave workflow ended without starting I1 (its wait for the B8 merge
expired), so I1 runs as its own workflow now that migration 0007 is on
main; B9 and C3 started as the fifth wave (plan rows claimed here), and
E1 starts after I1 merges because both touch the API app file.

Every merged group page was inspected by the lead in both themes before
the merge (the buttons and toasts, the form fields and date input, the
ring, week card, chart and timeline at native resolution, the social image
and maskable icon). Decisions taken from the review answers: the
fresh-auth refusal stays a 401 with a detail until E1 extends the closed
problem code enum; the three two-line edits C2 made outside its file list
were verified necessary and accepted; B8's schema test edits are
ratified; the Resend half-configuration rule throws in production; the
logged period pill is a solid stroke with a light fill until a period ink
token exists (DESIGN.md 6.2 to gain that sentence); the forced
focus-visible twins stay per module until the lead draws the ring once in
the specimen frame; `[role="option"]` joins the sound provider's
delegation at integration.

Deployment and CI findings: Vercel posts no deployment event for most
branches now, so every apps/web branch is smoke tested by manual dispatch
against its branch alias before the merge (actions run 37397196786, forms
37395874372, marks 37396464134, G4 37395603114, C2 37396579941); an
empty retrigger commit builds no new preview, so the existing alias (same
content) is what the dispatch tests; a GitHub re-run reuses the original
merge commit and cannot pick up a fix landed on main, so a branch that
needs main's fix gets a new push instead. PGlite and jsdom suites timed
out at Vitest's defaults on the two-core runner once several packages ran
side by side; the db, api, auth, crypto and web suites now allow 30 s
(the web change rides on the calendar branch). All labelled as
environment failures; no application defect was found behind them.

### Next action

Merge G5 calendar (chain running) and structure after its fix pass, then
I1, B9 and C3 as they become ready; start E1 after I1; then the lead's
day sheet and `/design/components` index, the sound provider's option
selector and the shared forced focus rule, and H9.

### G5 closed, fifth wave landing, sixth wave launched (2026-10-06, lead session 061fed2d)

Merged by squash: G5 calendar (PR #32, `41f75e8`, after the web unit
suite gained the 30 s limit), G5 structure (PR #30, `b0ffeed`), B9 (PR
#35, `af4f43c`), C3 (PR #36, `ad43d22`) and the lead's G5 integration (PR
#37, `cd4f2bb`): the day sheet composed from the sheet, the period switch,
the flow scale, the chips, the mood selector and the private note with its
explicit sharing action; the patterns page; the components index built
from the six groups' specimens; the specimen frame's min-width guards,
shared forced focus rule, wrapped source paths and usage, clipped
oversize stages and a wide cell option (an overflow probe reports
scrollWidth equal to clientWidth on every group page at 390 and 1440 px,
and a spec keeps it so); the sound provider delegates over role option
and menuitem. G5 is done: every 13.7 component exists in eight states
and both themes and appears under `/design/components`. The plan marks
G5, B9 and C3 done with evidence and claims B11, C4 and E1.

I1 (PR #34) was refused once for conflicts after B9 landed; the lead
rebased it (both README sections kept), reran the gate (`pnpm check` exit
0, e2e 71 passed) and its chain merges it on green checks and smoke. E1
starts as its own workflow right after. B11 (CI topology) and C4 (devices
and two-factor screens) started as the sixth wave on the fifth wave's
briefs pattern.

Decisions from the review answers: B9 keeps a `better-auth` peer
dependency on `packages/db` for the password hashing path (ratified);
C3's verify page reads a result only from the `done` marker and the
`/verify` direct-visit copy is an owner input recorded in CONTENT.md's
missing list; C3's scoped `better-auth/react` allowance lives in the
auth package's own ESLint config, and the `apps/web` ESLint edit is
confirmed; I1's cron lives in `apps/web/vercel.json` because Vercel reads
the file from the root directory, and `pnpm jobs:run` uses the direct
URL because the sweep refuses the app role; the lead accepts the small
edits outside I1's file list (db export, api index and context).

Two more environment findings turned into fixes: a server component may
not pass handlers into a client component, so specimens that take
handlers live in client modules whose pages write their own title and
lede (the structure group found it first; the patterns page follows);
a CSS module selector must contain a local class, so the shared focus
rule is scoped under the frame's class. A scroll region without keyboard
access fails axe, so the frame wraps usage text and clips oversize stages
rather than scrolling them.

### Next action

Merge I1 (chain running), launch E1, then review and merge B11 and C4;
close I1, B11, C4 and E1 in the plan; then E2 to E8 as a wave over E1,
H9 (lead), I2 after E8 and D2, and the H routes once E2 to E8 land.

### I1 merged, E1 and H9 started (2026-10-06, lead session 061fed2d)

I1 merged by squash as `52841aa` after the lead's rebase (PR #34; gate on
the rebased head: `pnpm check` exit 0, e2e 71 passed; preview smoke by
manual dispatch, run 37418427864, success). E1 started as its own
workflow over it. H9 (public pages) is claimed by the lead and its
implementation delegated to a builder with a fresh-context reviewer who
captures every route; the lead reads the captures and the policy copy
against CONTENT.md before the merge, as with the G5 groups. B11 and C4
are in progress in the sixth wave.

### Next action

Review and merge B11, C4, E1 and H9 as they become ready (H9 and C4 touch
apps/web and get a smoke dispatch), close them in the plan, then E2 to E8
as one wave over E1 (distinct route files), I2 after E8, and the H routes.

### C4, H9 and E1 merged; the host wired; E2 to E8 claimed (2026-10-06, lead session 061fed2d)

Merged by squash: C4 (PR #41, `2afa266`), H9 (PR #42, `06fd78e`), E1 (PR
#43, `521c846`). The lead inspected C4's devices and two-factor screens
and H9's home, policy and error pages in both themes before each merge;
H9's home is composition A as the design contract decided it. B11's
branch carries the lead's edits (both sign-out redirects accepted in C3's
spec, the home smoke tests under the smoke rule, a named grant-login
script) and merges on its own green CI run, which is the proof that the
seeded Postgres topology works end to end.

This pull request wires E1 into the host (the trusted origins from the
auth host facts and the log secret), replaces the error log's path with
the route template, adds the resource route registry
(`packages/api/src/routes/index.ts`, one line per area so seven areas can
land in sequence), and adds two probes to the deployment smoke (a
mutation without an Origin is refused, one with the deployment's own
Origin reaches the session check). Architecture 5.3 now records E1's
replay shape and 17.1 the `globalEnv` split B11 made.

Decisions ratified from the review answers: E1's edits outside its file
list (problem codes, api index and lint config, the db test pins and
README row, migration 0008); the replay answers from the stored row;
C4's settings shell renders under the public header until H2 and H7 give
the app routes their own layout (recorded for those tasks); H9's closing
design-system line stays until `home.spec.ts` moves its assertion to the
footer link (a lead follow-up). Follow-ups noted for the H routes: C3's
`normaliseCode` helper and the brand chapter's "colour" spelling should
match the en-US house style when those files are next touched.

Seventh wave launched after this merge: E2 to E8 as one workflow over
the registry, each on its own branch and port (3161 to 3167), briefs in
the scratchpad `wave7/briefs.md`; the lead merges in order and each fix
pass rebases and regenerates the OpenAPI document.

### Next action

Merge B11 on its green run. Review and merge E2 to E8 in order, then E9
(the generated client and the breaking-change gate), I2 after E8 and D2,
then H1 to H8 over the components and the routes, J1 to J5, and the owner
tasks A3, A4, B10 when the owner is available.

### Seventh and eighth waves launched (2026-10-06, lead session 061fed2d)

The host wiring merged as `1d1b5e1` (its preview smoke ran the two new
mutation probes). A local probe found that the cross-site check took the
request's own origin from the URL, which a Next.js host rewrites to its
listen name, so a browser on 127.0.0.1 would have had its own Origin
refused; the check now reads the forwarded host or the Host header, with
a unit test, and the probe on the deployment's own Origin reaches the
router. B11 merged as `37525e3` on its own green CI run.

Launched: the seventh wave, E2 to E8 as one workflow over the route
registry (branches `claude/E<n>-<area>`, ports 3161 to 3167, briefs in
the scratchpad `wave7/briefs.md`; each fix pass rebases and regenerates
the OpenAPI document, and the lead merges in order); and the eighth wave,
G6 (color, motion and foundations chapters), G7 (sound chapter, settings
sound route with quiet hours, the settle cue, the sound tests), J5 (the
uptime workflow and the rollback comparison in the deployment smoke) and
J8 (`docs/INCIDENT.md` and `docs/CLAIMS.md` for the owner's attorney),
briefs in `wave8/briefs.md`, G6 and G7 under the lead's visual review.
J5 was started although its plan row needs A2, because the production
project exists and the work is workflow files only; A2's remaining owner
items stay in the owner list.

### Next action

Review and merge E2 to E8 in order and the eighth wave as it lands, then
G8 (exports and the coverage review), E9 (the generated client and the
breaking-change gate), I2, the H routes over the components and the
routes, J1 to J4, J6 and J7 with the owner.

### Merges blocked by the CodeQL upload (2026-10-06, lead session 061fed2d)

The seventh and eighth waves stopped when the usage credits ran out with
ten builders mid-task (uncommitted work left in their worktrees) and J5
built but unreviewed; one workflow resumed all eleven in their existing
worktrees with the same review and fix passes. J5 (PR #46) and J8 (PR
#47) are ready: J5's review found that the production commit step cannot
see an Instant Rollback (it compares the deployment's commit with main);
the step and the runbook now say so, and real rollback detection, which
needs the commit the domain serves, stays open on J5's row. J8's review
fixed a child-grant join and moved the vendor discovery time to the
owner's attorney.

Both are blocked on owner action 0: every CodeQL run since about 07:00
UTC fails at the upload step with "Code scanning is not enabled for this
repository", because the repository became private; the API reports
`private: true` and no security features. `verify` passes on both. This is
an environment failure, not an application defect.

### Next action

Owner: owner action 0. Lead: keep reviewing the E2 to E8, G6 and G7 pull
requests as they become ready, so they merge in a row once CodeQL is
unblocked.

### All twelve pull requests ready; the merge queue (2026-10-06, lead session 061fed2d)

Every task in the seventh and eighth waves finished its build, fresh
review and fix pass (33 agents, no errors). The lead read every review
answer and looked at the captures of each page task (G6 at the fixed
head, built and captured by the lead; G7 at its fix captures); E5's
resume ran while the safety classifier timed out, so the lead checked its
diff by hand (route, test and schema files plus the shared crypto
dependency and the pinned test runner; nothing else). Nothing has merged,
because every pull request is blocked on owner action 0.

The queue, in merge order, with the lead's rulings (each web branch gets
a manual smoke dispatch before its merge; each later E area rebases onto
main keeping main's copies of the shared edits and every registry line,
then `pnpm install --frozen-lockfile`, `pnpm openapi:generate`, `pnpm
check`, push with lease):

Merge in this order with `gh pr merge <n> --squash`, rerunning checks after each rebase; web branches get a manual smoke dispatch first.

- #57 docs: CodeQL blocker log
- #46 J5 uptime and head-of-main comparison (workflow only). After merge: gh workflow run uptime.yml
- #47 J8 incident runbook and claims register (docs only)
- #49 E6 notes routes. Lead rulings: out-of-list edits accepted (audit noteShare, generic problem, crypto dep, schemas test script); no category list filter (9.1); tombstones for notes decided with E8 sync
- #51 E7 sharing routes (touches apps/web route.ts: smoke dispatch first). Lead rulings: 503 status with code internal and detail mail_unavailable accepted; invitation audit actions added to E1's list accepted; architecture 8.3 gains the three invitation audit names at the next docs pass
- #48 E4 pregnancy routes. Lead rulings: the registry commit 2172b0d (app.ts one line, generic problem status, registry handing the actor db and key provider) accepted and merged first of the E areas that need it; /end path name kept; payload pregnancyId reminder key noted for H10
- #50 E5 children routes. Lead rulings: milestone check-off path PUT /v1/children/{id}/milestones/{itemId} confirmed; kind as a closed-enum query filter accepted (an event kind is a vocabulary code, not a health word in the 9.1 sense, same as dates); feed side needs a B-task migration (new plan row B13: nullable side enum on child_events with a feed-only check)
- #52 E8 account routes. Lead rulings: shared edits (audit action names, crypto dep, schemas vitest wiring) land with the first E area merged and later areas drop their copies on rebase; closure enforcement in the session middleware is a new lead task with I2; the partial unique index on open closures joins B13 as a second guard
Conflict note: E4, E5, E6, E7, E8 each carry copies of the shared edits; merge E6 first (smallest), then rebase each next branch with `git rebase origin/main`, keeping main's version of audit.ts, problem.ts, package.json and the lockfile and every line in routes/index.ts and schemas/src/index.ts, then `pnpm install --frozen-lockfile`, `pnpm openapi:generate`, `pnpm check`, push with lease, wait for checks.
- #54 E3 cycle routes. Lead rulings: period derived from flow on PUT and predictions recomputed on read and write instead of an inputs version, both accepted; open gap: a cycle.status-only grantee gets 404 from GET /v1/cycle/status until a lead migration (0009, new plan row B14) adds SECURITY DEFINER functions that re-check the grant with B8's helpers and return only the derived status and a prediction refresh; the it.todo in the E3 test is restored with it
- #55 G7 sound chapter, /settings/sound with quiet hours, the settle cue (web: smoke dispatch first). Lead inspected /design/sound and /settings/sound in both themes; mergeable, seven minors none blocking; the tab bar over "Play a sample" in the 390 full-page capture is a full-page screenshot artifact of C4's fixed bar
- #53 E2 profile, consents and data summary routes. Lead rulings: schemas package.json and lockfile test wiring accepted (resolved once with E8's copy); the closure helper shared with E8 and the account.close audit action land when E8 merges; the fix commit's co-author trailer is dropped by the squash message
- #56 G6 color, motion and foundations chapters (web: smoke dispatch first). Lead inspected the fixed head 9b5282a in both themes; follow-up for the lead: put the chapter sequence in 13.8 order (Brand next to Color, Type previous to Color, Components next to Motion) and mention Settings in the color chapter once a follow-system control ships

New work the queue creates: B13 (a nullable feed `side` enum on
`child_events` and a partial unique index on open closures in
`data_requests`), B14 (security-definer functions that re-check a
`cycle.status` grant and return only the derived status and a prediction
refresh, restoring E3's todo test), enforcement of an open closure in the
session middleware (with I2), architecture 8.3 gaining the invitation
audit names, and the chapter order fix above.

### Next action

Owner: owner action 0. Then the lead merges the queue in order and
continues with E9, G8, I2, B13, B14 and the H routes.

### The merge queue landed; the ninth wave (2026-10-06, lead session 061fed2d)

The owner made the repository public again, which cleared owner action
0; every CodeQL check passed on a re-run. Merged by squash, in order: the
progress entry (`9b71557`), J5 (`44dfc5b`; the hand-run uptime check
37486428840 is green), J8 (`2575f0f`), then one merge agent per pull
request rebased, regated and merged E6 (`03cdae4`), E7 (`a54deb4`, smoke
37491754027), E4 (`03d195e`), E5 (`c2d7fdb`), E8 (`f71c654`), E3
(`75cecb4`), E2 (`d07ddb9`), G7 (`96acd1f`) and G6 (`112afc9`). Each
resolved the shared-file conflicts per the queue rulings (every registry
line kept, main's shared edits kept and each branch's own additions such
as audit action names and the 503 status added), regenerated the
contract, and passed `pnpm check` (836 unit tests by E4's run) and the
browser suite before its merge. One design difference is now on main and
is noted for a later cleanup: the notes area reads the database and keys
from the request environment while the later areas take them from the
registry options.

The plan closes J5, J8, E2 to E8, G6 and G7, adds B13 and B14 for the
schema follow-ups the route reviews raised, and claims the ninth wave:
E9 (the generated client and the breaking-change gate), G8 (exports and
the coverage review, with the chapter sequence fix), I2 (the closure
state machine, including enforcing an open closure in the session
middleware), H10 (reminder emails through the outbox), B13 and B14.
Architecture 8.3 gains the invitation audit names.

### Next action

Review and merge the ninth wave, then H1 to H8 over the generated
client, then J1 to J4 and J6 to J7 with the owner.

### The ninth wave merged (2026-10-06, lead session 061fed2d)

Merged by squash: H10 (`e914870`), E9 (`f69a012`, preview smoke
37517958024), I2 (`a70ab82`), G8 (`f76eb0c`, preview smoke 37520092319)
and B13 with B14 (`303df97`). I2 conflicted with H10 on the job handler
registry; the lead rebased it keeping both handlers and reran the gate
(151 e2e). G8's CodeQL check found a real issue: the Markdown table cell
escape handled pipes but not backslashes; the lead fixed it to escape
backslashes first, with a test (158 e2e). B13 and B14 rebased cleanly onto
I2 (the open-closure index states match I2's `OPEN_CLOSURE_STATES`), and
E9's new drift gate then required regenerating the client types for the
feed side field, which is the gate working as intended.

Decisions: E9's three small edits outside its file list are accepted;
moving the UUIDv7 minter into `packages/core` stays a follow-up (the
client copy is pinned to the server's by a test); I2 runs several closure
steps per daily run because one step a day would take about twenty days
on Hobby; the lead edits `home.spec.ts` when a chapter order change needs
it.

The lead started the route-group restructure that the page routes need:
a `(public)` group with the public header and footer and an `(app)` group
with the app shell and the session gate, so no authenticated page shows
the public header (the overlap C4 and G7 showed). H1 to H8 start once it
merges.

### Next action

Merge the route-group restructure, then launch H1 to H8 as one wave, then
J1 to J4 and the owner tasks.

### The route groups merged; the tenth wave claimed (2026-10-06, lead session dfc54107)

The route-group restructure merged by squash as `6fab907` (pull request
#65) after a fresh-context review that found no major and three minor
issues, all fixed on the branch: an error thrown by an app page fell
through to the root error page and its public header (now
`(app)/error.tsx` with two tests), Today showed two failure sentences on a
failed read, and stale paths in the docs. `/` and the policy, design and
auth pages sit in a `(public)` group with the public header and footer;
`/today` and `/settings` sit in an `(app)` group whose layout reads the
session once, sends a visitor without one to sign in and draws the app
shell with the two policy links under the page. The route manifest (44
entries) and an anonymous and signed-in status probe of every URL were
identical before and after. Gates on the branch: `pnpm check` 27 of 27
tasks, `pnpm test:e2e` 164 passed. The preview was smoked by hand (run
37525828165 against
`https://tidefern-git-claude-app-shell-groups-iurmans-projects.vercel.app`,
green); after the merge CI 37525971289, CodeQL 37525971149 and the
production smoke 37526091664 passed on `6fab907`, and the scheduled uptime
runs 37527192542 and 37550130400 are green.

This session started from `6fab907` with no pull requests open. Commands
and results: `pnpm install --frozen-lockfile` (binaries linked);
`pnpm check` exit 0, 27 of 27 tasks; the `@smoke` subset against a
database-free production server on port 3101, 6 passed; the full browser
suite against a local copy of the CI topology (a `postgres:18.6`
container on the pinned digest, migrated, the app role given login, the
cast seeded at `2026-10-05`, the build and server given CI's test-only
values, port 3102), 164 passed in 2.9 minutes. A signed-in capture of
`/today` as Noor rendered her name through the in-process read, which is
how the H pages will be reviewed: server components call the API in
process, so a browser-level canned answer cannot reach them, and the
builders run the seeded database locally instead.

Owner action 0 is cleared (the repository is public and CodeQL uploads
again) and is removed from the list above; the owner items from the plan
(Neon, F5, J7 and the `[OWNER]` inputs) are added to it. Dependabot alerts
still answer 404.

The plan claims H1 to H8 for this session, implementation delegated per
route with the lead reviewing captures of every page in both themes before
each merge. Follow-ups kept for the routes they touch: H2 drops Today's own
session read, the rail panel ends at its content height on desktop, and
the social card's alt text lives in both `site.ts` and
`opengraph-image.alt.txt`.

### Next action

Finish the readiness sweep of H1 to H8 (API calls, gaps, shared files),
land any lead prework it calls for, then launch the wave.

### The readiness sweep, the lead prework and Phase A (2026-10-06, lead session dfc54107)

The plan pull request #66 merged as `0a20c44` (preview smoke 37554115701).
Before launching the page routes the lead ran a readiness sweep: one
read-only scout per H route mapped the API calls, gaps, components,
states and shared files against the code, and a cross-check settled the
conflicts between routes (9 agents). What it found changed the plan:

- Server components call the API in process, so a browser-level canned
  answer cannot reach a server render. Builders run a local copy of CI's
  seeded Postgres per task, and review captures sign in as seed personas
  (lead tools in the session scratchpad: `seeded.sh`, `capture-auth.mjs`).
- The `E2E_MAIL_CAPTURE` endpoint C5 named was never mounted (C6), and a
  real sign-up answered 500 on the app role because the key hook claimed
  system context that `is_system()` refuses for `tidefern_app` (D3).
- Account closure and consent withdrawal make the same mistake on the
  request's app-role connection (E10). The job runner, reminders and
  closure were never wired into the web host, so production's cron path
  answers 404 (I3). The server ignores `TIDEFERN_FAKE_NOW` although
  architecture 15 says `todayIn()` honors it outside production (E11).
- `child_events` has no feed method or diaper contents, and creating a
  child writes no guardian consent (E12); no AAP or AASM ranges exist in
  code (F6); nothing audits a sign-in or a device sign-out, and the
  seed's partner audit names differ from the API's (C7, G10).
- DaySheet loses a spotting flow, labels a shared note private and
  submits a method-less form, and CycleRing recomputes predictions from
  period starts the API never returns; H2 and H3 need one contract (G9).
  Entry redirects, the invitation fragment, one e2e sign-in helper, a
  checkbox field and seed cases are needed by several routes (G10).

The lead prework merged as `e421439` (pull request #67): the shell's
quick-log context (Today registers its opener; the button is left out
for the `none` stage and disabled until registered), `/log/[date]`
marking Calendar and `/activity` Settings, held grants showing Journey
and Family, the rail at full height, one cached session read per request
(`sessionMe()`), `formatChildAge`, `BackLink`, C6 and D3. A two-lens
fresh-context review with a skeptic per finding confirmed five findings,
all fixed before the merge; the largest was that a Next.js production
build loads the auth package once per runtime, so the capture store now
lives on `globalThis`. Gates: `pnpm check` 27 of 27; the seeded browser
suite 164 passed; the `@smoke` subset 6 passed on a database-free
server; CI verify 37557938167 and CodeQL green; preview smoke
37558214802.

Rulings for the wave, each repeated in the briefs: a period day is a day
with flow light, medium or heavy, and the Period switch selects Medium
visibly while spotting and none keep their flow; "weeks and days as of a
date" is dropped from dating this wave (no honest method; owner input);
the word she chooses after an ending is dialog-only and the dialog caps
the date at today; pronouns are not in the profile (owner input); units
are one metric or imperial control; a category label in the revoke path
is not a health fact; sign-out moves to Settings and the shell-less
layout; an invitation is accepted on `/sharing` from its `#invitation=`
fragment, kept through sign-in.

The plan marks C6 and D3 done and adds C7, E11, E12, F6, G9 and G10.
Phase A launches now as one workflow (implement in a worktree, a
fresh-context review, a fix pass): G10, G9, E10, E11, E12, F6, C7 and
I3. Phase B, H1 to H8, follows once they merge, because every page
depends on at least one of them (H1 on G10 and E12, H2 and H3 on G9, H4
and H6 on G10, H5 on E12, F6 and G10, H7 on E10 and G10, H8 on G10 and
C7). Follow-ups recorded: the console mailer prints invitation tokens on
previews, measurements cannot be corrected or removed, "share this with
[name]" after an ending, an API refusal of an ending dated in the
future, moving the processor list into `packages/schemas`, and
`playwright.config.ts` falling back to port 3000.

### Next action

Review and merge Phase A as each task passes its review, recording the
production smoke for `e421439`, then launch H1 to H8.

### Phase A reviewed and merging (2026-10-06, lead session dfc54107)

Two lead pull requests merged while Phase A built. #69 (`1cfd635`): the
home page's closing design line is gone (the footer carries "Design
system" on every public page, and the `@smoke` home test follows the
footer's link) and the brand chapter spells color the en-US way, two open
follow-ups. #74 (`5cba052`): `openapi/BREAKING.md` lists approved
breaking changes to the v1 contract, one dated line each, and the
`oasdiff` step reads it as its `err-ignore` input, so every other
error-level change still fails. Architecture 5.1 records the narrow
exception (until the first installed client ships, the web app deploys
with the API from one commit, so a change no deployed code calls breaks
nobody). Its first line approves E12's required guardian consent on child
creation, which oasdiff correctly flagged and the builder refused to work
around; the same `tufin/oasdiff:v1.33.0` image exited 1 without the file
and 0 with it.

Phase A ran as one workflow: a builder per task in its own worktree, a
fresh-context reviewer per pull request, an independent skeptic per
finding, and a fix pass. Every task reported `pnpm check` green and the
seeded browser suite and the database-free smoke subset green before its
push. The lead reviewed G9's and G10's captures before their merges: the
day sheet, its failure and share states and the ring on API answers read
as DESIGN.md 3.4 and 6.1 ask in both themes; at phone width the five flow
values wrap inside the pill and the Period help line runs to seven lines,
which G9b fixes before H2 and H3 build on the sheet. G10's shell-less
flow frame, the in-shell not-found page and the checkbox field read
correctly.

Owner actions added: set `OWNER_EMAIL` in Vercel production and confirm
`CRON_SECRET` is set there; without the secret the daily cron still
answers 404 after I3.

Follow-ups recorded: the children and measurements lists send a forged
cursor to the database and answer 500 (E5, found by E12's builder); the
public header has no "Sign in" link (needs DESIGN.md 4's phone disclosure
menu; J3); the day sheet cannot clear a chosen mood (G9b decides).

Merged by the merge queue (one agent per pull request, strictly in order:
rebase, regenerate generated files, renumber a migration by regenerating
it, regate, push, wait for CI and the preview smoke, squash merge): E11
(`b31bad1`, production smoke 37569111335), E12 (`03c0251`, its migration
regenerated as 0012, production smoke 37571260392), I3 (`cbbdc1f`,
production smoke 37573337266), G10 (`259f187`, production smoke
37575526259) and G9 (`4dc6b5a`). Every merge agent reran `pnpm check`,
the seeded browser suite and the smoke subset on the rebased head before
pushing, and confirmed CI verify and CodeQL green before merging.

Two findings from the merge agents. Vercel previews after a branch's
first push are built but never aliased: a blocking deployment check from
the Neon integration fails with "Branch limit exceeded" (owner action 9),
so a smoke against a branch alias tested that branch's first push; the
agents smoked each head commit's own deployment URL instead, and the
merge prompt now requires it. Earlier hand smokes in this session used
aliases; they covered pushes whose later commits changed tests or docs
only, and production smokes after every merge are green.

The remaining Phase A pull requests (E10, C7, F6) are in the queue.
Phase B launched once G10 and G9 merged: H1 to H8 and G9b (the day sheet
at phone width) build in parallel, each with a fresh-context review and a
fix pass, and the briefs tell builders whose dependency is still merging
(E12 for H1 and H5, F6 for H5, E10 for H7, C7 for H8, G9b for H2 and H3)
to rebase onto it before their final gates. The plan closes E11, E12,
I3, G9 and G10 and marks A3 blocked with what exists in Neon.

### Next action

Merge E10, C7 and F6, then review Phase B's captures and merge H1 to H8
and G9b through the queue.

### Phase A merged (2026-10-07, lead session dfc54107)

The merge queue finished Phase A: E10 (`840b1fe`, its migration
regenerated as 0013, production smoke 37580686504), C7 (`79916df`,
production smoke 37583221330) and F6 (`309f5ba`, production smoke
37586092231), after G10, G9, E11, E12 and I3. Plan pull request #79
merged as `cdc1871`.

E10 found more than its brief named. Besides moving closure and consent
withdrawal onto the app role with one narrow definer function, it showed
that the B8 and B14 definer helpers searched the session's temporary
schema first (`SET search_path = pg_catalog, public` leaves `pg_temp`
implicit and first), so the app role, which may create temporary tables,
could shadow a table a helper reads: `is_guardian()` answering true for a
stranger, for example. Migration 0013 puts `pg_temp` last on every
function and a test proves the shadowing no longer works; architecture
7.2 now says so.

Phase B is building: H1 to H8 and G9b. H6 met the contract gate on
purpose: narrowing `descriptionVersion` on `PUT
/api/v1/sharing/grants/{personId}` to the catalog's keys is an
error-level change to oasdiff. Only the web app calls that route, deployed
from the same commit, so the lead approves it under architecture 5.1; its
line goes into `openapi/BREAKING.md` with H6's merge.

Follow-ups recorded from the Phase A reports: an ESLint rule that forbids
`withSystem` in API route code, so the D3 and E10 class of defect cannot
return; the test task in `turbo.json` has no inputs from workspace
dependencies, so a local `pnpm check` can replay API and auth tests from
cache after a database change (CI restores no cache and is unaffected);
the job runner's `describeError()` drops the SQLSTATE of a Drizzle
failure; the children and measurements lists answer 500 to a forged
cursor; `pnpm jobs:run` cannot configure reminders and closure without
`packages/api` depending on `@tidefern/auth` at runtime; and the
WeekStrip draws today's warmth box clipped when a period pill continues
from before the strip.

### Next action

Review Phase B's captures and merge H1 to H8 and G9b through the queue,
then the lead's follow-ups, then J1 to J4.

### The page routes merged (2026-10-08, lead session dfc54107)

Phase B built H1 to H8 and G9b, each with a fresh-context review, a
skeptic per finding and a fix pass. A weekly usage limit stopped the
workflow part way (H5's build and most fix passes), and a reboot then
emptied the session scratch folder (briefs, lead tools, reports and
evidence). The lead rebuilt the tools and briefs from the session record,
backed them up outside `/tmp`, and resumed the workflow from its journal,
so only the failed agents ran again; the builders' worktrees and branches
had survived.

The permission classifier now refuses merges by subagents, so the merge
queue prepares each pull request (rebase, regate, push, CI, the preview
smoke against the head commit's own deployment) and the lead merges it on
the verified head with `--match-head-commit`. Merged in order, each with
`pnpm check`, the seeded browser suite and the smoke subset green on the
rebased head and a green production smoke: the lead's Button fix (#91,
`8d83c0e`: a button keeps its loading width, which H3 had caught), G9b
(#84, `75315fa`), H8 (#82), H6 (#83, with its approved line in
`openapi/BREAKING.md`), H4 (#86), H5 (#85), H7 (#89), H1 (#90), H3 (#80)
and H2 (#81, `0b31e7d`). The seeded suite grew from 164 to 328 browser
tests.

Lead rulings recorded: the condensed week list on `/journey` for Phase 1;
G10's placeholder assertion in `flow.spec.ts` replaced by H1; the
fresh-account activity empty state covered by unit tests. The lead
reviewed captures of every page in both themes at desktop and phone.

Follow-ups: storing the terms acceptance on the here-for-someone-else
onboarding path (an API field); `design-exports.spec.ts` and
`docs/design/COVERAGE.md` still list the built routes as planned; the
WeekStrip clips today's warmth box when a period pill continues from
before the strip; an axe target-size finding under the sticky tab bar at
390 px; the owner's wording for the `[OWNER]` copy lines the pages
surfaced (CONTENT.md per-route sections, the F6 range lines, the feeding
line after a birth).

### Next action

J1 (flow suites) and J2 (Lighthouse and the bundle budget) in parallel,
then J3 (review loops, folding in the follow-ups above), J4 and J6.

### J1 and J2 merged (2026-10-09, lead session dfc54107)

J1 (#94, `7d6b62e`) and J2 (#93, `c1e8032`) were built, reviewed with a
skeptic per finding and fixed in one workflow; J2b (#95, `41c7936`) made
the four fixes J2 measured, under the same loop. Each was rebased onto
the previous merge and regated by the lead before its push: `pnpm check`,
the seeded suite (354 passed, 18 to 19 minutes, limiter trips 0), the
database-free smoke (6 passed), CI verify, CodeQL and the preview smoke
against the head deployment; production smokes 37878856609 (J2) and
37888756158 (J1) passed.

CodeQL caught a real issue on J1: the e2e limiter state was written to a
predictable file in the shared temp folder. The lead moved it into the web
package's ignored `node_modules/.cache` (folder 0700, file 0600) and
regated. On J2b CodeQL flagged a backtracking regular expression in the
client-graph guard; the builder replaced it with a linear scan.

Lead rulings: J2 merged as a measurement with its budgets explained; J2b
was approved as a follow-up outside the plan's rows. The fonts README
edit, the 12 KB hidden-mark cost when a viewer's theme differs from the
system, and the +0.37 s lab LCP on Noor's `/today` from no longer
preloading the italic are accepted. The byte-budget gate goes into CI in
J3. `@opentelemetry/api` 1.9.1 now resolves as the optional peer of next,
better-auth and drizzle-orm through the Lighthouse dev dependency; no SDK
is registered, so nothing the app does changes (PERFORMANCE.md).

Lighthouse at head (lab, one machine): initial transfer and CLS met on
every key route; first-route JavaScript met signed out and on `/today`
and `/family`, missed by 7 to 20 KB on `/calendar`, `/sharing` and
`/settings`; LCP missed everywhere (2.71 to 4.66 s), from render-blocking
CSS and the roman fonts, a decision on 13.5's optical-size Newsreader.

### Next action

J3 in two rounds. First, in parallel: J3b (the known web defects: the
sign-in return path, the WeekStrip and month-view pill clipping, the
public header's Sign in with the phone menu, the social card alt text),
J3c (the forged-cursor 500, `describeError()` and SQLSTATE, the console
mailer printing invitation tokens, the terms acceptance on the
someone-else path, the UUIDv7 minter into `packages/core`, one way for
route areas to get the database and keys, the turbo test inputs) and J3d
(deletion proved to removal in the suite, the byte-budget gate in CI).
Then the five review loops of BUILD_PROMPT.md section 10 over every
route, logged in `docs/design/QA.md`.

### J3, round one merged (2026-10-09, lead session dfc54107)

The recorded findings were fixed before the fresh audit, three tasks in
one build, review and fix workflow, then merged one at a time through the
queue, each rebased onto the previous merge and regated (`pnpm check`,
the seeded suite, the database-free smoke, CI verify, CodeQL, the preview
smoke against the head deployment):

- #100 (`430ceed`, the lead): the brand spec checks each image in the
  theme that shows it. Since J2b the hidden theme variant of a mark is
  never fetched, and the old check failed on timing (verify on #96).
- J3d (#97, `7b0c038`, production smoke 37914272854): the seeded server
  runs the job runner behind `E2E_JOBS_SCHEDULED_ONLY` (refused on any
  Vercel deployment), so the deletion flow proves an account removed after
  delete now; the byte-budget gate runs in `verify` against the ceilings in
  `apps/web/scripts/perf/budgets.json`. CI verify now takes about 29
  minutes.
- J3c (#99, `02ce5c7`, production smoke 37920744297): a forged cursor on
  the children lists answers a validation problem, not 500 (the cursor
  bound is approved in `openapi/BREAKING.md`, checked with oasdiff 1.33.0);
  `describeError()` keeps the SQLSTATE; the console mailer withholds every
  link; the terms acceptance on the someone-else path (migration
  `0014_profile_terms_acceptance`, additive, applied by the Vercel build);
  one UUIDv7 minter in `packages/core`; every route area receives
  `{ db, keys }` from `registerRoutes`; the turbo test task depends on a
  transit task so a workspace change misses the cache.
- J3b (#98, `ba3f0ba`): sign-in returns to the page asked for through a
  validated `?next=`; continuing period pills fade inside the strip and
  the month grid; the public header's Sign in with the phone disclosure
  menu; one source for the social card alt text; `docs/design/QA.md`
  started with its rows.

Lead rulings: J3d's host switch and its edits outside the file list;
J3c's lockfile change and the removal of the ignored sharing `db`; the
cursor bound as an approved breaking change; the J3b captures reviewed in
both themes. The lead's local `seeded.sh` serves with the job runner
values, and the browser suite needs the CI test `CRON_SECRET`.

### Next action

Round two is running: J3e (copy and visual loops) and J3f (behavior,
motion and sound, performance and privacy), each logging in
`docs/design/QA.md`. Then J4 and J6.

