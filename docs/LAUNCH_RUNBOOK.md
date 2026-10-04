# Launch runbook

Prepared 2026-10-04 for the foundation. The Phase 1 lead completes it
(task J4). Everything here is reversible except DNS and paid plan changes,
which only the owner performs.

## Owner actions to connect delivery (one time)

### Vercel

1. In the Vercel team, Add New, Project, import `iurman/tidefern`.
2. Framework preset Next.js. Root Directory `apps/web`. Leave "Include
   source files outside of the Root Directory" on and "Skip deployment"
   (unaffected project skipping) on.
3. Node.js 24.x is read from `engines.node`. Vercel installs pnpm 10 from
   `packageManager` at the repository root. Record which plan the team is
   on (Hobby or Pro) in the progress log; Hobby means a once-a-day cron,
   300 second functions, one-hour log retention and non-commercial use.
   Set a usage alert in the team's billing settings.
4. Deployment Protection: keep Vercel Authentication on for previews.
   Create a Protection Bypass for Automation secret and store it in GitHub
   as the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`; regenerating
   it later invalidates earlier deployments, so redeploy after a rotation.
   Until that secret exists every `Verify deployment` run fails with a 401
   message naming this step, because a deployment's unique URL is itself
   protected. Also add the GitHub repository variable `PRODUCTION_URL`
   (Settings, Secrets and variables, Actions, Variables) with the public
   production origin, for example `https://tidefern.vercel.app`, so the
   production smoke test checks what people actually reach.
   Firewall: add the one WAF rate-limit rule Hobby allows, on `/api/auth/*`
   keyed by IP (a window of 60 seconds is enough), as defense in depth.
   Escrow: store `TIDEFERN_KEK_V1` and `BETTER_AUTH_SECRET` in the owner's
   password manager at the moment they are generated; Vercel cannot show a
   sensitive variable again, and a lost KEK is every encrypted note lost.
5. Environment variables: `SITE_INDEXABLE=false` everywhere for now. Phase
   1 adds the variables in `.env.example`, each scoped to the right
   environment and marked sensitive where the comment says so.
6. Confirm GitHub receives `deployment_status` events (Project Settings,
   Git). The `Verify deployment` workflow should run on the first preview.

### Neon

Default branch: the Neon default branch is `staging` (seeded synthetic
data), because the Vercel integration forks every preview from the default
branch and production data must never reach a preview. Production is a
protected, non-default branch; if the integration cannot point production
variables at it, set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in
Vercel's production scope by hand and let the integration manage previews
only. Record which it was in the progress log (task A4).

1. Create the project on Postgres 18 in `us-east-1` (next to Vercel `iad1`).
2. Branches: `production` (default), `staging` (from production, before any
   real data exists), `dev`. Set production history retention to 7 days.
3. Do not create roles in the console: console roles join
   `neon_superuser`, which bypasses row level security. The first migration
   creates `tidefern_app` (no login, no bypass) with its grants. After that
   migration has run on a branch that serves an app, run `ALTER ROLE
   tidefern_app LOGIN PASSWORD '<secret>'` once in the SQL editor and store
   that role's pooled connection string as `DATABASE_URL` for the matching
   environment. Child branches inherit the role.
4. Skip the Neon GitHub integration; previews are handled by Neon's Vercel
   integration in the next step, and CI never holds a database credential.
5. Install Neon's Vercel integration on the Tidefern project with the
   `staging` branch as the parent for previews. It creates a branch per
   preview deployment and injects `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED`. For production, set `DATABASE_URL` to the
   `tidefern_app` pooled string and `DATABASE_URL_UNPOOLED` to the owner's
   direct string. Set the build command to `pnpm db:migrate && next build`
   once `packages/db` exists.

### GitHub

00. Merge the foundation. Everything in this record was pushed to the
    branch `claude/friendly-johnson-lrt79s`; `main` still holds the empty
    initial commit. Open the pull request from that branch into `main` and
    merge it. Until the workflow files are on the default branch, GitHub
    registers no workflows, so no CI run appears anywhere and the ruleset
    below cannot name its required checks; the first pull request after
    the merge shows `verify` and `CodeQL` as checks.
