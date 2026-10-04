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
| P0-1 | Monorepo, web shell in both themes, tokens, brand vectors, sound system | done   | session_019bNAugBr36XyCFxfiZJ2Xv | commits 0b49e33, ca5f9db; `pnpm check` and `pnpm test:e2e` green |
| P0-2 | Hono API mounted at `/api`, health route, OpenAPI 3.1, problem details  | done   | same                             | `openapi/v1.json`; `packages/api/src/app.test.ts`                |
| P0-3 | Core date, cycle, pregnancy math and `can()` with tests                 | done   | same                             | 19 unit tests in `packages/core`                                 |
| P0-4 | CI, deployment smoke, CodeQL, Renovate, PR template                     | done   | same                             | `.github/workflows/*`                                            |
| P0-5 | Skills vendored; AGENTS.md, CLAUDE.md, humanize.md                      | done   | same                             | `.agents/skills/*`, validator passed                             |
| P0-6 | Architecture record, source analysis, research findings                 | done   | same                             | `docs/ARCHITECTURE.md`, `docs/research/*`                        |

## Phase 1: household release

### A. Intake and environments

| Id  | Task                                                                                                                                                                                       | Needs  | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- | -------- |
| A1  | Repository intake: read the documents, run `pnpm check` and `pnpm test:e2e`, record versions and results in the progress log                                                               |        | todo   |       |          |
| A2 | Owner: connect the Vercel project (`apps/web` root, Node 24, `iad1`), record which plan the team is on (Hobby or Pro), set a usage alert, and confirm `deploy-verify.yml` passed on a preview; agent logs the `deployment` event payload once |  | todo |  |  |
| A3 | Owner: Neon project on Postgres 18 with `production`, `staging` and `dev` branches, history retention 7 days on production, a consumption notification set; `DATABASE_URL` (the `tidefern_app` role, after the first migration) and `DATABASE_URL_UNPOOLED` in Vercel and `.env.local` | A2 | todo |  |  |
| A4 | Neon's Vercel integration installed on the project: a branch per preview deployment from `staging` with injected `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; Vercel build command set to `pnpm db:migrate && next build` | A3, B1 | todo |  |  |
| A5  | GitHub repository settings: required checks, secret scanning with push protection, `VERCEL_AUTOMATION_BYPASS_SECRET`                                                                       | A2     | todo   |       |          |

### B. Data layer (`packages/db`)

| Id  | Task                                                                                                                                       | Needs    | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ----- | -------- |
| B1 | Package skeleton: drizzle config, pooled client with `attachDatabasePool`, migration runner, root `db:generate`, `db:migrate`, `db:seed` scripts, the hand-written first migration creating `tidefern_app` with its grants, `withActor()` and `withSystem()` helpers, PGlite test harness. Accepts: `pnpm db:migrate` applies the committed journal to PGlite in the harness | A1 | todo |  |  |
| B2 | Identity and profile schema: generated Better Auth tables, `profiles` with time zone, stage and units, `subject_keys` | B1, C1 | todo |  |  |
| B3 | Relationship schema: `households`, `household_members`, `invitations`, `grants` with `child_id`, `consents` | B1 | todo |  |  |
| B4  | Cycle schema: `cycle_entries`, `entry_symptoms`, `cycle_predictions`, vocabulary seed                                                      | B1       | todo   |       |          |
| B5  | Pregnancy schema: `pregnancies`, `pregnancy_events`                                                                                        | B1       | todo   |       |          |
| B6  | Children schema: `children`, `child_guardians`, `child_events`, `child_measurements`                                                       | B1       | todo   |       |          |
| B7  | Platform schema: `notes`, `photos` (metadata only), `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`          | B1       | todo   |       |          |
| B8 | RLS with `FORCE ROW LEVEL SECURITY`, split policies and the `can_read()` and `can_write()` helpers on every user-data table, with PGlite tests for owner, grant levels (a `summary` grantee cannot insert), revoked grants, per-child scoping, private journal, zero rows for a foreign subject and role reset | B2 to B7 | todo |  |  |
| B9 | Deterministic seed script: named personas, dates relative to a frozen "today", two households covering every stage and grant state, encrypted notes written with a development KEK, verified users for browser tests | B2 to B7, D2 | todo |  |  |
| B10 | On a real Neon branch, from the pooled `tidefern_app` connection: record `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN (current_user, 'tidefern_app')`, confirm `SET LOCAL ROLE` and `set_config` behave through the pooler, and confirm a foreign subject returns zero rows | A3, B8 | todo |  |  |

### C. Identity (`packages/auth`)

| Id  | Task                                                                                                                                                                                           | Needs  | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| C1  | Better Auth server config (email and password with verification, `revokeSessionsOnPasswordReset`, passkey, TOTP, database rate limiting, 7-day sessions) and `npx auth@latest generate` output | B1     | todo   |       |          |
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
| E9 | `packages/api-client` generated from the spec, root `client:generate` and `client:check`, and the `oasdiff/oasdiff-action/breaking` step in `ci.yml` | E2 to E8 | todo |  |  |

### F. Domain (`packages/core`)

