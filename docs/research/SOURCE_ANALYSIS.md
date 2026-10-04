# Analysis of the two source architecture documents

Date: 2026-10-04. Inputs: the Technical Architecture Decision Memo (DOCX, twelve
sections, about 3,000 words) and the Tidefern Technical Architecture
(Markdown, about 11,000 words with sources). Both were written on the same
day by separate agents. This note records where they agree, where one goes
further, where they differ, and what neither covers. The decisions themselves
live in `docs/ARCHITECTURE.md`.

## Where they agree

Both documents land on the same core stack and the same reasoning:

| Decision          | Memo                                                                        | Long document                                                                                                         |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Registrar and DNS | Namecheap registrar, Cloudflare authoritative DNS, Vercel records DNS-only  | Same, adds DNSSEC, CAA and the explicit "do not proxy Vercel" argument with Vercel's own reverse-proxy guidance       |
| Web client        | Next.js on Vercel, web first                                                | Same, with App Router named and "no Server Actions touching the database"                                             |
| API               | Hono + REST/OpenAPI as a separate boundary                                  | Same, specifies `@hono/zod-openapi`, OpenAPI 3.1, `/v1` versioning, RFC 9457 errors, idempotency keys                 |
| Auth              | Better Auth                                                                 | Same, self-hosted in the API, with the plugin list, session transports per client, and the June 2026 advisory history |
| Database          | Neon Postgres + Drizzle, not D1                                             | Same, with a D1 comparison table, pooling rules, and RLS as a second layer                                            |
| Files             | Private Cloudflare R2 with signed access and metadata stripping             | Same, with the full upload and download flow, lifecycle rules, and the BAA caveat                                     |
| Jobs              | Cloudflare Queues or Workers later                                          | Different: Postgres outbox drained by Vercel Cron first (see below)                                                   |
| Mobile            | Expo later consuming the same API                                           | Same, with a three-phase client plan and what is shared versus not                                                    |
| Privacy posture   | Treat all data as highly sensitive; no health data in URLs, logs, analytics | Same, with vendor-by-vendor verdicts and the MHMDA "derived data" point about route names                             |
| Scale             | Boring architecture to 100K and beyond                                      | Same, with request and cost estimates per tier                                                                        |

## Where the long document goes further

1. Envelope encryption of free text with per-user data keys and crypto-shredding
   on deletion. The memo mentions encryption only in passing.
2. A concrete domain model: subject versus author, category and level grants,
   children as co-owned, `can(actor, action, resource)` as the single policy
   module, 404 rather than 403 on denial, audit events on partner reads.
3. Regulatory specifics: FTC Health Breach Notification Rule coverage and
   penalties, Washington MHMDA obligations (separate consents, 45-day deletion
   including backups, homepage policy link, private right of action), Apple
   and Google store rules including in-app deletion and the web deletion link.
4. Data rights as Phase 1 work: export, deletion pipeline, partner revocation,
   session revocation, account activity view.
5. Security engineering: three environments, preview databases branched from
   staging never production, backup and restore drills, incident response
   steps written before launch, a hardening checklist.
6. Notification privacy: generic lock-screen text by default, three detail
   levels, direct APNs and FCM rather than a relay.
7. Monorepo dependency direction rules and a package list that includes
   `crypto`, `observability` and `config`.
8. The hosting option matrix (four options) with the recommendation to run
   the API as its own Vercel project.
9. A "traps to avoid" list and a build-now versus postpone table.

## Where the memo is better

1. It is shorter and reads as a decision record, which is what a build agent
   needs at the top of its context. The long document buries its one-line
   stack at the end.
2. Its "Build now versus add later" table is cleaner than the long
   document's equivalent.
3. It keeps the first API placement question open to a single deployment,
   which matches the solo-developer reality better than two Vercel projects
   on day one.

## Where they differ, and the resolution

| Topic           | Memo                                     | Long document                                            | Resolution in `docs/ARCHITECTURE.md`                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API deployment  | Separate Hono app, placement unspecified | Separate Vercel project at `api.` from day one           | One Vercel project: the Hono app is its own workspace package with zero Next.js imports, mounted at `/api/v1` by a four-line route handler. Splitting it out later is an entry-file change. Verified against Vercel's Hono and Next.js route handler docs. |
| Background jobs | Cloudflare Queues or Workers "later"     | Postgres outbox + Vercel Cron now, Vercel Queues when GA | Postgres outbox + Vercel Cron. No second platform, payloads stay IDs-only.                                                                                                                                                                                 |
| Key management  | Not specified                            | AWS KMS or GCP KMS from the start                        | Envelope encryption from day one behind a `KeyProvider` interface; an environment-held KEK in Phase 1, a cloud KMS required at the Phase 2 gate before anyone outside the household signs up.                                                              |
| Error tracking  | Sentry "before account launch"           | Sentry with PII off, no replay, scrubbing                | No third-party error tracker in Phase 1 (structured allowlist logs only). Sentry with scrubbing at the Phase 2 gate. One fewer processor while the users are the household.                                                                                |
| Analytics       | Not specified                            | First-party events table only                            | First-party only, and none on authenticated screens.                                                                                                                                                                                                       |

## What neither document covers

Both are infrastructure documents. Neither says anything about the product
surface a build agent must actually produce. `docs/ARCHITECTURE.md` adds:

- The design system: tokens as a single source, light and dark designed
  independently, the seven-chapter `/design` reference, typography choice
  with evidence, brand vector strategy from a raster-only brand sheet.
- The interface sound and haptic system: synthesized Web Audio cues, unlock
  rules, levels, a persistent mute, and what haptics exist on the web.
- Route map and screens for the first product release (today, calendar,
  journal, family, settings, onboarding, account deletion page).
- Testing strategy per layer and the CI pipeline shape.
- Deployment mechanics on Vercel for a monorepo, preview protection, the
  deployment smoke workflow, and what the owner must click once.
- Agent working conventions: AGENTS.md, skills, the tracked build plan, the
  progress log, commit and PR rules.
- Local development without cloud services (PGlite or a local Postgres,
  console email transport), seed data, and what each phase gate requires.

## Claims re-verified on 2026-10-04

The research in `docs/research/RESEARCH.md` re-checked the version numbers
and vendor facts both documents rely on. Notable corrections and updates are
listed there with sources; the headline ones: Node 24 remains the active LTS
until 26 is promoted on 2026-10-28, Next.js is at 16.3.8 and scaffolds with
Turbopack, Hono's `hono/vercel` adapter is deprecated in favor of calling
`app.fetch` directly or `@hono/vercel`, TypeScript 7 is current on npm but
not yet supported by typescript-eslint so 6.0.3 is pinned, and ESLint 9 is
marked unsupported on npm while eslint-config-next's plugins still break on
ESLint 10, so the web app pins 9 and the packages use 10.