0. Decide repository visibility. `iurman/tidefern` is public today. That
   makes rulesets, the committed CodeQL workflow and push protection free,
   but the planning documents and, later, the product source are visible
   to anyone. A private repository under a personal account needs GitHub
   Pro for rulesets, loses push protection (gitleaks-action is the free
   fallback), and meters GitHub Actions at 2,000 minutes a month, which CI,
   the deployment smoke test, CodeQL and a twice-hourly uptime check would
   exceed; stay public, or budget minutes and move uptime to an external
   monitor. Choose deliberately before Phase 1 code lands.
1. A ruleset on `main`: require the checks named `verify` and `CodeQL`
   (the job names in `ci.yml` and `codeql.yml`), require a pull request,
   no force pushes. Do not enable CodeQL default setup; it conflicts with
   the committed workflow.
2. Secret scanning with push protection on; Dependabot alerts on.
3. Enable Renovate (the GitHub App) so `.github/renovate.json` takes effect.

### Resend (Phase 1)

1. Add the sending domain and publish its SPF, DKIM and DMARC records in
   Cloudflare.
2. Create a restricted API key; store it as `RESEND_API_KEY` for preview
   and production. Local work uses the console transport.

### Cloudflare DNS (when the domain is chosen)

1. Add the domain to the Vercel project; copy the exact records Vercel
   shows into Cloudflare as DNS-only (grey cloud).
2. Enable DNSSEC and publish the DS record at Namecheap. Add a CAA record
   that authorizes `letsencrypt.org`; Vercel issues through Let's Encrypt
   and a CAA record without it breaks issuance and renewal.
3. Verify HTTPS on apex and `www`, and that `www` redirects to the apex.
   Keep `SITE_INDEXABLE=false` until the owner has reviewed the public
   pages and the privacy policy.

## Local setup

```sh
nvm use                          # Node 24 from .nvmrc
npm install -g pnpm@10.34.6      # or any pnpm 10
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm check                       # prose, generated files, lint, types, unit tests, build
pnpm test:e2e                    # Playwright against the production build
pnpm dev                         # http://localhost:3000
```

Playwright's browser is a separate install: `pnpm --filter web exec
playwright install chromium` (with `--with-deps` where you have sudo), or
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to reuse an installed browser.

## Environment variables

See `.env.example`. Production values live only in Vercel's production
scope; previews receive staging-branch database URLs and their own KEK.
The architecture record section 17 lists scope and purpose for each.

## Indexing

Previews always send `X-Robots-Tag: noindex, nofollow`, an empty sitemap
and a disallow-all robots file. Production indexes only when
`SITE_INDEXABLE=true` is set in Vercel and `VERCEL_ENV` is `production`.
Design routes and the API stay noindex everywhere.

## Rollback

Vercel Instant Rollback on Hobby goes back only to the immediately previous
production deployment. After a rollback Vercel stops assigning the
production domains to new deployments, so later merges build green but do
not go live until you choose "Undo Rollback" or run `vercel promote`; cron
jobs revert to the rolled-back deployment's schedule and environment
variable changes are not applied. The `deploy-verify` production check
compares the deployed commit with `main` and fails loudly while a rollback
is in effect. Database: migrations roll forward only and are written
expand-then-contract, so the previous code keeps working against the new
schema; a problem gets a corrective migration; destructive steps run only
through the owner-triggered migration workflow. Never rewrite history on
`main`.

## Restore (task J7, then quarterly)

1. Rehearsal: in the Neon console create a branch from `production` at a
   chosen timestamp named `restore-<date>`. A real restore uses Restore on
   the production branch instead, which keeps a backup branch of the
   current state; the chosen timestamp is the recovery point.
2. Run `ALTER ROLE tidefern_app LOGIN PASSWORD '<secret>'` on the branch
   only if it will serve an app.
3. Point one preview at it: set `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
   for a single Git branch in Vercel, redeploy, and run `pnpm test:e2e
   --grep @smoke` with `PLAYWRIGHT_BASE_URL` set to that deployment.
