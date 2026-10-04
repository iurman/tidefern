# Tidefern build plan

The tracked task list for the Phase 1 build. `docs/BUILD_PROMPT.md` says
how to work; this file says what is left. `docs/BUILD_PROGRESS.md` is the
narrative log.

## Protocol

1. A claim is two things: the Status `claimed` and Owner edit on a branch
   named `claude/<id>-<topic>`, committed on its own, and an open draft
   pull request whose title begins with the id. Before claiming, run `git
   fetch origin`, read `origin/main:docs/BUILD_PLAN.md` (not your working
   copy), then check open pull requests and remote branches
   (`claude/<id>-*`) for the id. If any shows it, the task is taken; on a
   tie the lower pull request number wins and the other agent closes
   theirs. Never work on a task someone else has claimed.
2. Move it to `in progress` when code lands on the branch, `blocked` with a
   note when you cannot proceed, and `done` only when the Evidence column
   points at something real: a merged pull request, a passing command with
   its output recorded in the progress log, a screenshot path in
   `docs/design/qa/`.
3. Keep dependencies honest. `Needs` is read from `origin/main`; a task
   whose `Needs` lists a task that is not `done` there cannot be claimed.
4. Add tasks when you discover them. Give them the next id in their group,
   never renumber existing ids. Every new generated file adds its check to
   the root `check` script and to the "Generated files" step of `ci.yml`
   in the same pull request.
5. One lead agent owns groups G and H (visual direction and shared UI).
   Subagents may take any task in B through F, I and J. Each group names
   the paths it touches; two open tasks never share a path. Plan and log
   edits go in their own small commits so they merge cleanly.

Paths by group: A touches `docs/`, `.github/`, `apps/web/vercel.json`; B
touches `packages/db/`; C touches `packages/auth/` and
`apps/web/src/lib/auth-client.ts`; D touches `packages/crypto/`; E touches
`packages/api/`, `packages/schemas/`, `packages/api-client/`,
`openapi/`; F touches `packages/core/`; G touches `packages/design-tokens/`,
`apps/web/src/app/design/`, `apps/web/src/components/`,
`apps/web/src/app/globals.css`, `docs/design/`; H touches the named route
directories under `apps/web/src/app/`; I touches `packages/api/src/jobs/`
and `packages/db/src/schema/jobs.ts`; J touches `apps/web/tests/`,
`docs/design/QA.md`, `docs/LAUNCH_RUNBOOK.md`, `.github/workflows/`.

Status values: `todo`, `claimed`, `in progress`, `blocked`, `done`.

Owner tasks: A2, A3, A6, B10 (the Neon side), J7 and anything that needs
Vercel or Neon access the build agent does not hold. An agent records
what the owner must do, marks the task `blocked` with that note, and moves
on; it never sits waiting on them.

## Phase 0: foundation (done 2026-10-04)

| Id   | Task                                                                    | Status | Owner                            | Evidence                                                         |
| ---- | ----------------------------------------------------------------------- | ------ | -------------------------------- | ---------------------------------------------------------------- |
| P0-1 | Monorepo, web shell in both themes, typed tokens with the contrast gate, brand vectors, tri-state sound system, system theme without JavaScript | done | session_019bNAugBr36XyCFxfiZJ2Xv | commits 0b49e33 through 75d4e43; `pnpm check` and 12 browser tests green |
| P0-2 | Hono API mounted at `/api`, health route, OpenAPI 3.1, problem details  | done   | same                             | `openapi/v1.json`; `packages/api/src/app.test.ts`                |
| P0-3 | Core date, time zone and week start helpers, cycle estimates with the six day window and bands, pregnancy dating with ACOG redating, units, and `can()` with tests | done | same | 32 unit tests in `packages/core` |
| P0-4 | CI (digest-pinned, manual trigger), deployment smoke, CodeQL, Renovate with version guards, PR template; workflows register once the foundation is merged to `main` | done | same | `.github/workflows/*` |
| P0-5 | Skills vendored and gated; AGENTS.md, CLAUDE.md, humanize.md | done | same | `.agents/skills/*`, `pnpm skills:check` passed |
| P0-6 | Architecture record, source analysis, research findings, six-lens review and verification pass integrated | done | same | `docs/ARCHITECTURE.md`, `docs/research/*`, `docs/BUILD_PROGRESS.md` |
| P0-7 | Draft `/privacy` and `/health-privacy` pages linked from the footer with a smoke test | done | same | `apps/web/src/app/health-privacy/page.tsx`, browser test |

