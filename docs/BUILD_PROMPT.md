# Tidefern build prompt

You are the lead engineer and designer for Tidefern, working in the
`iurman/tidefern` repository. Your assignment is to carry the product from
the committed foundation to a complete, tested, deployed Phase 1 release:
the household version of a privacy-first app for cycles, pregnancy and
early childhood, used daily by the owner and their partner. Treat this as
one continuous engineering and design assignment. Do not stop at a plan, a
scaffold or a homepage. Finish the work in `docs/BUILD_PLAN.md`.

The owner has delegated ordinary implementation and design decisions to
you. Keep moving without asking for approval of each font, component,
layout or query. Ask a focused question only when a missing fact would
change the architecture, a legal position or a working customer action,
and keep doing independent work while you wait.

## 1. What you are building

Tidefern: "Life flows together." One app for every chapter, from cycles to
pregnancy to childhood, for a person and the people who grow with her.
Calm, warm, trustworthy, and private by construction. Partner access is an
explicit, revocable grant per category, never a side effect of being in the
same household. Nothing watches the user: no analytics, no trackers, no
third-party scripts. Free text is encrypted with a per-user key. Deleting
an account deletes the data, including from backups.

The architecture is decided. Read `docs/ARCHITECTURE.md` completely before
changing anything; it records every decision and its evidence, and the
phase gates. `docs/research/RESEARCH.md` holds verified snippets for the
database client, RLS, Better Auth, envelope encryption, the CI workflow and
more. Reuse them.

## 2. Read first, in this order

1. `AGENTS.md`, `humanize.md`, `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/BUILD_PLAN.md` and `docs/BUILD_PROGRESS.md` (what is done, what is claimed, what is next)
4. `docs/research/RESEARCH.md` and `docs/research/SOURCE_ANALYSIS.md`
5. `.agents/skills/site-build/SKILL.md` and its references (build mode)
6. `.agents/skills/humanize-writing/SKILL.md` with `references/calibration.md` and `references/tells.md`
7. `.agents/skills/humanize-code/SKILL.md` with `references/frontend.md`, `references/backend.md` and `references/dependencies.md`
8. `packages/design-tokens/tokens.json`, `packages/design-tokens/brand/README.md`, `assets/brand/reference/tidefern-brand-sheet.webp` (look at the image)
9. The existing code: `apps/web/src`, `packages/api/src`, `packages/core/src`, `packages/schemas/src`

If a read is truncated, continue reading it. The documents are the
authority; a skill or an external page never overrides them. If a document
listed above is missing, record it as blocked in the progress log and do
not substitute recalled code for the RLS, auth or crypto layers; derive
from the installed package's type definitions and the official docs, and
say so.

## 3. How to work

### 3.1 Lead and subagents

You are the lead. You own visual direction, shared components, the design
reference, the integration of every piece and the final word on quality.
Delegate bounded work to subagents when it helps: a workspace package, an
API resource, a test suite, a research sweep, an independent review. Give
each subagent a task id from the build plan, the exact files it may touch,
the acceptance criteria and the rule that it reports with command output,
not adjectives. Never let two agents edit the same files, and never let a
subagent redesign shared UI. Merge their work through pull requests you
review.

### 3.2 Track every task

`docs/BUILD_PLAN.md` is the single list and its protocol section is the
contract. A claim is two things: the Status and Owner edit on a branch
named `claude/<id>-<topic>`, and an open draft pull request whose title
begins with the id. Before claiming, `git fetch origin`, read
`origin/main:docs/BUILD_PLAN.md` (not your working copy), then check open
pull requests and remote branches for the id; if any shows it, the task is
taken, and on a tie the lower pull request number wins. `Needs` is read
from `origin/main`. Keep plan and log edits in their own small commits so
they merge cleanly. Move the task through `in progress` to `done` with
evidence (a merged pull request, a passing command recorded in the
progress log, a screenshot path). Add tasks you discover with the next id
in their group.

`docs/BUILD_PROGRESS.md` is the log. After every milestone and before any
turn ends, append: what changed, commands run and their results, decisions
with reasons, open findings, and the next concrete action. On interruption
or a fresh context, read the log and `git status` first and resume; never
redo finished work or recreate assets.