4. Record start and end times in the progress log (targets: recovery
   point under one hour, recovery under four hours).
5. Delete the rehearsal branch; it holds live wrapped keys and real data.

## Alerts

Set a Neon consumption notification and a Vercel usage alert on day one.
Failures reach the owner through GitHub workflow emails (CI, deployment
smoke test, uptime), the daily sweep's dead-queue notice, and the
owner-only operations panel fed by content-free counters in the database
(Hobby keeps runtime logs for one hour).

## Secret rotation

| Secret | When | How |
| --- | --- | --- |
| `TIDEFERN_KEK_V<n>` | Yearly | Add `V<n+1>`, deploy, run the re-wrap job, retire `V<n>` after every history window that could hold keys under it |
| `BETTER_AUTH_SECRET` | Yearly or on exposure | Rotate in Vercel; every session signs in again |
| `CRON_SECRET`, `LOG_HMAC_SECRET` | Yearly or on exposure | Rotate in Vercel and redeploy |
| Protection bypass secret | On exposure | Regenerate in Vercel, update the GitHub secret |
| `tidefern_app` password | Yearly or on exposure | `ALTER ROLE ... PASSWORD` on every branch that serves an app, then update each `DATABASE_URL` |

## Verification after a deployment

The `Verify deployment` workflow curls `/` and `/api/v1/health` and runs
the `@smoke` Playwright subset against the deployment URL. For a manual
check:

```sh
curl -sI https://<deployment>/ | grep -i -E "x-robots-tag|content-security-policy"
curl -s https://<deployment>/api/v1/health
```

## Uptime (task J5)

A scheduled GitHub Actions workflow checks `/` and `/api/v1/health` twice
an hour once production exists, modeled on the owner's Aviune repository.

## Vendors and processors

| Vendor | Receives | Terms | Subprocessor list to watch |
| ------ | -------- | ----- | -------------------------- |
| Vercel | Opaque request paths, allowlisted logs, environment variables | DPA (Pro and Enterprise only) | security.vercel.com |
| Neon (Databricks, Inc. is the contracting party) | The database; free text encrypted | Databricks MCSA and DPA; Grafana Labs is an extra subprocessor | databricks.com/legal/databricks-subprocessors |
| GitHub | Source, CI logs, never user data | GitHub DPA (October 2025) | github.com/subprocessors |
| Resend (Phase 1) | Email addresses, generic subjects and bodies | Resend DPA; AI features on the account to be checked | resend.com/legal/subprocessors |
| Cloudflare | DNS; R2 objects in Phase 2 | Self-serve agreement incorporating the Customer DPA v6.4 | cloudflare.com/gdpr/subprocessors |

## Owner inputs still missing

- Merge the foundation pull request (`claude/friendly-johnson-lrt79s` into
  `main`), which is what registers the workflows and lets the build agent
  open pull requests against `main`.
- Approval of the reconstructed mark and of the dark-surface variant the
  sheet does not show, or original vector files.
- The production domain.
- Repository visibility (public today; see the GitHub section).
- Legal facts for both privacy pages, the terms and the accessibility
  statement (entity name, contact address, the rights and appeal inbox),
  and attorney review before Phase 2, including the claims register and the
  incident plan.
- Vercel: the plan the team is on (Hobby or Pro), the project import
  (the connected Vercel token had no team scope and listed no teams, so the
  import must be done by the owner or the connector re-authorized), and the
  Pro upgrade plus a cloud KMS before anyone outside the household signs up.
- Resend: confirm whether any AI feature on the account reads email content
  and disable it before the first email is sent.
- WHO: a permissions request for the Child Growth Standards tables before
  any paid tier.
- New York S9269: watch for delivery to the governor through December 2026.