## Phase 1: household release

### A. Intake and environments

| Id  | Task                                                                                                                                                                                       | Needs  | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- | -------- |
| A1  | Repository intake: read the documents, run `pnpm check` and `pnpm test:e2e`, record versions and results in the progress log                                                               |        | todo   |       |          |
| A2 | Owner: connect the Vercel project (`apps/web` root, Node 24, `iad1`), record which plan the team is on (Hobby or Pro), set a usage alert, and confirm `deploy-verify.yml` passed on a preview; agent logs the `deployment` event payload once |  | todo |  |  |
| A3 | Owner: Neon project on Postgres 18 with `production`, `staging` and `dev` branches, history retention 7 days on production, a consumption notification set; `DATABASE_URL` (the `tidefern_app` role, after the first migration) and `DATABASE_URL_UNPOOLED` in Vercel and `.env.local` | A2 | todo |  |  |
| A4 | Neon's Vercel integration installed on the project with `staging` as the Neon default branch (the integration forks previews from the default branch) and production as a protected non-default branch; record whether the integration can point production variables at it or they are set by hand; injected `DATABASE_URL` and `DATABASE_URL_UNPOOLED` per preview; the staging KEK value in the preview scope; Vercel build command `pnpm -w db:migrate && next build` | A3, B1 | todo |  |  |
| A5  | GitHub repository settings: required checks, secret scanning with push protection, `VERCEL_AUTOMATION_BYPASS_SECRET`                                                                       | A2     | todo   |       |          |

### B. Data layer (`packages/db`)

| Id  | Task                                                                                                                                       | Needs    | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ----- | -------- |
| B1 | Package skeleton: drizzle config with `entities.roles: { provider: "neon" }`, pooled client (`max` 2, `idleTimeoutMillis` 5000) with `attachDatabasePool`, migration runner, root `db:generate`, `db:migrate`, `db:seed` scripts, the custom first migration (`drizzle-kit generate --custom`) creating `tidefern_app` with its grants and default privileges, `withActor()` and `withSystem()` helpers, the ESLint restriction on direct `db` use in route code, PGlite test harness. Accepts: `pnpm db:migrate` applies the committed journal to PGlite in the harness | A1 | todo |  |  |
| B2 | Identity and profile schema: generated Better Auth tables, `profiles` with time zone, stage and units, `subject_keys` | B1, C1 | todo |  |  |
| B3 | Relationship schema: `households`, `household_members`, `invitations`, `grants` with `child_id`, `consents` | B1 | todo |  |  |
| B4  | Cycle schema: `cycle_entries`, `entry_symptoms`, `cycle_predictions`, vocabulary seed                                                      | B1       | todo   |       |          |
| B5  | Pregnancy schema: `pregnancies`, `pregnancy_events`                                                                                        | B1       | todo   |       |          |
| B6  | Children schema: `children`, `child_guardians`, `child_events`, `child_measurements`                                                       | B1       | todo   |       |          |
| B7  | Platform schema: `notes`, `photos` (metadata only), `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`          | B1       | todo   |       |          |
| B8 | RLS with `FORCE ROW LEVEL SECURITY`, split policies and the `can_read()` and `can_write()` helpers on every user-data table, with PGlite tests for owner, grant levels (a `summary` grantee cannot insert), revoked grants, per-child scoping, private journal, zero rows for a foreign subject and role reset | B2 to B7 | todo |  |  |
| B9 | Deterministic seed script: named personas, dates relative to a frozen "today", two households covering every stage and grant state, encrypted notes written with a development KEK, verified users for browser tests | B2 to B7, D2 | todo |  |  |
| B10 | On a real Neon branch and on a preview branch, from the injected and the `tidefern_app` connections: record `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN (current_user, 'tidefern_app')`, confirm `SET LOCAL ROLE` and `set_config` behave through the pooler, and confirm a foreign subject returns zero rows inside `withActor()` on both | A3, A4, B8 | todo |  |  |
| B11 | CI topology for authenticated browser tests: a `postgres:18.6` service container in `verify`, migrate and seed before `pnpm build`, non-secret test values (`E2E_MAIL_CAPTURE`, `TIDEFERN_FAKE_NOW`, a fixed test KEK, `BETTER_AUTH_SECRET`, `LOG_HMAC_SECRET`) as job env already declared in `turbo.json`, a Playwright rule that `@smoke` tests never authenticate, and `next start` receiving the env explicitly | B1, B9, C1 | todo |  |  |
| B12 | Migration safety: the runner refuses `DROP`, `RENAME`, `ALTER COLUMN ... TYPE` and `TRUNCATE` without `MIGRATE_DESTRUCTIVE=1`; `.github/workflows/migrate-production.yml` (`workflow_dispatch`, owner only) runs a named contract migration against production after the owner notes a restore point; unit test for the refusal | B1 | todo |  |  |