| Id  | Task                                                                                                                   | Needs | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- |
| F1  | Growth percentiles from WHO (0 to 24 months) and CDC (2 years and up) LMS tables, with attribution and unit conversion | A1    | todo   |       |          |
| F2 | Stage transitions and the pregnancy-ending rules of architecture 8.4. Accepts: `ended_reason` never leaves the owner's own responses; partner views return the paused state; queued reminders cancelled in the same transaction; stage becomes `postpartum` after birth and `cycle` otherwise; predictions cleared and `predictCycle(starts, { since })` used until a later period is logged; `none` stage never asked a body question; due-date changes appended to `due_date_changes`; unit tests for each | A1 | todo |  |  |
| F3  | Policy list filters: allowed subjects and categories for list endpoints                                                | A1    | todo   |       |          |

### G. Design system (lead only)

| Id  | Task                                                                                                                                               | Needs  | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| G1  | Research record from the galleries and product references named in the build prompt, with evidence paths, in `docs/design/RESEARCH.md`             | A1     | todo   |       |          |
| G2  | Design contract in `docs/design/DESIGN.md`: compositions compared, page map, desktop and phone sketches per screen, component list, states, motion | G1     | todo   |       |          |
| G3  | Typography specimens (Newsreader and Figtree beside two alternates each) and the decision record in `docs/design/TYPOGRAPHY.md`                    | G1     | todo   |       |          |
| G4 | Brand assets, each listed in `docs/design/ASSETS.md` with source and status: `tidefern-lockup.svg` and its dark variant (Newsreader 500 outlined, swash f redrawn), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (small mark centered in the 80 percent safe zone on Mist), `apple-touch-icon.png` 180 px, `favicon.ico` 16 and 32 px from the small mark, `og-default.png` 1200 by 630 from the lockup with one line of copy; `/design/brand` chapter with clear space, minimum sizes, misuse grid and approval status | G2 | todo |  |  |
| G5 | Shared component library. Accepts: every component named in `docs/ARCHITECTURE.md` section 13.7, including the app shell (tab bar, rail, quick-log), exists with all eight states in both themes; data marks use the `data-*` tokens; `pnpm tokens:contrast` passes | G2 | todo |  |  |
| G6  | `/design/color`, `/design/type`, `/design/components`, `/design/motion`, `/design/foundations` chapters built from real components                 | G5     | todo   |       |          |
| G7  | `/design/sound` chapter, quiet hours, sound unit and browser tests                                                                                 | G5     | todo   |       |          |
| G8  | Exports: `reference.md`, catalog JSON, tokens; link check and coverage review                                                                      | G6, G7 | todo   |       |          |

### H. Product screens (lead or delegated by the lead per screen)

| Id  | Task                                                                                                                                                                     | Needs          | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ | ----- | -------- |
| H1  | `/welcome` onboarding with separate collection consent, time zone, stage, first dates, optional passkey                                                                  | C3, E2, G5     | todo   |       |          |
| H2 | `/today`. Accepts: shows cycle day or pregnancy week, the prediction with uncertainty and the estimate sentence, the quick log, and what each partner can see right now; empty state before the first log | E2, E3, E4, E7, G5 | todo |  |  |
| H3 | `/calendar` and `/log/[date]`. Accepts: month and list views, predicted period and fertile window drawn with uncertainty and the contraception line, the `first_guess` and `not_enough_regular_cycles` states shown honestly, tap a day to open the sheet, flow, symptoms, mood, and a note saved as its own private row with an explicit share action, all with honest pending and failure states | E3, E6, G5 | todo |  |  |
| H4 | `/journey`. Accepts: week-by-week view from the due date, dating method and due-date history visible to her, appointments and milestones, the end-of-pregnancy path of architecture 8.4 (reason private, partner view paused with no notification, reminders cancelled, quiet `/today` card, no fertile window until a later period), postpartum view after birth with the child's age and no prediction | E4, F2, G5 | todo |  |  |
| H5 | `/family` and `/family/[childId]`. Accepts: children with guardians, feeds, sleep, milestones, measurements with WHO or CDC percentile bands and unit toggle, per-child timeline | E5, G5 | todo |  |  |
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
| J1  | Playwright suites per flow (auth, onboarding, logging, sharing, settings, deletion), axe in both themes, keyboard paths, 320 px reflow | H1 to H9 | todo   |       |          |
| J2  | Lighthouse on the production build with recorded conditions; budgets met or explained                                                  | H1 to H9 | todo   |       |          |
| J3  | Review loops (copy, visual, behavior, motion, performance) logged in `docs/design/QA.md` with screenshots                              | J1       | todo   |       |          |
| J4  | `docs/LAUNCH_RUNBOOK.md` completed with precise remaining owner inputs                                                                 | J3       | todo   |       |          |
| J5  | Uptime workflow for `/` and `/api/v1/health`                                                                                           | A2       | todo   |       |          |
| J6 | Final handoff: preview link, screenshots, verified results, open items | J1 to J5, J7 | todo |  |  |
| J7 | Owner with agent: restore rehearsal per the runbook's Restore section (branch from production at a timestamp, point one preview at it, run the smoke suite, record the time, delete the branch) | A3, J1 | todo |  |  |
| J8 | `docs/INCIDENT.md` (contain, preserve, assess, notify per the HBNR row in architecture 9.6 with the 16 CFR 318.6 notice template, review) and `docs/CLAIMS.md` (what the product may and may not say: wellness only, no contraception or conception claims, the pointing-to-care sentence, every public privacy claim with its architecture row); both marked for the owner's attorney | H9 | todo |  |  |
