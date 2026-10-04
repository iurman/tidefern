# Build progress

Append-only log. Newest entry last. Each entry records the date, the agent,
what changed, the commands and their results, decisions with reasons, open
findings and the next concrete action. Resume from the last entry and
`git status`.

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
tests green. Remaining: the research completeness critic, then the final
regeneration of `docs/research/RESEARCH.md`.