### C. Identity (`packages/auth`)

| Id  | Task                                                                                                                                                                                           | Needs  | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| C1 | Better Auth server config (email and password with verification, `revokeSessionsOnPasswordReset`, passkey, TOTP without `trustDevice`, database rate limiting, 7-day sessions, the multi-host `baseURL` with the narrow preview pattern, `telemetry.enabled: false`, adapter from `@better-auth/drizzle-adapter`) and `npx auth@latest generate` output | B1 | todo |  |  |
| C2 | Mount at `/auth/*` in the Hono app before `/v1`; session middleware that loads the actor with guardianships and grants; fresh-authentication checks for deletion, export, grants, invitations, devices and credential changes | C1, B3, B6 | todo |  |  |
| C3  | React client with passkey and 2FA plugins; sign up, sign in, verify, reset and sign out screens with honest pending and failure states                                                         | C2     | todo   |       |          |
| C4  | Devices screen (list, revoke one, revoke others) and TOTP enrollment with backup codes                                                                                                         | C3     | todo   |       |          |
| C5 | Email transport: Resend in production, console locally and in previews; generic verification and reset templates; the `E2E_MAIL_CAPTURE` endpoint for browser tests, never on Vercel production | C1 | todo |  |  |

### D. Encryption (`packages/crypto`)

| Id  | Task                                                                                                                                                                           | Needs  | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- | -------- |
| D1 | Envelope encryption module: `KeyProvider` interface, `EnvKeyProvider` reading `TIDEFERN_KEK_V1` (tests inject a fixed key and never read the environment), AES-256-GCM with AAD, versioned ciphertext, tests for round trip, tamper, AAD mismatch and crypto-shred | A1 | todo |  |  |
| D2 | DEK provisioning for users at sign-up and children at creation; field helpers used by the API for notes, captions and free text | D1, B2 | todo |  |  |

### E. API contract (`packages/api`, `packages/schemas`, `packages/api-client`)