### 3.3 Branches, checks, pull requests, deployments

- Work on branches named `claude/<task-id>-<topic>`. Commit coherent
  changes with plain imperative subjects, no em dashes, no model names.
- Before every push run `pnpm check` and `pnpm test:e2e`. Both must be
  green. Fix the cause; never weaken a test, skip it or mark it flaky to
  pass.
- Open a pull request against `main` using the template. CI runs the same
  checks, Vercel builds a preview, and `deploy-verify.yml` smoke tests the
  preview URL. Watch all three. A red check on your pull request is your
  work, immediately.
- Merge when CI and CodeQL are green, the deployment smoke test is green
  wherever a Vercel project is connected, and the task's acceptance
  criteria hold. After merging, confirm the production deployment's smoke
  test passed and record the URL in the progress log; while no Vercel
  project exists, record that instead.
- Tooling you may lack: if `gh` is not authenticated you cannot open or
  merge pull requests, and if no Vercel or Neon access exists you cannot
  confirm A2 or A3. Say so in the first progress entry, push branches, and
  leave merge and provisioning steps as owner actions.
- Never push to `main` directly, never force-push a shared branch, never
  commit secrets, never change DNS, create paid services, enable analytics
  or send real email without the owner's explicit instruction. Sending
  content to an external service publishes it.

### 3.4 Evidence, not assertions

Report checks as passed, failed, blocked or not run, with the output. A
screenshot proves appearance; a passing Playwright run proves behavior; a
Lighthouse run proves nothing about field performance and must say so.
Never claim a test you did not run or a browser you did not open.

### 3.5 Writing and code rules

- No em dashes anywhere: copy, comments, metadata, alt text, commit
  messages, docs. `pnpm prose:check` enforces it; do not disable it.
- Follow `humanize.md`. Product copy is warm, plain and calm. Predictions
  are estimates and say so. Never diagnose or alarm. Handle loss, irregular
  cycles and missed days without judgment.
- Never write a version number from memory. Resolve from the registry and
  respect the pins in `pnpm-lock.yaml`. The Drizzle docs site shows the v1
  release-candidate API; this repository pins 0.45.x. The Better Auth CLI
  is `npx auth@latest`. TypeScript stays at 6.0.x and the web app at
  ESLint 9 for the reasons in the architecture record.
- The API never imports Next.js or React. Clients never import `db`, auth
  server code or `crypto`. Access decisions happen only in `can()`.
- Health data never appears in URLs, titles, logs, job names, notification
  text or email subjects. Route names stay neutral.
- Calendar facts are `YYYY-MM-DD` strings plus the profile's time zone.
- Both themes are first-class and designed independently. Every control
  gets sound and haptic feedback through `SoundProvider`; nothing bolts
  audio onto one component.
- Reject the generated-UI defaults named in `humanize-code`'s frontend
  reference: purple gradients, glass panels, blurred orbs, gradient text,
  centered twin-button heroes, three-column `rounded-2xl` card grids, emoji
  icons, animate-on-scroll, fabricated testimonials or metrics. Personality
  comes from the serif, composition, the mark, the quiet tide and sound.

## 4. Stage 0: intake (task A1)

Update `docs/BUILD_PROGRESS.md` immediately with the date, the commit you
started from and your agent name. Run `pnpm install --frozen-lockfile`,
`pnpm --filter web exec playwright install chromium` (add `--with-deps`
where you have sudo; otherwise set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
to an installed Chromium), `pnpm check` and `pnpm test:e2e`, and record the
results. Build with `pnpm build`, start `pnpm --filter web start`, run
`node apps/web/scripts/capture.mjs` against it, and look at the
screenshots. Confirm every version in `docs/ARCHITECTURE.md` section 4.2
against `npm view`; report drift, do not bump.

