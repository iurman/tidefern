# Tidefern technical architecture

Decision record, 2026-10-04. Owner: Isaac Urman. Status: accepted for the
Phase 0 foundation in this repository and for the Phase 1 build described in
`docs/BUILD_PROMPT.md`.

This document replaces the two earlier architecture memos. It keeps what they
agreed on, resolves where they differed, and adds the product, design, sound,
testing, delivery and agent-process decisions they did not cover. Every
consequential decision names its evidence. Versions were resolved from the
registries on the date above, not recalled; `docs/research/RESEARCH.md` holds
the full findings and `docs/research/SOURCE_ANALYSIS.md` the comparison of
the two source memos.

How to use it: a build agent reads this document first, then
`docs/BUILD_PROMPT.md`, then claims work in `docs/BUILD_PLAN.md`. A human
reads sections 1 and 2 to understand the shape, and the rest when a question
comes up. Decisions marked "re-verify" must be checked against the vendor
before the Phase 2 gate; vendors change faster than this file.

## 1. The decisions in one place

| Layer                | Decision                                                                                                                                                                                                                                                                | Why, in one line                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Product shape        | Web first. One Next.js app serves the marketing site, the authenticated product and the `/design` reference.                                                                                                                                                            | The first users are on the web; the owner is fastest in Next.js; mobile reuses the API, not the UI.                           |
| Monorepo             | pnpm workspaces + Turborepo. `apps/web` and framework-neutral `packages/*`.                                                                                                                                                                                             | Shared schemas, domain math, policy and tokens without publishing; one checkout for agents.                                   |
| Web framework        | Next.js 16.3.x App Router, React 19.2.x, Turbopack, TypeScript 6.0.x strict.                                                                                                                                                                                            | Current stable line; `create-next-app` defaults; TypeScript 7 is not yet supported by typescript-eslint.                      |
| API                  | Hono 4.13.x with `@hono/zod-openapi` 1.6.x and Zod 4, OpenAPI 3.1, versioned under `/api/v1`, RFC 9457 errors.                                                                                                                                                          | Language-neutral contract that generates TypeScript now and Swift or Kotlin later; portable to its own deployment unchanged.  |
| API placement        | The Hono app lives in `packages/api` with zero Next.js imports and is mounted by one route handler at `apps/web/src/app/api/[[...route]]/route.ts`. One Vercel project.                                                                                                 | One deployment, one origin for cookies, one preview URL per PR. Splitting it out later is an entry-file change (section 3.3). |
| Hosting              | Vercel, Fluid compute, Node 24, region `iad1`. Cloudflare stays authoritative DNS with DNS-only records.                                                                                                                                                                | The owner's existing pattern; native Next.js runtime; no proxy in front of Vercel.                                            |
| Database             | Neon Postgres 18 with Drizzle ORM 0.45.x, pooled `pg` driver on Vercel, direct URL for migrations.                                                                                                                                                                      | Relational health data needs transactions, RLS and point-in-time restore; D1 has none of those.                               |
| Row level security   | Enabled on every user-data table from the first migration, enforced through a dedicated app role and a per-request actor context.                                                                                                                                       | Defense in depth against a forgotten `WHERE`; cheapest when tables are new.                                                   |
| Authorization        | One policy module, `can(actor, action, resource)` in `packages/core`, subject-owned records, category-and-level grants, default deny, 404 on denial.                                                                                                                    | "Partner" never means "sees everything"; one place to test and audit.                                                         |
| Identity             | Better Auth 1.7.x self-hosted inside the Hono app at `/api/auth/*`: email and password with required verification, passkeys, TOTP, database-backed rate limiting, session revocation.                                                                                   | Matches the stack; fits Expo later; plugins kept to the minimum surface.                                                      |
| Encryption           | TLS, provider encryption at rest, and per-user envelope encryption (AES-256-GCM with AAD) for free text. KEK behind a provider interface: environment variable in Phase 1, cloud KMS required at the Phase 2 gate. Deleting a user destroys the DEK (crypto-shredding). | Protects notes against database and backup leaks and satisfies deletion-from-backups obligations.                             |
| Files                | Private Cloudflare R2 with presigned upload and download, server-side re-encoding to strip metadata. Deferred to Phase 2; the storage interface exists from Phase 1.                                                                                                    | Free egress for a photo journal; private by default; swappable for S3 if a BAA is ever needed.                                |
| Jobs                 | Postgres outbox table drained inline after each request (`after()`), by a daily Vercel Cron sweep on Hobby and a per-minute cron on Pro. No queue vendor.                                                                                                               | Payloads stay IDs-only in the owner's database; no second platform.                                                           |
| Email                | Resend with generic subjects and bodies. Console transport locally.                                                                                                                                                                                                     | Already used by the owner; health details never appear in email.                                                              |
| Analytics and errors | No third-party analytics, pixels, replay or error SDKs in Phase 1. First-party, allowlisted event counters only. Scrubbed Sentry allowed at the Phase 2 gate.                                                                                                           | Flo, Premom and GoodRx enforcement was about SDKs, not hacks; fewer processors while the users are the household.             |
| Design system        | Tokens in `packages/design-tokens/tokens.json` generate the CSS; light and dark designed independently; system preference by default with a remembered choice; a seven-chapter `/design` reference built from real components.                                          | One source of truth that humans, agents and future clients read.                                                              |
| Typography           | Newsreader (display, headings, wordmark text) and Figtree (body, controls), self-hosted variable WOFF2, OFL.                                                                                                                                                            | Serif matches the brand sheet's wordmark; a warm geometric sans matches its tagline; both legible at small sizes.             |
| Sound and touch      | Synthesized Web Audio cues for hover, press, toggle, success and error through one delegated provider; `navigator.vibrate` on touch where supported; on by default with a persistent mute.                                                                              | Every control responds the same way; no audio files; the person stays in control.                                             |
| Testing              | Vitest for packages, PGlite for database and policy tests, Playwright with axe for the web app against the production build, committed OpenAPI spec with a drift gate, screenshot captures for visual review.                                                           | Tests protect behavior at real boundaries; CI runs exactly what a contributor runs.                                           |
| CI/CD                | GitHub Actions: one `verify` job (prose gate, generated files, lint, types, unit, build, browser), CodeQL, Renovate, and a `deployment_status` smoke test against every Vercel deployment. Vercel deploys from Git.                                                     | A broken deploy shows up on the pull request, not only in the Vercel dashboard.                                               |
| Mobile               | Expo later, against the same `/api/v1`, sharing `schemas`, `core`, the generated client and tokens. Native Swift and Kotlin only if earned.                                                                                                                             | Nothing on the server assumes a React client.                                                                                 |

## 2. Context and constraints

- Owner: a solo product engineer in Washington State who already runs
  Next.js on Vercel with pnpm, Drizzle on Neon, Playwright, Resend and
  Cloudflare DNS (Namecheap registrar) for other products. The Vercel team
  already holds `aviune`, `foreset` and `tome-and-quill`; no Tidefern project
  exists yet.
- First users: the owner and their fiancée. Then a consumer product. The
  architecture treats the first two users as the first two of 100,000 but
  spends money only when a gate requires it.
- Data: cycle, fertility, pregnancy, mood, journal, child and photo data.
  Treated as consumer health data under the FTC Health Breach Notification
  Rule and Washington's My Health My Data Act from day one. HIPAA almost
  certainly does not apply to a direct-to-consumer app; see section 9.6.
- Tooling: the owner works across Claude Code, Codex CLI and Cursor on
  Linux, so the repository carries `AGENTS.md`, `CLAUDE.md` and portable
  skills, and every check runs from one command.