| Id  | Task                                                                                         | Needs      | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------- | ---------- | ------ | ----- | -------- |
| E1 | Middleware: actor context, cross-site request checks, per-actor rate limit on mutations, idempotency keys that never store bodies, audit writer with per-day dedupe, HMAC allowlist logger | C2, B7 | todo |  |  |
| E2  | Profile and consents routes                                                                  | E1, B2     | todo   |       |          |
| E3  | Cycle routes: entries by date range, upsert day, predictions, vocabulary                     | E1, B4     | todo   |       |          |
| E4  | Pregnancy routes: start, dating, events, end with reason                                     | E1, B5     | todo   |       |          |
| E5  | Children routes: children, guardians, events, measurements with percentiles                  | E1, B6, F1 | todo   |       |          |
| E6  | Notes routes with encryption and category rules                                              | E1, D2     | todo   |       |          |
| E7 | Sharing routes: invitations (hashed single-use tokens bound to the invitee email, accepted only by POST after sign-in), grants with `child_id`, revocation, remove partner | E1, B3 | todo |  |  |
| E8 | Activity (cursor paginated), on-demand streamed export, account closure with the undo window, all behind fresh authentication | E1, B7 | todo |  |  |
| E9 | `packages/api-client` generated from the spec with openapi-typescript 7.13 and openapi-fetch 0.17 (TypeScript stays 6.0.x; the 7.x package has no compiler API), root `client:generate` and `client:check` (`--check` in CI), and the `oasdiff/oasdiff-action/breaking` step in `ci.yml` pinned by digest with `fail-on: ERR` and `review: false` | E2 to E8 | todo |  |  |

### F. Domain (`packages/core`)

| Id  | Task                                                                                                                   | Needs | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- |
| F1 | One LMS growth engine with two vendored datasets: the WHO birth to 24 month LMS files from CDC's hosting (attributed to WHO and CDC) under 730 days, CDC charts after (MMWR 2010), published z-score and percentile formulas, the WHO plus or minus 3 SD tail adjustment for weight-based indicators, extremes labelled 2.3rd and 97.7th; `packages/core/data/SOURCES.md` with "Source: CDC" and the non-endorsement sentence, WHO attribution and the permission note; tests against CDC's worked example (9-month male, 5th percentile 7.90 kg) | A1 | todo |  |  |
| F4 | CDC 2022 milestone checklists (12 ages, 159 items) as versioned JSON with the 75 percent framing, a corrected-age option, the permanent "not a screening tool" line and CDC attribution; text captured by hand from the CDC booklet, photos and videos excluded | A1 | todo |  |  |
| F2 | Stage transitions and the pregnancy-ending rules of architecture 8.4. Accepts: `ended_reason` never leaves the owner's own responses; partner views return the paused state; queued reminders cancelled in the same transaction; stage becomes `postpartum` after birth and `cycle` otherwise; predictions cleared and `predictCycle(starts, { since })` used until a later period is logged; `none` stage never asked a body question; due-date changes appended to `due_date_changes`; unit tests for each | A1 | todo |  |  |
| F3  | Policy list filters: allowed subjects and categories for list endpoints                                                | A1    | todo   |       |          |

### G. Design system (lead only)