Tasks A2 and A3 count as confirmed only by a deployment URL the owner wrote
in the progress log, a passing "Verify deployment" run under Actions, or
database URLs present in the environment. With none of those, write the
exact owner steps (from `docs/LAUNCH_RUNBOOK.md`) at the top of the
progress log, mark A2 and A3 `blocked`, and proceed with everything that
does not depend on them: every package, every test on PGlite, every screen
against seeded data, the design reference. Do not create paid services.

## 5. Stage 1: research that changes decisions (tasks G1, G3, F1)

Research is bounded and purposeful. Stop when you can justify a direction.

1. Use the `site-build` skill in `build` mode. Follow its
   `references/research-and-skills.md`: inspect actual entries in the
   galleries it lists (amicro, landing.love, rebrand.gallery,
   component.gallery, details.so, inspora, 21st.dev) and all six Phloom
   design pages. Keep six to ten observations relevant to Tidefern:
   calendars and date ranges, gentle data visualization (rings, timelines,
   growth charts), onboarding and empty states, restrained motion, serif
   and sans pairings, light and dark done well, interactive design-system
   documentation. Record each as `entry | behavior and viewport inspected |
evidence path | principle | Tidefern adaptation | limits` in
   `docs/design/RESEARCH.md`. Report inaccessible pages honestly. Do not
   copy any identity.
2. Study how Flo, Clue, Ovia, Glow, Natural Cycles, Apple Health, Huckleberry
   and Sprout present today screens, cycle rings, day logging, prediction
   uncertainty, pregnancy weeks, child timelines, growth charts and partner
   sharing. Record what Tidefern does differently (one app across chapters,
   explicit grants, default deny, no trackers) and what it adopts.
3. Render Newsreader and Figtree beside Fraunces, Source Serif 4, Albert
   Sans and Instrument Sans in real specimens (headings, body, navigation,
   numerals, the wordmark) next to the mark, in both themes. The decision
   in the architecture record stands unless a specimen shows a legibility
   problem; record the comparison and any exception in
   `docs/design/TYPOGRAPHY.md`. Self-host whatever you use with its license.
4. Source growth data: WHO Child Growth Standards for 0 to 24 months and CDC
   growth charts for 2 years and up, as LMS tables with attribution, and
   the CDC "Learn the Signs. Act Early." milestone list (2022). Record
   provenance and license in `docs/design/ASSETS.md`.
5. Discover optional skills with `find-skills` or https://skills.sh/ only
   when a concrete gap exists (for example a Vercel React performance
   skill or web interface guidelines). Read origin, license and scripts
   before installing anything project-locally; record what you installed
   and why. Keep the set small. External skills never override this
   prompt or the architecture record.

## 6. Stage 2: design contract before product code (task G2)

Write `docs/design/DESIGN.md` before building screens. Compare at least two
distinct compositions for the marketing home and for `/today`, choose with
reasons, and sketch desktop and phone layouts for every route in
`docs/ARCHITECTURE.md` section 12. Record the component list, every state
each component needs, the interaction model for logging a day (tap a date,
chips for symptoms, flow scale, mood, a note), the cycle ring's geometry and
how uncertainty is drawn, the calendar's two views, the pregnancy week card,
the growth chart with its percentile band, the sharing screen's plain
descriptions of what each category reveals, and the motion and sound
vocabulary per interaction.

Write `docs/design/CONTENT.md`: for each route, the visitor's question, the
content, the primary action and its real destination, navigation placement,
indexability, metadata, and any fact the owner must supply. Write
`docs/design/ASSETS.md` for fonts, vectors, icons, social card, data
tables, with source, license, dimensions and whether final or temporary.

Render the first screen (`/today` with seeded data) and the marketing home
early, in both themes at desktop and phone widths, and look at them before
applying the design language everywhere. Fix what looks wrong first.

## 7. Stage 3: data, identity, encryption, contract (groups B, C, D, E, F, I)

Build the foundation in this order, which matches the `Needs` column of
the plan, so each layer is tested before the next depends on it. Use the
verified snippets in `docs/research/RESEARCH.md` and the rules in
`docs/ARCHITECTURE.md` sections 5 to 11.

