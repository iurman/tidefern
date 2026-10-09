# Launch runbook

Prepared 2026-10-04 for the foundation and completed 2026-10-09 against
`main` at `742b53b` (task J4). Everything here is reversible except DNS and
paid plan changes, which only the owner performs.

How to read it. A command marked "Verified" was run on 2026-10-09 by J4
and the result is quoted. A command marked "Not run" names the reason,
which is always one of: it needs an owner credential, it writes to
production, Vercel, Neon, GitHub settings or a mail provider, or it
needs the port 3000 another checkout holds on the build machine. A
setting this record does not state (a price, a plan limit, a vendor's
console label) is left to the owner and says so; nothing here is from
memory.

"Household launch" below means the owner and the partner using
`https://tidefern.app` with real accounts, which the Phase 1 gate
requires. "Phase 2" is the public gate in architecture section 18.

## Where things stand on 2026-10-09

| Area | State | Evidence |
| --- | --- | --- |
| Production web and API | `https://tidefern.app` serves the head of `main`; the home page and `/api/v1/health` answer | `Verify deployment` run 37967235952 (deployment_status, `742b53b`) green; scheduled uptime runs green (latest 37934836010) |
| Vercel project | Connected, root `apps/web`, Node 24.x, Next.js preset; build command was the default when last read | A1, `vercel project inspect tidefern --scope iurmans-projects` on 2026-10-04 (progress log) |
| Vercel plan | Stated as Pro by the owner, not verified | Plan row A2 |
| Production database | Not confirmed. A Neon project exists with `production` as its default branch and 6 hours of history; no record says production holds `DATABASE_URL` as `tidefern_app` or that the build migrates | Plan rows A3 and A4; owner action 5 |
| Production email | Not configured: the domain publishes no mail records | `dig` on 2026-10-09 (DNS section) |
| CI on `main` | `verify` and `CodeQL` green | CI 37960238068 and CodeQL 37960238166 on `7bb35d8`; CI 37967126983 and CodeQL 37967126938 on `742b53b` |
| Previews | Smoked by hand against each head commit's own deployment URL, because the Neon integration's branch limit stops previews being aliased | Owner action 9; `Verify deployment` workflow_dispatch runs such as 37963178128 |

## Owner actions to connect delivery (one time)

### Vercel

1. Done (A2). The project `tidefern` (`prj_9KHWVBhkBPNa3sgbkPs8IzOwqXUA`,
   team `iurman's projects`) imports `iurman/tidefern`.
2. Done (A2). Framework preset Next.js, Root Directory `apps/web`, "Include
   source files outside of the Root Directory" on. "Skip deployment" for
   unaffected projects stays on. A docs-only commit still builds, because
   Vercel treats changes outside the workspace definition as global
   (architecture 16.1); that is expected.
3. Node.js 24.x comes from `engines.node` and pnpm 10.34.6 from
   `packageManager` at the repository root. Record the team's plan on
   task A2: the owner stated Pro, and the record still reasons from Hobby
   in places (architecture 10.1, 19 and the comment in
   `apps/web/src/app/api/[[...route]]/route.ts`). What the plan changes
   here, per the record: on Hobby the cron runs once a day, functions stop
   at 300 seconds, runtime logs are kept one hour, one deployment builds
   at a time, Instant Rollback reaches only the previous deployment, and
   use must stay non-commercial; Pro adds per-minute cron, firewall rate
   limits and the Vercel DPA (architecture 9.5, 18 and 19). Set a usage
   alert in the team's billing settings (owner action 3).
4. Deployment Protection: keep Vercel Authentication on for previews. A
   Protection Bypass for Automation secret is stored in GitHub as the
   repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` (since 2026-10-04);
   rotate the value once, because it sat in a plaintext repository
   variable before that (owner action 2), and redeploy after any
   rotation, since regenerating it invalidates earlier deployments. The
   repository variable `PRODUCTION_URL` is `https://tidefern.app`, so the
   production smoke test and the uptime check test what people reach.
   Without the secret every preview smoke fails with a 401 message naming
   this step. Firewall: add a rate-limit rule on `/api/auth/*` keyed by IP
   (a 60 second window) as defense in depth; how many rules the plan
   allows is the owner's to read in Vercel. Escrow: store
   `TIDEFERN_KEK_V1` and `BETTER_AUTH_SECRET` in the owner's password
   manager at the moment they are generated; Vercel cannot show a
   sensitive variable again, and a lost KEK is every encrypted note lost.
5. Environment variables: set each one in the scopes the table under
   "Environment variables" gives, marked sensitive where it says so.
   Not recorded as done for production; the owner confirms each.
6. Done. GitHub receives `deployment_status` events; the deployment
   payloads carry `environment` exactly `Production` and `Preview`.
7. Build command (task A4): `pnpm -w db:migrate && next build`. The `-w`
   matters because the Root Directory is `apps/web` and the script lives
   at the workspace root. Every environment then migrates itself against
   its own `DATABASE_URL_UNPOOLED`; the runner refuses a contract
   migration there (Migrations). Until this is set, nothing migrates the
   production database.
8. Cron: `apps/web/vercel.json` declares one job, `GET
   /api/internal/jobs/run` at `0 6 * * *` (06:00 UTC daily), in region
   `iad1`. The endpoint answers 404 unless production has
   `DATABASE_URL_UNPOOLED` (the host mounts the runner only then) and
   `CRON_SECRET`, and the request carries `Authorization: Bearer
   <CRON_SECRET>`. Set `CRON_SECRET` and `OWNER_EMAIL` in production
   (owner action 10).

### Neon

Default branch: the Neon default branch is `staging` (seeded synthetic
data), because the Vercel integration forks every preview from the default
branch and production data must never reach a preview (architecture 7.5).
Production is a protected, non-default branch; if the integration cannot
point production variables at it, set `DATABASE_URL` and
`DATABASE_URL_UNPOOLED` in Vercel's production scope by hand and let the
integration manage previews only. Record which it was on task A4.

What exists (read-only, 2026-10-06, plan row A3): project `tidefern`
(`still-butterfly-87632083`) on Postgres 18 in `aws-us-east-2`, with
`production` as the default branch and the Vercel production branch,
`vercel-dev`, eight preview branches the integration made, and history
retention of 6 hours. The record chose `us-east-1` to sit next to Vercel's
`iad1`; the owner decides whether `aws-us-east-2` stays (the record gives
latency as the only reason).

1. Branches: create `staging` from `production` while production holds no
   real data, make `staging` the default branch, and create `dev` from
   `staging`. Seed `staging` once with `pnpm db:seed` (owner role URL in
   `DATABASE_URL`, the staging KEK in `TIDEFERN_KEK_V1`) after each schema
   change.