- Plan facts that shape Phase 1 (Vercel docs, 2026-10-04): a Hobby team is
  restricted to non-commercial use, cannot deploy a private repository
  owned by a GitHub organization (and for any private repository only the
  team owner's commits deploy), runs cron at most once a day with a plus or
  minus 59 minute window, caps functions at 300 seconds, keeps runtime logs
  for one hour with no drains, and meters 1,000,000 function invocations a
  month. The plan of the owner's existing Vercel team is not recorded yet;
  task A2 records it, because every Hobby constraint in sections 10, 17 and
  19 depends on it. Tidefern moves to Pro before it becomes a product or
  needs timed reminders (section 18).
- Writing: no em dashes anywhere, enforced by `pnpm prose:check`. Health
  details never appear in URLs, titles, logs, notifications or email.

## 3. Hosting and deployment topology

### 3.1 One Vercel project, one origin

```text
Browser / future Expo app
        |
        v  HTTPS, DNS-only Cloudflare record -> Vercel
+---------------------------------------------------------------+
| apps/web (Next.js 16, Vercel Fluid compute, iad1)             |
|   /            marketing and design reference (per request)   |
|   /today ...   authenticated product (per request, no-store)  |
|   /api/[[...route]]  ->  packages/api (Hono)                  |
|        /api/auth/*   Better Auth handler                      |
|        /api/v1/*     versioned OpenAPI contract               |
+---------------------------------------------------------------+
        |                      |                     |
        v                      v                     v
  Neon Postgres 18       Resend (email)      Cloudflare R2 (Phase 2)
  pooled pg for app      generic text only   private, presigned
  direct URL for
  migrations
```

The web app and the API share an origin, so Better Auth cookies are
first-party, no CORS is configured in Phase 1, and one preview URL per pull
request exercises both. The route handler is four lines:

```ts
// apps/web/src/app/api/[[...route]]/route.ts
import { after } from "next/server";
import { createApp } from "@tidefern/api";
export const maxDuration = 60;
// The /api prefix is permanent inside the package. defer lets the API run post-response work without importing a framework.
const app = createApp({ defer: (task) => after(task) });
const handler = (request: Request) => app.fetch(request);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS };
```

Evidence: Hono's Next.js guide documents exactly this mount
(`app/api/[[...route]]/route.ts`, `basePath('/api')`, Node runtime). The
`hono/vercel` adapter is deprecated since Hono 4.13.9 and is literally
`(app) => (req) => app.fetch(req)`, so calling `app.fetch` directly is the
same thing without a dependency; `@hono/vercel` 1.0.0 exists if an adapter
import is preferred. Next.js route handlers are dynamic by default since 15,
`runtime` defaults to Node and `edge` is deprecated, and `maxDuration` is a
per-file export. Better Auth's own Next.js handler also just returns
`auth.handler(request)`, so Set-Cookie headers flow through unchanged.

### 3.2 Why not the alternatives

| Option                                                 | Verdict          | Reason                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js route handlers as the API, no Hono             | No               | Backend drifts into Next-only patterns (Server Actions, `cookies()`); mobile would need a second API. The Hono package with ESLint import boundaries makes the separation physical. |
| Separate Hono project on Vercel at `api.` from day one | Later, if needed | Two projects, CORS, cross-subdomain cookies and two preview URLs for a solo developer with two users. The package is already shaped for it.                                         |
| Vercel Services (Beta)                                 | Watch            | One project, two services, top-level rewrites. Beta today; the right move if the route handler ever needs a different runtime or duration than the web app.                         |
| Cloudflare Workers + D1                                | No               | D1 is SQLite with a 10 GB cap and no interactive transactions or RLS; Next.js on Workers runs through an adapter; a BAA needs Enterprise.                                           |
| Proxying Vercel through Cloudflare                     | No               | Vercel documents that a reverse proxy breaks its firewall visibility and cache purging and hides client IPs; it also puts a second vendor in the path of health traffic.            |

### 3.3 Splitting the API out later

The `/api` prefix is permanent: every path in the committed OpenAPI
document starts with `/api/v1`, generated clients are keyed by those
paths, and installed mobile builds depend on them. A split deployment
therefore answers at `https://api.<domain>/api/v1/...`. Add
`apps/api/src/index.ts` containing `import { createApp } from
"@tidefern/api"; import { waitUntil } from "@vercel/functions"; export
default createApp({ defer: (task) => waitUntil(task()) });`, create a
second Vercel project with Root Directory `apps/api`, point `api.` at it,
turn on CORS for the web origin in the Hono app, add the origin to Better
Auth's `trustedOrigins`, and keep a rewrite from `/api/:path*` on the web
origin to the new host until every installed client has moved. Nothing
inside `packages/api` changes. Vercel deploys a default-exported Hono app
from `src/index.ts` with zero configuration.


### 3.4 Vercel project settings

| Setting                                 | Value                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework preset                        | Next.js                                                                                                                                                       |
| Root Directory                          | `apps/web` (Include source files outside of the Root Directory stays on, which is the default)                                                                |
| Build command | `pnpm db:migrate && next build` once `packages/db` exists (Phase 1); until then default. Migrations run in every Vercel environment against that environment's direct database URL, so previews and production migrate themselves |
| Node.js version                         | 24.x (from `engines.node` at the root)                                                                                                                        |
| Skip deployment for unaffected projects | On (default for GitHub-connected pnpm workspaces)                                                                                                             |
| Deployment protection                   | Vercel Authentication on for previews; a Protection Bypass for Automation secret stored as `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub for the smoke workflow |
| Functions region                        | `iad1`, declared in `apps/web/vercel.json`, next to Neon `us-east-1`                                                                                          |
| Environment variables | Section 17; sensitive values marked sensitive; previews never receive production secrets. Database URLs for previews are injected per deployment by Neon's Vercel integration |

### 3.5 DNS

Namecheap stays the registrar. Cloudflare stays the authoritative zone.
Records for Vercel are DNS-only (grey cloud): `@` and `www` for the site,
and later `api` if the API is split out. Enable DNSSEC in Cloudflare and
publish the DS record at Namecheap. Add a CAA record limiting issuance to
the authorities Vercel lists. Email authentication records (SPF, DKIM,
DMARC) for Resend live in the same zone. Deployment and DNS steps are in
`docs/LAUNCH_RUNBOOK.md`.

## 4. Repository and toolchain

### 4.1 Layout

```text
tidefern/
  apps/web/                    Next.js app (marketing, product, /design, /api mount)
  packages/api/                Hono app: routes, OpenAPI document, error shape, auth mount
  packages/core/               Pure domain logic: dates, cycle, pregnancy, growth, can()
  packages/schemas/            Zod request, response and domain schemas
  packages/design-tokens/      tokens.json, CSS generator, brand vectors, brand constants
  packages/config/             Shared tsconfig presets and the library ESLint config
  packages/db/                 (Phase 1) Drizzle schema, migrations, RLS policies, client, actor helper
  packages/auth/               (Phase 1) Better Auth server config and the React client factory
  packages/crypto/             (Phase 1) Envelope encryption, KeyProvider interface, field helpers
  packages/api-client/         (Phase 1) Types generated from openapi/v1.json plus a thin fetch wrapper
  openapi/v1.json              Committed contract; CI fails on drift
  docs/                        This file, build prompt, plan, progress, runbook, research, design records
  .agents/skills/              Canonical project skills; .claude/skills links to them
  .github/workflows/           ci.yml, deploy-verify.yml, codeql.yml (+ the oasdiff step in Phase 1)
```

Dependency direction, enforced by ESLint `no-restricted-imports` in every
package and reviewed in pull requests:

- `apps/web` may import `api` (only to mount it and hand it `after`),
  `api-client`, `schemas`, `core`, `design-tokens`, and the auth client.
  Never `db`, `auth` server code or `crypto`; its ESLint config forbids
  those imports.
- `packages/api` is the only package that imports `db`, `auth` and `crypto`.
  It never imports `next`, `react` or `react-dom`.
- `core` and `schemas` have no I/O dependencies; `core` runs identically in
  the browser, React Native and Node.
- Workspace packages are Just-in-Time packages: `exports` point at
  TypeScript source, Turbopack transpiles them, there is no build step and
  no `paths` aliasing between packages. Relative imports inside packages
  carry no extension (Turbopack does not resolve `.js` to `.ts` here).

### 4.2 Pinned toolchain

Resolved from the registries on 2026-10-04. Exact pins, `save-exact=true`.

| Tool           | Pin                                                                                                                                                                                                             | Note                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node           | 24.x (`engines`, `.nvmrc` 24.21.0)                                                                                                                                                                              | Active LTS until Node 26 is promoted on 2026-10-28; Vercel default runtime.                                                                                                                                                             |
| pnpm           | 10.34.6 via `packageManager`                                                                                                                                                                                    | pnpm 12.9.1 is current but Vercel's documentation lists pnpm 6 to 10; pnpm 10 is what the owner's other projects deploy with. Revisit after a successful pnpm 12 build on a branch. Do not depend on corepack; it leaves Node at 25+.   |
| Turborepo      | 2.11.7                                                                                                                                                                                                          | Pinned so Vercel never falls back to a global version.                                                                                                                                                                                  |
| Next.js        | 16.3.8                                                                                                                                                                                                          | React 19.2.8, the pair `create-next-app` installs today.                                                                                                                                                                                |
| TypeScript     | 6.0.3                                                                                                                                                                                                           | TypeScript 7.0.2 is npm `latest` but ships no JavaScript API; typescript-eslint 8.71 pins `<6.1.0`. Every tsconfig is already 7-clean (no `baseUrl`, bundler resolution, explicit `types`).                                             |
| ESLint         | 10.12.0 in packages, 9.39.5 in `apps/web`                                                                                                                                                                       | npm marks 9 unsupported, but `eslint-config-next` 16.3.8 pulls `eslint-plugin-react`, which crashes under 10 (`getFilename is not a function`, reproduced in this repository). Re-verify when `eslint-config-next` updates its plugins. |
| Tailwind CSS   | 4.3.3                                                                                                                                                                                                           | Used for utilities; the shell is semantic CSS on tokens.                                                                                                                                                                                |
| Hono           | 4.13.13, `@hono/zod-openapi` 1.6.3, Zod 4.6.5                                                                                                                                                                   | zod-openapi peer `zod ^4`, `hono >=4.10`.                                                                                                                                                                                               |
| Drizzle        | drizzle-orm 0.45.3, drizzle-kit 0.31.11                                                                                                                                                                         | Pin exactly. The Drizzle docs site now shows the v1 release-candidate API and migration layout; do not install `@rc`, do not run `drizzle-kit up`, and check snippets against the 0.45.3 types.                                         |
| pg             | 8.23.1                                                                                                                                                                                                          | Module-scope Pool, registered with `attachDatabasePool` from `@vercel/functions`.                                                                                                                                                       |
| Better Auth    | 1.7.7, `@better-auth/passkey` 1.7.7                                                                                                                                                                             | CLI is `npx auth@latest` (`@better-auth/cli` is deprecated).                                                                                                                                                                            |
| Vitest         | 5.0.3                                                                                                                                                                                                           | PGlite 0.5.8 (Postgres 18.3 engine) for database tests.                                                                                                                                                                                 |
| Playwright     | 1.63.0, `@axe-core/playwright` 4.13.0                                                                                                                                                                           | Chromium build 1243; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides on machines with a preinstalled browser.                                                                                                                           |
| sharp          | 0.35.5 (Phase 2)                                                                                                                                                                                                | Photo re-encoding.                                                                                                                                                                                                                      |
| GitHub Actions | `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `actions/upload-artifact@v7`, `github/codeql-action@v4` | Major tags today; Renovate's `helpers:pinGitHubActionDigests` replaces them with verified commit digests on its first run. Note that the `pnpm/action-setup@v6` moving tag pointed at 6.0.10 on 2026-10-04, which predates pnpm 12 support; irrelevant while pnpm 10 is pinned. |

### 4.3 Generated files and their gates

| Generated file                               | Source                                       | Command                        | Gate                                         |
| -------------------------------------------- | -------------------------------------------- | ------------------------------ | -------------------------------------------- |
| `apps/web/src/app/tokens.css`                | `packages/design-tokens/tokens.json`         | `pnpm tokens:generate`         | `pnpm tokens:check`                          |
| `apps/web/public/brand/*.svg`                | `packages/design-tokens/brand/*.svg`         | `pnpm --filter web brand:sync` | `pnpm --filter web brand:check`              |
| `openapi/v1.json`                            | `packages/api` routes and `packages/schemas` | `pnpm openapi:generate`        | `pnpm openapi:check`                         |
| `packages/api-client/src/types.ts` (Phase 1) | `openapi/v1.json`                            | `pnpm client:generate`         | `pnpm client:check`                          |
| `packages/db/drizzle/*.sql` (Phase 1)        | `packages/db/src/schema`                     | `pnpm db:generate`             | review in PR; CI applies to a fresh database |
| `packages/db/src/auth-schema.ts` (Phase 1)   | Better Auth config                           | `npx auth@latest generate`     | review in PR                                 |

`pnpm check` runs the prose gate, every freshness gate, lint, types, unit
tests and the production build. CI runs the same plus the browser suite.

## 5. API contract

### 5.1 Shape

- Everything under `/api/v1`. Additive changes only inside `v1`; a breaking
  change means `/api/v2` with an overlap period, because installed mobile
  builds run for months.
- Routes are defined with `createRoute` from `@hono/zod-openapi` using the
  Zod schemas in `packages/schemas`, so the OpenAPI document is generated
  from the same objects that validate requests. `app.doc("/v1/openapi.json")`
  serves it; `pnpm openapi:generate` writes `openapi/v1.json`, and CI fails
  when the committed file differs from the code.
- Ids are UUIDv7. Create requests may carry an `id` (validated as v7) so
  an offline client can mint it; the server mints one when absent and
  answers 409 `conflict` if the id already exists under another subject.
  Day entries are addressed by `(subject, date)` and written with `PUT`.
  ISO 8601 calendar dates as `YYYY-MM-DD`; instants as RFC 3339 UTC with
  exactly three fractional digits and `Z` (Swift clients configure
  `.iso8601WithFractionalSeconds`).
- Every controlled vocabulary (flow, symptoms, moods, event kinds) is a
  closed `z.enum` exported from `packages/schemas` and seeded into the
  database from the same list. Free text is accepted only in fields the API
  encrypts. Adding an enum value is additive; clients render an unknown
  value as "other" and never fail to parse; clients ignore unknown fields.
- Lists return `{ items, nextCursor }` with opaque base64url cursors;
  `limit` is 1 to 200, default 50. Syncable lists accept `updatedSince`
  (RFC 3339) and include tombstones. Updates accept `If-Match: <version>`
  and answer 409 `conflict` on a stale version.
- Non-browser clients send `X-Tidefern-Client: <platform>/<semver>`; the
  API logs it (allowlisted) and may answer 426 `upgrade_required` for a
  build below the minimum supported version.
- `GET /api/v1/me` returns the actor id, profile, active grants and session
  expiry, so every client bootstraps the same way.
- Step-up: sensitive operations (section 6.1) require a fresh
  authentication marker on the session, and the API answers 401
  `unauthenticated` with `detail: "fresh_authentication_required"` so a
  phone with a bearer session can re-authenticate in place.

- Health data travels only in request and response bodies. `GET
/api/v1/entries?from=2026-09-01` is fine; `GET /api/v1/symptoms/nausea` is
  not. Vercel runtime logs record paths and query strings.
- Every response from the API carries `Cache-Control: private, no-store`
  (middleware in `packages/api`, repeated as a Next.js header rule for
  `/api/:path*`). Nothing personal is ever cached by a shared cache or by
  Next.js data caching.
- One error shape: RFC 9457 problem details with `application/problem+json`,
  `type` as a stable URN (`urn:tidefern:problem:<code>`, so it never depends
  on a domain) and a closed `code` list: `validation_failed`,
  `unauthenticated`, `forbidden` (origin and cross-site failures only),
  `not_found`, `conflict`, `rate_limited`, `upgrade_required`, `internal`.
  Field errors accompany 422. Error messages never echo health data.
  Denied access returns 404, not 403, so existence is not revealed. The
  committed document keeps `servers: [{ url: "/" }]`; native clients are
  constructed with an explicit server URL, never from that list.

- Validation failures go through the `defaultHook` so the 422 shape is
  identical for every route.

### 5.2 Clients

- Web: `packages/api-client` exports `createApiClient({ baseUrl, fetch,
  headers, generateId })` over `openapi-fetch` 0.17 with types from
  `openapi-typescript` 7.x generated from `openapi/v1.json`. In the browser
  `fetch` is `window.fetch` with `credentials: "include"`. In server
  components `fetch` is the mounted Hono app's own `app.fetch` with the
  incoming request headers forwarded: in process, no second function
  invocation, no preview-protection problem. Nothing in `apps/web` touches
  the database or the auth server configuration; the session is read
  through `GET /api/v1/me`.

- Expo (Phase 3): the same package with the Better Auth Expo client's fetch (SecureStore cookie attached) and a UUIDv7 generator that does not depend on `crypto.randomUUID`.
- Swift and Kotlin (Phase 4, only if earned): `swift-openapi-generator` and
  OpenAPI Generator from the same file.
- Contract drift gate: `pnpm openapi:check` today; add `oasdiff breaking`
  against the base branch in CI when the first real resource ships, so a
  removed or retyped field fails the pull request.

### 5.3 Idempotency

`POST` creates require an `Idempotency-Key` header (a UUID, 400 when
missing). The middleware inserts `(actor_id, key, route, request_hash,
state = in_flight)` into `idempotency_keys` before the handler runs, with a
unique index on `(actor_id, key)`:

- a duplicate insert while the first request is still `in_flight` returns
  409, so two concurrent retries cannot both execute;
- a `done` row with a different `request_hash` returns 409;
- a `done` row with the same hash is replayed by re-reading the stored
  `resource_id` through `can()` and `withActor()` and re-rendering the
  response, so revocation and deletion still apply;
- response bodies are never stored, because for day entries and notes they
  would hold decrypted free text outside the encrypted columns;
- a daily job deletes rows older than 24 hours.

## 6. Identity and sessions

### 6.1 Better Auth configuration

Self-hosted in `packages/auth`, mounted in the Hono app before the `/v1`
routes:

```ts
app.all("/auth/*", (c) => auth.handler(c.req.raw));
```

| Option                 | Value                                                                                                                                                                                                     | Why                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter                | `drizzleAdapter(db, { provider: "pg", schema })`; schema generated with `npx auth@latest generate --config packages/auth/src/auth.ts --output packages/db/src/auth-schema.ts` and migrated by drizzle-kit | One migration tool. The CLI package is named `auth`; `@better-auth/cli` is deprecated.                                                                                                                                    |
| `baseURL` / `basePath` / `trustedOrigins` | `BETTER_AUTH_URL` in production; on previews derived at module load from `VERCEL_URL`; `basePath` `/api/auth`; `trustedOrigins` is the production origin plus the team's preview pattern (`https://*-<team-slug>.vercel.app`) in Phase 1, with `tidefern://` reserved for Phase 3 and `exp://**` in development only | Every Vercel preview has its own host, so a fixed base URL would reject every preview sign-in. Secure cookies and the `__Secure-` prefix turn on automatically when the URL is https or `NODE_ENV` is production. |
| `emailAndPassword`     | `enabled`, `requireEmailVerification: true`, `revokeSessionsOnPasswordReset: true` (off by default), reset and verification mail through Resend with generic text                                         | Verification also prevents account enumeration on sign-up.                                                                                                                                                                |
| Passkeys               | `@better-auth/passkey` with `rpID`, `rpName`, `origin`                                                                                                                                                    | Encouraged primary method on the web. Native passkey ceremonies on Expo are unverified; prototype before relying on them.                                                                                                 |
| TOTP                   | `twoFactor()` from `better-auth/plugins` with backup codes                                                                                                                                                | Optional for everyone, prompted for anyone who grants partner access. Keep `session.cookieCache` off until the 2FA interaction with it is re-verified (an April 2026 advisory, fixed in 1.4.9, involved cached sessions). |
| Social sign-in | Not in Phase 1 | Apple and Google arrive with the mobile app; Apple is required by App Store guideline 4.8 once Google exists. |
| Mobile plugins | Reserved, not enabled: `expo()` from `@better-auth/expo` and `bearer()` arrive in Phase 3 together with the `tidefern://` scheme | Nothing server-side needs to change shape when they do. |
| Rate limiting          | `rateLimit: { enabled: true, storage: "database" }`                                                                                                                                                       | Memory storage is per instance and useless on serverless. Vercel Firewall rules on auth, invite and upload paths once on Pro.                                                                                             |
| Sessions               | 7-day expiry, 1-day `updateAge`; "Devices" screen backed by `listSessions`, `revokeSession`, `revokeOtherSessions`                                                                                        | Short enough for health data; revocation is a Phase 1 feature.                                                                                                                                                            |
| Plugins not enabled    | organization, SSO, OIDC provider, MCP, device authorization, anonymous, admin, SCIM                                                                                                                       | Not needed; several carried 2026 advisories. Smaller surface, fewer advisories that apply.                                                                                                                                |
| Bot protection | Cloudflare Turnstile on sign-up, reset and invite acceptance at the Phase 2 gate | Works without proxying traffic. Its script is the one documented CSP exception, allowed only on those three unauthenticated routes, and it joins the processor list. |
| Fresh authentication | Required (password, passkey or TOTP within the last ten minutes) before account deletion, data export, creating or changing a grant, sending an invitation, revoking devices and changing email or password | A password reset through email must never equal full access to sharing and export. |
| Recovery | Email-based account recovery with a 24-hour cooling-off period, notification to every session, and no recovery for a lost passkey plus lost backup codes except through that path | Documented so support never improvises. |
| Passkey relying party | `rpID` is the apex registrable domain, never `www`; passkeys are enabled only once that domain is live. Previews run on their own origin, so passkeys registered there are throwaway by design and preview browser tests sign in with email and password | Passkeys registered on a `vercel.app` host would not carry over to the real domain. |

Pin the version, read release notes, update deliberately; Renovate groups
Better Auth separately and never automerges it.

### 6.2 Session transport per client

| Client           | Transport                                                  | Storage                                                                                                                                        |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Web              | `HttpOnly; Secure; SameSite=Lax` cookie on the app origin  | Browser cookie jar. Never `localStorage`.                                                                                                      |
| Expo (Phase 3)   | Better Auth cookie sent as a header by `@better-auth/expo` | `expo-secure-store`; clear stale sessions on first launch after reinstall (iOS Keychain survives uninstall); exclude from Android Auto Backup. |
| Native (Phase 4) | `Authorization: Bearer` via the bearer plugin              | iOS Keychain (`WhenUnlockedThisDeviceOnly`), Android Keystore-backed storage.                                                                  |

Server components read the session through `GET /api/v1/me` on the
in-process client (section 5.2) and render authenticated pages dynamically; no
authenticated route is ever statically rendered or ISR-cached.

## 7. Data: Neon Postgres with Drizzle

### 7.1 Connections

- Neon project on Postgres 18 (the default for new projects), Launch plan
  (usage billed; the Free plan's 6-hour history window is the reason to pay),
  `history_retention_seconds` raised to 604800 (7 days, the Launch maximum)
  on production. Scale only when a 30-day restore window or more than 10
  branches is needed.
- `DATABASE_URL` is the pooled `-pooler` string (PgBouncer, transaction
  mode) used by the app. `DATABASE_URL_UNPOOLED` is the direct string used
  only by migrations and the migration runner. Transaction mode forbids
  session-level `SET`, `LISTEN/NOTIFY`, SQL `PREPARE` and session advisory
  locks; transaction-scoped `set_config(..., true)` and `SET LOCAL` are what
  the actor context uses.
- Driver on Vercel Fluid compute: a module-scope `pg` Pool (`max` 2 to 5,
  `idleTimeoutMillis` 5000) wrapped by `drizzle-orm/node-postgres` and
  registered with `attachDatabasePool` from `@vercel/functions`. Neon and
  Vercel both document this as the right choice over the Neon serverless
  driver for Node runtimes. Fluid compute shares one process across
  invocations, which is what makes the module-scope pool correct.
- Migrations: `drizzle-kit generate` locally (SQL and journal committed),
  applied by `pnpm db:migrate` (a runner over `drizzle-orm/node-postgres/migrator`)
  as the first half of the Vercel build command in every environment,
  against that environment's direct URL. CI applies the same migrations to
  PGlite in tests; CI never holds a production database credential. `push`
  is for local scratch only. Never `drizzle-kit up` (that is the v1 upgrade
  path, not this version). Migrations are expand then contract: every
  migration must run correctly under the previous deployment's code,
  because "promote the previous deployment" restores code, not schema; a
  contract step (dropping or renaming) ships in a later release after the
  code that needed the old shape is gone.

### 7.2 Row level security from the first migration

Roles created in the Neon console, CLI or API are members of
`neon_superuser`, which carries `CREATEDB`, `CREATEROLE`, `pg_read_all_data`,
`pg_write_all_data` and, in projects created after August 2023, `BYPASSRLS`
(Neon docs, checked 2026-10-04). Postgres never inherits role attributes
through membership, so a console-created role bypasses policies only after
`SET ROLE neon_superuser`, but it still holds far more than an app role
should. The application role is therefore created by SQL, which gets no
such membership, and the app never connects as a role that can bypass RLS:

- The first migration is hand-written SQL: `CREATE ROLE tidefern_app
  NOLOGIN NOBYPASSRLS NOINHERIT` (guarded by a `DO` block so PGlite and
  every Neon branch get it the same way), `GRANT tidefern_app TO
  CURRENT_USER WITH SET TRUE`, `GRANT USAGE ON SCHEMA public TO
  tidefern_app`, `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN
  SCHEMA public TO tidefern_app`, `GRANT USAGE ON ALL SEQUENCES IN SCHEMA
  public TO tidefern_app`, and matching `ALTER DEFAULT PRIVILEGES`.
- Once per Neon branch that serves an app (production, staging), the owner
  runs `ALTER ROLE tidefern_app LOGIN PASSWORD '<secret>'` in the SQL
  editor and stores that role's pooled URL as `DATABASE_URL`. Child branches
  inherit the role and password. The owner role's URLs are used only by
  migrations (`DATABASE_URL_UNPOOLED`) and the job runner. So every app
  query already runs as a role that cannot bypass RLS, whether or not it is
  inside the actor wrapper.
- Every user-data table is created with `.enableRLS()` and also `ALTER
  TABLE ... FORCE ROW LEVEL SECURITY`, which binds the table owner to the
  policies as well. Because of that, every read or write outside a request
  runs inside `withActor(subjectId, fn)` or `withSystem(fn)`: `withSystem`
  runs `select set_config('app.system', 'on', true)` and the policy helpers
  return true for it, but only when `current_user` is not `tidefern_app`,
  so the app connection can never claim system context. Seeds, the sweep,
  backfills and the closure job use `withSystem`; jobs that act for one
  person use `withActor`. PGlite's default role is a superuser and bypasses
  RLS, so the harness always drops to `tidefern_app` to prove policies and
  tests `withSystem` from both roles. Policies are split by command:
  `FOR SELECT USING can_read(subject_id, category)`, `FOR INSERT WITH CHECK
  can_write(subject_id, category)`, `FOR UPDATE USING ... WITH CHECK
  can_write(...)`, `FOR DELETE USING subject_id = current_actor()`. The
  helpers are `SECURITY DEFINER`, `STABLE`, with `SET search_path =
  pg_catalog, public`, and they mirror `can()` in `core`: ownership,
  guardianship, and an active grant at a sufficient level.
- `withActor(actorId, fn)` in `packages/db` opens a transaction, runs
  `select set_config('app.actor_id', $1, true)` and `SET LOCAL ROLE
  tidefern_app` (a no-op when already that role, and the way tests on
  PGlite drop from its superuser default), runs `fn`, and commits; the
  setting and the role reset with the transaction. Verified on PGlite
  (Postgres 18.3 engine) during research.
- Task B10 records, on a real Neon branch, the output of `SELECT rolname,
  rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN (current_user,
  'tidefern_app')` and a query that returns zero rows for a foreign
  subject, both from the pooled `tidefern_app` connection. Whether a
  SQL-created login role authenticates through Neon's proxy is the one open
  question (section 21); if it does not, the fallback is the owner
  connection with `SET LOCAL ROLE` inside `withActor()` and a lint rule
  that forbids database access outside it.
- Better Auth tables, `rate_limit`, `jobs` and `idempotency_keys` are not
  subject-scoped and stay outside RLS. Jobs run as the owner role with an
  explicit actor context when they act for a user.
- Cost: every request is a transaction, and policies need indexes on the
  columns they check (section 7.4). Acceptable at this scale.

### 7.3 Conventions

- Calendar facts (`period_start`, `due_date`, `entry_date`) are `date`
  columns with an IANA time zone on the profile. "Today" is computed in the
  subject's zone (`todayIn()` in `core`), never from the server clock.
- UUIDv7 primary keys generated in the API (`crypto.randomUUID` is v4; use
  a v7 generator) for index locality; never sequential ids in URLs.
- `created_at`, `updated_at` as `timestamptz`. Every syncable table also
  carries an integer `version` and writes a content-free `deleted_at`
  tombstone (purged after 30 days, immediately on account deletion), so an
  offline queue on mobile can sync later without a schema change.
- Hard delete by default. The one grace period: closing an account locks it
  and revokes every session and grant at once, then waits seven days
  during which signing in again cancels the closure; the DEK is destroyed
  at the end of that window, or immediately when the person chooses
  "delete now". Nothing else is soft-deleted.
- Encrypted columns are `bytea` holding `version || iv || tag ||
ciphertext`; a sibling `kek_version` column records the wrapping key.

### 7.4 Schema overview

| Area                | Tables                                                                                                  | Notes                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | `user`, `session`, `account`, `verification`, `two_factor`, `passkey`, `rate_limit`                     | Generated by Better Auth.                                                                                                                                                                                                                     |
| Profile | `profiles` | `user_id`, display name, `time_zone`, `stage` (`cycle`, `pregnancy`, `postpartum`), `week_start`, units, notification detail level. |
| Keys | `subject_keys` | One row per subject, user or child: `subject_id`, `kind`, `wrapped_dek`, `kek_provider`, `kek_version`. Kept in its own table so no logical dump ever includes it. |
| Relationships       | `households`, `household_members`, `invitations`                                                        | Role (`owner`, `partner`, `guardian`), status; invitations hold a hashed single-use token, 72-hour expiry, inviter. Membership grants nothing by itself.                                                                                      |
| Consent and sharing | `grants`, `consents` | `grants`: owner, grantee, category, level, `child_id` (required when category is `child`), created, revoked. `consents`: user, purpose (`collection`, `sharing`, `notifications`), policy version, granted, withdrawn. Separate consents for collection and sharing are an MHMDA requirement. |
| Cycle               | `cycle_entries`, `entry_symptoms`, `cycle_predictions`                                                  | Entries keyed by `(subject_id, date)`; symptoms and moods from a controlled vocabulary; predictions are derived rows regenerated on write.                                                                                                    |
| Pregnancy           | `pregnancies`, `pregnancy_events`                                                                       | Several pregnancies per subject over time; `due_date`, `dating_method` (`lmp`, `ultrasound`, `manual`); events for appointments, milestones, symptoms; an `ended_at` with a reason kept private and handled gently in the UI.                 |
| Children            | `children`, `child_guardians`, `child_events`, `child_measurements`                                     | Child belongs to a household; guardians many-to-many; measurements typed with units (`g`, `cm`, with imperial display).                                                                                                                       |
| Notes and media     | `notes`, `photos`, `photo_variants`                                                                     | `subject_id`, `author_id`, category; encrypted body and caption; photos hold object keys, status, dimensions, never original filenames or EXIF.                                                                                               |
| Platform | `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`, `push_devices` (Phase 3) | Append-only audit (actor, action, subject, category, time, no content; partner reads deduplicated per actor, subject, category and day; kept one year); outbox jobs with ids-only payloads; idempotency rows (24 hours); export and deletion state machines; `product_events` holds daily aggregate counts only, never a user id, kept 90 days; it also carries the operational counters (sign-in failures, job failures, 5xx per route, sweep outcomes). Better Auth stores IP address and user agent per session; sessions are deleted at expiry. |

Key indexes: `(subject_id, date)` on entries; `(grantee_id, owner_id,
category, child_id) WHERE revoked_at IS NULL` on grants; `(subject_id, created_at)`
on audit events; `(status, run_after)` on jobs; `(actor_id, key)` on
idempotency keys.

### 7.5 Environments and branches

| Environment      | Database                                                                                                                                                                             | Secrets                                             | Data                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------- |
| Local            | PGlite in tests; a personal Neon branch or local Postgres 18 for `pnpm dev`                                                                                                          | `.env.local`, never real keys                       | Seeded synthetic data (`pnpm db:seed`) |
| Preview (per PR) | A Neon branch per preview deployment, created and injected (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`) by Neon's Vercel integration from the `staging` branch, never from production, and deleted when the preview is; migrated and seeded by the build command | Preview-scoped Vercel variables, a preview KEK, console email transport | Seeded synthetic data only, so a leaked preview secret reaches nothing real |
| Staging          | Separate Neon branch (or project at Scale)                                                                                                                                           | Staging credentials and KEK                         | Seeded synthetic data                  |
| Production       | Neon production branch, pooled connections, 7-day history                                                                                                                            | Production credentials and KEK, R2 bucket (Phase 2) | Real users                             |

Preview deployments stay behind Vercel Authentication. Production data never
leaves production; "reset from parent" refreshes the shared dev branch. A
GitHub Actions workflow cannot create the preview branch in time for a
Git-triggered Vercel build, which is why the Neon integration owns it.

## 8. Domain model and authorization

### 8.1 Principles

- Subject, not author. Every health record has a `subject_id` (whose body
  or child it is about). A partner's note about her pregnancy has
  `author_id = partner` and `subject_id = her`; she owns it and it
  disappears for the partner when access is revoked.
- Default deny. A new partner sees nothing until categories are turned on.
  The sharing screen shows exactly what each category reveals.
- Category and level grants: `(owner, grantee, category, level)` with level
  `summary`, `read` or `contribute`. `journal.private` can never be granted.
- Children are co-owned. A child belongs to a household with one or more
  guardians, each with full rights; a non-guardian partner reaches a child
  only through a `child` grant.
- One decision point. `can(actor, action, resource)` in `packages/core` is
  the only code that decides access. Route handlers never compare ids.

### 8.2 Categories and defaults

| Category             | Contents                                                        | New partner default          |
| -------------------- | --------------------------------------------------------------- | ---------------------------- |
| `cycle.status`       | "Period day 2", "fertile window", a mood card she chose to post | Off                          |
| `cycle.history`      | Past periods, cycle lengths, predictions                        | Off                          |
| `cycle.symptoms`     | Logged symptoms and moods                                       | Off                          |
| `journal.private`    | Her private notes                                               | Never shareable              |
| `pregnancy.overview` | Week, due date, milestones, appointments                        | Off                          |
| `pregnancy.photos`   | Bump photos and journal entries                                 | Off                          |
| `child` (one grant per child, `child_id` set) | Milestones, measurements, feeds, sleep, photos | Guardians: full. Others: off |

`summary` is a product feature as much as a security level: "show my
partner how I'm doing" can be a status card, not raw logs.

### 8.3 Request flow

1. Authenticate (Better Auth session) and load the actor with their
   guardianships and active grants.
2. Resolve the target resource and its `subject_id` on the server. Never
   trust a subject or owner id sent by the client. For child records the
   subject is the child; `can()` resolves guardianship and child grants by
   `childId`, and a grant for child A never reaches child B.
3. `can(actor, action, resource)`: owner allows; guardian of the child
   allows; an active grant covering the category at a sufficient level
   allows; otherwise 404.
4. For list endpoints the policy module returns the allowed subject ids and
   categories, and the data layer applies them.
5. Run the query inside `withActor()` so RLS enforces the same rule
   underneath.
6. Write an audit event for every partner read of a shared category
   (summarized per day), every partner write, and every grant change.

The scaffold already ships `can()` with tests for owner, guardian, summary
versus read, revoked grants, per-child scoping, the private journal and the
no-share rule.

Invitations: a hashed single-use token bound to the invitee's email,
72-hour expiry; acceptance happens only by `POST` after the invitee has
signed in with that verified email, never on a `GET` link (cookies ride on
top-level navigations); an invitee who already belongs to another
household is asked which household to join; the inviter sees pending
invitations and can withdraw them. Cross-site request checks (`Origin` and
`Sec-Fetch-Site`) and a database-backed per-actor rate limit apply to every
`/api/v1` mutation from Phase 1.

### 8.4 Edge cases designed now, built when needed

A partner who is also a guardian; a breakup (revoke the partner while the
child stays co-owned); pregnancy loss (a gentle exit from pregnancy mode,
no stale reminders, hiding rather than deleting); an owner closing her
account while a co-guardian keeps the child's records (transfer, not
delete); a household with two cycle-tracking members (each is a subject;
grants are symmetric and separate).

## 9. Privacy and encryption

### 9.1 Hard rules

- No advertising SDKs, pixels, session replay or third-party analytics
  anywhere, including the marketing site and sign-up path. The CSP issues
  a per-request nonce from `apps/web/src/proxy.ts` and sets `script-src
  'self' 'nonce-...' 'strict-dynamic'`; `unsafe-inline` never appears in
  `script-src`, so a future dependency cannot load a script from another
  origin or inject one inline. Every HTML route renders per request as a
  consequence, which is the documented cost of a nonce policy. The browser
  suite asserts the header on every run.
- No third-party scripts on authenticated pages, ever.
- No health data in URLs, query strings, page titles, push text, email
  subjects, cache keys, job names or log lines. Route names are neutral:
  `/today`, `/calendar`, `/journal`, `/family`, `/settings`. Even "visited
  `/pregnancy`" is consumer health data under MHMDA's "derived" clause.
- Allowlist logging: a structured logger that emits only route template,
  status, latency, request id and an HMAC-SHA256 of the user id under a
  per-environment secret (`LOG_HMAC_SECRET`); a bare hash of a UUID is
  reversible by anyone holding the user table. Never bodies, never query
  strings.
- Phase 2 photos: `POST /api/v1/uploads` with `{ purpose, contentType,
  byteLength }` returns `{ uploadId, url, method, headers, expiresAt }`,
  and `POST /api/v1/photos` finalizes with `{ uploadId, subjectId,
  caption }`. The browser upload needs `connect-src` to gain exactly one
  R2 origin and the bucket's CORS to allow `PUT` from the site origin only;
  if that is unwanted, uploads proxy through the API and the CSP stays
  unchanged.
- Every SDK and vendor is a processor. `docs/LAUNCH_RUNBOOK.md` keeps the
  list of vendors, what each receives and the terms that cover it.

### 9.2 Envelope encryption of free text

What is encrypted: note bodies, journal entries, photo captions, free-text
symptom descriptions, appointment details, partner-authored notes. What
stays plaintext but access-controlled: dates, controlled-vocabulary codes,
stage, ids, because predictions, calendars and filtering query them.

Design (verified against Node 24 `crypto` docs and the AWS KMS data-key
pattern during research):

1. Each subject gets a random 32-byte data encryption key (DEK): a user at
   sign-up, a child when the child is created. Keys live only wrapped in
   `subject_keys`. Child rows are encrypted with the child's key, so a
   co-guardian keeps reading them after the other guardian leaves.
2. A key encryption key (KEK) wraps DEKs. `KeyProvider` is an interface:
   `EnvKeyProvider` reads `TIDEFERN_KEK_V1` (32 random bytes, base64, a
   sensitive Vercel variable) in Phase 1; `AwsKmsKeyProvider`
   (`GenerateDataKey` and `Decrypt` with an encryption context) replaces it
   at the Phase 2 gate by re-wrapping DEKs in a background job.
   `subject_keys` records `kek_provider` and `kek_version` per subject.
3. Fields are encrypted with AES-256-GCM, a fresh random 12-byte IV per
   value, a 16-byte tag, and additional authenticated data of `table:column:
row_id` so ciphertext cannot be moved between rows. Stored as
   `version || iv || tag || ciphertext`.
4. The API unwraps a user's DEK on request and caches it in memory for the
   request only. Shared data is decrypted with the owner's DEK after `can()`
   approves, so grants never share keys.
5. Account deletion destroys the user's wrapped DEK, which makes the live
   rows unreadable at once, then deletes the rows. Copies of the wrapped
   key exist only in Neon's point-in-time history and age out with it
   (7 days on Launch); Phase 1 keeps no other backup, and any logical dump
   added later excludes `subject_keys`. A child's DEK is destroyed only
   when the last guardian leaves. A KEK version is retired only after
   every history window that could hold keys wrapped under it has passed.
6. KEK rotation yearly (new version, re-wrap DEKs); per-user DEK rotation
   only after a suspected compromise.

Not end-to-end encryption, deliberately: E2EE conflicts with partner
sharing, server-side predictions and account recovery. Revisit only for an
opt-in "sealed journal" after Phase 2.

### 9.3 Threats and mitigations

| Threat                                       | Mitigation                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Network interception                         | TLS everywhere, HSTS, no plaintext endpoints                                                  |
| Stolen disk or provider media                | Neon and R2 encryption at rest                                                                |
| Leaked database dump, branch or credentials  | Field-level encryption of free text; structured data still protected by authorization and RLS |
| Backup read after a user deleted her account | DEK destroyed; the only copies live in Neon history and age out within the window; no other backup holds keys |
| Over-broad developer or support access       | Encrypted fields unreadable without the KEK; KMS access audited after Phase 2                 |
| Compromised API at runtime                   | Not solved by encryption; least privilege, short-lived credentials, monitoring                |

### 9.4 Caching

API responses carry `private, no-store`. Every HTML route renders per
request because of the nonce policy (section 9.1); only static assets, the
token and manifest exports, `robots.txt` and the sitemap are served from
the CDN. No `use cache`, ISR or `fetch` caching on anything personal. If
function invocations ever matter (Hobby meters a million a month, which a
household cannot approach), the documented alternative is to narrow the
proxy matcher to authenticated routes and let public routes go static with
`script-src 'self' 'unsafe-inline'`; that trade is recorded here so it is
made deliberately, not by drift.

### 9.5 Vendors in Phase 1 and what they see

| Vendor     | Receives                                                          | Terms                  |
| ---------- | ----------------------------------------------------------------- | ---------------------- |
| Vercel | Runs the application: processes all data in plaintext in memory, holds the Phase 1 KEK and every other secret, stores allowlisted logs | Vercel DPA, self-serve |
| Neon       | The database (free text encrypted)                                | Neon DPA, self-serve   |
| GitHub     | Source code, CI logs (no secrets, no data)                        | GitHub terms           |
| Resend     | Email addresses, generic subjects and bodies                      | Resend DPA, self-serve |
| Cloudflare | DNS queries only (Phase 1); R2 objects (Phase 2)                  | Cloudflare terms       |

### 9.6 Regulation, in architectural terms

| Rule                                      | Applies                                                 | Built in                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIPAA                                     | Generally no (consumer-selected app, no covered entity) | Nothing now; if a clinic or insurer ever integrates, sign BAAs (Vercel Pro add-on, Neon Scale) and swap R2 for S3                                                                                                                                   |
| FTC Health Breach Notification Rule       | Yes; covers fertility and symptom tracking              | A disclosure to an SDK is a breach; hence no SDKs. Incident plan with 60-day user notice and FTC notice at 500+ people                                                                                                                              |
| FTC Act Section 5                         | Yes                                                     | Privacy promises match behavior; the privacy policy is generated from the vendor table, not written aspirationally                                                                                                                                  |
| Washington MHMDA                          | Yes (home state)                                        | Separate consent records for collection and sharing; deletion within 45 days including backups (crypto-shredding plus Neon's history window); homepage link to the consumer health data privacy policy; no sale; no geofencing; processor contracts |
| Other states (NV, CT, CA, VA, CO, TX, MD) | Mostly yes                                              | Building to MHMDA covers them; California's CMIA needs counsel review before public launch                                                                                                                                                          |
| COPPA                                     | No as designed                                          | Adults only; never give children logins; child data is still health data                                                                                                                                                                            |
| Apple and Google (Phase 3)                | Yes                                                     | In-app and web account deletion, privacy labels and Data safety matching real behavior, no iCloud storage of health data                                                                                                                            |

Attorney review of consent flows, the privacy policy and vendor terms is a
Phase 2 gate, before anyone outside the household signs up.

## 10. Jobs, email and notifications

### 10.1 Outbox

A `jobs` table (`id`, `type`, `payload_json` with ids only, `run_after`,
`attempts`, `status`, `locked_at`, `last_error`) written in the same
transaction as the change that caused it. Three drains:

1. Inline: after a request commits, the API calls the `defer` callback it
   was constructed with (`after()` from `next/server` in the Next.js host,
   a plain task starter in a standalone host) to drain the jobs it just
   enqueued (claim with `SELECT ... FOR UPDATE SKIP LOCKED`). This covers
   work caused by a request (verification mail, invitation mail, an export
   step). The API never imports a framework.
2. Scheduled: a `GET /api/internal/jobs/run` endpoint outside the public
   `/v1` contract and excluded from the OpenAPI document, protected by a
   bearer `CRON_SECRET` compared in constant time, failing closed with 404
   when the secret is unset (previews, local); scheduled in `vercel.json`
   once a day on Hobby and every minute on Pro.
3. Manual: `pnpm jobs:run` locally.

Scheduled work that no request causes (reminders due tomorrow, retries of
a failed step, purges) rides on the sweep: once a day on Hobby, every
minute on Pro. The sweep also runs the retention purges: idempotency rows
after 24 hours, tombstones after 30 days, `product_events` after 90 days,
`audit_events` after one year, expired closure windows, and it emails the
owner a generic notice when any job sits in `dead`.

Every job is idempotent, retried with backoff and moved to `dead` after five
attempts for inspection without content. Long workflows (export, account
deletion) are state machines in `data_requests` advanced one step per run,
so they survive function timeouts. Job types are neutral (`reminder.send`,
`photo.process`, `account.delete`).

### 10.2 Email

Resend, one sender domain authenticated in Cloudflare DNS. Every link in
an email is an https URL on the apex, never a custom scheme, so it can
become a universal link in Phase 3. Subjects and
bodies are generic ("Your Tidefern reminder", "Confirm your email"), never
health content. A console transport renders mail to stdout in development
and tests; CI never sends.

### 10.3 Notifications

Phase 1 has email reminders only, delivered as a daily batch: the sweep is
scheduled at the owner's chosen hour and Hobby delivers it within plus or
minus 59 minutes, so a reminder is "today's reminders" rather than "at
08:00". Reminders at a chosen time, and retries within minutes rather than
a day, arrive with Pro. The notification service decides the text
once, from a three-level setting (generic, gentle, detailed) with a preview
of how a detailed message looks on a lock screen. Partners are never
notified about her body unless she shared that category at `summary` or
above. Push (Phase 3) goes directly to APNs and FCM with an id and the
chosen text; content loads after the app opens.

## 11. Data rights, built in Phase 1

| Right                  | Mechanism                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export | Phase 1: generated on demand and streamed to the signed-in person after fresh authentication, never stored (a ZIP of decrypted notes in Postgres would bypass field encryption). Phase 2: stored encrypted in private R2 with a 7-day expiry and a generic "your export is ready" email |
| Revoke a partner       | `revoked_at` on grants takes effect on the next request; partner-authored notes about her stay hers; audit event written                                                                                                                                                  |
| Remove a partner       | Revoke all grants and end membership; child co-guardianship handled explicitly                                                                                                                                                                                            |
| Delete a note or photo | Hard delete, variants removed in the same job                                                                                                                                                                                                                             |
| Devices                | Session list and revocation through Better Auth                                                                                                                                                                                                                           |
| Activity               | Read view over `audit_events`: sign-ins, devices, grants given and revoked, partner contributions, exports                                                                                                                                                                |
| Close account | Fresh authentication; sessions and grants revoked and the account locked at once; a 7-day undo window (or "delete now"); then the user's DEK is destroyed, rows and objects deleted, co-owned children transferred to the remaining guardian, processors notified (the Resend contact and its email logs deleted), and a minimal tombstone kept only if needed to honor the request; a public web page offers the same entry point (required by Google Play later) |

## 12. Product surface for the first web release

### 12.1 Route map

Public (rendered per request like every HTML route, indexable only in
production with `SITE_INDEXABLE=true`):

| Route                      | Visitor question                          | Action                                                                                                              |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/`                        | What is Tidefern and is it for me?        | Sign in or create an account (Phase 1), explore the design system                                                   |
| `/privacy`                 | What happens to my data?                  | Read the consumer health data privacy policy (homepage link required by MHMDA); owner-reviewed before public launch |
| `/terms`, `/accessibility` | What are the terms, how accessible is it? | Drafts marked as such until reviewed                                                                                |
| `/account/delete` | How do I delete my account? | Signed-in deletion entry point reachable from a public page |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` (Phase 3) | Universal and App Links | JSON, no redirect, excluded from the CSP proxy matcher and the `www` redirect |
| `/design` and six chapters | How is Tidefern built?                    | For people and agents; noindex                                                                                      |

Authenticated (dynamic, `no-store`, neutral names):

| Route               | Purpose                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/welcome`          | Onboarding: time zone, stage, first period date or due date, consent to collection (separate from sharing), optional passkey |
| `/today`            | The home screen: cycle day or pregnancy week, prediction with uncertainty, quick log, what a partner can see right now       |
| `/calendar`         | Month and list views, logged days, predicted period and fertile window, tap to log                                           |
| `/log/[date]`       | Day sheet: flow, symptoms, mood, note (encrypted)                                                                            |
| `/journey`          | Pregnancy week-by-week view, appointments and milestones; postpartum view after birth                                        |
| `/family`           | Children, guardians, feeds, sleep, growth, milestones                                                                        |
| `/family/[childId]` | One child's timeline and measurements with percentiles                                                                       |
| `/sharing`          | Grants per person and category with plain descriptions of what each reveals; invite a partner                                |
| `/settings`         | Profile, time zone and units, theme, sound, notification detail level, devices, export, delete                               |
| `/activity`         | Account activity from audit events                                                                                           |

### 12.2 States and rules for every screen

Loading, empty, error and offline states are designed, not implied. Every
list has an honest empty state with the next action. Every mutation shows
pending and failure states and never pretends success. Essential content
renders on the server; client components exist only where interaction
requires them. Predictions always show their uncertainty and a line that
they are estimates, not medical advice. Loss, irregular cycles and missed
days are handled without judgment, with a quiet path out of pregnancy mode.

## 13. Design system

### 13.1 Source of truth

`packages/design-tokens/tokens.json` holds the palette, semantic colors
(light and dark), type scale, spacing, radius, motion and sound tokens.
`pnpm tokens:generate` writes `apps/web/src/app/tokens.css`; CI fails when
it is stale. The same JSON is served at `/design/tokens.json`, the CSS at
`/design/tokens.css`, and a future React Native theme and Swift or Kotlin
constants compile from it.

### 13.2 Brand

From the brand sheet (`assets/brand/reference/tidefern-brand-sheet.webp`):

| Name      | Hex       | Meaning   | Role in the system                                                                                    |
| --------- | --------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Fern      | `#2F4F46` | Grounding | Light text and action fill; wordmark color                                                            |
| Sea Glass | `#6EA7A0` | Balance   | Decorative water; darkened to `#3A6B64` for light-mode text, lifted to `#8FC1B9` for dark-mode accent |
| Sage      | `#B7C9B1` | Growth    | Decorative leaf fills, dark-mode mark                                                                 |
| Sand      | `#E6D6C3` | Warmth    | Warm surface accent (highlighted day)                                                                 |
| Stone     | `#D9D9D4` | Clarity   | Neutral separators                                                                                    |
| Mist      | `#F7F5EF` | Breathe   | Light page; dark-mode text                                                                            |
| Clay      | `#C98B74` | Nurture   | Warning family; darkened to `#8E5141` for light text                                                  |

Wordmark: "Tidefern" in Newsreader weight 500. Tagline: "Life flows
together" in Figtree uppercase, 0.18em tracking, Sea Glass accent. Closing
line: "Healthy tomorrows, together". The mark is a fern frond unrolling from
a wave with a mist highlight. Only a raster sheet exists, so
`packages/design-tokens/brand/` holds a hand-authored vector reconstruction
(light, dark and app-icon variants) marked as pending the owner's approval.
If original vectors arrive, they replace the files in place. The mark is
never recreated with a font, an image generator or a raster trace.

### 13.3 Color roles and measured contrast

Light and dark are designed independently; nothing is inverted. Every
pairing below was measured with the WCAG 2.2 formula on 2026-10-04.

| Role                 | Light                 | Dark                  | Measured                                              |
| -------------------- | --------------------- | --------------------- | ----------------------------------------------------- |
| page                 | `#F7F5EF`             | `#0F1A17`             | canvas                                                |
| surface              | `#FFFFFF`             | `#15221E`             | cards and inputs                                      |
| panel                | `#EDE9DF`             | `#1B2B26`             | grouped regions                                       |
| text                 | `#1F3530`             | `#EEEBE3`             | 11.9:1 light, 14.9:1 dark on page                     |
| muted                | `#56696A`             | `#9FB0A8`             | 5.3:1 light, 7.8:1 dark on page; 4.8:1 on light panel |
| accent               | `#3A6B64`             | `#8FC1B9`             | 5.6:1 light, 8.9:1 dark on page                       |
| action / action-text | `#2F4F46` / `#F7F5EF` | `#8FC1B9` / `#0F1A17` | 8.3:1 light, 8.9:1 dark                               |
| border               | `#6F8680`             | `#5C756C`             | at least 3:1 non-text on page                         |
| focus                | `#3A6B64`             | `#A8D2CB`             | 2 px outline, 4 px offset                             |
| warning              | `#8E5141`             | `#DDA58E`             | 5.4:1 light, 8.3:1 dark                               |
| danger               | `#A63E37`             | `#E08A80`             | 5.7:1 light, 6.9:1 dark                               |
| tide, leaf, warmth   | decorative            | decorative            | never text                                            |

Raw brand colors Sea Glass, Sage, Sand, Stone and Clay fail 4.5:1 as text
on Mist and are decoration-only in light mode; the darkened variants above
carry text.

### 13.4 Theme behavior

First visit follows the system preference (`prefers-color-scheme`); a
pre-paint script reads one stored key (`tidefern-theme-v1`) and sets
`data-theme` and `data-theme-source` on `<html>` so there is no flash and
no hydration mismatch. The toggle stores an explicit choice; Settings
offers "follow system" to clear it. `color-scheme` is set per theme so form
controls and scrollbars match, and `theme-color` is declared for both
schemes. Images never invert; the mark swaps to its dark variant.

Why system default rather than dark-first (the site-build skill's usual
default): the brand sheet is light, the marketing page should look like the
sheet, and a health app used at night should respect the device's night
setting without a click. Both themes are finished before either ships.

### 13.5 Typography

| Role                             | Family                                      | Why                                                                                                                    |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Display, headings, wordmark text | Newsreader (variable, OFL, Production Type) | An old-style serif with the contrast and warmth of the sheet's wordmark; optical-size axis available for display sizes |
| Body, controls, labels, numerals | Figtree (variable, OFL, Erik Kennedy)       | Warm geometric sans that matches the tracked tagline, reads well at 14 to 16 px, has tabular-friendly numerals         |

Self-hosted Latin subsets from fontsource 5.3.0 with license files beside
them; `next/font/local` with `display: swap` and metric fallbacks. The scale
is in `tokens.json` (`type-display` through `type-caption`). Body 17 px on
desktop, 16 px on phones, line height 1.6; reading passages 45 to 68
characters wide. The build compares two alternates in rendered specimens
(Fraunces and Source Serif 4 for the serif; Albert Sans and Instrument Sans
for the sans) beside the mark and records the comparison in
`docs/design/TYPOGRAPHY.md`; the pairing above is the decision unless the
specimens show a legibility problem.

### 13.6 Layout, spacing, radius, motion

Max width 1200 px; gutters 64 px desktop, 32 px tablet, 24 px phone. Spacing
scale 4 to 96 px. Radii: 10 px controls, 18 px cards, 28 px sheets, round
pills. No scroll hijacking, custom cursors, animate-on-scroll reveals,
glass panels, blurred orbs, gradient text or decorative status dots.
Personality comes from the serif, the composition, the mark, the quiet tide
and the sound.

Motion contract (task G5 exports it from one `motion-tokens` module that
both the app and `/design/motion` import):

- Two easings only: an interface curve for small controlled movement and a
  settle curve for a view arriving after navigation, both already named
  in `tokens.json`; `transition: all` is forbidden by lint.
- Durations: 180 ms feedback, 280 ms disclosure, 600 ms settle, a 9 s
  decorative tide on the marketing page only.
- One orchestrated entrance per page with named beats, limited to content
  above the fold; transform and opacity only.
- `prefers-reduced-motion` degrades to instant, never to hidden: every
  element reaches its final state immediately and nothing depends on an
  animation finishing.
- Demos in `/design/motion` have a replay control that re-reads the
  constants and show the visitor's reduced-motion state live.
- CSS features with uneven support (relative color syntax, `corner-shape`
  squircles, scroll-driven animations) are either gated behind `@supports`
  with static fallbacks declared first or not used; the build records the
  Baseline status it relied on.

Calendar and date entry: the month grid and range selection build on
`react-day-picker` (through the shadcn/ui Calendar) with Nord's range
semantics (first tap starts, second tap ends, swapped if earlier, hover or
drag preview) and the WAI-ARIA date picker dialog keyboard model; date of
birth and due date use a segmented text input, not a picker. Code from
21st.dev is never vendored (its terms vest marketplace content in the
operator and require link-backs); it and component.gallery are survey
indexes only.

### 13.7 Components

The build produces real, shared components and documents each with its
states (default, hover, focus-visible, active, disabled, loading, error,
empty) in `/design/components`:

Logo and mark, header with primary navigation and controls, mobile menu
(native disclosure, Escape closes and returns focus), footer, text link and
button (primary, secondary, quiet, destructive), inline and toast feedback,
form fields with validation, segmented control, chip group for symptoms,
calendar month grid and list, day sheet, cycle ring (today's position,
prediction and uncertainty), pregnancy week card, timeline, measurement
chart with percentile band, person and grant cards, disclosure, dialog
(native `<dialog>`), skeleton and empty states, theme and sound toggles,
copy-code and token swatches for the reference.

### 13.8 The `/design` reference

Seven chapters, each server-rendered, readable without JavaScript, with a
single H1, stable anchors, previous and next links, and a chapter rail:

| Route                 | Contents                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/design`             | Overview, chapter cards, exports (JSON, CSS, Markdown reference, OpenAPI link)                                                  |
| `/design/brand`       | Mark variants and downloads, clear space, minimum sizes, dark and light rules, wordmark and tagline typography, approval status |
| `/design/color`       | Both themes, every role with measured contrast, a sandboxed pairing checker, copyable variables                                 |
| `/design/type`        | Editable specimens, weights, the scale, reading widths, font provenance                                                         |
| `/design/components`  | Real components with controls for theme and width, keyboard notes, copyable usage                                               |
| `/design/motion`      | Replayable timing and easing demos, reduced-motion behavior, the tide                                                           |
| `/design/sound`       | Playable cues with their levels, the unlock rule, the mute, haptic support notes                                                |
| `/design/foundations` | Layout, accessibility, copy rules, privacy rules and the development checklist                                                  |

A machine-readable catalog (`/design/reference.md` and the JSON export)
maps patterns to source paths. Sandboxed experiments never change
production tokens. Design routes are noindex and outside the sitemap.

What the reference borrows from the strongest model found in research
(Phloom's `/design`, inspected first-hand in both themes and at 390 px on
2026-10-04), with Tidefern's own identity throughout:

- Truth from the running document: the color chapter enumerates the token
  manifest, paints each chip with `var(--token)`, reads the browser's
  resolved value from `getComputedStyle`, prints the measured contrast and
  links to the source file, so the page cannot disagree with the
  stylesheet. Tidefern adds what Phloom lacks: copy-as-CSS and the JSON
  download.
- Roles as triples: every status and brand role ships as a fill, a
  foreground measured on that fill, and an "ink" member for text on the
  page and on tints. Reaching for a fill without its foreground is how
  amber text lands on amber. The token file grows these members in task
  G5.
- Components chapter groups: actions, status and identity, forms,
  overlays, structure, page patterns, plus Tidefern's own patterns (day
  cell, cycle ring, week card, milestone row, quick-log sheet), all
  rendered from the real primitives.
- Empty-state formula: say what would be here, why it is not, and the one
  action that changes that. Never just "No results".
- Capitalisation: page titles in Title Case, everything else in sentence
  case. This is a deliberate exception to the Vercel Web Interface
  Guidelines rule file, which prefers Title Case for buttons; record it
  where that skill is used.
- Never copied: Phloom's rosette mark, its pink and plum palette, its type
  pairing and its text.

### 13.9 Accessibility targets

WCAG 2.2 AA throughout: landmarks, one H1, skip link, visible unobscured
focus, 24 by 24 px minimum targets (44 px where practical), no drag-only
interactions, 200 percent zoom and 320 px reflow, 4.5:1 text and 3:1
non-text contrast in both themes, named controls, reduced motion. Axe runs
on every route in both themes in CI; manual keyboard passes are recorded in
`docs/design/QA.md`.

## 14. Interface sound and touch

### 14.1 Decisions

- All cues are synthesized with the Web Audio API in
  `apps/web/src/lib/sound.ts`: no files to license, download or cache, no
  library. Research on 2026-10-04 confirmed this beats sample decoding for
  the purpose (verified peaks between -20 and -33 dBFS, zero network
  requests).
- One shared `AudioContext` with `latencyHint: "interactive"` is created or
  resumed inside the first activation-granting input. Per the HTML standard
  those are mouse `pointerdown`, touch `pointerup` or `touchend`, `keydown`
  other than Escape, and `click`; a `pointerdown`-only unlock never fires on
  phones, which is why `SoundProvider` listens to all of them. Safari's
  `interrupted` state after backgrounding is resumed the same way. Before
  the context is running nothing plays, so the first hover is silent by
  design.
- Envelopes rise from a positive floor with an exponential ramp and decay
  with `setTargetAtTime`, because the spec forbids exponential ramps to
  zero. A master gain bus at 0.3 with per-cue peaks of 0.05 (hover) and
  0.11 (press). Pitch jitters plus or minus three percent per play so
  repeated cues do not sound mechanical.
- Cues: hover tick (sine, 1760 Hz, mouse pointers only, at most one per
  90 ms), press drop (triangle, 523 Hz falling a fourth), toggle (the drop
  reversed), success (two rising sine notes), error (a low falling
  triangle). Pitches and levels are tokens in `tokens.json`. Nothing plays
  on page load, route change, toast arrival or a timer; every cue is a
  direct response to the person's action and lasts well under a second.
- `SoundProvider` attaches once at the root and uses event delegation over
  `a, button, summary, input, select, textarea, [role=button|tab|switch]`,
  so every control responds without opting in. Enter and Space play the
  press cue.
- Haptics: `navigator.vibrate` with short patterns (tap 8 ms, select 4 ms,
  success and error patterns) on touch where the platform supports it,
  which today means Chromium browsers on Android. Safari has no web
  vibration API; the only iOS web haptic is Safari 17.4's switch control
  inside a trusted tap, which is an optional post-launch experiment, not a
  dependency.
- On iOS, Web Audio plays on the ambient session and the Ring/Silent switch
  mutes it. That is the behavior Apple's guidelines expect for sound
  effects; do not set `navigator.audioSession.type` to `playback`.
- Default on, including hover, because the owner asked for hover feedback
  explicitly; prior art (Microsoft, Material) ships control sounds off and
  hover sounds rarely, so Settings offers three levels (all, actions only,
  off) and the header mute flips between the chosen level and off. The
  choice is stored on the device (`tidefern-sound-v1`), applied before
  paint, and disclosed as functional storage ("remembered on this device").
  WCAG 1.4.2 applies to audio longer than three seconds; these cues are far
  shorter, but the mute exists because control matters more than
  compliance, and no media query expresses a sound preference.
- Sound never carries meaning alone. Every success or error cue accompanies
  visible text.

### 14.2 What the build adds

The `/design/sound` chapter with playable cues, a level meter and the
mute; the three-level setting and quiet hours in Settings; a navigation
settle cue; a listening pass on a real iPhone and a mid-range Android
before the master gain is frozen; unit tests for the envelope math; and
browser tests that the mute persists and that no audio node is created
before a gesture.

## 15. Testing

| Layer              | Tool                                                                                        | What it protects                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`    | Vitest                                                                                      | Date math across zones and boundaries, cycle and pregnancy predictions with worked vectors, `can()` for every rule                                                                     |
| `packages/schemas` | Vitest                                                                                      | Parsing of every request shape and rejection of health data in the wrong place                                                                                                         |
| `packages/db`      | Vitest + PGlite 0.5.8 (one instance per file, migrations applied with the Drizzle migrator) | RLS policies: the actor sees only their rows, revoked grants hide rows, the private journal never leaks, `SET LOCAL ROLE` resets                                                       |
| `packages/crypto`  | Vitest                                                                                      | Round trips, AAD mismatch and tamper detection, provider swap, crypto-shred makes ciphertext unreadable                                                                                |
| `packages/api`     | Vitest with `app.request()`                                                                 | Each route against the committed spec, problem details, idempotency replay, `no-store` headers, denial returns 404                                                                     |
| `apps/web`         | Playwright + axe against the production build                                               | Navigation, theme and sound persistence, forms and their failure states, keyboard paths, 320 px reflow, both themes, security headers, no indexing on previews, design-reference tools |
| Contract           | `pnpm openapi:check`, `oasdiff breaking` (Phase 1)                                          | No silent breaking change                                                                                                                                                              |
| Visual             | `apps/web/scripts/capture.mjs`                                                              | Screenshots of key routes in both themes at desktop and phone widths for human review in `docs/design/QA.md`                                                                           |
| Performance | Lighthouse 13.x on the production build, mobile throttling | Budgets: 1.5 MB initial transfer, 200 KB compressed first-route JavaScript, LCP 2.5 s, CLS 0.1 as lab proxies; recorded with tool version and conditions |
| Security, required | Vitest and Playwright | `withActor()` runs as a role with `rolbypassrls = false`; `withSystem()` is refused for the app role; an insert by a `summary` grantee is rejected by RLS; a query for a foreign subject returns zero rows; `script-src` carries a nonce and no `unsafe-inline`; log lines contain no body fields; idempotency replay never reads a stored body; the job runner answers 404 without `CRON_SECRET`; a child grant for one child does not reach another; a child note survives the author's account closure when a co-guardian exists |

Browser tests sign in against the production build through seeded,
already-verified users and a mail capture endpoint that exists only when
`E2E_MAIL_CAPTURE=true`, which Vercel production never sets.

Rules: tests protect behavior at real boundaries; no giant snapshots, no
constant-matching assertions, no fake successful integrations. A failing
test is never weakened to pass. An environment failure is reported
separately from an application defect.

## 16. CI/CD and delivery

### 16.1 GitHub Actions

| Workflow                           | Trigger                                                           | Does                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                           | push to `main`, pull requests                                     | Install from the lockfile; prose gate; tokens, brand and OpenAPI freshness; format; lint; types; unit tests; production build; Playwright with Chromium against the build; report artifact on failure |
| `deploy-verify.yml`                | `deployment_status` success (sent by Vercel for every deployment) | curl the deployed home page and `/api/v1/health` with the protection bypass header, then the `@smoke` Playwright subset against the deployment URL; failure shows on the pull request                 |
| `codeql.yml`                       | push, pull requests, weekly                                       | CodeQL security-and-quality for JavaScript and TypeScript                                                                                                                                             |
| `oasdiff` step in `ci.yml` (Phase 1, task E9) | pull requests | `oasdiff/oasdiff-action/breaking` against the base branch's `openapi/v1.json`, failing on breaking changes |
| Renovate (`.github/renovate.json`) | weekly                                                            | Grouped minor and patch updates, lockfile maintenance, Better Auth grouped alone and never automerged                                                                                                 |

Required status checks on `main`: the checks named `verify` and `CodeQL`,
which are the job names in `ci.yml` and `codeql.yml` (GitHub matches
required checks by check-run name; do not enable CodeQL default setup,
which conflicts with the committed workflow).
Secret scanning with push protection on. The only secret the workflows
read is `VERCEL_AUTOMATION_BYPASS_SECRET`; CI never holds a database
credential. Preview databases are handled by Neon's Vercel integration,
not by Actions.

### 16.2 Deployment flow

1. An agent or a person pushes a branch and opens a pull request.
2. CI runs. Vercel builds a preview from the same commit and reports a
   GitHub deployment; `deploy-verify.yml` smoke tests it.
3. A reviewer (or the owner) merges. Vercel builds production from `main`
   with `pnpm db:migrate && next build` (Phase 1) against the production
   direct URL, and the smoke workflow verifies production.
4. Rollback is "promote the previous deployment" in Vercel; a migration
   that cannot be rolled forward gets a corrective migration, never a
   history rewrite.

### 16.3 Branch and commit conventions

`main` is protected and always deployable. Work happens on short-lived
branches named `claude/<topic>` for agents and `<name>/<topic>` for people.
Commits use plain imperative subjects, explain why in the body, carry no
model identifiers and no em dashes. Pull requests fill the template:
what, why, checks run, evidence, build-plan task ids.

## 17. Environments, secrets and local development

### 17.1 Variables

| Variable                                | Scope                  | Purpose                                                                                                           |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                              | optional               | Absolute origin for canonical URLs; Vercel's `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` are used when unset |
| `SITE_INDEXABLE`                        | production only        | Must be exactly `true` to index; previews never index                                                             |
| `DATABASE_URL`                          | all                    | Pooled Neon string for the app                                                                                    |
| `DATABASE_URL_UNPOOLED` | Vercel build only (production and preview); never GitHub | Owner role's direct string for migrations and the job runner |
| `BETTER_AUTH_SECRET` | all | Session signing |
| `BETTER_AUTH_URL` | production only | Auth base URL; previews derive theirs from `VERCEL_URL` |
| `TIDEFERN_KEK_V1` | all, sensitive | Phase 1 key encryption key, base64 of 32 random bytes; different per environment; the suffix is the `kek_version` stored in `subject_keys` |
| `LOG_HMAC_SECRET` | all, sensitive | Keys the HMAC of user ids in log lines |
| `E2E_MAIL_CAPTURE` | local and CI only | Exposes a test-only endpoint that returns the last verification link; never set on Vercel |
| `RESEND_API_KEY`, `EMAIL_FROM`          | preview and production | Transactional email; local uses the console transport                                                             |
| `CRON_SECRET` | production | Bearer secret for `/api/internal/jobs/run`; the endpoint answers 404 wherever it is unset |
| `R2_*`                                  | Phase 2                | Private bucket credentials scoped to one bucket                                                                   |
| `VERCEL_AUTOMATION_BYPASS_SECRET`       | GitHub only            | Lets the smoke workflow reach protected previews                                                                  |

Production secrets exist only in Vercel's production scope. Previews use
preview-scoped values and seeded data. `.env.example` lists every variable
with a comment; `.env.local` is ignored.

### 17.2 Local development

```sh
nvm use                        # Node 24
npm install -g pnpm@10.34.6    # any pnpm 10; it honors packageManager
pnpm install --frozen-lockfile
cp .env.example .env.local     # fill DATABASE_URL with a personal Neon branch or local Postgres 18
pnpm db:migrate && pnpm db:seed   # Phase 1
pnpm dev                       # http://localhost:3000
pnpm check && pnpm test:e2e    # before every push
```

Email prints to the console. The KEK is any 32 random bytes. Seeds create
two households of synthetic people with cycles, a pregnancy, a child and
grants in every state, so every screen has data and every policy branch
has a case.

## 18. Phases and gates

| Phase                                 | Scope                                                                                                                                                                                                                                                                                                                                                                  | Gate to leave it                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0, foundation (this repository, done) | Monorepo, web shell in both themes, tokens and brand, API mount with health and OpenAPI, core math and `can()`, sound system, CI, deployment smoke test, docs and skills                                                                                                                                                                                               | `pnpm check` and `pnpm test:e2e` green; Vercel project connected; first preview verified by the smoke workflow                                                  |
| 1, household                          | Accounts (email, passkey, TOTP, devices), onboarding, profile and consent, cycle logging and predictions, calendar, journal with encryption, pregnancy journey, children and growth, sharing with grants and invitations, audit and activity, export and deletion, email reminders through the outbox, the seven-chapter design reference, full test coverage, runbook | All of section 15 green; both themes reviewed on desktop and phone; QA log closed; a restore from a Neon branch rehearsed; the owner and partner using it daily |
| 2, public                             | Attorney review of consents, privacy policy and vendor terms; KEK moved to a cloud KMS; Vercel Pro (commercial use, per-minute cron, firewall rate limits); Turnstile; scrubbed Sentry; R2 photos with re-encoding; Neon Scale if a 30-day window is wanted; incident plan rehearsed; `SITE_INDEXABLE=true`                                                            | No one outside the household signs up before every item is done                                                                                                 |
| 3, mobile                             | Expo app on the same contract, SecureStore sessions, direct APNs and FCM, app-lock, store listings with accurate privacy labels and Data safety, Health apps declaration                                                                                                                                                                                               | Store review passed; account deletion in-app and on the web                                                                                                     |
| 4, native (optional)                  | Swift and Kotlin clients generated from the spec                                                                                                                                                                                                                                                                                                                       | Only if retention and revenue justify native polish                                                                                                             |

## 19. Operations

- Backups: Neon point-in-time restore (7 days on Launch, 30 on Scale) is
  the Phase 1 backup; there is deliberately no logical dump, because a dump
  would copy wrapped keys outside the window that crypto-shredding relies
  on. If a dump is ever added, it excludes `subject_keys` and names its
  store, key custody and retention here. Restore rehearsal: restore
  production to a branch, run the smoke suite against it, record the time
  (task J7, then quarterly). RPO under 1 hour, RTO under 4 hours.
- Monitoring in Phase 1: Hobby keeps runtime logs for one hour and has no
  drains, so the durable operational record is the database. Sign-in
  failures, job failures, 5xx counts per route and sweep outcomes are
  written as content-free counters to `product_events` (daily aggregates)
  and `audit_events`, kept 90 days, and shown on an owner-only operations
  panel. The deployment smoke workflow, a scheduled uptime check of `/`
  and `/api/v1/health`, GitHub workflow failure emails, Vercel usage
  alerts and a Neon consumption notification are the alerting path; the
  daily sweep emails the owner when the dead queue is not empty. Phase 2
  adds scrubbed error tracking, Pro log retention and Vercel Firewall
  rate limits.
- Incident plan, written before Phase 2: contain (revoke credentials,
  disable the feature), preserve evidence (the database counters and
  audit events; on Pro also export Vercel logs within the day), assess
  whether health data was acquired or disclosed including through a
  vendor, notify users within 60 days and the FTC at 500 or more people,
  then review.
- Cost: Phase 1 on Hobby is free at Vercel; Neon Launch bills usage
  (compute per CU-hour, storage and retained history per GB-month, ten
  branches included and a fee per extra branch-month), which at household
  scale stays under about ten dollars a month, plus the domain. Keep at
  most seven preview branches open: the Neon Vercel integration deletes a
  branch when its Git branch is deleted, so delete merged branches. Set a
  Neon consumption notification and a Vercel usage alert on day one. Pro
  adds Vercel's per-seat price at the Phase 2 gate. The earlier memo's
  estimates for 10K to 1M users still hold; they scale with configuration
  (compute size, read replicas, queues), not a redesign.
- Secret rotation: `TIDEFERN_KEK_V<n>` yearly by adding the next version,
  re-wrapping keys in a job and retiring the old version after every
  history window that could hold keys under it; `BETTER_AUTH_SECRET`,
  `CRON_SECRET`, `LOG_HMAC_SECRET` and the protection bypass secret yearly
  or on any suspected exposure; the `tidefern_app` password on every branch
  that serves an app, because branches copy it. The runbook holds the
  steps.
- Supply chain: exact pins, a lockfile CI refuses to change, Renovate,
  CodeQL, secret scanning, 2FA and hardware keys on GitHub, Vercel, Neon,
  Cloudflare and Namecheap.

## 20. How agents work in this repository

- `AGENTS.md` is the entry point for every harness; `CLAUDE.md` imports it.
  Project skills live in `.agents/skills/` with links in `.claude/skills/`:
  `site-build` for any page, component, motion, design-system or audit
  work; `humanize-writing` and `humanize-code` for copy and code;
  `humanize.md` holds the explicit writing preferences.
- `docs/BUILD_PROMPT.md` is the complete assignment. `docs/BUILD_PLAN.md`
  is the tracked task list with ids, owners, status and evidence; an agent
  claims a task before starting and closes it with evidence.
  `docs/BUILD_PROGRESS.md` is the append-only log with commands, results,
  decisions and the next action, updated after every milestone and before
  a turn ends.
- One lead owns visual direction, shared components and integration.
  Subagents take bounded, non-overlapping work (a package, a chapter, a
  test suite, a review) and hand back written results; nobody redesigns
  shared UI in parallel.
- Every change goes through a branch, `pnpm check`, `pnpm test:e2e`, a
  pull request and the deployment smoke test. Nothing is reported done
  without the command output that proves it.
- Never from memory: versions, API shapes, legal facts. Resolve, cite, pin.

## 21. Open questions and re-verification list

| Question                                                                                                                     | Owner                 | When                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------- |
| Does `SET LOCAL ROLE` pass through Neon's transaction-mode pooler as expected (verified on PGlite only)? | build agent | first Neon branch in Phase 1 |
| Does a SQL-created `LOGIN` role (`tidefern_app`) authenticate through Neon's proxy with a password, so the app never connects as a `BYPASSRLS` role? Fallback in section 7.2 | build agent | task B10 |
| Does the first Vercel build succeed with pnpm 10 from `packageManager` and the monorepo root install?                        | owner and build agent | first preview                          |
| Exact `deployment.environment` strings Vercel sends (`Preview`, `Production`) for the smoke workflow filter                  | build agent           | first pull request; log the event once |
| When `eslint-config-next` supports ESLint 10 so the web app can leave 9                                                      | Renovate              | monthly                                |
| When typescript-eslint supports TypeScript 7.1's API                                                                         | Renovate              | monthly                                |
| Whether pnpm 12 builds cleanly on Vercel                                                                                     | build agent           | a throwaway branch in Phase 1          |
| Owner approval of the reconstructed mark, or delivery of original vectors                                                    | owner                 | before the brand chapter is final      |
| Attorney review of consent flows, privacy policy, vendor terms; California CMIA scope; New York's health privacy bill status | owner                 | Phase 2 gate                           |
| Better Auth passkeys on Expo end to end                                                                                      | build agent           | Phase 3                                |

## 22. Sources

Vendor documentation and registries consulted on 2026-10-04 (the research
file holds quotes and the full list):

- Hono: Next.js guide, `@hono/vercel` on npm, `@hono/zod-openapi` README.
- Next.js 16.3.8: route handlers, `transpilePackages`, `useTypeScriptCli`,
  installation and `create-next-app` defaults.
- Vercel: Hono on Vercel, monorepos, Vercel for GitHub, Fluid compute,
  Node.js versions, cron usage and pricing, deployment protection bypass,
  Git plan restrictions, Services (Beta), reverse proxy guidance.
- Turborepo: internal packages, `turbo-ignore` deprecation.
- Neon: CLI projects (Postgres 18 default), history window, connection
  pooling, Vercel connection methods, GitHub integration, reset from
  parent, RLS with Drizzle.
- Drizzle: migrate, v1 upgrade notes (to know what not to follow).
- Better Auth: Hono and Next.js integrations, CLI, passkey, 2FA, rate
  limit, session management, email and password; OSV advisories.
- PGlite 0.5.8 (`select version()` run locally), Node 24 `crypto`, AWS KMS
  `GenerateDataKey`, NIST SP 800-38D.
- TypeScript 7.0 announcement, typescript-eslint dependency versions,
  ESLint 10 migration guide, pnpm 12 release notes, corepack README.
- npm registry: every version in section 4.2, resolved with `npm view`.
- Regulation: FTC Health Breach Notification Rule and guidance, FTC orders
  on Flo and Premom, RCW 19.373 (MHMDA), HHS health app scenarios, Apple
  review guidelines and account deletion, Google Play health policies.
- The two source memos, analyzed in `docs/research/SOURCE_ANALYSIS.md`.