| Id  | Task                                                                                                                                               | Needs  | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| G1  | Research record from the galleries and product references named in the build prompt, with evidence paths, in `docs/design/RESEARCH.md`             | A1     | todo   |       |          |
| G2  | Design contract in `docs/design/DESIGN.md`: compositions compared, page map, desktop and phone sketches per screen, component list, states, motion | G1     | todo   |       |          |
| G3 | Typography specimens of the decided pairing (headings, body, navigation, tabular numerals, outlined wordmark, both themes) for `/design/type`, and `docs/design/TYPOGRAPHY.md` as the decision record citing architecture 13.5 | G1 | todo |  |  |
| G4 | Brand assets generated by `scripts/brand/generate-icons.mjs` (sharp and png-to-ico, outputs committed so Vercel needs no native step) from the mark SVGs, each listed in `docs/design/ASSETS.md` with source and status: `tidefern-lockup.svg` and its dark variant (Newsreader opsz 72 weight 500 outlined, swash f redrawn), `app/favicon.ico` (16, 32, 48), `app/apple-icon.png` 180 px (square, opaque Mist, no own rounding; Next.js names it `apple-icon`), `public/icons/icon-192.png`, `icon-512.png` and `icon-512-maskable.png` (ink inside the central 80 percent circle, 10 percent extra padding on the maskable one) referenced from `manifest.ts` with `purpose` any and maskable, `app/opengraph-image.png` 1200 by 630 (static, lockup inside a 1000 by 500 safe area) with `opengraph-image.alt.txt`, a 1024 px square master for the later store listing kept as separable layers (Mist background, frond and wave foreground) because Apple's current icon guidance assembles layered icons in Icon Composer; no `ImageResponse` route, because Satori cannot parse variable fonts and would need a static instance of Newsreader first; `/design/brand` chapter with clear space equal to the wordmark cap height, minimum sizes (mark 16 px with the small variant below 32 px, lockup 120 px), misuse grid and approval status | G2 | todo |  |  |
| G5 | Shared component library. Accepts: every component named in `docs/ARCHITECTURE.md` section 13.7, including the app shell (tab bar, rail, quick-log), exists with all eight states in both themes; data marks use the `data-*` tokens; `pnpm tokens:contrast` passes | G2 | todo |  |  |
| G6  | `/design/color`, `/design/type`, `/design/components`, `/design/motion`, `/design/foundations` chapters built from real components                 | G5     | todo   |       |          |
| G7  | `/design/sound` chapter, quiet hours, sound unit and browser tests                                                                                 | G5     | todo   |       |          |
| G8  | Exports: `reference.md`, catalog JSON, tokens; link check and coverage review                                                                      | G6, G7 | todo   |       |          |

### H. Product screens (lead or delegated by the lead per screen)

| Id  | Task                                                                                                                                                                     | Needs          | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ | ----- | -------- |
| H1  | `/welcome` onboarding with separate collection consent, time zone, stage, first dates, optional passkey                                                                  | C3, E2, G5     | todo   |       |          |
| H2 | `/today`. Accepts: shows cycle day or pregnancy week, the prediction as a range with the copy templates of architecture 13.10 (estimate, first guess, not enough regular cycles), the ovulation band and the contraception line, the prediction footer, the quick log, what each partner can see right now, the quiet post-pregnancy card, and the empty state before the first log | E2, E3, E4, E7, F2, G5 | todo |  |  |
| H3 | `/calendar` and `/log/[date]`. Accepts: month and list views, predicted period and fertile window drawn with uncertainty and the contraception line, the `first_guess` and `not_enough_regular_cycles` states shown honestly, tap a day to open the sheet, flow, symptoms, mood, and a note saved as its own private row with an explicit share action, all with honest pending and failure states | E3, E6, G5 | todo |  |  |
| H4 | `/journey`. Accepts: week-by-week view from the due date, dating method and due-date history visible to her, appointments and milestones, the end-of-pregnancy path of architecture 8.4 (reason private, partner view paused with no notification, reminders cancelled, quiet `/today` card, no fertile window until a later period), postpartum view after birth with the child's age and no prediction | E4, F2, G5 | todo |  |  |
| H5 | `/family` and `/family/[childId]`. Accepts: children with guardians; feed (breast with side and timer, bottle in ml or oz, solids), diaper and sleep logging; daily counts shown against the AAP and AASM ranges as context, never alarms, and no sleep target before four months; volumes stored in millilitres and shown to 0.5 fl oz or 10 ml; milestones from F4 with the not-a-screening line; measurements with WHO or CDC percentile bands, the unit toggle converting at the edge, and the pointing-to-care sentence when a measurement is far outside its band; per-child timeline | E5, F1, F4, G5 | todo |  |  |
| H6 | `/sharing`. Accepts: each person and category with a plain description of what it reveals before it can be turned on, revoke in one step, invitation sending and withdrawal, acceptance only after sign-in | E7, C5, G5 | todo |  |  |
| H7 | `/settings`. Accepts: profile, time zone and units, theme with follow-system, sound level and quiet hours, notification detail with a lock-screen preview, devices, export, account closure with fresh authentication and the undo window | E2, E8, C4, G5 | todo |  |  |
| H8 | `/activity`. Accepts: sign-ins, devices, grants given and revoked, partner contributions and exports from audit events, cursor paginated, no health content | E8, G5 | todo |  |  |
| H9 | Public pages: home refresh, `/privacy` (account data, device storage, email), `/health-privacy` (only the five RCW 19.373.020 items: categories collected, sources, purposes and uses, categories shared and processors by name, how to exercise each section 11 right, plus the appeal path; owner inputs marked `[OWNER]`; footer link labelled exactly "Consumer Health Data Privacy Policy" on every public page; the `@smoke` test asserts it), `/terms`, `/accessibility`, `/account/delete`, 404 and error polish | G2 | todo |  |  |
| H10 | Reminder emails through the outbox as a daily batch at the owner's chosen hour (Hobby delivers within plus or minus 59 minutes). Accepts: every email generic at every detail level, the setting says so under the control, the detail level changes only in-app text and the lock-screen preview; partner notifications only through the per-person `notify` switch on the grant, default off, generic text; per-time reminders are a Pro follow-up | I1, C5 | todo |  |  |