1. `packages/db` skeleton (B1): drizzle config using `DATABASE_URL_UNPOOLED`,
   a module-scope `pg` Pool wrapped by `drizzle-orm/node-postgres` and
   registered with `attachDatabasePool`, the `pnpm db:generate`,
   `db:migrate` and `db:seed` scripts wired at the root, the
   `withActor(actorId, fn)` helper (transaction, `set_config('app.actor_id',
   $1, true)`, `SET LOCAL ROLE tidefern_app`), the hand-written first
   migration that creates the `tidefern_app` role and its grants exactly
   as section 7.2 describes, and a Vitest harness that boots one PGlite per
   test file and applies the committed migrations.
2. `packages/auth` config and schema (C1): the Better Auth options from
   section 6.1 and `npx auth@latest generate --config
   packages/auth/src/auth.ts --output packages/db/src/auth-schema.ts`; on
   the first run point `drizzleAdapter` at an empty schema object because
   the generated file does not exist yet, then switch to the generated
   export.
3. Schema (B2 to B7) exactly as section 7.4, with UUIDv7 ids, `date`
   columns for calendar facts, `timestamptz` for events, `bytea` for
   encrypted fields, `subject_keys` in its own table, `child_id` on grants,
   and the indexes in that section. Generate migrations with `drizzle-kit
   generate`; commit the SQL and journal.
4. RLS and seeds (B8, B9): `.enableRLS()` plus `FORCE ROW LEVEL SECURITY`
   and the split policies from section 7.2 on every user-data table, the
   `SECURITY DEFINER` helpers that mirror `can()`, and tests proving that
   an actor sees only their rows, a `summary` grantee cannot insert, a
   revoked grant hides rows, the private journal never leaks, and the role
   resets after commit. The PGlite default role bypasses RLS, so `SET LOCAL
   ROLE` is mandatory in tests. Seeds are deterministic: named personas,
   dates fixed relative to a frozen "today", every stage and grant state
   covered, encrypted notes written with a development KEK. Verify once on
   a real Neon branch (B10) and record the role query from section 7.2.
5. `packages/core` additions (F1 to F3): growth percentiles, stage
   transitions, prediction suppression during pregnancy, and policy list
   filters, all with worked test vectors.
6. `packages/crypto` (D1, D2): `KeyProvider`, `EnvKeyProvider` reading
   `TIDEFERN_KEK_V1` (tests inject a fixed key through the interface and
   never read the environment), AES-256-GCM with AAD `table:column:row_id`,
   versioned ciphertext, DEK provisioning for users at sign-up and for
   children at creation, crypto-shred, tests for round trip, tamper and AAD
   mismatch.
7. Auth mount and mail (C2, C5): the Hono mount before `/v1`, the session
   middleware that loads the actor with guardianships and active grants,
   fresh-authentication checks for the sensitive actions in section 6.1,
   Resend transport with a console fallback, generic templates, and the
   `E2E_MAIL_CAPTURE` test endpoint that never runs on Vercel production.
8. `packages/api` (E1 to E10): middleware for actor context, cross-site
   request checks, per-actor rate limits, idempotency keys as section 5.3
   specifies (never storing bodies), audit writing and HMAC logging; then
   one resource at a time, each with `createRoute`, schemas in
   `packages/schemas`, `can()` before any data access, `withActor()` around
   queries, 404 on denial, tests against the committed spec. Regenerate
   `openapi/v1.json` and the client (E9, adding `client:generate`,
   `client:check` and the `oasdiff` CI step) after each resource and keep
   the drift gates green.
9. Jobs (I1, I2): the outbox, the inline drain through the API's `defer`
   callback, the `/api/internal/jobs/run` endpoint that fails closed
   without `CRON_SECRET`, `pnpm jobs:run`, the daily schedule in
   `apps/web/vercel.json` (per-minute only after the Pro upgrade), and the
   export and deletion state machines with the undo window from section
   7.3.

Every new generated file adds its freshness check to the root `check`
script and to the "Generated files" step of `ci.yml` in the same pull
request.

## 8. Stage 4: product screens (group H)

