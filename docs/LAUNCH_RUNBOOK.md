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
3. Node.js 24.x is read from `engines.node`; build and install commands stay
   default. The first build installs with pnpm 10.34.6 from
   `packageManager`.
4. Deployment Protection: keep Vercel Authentication on for previews.
   Create a Protection Bypass for Automation secret and store it in GitHub
   as the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
5. Environment variables: `SITE_INDEXABLE=false` everywhere for now. Phase
   1 adds the variables in `.env.example`, each scoped to the right
   environment and marked sensitive where the comment says so.
6. Confirm GitHub receives `deployment_status` events (Project Settings,
   Git). The `Verify deployment` workflow should run on the first preview.

### Neon

1. Create the project on Postgres 18 in `us-east-1` (next to Vercel `iad1`).
2. Branches: `production` (default), `staging` (from production, before any
   real data exists), `dev`. Set production history retention to 7 days.
3. Create the application login role `tidefern_app` in the console (the
   build marks it `.existing()` in Drizzle) and record its password as a
   sensitive variable.
4. Install the Neon GitHub integration on the repository; it stores
   `NEON_API_KEY` (secret) and `NEON_PROJECT_ID` (variable) for the preview
   branch workflow.
5. Copy the pooled and direct connection strings into Vercel as
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for production and, from the
   `staging` branch, for preview.

### GitHub

0. Decide repository visibility. `iurman/tidefern` is public today. That
   makes rulesets, CodeQL default setup and push protection free, but the
   planning documents and, later, the product source are visible to
   anyone. A private repository under a personal account needs GitHub Pro
   for rulesets and loses CodeQL default setup and push protection
   (gitleaks-action is the free fallback). Choose deliberately before
   Phase 1 code lands.
1. Branch protection or a ruleset on `main`: require the `verify` and
   `CodeQL` checks, require a pull request, no force pushes.
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
   for the authorities Vercel lists.
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

Playwright downloads its Chromium build on first run; set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to reuse an installed browser.

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

Vercel: promote the previous production deployment. Database: migrations
roll forward only; write a corrective migration. Never rewrite history on
`main`.

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

| Vendor           | Receives                                                      | Terms |
| ---------------- | ------------------------------------------------------------- | ----- |
| Vercel           | Opaque request paths, allowlisted logs, environment variables | DPA   |
| Neon             | The database; free text encrypted                             | DPA   |
| GitHub           | Source, CI logs                                               | Terms |
| Resend (Phase 1) | Email addresses, generic subjects and bodies                  | DPA   |
| Cloudflare       | DNS; R2 objects in Phase 2                                    | Terms |

## Owner inputs still missing

- Approval of the reconstructed mark, or original vector files.
- The production domain.
- Legal facts for the privacy policy, terms and accessibility statement
  (entity name, contact address, inbox), and attorney review before Phase 2.
- Vercel Pro upgrade and a cloud KMS before anyone outside the household
  signs up.