### I. Jobs

| Id  | Task                                                                                                                 | Needs      | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----- | -------- |
| I1 | Outbox table, inline drain through the API's `defer` callback, `/api/internal/jobs/run` failing closed without `CRON_SECRET` (tested), the daily sweep with retention purges and the dead-queue owner notice, `vercel.json` schedule, root `jobs:run` | B7 | todo |  |  |
| I2 | Account closure state machine: lock and revoke at once, 7-day undo window or delete now, DEK destruction, row and object deletion, co-guardian transfer, processor notification | I1, E8, D2 | todo |  |  |

### J. Quality and release

| Id  | Task                                                                                                                                   | Needs    | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----- | -------- |
| J1 | Playwright suites per flow (auth, onboarding, logging, sharing, settings, deletion) with one sign-in per worker and a shared `storageState`, axe with the `wcag22aa` tags in both themes, keyboard paths, 320 px reflow | H1 to H9 | todo |  |  |
| J2 | Lighthouse 13.x CLI against the production build using the Playwright Chromium (`--chrome-path`), mobile profile, with `@next/bundle-analyzer` for the first-route JavaScript budget; tool version, device profile and throttling recorded with every number; budgets met or explained | H1 to H9 | todo |  |  |
| J3  | Review loops (copy, visual, behavior, motion, performance) logged in `docs/design/QA.md` with screenshots                              | J1       | todo   |       |          |
| J4  | `docs/LAUNCH_RUNBOOK.md` completed with precise remaining owner inputs                                                                 | J3       | todo   |       |          |
| J5 | Uptime workflow for `/` and `/api/v1/health`; `deploy-verify` compares the production deployment's commit with `main` so an active Vercel rollback fails loudly | A2 | todo |  |  |
| J6 | Final handoff: preview link, screenshots, verified results, open items | J1 to J5, J7 | todo |  |  |
| J7 | Owner with agent: restore rehearsal per the runbook's Restore section (branch from production at a timestamp, point one preview at it, run the smoke suite, record the time, delete the branch) | A3, J1 | todo |  |  |
| J8 | `docs/INCIDENT.md` (contain, preserve, assess, notify per the HBNR row in architecture 9.6 with the 16 CFR 318.6 notice template, review) and `docs/CLAIMS.md` (what the product may and may not say: wellness only, no contraception or conception claims, the pointing-to-care sentence, every public privacy claim with its architecture row); both marked for the owner's attorney | H9 | todo |  |  |
