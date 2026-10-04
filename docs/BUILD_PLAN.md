# Tidefern build plan

The tracked task list for the Phase 1 build. `docs/BUILD_PROMPT.md` says
how to work; this file says what is left. `docs/BUILD_PROGRESS.md` is the
narrative log.

## Protocol

1. Before starting a task, set its Status to `claimed` and its Owner to your
   agent name or handle in the same commit as your first change, or in a
   small commit of its own. Never work on a task someone else has claimed.
2. Move it to `in progress` when code lands on a branch, `blocked` with a
   note when you cannot proceed, and `done` only when the Evidence column
   points at something real: a merged pull request, a passing command with
   its output recorded in the progress log, a screenshot path in
   `docs/design/qa/`.
3. Keep dependencies honest. A task whose `Needs` column lists an open task
   cannot be claimed until that task is `done`.
4. Add tasks when you discover them. Give them the next id in their group,
   never renumber existing ids.
5. One lead agent owns groups G and H (visual direction and shared UI).
   Subagents may take any task in B through F, I and J whose files do not
   overlap with an open task.

Status values: `todo`, `claimed`, `in progress`, `blocked`, `done`.

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
| A2  | Confirm the Vercel project (`apps/web` root, Node 24, `iad1`) is connected and that `deploy-verify.yml` passed on a preview; log the `deployment` event payload once                       |        | todo   |       |          |
| A3  | Neon project on Postgres 18 with `production`, `staging` and `dev` branches; `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel and `.env.local`; history retention 7 days on production | A2     | todo   |       |          |
| A4  | `neon-preview.yml`: branch per pull request from `staging` with expiry, migrate and seed, delete on close                                                                                  | A3, B1 | todo   |       |          |
| A5  | GitHub repository settings: required checks, secret scanning with push protection, `VERCEL_AUTOMATION_BYPASS_SECRET`                                                                       | A2     | todo   |       |          |

### B. Data layer (`packages/db`)

| Id  | Task                                                                                                                                       | Needs    | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ----- | -------- |
| B1  | Package skeleton: drizzle config, pooled client with `attachDatabasePool`, migration runner, `withActor()` helper, PGlite test harness     | A1       | todo   |       |          |
| B2  | Identity and profile schema: generated Better Auth tables, `profiles` with time zone, stage, units, DEK columns                            | B1, C1   | todo   |       |          |
| B3  | Relationship schema: `households`, `household_members`, `invitations`, `grants`, `consents`                                                | B1       | todo   |       |          |
| B4  | Cycle schema: `cycle_entries`, `entry_symptoms`, `cycle_predictions`, vocabulary seed                                                      | B1       | todo   |       |          |
| B5  | Pregnancy schema: `pregnancies`, `pregnancy_events`                                                                                        | B1       | todo   |       |          |
| B6  | Children schema: `children`, `child_guardians`, `child_events`, `child_measurements`                                                       | B1       | todo   |       |          |
| B7  | Platform schema: `notes`, `photos` (metadata only), `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`          | B1       | todo   |       |          |
| B8  | RLS policies and `can_read()` helper on every user-data table, with PGlite tests for owner, grant, revoked, private journal and role reset | B2 to B7 | todo   |       |          |
| B9  | Seed script with two synthetic households covering every stage and grant state                                                             | B2 to B7 | todo   |       |          |
| B10 | Verify `SET LOCAL ROLE` and `set_config` through Neon's pooler on a real branch; record the result                                         | A3, B8   | todo   |       |          |

### C. Identity (`packages/auth`)

| Id  | Task                                                                                                                                                                                           | Needs  | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| C1  | Better Auth server config (email and password with verification, `revokeSessionsOnPasswordReset`, passkey, TOTP, database rate limiting, 7-day sessions) and `npx auth@latest generate` output | B1     | todo   |       |          |
| C2  | Mount at `/auth/*` in the Hono app before `/v1`; session middleware that loads the actor with guardianships and grants                                                                         | C1, B3 | todo   |       |          |
| C3  | React client with passkey and 2FA plugins; sign up, sign in, verify, reset and sign out screens with honest pending and failure states                                                         | C2     | todo   |       |          |
| C4  | Devices screen (list, revoke one, revoke others) and TOTP enrollment with backup codes                                                                                                         | C3     | todo   |       |          |
| C5  | Email transport: Resend in preview and production, console locally; generic verification and reset templates                                                                                   | C1     | todo   |       |          |

### D. Encryption (`packages/crypto`)

| Id  | Task                                                                                                                                                                           | Needs  | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- | -------- |
| D1  | Envelope encryption module: `KeyProvider` interface, `EnvKeyProvider`, AES-256-GCM with AAD, versioned ciphertext, tests for round trip, tamper, AAD mismatch and crypto-shred | A1     | todo   |       |          |
| D2  | DEK provisioning on account creation; field helpers used by the API for notes, captions and free text                                                                          | D1, B2 | todo   |       |          |

### E. API contract (`packages/api`, `packages/schemas`, `packages/api-client`)

| Id  | Task                                                                                         | Needs      | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------- | ---------- | ------ | ----- | -------- |
| E1  | Middleware: actor context, idempotency keys, audit writer, allowlist logger                  | C2, B7     | todo   |       |          |
| E2  | Profile and consents routes                                                                  | E1, B2     | todo   |       |          |
| E3  | Cycle routes: entries by date range, upsert day, predictions, vocabulary                     | E1, B4     | todo   |       |          |
| E4  | Pregnancy routes: start, dating, events, end with reason                                     | E1, B5     | todo   |       |          |
| E5  | Children routes: children, guardians, events, measurements with percentiles                  | E1, B6, F1 | todo   |       |          |
| E6  | Notes routes with encryption and category rules                                              | E1, D2     | todo   |       |          |
| E7  | Sharing routes: invitations (hashed single-use tokens), grants, revocation, remove partner   | E1, B3     | todo   |       |          |
| E8  | Activity, export request, account deletion request routes                                    | E1, B7     | todo   |       |          |
| E9  | `packages/api-client` generated from the spec with a drift gate and `oasdiff breaking` in CI | E2 to E8   | todo   |       |          |

### F. Domain (`packages/core`)

| Id  | Task                                                                                                                   | Needs | Status | Owner | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- |
| F1  | Growth percentiles from WHO (0 to 24 months) and CDC (2 years and up) LMS tables, with attribution and unit conversion | A1    | todo   |       |          |
| F2  | Stage transitions (cycle to pregnancy, pregnancy to postpartum, loss handling) and prediction suppression rules        | A1    | todo   |       |          |
| F3  | Policy list filters: allowed subjects and categories for list endpoints                                                | A1    | todo   |       |          |

### G. Design system (lead only)

| Id  | Task                                                                                                                                               | Needs  | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- | -------- |
| G1  | Research record from the galleries and product references named in the build prompt, with evidence paths, in `docs/design/RESEARCH.md`             | A1     | todo   |       |          |
| G2  | Design contract in `docs/design/DESIGN.md`: compositions compared, page map, desktop and phone sketches per screen, component list, states, motion | G1     | todo   |       |          |
| G3  | Typography specimens (Newsreader and Figtree beside two alternates each) and the decision record in `docs/design/TYPOGRAPHY.md`                    | G1     | todo   |       |          |
| G4  | Brand assets: approved or reconstructed mark, favicon and PWA icons, 1200 by 630 social card, `/design/brand` chapter                              | G2     | todo   |       |          |
| G5  | Shared component library with every state in both themes                                                                                           | G2     | todo   |       |          |
| G6  | `/design/color`, `/design/type`, `/design/components`, `/design/motion`, `/design/foundations` chapters built from real components                 | G5     | todo   |       |          |
| G7  | `/design/sound` chapter, quiet hours, sound unit and browser tests                                                                                 | G5     | todo   |       |          |
| G8  | Exports: `reference.md`, catalog JSON, tokens; link check and coverage review                                                                      | G6, G7 | todo   |       |          |

### H. Product screens (lead or delegated by the lead per screen)

| Id  | Task                                                                                                                                                                     | Needs          | Status | Owner | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ | ----- | -------- |
| H1  | `/welcome` onboarding with separate collection consent, time zone, stage, first dates, optional passkey                                                                  | C3, E2, G5     | todo   |       |          |
| H2  | `/today`                                                                                                                                                                 | E3, E4, G5     | todo   |       |          |
| H3  | `/calendar` and `/log/[date]`                                                                                                                                            | E3, G5         | todo   |       |          |
| H4  | `/journey` pregnancy and postpartum                                                                                                                                      | E4, G5         | todo   |       |          |
| H5  | `/family` and `/family/[childId]` with growth chart                                                                                                                      | E5, G5         | todo   |       |          |
| H6  | `/sharing` with grant descriptions and the invitation flow                                                                                                               | E7, G5         | todo   |       |          |
| H7  | `/settings`: profile, units, theme with follow-system, sound, notification level, devices, export, delete                                                                | E2, E8, C4, G5 | todo   |       |          |
| H8  | `/activity`                                                                                                                                                              | E8, G5         | todo   |       |          |
| H9  | Public pages: home refresh, `/privacy` (consumer health data policy draft with owner inputs listed), `/terms`, `/accessibility`, `/account/delete`, 404 and error polish | G2             | todo   |       |          |
| H10 | Reminder emails through the outbox with the three-level detail setting                                                                                                   | I1, C5         | todo   |       |          |

### I. Jobs

| Id  | Task                                                                                                                 | Needs      | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----- | -------- |
| I1  | Outbox table, inline drain with `after()`, cron endpoint with `CRON_SECRET`, `vercel.json` schedule, `pnpm jobs:run` | B7         | todo   |       |          |
| I2  | Export and account deletion state machines, DEK destruction first, co-guardian transfer                              | I1, E8, D2 | todo   |       |          |

### J. Quality and release

| Id  | Task                                                                                                                                   | Needs    | Status | Owner | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----- | -------- |
| J1  | Playwright suites per flow (auth, onboarding, logging, sharing, settings, deletion), axe in both themes, keyboard paths, 320 px reflow | H1 to H9 | todo   |       |          |
| J2  | Lighthouse on the production build with recorded conditions; budgets met or explained                                                  | H1 to H9 | todo   |       |          |
| J3  | Review loops (copy, visual, behavior, motion, performance) logged in `docs/design/QA.md` with screenshots                              | J1       | todo   |       |          |
| J4  | `docs/LAUNCH_RUNBOOK.md` completed with precise remaining owner inputs                                                                 | J3       | todo   |       |          |
| J5  | Uptime workflow for `/` and `/api/v1/health`                                                                                           | A2       | todo   |       |          |
| J6  | Final handoff: preview link, screenshots, verified results, open items                                                                 | J1 to J5 | todo   |       |          |