2. History retention on production: 7 days (the plan's value, and the
   Launch maximum per architecture 7.1). Never set it above 7 days without
   changing the policy first: `/privacy` and architecture 11 promise that
   closed accounts leave database history within 7 days, so a 30-day
   window on Scale would make that sentence false.
3. Do not create roles in the console: console roles join
   `neon_superuser`, which bypasses row level security. Migration 0000
   creates `tidefern_app` (no login, no bypass) with its grants. After the
   first migration has run on a branch that serves an app, run `ALTER ROLE
   tidefern_app LOGIN PASSWORD '<secret>'` once in that branch's SQL editor
   and store the role's pooled (`-pooler`) string as that environment's
   `DATABASE_URL`. Child branches inherit the role and its password.
4. Skip the Neon GitHub integration; CI never holds a database credential.
5. The Neon Vercel integration is installed. Point it at `staging` as the
   parent for previews (it creates a branch per preview deployment and
   injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`). For production set
   `DATABASE_URL` to the `tidefern_app` pooled string and
   `DATABASE_URL_UNPOOLED` to the owner role's direct string. Task B10
   then records, on a real branch and a preview, which role each string
   connects as and whether `rolbypassrls` is false for the app's
   connection.
6. Branch limit (owner action 9): the integration's deployment check fails
   with "Branch limit exceeded", so previews after a branch's first push
   are built but never aliased. Delete the eight stale preview branches
   (`preview/claude/friendly-johnson-lrt79s`, `preview/claude/G1-research`,
   `F2-stages`, `B1-db-skeleton`, `D1-crypto`, `F3-policy-filters`,
   `F4-milestones`, `F1-growth`) or turn off per-preview branching, and
   keep at most seven preview branches open; deleting a merged Git branch
   lets the integration delete its Neon branch.
7. Set a consumption notification on day one.

### GitHub

Done: the foundation merged, the repository is public (rulesets, push
protection and the committed CodeQL workflow are free on a public
repository), and every workflow is registered.

1. A ruleset on `main` (task A5): require the checks named `verify` and
   `CodeQL` (the job names in `ci.yml` and `codeql.yml`), require a pull
   request, no force pushes. Do not enable CodeQL default setup; it
   conflicts with the committed workflow. Not verified by J4 (a settings
   read); A5 is `todo` in the plan.
2. Secret scanning with push protection on. Dependabot alerts are off:
   the API answered 404 for vulnerability alerts (owner action 4); turn
   them on under Settings, Code security.
3. Renovate (the GitHub App) reads `.github/renovate.json`.
4. Secrets and variables the workflows read:

   | Name | Kind | Read by | State |
   | --- | --- | --- | --- |
   | `VERCEL_AUTOMATION_BYPASS_SECRET` | Repository secret | `deploy-verify.yml`, `uptime.yml`, Playwright's config | Stored 2026-10-04; rotate once (owner action 2) |
   | `PRODUCTION_URL` | Repository variable | `deploy-verify.yml`, `uptime.yml` | `https://tidefern.app` since 2026-10-04 |
   | `DATABASE_URL_UNPOOLED` | Secret of the `production-migrations` environment | `migrate-production.yml` only | Not recorded as created |
   | `GITHUB_TOKEN` | Automatic | `deploy-verify.yml` (reads the head of `main`) | Nothing to set |

5. An environment named `production-migrations` (Settings, Environments)
   for `.github/workflows/migrate-production.yml`, the only path that
   applies a contract migration (`DROP`, `RENAME`, `ALTER COLUMN ... TYPE`,
   `TRUNCATE`) to production. Add yourself as a required reviewer, limit
   deployment branches to `main`, and add the environment secret
   `DATABASE_URL_UNPOOLED` holding the production owner role's direct
   string. Secrets scoped to the environment are released only to a job
   that targets it, so `ci.yml` never sees the credential. The job runs
   only when the repository owner dispatches it. Not needed until
   the first contract migration; every migration on `main` today is
   additive.

### Resend

Production cannot sign anyone up until this is done: Better Auth requires
a verified email (`requireEmailVerification` in `packages/auth/src/auth.ts`),
and on production the mailer is Resend only when `RESEND_API_KEY` and
`EMAIL_FROM` are both set. With neither set, production uses the console
transport, which withholds every link; with only one set, the auth module
throws when it loads (`packages/auth/src/mail/choose.ts`). The dead-queue
notice and the closure processor notice ride the same transport.

1. Before the first email: check the account for any AI feature that reads
   email content and turn it off (architecture 21).
2. Add the sending domain in Resend and publish the SPF, DKIM and DMARC
   records it shows in Cloudflare. None exist today (DNS section).
3. Create a restricted API key; store it as `RESEND_API_KEY` in Vercel's
   production scope only, with `EMAIL_FROM` as an address on that domain,
   for example `Tidefern <hello@tidefern.app>` (the local part is the
   owner's choice). Previews and local work use the console transport, so
   a preview can never send real mail from a seeded persona.

### Cloudflare DNS

The production domain is `tidefern.app`. Public DNS on 2026-10-09:

| Record | Answer | What the record asks |
| --- | --- | --- |
| `NS tidefern.app` | `jocelyn.ns.cloudflare.com`, `konnor.ns.cloudflare.com` | Cloudflare is the authoritative zone (done) |
| `A tidefern.app` | `216.150.1.1`, `216.150.16.1` | The records Vercel shows, DNS-only (grey cloud) |
| `www.tidefern.app` | no answer | A record for `www` that Vercel redirects to the apex |
| `CAA tidefern.app` | no answer | A CAA record that authorizes `letsencrypt.org` (Vercel issues through Let's Encrypt; a CAA record without it breaks issuance and renewal) |
| `DS tidefern.app` | no answer | DNSSEC on in Cloudflare and the DS record published at Namecheap |
| `MX`, `TXT tidefern.app`, `TXT _dmarc.tidefern.app` | no answer | The Resend records (Resend section) |

Verified with `dig +short <type> <name>` on 2026-10-09 (public DNS only;
nothing was changed).

1. Add `www` to the Vercel project and copy the record Vercel shows into
   Cloudflare as DNS-only. Verify HTTPS on apex and `www`, and that `www`
   redirects to the apex.
2. Enable DNSSEC in Cloudflare and publish the DS record at Namecheap.
3. Add the CAA record for `letsencrypt.org`.
4. `/.well-known` is reserved on Vercel and is never redirected or
   rewritten.

## Local setup

Verified on 2026-10-09 in a fresh worktree of `main`, except where a line
says otherwise.

```sh
nvm use                                   # Node 24.21.0 from .nvmrc
npm install -g pnpm@10.34.6               # matches packageManager
pnpm install --frozen-lockfile
pnpm --filter web exec playwright install chromium
pnpm check                                # prose, generated files, format, lint, types, unit tests, build
```

Results: `pnpm install --frozen-lockfile` "Done in 2.5s using pnpm
v10.34.6" with an engine warning, because this machine runs Node 26.7.0;
the Playwright install exited 0 (it prints a fallback-build notice on this
operating system); `pnpm check` exited 0 ("Tasks: 27 successful, 27 total", all from the turbo cache, since only this file changed). `nvm use` and the
global pnpm install were not run: the machine already had pnpm 10.34.6,
and nvm is not installed on it.

The safe-chain note. On a machine with Aikido safe-chain wrapping pnpm,
`pnpm install` refuses a package younger than its minimum age with
`ERR_PNPM_FETCH_403`, yet can exit 0 having linked nothing. Check that
`node_modules/.bin` is not empty after the install. If it is, the owner
reruns it with `pnpm install --frozen-lockfile
--safe-chain-skip-minimum-package-age`; the age guard is the owner's
control, so an agent never adds that flag on its own.

Where the environment comes from:

- `pnpm dev` and `pnpm --filter web start` read `apps/web/.env.local`, the
  Next.js project folder. A `.env.local` at the repository root is not
  read by the web app (verified: `next dev` printed "Environments:
  .env.local" and served `SITE_URL` only from `apps/web/.env.local`).
- `pnpm jobs:run` reads the root `.env.local` if it exists, else the
  shell.
- `pnpm db:migrate`, `pnpm db:seed` and `pnpm db:grant-login` read only
  the shell. Export the values first, for example `set -a; .
  apps/web/.env.local; set +a`.
- `next dev` writes untracked `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`
  (Next.js 16.3's agent rules) on start. Delete them; do not commit them.

A local database for `pnpm dev`, from a fresh clone (Postgres 18 in a
container; any free port; the passwords are local throwaways):

```sh
cp .env.example apps/web/.env.local
# edit apps/web/.env.local:
#   DATABASE_URL=postgresql://tidefern_app:local-only-app-password@127.0.0.1:54451/tidefern
#   DATABASE_URL_UNPOOLED=postgresql://postgres:local-only-postgres-password@127.0.0.1:54451/tidefern
#   BETTER_AUTH_SECRET, LOG_HMAC_SECRET: openssl rand -base64 32
#   TIDEFERN_KEK_V1: openssl rand -base64 32
#   TIDEFERN_FAKE_NOW=2026-10-05 if you want the seeded cast's dates
podman run -d --name tidefern-pg -e POSTGRES_PASSWORD=local-only-postgres-password \
  -e POSTGRES_DB=tidefern -p 127.0.0.1:54451:5432 \
  docker.io/library/postgres:18.6@sha256:6737476511d43c91c7cee9aa027b5d30458b7ed0f3af663ff8715c14ce4355b6
set -a; . apps/web/.env.local; set +a
until psql "$DATABASE_URL_UNPOOLED" -tAc 'select 1' > /dev/null 2>&1; do sleep 1; done
pnpm db:migrate                           # "migrations applied"
pnpm db:grant-login                       # "tidefern_app can log in; rolbypassrls=false rolsuper=false"
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:seed
pnpm jobs:run                             # one JSON line: claimed, done, failed, dead, sweep
pnpm dev                                  # http://localhost:3000
```

Verified with port 3281 in place of 3000 (`pnpm --filter web dev --port
3281`, because port 3000 belongs to another checkout on the build
machine): `/api/v1/health` answered `"status":"ok"`, a sign-in as
`noor@example.test` answered 200, and `/api/v1/me` returned `today`
`2026-10-05` with a profile. `pnpm db:seed` signs the cast's free text
under the `TIDEFERN_KEK_V1` it is given, so the server must run with the
same value. `pnpm db:grant-login` refuses to run when `VERCEL_ENV` is
`production`. With `SITE_URL` and `BETTER_AUTH_URL` left at
`http://localhost:3000`, sign in on that origin.

### The seeded topology CI uses

`ci.yml` job `verify` migrates and seeds a `postgres:18.6` service, builds
with test-only values, runs the full browser suite against `next start`
with the job runner, checks the byte budgets, then runs the `@smoke`
subset against a second server with no database. To reproduce it locally,
in one shell from the repository root (none of these values is a secret;
the database dies with the container).

CI has no `apps/web/.env.local`, and Next.js fills any key the shell lacks
from that file, in `next build` and `next start` alike. If you followed
the local setup above, move the file aside first and stop its database,
which holds the same port; otherwise the build gets your `SITE_URL` and
`DATABASE_URL_UNPOOLED`, and the database-free server quietly reads your
`DATABASE_URL` back, so the smoke subset proves nothing about running
without a database.

```sh
[ -f apps/web/.env.local ] && mv apps/web/.env.local apps/web/.env.local.off
podman stop tidefern-pg 2> /dev/null || true

export PGPORT=54451 WEBPORT=3281
export OWNER_URL=postgresql://postgres:ci-only-postgres-password@127.0.0.1:$PGPORT/tidefern
export DATABASE_URL=postgresql://tidefern_app:ci-only-app-password@127.0.0.1:$PGPORT/tidefern
export BETTER_AUTH_SECRET=ci-only-better-auth-secret-0123456789abcdef-not-real
export BETTER_AUTH_URL=http://127.0.0.1:$WEBPORT
export TIDEFERN_KEK_V1=dGlkZWZlcm4tY2ktb25seS1rZWstMDEyMzQ1Njc4OWE=
export LOG_HMAC_SECRET=ci-only-log-hmac-secret-0123456789abcdef
export E2E_MAIL_CAPTURE=true TIDEFERN_FAKE_NOW=2026-10-05 BETTER_AUTH_TELEMETRY=0
export CRON_SECRET=ci-only-cron-secret-0123456789abcdef-not-real

podman run -d --name tidefern-ci-pg -e POSTGRES_PASSWORD=ci-only-postgres-password \
  -e POSTGRES_DB=tidefern -p 127.0.0.1:$PGPORT:5432 \
  docker.io/library/postgres:18.6@sha256:6737476511d43c91c7cee9aa027b5d30458b7ed0f3af663ff8715c14ce4355b6
until psql "$OWNER_URL" -tAc 'select 1' > /dev/null 2>&1; do sleep 1; done
DATABASE_URL_UNPOOLED=$OWNER_URL pnpm db:migrate
DATABASE_URL_UNPOOLED=$OWNER_URL pnpm db:grant-login
DATABASE_URL=$OWNER_URL pnpm db:seed
pnpm build

# the seeded server, with the job runner as CI gives it; stop it with Ctrl-C
DATABASE_URL_UNPOOLED=$OWNER_URL OWNER_EMAIL=owner@example.test E2E_JOBS_SCHEDULED_ONLY=true \
  pnpm --filter web start --port $WEBPORT --hostname 127.0.0.1
# in a second shell with the same exports:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:$WEBPORT pnpm test:e2e
pnpm --filter web perf:bytes http://127.0.0.1:$WEBPORT

# the database-free server for the smoke subset; stop the seeded one first
env -u DATABASE_URL -u DATABASE_URL_UNPOOLED pnpm --filter web start --port $WEBPORT --hostname 127.0.0.1
# in the second shell:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:$WEBPORT pnpm test:e2e --grep @smoke

podman rm -f tidefern-ci-pg
[ -f apps/web/.env.local.off ] && mv apps/web/.env.local.off apps/web/.env.local
```

The suite needs `CRON_SECRET` in Playwright's own environment too (the
deletion flow runs the job runner, `apps/web/tests/e2e/jobs.ts`). It runs
one worker, because Better Auth allows three sign-ins per ten seconds for
the whole run. Reseed (remove the container and start again) before a
rerun. `docker` takes the same `run` arguments as `podman`; J4 ran
`podman` only. J4's first run of these commands on 2026-10-09, before
the `.env.local` lines and the second `-u` were added: migrate,
grant-login and seed exited 0; the build exited 0; the full suite "378
passed (19.6m)"; the byte budgets "Every route is within its ceilings (10
routes)"; the smoke subset on the database-free server "6 passed (2.7s)".
The two tests marked with a cross in the list are the smoke rule's own
expected failures, which Playwright counts as passed. The added lines were
run the same day with a decoy `apps/web/.env.local` holding both database
URLs: the file moved aside and back, `podman stop` on a missing container
exited quietly, and the database-free server started with no
"Environments: .env.local" line and the smoke subset "6 passed (3.0s)".

## Environment variables

Derived from every `process.env` read under `apps/`, `packages/` and
`scripts/`, the libraries' own reads, `turbo.json`, the workflows and
`.env.example`. "Sensitive" means mark it sensitive in Vercel. Production
values live only in Vercel's production scope; previews get preview-scoped
values and staging data.

### Read by the application

| Variable | Read by | Production | Preview | Local and CI | Sensitive |
| --- | --- | --- | --- | --- | --- |
| `SITE_URL` | `apps/web/src/lib/site.ts` (canonical URLs, reminder links) | Unset; `VERCEL_PROJECT_PRODUCTION_URL` is used | Unset; `VERCEL_URL` is used | `http://localhost:3000` locally; unset in CI | No |
| `SITE_INDEXABLE` | `apps/web/next.config.ts`, `site.ts` | `false` until the owner turns indexing on (Indexing) | Ignored | `false` | No |
| `DATABASE_URL` | `packages/db/src/client.ts`, seed, grant-login | `tidefern_app` pooled string, by hand | Injected by the Neon integration | Local or CI app role | Yes |
| `DATABASE_URL_UNPOOLED` | migrate, grant-login, `drizzle.config.ts`, `pnpm jobs:run`, the web host's job runner | Owner role direct string (build and runtime; Vercel has no build-only scope) | Injected by the Neon integration | Owner URL; CI sets it only on the database steps and the seeded server | Yes |
| `MIGRATE_DESTRUCTIVE` | `packages/db/src/migrate.ts` | Never in Vercel; `migrate-production.yml` sets `1` | Never | Never | No |
| `BETTER_AUTH_SECRET` | `packages/auth/src/auth.ts`, the e2e session helper | Own value | Own value | Any 32 random bytes | Yes |
| `BETTER_AUTH_URL` | `packages/auth/src/hosts.ts` | `https://tidefern.app` | Unset (derived from Vercel's variables) | The local origin; it is also the trusted origin locally | No |
| `BETTER_AUTH_TELEMETRY` | `@better-auth/telemetry` (the config also turns telemetry off in code) | `0` | `0` | `0` | No |
| `TIDEFERN_KEK_V1` | `packages/crypto/src/keys.ts` (`EnvKeyProvider`), seed | Own value, escrowed | The staging value, because previews fork staging's ciphertext | Any 32 random bytes, base64 | Yes |
| `LOG_HMAC_SECRET` | The route host (actor hashes in log lines) and `packages/api/src/jobs/closure.ts` (the tombstone) | Own value | Own value | Any value | Yes |
| `RESEND_API_KEY`, `EMAIL_FROM` | `packages/auth/src/mail/choose.ts` | Both, or neither (one alone is refused) | Never | Never | Key: yes |
| `CRON_SECRET` | `packages/api/src/routes/internal/jobs.ts`; the e2e job helper | Own value (owner action 10) | Unset; the endpoint answers 404 | CI test value on the seeded server and the suite | Yes |
| `OWNER_EMAIL` | the job runner's dead-queue notice, `packages/api/src/jobs/closure.ts` | The owner's inbox (owner action 10) | Unset | CI test value | No (personal) |
| `E2E_MAIL_CAPTURE` | `choose.ts`, the API route host | Never: the server refuses it | Never: the capture mailer would swallow mail with no endpoint to read it | `true` in CI and the seeded topology | No |
| `E2E_JOBS_SCHEDULED_ONLY` | the API route host | Never (ignored on Vercel) | Never | `true` on the seeded server only | No |
| `TIDEFERN_FAKE_NOW` | `packages/api/src/clock.ts`, seed | Never: the server refuses it | Never: previews would honor it and freeze their calendar | `2026-10-05` in CI | No |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Nothing yet (Phase 2 photos) | Unset | Unset | Unset | Yes when set |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | `site.ts`, `next.config.ts`, `hosts.ts`, `clock.ts`, `choose.ts`, grant-login, the route host | Supplied by Vercel | Supplied by Vercel | Unset | No |
| `NODE_ENV` | `apps/web/src/proxy.ts` | Set by Next.js | Set by Next.js | Set by Next.js | No |

### Read by tooling only (set in a shell or a workflow, never in an env file)

| Variable | Read by |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | `apps/web/playwright.config.ts` (unset: it starts its own server on port 3000) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Playwright config, `scripts/capture.mjs`, `scripts/perf/*.mjs` |
| `PLAYWRIGHT_HTML_OUTPUT_DIR`, `PLAYWRIGHT_BROWSERS_PATH` | Playwright itself (in `turbo.json` pass-through) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Playwright config (bypass headers), `deploy-verify.yml`, `uptime.yml` |
| `EXPECT_INDEXABLE` | `home.spec.ts`, `privacy.spec.ts` (`deploy-verify.yml` sets it for production) |
| `CRON_SECRET` | `apps/web/tests/e2e/jobs.ts` |
| `CI`, `GITHUB_ACTIONS` | Playwright config (`forbidOnly`, server reuse), `scripts/perf/bytes.mjs` |
| `QA_BASE_URL`, `QA_OUTPUT_DIR`, `QA_ROUTES` | `apps/web/scripts/capture.mjs` |
| `ANALYZE`, `ANALYZE_MODE` | `next.config.ts`, set by `pnpm --filter web perf:analyze` |
| `CHROME_PATH` | Lighthouse, set by `scripts/perf/lighthouse.mjs` |
| `NEXT_TELEMETRY_DISABLED`, `TURBO_TELEMETRY_DISABLED`, `DO_NOT_TRACK` | Next.js and Turborepo; every workflow sets them |

### Gaps found

- Read by the code and missing from `.env.example`: none of the
  application's variables. The tooling variables above are left out on
  purpose, because no env file feeds them.
- Listed and read by nothing: `R2_*` (reserved for Phase 2, as
  `.env.example` says) and `VERCEL_BRANCH_URL` (in `turbo.json` `globalEnv`
  only).
- Architecture 17.1 calls `BETTER_AUTH_URL` "production only", but local
  and CI servers set it too: `hosts.ts` takes the local origin from it off
  Vercel.
- `.env.example` says "Copy to .env.local" without the folder; the web app
  reads `apps/web/.env.local` (Local setup).

## Indexing

Previews always send `X-Robots-Tag: noindex, nofollow`, an empty sitemap
and a disallow-all robots file. Production indexes only when
`SITE_INDEXABLE=true` is set in Vercel and `VERCEL_ENV` is `production`.
Design routes and the API stay noindex everywhere. Turning it on is a
Phase 2 gate item: set `SITE_INDEXABLE=true` in Vercel's production scope,
redeploy, and confirm with the verification commands below that the home
page no longer sends `X-Robots-Tag`. Not before the owner has reviewed the
public pages and the policies.

## Migrations

Two paths, both in the record (architecture 3.4 and 7.1, task B12):

- Additive, in the Vercel build. `pnpm -w db:migrate` (Vercel step 7)
  applies the committed journal to the environment's direct URL. Before
  it applies anything the runner scans every pending SQL file for `DROP`,
  `RENAME`, `ALTER COLUMN ... TYPE` and `TRUNCATE` and refuses the whole
  run unless `MIGRATE_DESTRUCTIVE=1`. Migrations are expand then
  contract: each must run under the previous deployment's code, because a
  rollback restores code, not schema.
- Contract, through `migrate-production.yml`, after the code that needed
  the old shape is gone. Note a Neon restore point (a snapshot or the
  timestamp before the run), dispatch the workflow from `main` with the
  migration's journal tag and that restore point, approve the review
  prompt of the `production-migrations` environment, and read the job
  summary, which records both inputs. Not run by J4 (production). The
  dispatch, for the owner:

  ```sh
  gh workflow run migrate-production.yml --repo iurman/tidefern --ref main \
    -f migration=<journal tag> -f restore_point=<snapshot or timestamp>
  ```

A preview branch migrates the same way as production, so a contract
migration that has already run on production also needs its preview and
staging branches considered: previews fork `staging`, which the owner
migrates and reseeds after each schema change.

## Rollback

Read on Hobby terms, which is what the record describes; the owner states
Pro, and the record does not say how Pro's Instant Rollback differs.
Instant Rollback goes back only to the immediately previous production
deployment. After a rollback Vercel stops assigning the production domains
to new deployments, so later merges build green but do not go live until
you choose "Undo Rollback" or run `vercel promote`; cron jobs revert to
the rolled-back deployment's schedule and environment variable changes are
not applied. To undo: in the Vercel project's Deployments view choose
"Undo Rollback", or run `vercel promote <deployment url>` on the
deployment that should be live (not run: it changes production).

What `deploy-verify` can and cannot detect. The step "This production
deployment is the head of main" compares the commit a Production
deployment was built from with the head of `main` and names both. It
catches an old commit deployed or promoted again. It does not see an
Instant Rollback: the rollback keeps the domains on the old deployment,
while each new merge still produces a Production deployment built from the
head of `main`, and that deployment passes the step. This is a recorded
open item: until the health endpoint reports the commit it was built
from, check a rollback by eye in the Vercel Deployments view, which marks
the deployment the domains point to as Current. A manual run of the
workflow makes the comparison only with `-f production=true`, and then it
compares the ref you pass with `main`; it says nothing about what the
domains serve. Without that flag the step is skipped and the run treats
the URL as a preview.

A merge that lands while an earlier production deployment is still being
verified fails that earlier run, because its commit is no longer the head
of `main`. Re-running it compares the same commit again and fails every
time; the newer deployment's own run supersedes it, so read that run
instead. Database: migrations roll forward only; a problem gets a
corrective migration; destructive steps run only through the
owner-triggered workflow. Never rewrite history on `main`.

## Restore (task J7, then quarterly)

Blocked until Neon has `staging` and 7-day retention (A3). With 6 hours of
history today, nothing older than 6 hours can be restored.

1. Rehearsal: in the Neon console create a branch from `production` at a
   chosen timestamp named `restore-<date>`. A real restore uses Restore on
   the production branch instead, which keeps a backup branch of the
   current state; the chosen timestamp is the recovery point.
2. Run `ALTER ROLE tidefern_app LOGIN PASSWORD '<secret>'` on the branch
   only if it will serve an app.
3. Point one preview at it: set `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
   for a single Git branch in Vercel, redeploy, and run
   `PLAYWRIGHT_BASE_URL=<that deployment> VERCEL_AUTOMATION_BYPASS_SECRET=<secret>
   pnpm test:e2e --grep @smoke` (not run: needs the owner's secret and a
   restored branch). The same command was verified against the local
   database-free server.
4. Record start and end times in the progress log (targets: recovery
   point under one hour, recovery under four hours).
5. Delete the rehearsal branch; it holds live wrapped keys and real data.

## Alerts

What exists on 2026-10-09:

- GitHub workflow failure emails for CI, `Verify deployment` and Uptime.
- The daily sweep's dead-queue email to `OWNER_EMAIL`. It reaches the
  owner only once production has `DATABASE_URL_UNPOOLED`, `CRON_SECRET`,
  `OWNER_EMAIL` and Resend.
- Owner settings for day one, not recorded as done: a Neon consumption
  notification and a Vercel usage alert.

What the record describes and the code does not have yet: the owner-only
operations panel and the content-free counters behind it (sign-in
failures, job failures, 5xx per route, sweep outcomes in `product_events`;
architecture 19). No route renders such a panel and nothing writes
`product_events`, although the dead-queue email tells the owner to open
the panel. Runtime logs are short-lived on Vercel (one hour on Hobby).

## Secret rotation

| Secret | When | How |
| --- | --- | --- |
| `TIDEFERN_KEK_V<n>` | Yearly | Add `V<n+1>`, deploy, run the re-wrap job, retire `V<n>` after every history window that could hold keys under it. Not possible yet: the `keys.rewrap` job type has no handler, and every caller builds `EnvKeyProvider` on `TIDEFERN_KEK_V1` |
| `BETTER_AUTH_SECRET` | Yearly or on exposure | Rotate in Vercel and redeploy; every session signs in again |
| `CRON_SECRET`, `LOG_HMAC_SECRET` | Yearly or on exposure | Rotate in Vercel and redeploy. A new `LOG_HMAC_SECRET` changes every actor hash in later log lines and tombstones |
| `RESEND_API_KEY` | On exposure | Create a new restricted key, set it in Vercel production, redeploy, then delete the old key in Resend |
| Protection bypass secret | On exposure (and once now, owner action 2) | Regenerate in Vercel, `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo iurman/tidefern`, redeploy |
| `tidefern_app` password | Yearly or on exposure | `ALTER ROLE ... PASSWORD` on every branch that serves an app (branches copy it), then update each `DATABASE_URL` |
| Owner role password | On exposure | Reset in Neon, then update `DATABASE_URL_UNPOOLED` in Vercel production and in the `production-migrations` environment |

None of these was run by J4 (each writes to Vercel, Neon or GitHub).

## Verification after a deployment

The `Verify deployment` workflow curls `/` and `/api/v1/health`, checks the
cross-site refusal on a mutation (`PUT /api/v1/me` with no `Origin`
answers 403, with the deployment's own `Origin` 404), compares a
production deployment's commit with `main`, and runs the `@smoke`
Playwright subset against the deployment URL. For a manual check:

```sh
curl -sI https://<deployment>/ | grep -i -E "x-robots-tag|content-security-policy"
curl -s https://<deployment>/api/v1/health
# a preview:
gh workflow run deploy-verify.yml --repo iurman/tidefern -f url=https://<deployment> -f ref=<sha>
# the production domain (compares <sha> with main and expects what production sends):
gh workflow run deploy-verify.yml --repo iurman/tidefern -f url=https://tidefern.app -f ref=<sha> -f production=true
```

The two `curl` lines were verified against the local production build
(J4 report); against a deployment they were not run. A protected preview
needs `-H "x-vercel-protection-bypass: <secret>"`. The `gh workflow run`
line without `production` is what the merge queue uses for previews (runs
such as 37963178128). The production line is needed whenever the URL is
the production domain: without `-f production=true` the head-of-main step
is skipped, and once `SITE_INDEXABLE=true` the smoke run fails, because
`home.spec.ts` then expects the preview's noindex header. Neither `gh`
line was run by J4 (each starts a workflow).

## Uptime (task J5)

`.github/workflows/uptime.yml` checks `/` and `/api/v1/health` on the
repository variable `PRODUCTION_URL` on the schedule `11,41 * * * *`.
Each route gets one request and one retry after 30 seconds; a failure
names the URL and the status in the run's annotations and reaches the
owner as a GitHub workflow failure email. The job checks out nothing and
holds no permissions; it sends the protection bypass header only when
`VERCEL_AUTOMATION_BYPASS_SECRET` is set.

GitHub does not keep that schedule. From 2026-10-06T20:32Z to
2026-10-09T13:09Z it started 12 scheduled runs, about one every five and a
half hours, where the cron asks for about 130; all 12 passed. Treat the
check as a few times a day, not every 30 minutes. A tighter cadence needs
an external monitor, which is the owner's choice.

```sh
gh run list --repo iurman/tidefern --workflow uptime.yml --limit 5   # verified
gh workflow run uptime.yml --repo iurman/tidefern                     # not run: starts a workflow
```

Runs never overlap: a run that arrives while another is in progress
waits. GitHub keeps at most one pending run per concurrency group, so if a
second run queues behind the first waiting one, GitHub cancels the older
pending run and keeps the newest.

## Vendors and processors

Every third party the code or the record names. The two policy pages name
the five processors: `/privacy` under "Who processes it for us" and
`/health-privacy` under "What is shared and with whom" (Vercel and Neon
by row, Resend, GitHub and Cloudflare in the paragraph below). The data
summary (`GET /api/v1/me/data-summary`) lists the same five from
`PROCESSORS` in `packages/api/src/routes/profile.ts`.

| Vendor | Receives | Policy pages | Terms | Subprocessor list to watch | Account support contact |
| ------ | -------- | ------------ | ----- | -------------------------- | ----------------------- |
| Vercel | Runs the app: all data in memory while serving, the secrets including the Phase 1 KEK, allowlisted request logs | Both | Vercel DPA, which covers Pro and Enterprise only | security.vercel.com | `[OWNER]` |
| Neon (Databricks, Inc. is the contracting party) | The database; free text encrypted | Both | Databricks MCSA and DPA; Grafana Labs is an extra subprocessor | databricks.com/legal/databricks-subprocessors | `[OWNER]` |
| Resend | Email addresses, generic subjects and bodies, its own email logs | Both | Resend DPA; AI features on the account to be checked | resend.com/legal/subprocessors | `[OWNER]` |
| GitHub | Source, CI logs, synthetic test data; never user data | Both | GitHub DPA (October 2025) | github.com/subprocessors | `[OWNER]` |
| Cloudflare | DNS queries for the domain; R2 objects and Turnstile in Phase 2 | Both | Self-serve agreement incorporating the Customer DPA v6.4 | cloudflare.com/gdpr/subprocessors | `[OWNER]` |

Named by the record, receiving no user data, and therefore not on the
policy pages:

| Third party | Role | Receives |
| --- | --- | --- |
| Namecheap | Registrar | The domain registration and, once DNSSEC is on, the DS record |
| Let's Encrypt | Certificate authority, through Vercel | The domain names on the certificate |
| Renovate (GitHub App) | Dependency updates | Repository access through GitHub |
| npm registry, Docker Hub, Playwright's browser downloads | Packages, the `postgres:18.6` CI image, Chromium | Download requests from CI and developer machines |
| oasdiff (`oasdiff/oasdiff-action`) | Contract diff in CI | Nothing leaves CI: `review: false` keeps both specs on the runner |
| WHO, CDC, AAP, AASM, ACOG | Published sources for growth tables, ranges and dating (`packages/core/data/SOURCES.md`) | Nothing; the app links to their pages |

Planned by the record for Phase 2, each a processor to add to both policy
pages and `PROCESSORS` before it receives anything: a cloud KMS for the
KEK (no vendor chosen), Cloudflare R2 for photos, Cloudflare Turnstile,
and scrubbed Sentry. Better Auth is a library; its telemetry is off in
code and by `BETTER_AUTH_TELEMETRY=0`.

## Owner inputs still missing

One list, reconciled on 2026-10-09 with the owner actions at the top of
`docs/BUILD_PROGRESS.md` (items 1 to 13), the plan rows A2 to A5, B10, F5
and J7, architecture 21, the `[OWNER]` lines, and the rows of
`docs/design/QA.md` left open for the owner. "Blocks" says what
waits: the household launch, the Phase 1 gate (leaving Phase 1, after
first use), Phase 2 (anyone outside the household), or nothing (hygiene).

### Blocks the household launch

| # | What | Where | Why | Progress log, plan |
| --- | --- | --- | --- | --- |
| 1 | Production database: `staging` and `dev` branches with `staging` as the default, production protected, 7-day retention, `tidefern_app` given LOGIN on production after its first migration, `DATABASE_URL` (app role, pooled) and `DATABASE_URL_UNPOOLED` (owner role, direct) in Vercel production | Neon console; Vercel production scope (Neon section) | Without them production has no database the app may use, and B10 and J7 cannot start | Item 5; A3, A4, B10 |
| 2 | The build command `pnpm -w db:migrate && next build`, and the staging KEK in the preview scope | Vercel project settings (Vercel step 7) | Nothing migrates production until it is set | A4 |
| 3 | Production secrets: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://tidefern.app`, `TIDEFERN_KEK_V1` (escrowed first), `LOG_HMAC_SECRET`, `BETTER_AUTH_TELEMETRY=0`, `SITE_INDEXABLE=false` | Vercel production scope (Environment variables) | Sign-in, notes and log hashing need them; no record confirms any is set | Vercel step 5 |
| 4 | Resend: the AI-feature check, the domain records, a restricted key, `RESEND_API_KEY` and `EMAIL_FROM` in production | Resend; Cloudflare; Vercel production scope (Resend section) | Sign-up requires a verified email, and production has no mail transport | Architecture 21 |
| 5 | `CRON_SECRET` and `OWNER_EMAIL` in production | Vercel production scope | The daily sweep, reminders, closures and the dead-queue notice never run while the endpoint answers 404 | Item 10 |

### Blocks the Phase 1 gate

| # | What | Where | Why | Progress log, plan |
| --- | --- | --- | --- | --- |
| 6 | The restore rehearsal with the lead, after item 1 | Neon; one preview (Restore) | A gate item | Item 7; J7 |
| 7 | The owner and the partner using it daily | Production | A gate item | Section 18 |
| 8 | B10's real-branch checks with the lead, after items 1 and 2 | Neon branch and a preview | Proves the app role cannot bypass RLS through the pooler, which PGlite cannot | Item 5; B10 |
| 9 | The Neon branch limit: delete the eight stale preview branches or turn off per-preview branching | Neon (Neon step 6) | Previews after a branch's first push are never aliased, so preview checks run against unique URLs by hand | Item 9 |
| 10 | How a fresh account on a preview verifies its email: a test inbox through the real mailer on previews only, or seeded verified accounts on preview branches | Owner decision, then a plan task | No preview sign-up can finish today | Item 13 |

### Blocks Phase 2

| # | What | Where | Why | Progress log, plan |
| --- | --- | --- | --- | --- |
| 11 | Legal facts: the legal entity name and address, the inbox for privacy and health data requests, a second contact method for breach notices, the accessibility contact if different, the updated date of each policy page, the legal text of `/terms` and its `TERMS_VERSION` label | `docs/design/CONTENT.md` "Owner inputs still missing" (8 lines); `docs/INCIDENT.md` Appendix B | The policy pages show `[OWNER]` markers until supplied; MHMDA requests and appeals need the inbox | Item 8 |
| 12 | Incident facts: the attorney's name, phone and email and out-of-hours availability, the second person on call, the private store for incident files, each vendor's account support contact (the column above) | `docs/INCIDENT.md` Appendix B (8 items; 32 `[OWNER]` markers in the file) | The incident plan cannot be run without them | Item 8 |
| 13 | Processor privacy contacts: replace each `contact` (today the vendor's DPA page) with its privacy contact address and confirm the list | `PROCESSORS` in `packages/api/src/routes/profile.ts` | Architecture 11 promises every processor with its contact address in the data summary | Item 8 |
| 14 | Attorney review: both policies, the terms, the consent text, the guardian's consent on a child's behalf, the claims register, the incident plan and vendor terms; plus the open questions: in `docs/CLAIMS.md` (12 markers: the home page wording after the KMS move, the "used daily" status line, CMIA and `/health-privacy`, the AAP and AASM terms of use), in `docs/INCIDENT.md` (residency, email as the chosen channel, a Washington breach duty, notice register retention, the 318.6 element list, guardian and invitee notices, account data as health data, the vendor-notice start of the 60 days), architecture 21 (a child's records at majority, photo grants outside the household), and whether Phase 1 on Hobby counts as non-commercial (9.5) | The owner's attorney | A Phase 2 gate item | Item 11; architecture 21 |
| 15 | Copy approvals: 80 lines in `docs/design/CONTENT.md` hold 85 `[OWNER]` markers, counted by marker per heading: the 8 owner inputs above, the inventory's opening line (1), the route tables (7, on 3 lines), `/welcome` (6), `/today` (7), `/calendar` and `/log/[date]` (14), `/journey` (14, including the ending dialog's one resources link), `/family` (6) and its context range lines and sources (6, on 5 lines), `/sharing` (12), `/settings` (2: notification preview wording, pronouns and week start), `/activity` (1), the public header (1); the drafts sit in each route's `copy.ts` | `docs/design/CONTENT.md`; the `copy.ts` modules | The Phase 2 copy audit; the pages show drafts or marked placeholders until then | Items 8, 11, 12 |
| 16 | Decisions the pages wait on: passkeys before the domain is final and no later way to add one, the "add your baby later" line for a postpartum profile without a child, the onboarding consent categories per stage, the plausible-date windows, dating by "weeks and days as of a date" and transfer wording (with a clinician), the public header's "Menu" label and its mark-only logo under 380 px | `docs/design/CONTENT.md` (`/welcome`, Public header); architecture 21 | Each keeps a ruled interim behavior until decided | Item 12 |
| 17 | The mark: approve the reconstructed mark and its dark-surface variant, or deliver original vectors | Brand chapter, `packages/design-tokens/brand/` | The home page and brand chapter present it | Architecture 21 |
| 18 | Pro: confirm the plan on A2; if Hobby, upgrade before anyone outside the household signs up | Vercel billing | Commercial use, per-minute cron, firewall rules, log export for the incident plan, the DPA | Item 3; A2; section 18 |
| 19 | KMS: choose the cloud KMS that will wrap the KEK | Owner with the lead; architecture 9.2 | A Phase 2 gate item; nothing in the code names a vendor yet | Section 18 |
| 20 | API log lines: keep the route template (`/api/v1/pregnancies/:id`) beside the actor hash, or log a neutral route class instead. Under architecture 9.1 a template next to a stable actor hash can be derived health data under MHMDA | `docs/design/QA.md` (J3f privacy loop, "API log lines name the resource in the route template", open); the lead and the owner | Logs of anyone outside the household should not carry it undecided | J3f; architecture 9.1 |
| 21 | Neon Scale: only if a 30-day restore window is wanted, and only after the closure promise is reworded (Neon step 2) | Neon; `/privacy` | The published promise depends on 7-day history | Section 18 |

### Blocks a later step only

| # | What | Where | Why | Progress log, plan |
| --- | --- | --- | --- | --- |
| 22 | WHO permission for embedding the Child Growth Standards tables in a product with a paid tier | Architecture 21 | Blocks F5 (the daily tables under 56 days) and any paid tier | Item 6; F5 |
| 23 | New York S9269/A10357: watch delivery to the governor through December 2026 | Architecture 21 | May change the public policy pages | Architecture 21 |
| 24 | The `production-migrations` environment with its reviewer and `DATABASE_URL_UNPOOLED` secret | GitHub settings (GitHub step 5) | Blocks the first contract migration only | B12 |

### Hygiene (blocks nothing, owner only)

| # | What | Where | Progress log, plan |
| --- | --- | --- | --- |
| 25 | Rotate the protection bypass value and store it with `gh secret set` | Vercel; GitHub | Item 2 |
| 26 | A Vercel usage alert and a Neon consumption notification | Vercel billing; Neon | Item 3; A3 |
| 27 | Dependabot alerts on | GitHub settings | Item 4 |
| 28 | The `main` ruleset and secret scanning with push protection, confirmed | GitHub settings | A5 |
| 29 | `www`, CAA and DNSSEC | Cloudflare; Namecheap (DNS section) | Section 3.5 |
| 30 | Re-authorize the Vercel connector at team scope (the lead uses the CLI meanwhile) | Claude connector settings | Item 1 |

## Phase 1 gate

Architecture section 18, item by item, on 2026-10-09. "Done" cites
evidence; nothing is marked done on a statement alone.

| Gate item | Status | Evidence or reason |
| --- | --- | --- |
| All of section 15 green | Not done | Green: CI `verify` 37967126983 on `742b53b` runs every layer below in one job, and CodeQL 37967126938 passed on the same head. Not built: the `packages/db` "integration job against `postgres:18` with `NODE_ENV=production` and two concurrent actors through a pooled connection" has no job yet (task J9 adds it to `verify` with a local PgBouncer in transaction mode); the seeded browser suite runs on `postgres:18.6` without a pooler, and the Neon pooler half is B10, blocked on owner items 1 and 2. Not met: the Lighthouse budgets, where LCP misses on every key route (2.71 to 4.66 s) and first-route JavaScript misses by 7 to 20 KB on `/calendar`, `/sharing` and `/settings` (J2, `docs/design/PERFORMANCE.md`) |
| Section 15, `packages/core`, `packages/schemas`, `packages/crypto`, `packages/api` (Vitest) | Done | `pnpm check` exit 0 on this branch; CI 37960238068 |
| Section 15, `packages/db` on PGlite | Done | `packages/db/src/rls.test.ts`, `actor.test.ts`; CI 37960238068 |
| Section 15, `apps/web` Playwright and axe | Done | 354 browser tests at J1 (#94), the seeded suite in CI 37967126983; J4's local run, 378 passed |
| Section 15, contract | Done | `pnpm openapi:check` in `pnpm check`; the oasdiff step in `ci.yml` |
| Section 15, visual | Done | `apps/web/scripts/capture.mjs`; QA log captures |
| Section 15, security, required | Done | `actor.test.ts` "creates tidefern_app without login, inheritance or RLS bypass"; `rls.test.ts` "refuses system context to tidefern_app, whatever it sets", "still refuses a foreign insert and a journal note from a grantee", "gets zero rows everywhere but her own profile", "reaches that child and never the other"; `privacy-rules.spec.ts` "the page policy: a nonce and strict-dynamic, never unsafe-inline or another origin"; `logger.test.ts` "logs the allowlisted fields and nothing from the path, the query, the headers or the body"; `idempotency.test.ts` "runs once, stores hashes and the resource id, never a body"; `jobs.test.ts` "answers the 404 problem wherever the secret is unset, bearer or not"; `closure.test.ts` "hands the co-guarded child to Ben, who keeps decrypting it with the child's own key" |
| Both themes reviewed on desktop and phone | Done | The lead reviewed captures of every page in both themes at desktop and phone before each H merge (progress log, 2026-10-08); J3e's copy and visual loop captured every route and state at 1440, 1024, 390 and 320 px and 200 percent zoom in both themes (#103, `27c8c3b`; `docs/design/qa/`) |
| QA log closed | Not done | J3 is done (#102, #103) with no critical or high row open, but `docs/design/QA.md` keeps open medium and low rows, each owned: owner inputs (the sentence for sign-in without JavaScript, the route template in API log lines, copy lines) and follow-ups (the page entrance cascade, button labels at 320 px, the 404 metadata) |
| A restore from a Neon branch rehearsed | Blocked on the owner | J7, after owner input 1 (no `staging`, 6-hour retention) |
| The owner and partner using it daily | Blocked on the owner | Owner inputs 1 to 5: production has no confirmed database, migration step, secrets or mail transport |

The Phase 0 gate items are met: `pnpm check` and `pnpm test:e2e` green,
the Vercel project connected, and previews verified by the smoke workflow
(by hand against each head deployment while owner action 9 stands).