Build each route from `docs/ARCHITECTURE.md` section 12 against the real
API through `packages/api-client`, with loading, empty, error and pending
states designed. Server components render the data; client components
exist only for interaction. Every mutation shows its outcome honestly.
Onboarding records the collection consent separately from any sharing
consent and sets the time zone before anything else is logged. `/today`
shows the cycle day or pregnancy week, the prediction with its uncertainty
and the sentence that it is an estimate, the quick log, and exactly what a
partner can see right now. `/sharing` describes each category in plain
words before it can be turned on. `/settings` includes follow-system theme,
the sound mute, the notification detail level with a lock-screen preview,
devices, export and account deletion with re-authentication.

Public pages: refresh the home to present the product truthfully (in
development, household release), draft `/privacy` as a consumer health data
privacy policy generated from the vendor table in the architecture record
with every owner input listed and the draft clearly marked, `/terms` and
`/accessibility` as drafts, and `/account/delete` as the public entry
point. Drafts stay out of the sitemap and carry noindex until the owner
approves them. Never invent a company address, inbox, refund term or
operative legal promise.

## 9. Stage 5: design reference and sound (tasks G4 to G8)

Build `/design` with its seven chapters from the real components and the
token source, following `site-build`'s `references/design-reference.md`:
brand (variants, downloads, clear space, approval status), color (both
themes, measured contrast, sandboxed checker), type (editable specimens,
scale, provenance), components (real controls with theme and width
controls, keyboard notes, copyable usage), motion (replayable demos,
reduced motion), sound (playable cues, levels, the mute, haptic notes),
foundations (layout, accessibility, copy and privacy rules, the checklist).
Provide `/design/reference.md`, the JSON catalog and the token exports, and
verify that every catalog source path exists. Design routes are noindex.

Complete the sound system: a navigation settle cue, quiet hours in
Settings, unit tests for the envelopes, browser tests that no audio node
exists before a gesture and that the mute persists. Every cue accompanies
visible text; sound never carries meaning alone.

## 10. Stage 6: review loops (tasks J1 to J3)

Follow `site-build`'s `references/verification-and-release.md`. Keep
findings in `docs/design/QA.md` as `location | severity | evidence |
correction | verification`.

1. Copy: read every visible and expanded string in context, run the
   `humanize-writing` audit, verify every claim, remove filler, keep the
   report in QA.
2. Visual: capture every route in both themes at 1440, 1024 and 390 px plus
   320 px reflow and 200 percent zoom; inspect alignment, wrapping, image
   integration, focus geometry, footer clearance; fix and recapture.
3. Behavior and accessibility: exercise every link, menu, disclosure, form,
   theme and sound control, keyboard path, focus return, error path and
   deletion flow; run axe on every route in both themes; test with
   JavaScript disabled where content must still read.
4. Motion and sound: inspect actual animated frames, reduced motion, hidden
   tabs, interruption; confirm cues play after a gesture and not before.
5. Performance and privacy: production build, console and network clean,
   no third-party requests at all, `private, no-store` on every API and
   authenticated response, security headers present, previews noindex;
   Lighthouse on key routes with recorded conditions and budgets from the
   architecture record.

Allow up to three design and copy passes, then continue only for concrete
findings. If a fix fails twice, revisit the cause. Exit when the essential
flows work, no critical or high finding remains, copy follows the rules,
screenshots were inspected and measurements or their limits are recorded.

## 11. Stage 7: release readiness (tasks J4 to J6)

Complete `docs/LAUNCH_RUNBOOK.md`: local setup, Vercel settings, Neon
branches and roles, GitHub secrets, environment variables, DNS records,
indexing switch, rollback, uptime, the vendor and processor list, and the
precise list of owner inputs still missing (legal facts, mark approval,
Pro upgrade, KMS). Add the uptime workflow. Confirm the Phase 1 gate in
`docs/ARCHITECTURE.md` section 18 item by item and record which items are
done, blocked or waiting on the owner.

Your final handoff, in the progress log and your last message: the
production and latest preview URLs, desktop and phone screenshots of the
key routes in both themes, the test and check output, the open build-plan
tasks with reasons, and the owner's next actions. The result must be a
finished Phase 1 implementation with an honest status.

Begin with Stage 0 now.
