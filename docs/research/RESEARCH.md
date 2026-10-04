# Research findings

Generated from the research workflow run on 2026-10-04 (eight dimensions, one skeptic per dimension, one completeness critic). Every finding carries its source and the date it was checked. Quoted evidence that contained an em dash was normalized to a comma because the repository bans that character; follow the source link for the exact wording. Snippets were verified by the researcher as stated in each heading; re-run them before relying on them in a different version.

Contents: [hosting-api](#hosting-api), [data-auth](#data-auth), [contract-ci](#contract-ci), [sound-darkmode](#sound-darkmode), then the [skeptic verdicts](#skeptic-verdicts) and the [completeness critique](#completeness-critique).

## hosting-api

<a id="hosting-api"></a>

Dimension: Hosting and API placement, plus toolchain compatibility

### Summary

Mounting the Hono app inside a Next.js 16 App Router route handler is documented and current, but the import must be `@hono/vercel` (1.0.0, published 2026-09-28): the `hono/vercel` subpath is marked deprecated in hono 4.13.9+ and will be removed in Hono v5. The adapter is trivial (`handle = app => req => app.fetch(req)`), so cookies, streaming and `c.req.raw` all flow through the standard Response that Next.js returns unchanged; `runtime` defaults to nodejs (edge is deprecated), GET handlers are dynamic by default since Next 15, and `maxDuration` is a per-file export. For a solo developer on one Vercel project, the route-handler mount is the lower-risk v1 (same origin for Better Auth cookies, one build slot, one preview URL), while a standalone Hono project is zero-config on Vercel (`export default app` from `src/index.ts`) and remains the clean split-out path; Vercel Services (Beta) is a third option that keeps one deployment with two services. Vercel detects monorepo apps by Root Directory, enables "Include source files outside of the Root Directory" by default, auto-skips unaffected projects for GitHub-connected pnpm workspaces (no build slot consumed), and auto-enables Turborepo Remote Cache during Vercel builds; `turbo-ignore` is now deprecated in favor of `turbo query affected`. Vercel posts GitHub `deployment_status` events by default, documents a `repository_dispatch` migration with a `client_payload` carrying `url`, `project.name` and `git.sha`, and offers Protection Bypass for Automation on all plans via the `x-vercel-protection-bypass` header. A Hobby team cannot connect a repository owned by a GitHub organization and is restricted to non-commercial use, so Tidefern must be on Pro before it becomes a product; Hobby cron is once per day with hourly precision, functions cap at 300 s, and a single region (default iad1, next to Neon us-east-1). On toolchain: TypeScript 7.0.2 ships no JavaScript API, typescript-eslint 8.71.0 pins `typescript <6.1.0` and closed TS7 support as not planned until the 7.1 API, so pin TypeScript 6.0.3 now with a TS7-ready tsconfig; Next.js 16.3.8 already runs `tsc` by default (`experimental.useTypeScriptCli` defaults to true) so either version builds. ESLint 10.12.0 is safe with eslint-config-next 16.3.8 (peer `eslint >=9`) and is monorepo friendlier (config lookup from each file's directory). pnpm 12.9.1 still writes lockfileVersion 9.0; Vercel's docs list only pnpm 6 to 10, but `@vercel/build-utils` 14.17.0 installs pnpm 12 and honors a `package.json#packageManager` pin without corepack, which matters because corepack is gone from Node 25+ (Node 24 still has it, Node 26 LTS will not). create-next-app 16.3.8 defaults to TypeScript, Tailwind, ESLint, App Router, Turbopack and AGENTS.md, offers `--react-compiler`, and the request-interception file is now `proxy.ts` (Node runtime only).

### Findings

- `hono/vercel` is deprecated as of hono 4.13.9 (published 2026-09-24); the Next.js adapter now lives in the separate `@hono/vercel` package (1.0.0, peer `hono >=4.13.9`) and the adapter is a one-line wrapper around `app.fetch(req)`.
  Source: https://www.npmjs.com/package/@hono/vercel (checked 2026-10-04, confidence high)
  Evidence: hono@4.13.13 dist/adapter/vercel/handler.js: `/** @deprecated \`hono/vercel\` will be removed in v5. Install \`@hono/vercel\` and import from there instead. */ const handle = (app) => (req) => { return app.fetch(req); };`. hono@4.13.8 has no such deprecation comment; 4.13.9 does. @hono/vercel README: "The exports are the same. Change the import path: - import { handle } from 'hono/vercel' + import { handle } from '@hono/vercel'. `hono/vercel` is deprecated and will be removed in Hono v5." `getConnInfo` in @hono/vercel reads `c.req.header("x-real-ip")`.
  Implication: The build agent must add `@hono/vercel` as a dependency of apps/web and import `handle` from it, not from `hono/vercel`. Because `handle` only calls `app.fetch(req)`, there is no adapter magic: whatever Response Hono returns (Set-Cookie headers, streamed bodies) is what Next.js returns, and `c.req.raw` is the NextRequest Next.js passed in. Rate limiting by IP should read `x-real-ip` (what the adapter's getConnInfo uses).

- Hono's official Next.js guide documents the App Router mount at `app/api/[[...route]]/route.ts` with `new Hono().basePath('/api')` and `export const GET = handle(app)`, and states it targets the Node.js runtime.
  Source: https://hono.dev/docs/getting-started/nextjs (checked 2026-10-04, confidence high)
  Evidence: "You can run Hono on Next.js when using the Node.js runtime. On Vercel, deploying Hono with Next.js is easy by using Vercel Functions." ... "If you use the App Router, Edit `app/api/[[...route]]/route.ts`." Code: `import { Hono } from 'hono'; import { handle } from '@hono/vercel'; const app = new Hono().basePath('/api'); app.get('/hello', (c) => { return c.json({ message: 'Hello Next.js!' }) }); export const GET = handle(app); export const POST = handle(app)`.
  Implication: For Tidefern the folder is `apps/web/src/app/api/v1/[[...route]]/route.ts` and the Hono app in the API workspace package must be created with `.basePath('/api/v1')` so Hono's router sees the same prefix Next.js mounts it at. Export one `handle(app)` per HTTP method you want Hono to serve.

- Next.js 16.3.8 route handlers support GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS; GET handlers are dynamic by default since v15; `runtime` defaults to `'nodejs'` with `'edge'` deprecated; `maxDuration` is a per-file export; `dynamic`, `revalidate` and `fetchCache` are removed when Cache Components is enabled; `[[...route]]` also matches the bare `/api/v1` path.
  Source: https://nextjs.org/docs/app/api-reference/file-conventions/route (checked 2026-10-04, confidence high)
  Evidence: "The following HTTP methods are supported: GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS." "If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header". Version history: "v15.0.0-RC: The default caching for `GET` handlers was changed from static to dynamic". Route segment config table: "runtime | 'nodejs' | 'edge' (deprecated) | 'nodejs'", "maxDuration | number | Set by deployment platform"; "v16.0.0: `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when Cache Components is enabled." Dynamic routes: "`app/shop/[[...slug]]/page.js` will also match `/shop`". Cookies example returns `new Response('Hello, Next.js!', { status: 200, headers: { 'Set-Cookie': ... } })`.
  Implication: Do not add `export const dynamic = 'force-dynamic'` (unnecessary, and it becomes invalid under Cache Components) or `export const runtime = 'nodejs'` (already the default; `edge` is deprecated). Export `OPTIONS = handle(app)` explicitly only if Hono's cors middleware should answer preflights, otherwise Next.js auto-answers OPTIONS. Set `export const maxDuration = 60` in the route file; it is the highest-precedence source on Vercel.

- Vercel deploys a standalone Hono app with zero configuration from a default-exported app in `index.ts`, `src/index.ts`, `app.ts` or `server.ts`; routes become Fluid compute functions; `serveStatic()` is ignored; `vc dev` runs it locally.
  Source: https://vercel.com/docs/frameworks/backend/hono (checked 2026-10-04, confidence high)
  Evidence: "To run a Hono application on Vercel, create a file that imports the `hono` package at any one of the following locations: app.{js,...,ts,...}, index.{...}, server.{...}, src/app.{...}, src/index.{...}, src/server.{...}" with `export default app;`. "When you deploy a Hono app to Vercel, your server routes automatically become Vercel Functions and use Fluid compute by default." "Hono's `serveStatic()` will be ignored and will not serve static assets." Hono docs: "Hono can be deployed to Vercel with zero-configuration."
  Implication: The split-out path later is a second Vercel project with Root Directory `apps/api` and a `src/index.ts` that does `export default app`; no vercel.json is required beyond optional `crons`/`regions`. Because the Hono package today has no `next` imports, that move is a new entry file plus a project, not a rewrite.

- Vercel Services (Beta, all plans) lets one project deploy a Next.js frontend and a separate backend service with top-level rewrites, replacing the need to split a monorepo into multiple Vercel projects; build keys move inside each service object.
  Source: https://vercel.com/docs/services (checked 2026-10-04, confidence medium)
  Evidence: "Availability: Services (Beta) are available on all plans". "Services let you deploy multiple backends and frontends within a single Vercel project ... replacing the need to split monorepos into separate Vercel projects." Example vercel.json: `"services": { "my_frontend": { "root": "frontend/" }, "my_backend": { "root": "backend/", "entrypoint": "main:app" } }, "rewrites": [ { "source": "/api/(.*)", "destination": { "service": "my_backend" } }, { "source": "/(.*)", "destination": { "service": "my_frontend" } } ]`. "`functions`, `installCommand`, `buildCommand`, `devCommand`, `ignoreCommand`, `outputDirectory` and `framework` keys should be moved into the relevant service." Node docs: "To deploy a Node.js server alongside a frontend such as a Next.js app within the same project, use Services."
  Implication: This is the future 'one deployment, two services' option if the route-handler mount ever becomes limiting (for example different maxDuration or runtime needs). It is Beta today, so it is not the recommended v1, but the Hono package being next-free keeps this door open.

- Vercel monorepo detection is per-project Root Directory; source files outside the Root Directory are included by default; automatic skipping of unaffected projects is on by default for new projects (GitHub only, pnpm workspaces, unique package names, explicit workspace deps) and does not consume build slots; `ignoreCommand` is the fallback.
  Source: https://vercel.com/docs/monorepos (checked 2026-10-04, confidence high)
  Evidence: "you'll create a new project for each directory in your monorepo that you wish to import ... Click the Edit button next to the Root Directory setting". FAQ: "To access source files outside the Root Directory, enable the Include source files outside of the Root Directory in the Build Step option ... Vercel projects created after August 27th 2020 23:50 UTC have this option enabled by default." "Vercel automatically skips builds for projects in a monorepo that are unchanged by the commit. This setting does not occupy concurrent build slots". Requirements: "only available for projects connected to GitHub repositories", "The monorepo must be using npm, yarn, pnpm, or Bun workspaces", "All packages within the workspace must have a unique `name`", "Dependencies between packages in the monorepo must be explicitly stated in each package's `package.json`". Changelog 2025-02-24: "This behavior is now the default for new projects." vercel.json: "`ignoreCommand` ... When the command exits with code 1, the build will continue. When the command exits with 0, the build is ignored." Limits: "Vercel Projects Connected per Git Repository | 25 (Hobby) | 150 (Pro)". Filtered install example: `"installCommand": "pnpm install --filter web..."` in apps/web/vercel.json.
  Implication: Set Root Directory to `apps/web`, keep the Skip deployment toggle on, declare `@tidefern/api` as a dependency in apps/web/package.json so Vercel's dependency graph sees it, and do not write an `ignoreCommand`. `vercel.json` lives in the app directory (the Root Directory), not the repo root.

- Vercel's Turborepo page still lists `npx turbo-ignore --fallback=HEAD^1` as the Ignored Build Step and `turbo run build` as the build command, but Turborepo now marks `turbo-ignore` deprecated in favor of `turbo query affected`; Remote Cache is automatic during Vercel builds, free on all plans, with 7-day artifact expiry and a 100 GB/month Hobby fair-use upload limit.
  Source: https://turborepo.dev/docs/reference/turbo-ignore (checked 2026-10-04, confidence high)
  Evidence: Turborepo: "`turbo-ignore` is deprecated and will no longer receive updates. Use `turbo query affected` instead". `turbo query affected --exit-code`: "Exit with code `1` when affected packages or tasks are found, `0` when none are found, or `2` on errors." Vercel: "we recommend using `turbo query affected` ... `turbo query affected --base=$VERCEL_GIT_PREVIOUS_SHA --packages <your-project-name> --exit-code`". Vercel table: "Build Command | `turbo run build` (requires version >=1.8) or `cd ../.. && turbo run build --filter=web`", "Root Directory | App location in repository (e.g. `apps/web`)". Remote cache: "When you run `turbo` commands during a Vercel Build, Remote Caching will be automatically enabled. No additional configuration is required." "Vercel Remote Cache is free for all plans, subject to fair use guidelines. Hobby | 100GB / month | 100 / minute". "Vercel automatically expires uploaded artifacts after 7 days". `https://turborepo.dev/schema.json` returns 200; `turborepo.com/schema.json` 301-redirects to it.
  Implication: Use `turbo run build` as the Vercel build command (turbo 2.11.7 pinned in root devDependencies so Vercel does not fall back to global turbo) and `https://turborepo.dev/schema.json` in turbo.json. Rely on Vercel's built-in skipping rather than turbo-ignore; if a custom Ignored Build Step is ever needed, use `turbo query affected`.

- Vercel for GitHub posts `deployment_status` webhook events by default (toggle in project Git settings), posts a commit status per project (consolidated status available for monorepos), and recommends migrating CI triggers to `repository_dispatch` events whose `client_payload` includes `url`, `environment`, `git.sha` and `project.name`.
  Source: https://vercel.com/docs/git/vercel-for-github (checked 2026-10-04, confidence high)
  Evidence: "By default, Vercel notifies GitHub of deployments using the `deployment_status` webhook event. This creates an entry in the activity log of GitHub's pull request UI." "You can disable `deployment_status` events by ... Disabling the `deployment_status` Events toggle. Before doing this, ensure that you aren't depending on `deployment_status` events in your GitHub Actions workflows." "Vercel sends `repository_dispatch` events to GitHub when the status of your deployment changes" with types `vercel.deployment.ready`, `.success`, `.error`, `.canceled`, `.ignored`, `.skipped`, `.pending`, `.failed`, `.promoted`. Migration diff: `- if: github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success'` ... `- BASE_URL: ${{ github.event.deployment_status.environment_url }}` `+ BASE_URL: ${{ github.event.client_payload.url }}`. @vercel/repository-dispatch README payload example: `{ "environment": "production", "git": { "ref": "main", "sha": "abcdef...", "shortSha": "abcdef1" }, "id": "dpl_...", "project": { "id": "prj_...", "name": "example-project" }, "state": { "type": "pending" }, "url": "https://example-project-abc123.vercel.app" }` and "repository_dispatch events are always triggered using the last commit on default branch as the GITHUB_SHA". "By default, git commits will receive a GitHub Commit Status for each project deployed by a commit."
  Implication: A `deployment_status` workflow works today with `environment_url`; a `repository_dispatch` workflow gets a richer payload and can filter on `client_payload.project.name` when the monorepo gains a second Vercel project, but must check out `client_payload.git.sha` explicitly. Either way the workflow file must already be on `main`.

- GitHub triggers `deployment_status` workflows with GITHUB_SHA set to the commit being deployed, never for `inactive` states, and only if the workflow file is on the default branch; the payload carries `deployment_status.state`, `deployment_status.environment_url` and `deployment.environment`. Vercel sends a commit SHA as the deployment `ref`, so GITHUB_REF is empty.
  Source: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows (checked 2026-10-04, confidence medium)
  Evidence: deployment_status: "GITHUB_SHA: Commit to be deployed; GITHUB_REF: Branch or tag to be deployed (empty if commit)"; "When a deployment status's state is set to `inactive`, a workflow run will not be triggered." Webhook docs: "A webhook event is not fired for deployment statuses with an inactive state"; payload includes `deployment_status.environment_url` and `target_url`, `deployment.environment`, `deployment.sha`. vercel/vercel discussion #7581: a user reports "within the Github workflow the context/env variable for the ref is undefined, e.g. `GITHUB_REF=""`" and that `github.event.deployment_status.environment` showed `Preview`.
  Implication: `actions/checkout` with no `ref` checks out the deployed commit (GITHUB_SHA), which is what a smoke test wants. Do not rely on GITHUB_REF or branch-based logic. The exact `deployment.environment` string Vercel uses is only user-reported ('Preview'), so filter on `deployment_status.state == 'success'` and treat any environment-name filter as something to verify on the first PR.

- Vercel's Checks API is for Marketplace integrations and holds aliasing until checks conclude; the separate Deployment Checks feature can require selected GitHub Actions results before a production deployment is promoted; Protection Bypass for Automation is on all plans via the `x-vercel-protection-bypass` header or query param with `VERCEL_AUTOMATION_BYPASS_SECRET` exposed as a system env var.
  Source: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation (checked 2026-10-04, confidence high)
  Evidence: Checks: "When a deployment is created, Vercel triggers the `deployment.created` webhook ... an integrator uses the Checks API to create checks ... Once all checks receive a `conclusion`, aliases will apply, and the deployment will go live". Deployment Checks: "GitHub Checks: Import GitHub Actions workflow results as Deployment Checks. Vercel reads commit statuses and check run results to determine if a deployment should be promoted." and "If you're using `repository_dispatch` ... you must use the `vercel.deployment.ready` event". Bypass: "Availability: Protection Bypass for Automation is available on all plans"; "authenticate using either an HTTP header or a query parameter named `x-vercel-protection-bypass` with the value of the generated secret"; "Vercel automatically sets one secret as the `VERCEL_AUTOMATION_BYPASS_SECRET` system environment variable"; Playwright example sets `extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' }`.
  Implication: GitHub Actions is the right place for the smoke test; the Checks API is not needed (it targets integrations). Keep Vercel Authentication on for previews (available on Hobby) and give the workflow the bypass secret as a GitHub secret. Deployment Checks can gate production promotion later without changing the test itself.

- A Hobby team cannot connect a project to a repository owned by a GitHub organization, cannot deploy commits from anyone but the team owner, and is restricted to non-commercial use; Pro is required for commercial use, team collaboration, custom environments, password protection and >300 s functions.
  Source: https://vercel.com/docs/git (checked 2026-10-04, confidence high)
  Evidence: "You cannot deploy to a Hobby team from a private repository in a GitHub organization, GitLab group, or Bitbucket workspace. Consider making the repository public or upgrading to Pro." "To deploy commits under a Hobby team, the commit author must be the owner of the Hobby team". Limits: "Vercel does not support connecting a project on your Hobby team to Git repositories owned by Git organizations. You can either switch to an existing Team or create a new one." Fair use: "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." ... "Any method of requesting or processing payment from visitors of the site". Hobby page: "Team collaboration features | - | Yes", "Deployments per day | 100 | 6,000", "Vercel Function maximum duration | 300s (5 minutes) | 300s (default) - configurable up to 800s"; FAQ: "Hobby plans are limited to 1 Concurrent Build".
  Implication: If the owner's existing Vercel team is a Hobby team, the GitHub repo must be under the owner's personal GitHub account and the owner must author every deployed commit; a repo under a GitHub organization requires Pro. Two first users is fine on Hobby, but the move to Pro must precede any paid product, and the owner should decide now whether the repo lives under their personal account or an org.

- Cron jobs: 100 per project on all plans; Hobby minimum interval once per day with per-hour (±59 min) precision and deployment fails for more frequent expressions; Pro per-minute; configured in `vercel.json` `crons` (production deployment only).
  Source: https://vercel.com/docs/cron-jobs/usage-and-pricing (checked 2026-10-04, confidence high)
  Evidence: "Hobby | 100 cron jobs | Once per day | Per-hour (±59 min)"; "Pro | 100 cron jobs | Once per minute | Per-minute". "Expressions like `0 * * * *` (per-hour) or `*/30 * * * *` (every 30 minutes) will fail deployment with the error: Hobby accounts are limited to daily cron jobs." vercel.json: "`crons` Used to configure cron jobs for the production deployment of a project" with `path` ("Must start with `/`") and `schedule`.
  Implication: The outbox worker endpoint can be scheduled only once a day on Hobby, which makes Vercel Cron a sweep, not a near-real-time dispatcher; design the outbox so that enqueueing also tries to drain inline (or via `waitUntil`) and the daily cron is a safety net until Pro. Put the cron path under `/api/v1/...` so Hono handles it and check a `CRON_SECRET` bearer header.

- Fluid compute is default for new projects since 2025-04-23; function duration defaults to 300 s (Hobby max 300 s; Pro max 800 s, 1800 s beta); `maxDuration` precedence is function code > vercel.json > dashboard; memory cannot be set in vercel.json under Fluid; for Next.js `src/` projects the vercel.json glob must be prefixed `src/`.
  Source: https://vercel.com/docs/fluid-compute (checked 2026-10-04, confidence high)
  Evidence: "As of April 23, 2025, fluid compute is enabled by default for new projects." Table: "Default / Max duration | 300s (5 minutes) / 300s (5 minutes) (Hobby) | 300s (5 minutes) / 800s (Pro)". Precedence table: "1 Function code ... maxDuration; 2 vercel.json ... maxDuration, region; 3 Dashboard ... maxDuration, region, memory; 4 Fluid defaults". Duration page: "export const maxDuration = 5; // This function can run for a maximum of 5 seconds" in `app/api/my-function/route.ts`; "If your Next.js project is configured to use src directory, you will need to prefix your function routes with `/src/` for them to be detected." vercel.json: "`memory`: Memory cannot be set in `vercel.json` with Fluid compute enabled."
  Implication: Set `maxDuration` in the route file; if a vercel.json override is used instead, the key must be `src/app/api/**/*`. Nothing above 300 s is possible on Hobby, so no job may exceed that.

- Vercel Node.js runtimes are 24.x (default), 22.x and 20.x, overridable via `engines.node` in package.json; Node 24 became GA and default on 2025-11-25; functions default to region `iad1` (Washington, D.C.) for all new projects; Hobby is single-region.
  Source: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions (checked 2026-10-04, confidence high)
  Evidence: "Current available versions are: 24.x (default), 22.x, 20.x"; "You can define the major Node.js version in the `engines#node` section of the `package.json` ... `"engines": { "node": "24.x" }`". Changelog 2025-11-25: Node.js 24 is "the default version for new projects". Region page: "By default, Vercel Functions execute in Washington, D.C., USA (`iad1`) for all new projects"; vercel.json `"regions": ["sfo1"]` example; "Hobby | Single region"; vercel.json docs: "Hobby plans can select any single region."
  Implication: Pin `"engines": { "node": "24.x" }` at the repo root so Vercel and local tooling agree (local LTS is 24.21.0). Add `"regions": ["iad1"]` to apps/web/vercel.json to make the Neon us-east-1 adjacency explicit and survive any future dashboard default change.

- TypeScript 7.0.2 (released 2026-07-08) ships no JavaScript compiler API, the API is expected in 7.1, and Microsoft publishes `@typescript/typescript6` for side-by-side use; TypeScript 6.0 (2026-03-23; 6.0.3 published 2026-04-16) is the last JS-based release and already flips defaults (strict, module esnext, types []) and deprecates options that 7.0 rejects (`baseUrl`, `moduleResolution node`, `target es5`, `esModuleInterop: false`).
  Source: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ (checked 2026-10-04, confidence high)
  Evidence: "While TypeScript 7.0 is here, it does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API, but until then we have made it a priority to ensure TypeScript can be run side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the compiler (such as typescript-eslint)." "we've published a new compatibility package, @typescript/typescript6. This package provides an executable named tsc6". Alias example: `"devDependencies": { "@typescript/native": "npm:typescript@^7.0.2", "typescript": "npm:@typescript/typescript6@^6.0.2" }`. TS 6.0 post: "TypeScript 6.0 is a unique release in that we intend for it to be the last release based on the current JavaScript codebase"; deprecated for removal in 7.0: `target: es5`, `--moduleResolution node`, `--baseUrl`, `amd/umd/systemjs`, `--outFile`, `esModuleInterop: false`. npm dist-tags today: latest 7.0.2, beta 6.0.0-beta, next 7.1.0-dev.20261004.1.
  Implication: Any tool that imports the `typescript` package API (typescript-eslint, ts-jest, ts-morph, Next.js's language-service plugin) breaks on 7.0. Write tsconfig files that already satisfy 7.0 (no `baseUrl`, `moduleResolution: bundler`, `module: esnext`, explicit `types`) so the later bump is a one-line version change.

- Next.js 16.3.8 supports TypeScript 7 for `next build` because `experimental.useTypeScriptCli` now defaults to true (it shells out to the project-local `tsc`), although the docs still label the option experimental; the fix landed in July 2026 and shipped in the 16.3 line (16.3.0 published 2026-08-03).
  Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli (checked 2026-10-04, confidence high)
  Evidence: "By default, `next build` runs the project-local `tsc` command instead of loading the TypeScript JavaScript compiler API. This supports TypeScript 6 and enables TypeScript 7 while its JavaScript API is unavailable." "The CLI checker is enabled by default. To use the TypeScript JavaScript compiler API instead, set `experimental.useTypeScriptCli` to `false`." "If you opt out while using TypeScript 7, `next build` exits because the TypeScript JavaScript compiler API is unavailable." Page banner: "This feature is currently experimental and subject to change, it's not recommended for production." next@16.3.8 dist/server/config-shared.js default: `useTypeScriptCli: true`. TypeScript page: "Next.js uses the project-local `tsc` CLI by default, so no additional configuration is required." Discussion #95633 (2026-07-10): "Ok so this landed #95639 - Waiting for a `next@canary` cut containing it!!"
  Implication: Next.js itself is not the blocker for TS 7; `next build` works with either 6.0.3 or 7.0.2 and prints raw tsc diagnostics for the whole tsconfig project (including test files). The `next.config.ts` loader and editor plugin still want a JS API, which is another reason to keep `typescript` at 6.0.3 for now.

- typescript-eslint 8.71.0 (and the `@typescript-eslint/typescript-estree` it depends on) pins `typescript >=4.8.4 <6.1.0`, closed the TS 7.0.2 support issue as not planned, and has only a draft PR targeting the TypeScript 7.1 native API; eslint-config-next 16.3.8 (`peer eslint >=9.0.0, typescript >=3.3.1`) pulls typescript-eslint in via `eslint-config-next/typescript`; drizzle-kit 0.31.11 has no TypeScript dependency (it uses tsx and esbuild) and drizzle-orm 0.45.3 has no typescript peer.
  Source: https://typescript-eslint.io/users/dependency-versions/ (checked 2026-10-04, confidence high)
  Evidence: "The version range of TypeScript currently supported is `>=4.8.4 <6.1.0`." "The version range of ESLint currently supported is `^8.57.0 || ^9.0.0 || ^10.0.0`." npm: `typescript-eslint@8.71.0 peerDependencies { eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }`; `@typescript-eslint/typescript-estree peerDependencies { typescript: '>=4.8.4 <6.1.0' }`. Issue #12518 "TypeScript 7.0.2 Support": "State: Closed as not planned"; reporter: ESLint crashes with "TypeError: Cannot read properties of undefined (reading 'Cjs')" when forced. PR #12803: "feat(typescript-estree): add projectService.EXPERIMENTAL_backend for TypeScript 7.1 native parser support over IPC", "Status: Draft (open, not merged)". npm: `eslint-config-next@16.3.8 peerDependencies { eslint: '>=9.0.0', typescript: '>=3.3.1' }`; `drizzle-kit dependencies { tsx: '^4.21.0', esbuild: '^0.25.4', '@drizzle-team/brocli': '^0.10.2', '@esbuild-kit/esm-loader': '^2.5.5' }`. Next docs: "`eslint-config-next/typescript`: Adds TypeScript-specific linting rules from `typescript-eslint`".
  Implication: With `typescript@7.0.2` as the `typescript` package, `pnpm install` reports an unmet peer and ESLint crashes under the Next TypeScript config, so TS 7 is not viable for this stack today. drizzle-kit and drizzle-orm are indifferent to the TS version at runtime; only type checking matters, and TS 6.0.3 is what their current users run.

- ESLint 10.0.0 (released 2026-02-06; 10.12.0 is latest, 9.39.5 on the v9 line) removes eslintrc entirely, looks up `eslint.config.*` from each linted file's directory (explicitly aimed at monorepos), requires Node 20.19+/22.13+/24+, and Next.js 16 removed `next lint` and aligned its plugin to flat config for ESLint v10.
  Source: https://eslint.org/docs/latest/use/migrate-to-10.0.0 (checked 2026-10-04, confidence high)
  Evidence: ESLint migrate guide: "Node.js v20.19.0 and above, Node.js v22.13.0 and above, Node.js v24 and above" supported; eslintrc "completely eliminated"; "ESLint locate `eslint.config.*` by starting from the directory of each linted file and searching up towards the filesystem root"; new recommended rules `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`; "`jiti` versions below v2.2.0 are unsupported". Next 16 upgrade guide: "`@next/eslint-plugin-next` now defaults to ESLint Flat Config format, aligning with ESLint v10 which will drop legacy config support." "The `next lint` command has been removed. Use Biome or ESLint directly. `next build` no longer runs linting." Next ESLint page shows `eslint.config.mjs` with `import { defineConfig, globalIgnores } from 'eslint/config'`, `nextVitals` from 'eslint-config-next/core-web-vitals' and `nextTs` from 'eslint-config-next/typescript', plus `settings: { next: { rootDir: 'packages/my-app/' } }` for monorepos.
  Implication: Use ESLint 10.12.0 with a flat `eslint.config.mjs` per workspace (web app uses eslint-config-next; API package uses typescript-eslint directly), add `jiti` only if a `.ts` config is wanted, and run `eslint` from Turborepo tasks because `next build` no longer lints. Peer ranges of eslint-config-next and typescript-eslint both admit ESLint 10.

- pnpm 12 (12.0.0 published 2026-08-26; 12.9.1 on 2026-10-03) is a Rust CLI rewrite with breaking changes around git dependency resolution, strict `pnpm-workspace.yaml` key validation, deterministic peer cycle breaking and `--frozen-lockfile false` removal, but still writes lockfileVersion '9.0' (verified locally with both pnpm 12.9.1 and 10.34.6); pnpm's `pmOnFail: download` default auto-downloads the `packageManager`-pinned version.
  Source: https://github.com/pnpm/pnpm/releases/tag/v12.0.0 (checked 2026-10-04, confidence high)
  Evidence: Release notes: "Git dependencies on known hosts (GitHub, GitLab, Bitbucket) are now treated as identities rather than transport choices"; "Unrecognized settings in `pnpm-workspace.yaml` now fail with `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` when the project pins a compatible pnpm version"; "`pnpm install --frozen-lockfile false` is no longer supported. Use `pnpm install --no-frozen-lockfile`"; `pnpm add yarn` "records the project's package manager in the `packageManager` field". npm registry time: 10.0.0 2025-01-07, 11.0.0 2026-04-28, 12.0.0 2026-08-26T15:12:06Z, 12.9.1 2026-10-03, 10.34.6 2026-09-28; `pnpm@12.9.1 engines { node: '>=18.*' }`. Local test: `pnpm@12.9.1 install --lockfile-only` and `pnpm@10.34.6` both emit `lockfileVersion: '9.0'`. pnpm settings: "`pmOnFail` ... default `download` ... download and run the declared pnpm version (this is the default and matches the previous `managePackageManagerVersions: true` behavior)".
  Implication: A `"packageManager": "pnpm@12.9.1"` pin is self-enforcing on any machine with pnpm 10+ installed, without corepack. Keep pnpm-workspace.yaml to known keys only (pnpm 12 errors on unknown ones) and use `--frozen-lockfile` in CI.

- Vercel's Package Managers docs list pnpm 6 to 10 only and map lockfileVersion 9.0 to pnpm 9 or 10, but `@vercel/build-utils` 14.17.0 (published 2026-10-02) installs pnpm majors 12, 11, 10, 9, 8, 7, 6 in the build image, still auto-selects pnpm 10 for lockfile 9.0 (pnpm 11 auto-selection is gated to projects created on or after 2027-03-01 on Node 22+), and honors a `package.json#packageManager` or `devEngines.packageManager` pnpm pin without corepack; corepack on Vercel remains opt-in via `ENABLE_EXPERIMENTAL_COREPACK=1`.
  Source: https://www.npmjs.com/package/@vercel/build-utils/v/14.17.0 (checked 2026-10-04, confidence high)
  Evidence: Docs table: "pnpm | pnpm-lock.yaml | pnpm install | 6, 7, 8, 9, 10"; "`pnpm-lock.yaml` version 9.0 can be generated by pnpm 9 or 10." build-utils dist/fs/run-user-scripts.js: `const PNPM_10_PREFERRED_AT = new Date("2025-02-27T20:00:00Z"); const PNPM_11_PREFERRED_AT = new Date("2027-03-01T20:00:00Z"); const INSTALLED_PNPM_MAJORS = [12, 11, 10, 9, 8, 7, 6];`; `case lockfileVersion === 9: { if (projectCreatedAt && projectCreatedAt >= PNPM_11_PREFERRED_AT.getTime() && nodeSupportsPnpm11Default(nodeVersion) && isPnpmMajorAvailable(11)) { return "pnpm 11"; } if (projectCreatedAt && projectCreatedAt >= PNPM_10_PREFERRED_AT.getTime()) { return "pnpm 10"; } return "pnpm 9"; }`; `resolveCompatiblePnpmPin` returns `{ override: pnpmPathOverride(parsed.packageVersion.major), source: "packageManager" }` when `lockfileCompatibleWithPnpm(lockfileVersion, parsed.packageVersion) && isPnpmMajorAvailable(parsed.packageVersion.major)`; `case 12: case 11: case 10: return lockfileVersion === 9;`; build log text: "Detected `pnpm-lock.yaml` 9 which may be generated by pnpm@9.x, pnpm@10.x, or pnpm@11.x ... To use a different version, set package.json#packageManager or package.json#devEngines.packageManager"; comment: "Do not pass `--unsafe-perm`: pnpm 11 treated it as a no-op, but pnpm 12's Rust CLI rejects unknown flags." Configure-a-build: "You can enable Corepack by adding an environment variable with name `ENABLE_EXPERIMENTAL_COREPACK` and value `1`". Warning in code: "Using package.json#engines.pnpm without corepack and package.json#packageManager could lead to failed builds with ERR_PNPM_UNSUPPORTED_ENGINE".
  Implication: Without a pin, Vercel would install with pnpm 10 even though the lockfile was written by pnpm 12 (same 9.0 format, so it would likely work but is not what was tested locally). With `"packageManager": "pnpm@12.9.1"` Vercel selects `/pnpm12` (latest 12.x in the image, not necessarily 12.9.1). Do not set `engines.pnpm`, and do not enable `ENABLE_EXPERIMENTAL_COREPACK` (unnecessary, and corepack is being phased out of Node). The docs page lags the shipped build-utils, so verify on the first deploy and keep pnpm 10.34.6 as the fallback pin.

- Corepack is distributed with Node.js only from 14.19.0 up to but not including 25.0.0; Node 24 (current LTS, 24.21.0) still bundles it as experimental, Node 26 (LTS on 2026-10-28) will not, and it is installable separately with `npm install -g corepack`.
  Source: https://github.com/nodejs/corepack#readme (checked 2026-10-04, confidence high)
  Evidence: "Corepack is distributed with Node.js from version 14.19.0 up to (but not including) 25.0.0." "Then install Corepack: npm install -g corepack". Vercel docs still call it "an experimental tool that allows a Node.js project to pin a specific version of a package manager". Node.js TSC decision (2025-03-19, per nodejs/node PR #61207 and nodejs/corepack issue #722): corepack no longer distributed starting with Node.js v25. Local container: node v22.22.0 ships corepack 0.34.0.
  Implication: Do not build the developer workflow on `corepack enable`. Pin pnpm via `packageManager` and rely on pnpm's own `pmOnFail: download` locally and on Vercel's pin resolution in CI; in GitHub Actions install pnpm explicitly (`npm i -g pnpm@12.9.1`).

- create-next-app 16.3.8 defaults to TypeScript, Tailwind, ESLint, App Router, Turbopack, `@/*` alias and an AGENTS.md; it offers `--react-compiler`, `--biome`, `--src-dir`, `--rspack`, `--api` and `--disable-git`, has no `--turbopack` flag (Turbopack is the default bundler), the React Compiler is stable but off by default and needs `babel-plugin-react-compiler`, `middleware.ts` is deprecated in favor of `proxy.ts` (Node runtime only), and Next 16 requires Node 20.9+ and TypeScript 5.1+.
  Source: https://nextjs.org/docs/app/getting-started/installation (checked 2026-10-04, confidence high)
  Evidence: `npx -y create-next-app@latest --help` (16.3.8): "--ts, --typescript (default)", "--tailwind (default)", "--react-compiler Initialize with React Compiler enabled.", "--eslint", "--biome", "--app", "--src-dir", "--rspack Enable Rspack as the bundler.", "--import-alias <prefix/*> (default \"@/*\")", "--api Initialize a headless API using the App Router.", "--agents-md ... (default)", "--disable-git". Docs: "The default setup enables TypeScript, Tailwind CSS, ESLint, App Router, and Turbopack, with import alias `@/*`, and includes `AGENTS.md`". Prompts include "Would you like to use React Compiler? No / Yes". Upgrade guide: "Starting with Next.js 16, Turbopack is stable and used by default with `next dev` and `next build`"; "The `reactCompiler` configuration option has been promoted from `experimental` to stable. It is not enabled by default"; "Node.js 20.9+ ... TypeScript 5+ Minimum version now `5.1.0`". Proxy page: "The `middleware` file convention is deprecated and has been renamed to `proxy`"; "Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files."; codemod `npx @next/codemod@canary middleware-to-proxy .`. transpilePackages page: "Turbopack transpiles workspace packages (npm, pnpm, or Yarn workspaces) in your monorepo automatically under both routers." output page: monorepo tracing needs `outputFileTracingRoot: path.join(__dirname, '../../')`.
  Implication: Scaffold with `pnpm create next-app@16.3.8 apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --skip-install --disable-git` (add `--react-compiler` if desired), name any request-interception file `proxy.ts` with a matcher that excludes `/api`, do not list workspace packages in `transpilePackages`, and set `outputFileTracingRoot` to the repo root.

### Recommendations

- (consequential) Mount the Hono app inside the Next.js app at `apps/web/src/app/api/v1/[[...route]]/route.ts` using `handle` from `@hono/vercel` (not `hono/vercel`), with the Hono instance created as `new Hono().basePath('/api/v1')` inside the API workspace package, per-method exports, `export const maxDuration = 60`, and no `runtime`/`dynamic` exports. Deploy as one Vercel project (Root Directory `apps/web`).
  Why: Documented by Hono for the Node.js runtime and trivially thin (the adapter is `req => app.fetch(req)`), so Set-Cookie headers, streamed bodies and `c.req.raw` behave exactly as in standalone Hono. Same-origin means Better Auth cookies need no cross-site configuration and no CORS, there is one preview URL per PR, one build slot (Hobby allows one concurrent build), and the Hono package has no `next` imports so splitting later is a new `apps/api/src/index.ts` with `export default app` plus a second Vercel project. `hono/vercel` is deprecated and removed in Hono v5, so the import path matters.
  Rejected: Standalone Hono Vercel project now: second project and build, cross-origin cookies and CORS for the SPA, two preview URLs to smoke test, and Hobby's 1 concurrent build makes every PR slower. Vercel Services: keeps one deployment but is Beta. `export const GET = app.fetch` directly: Next passes `(request, { params })`, and Hono's `fetch(request, env?, executionCtx?)` would receive the Next context object as `c.env`; `handle(app)` avoids that.

- (consequential) Pin `typescript` to 6.0.3 at the repo root (single version for all workspaces) and write every tsconfig to be TypeScript 7 clean: `strict: true`, `module: esnext`, `moduleResolution: bundler`, explicit `types`, no `baseUrl`, `esModuleInterop: true`, `target` es2022 or later. Revisit TS 7 only once typescript-eslint publishes a release supporting the 7.1 API.
  Why: TS 7.0.2 ships no JavaScript API; typescript-eslint 8.71.0 pins `typescript <6.1.0`, closed TS 7.0.2 support as not planned, and its TS 7.1 backend is a draft PR. eslint-config-next/typescript depends on typescript-eslint, so TS 7 would break linting across the monorepo. Next.js 16.3.8 already type-checks via the `tsc` CLI by default, so a later bump to 7.x is a version change, not a migration, provided tsconfig avoids the options 7.0 rejects.
  Rejected: TS 7.0.2 as `typescript`: unmet peer on install and ESLint crash. The alias trick (`typescript` -> `@typescript/typescript6`, `@typescript/native` -> `typescript@7`) works per Microsoft but adds two TypeScript installs, editor confusion and a non-obvious `tsc` binding for a solo developer with little upside at this project size.

- (consequential) Use pnpm 12.9.1 pinned with `"packageManager": "pnpm@12.9.1"` in the root package.json, no `engines.pnpm`, no `ENABLE_EXPERIMENTAL_COREPACK`, `pnpm-workspace.yaml` limited to known keys, and `pnpm install --frozen-lockfile` in CI. Keep pnpm 10.34.6 as the documented fallback pin if the first Vercel build fails on pnpm 12.
  Why: pnpm 12 writes the same lockfileVersion 9.0 as pnpm 10, so Turborepo and Vercel's lockfile-aware skipping keep working. `@vercel/build-utils` 14.17.0 ships pnpm 12 in the build image and resolves a `packageManager` pin to `/pnpm12` without corepack, while an unpinned lockfile 9.0 is installed with pnpm 10. pnpm's default `pmOnFail: download` makes the pin self-enforcing locally without corepack, which is being removed from Node (gone in 25+, absent from Node 26 LTS). Starting a new repo on the current major avoids a migration later.
  Rejected: pnpm 10.34.6: the Vercel docs-listed and auto-detected version, and the lowest-risk choice if pnpm 12's Rust CLI shows any incompatibility; it stays the fallback. Corepack-based pinning: deprecated path on Node and only opt-in on Vercel.

- (advisory) Pin Node 24 (`"engines": { "node": "24.x" }` at the root plus a `.node-version` of 24) for local, GitHub Actions and Vercel.
  Why: Vercel's default and recommended runtime is 24.x (22.x and 20.x remain; Node 20 is being deprecated 2026-10-01); local LTS is 24.21.0; ESLint 10 and Next 16 both support it. Node 26 becomes LTS on 2026-10-28 but is not yet a Vercel runtime, so stay on 24 for now.
  Rejected: Node 22: still supported but not the Vercel default and older than the local toolchain. Node 26: not available on Vercel yet.

- (consequential) Vercel project configuration: one project for `apps/web`, Framework Preset Next.js, Root Directory `apps/web`, Skip deployment (unaffected skipping) left on, Build Command `turbo run build`, Install Command default (optionally `pnpm install --filter web...`), and an `apps/web/vercel.json` containing `$schema`, `regions: ["iad1"]` and the daily `crons` entry; no `ignoreCommand`.
  Why: Root Directory is how Vercel locates a monorepo app; source outside it is included by default; built-in skipping needs GitHub plus pnpm workspaces with explicit dependencies and does not consume build slots, whereas an Ignored Build Step still counts as a deployment. `iad1` is already the default but pinning it documents the Neon us-east-1 adjacency. `turbo-ignore` is deprecated, so do not add it. Remote Cache is automatic during Vercel builds.
  Rejected: Repo-root project with a custom build command: loses framework detection and the per-app Root Directory model. `npx turbo-ignore` Ignored Build Step: deprecated upstream and counts against deployment quotas.

- (advisory) CI: keep lint, typecheck and unit tests in a normal `pull_request` workflow, and add a separate `deployment_status` workflow (state == success) that runs a Playwright smoke test against `github.event.deployment_status.environment_url` with the `x-vercel-protection-bypass` header from a `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub secret. Plan to migrate the trigger to `repository_dispatch` (`vercel.deployment.success`) when a second Vercel project appears, and to add Vercel Deployment Checks on Pro.
  Why: Vercel sends `deployment_status` by default, GitHub runs such workflows against the deployed commit, and the bypass header is available on all plans; Vercel documents the exact migration diff to `repository_dispatch`, whose payload carries `project.name` and `git.sha` for disambiguation. Deployment Checks can later gate production promotion on these same workflow results.
  Rejected: Vercel Checks API: designed for Marketplace integrations, not first-party CI. Building on Vercel from GitHub Actions (`vercel build` + `vercel deploy --prebuilt`): more moving parts than a solo developer needs when the Git integration already deploys every push.

- (consequential) Plan: stay on the free Hobby team only while the GitHub repository is under the owner's personal account and the app is non-commercial (two first users); move the project to a Pro team before any payment, advertising or org-owned repository, and before the outbox needs sub-daily cron or >300 s functions.
  Why: Vercel refuses to connect a Hobby team project to a Git-organization repository, only the Hobby owner's commits deploy, and fair use limits Hobby to non-commercial use. Hobby cron is once per day with hourly precision, functions cap at 300 s, and there is one concurrent build. Pro adds per-minute cron, 800 s functions, custom environments, password protection and team RBAC.
  Rejected: Pro from day one: unnecessary cost for two users; the owner can switch when the first commercial signal appears. Running the repo under a GitHub org on Hobby: not supported.

- (advisory) Use ESLint 10.12.0 with flat `eslint.config.mjs` files: the web app spreads `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` (plus `settings.next.rootDir` if a root config is used); the API package uses `typescript-eslint` directly; run `eslint` via a Turborepo `lint` task because `next build` no longer lints.
  Why: eslint-config-next 16.3.8 declares `eslint >=9.0.0` and typescript-eslint 8.71.0 declares `^10.0.0`; ESLint 10's per-file config lookup is designed for monorepos; eslintrc is gone so there is nothing to migrate from.
  Rejected: ESLint 9.39.5: works but defers an inevitable migration with no benefit. Biome: supported by create-next-app but would drop the Next.js rule set and typescript-eslint type-aware rules.

- (advisory) Scaffold the web app with `create-next-app@16.3.8` using its current defaults (TypeScript, Tailwind, ESLint, App Router, `src/` directory, `@/*`, AGENTS.md), optionally `--react-compiler`, then: name the request-interception file `proxy.ts` (never `middleware.ts`), exclude `/api` in its matcher, set `outputFileTracingRoot` to the repo root in `next.config.ts`, and leave `transpilePackages` empty for workspace packages.
  Why: Turbopack is the default bundler and transpiles workspace packages automatically; `proxy.ts` replaced `middleware.ts` in Next 16 and runs on Node only; `outputFileTracingRoot` is the documented monorepo caveat so workspace packages are traced into the Vercel function bundle; React Compiler is stable but opt-in and needs `babel-plugin-react-compiler`.
  Rejected: `--rspack`: available but not the default and not needed. Webpack opt-out (`--webpack`): only for custom webpack configs, which this project does not have.

### Verified snippets

#### Next.js route handler that mounts the Hono app (apps/web/src/app/api/v1/[[...route]]/route.ts). Hono docs show GET and POST with `@hono/vercel`; the other method exports follow the Next.js supported-method list. The Hono instance must be built with `.basePath('/api/v1')` in the API package.

Source: https://hono.dev/docs/getting-started/nextjs

```
// apps/web/src/app/api/v1/[[...route]]/route.ts
import { handle } from '@hono/vercel'
import { app } from '@tidefern/api' // created as new Hono().basePath('/api/v1'); no `next` imports

// Vercel: highest-precedence duration setting; Hobby maximum is 300
export const maxDuration = 60

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
export const HEAD = handle(app)
export const OPTIONS = handle(app)
```

#### Minimal Hono app in the API workspace package, shaped so the same module can later become a standalone Vercel Hono project (`export default app` from apps/api/src/index.ts).

Source: https://vercel.com/docs/frameworks/backend/hono

```
// packages/api/src/app.ts
import { Hono } from 'hono'

export const app = new Hono().basePath('/api/v1')

app.get('/health', (c) => c.json({ ok: true }))

// apps/api/src/index.ts (only when splitting out later; Vercel detects this entrypoint)
// import { app } from '@tidefern/api'
// export default app
```

#### next.config.ts bits for a monorepo app on Next.js 16.3.8 (tracing root per Next docs; reactCompiler is stable but opt-in and requires babel-plugin-react-compiler; useTypeScriptCli is already true by default and is shown only to document it).

Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/output

```
// apps/web/next.config.ts
import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // monorepo: trace files from the repo root so workspace packages ship in the function bundle
  outputFileTracingRoot: path.join(__dirname, '../../'),
  typedRoutes: true,
  // reactCompiler: true, // optional; pnpm add -D babel-plugin-react-compiler
  // experimental: { useTypeScriptCli: true }, // already the default in 16.3.x
}

export default nextConfig
```

#### vercel.json for the monorepo web app (lives in the Root Directory apps/web). Hobby allows only daily cron; with Fluid compute memory must not be set here; the optional functions glob needs the src/ prefix for a src-dir Next.js project.

Source: https://vercel.com/docs/project-configuration/vercel-json

```
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/v1/jobs/run", "schedule": "0 9 * * *" }
  ]
}
```

#### Root package.json pins: pnpm via packageManager (honored by Vercel without corepack and auto-downloaded locally by pnpm's pmOnFail default), Node 24 via engines, TypeScript held at 6.0.3, turbo pinned so Vercel uses this version.

Source: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

```
{
  "name": "tidefern",
  "private": true,
  "packageManager": "pnpm@12.9.1",
  "engines": { "node": "24.x" },
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "eslint": "10.12.0",
    "turbo": "2.11.7",
    "typescript": "6.0.3"
  }
}
```

#### turbo.json task shape (Turborepo 2.11, schema on the new turborepo.dev domain). Next.js outputs exclude .next/cache and the Next 16 .next/dev directory; declare build-time env vars that change output so staging and production do not share cache artifacts (NEXT_PUBLIC_* is inferred automatically).

Source: https://vercel.com/docs/monorepos/turborepo

```
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**", "dist/**"],
      "env": ["BETTER_AUTH_URL"]
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

#### GitHub Actions smoke test triggered by Vercel's deployment_status event (pre-migration form from Vercel's own migration diff). Runs against the deployed commit (GITHUB_SHA) and the preview URL, passing the Protection Bypass secret. pnpm is installed with npm because corepack is being removed from Node.

Source: https://vercel.com/docs/git/vercel-for-github

```
name: Preview smoke test

on:
  deployment_status:

jobs:
  smoke:
    if: github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm i -g pnpm@12.9.1
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm --filter web exec playwright test --project=smoke
        env:
          BASE_URL: ${{ github.event.deployment_status.environment_url }}
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

#### Vercel-recommended repository_dispatch variant (from the Vercel KB guide), useful once a second Vercel project exists because client_payload carries project.name; note the explicit checkout of client_payload.git.sha since repository_dispatch runs use the default-branch head as GITHUB_SHA.

Source: https://vercel.com/kb/guide/how-can-i-run-end-to-end-tests-after-my-vercel-preview-deployment

```
name: Playwright Tests

on:
  repository_dispatch:
    types:
      - 'vercel.deployment.success'

jobs:
  run-e2es:
    if: github.event_name == 'repository_dispatch' && github.event.client_payload.project.name == 'tidefern-web'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.client_payload.git.sha }}
      - name: Install dependencies
        run: npm ci && npx playwright install --with-deps
      - name: Run tests
        run: npx playwright test
        env:
          BASE_URL: ${{ github.event.client_payload.url }}
```

#### Playwright config headers that bypass Vercel Deployment Protection on preview URLs (verbatim from Vercel docs).

Source: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation

```
import { defineConfig } from '@playwright/test';

if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  throw new Error(
    'VERCEL_AUTOMATION_BYPASS_SECRET is required to run tests against protected deployments',
  );
}

export default defineConfig({
  use: {
    extraHTTPHeaders: {
      'x-vercel-protection-bypass':
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      // Use 'samesitenone' instead of 'true' when testing in an iframe.
      'x-vercel-set-bypass-cookie': 'true',
    },
  },
});
```

#### ESLint 10 flat config for the Next.js app (verbatim shape from Next.js docs, TypeScript variant).

Source: https://nextjs.org/docs/app/api-reference/config/eslint

```
// apps/web/eslint.config.mjs
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

#### TypeScript 7-ready base tsconfig options to extend from (derived from the TS 6.0 deprecation list: no baseUrl, no node10 resolution, explicit types, esModuleInterop on). Next.js adds its own jsx/plugins entries in the app tsconfig.

Source: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/

```
{
  "compilerOptions": {
    "strict": true,
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

#### proxy.ts (Next 16 replacement for middleware.ts) with a matcher that keeps the Hono API out of the proxy path; runtime is Node and cannot be configured.

Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy

```
// apps/web/src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
```

### Open questions

- The exact `deployment.environment` string Vercel sets on GitHub deployments is only user-reported ('Preview'); confirm on the first PR by logging `toJSON(github.event)` before adding any environment-name filter to the deployment_status workflow.
- Whether the first Vercel build on pnpm 12 (selected via the packageManager pin, resolved to the image's latest 12.x rather than exactly 12.9.1) succeeds end to end; the Vercel Package Managers docs still list pnpm 6 to 10 even though build-utils 14.17.0 installs 12. Fallback is pinning pnpm@10.34.6.
- When typescript-eslint will publish a release supporting the TypeScript 7.1 API (PR #12803 is a draft) and when TypeScript 7.1 itself ships; this gates the TS 6.0.3 to 7.x bump.
- Next.js labels `experimental.useTypeScriptCli` experimental while defaulting it to true in 16.3.8; watch release notes for it stabilizing or changing behavior (it type-checks the whole tsconfig project, including test files).
- Whether Next.js's route-type generation accepts the `(req: Request) => Response | Promise<Response>` signature of `handle(app)` without a cast under `typedRoutes`/strict route types; Hono's docs show it working, verify on the first `next build`.
- Vercel docs disagree on Pro multi-region counts (region page: 5 regions; Fluid page: up to 3); irrelevant on Hobby but worth rechecking before any multi-region decision.
- Hono v5 timing for the removal of `hono/vercel` (and whether `@hono/node-server` 2.x is needed for local standalone dev when the API is split out).

### Sources that could not be read

- GitHub REST API via gh for pnpm/pnpm, honojs/hono, vercel/vercel and vercel/repository-dispatch was blocked in this session (403, repo access not enabled); release dates were taken from the npm registry `time` field and payload docs from raw.githubusercontent.com instead. vercel/vercel issue #17434 (pnpm 11 and 12 not supported) and PR #17450 could not be read directly; the shipped @vercel/build-utils 14.17.0 source was used as the primary evidence.
- https://pnpm.io/blog/2026/08/26/pnpm-12 returned 404 (guessed URL); the GitHub release page for v12.0.0 was used for breaking changes.
- https://nodejs.org/api/corepack.html now redirects to the nodejs/corepack GitHub README, which was used instead.
- https://turborepo.com/docs/reference/turbo-ignore redirects to turborepo.dev; the turborepo.dev page was used. The turbo-ignore page no longer documents --fallback/--task flags.
- The Vercel changelog 'Trigger GitHub Actions with enriched deployment data from Vercel' (2025-04-07) was fetched but its summary did not expose the payload schema; the @vercel/repository-dispatch README was used for the client_payload example.
- typescript-eslint issue #12518 page content exposed the title and 'closed as not planned' state but not the maintainers' comments.

## data-auth

<a id="data-auth"></a>

Dimension: database and authentication

### Summary

Neon now defaults new projects to Postgres 18 (CLI docs and the 2026-06-05 changelog) and has run 18.6 since 2026-08-18, so CI should pin postgres:18.6 and PGlite 0.5.8 (which reports PostgreSQL 18.3) is a faithful unit-test engine. Launch is enough for phase 1: 10 branches per project, history window default 1 day and max 7 days (Scale: 25 branches, max 30 days). Use the pooled (-pooler) URL for the app and the direct URL for drizzle-kit migrate, because Neon's PgBouncer runs in transaction mode and forbids session-level SET, LISTEN/NOTIFY, SQL-level PREPARE and session advisory locks. Neon and Vercel both now say the right driver on Fluid compute is plain pg Pool declared at module scope and registered with attachDatabasePool from @vercel/functions, not @neondatabase/serverless. Drizzle 0.45.3 and drizzle-kit 0.31.11 (both published 2026-09-21) are the stable line; the docs site has switched to v1 RC content (drizzle-orm@rc install lines, pgTable.withRLS) and a 1.0.0-rc.4 tag exists, so the build agent must pin 0.45.3/0.31.11, use .enableRLS() plus pgPolicy, and never run drizzle-kit up. A live drizzle-kit generate run confirmed the emitted ENABLE ROW LEVEL SECURITY and CREATE POLICY SQL, and a live Drizzle-on-PGlite transaction confirmed set_config(..., true) plus SET LOCAL ROLE works and resets after commit. Better Auth 1.7.7 moved its CLI to the npm package named auth (npx auth@latest generate); @better-auth/cli is deprecated at 1.4.21. Passkeys live in @better-auth/passkey, twoFactor in better-auth/plugins, and a real generate run produced the user, session, account, verification, two_factor, passkey and rate_limit tables. The Hono mount is app.all("/api/auth/*", (c) => auth.handler(c.req.raw)) with CORS registered before it only when cross-origin; inside a Next.js route handler app.fetch(request) returns Better Auth's Response with its Set-Cookie headers intact, which is exactly what toNextJsHandler does, and hono/vercel's handle is deprecated in favor of @hono/vercel 1.0.0. Secure cookies and the __Secure- prefix are set when baseURL is https or NODE_ENV is production. OSV lists one June 2026 advisory (device authorization plugin, fixed 1.6.11) and a July 7 batch touching oidc-provider, mcp, oauth-provider, organization, scim, anonymous, admin and OAuth auto-linking, all fixed at or before 1.7.7; the April 2026 2FA bypass via session.cookieCache is the one most relevant to this stack. For envelope encryption without KMS, Node's AES-256-GCM with setAAD and a 12-byte random IV, wrapping a per-user DEK under an env KEK, matches the AWS Encryption SDK raw AES keyring pattern and upgrades to KMS GenerateDataKey/Decrypt by re-wrapping only the DEKs.

### Findings

- Postgres 18 is the default major for new Neon projects, and Neon has run 18.6 since 2026-08-18.
  Source: https://neon.com/docs/cli/projects (checked 2026-10-04, confidence high)
  Evidence: Neon projects created using the CLI use the default Postgres version, which is Postgres 18. To create a project with a different Postgres version, pass --pg-version. The --pg-version flag accepts Major PostgreSQL version (14-19). Version 19 is available only in regions where it has been enabled. The 2026-06-05 changelog (https://neon.com/docs/changelog/2026-06-05) says Postgres 18 is now the default for newly created Neon projects. The version policy page (https://neon.com/docs/postgresql/postgres-version-policy) table row: 2026-08-13 release of 18.6, 17.11, 16.15, 15.19, 14.24, first available on Neon 2026-08-18. Neon only supports the latest minor release for each major Postgres version.
  Implication: Create the Tidefern project on Postgres 18 (the default). Pin CI to the postgres:18.6 Docker image, which exists on Docker Hub (tag updated 2026-09-24). PGlite 0.5.8 reports PostgreSQL 18.3 so unit tests run on the same major.

- Launch vs Scale limits and the point-in-time restore (history) window differ mainly in branch count and maximum retention.
  Source: https://neon.com/docs/postgres/backup-restore/history-window (checked 2026-10-04, confidence high)
  Evidence: Defaults and plan limits table: Free: default 6 hours, maximum 6 hours (capped at 1 GB of history); Launch: default 1 day, maximum 7 days; Scale: default 1 day, maximum 30 days. Retained WAL is billed as History storage at $0.20/GB-month. Set via history_retention_seconds (7 days = 604800). Plans page (https://neon.com/docs/introduction/plans): Launch: compute $0.106/CU-hour, storage $0.35/GB-month, branches 10/project (extra $1.50/branch-month), projects 100. Scale: $0.222/CU-hour, $0.35/GB-month, branches 25/project, projects 1,000. Manage branches page: root branch allowance Free 3, Launch 5, Scale 25. Branch restore page: restoring is a complete overwrite of the database timeline, not a merge; Neon preserves the branch's final state before the restore operation in an automatically created backup branch.
  Implication: Launch suffices for phase 1; raise history_retention_seconds to 604800 (7 days) on the production project. Move to Scale only if the product needs a 30-day restore window or more than 10 branches per project.

- Neon's pooled connection string runs PgBouncer in transaction mode and forbids session-level features; migrations must use the direct string.
  Source: https://neon.com/docs/connect/connection-pooling (checked 2026-10-04, confidence high)
  Evidence: Pooled string adds -pooler to the endpoint hostname (ep-...-pooler.us-east-2.aws.neon.tech). pool_mode=transaction, meaning connections are returned to the pool after each transaction completes. Not supported with pooled connections: SET / RESET (session variables), LISTEN / NOTIFY, WITH HOLD CURSOR, PREPARE / DEALLOCATE (SQL-level prepared statements), temporary tables with PRESERVE / DELETE ROWS, LOAD, session-level advisory locks. Protocol-level prepared statements are supported. max_client_conn 10000; default_pool_size 0.9 x max_connections per user per database. Direct connections recommended for: Schema migrations, pg_dump / pg_restore, Logical replication, Admin tasks.
  Implication: Expose two env vars: DATABASE_URL (pooled) for the app and DATABASE_URL_DIRECT for drizzle-kit migrate and the migration runner. Keep per-request actor context transaction-scoped (set_config with is_local=true, SET LOCAL) so nothing leaks across pooled connections.

- Neon's GitHub integration installs NEON_API_KEY and NEON_PROJECT_ID and ships a sample workflow, but its sample still pins create-branch-action@v5 while v6 (6.3.1) is current and renamed inputs/outputs.
  Source: https://neon.com/docs/guides/neon-github-integration (checked 2026-10-04, confidence high)
  Evidence: The integration installs a GitHub App that stores a NEON_API_KEY secret and NEON_PROJECT_ID variable in the repo. Sample workflow steps: uses: neondatabase/create-branch-action@v5 with project_id: ${{ vars.NEON_PROJECT_ID }}, branch_name: preview/pr-${{ github.event.number }}-..., api_key: ${{ secrets.NEON_API_KEY }}; uses: neondatabase/delete-branch-action@v3 with branch: ...; uses: neondatabase/reset-branch-action@v1 with parent: true; schema-diff-action@v1 commented out. The create-branch-action releases page (https://github.com/neondatabase/create-branch-action/releases) lists 6.3.1 as Latest, with v6.0.0 breaking changes: username -> role, parent -> parent_branch, fields suffixed with_pooler -> pooled; expires_at added in v6.1.0. The v6 README example: uses: neondatabase/create-branch-action@v6 with project_id, branch_name, role, parent_branch, api_key; outputs db_url, db_url_pooled, db_host, db_host_pooled, branch_id, password, created. reset-branch-action@v1 outputs db_url and db_url_with_pooler.
  Implication: Write the PR workflow against create-branch-action@v6 (parent_branch, expires_at, db_url for migrate, db_url_pooled for the preview app), delete-branch-action@v3 on close, and reset-branch-action@v1 on synchronize if the branch should track production again. Do not copy the v5 sample verbatim.

- Branch reset from parent is a one-command CLI operation and branches can carry an expiration.
  Source: https://neon.com/docs/guides/reset-from-parent (checked 2026-10-04, confidence high)
  Evidence: Reset from parent instantly overwrites all databases on a Neon child branch with the latest schema and data from its parent, discarding any local changes. Unlike Instant restore, it does not preserve a backup. Root branches cannot be reset, and branches with their own children must have those children deleted first. CLI: neon branches reset <id|name> --parent --project-id <project-id>, example: neon branches reset development --parent --project-id noisy-pond-12345678. Manage branches page (https://neon.com/docs/manage/branches): Console branch creation offers 1 hour, 1 day, or 7 days expiration; API and CLI branches have no expiration by default; neon branches set-expiration br-... --expires-at 2025-08-15T18:00:00Z.
  Implication: Use reset for the shared dev branch and for refreshing PR branches; set expires_at on CI-created branches so abandoned PR branches do not count against the 10-branch Launch allowance.

- Neon's RLS-with-Drizzle guide targets the Neon Data API (auth.user_id() and the authenticated role); those helpers do not apply to a self-hosted Better Auth backend without extra setup.
  Source: https://neon.com/docs/guides/neon-rls-drizzle (checked 2026-10-04, confidence medium)
  Evidence: Code: import { crudPolicy, authenticatedRole, authUid } from 'drizzle-orm/neon'; ... crudPolicy({ role: authenticatedRole, read: authUid(table.userId), modify: authUid(table.userId) }). The authUid(column) helper generates the SQL condition (select auth.user_id() = column). When you use Neon's Data API alongside your database, this function automatically extracts the user identifier from the active JWT claims. The RLS overview (https://neon.com/docs/guides/row-level-security) says RLS is required on every table exposed through the Neon Data API and The Data API handles JWT validation and provides the auth.user_id() function. drizzle-orm 0.45.3 package: export const authenticatedRole: PgRole; anonymousRole; authUid; crudPolicy (neon/rls.d.ts), and pg-core/table.d.ts exposes enableRLS: () => ... No deprecation notice for Neon RLS/Authorize was found on neon.com; the docs index lists only Row-Level Security with Neon and Simplify RLS with Drizzle.
  Implication: Tidefern's API runs its own Hono backend, so do not use crudPolicy/authenticatedRole/authUid. Use pgPolicy with current_setting('app.user_id', true) against a dedicated application role, enable RLS with .enableRLS(), and set the actor id with set_config inside each transaction. The Neon helpers become relevant only if the Data API is adopted later.

- Drizzle 0.45.3 and drizzle-kit 0.31.11 are the stable line; the public docs now describe the v1 RC, whose API and migration folder differ, so snippets must be checked against the 0.45.3 types.
  Source: https://orm.drizzle.team/docs/upgrade-v1 (checked 2026-10-04, confidence high)
  Evidence: Upgrade page: npm i drizzle-orm@rc, npm i -D drizzle-kit@rc. Step 1 - Run drizzle-kit up ... We've updated the migrations folder structure by: removing journal.json, grouping SQL files and snapshots into separate migration folders, removing the drizzle-kit drop command ... Migrated from database snapshots to DDL snapshots. Commutativity checks were added. The RLS docs page shows pgTable.withRLS('users', ...), but drizzle-orm@0.45.3 pg-core/table.d.ts only has enableRLS: () => Omit<PgTableWithColumns<T>, 'enableRLS'>. The get-started-postgresql page's install line is npm i drizzle-orm@rc postgres. npm: drizzle-orm dist-tags latest 0.45.3 (published 2026-09-21), rc 1.0.0-rc.4, beta 1.0.0-beta.22; drizzle-kit latest 0.31.11 (2026-09-21), rc 1.0.0-rc.4. better-auth peer: drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0. Live run with drizzle-kit 0.31.11 and a schema using .enableRLS() plus pgPolicy emitted: ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY; CREATE POLICY "notes_owner_select" ON "notes" AS PERMISSIVE FOR SELECT TO "app_user" USING ("notes"."owner_id" = current_setting('app.user_id', true)); and the journal-based drizzle/meta/_journal.json plus 0000_snapshot.json.
  Implication: Pin exactly drizzle-orm 0.45.3 and drizzle-kit 0.31.11, never @rc or @beta. Use pgTable(...).enableRLS() and pgPolicy/pgRole from drizzle-orm/pg-core. Keep the journal-style drizzle/ folder and do not run drizzle-kit up. When the agent reads orm.drizzle.team, treat v1-only APIs (withRLS, @rc install lines, folder-per-migration) as not applicable.

- drizzle-kit migrate and the runtime migrator both use the drizzle.__drizzle_migrations log table; push is positioned for prototyping and prompts on data loss.
  Source: https://orm.drizzle.team/docs/drizzle-kit-migrate (checked 2026-10-04, confidence high)
  Evidence: Reads through migration folder and read all .sql migration files ... Runs SQL migrations and logs applied migrations to drizzle migrations table. Defaults: table __drizzle_migrations, schema drizzle, configurable via migrations.table and migrations.schema. drizzle-kit 0.31.11 migrate --help shows only --config string. Migrations overview (https://orm.drizzle.team/docs/migrations): import { migrate } from 'drizzle-orm/node-postgres/migrator'; ... await migrate(db). The 0.45.3 package d.ts: migrate(db: NodePgDatabase, config: MigrationConfig) with migrationsFolder: string; migrationsTable?: string; migrationsSchema?: string. Push page (https://orm.drizzle.team/docs/drizzle-kit-push): designed to cover code first approach ... the best approach for rapid prototyping; --force will auto-accept all data-loss statements; --explain prints the planned SQL without applying. Config page (https://orm.drizzle.team/docs/drizzle-config-file): entities.roles type boolean | { provider: "neon" | "supabase", include: string[], exclude: string[] }, default false; By default, drizzle-kit won't manage roles for you.
  Implication: CI and deploy run drizzle-kit generate (in dev, committed) then drizzle-kit migrate --config against the direct URL. Keep push for local scratch only. In 0.45.3 the runtime migrate() call requires a config object with migrationsFolder (the docs' zero-arg form is v1).

- On Vercel Fluid compute, Neon, Vercel and Drizzle all point to plain pg Pool at module scope with attachDatabasePool, not the Neon serverless driver.
  Source: https://neon.com/docs/guides/vercel-connection-methods (checked 2026-10-04, confidence high)
  Evidence: With Vercel Fluid, we recommend you use a standard Postgres TCP connection (for example, with the node-postgres package) and a connection pool. This is the new fastest and most robust method. Choose-connection page (https://neon.com/docs/connect/choose-connection): Vercel (Fluid compute): Use pg (node-postgres) with @vercel/functions. Vercel Fluid keeps functions warm long enough to reuse TCP connections. Serverless pooling guide (https://neon.com/docs/guides/serverless-connection-pooling): const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 5000 }); attachDatabasePool(pool); keep your client-side pool sizes small (1-2 connections per container) and rely on Neon's built-in PgBouncer pooling. Vercel KB (https://vercel.com/kb/guide/connection-pooling-with-functions, last updated July 23, 2026): Create your pool in a global scope ... Avoid max pool size of 1 ... Use a relatively short idle timeout (e.g., 5 seconds). @vercel/functions reference (last_updated 2026-09-03): attachDatabasePool ... ensures that idle pool clients are properly released before functions suspend. Supports PostgreSQL (pg). Vercel Fluid docs: As of April 23, 2025, fluid compute is enabled by default for new projects; multiple invocations can share the same physical instance. Drizzle Neon page: To use Neon from a serverful environment, you can use the node-postgres or Postgres.js drivers; neon-http is for single, non-interactive transactions and WebSocket Pool/Client objects must be connected, used and closed within a single request handler. npm: pg 8.23.1 (2026-09-30), @vercel/functions 3.9.11, @neondatabase/serverless 1.2.0 (requires Node 19+).
  Implication: Phase 1 driver: pg 8.23.1 Pool via drizzle-orm/node-postgres, created once per module with max 2 to 5 and idleTimeoutMillis 5000, registered with attachDatabasePool, using the pooled Neon URL. Skip @neondatabase/serverless; it is for edge/Workers-style runtimes and its WebSocket pool cannot outlive a request.

- Better Auth 1.7.7's CLI is the npm package named auth; @better-auth/cli is deprecated, and generate emits the Drizzle schema including twoFactor, passkey and rateLimit tables.
  Source: https://www.better-auth.com/docs/concepts/cli (checked 2026-10-04, confidence high)
  Evidence: Docs commands: npx auth@latest generate (flags --config, --output, --yes), npx auth@latest migrate (Kysely adapter only; For other adapters, you'll need to apply the schema using your ORM's migration tool), npx auth@latest secret, info, check schema. npm: auth 1.7.7, description The CLI for Better Auth, repository better-auth/better-auth; @better-auth/cli latest 1.4.21 with deprecated = Package no longer supported. Live run of npx -y auth@1.7.7 generate --config ./auth.ts --output ./auth-schema.ts -y with drizzleAdapter(db, { provider: "pg" }), twoFactor(), passkey() and rateLimit.storage "database" produced pgTable("user"), "session" (index session_userId_idx), "account", "verification", "two_factor" (secret, backup_codes, verified, failed_verification_count, locked_until), "passkey" (public_key, credential_id, counter, device_type, backed_up, transports, aaguid), and "rate_limit" (key unique, count, last_request bigint), plus relations(). better-auth 1.7.7 depends on @better-auth/drizzle-adapter 1.7.7 and still exports ./adapters/drizzle; peerDependencies include next ^14||^15||^16, react ^18||^19, vitest up to ^5, drizzle-kit >=0.31.4.
  Implication: Generate the auth schema with npx auth@latest generate --config <auth.ts> --output packages/db/src/auth-schema.ts, commit it, and let drizzle-kit generate/migrate apply it. Any memo text that says npx @better-auth/cli must be replaced. Table names come out singular and snake_case (two_factor, rate_limit) with camelCase model names.

- Better Auth's Hono mount is app.all on /api/auth/* with c.req.raw; CORS goes before it and only matters cross-origin; the route must match basePath and precede catch-alls.
  Source: https://www.better-auth.com/docs/integrations/hono (checked 2026-10-04, confidence high)
  Evidence: app.all("/api/auth/*", (c) => auth.handler(c.req.raw)); app.all() forwards every HTTP method to Better Auth using the raw Web Standard Request from c.req.raw. Better Auth validates the method and returns a Response that Hono sends directly. Register the auth route before any catch-all route that could handle the request first. The resulting Hono route must match your Better Auth basePath, which defaults to /api/auth. With basePath: const app = new Hono().basePath("/api"); app.all("/auth/*", (c) => auth.handler(c.req.raw)); CORS: register Hono's CORS middleware before the Better Auth route: app.use("/api/auth/*", cors({ origin: "http://localhost:3001", credentials: true })); When credentials is enabled, configure an explicit CORS origin instead of * and add the same origin to Better Auth's trustedOrigins. Session middleware: const session = await auth.api.getSession({ headers: c.req.raw.headers }); c.set("session", session).
  Implication: In the Tidefern Hono app (basePath /api), register app.all("/auth/*") before the /v1 OpenAPI routes. Because the web app and API share one Vercel origin, no CORS middleware is needed in phase 1; add it with an explicit origin plus trustedOrigins only when Expo or another origin calls the API.

- Running the Hono app inside a Next.js route handler preserves Better Auth cookies because the handler simply returns Better Auth's Response; hono/vercel handle is deprecated in 4.13.13 in favor of @hono/vercel.
  Source: https://www.better-auth.com/docs/integrations/next (checked 2026-10-04, confidence high)
  Evidence: Next docs: app/api/auth/[...all]/route.ts: import { toNextJsHandler } from "better-auth/next-js"; export const { GET, POST } = toNextJsHandler(auth); server components: const session = await auth.api.getSession({ headers: await headers() }); the nextCookies plugin sets cookies when a Set-Cookie header appears in responses from server actions, added as the final plugin; Next.js 16+: rename middleware.ts to proxy.ts, getSessionCookie() for optimistic checks. better-auth 1.7.7 source (dist/integrations/next-js.mjs): toNextJsHandler returns { GET, POST, PATCH, PUT, DELETE } each doing auth.handler(request); nextCookies hooks path /get-session and calls warnIfCookiePluginNotLast. hono 4.13.13 dist/adapter/vercel/handler.js: @deprecated hono/vercel will be removed in v5. Install @hono/vercel and import from there instead. const handle = (app) => (req) => app.fetch(req). @hono/vercel 1.0.0 (peer hono >=4.13.9) README: The exports are the same. Change the import path. Cookie security (better-auth dist/cookies/index.mjs): secure prefix applies when advanced.useSecureCookies is set, else when baseURL starts with https://, else when isProduction; cookie names get the __Secure- prefix and secure: true, sameSite: "lax". Default IP header list in @better-auth/core/dist/utils/ip.mjs: DEFAULT_IP_HEADERS = ["x-forwarded-for"], overridable via advanced.ipAddress.ipAddressHeaders.
  Implication: Mount the whole Hono app at app/api/[[...route]]/route.ts with export const GET = (req) => app.fetch(req) (or handle from @hono/vercel), and let Better Auth answer /api/auth/* inside it; Set-Cookie headers flow through unchanged. Set baseURL to the https production URL (BETTER_AUTH_URL) so cookies are Secure and __Secure- prefixed on Vercel; add nextCookies last only if server actions call auth.api sign-in functions. Server components keep using auth.api.getSession({ headers: await headers() }) directly, no HTTP hop.

- Plugin packages and defaults for 1.7.7: passkey is @better-auth/passkey, twoFactor is in better-auth/plugins, rate limiting defaults to 100 requests per 10 seconds in memory, sessions default to 7 days with 1-day updateAge, and cookieCache delays revocation.
  Source: https://www.better-auth.com/docs/plugins/passkey (checked 2026-10-04, confidence high)
  Evidence: Passkey: npm install @better-auth/passkey; import { passkey } from "@better-auth/passkey"; passkey({ rpID, rpName, origin, authenticatorSelection }); client: import { passkeyClient } from "@better-auth/passkey/client"; usage authClient.passkey.addPasskey({ name }), authClient.signIn.passkey({ autoFill: true }). 2FA (https://www.better-auth.com/docs/plugins/2fa): import { twoFactor } from "better-auth/plugins"; twoFactor({ issuer }), options otpOptions.sendOTP, totpOptions, skipVerificationOnEnable; client import { twoFactorClient } from "better-auth/client/plugins" with onTwoFactorRedirect. Rate limit (https://www.better-auth.com/docs/concepts/rate-limit): window (seconds), max, storage "memory" (default) | "database" | "secondary-storage", modelName default rateLimit; production default 100 requests within 10 seconds; auth.api server calls bypass; database or secondary storage recommended for serverless. Source confirms window: 10 and max 100 in dist/api/rate-limiter/index.mjs. Session (https://www.better-auth.com/docs/concepts/session-management): expiresIn 60*60*24*7, updateAge 60*60*24, freshAge 60*60*24, cookieCache.maxAge 5*60, strategy compact | jwt | jwe; When cookieCache is enabled, revoked sessions may remain active on other devices until the cookie cache expires (maxAge). Email/password (https://www.better-auth.com/docs/authentication/email-password): requireEmailVerification, sendResetPassword({ user, url, token }), revokeSessionsOnPasswordReset: true, passwords at least 8 and max 128 by default, scrypt hashing. Options reference: basePath default /api/auth; trustedOrigins accepts an array, a function of the request, or wildcard patterns like https://*.example.com; BETTER_AUTH_URL and BETTER_AUTH_SECRET are env fallbacks; advanced.database.generateId accepts a function, false, "serial" or "uuid".
  Implication: Server config: emailAndPassword { enabled, requireEmailVerification: true, revokeSessionsOnPasswordReset: true, sendResetPassword via Resend }, emailVerification.sendVerificationEmail, rateLimit { enabled: true, storage: "database" } (memory storage is useless across Fluid instances), plugins [twoFactor({ issuer: "Tidefern" }), passkey({ rpID, rpName, origin })]. Leave session.cookieCache disabled in phase 1 (two users, privacy-sensitive, instant revocation matters) and revisit with a short maxAge later. Use a trustedOrigins function or wildcard for Vercel preview URLs.

- Better Auth security advisories from April through July 2026 are all fixed at or before 1.7.7; one lands in June (device authorization) and a July 7 batch covers OAuth/OIDC, organization, SCIM, anonymous and admin flows; the April cookieCache 2FA bypass is the most relevant to this design.
  Source: https://api.osv.dev/v1/query (checked 2026-10-04, confidence high)
  Evidence: OSV (npm better-auth): GHSA-xg6x-h9c9-2m83 published 2026-04-03, Two-Factor Authentication Bypass via Premature Session Caching (session.cookieCache), fixed 1.4.9: when session.cookieCache is enabled, the session generated during the initial sign-in step may be cached as valid prior to 2FA verification. GHSA-p6v2-xcpg-h6xw 2026-05-15, rate limiter keys IPv6 addresses individually and is bypassable via prefix rotation, fixed 1.4.17. GHSA-wxw3-q3m9-c3jr 2026-05-15, OAuth callback accepts mismatched state with cookie-backed state storage without PKCE, fixed 1.6.2. GHSA-cq3f-vc6p-68fh published 2026-06-04, Device authorization approve and deny accept any authenticated session while the user code is pending, affects >=1.6.0 <1.6.11 only when deviceAuthorization() is enabled. 2026-07-07 batch (fixed 1.6.11 unless noted): GHSA-2vg6-77g8-24mp stale sessions persist after user deletion across admin, anonymous, and SCIM flows (also @better-auth/scim); GHSA-392p-2q2v-4372 and GHSA-7w99-5wm4-3g79 refresh-token rotation and authorization-code concurrent redemption in @better-auth/oauth-provider; GHSA-86j7-9j95-vpqj stored XSS via javascript: redirect_uri in oidc-provider and mcp (fixed 1.6.13); GHSA-9h47-pqcx-hjr4 oidcProvider alg=none advertised and plain PKCE accepted; GHSA-fmh4-wcc4-5jm3 organization plugin invitation acceptance via unverified email match; GHSA-g38m-r43w-p2q7 account takeover via OAuth auto-link to unverified pre-registered email (requires emailAndPassword plus a social/SSO provider; mitigations account.accountLinking.disableImplicitLinking: true or enabled: false); GHSA-pw9m-5jxm-xr6h refresh-token replay in oidc-provider and mcp. GHSA-qq9h-g4jm-xgf3 2026-07-24, pre-account hijacking on magic-link and email-OTP sign-in with open email/password registration, fixed 1.6.22 and 1.7.0-beta.10. @better-auth/passkey: GHSA-4vcf-q4xf-f48m 2025-11-25 passkey deletion through IDOR (fixed).
  Implication: 1.7.7 carries all fixes. Do not enable deviceAuthorization, oidcProvider, mcp, organization, scim or anonymous plugins in phase 1 (none are needed). Keep requireEmailVerification true, keep cookieCache off, set account.accountLinking.disableImplicitLinking: true the moment any social provider or magic-link/email-OTP plugin is added, and keep rate limiting in the database so IPv6 keying and multi-instance counting behave. Subscribe to GitHub advisories for better-auth and @better-auth/passkey.

- PGlite 0.5.8 runs the Postgres 18 engine with full RLS, roles, set_config and SET LOCAL ROLE, so it gives policy-semantics parity for unit tests; a postgres:18.6 service container is still needed for migration and pooling parity.
  Source: https://pglite.dev/docs/ (checked 2026-10-04, confidence high)
  Evidence: Live run in Node 22 with @electric-sql/pglite 0.5.8: select version() returned PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten. CREATE ROLE app_user NOLOGIN, ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY, CREATE POLICY ... TO app_user USING (owner_id = current_setting('app.user_id', true)) all succeeded; inside db.transaction with select set_config('app.user_id', $1, true) and set local role app_user, a select returned only the u1 row and an insert for u2 failed with new row violates row-level security policy; after commit current_user returned to postgres and the setting was empty. The default PGlite role is postgres with rolsuper true and rolbypassrls true, so RLS only applies after SET LOCAL ROLE. The same transaction pattern via drizzle-orm/pglite 0.45.3 (tx.execute(sql`select set_config(...)`) then set local role) returned only the u1 row. PGlite docs: As PGlite only has a single exclusive connection to the database. drizzle-orm 0.45.3 peer dep @electric-sql/pglite >=0.2.0; migrator at drizzle-orm/pglite/migrator. GitHub Actions docs (https://docs.github.com/en/actions/how-tos/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers): services.postgres with image: postgres, env POSTGRES_PASSWORD, options --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5, ports 5432:5432, connect via POSTGRES_HOST localhost. Docker Hub library/postgres tags include 18.6 and 18.6-alpine (updated 2026-09-24).
  Implication: packages/db unit tests: Vitest 5 with one in-memory PGlite per test file (single exclusive connection, so no parallel workers against one instance), apply the committed SQL migrations with drizzle-orm/pglite/migrator, then test policies by SET LOCAL ROLE to the app role. Integration job: postgres:18.6 service container running drizzle-kit migrate and Playwright, which also catches anything Neon-specific that PGlite cannot (pooler behavior, real roles, extensions).

- AES-256-GCM with AAD via node:crypto, a 12-byte random IV and a 16-byte tag, is the documented primitive for local envelope encryption; NIST caps random-IV invocations per key at 2^32.
  Source: https://nodejs.org/docs/latest-v24.x/api/crypto.html (checked 2026-10-04, confidence high)
  Evidence: Node.js v24.21.0 docs: crypto.createCipheriv(algorithm, key, iv[, options]) ... In GCM mode, the authTagLength option is not required but can be used to set the length of the authentication tag that will be returned by getAuthTag() and defaults to 16 bytes. cipher.setAAD(buffer[, options]): When using an authenticated encryption mode (GCM, CCM, OCB, and chacha20-poly1305 are currently supported), the cipher.setAAD() method sets the value used for the additional authenticated data (AAD) input parameter. The plaintextLength option is optional for GCM. cipher.getAuthTag() should only be called after encryption has been completed using the cipher.final() method. decipher.setAuthTag(): If no tag is provided, or if the cipher text has been tampered with, decipher.final() will throw. crypto.randomBytes generates cryptographically strong pseudorandom data. NIST SP 800-38D: For IVs, it is recommended that implementations restrict support to the length of 96 bits; RBG-based construction: the length of the random field shall be at least 96 bits; Section 8.3: The total number of invocations of the authenticated encryption function shall not exceed 2^32, including all IV lengths and all instances of the authenticated encryption function with the given key. Local self-test of the snippet below: DEK wrap/unwrap round trip true, field round trip ok, AAD mismatch and tampered byte both threw Unsupported state or unable to authenticate data.
  Implication: Phase 1 pattern: per-user 32-byte DEK generated with randomBytes, wrapped under a 32-byte KEK from an env var (TIDEFERN_KEK_V1) with AES-256-GCM and AAD = dek:<userId>:v<kekVersion>; each free-text field encrypted under the DEK with AAD binding user id, table.column and row id; store iv||tag||ciphertext plus kek_version. Per-user DEKs keep each key far below 2^32 encryptions and make account deletion a DEK delete.

- The upgrade path to AWS KMS is GenerateDataKey plus Decrypt with an encryption context, and it mirrors the AWS Encryption SDK raw AES keyring used for local wrapping, so only the DEK wrapping layer changes.
  Source: https://docs.aws.amazon.com/kms/latest/APIReference/API_GenerateDataKey.html (checked 2026-10-04, confidence high)
  Evidence: GenerateDataKey: Returns a unique symmetric data key for use outside of AWS KMS. This operation returns a plaintext copy of the data key and a copy that is encrypted under a symmetric encryption KMS key that you specify. KeySpec AES_256; EncryptionContext is a collection of non-secret key-value pairs that represent additional authenticated data ... you must specify the same (an exact case-sensitive match) encryption context to decrypt the data. Recommended flow: Use the plaintext data key (in the Plaintext field of the response) to encrypt your data outside of AWS KMS. Then erase the plaintext data key from memory. Store the encrypted data key (in the CiphertextBlob field of the response) with the encrypted data. To decrypt: Use the Decrypt operation to decrypt the encrypted data key. Decrypt API: Decrypts ciphertext that was encrypted by a KMS key using ... GenerateDataKey; KeyId optional for symmetric ciphertext but always recommended as a best practice. KMS cryptography essentials (https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html): Envelope encryption is the practice of encrypting plaintext data with a data key, and then encrypting the data key under another key ... Instead of re-encrypting raw data multiple times with different keys, you can re-encrypt only the data keys that protect the raw data; symmetric operations use AES in GCM using 256-bit keys. AWS Encryption SDK raw AES keyring (https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/use-raw-aes-keyring.html): Use a Raw AES keyring when you need to provide the wrapping key and encrypt the data keys locally or offline ... encrypts data by using the AES-GCM algorithm and a wrapping key that you specify as a byte array; Node.js: new RawAesKeyringNode({ keyName, keyNamespace, unencryptedMasterKey, wrappingSuite: AES256_GCM_IV12_TAG16_NO_PADDING }); key namespace and key name ... are not secret.
  Implication: Design the DEK table with columns wrapped_dek bytea, kek_provider text ('env' now, 'aws-kms' later), kek_version or kms_key_arn, and aad fields. Migration to KMS is a background job that, per user, unwraps with the env KEK and re-wraps by calling Encrypt (or mints new DEKs with GenerateDataKey and re-encrypts rows), passing EncryptionContext = { userId, purpose } that matches the AAD convention. No payload re-encryption is required for the key-provider switch.

- Vercel Fluid compute shares one Node process across concurrent invocations by default, which is what makes a module-scope pg Pool both safe and desirable.
  Source: https://vercel.com/docs/fluid-compute (checked 2026-10-04, confidence high)
  Evidence: last_updated 2026-08-24. As of April 23, 2025, fluid compute is enabled by default for new projects. Fluid compute allows multiple invocations to share a single function instance ... Instead of using a microVM for each function invocation, multiple invocations can share the same physical instance (a global state/process) concurrently. Unhandled errors won't crash other concurrent requests running on the same instance. Default / Max duration 300s / 800s on Pro. Background processing via waitUntil; for Next.js 15.1+ Vercel recommends after() from next/server instead of waitUntil().
  Implication: Keep the Pool and the Drizzle db instance at module scope in packages/db, register attachDatabasePool once, and use after() from next/server (not waitUntil) for post-response work such as outbox enqueue confirmation. Confirm the Vercel project has Fluid enabled (default for new projects).

### Recommendations

- (consequential) Pin drizzle-orm 0.45.3 and drizzle-kit 0.31.11 exactly; use pgTable(...).enableRLS() with pgPolicy/pgRole from drizzle-orm/pg-core; keep the journal-based drizzle/ migrations folder; never install @rc/@beta or run drizzle-kit up.
  Why: The stable line is 0.45.3/0.31.11 (published 2026-09-21) and better-auth 1.7.7 peers on ^0.45.2. The docs site now documents the v1 RC (drizzle-orm@rc install lines, pgTable.withRLS, folder-per-migration layout, DDL snapshots) which does not match the 0.45.3 types; the live generate run confirmed enableRLS and pgPolicy emit correct SQL on 0.31.11.
  Rejected: Adopting drizzle 1.0.0-rc.4 for the newer RQB v2 and migration layout: rejected per instruction (no RC) and because the v1 migration folder format is incompatible with 0.31.x tooling.

- (consequential) Migrations: drizzle-kit generate locally (commit SQL + meta), drizzle-kit migrate --config in CI and on deploy against DATABASE_URL_DIRECT (no -pooler), plus a scripts/migrate.ts runner using drizzle-orm/node-postgres/migrator with migrationsFolder for Neon PR branches. Never push in CI.
  Why: Neon lists schema migrations among direct-connection tasks because transaction pooling forbids session-level statements; drizzle docs position push as prototyping with data-loss prompts; the 0.45.3 migrator signature requires { migrationsFolder }.
  Rejected: drizzle-kit push --force on preview branches: rejected, it bypasses the committed migration history and auto-accepts destructive statements.

- (consequential) Driver: pg 8.23.1 Pool created once at module scope with max 2 to 5 and idleTimeoutMillis 5000, wrapped by drizzle-orm/node-postgres, registered with attachDatabasePool from @vercel/functions 3.9.11, using the pooled Neon URL. Do not add @neondatabase/serverless in phase 1.
  Why: Neon's Vercel guide, choose-connection page and serverless pooling guide, and Vercel's July 2026 KB all recommend TCP pg with attachDatabasePool on Fluid compute; Vercel says avoid max 1 and use a short idle timeout; the Neon serverless driver's WebSocket pool must be opened and closed per request and HTTP mode cannot do interactive transactions, which the set_config RLS pattern needs.
  Rejected: @neondatabase/serverless 1.2.0 over HTTP (no interactive transactions, so no per-transaction actor context) or over WebSocket (per-request connect/close cost).

- (consequential) Row-level security now, not later: enable RLS on every user-data table with pgPolicy TO a dedicated application login role, policies on current_setting('app.user_id', true), and a withActor(userId, fn) helper that runs db.transaction, calls select set_config('app.user_id', $1, true), then SET LOCAL ROLE <app role>, then the callback. Run migrations as the owner role over the direct URL. Exclude Neon-managed roles via entities.roles.exclude in drizzle.config.ts.
  Why: Verified live on PGlite 0.5.8 (PG 18.3) through drizzle-orm 0.45.3: policies apply only after SET LOCAL ROLE because the default/owner role bypasses RLS, settings reset at commit, and WITH CHECK rejects cross-user inserts. Transaction-scoped state is compatible with Neon's transaction-mode pooler because the connection is returned after each transaction. The Neon crudPolicy/authUid helpers depend on auth.user_id() from the Data API and do not apply to a Better Auth backend.
  Rejected: Neon crudPolicy with authenticatedRole (Data API only); application-layer WHERE clauses alone (no defense in depth for a privacy-sensitive product); using the table-owner role at runtime (owner bypasses RLS unless FORCE, and even then owner can ALTER policies).

- (consequential) Better Auth 1.7.7 server: drizzleAdapter(db, { provider: "pg", schema }), schema generated by npx auth@latest generate into packages/db/src/auth-schema.ts, emailAndPassword with requireEmailVerification and revokeSessionsOnPasswordReset, emailVerification via Resend, rateLimit { enabled: true, storage: "database" }, plugins [twoFactor({ issuer: "Tidefern" }), passkey({ rpID, rpName, origin })], session defaults (7d/1d) with cookieCache disabled, baseURL from BETTER_AUTH_URL, basePath default /api/auth, trustedOrigins as a function allowing the production host and https://*.vercel.app previews, advanced.database.generateId "uuid".
  Why: The CLI moved to the auth package (@better-auth/cli is deprecated); the generate run confirmed the exact tables including rate_limit; memory rate limiting cannot count across Fluid instances; the April 2026 advisory showed cookieCache can interact badly with 2FA and it delays revocation; passkeys ship as @better-auth/passkey.
  Rejected: Managed auth (Neon Auth, Clerk) rejected by prior memo for data locality; magic-link/email-OTP plugins deferred because of the July 24 pre-account hijacking advisory class and because passkeys plus TOTP already cover passwordless.

- (consequential) Mount: one Hono app with basePath('/api'); register app.all('/auth/*', (c) => auth.handler(c.req.raw)) before the /v1 OpenAPI routes; expose it from apps/web/app/api/[[...route]]/route.ts via export const GET = (req: Request) => app.fetch(req) (same for POST, PUT, PATCH, DELETE), or handle from @hono/vercel 1.0.0; no CORS middleware until a second origin exists; server components call auth.api.getSession({ headers: await headers() }); add nextCookies() as the last plugin only if server actions call auth.api mutations.
  Why: Better Auth's toNextJsHandler is literally (request) => auth.handler(request), so returning Hono's Response from a Next route handler propagates Set-Cookie identically; hono/vercel's handle is deprecated in 4.13.13 (removed in v5) and @hono/vercel exports the same handle; Better Auth docs require the Hono route to match basePath and precede catch-alls.
  Rejected: A separate app/api/auth/[...all]/route.ts with toNextJsHandler next to the Hono catch-all: works but duplicates routing and risks the catch-all shadowing it.

- (advisory) Testing data: Vitest 5 with in-memory PGlite 0.5.8 (one instance per test file, migrations applied via drizzle-orm/pglite/migrator) for packages/db and RLS policy tests; a GitHub Actions integration job with a postgres:18.6 service container that runs drizzle-kit migrate and Playwright.
  Why: PGlite is the Postgres 18 engine and passed a live RLS/roles/set_config test, so it gives policy-semantics parity at near-zero cost; it has a single exclusive connection, so it cannot model pooling or concurrency; the Docker image matches Neon's 18.6 for migration parity.
  Rejected: Only a service container (slower unit loop); only PGlite (misses pooler and real-role behavior); Neon branch per CI run for unit tests (quota and latency).

- (consequential) Envelope encryption phase 1: AES-256-GCM via node:crypto, 12-byte random IV, 16-byte tag, AAD on both layers; per-user DEK wrapped under TIDEFERN_KEK_V<n> (32 bytes, base64, in Vercel sensitive env vars); columns store iv||tag||ciphertext and a kek_version; KEK rotation re-wraps DEKs only. Upgrade path: swap the wrap/unwrap functions for KMS GenerateDataKey/Decrypt with EncryptionContext equal to the AAD fields.
  Why: Node 24 docs document GCM AAD and the 16-byte default tag; NIST 800-38D recommends 96-bit IVs and caps random-IV invocations per key at 2^32 (per-user DEKs keep usage far below); AWS documents the same construction as the raw AES keyring and the GenerateDataKey/Decrypt flow; the snippet was executed and rejects tampering and AAD mismatch.
  Rejected: Single app-wide key for all rows (no per-user deletion or rotation granularity, approaches the invocation cap); pgcrypto in-database encryption (keys would transit to Neon); adopting the AWS Encryption SDK message format now (adds a dependency and a framed format the app does not need yet).

- (advisory) Neon plan and project settings: Launch plan, Postgres 18, history_retention_seconds 604800 on production, GitHub integration installed for NEON_API_KEY/NEON_PROJECT_ID, PR branches via create-branch-action@v6 (parent_branch production, expires_at 7 days), delete-branch-action@v3 on close.
  Why: Launch allows 7-day PITR and 10 branches at pay-as-you-go pricing; v6 renamed inputs (parent_branch, role) and outputs (db_url_pooled); expires_at keeps abandoned branches from consuming the allowance.
  Rejected: Scale plan now (30-day PITR not needed with two users); the integration's v5 sample workflow verbatim (older inputs).

### Verified snippets

#### packages/db/drizzle.config.ts for drizzle-kit 0.31.11 (verified by a live drizzle-kit generate run; direct URL for migrations; Neon-managed roles excluded from role management)

Source: https://orm.drizzle.team/docs/drizzle-config-file

```
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    // Direct (non -pooler) URL: Neon says schema migrations need a direct connection.
    url: process.env.DATABASE_URL_DIRECT!,
  },
  migrations: {
    table: "__drizzle_migrations", // default
    schema: "drizzle",             // default
  },
  entities: {
    // Let drizzle-kit manage roles declared with pgRole(), but never touch Neon's own roles.
    roles: { exclude: ["neondb_owner", "neon_superuser", "authenticated", "anonymous"] },
  },
  strict: true,
  verbose: true,
});
```

#### packages/db/scripts/migrate.ts: run committed SQL migrations from Node with the pg driver (signature verified against drizzle-orm@0.45.3 node-postgres/migrator.d.ts, which requires migrationsFolder)

Source: https://orm.drizzle.team/docs/migrations

```
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT is required (direct, non-pooler Neon URL)");

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool });

try {
  await migrate(db, {
    migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "drizzle",
  });
  console.log("migrations applied");
} finally {
  await pool.end();
}
```

#### packages/db/src/client.ts: module-scope pg Pool on Vercel Fluid compute with attachDatabasePool (values from Neon's serverless pooling guide and Vercel's July 2026 KB)

Source: https://neon.com/docs/guides/serverless-connection-pooling

```
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

// Pooled Neon URL (host contains -pooler). Declared once per module so warm Fluid instances reuse it.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,                 // small per-instance pool; Neon's PgBouncer multiplexes the rest
  idleTimeoutMillis: 5000 // short idle timeout per Vercel guidance
});
attachDatabasePool(pool); // closes idle clients before the instance suspends

export const db = drizzle({ client: pool, schema });
```

#### RLS schema with drizzle-orm 0.45.3 (.enableRLS() plus pgPolicy TO an app role) and the actor-scoped transaction helper (both verified live: generated SQL matched, and the transaction returned only the actor's rows then reset after commit)

Source: https://orm.drizzle.team/docs/rls

```
// schema/journal.ts
import { sql } from "drizzle-orm";
import { pgTable, pgPolicy, pgRole, text, uuid, timestamp } from "drizzle-orm/pg-core";

// Login role the API connects as; created once via Neon console/SQL, so mark it existing.
export const appRole = pgRole("tidefern_app").existing();

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    bodyCiphertext: text("body_ciphertext").notNull(), // envelope-encrypted, base64
    kekVersion: text("kek_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    pgPolicy("journal_entries_owner", {
      for: "all",
      to: appRole,
      using: sql`${t.userId} = current_setting('app.user_id', true)`,
      withCheck: sql`${t.userId} = current_setting('app.user_id', true)`,
    }),
  ],
).enableRLS();

// with-actor.ts
import { sql } from "drizzle-orm";
import { db } from "./client";

export function withActor<T>(userId: string, fn: (tx: typeof db) => Promise<T>) {
  return db.transaction(async (tx) => {
    // is_local = true: setting lives only for this transaction (safe behind Neon's transaction pooler)
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role tidefern_app`);
    return fn(tx as unknown as typeof db);
  });
}
```

#### Generate the Better Auth tables for Drizzle with the 1.7.7 CLI (package name is auth; @better-auth/cli is deprecated). Output verified to include user, session, account, verification, two_factor, passkey and rate_limit.

Source: https://www.better-auth.com/docs/concepts/cli

```
pnpm dlx auth@latest generate --config packages/auth/src/auth.ts --output packages/db/src/schema/auth.ts -y
# then
pnpm --filter @tidefern/db exec drizzle-kit generate
pnpm --filter @tidefern/db exec drizzle-kit migrate
```

#### packages/auth/src/auth.ts: Better Auth 1.7.7 server with Drizzle adapter, email+password, verification, database rate limiting, twoFactor and passkey (assembled from the cited docs pages; the same config shape drove the verified generate run)

Source: https://www.better-auth.com/docs/adapters/drizzle

```
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { db } from "@tidefern/db";
import * as schema from "@tidefern/db/schema/auth";
import { sendEmail } from "./email"; // Resend wrapper

const baseURL = process.env.BETTER_AUTH_URL!; // https://app.tidefern.com in prod
const rp = new URL(baseURL);

export const auth = betterAuth({
  appName: "Tidefern",
  baseURL,
  basePath: "/api/auth", // default; must match the Hono route
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: (req) => {
    const origin = req.headers.get("origin") ?? "";
    return [baseURL, ...(origin.endsWith(".vercel.app") ? [origin] : [])];
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, subject: "Reset your Tidefern password", text: url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, subject: "Verify your email", text: url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (default)
    updateAge: 60 * 60 * 24,     // 1 day (default)
    cookieCache: { enabled: false }, // keep revocation immediate in phase 1
  },
  rateLimit: {
    enabled: true,
    storage: "database", // memory storage cannot count across Fluid instances
    window: 10,
    max: 100,
  },
  advanced: {
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] }, // default; Vercel sets it
  },
  plugins: [
    twoFactor({ issuer: "Tidefern" }),
    passkey({ rpID: rp.hostname, rpName: "Tidefern", origin: baseURL }),
    // nextCookies() goes LAST, and only if server actions call auth.api mutations
  ],
});

export type Session = typeof auth.$Infer.Session;
```

#### packages/api/src/app.ts and apps/web/app/api/[[...route]]/route.ts: Hono mount of Better Auth (from the Better Auth Hono docs) and the Next.js route handler (equivalent to toNextJsHandler, which just calls auth.handler(request); hono/vercel handle is deprecated in 4.13.13)

Source: https://www.better-auth.com/docs/integrations/hono

```
// packages/api/src/app.ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "@tidefern/auth";

type Env = { Variables: { session: typeof auth.$Infer.Session | null } };

export const app = new OpenAPIHono<Env>().basePath("/api");

// Better Auth first, before any /v1 or catch-all route. No CORS needed while same-origin.
app.all("/auth/*", (c) => auth.handler(c.req.raw));

export const requireSession = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(401);
  c.set("session", session);
  await next();
});

app.use("/v1/*", requireSession);
// app.openapi(...) routes under /v1 go here

// apps/web/app/api/[[...route]]/route.ts
import { app } from "@tidefern/api";

export const runtime = "nodejs";
const handler = (req: Request) => app.fetch(req); // returns Better Auth's Response, Set-Cookie intact
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };

// apps/web/app/(app)/layout.tsx (server component)
// import { headers } from "next/headers";
// const session = await auth.api.getSession({ headers: await headers() });
```

#### apps/web/lib/auth-client.ts: React client for Better Auth 1.7.7 with twoFactor and passkey client plugins (from the client, 2FA and passkey docs)

Source: https://www.better-auth.com/docs/concepts/client

```
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  // Omit baseURL when the client runs on the same origin as /api/auth; set it for Expo later.
  basePath: "/api/auth",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    passkeyClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
// Usage: await signIn.email({ email, password }); await authClient.signIn.passkey({ autoFill: true });
// await authClient.passkey.addPasskey({ name: "MacBook" }); await authClient.twoFactor.enable({ password });
```

#### .github/workflows/ci.yml: Postgres 18.6 service container for integration tests (YAML from the GitHub Actions docs; image tag pinned to the 18.6 tag present on Docker Hub, matching Neon's current 18.6)

Source: https://docs.github.com/en/actions/how-tos/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers

```
jobs:
  db-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18.6
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_USER: postgres
          POSTGRES_DB: tidefern_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/tidefern_test
      DATABASE_URL_DIRECT: postgres://postgres:postgres@localhost:5432/tidefern_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @tidefern/db exec drizzle-kit migrate
      - run: pnpm turbo test:integration
```

#### .github/workflows/neon-preview.yml: Neon branch per PR using create-branch-action@v6 inputs/outputs (parent_branch, expires_at, db_url, db_url_pooled), delete-branch-action@v3 on close; secrets/vars installed by the Neon GitHub integration

Source: https://github.com/neondatabase/create-branch-action

```
name: Neon preview branch
on:
  pull_request:
    types: [opened, reopened, synchronize, closed]
jobs:
  create:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create Neon branch
        id: neon
        uses: neondatabase/create-branch-action@v6
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          parent_branch: production
          branch_name: preview/pr-${{ github.event.number }}
          role: tidefern_app
          expires_at: ${{ github.event.pull_request.updated_at }} # or compute now+7d in a prior step
          api_key: ${{ secrets.NEON_API_KEY }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Migrate preview branch (direct URL)
        run: pnpm --filter @tidefern/db exec drizzle-kit migrate
        env:
          DATABASE_URL_DIRECT: ${{ steps.neon.outputs.db_url }}
      # Hand ${{ steps.neon.outputs.db_url_pooled }} to the Vercel preview env as DATABASE_URL
  delete:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

#### packages/crypto/src/envelope.ts: AES-256-GCM envelope encryption with AAD using node:crypto (executed locally; round trips pass, AAD mismatch and tampering throw). Swap wrapDek/unwrapDek for KMS GenerateDataKey/Decrypt later.

Source: https://nodejs.org/docs/latest-v24.x/api/crypto.html

```
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_BYTES = 12;  // 96-bit IV (NIST SP 800-38D recommendation)
const TAG_BYTES = 16; // Node's default GCM authTagLength

function loadKek(version: number): Buffer {
  const raw = process.env[`TIDEFERN_KEK_V${version}`];
  if (!raw) throw new Error(`missing TIDEFERN_KEK_V${version}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KEK must be 32 bytes");
  return key;
}

export function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv(ALG, key, iv, { authTagLength: TAG_BYTES });
  c.setAAD(aad, { plaintextLength: plaintext.length });
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]); // iv || tag || ciphertext
}

export function open(key: Buffer, blob: Buffer, aad: Buffer): Buffer {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const d = createDecipheriv(ALG, key, iv, { authTagLength: TAG_BYTES });
  d.setAAD(aad, { plaintextLength: ct.length });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]); // throws if tampered or AAD differs
}

// Per-user data encryption key, wrapped under the env KEK. Store { wrapped, kekVersion } per user.
export function createWrappedDek(userId: string, kekVersion: number) {
  const dek = randomBytes(32);
  const wrapped = seal(loadKek(kekVersion), dek, Buffer.from(`dek:${userId}:v${kekVersion}`));
  return { dek, wrapped, kekVersion };
}
export function unwrapDek(userId: string, wrapped: Buffer, kekVersion: number) {
  return open(loadKek(kekVersion), wrapped, Buffer.from(`dek:${userId}:v${kekVersion}`));
}

// Field layer: AAD binds the ciphertext to its owner, column and row.
export const encryptField = (dek: Buffer, userId: string, table: string, column: string, rowId: string, text: string) =>
  seal(dek, Buffer.from(text, "utf8"), Buffer.from(`${userId}:${table}.${column}:${rowId}`));
export const decryptField = (dek: Buffer, userId: string, table: string, column: string, rowId: string, blob: Buffer) =>
  open(dek, blob, Buffer.from(`${userId}:${table}.${column}:${rowId}`)).toString("utf8");

// KMS upgrade (later): GenerateDataKey({ KeyId, KeySpec: "AES_256", EncryptionContext: { userId } })
// returns Plaintext (use once, then discard) and CiphertextBlob (store as wrapped_dek with kek_provider = "aws-kms");
// Decrypt({ CiphertextBlob, KeyId, EncryptionContext: { userId } }) returns Plaintext for unwrapDek.
```

#### packages/db/test/rls.test.ts: Vitest 5 + PGlite 0.5.8 pattern for RLS policy tests (mirrors the live experiment; note the default PGlite role is a superuser with BYPASSRLS, so SET LOCAL ROLE is mandatory)

Source: https://orm.drizzle.team/docs/connect-pglite

```
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { beforeAll, afterAll, expect, test } from "vitest";

const client = new PGlite(); // in-memory, Postgres 18 engine, single exclusive connection
const db = drizzle({ client });

beforeAll(async () => {
  await db.execute(sql`create role tidefern_app nologin`);
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  await db.execute(sql`grant select, insert, update, delete on all tables in schema public to tidefern_app`);
});
afterAll(() => client.close());

test("a user only sees their own journal entries", async () => {
  await db.execute(sql`insert into journal_entries (user_id, body_ciphertext, kek_version) values ('u1','x','v1'),('u2','y','v1')`);
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${"u1"}, true)`);
    await tx.execute(sql`set local role tidefern_app`);
    return (await tx.execute(sql`select user_id from journal_entries`)).rows;
  });
  expect(rows).toEqual([{ user_id: "u1" }]);
});
```

### Open questions

- How the tidefern_app login role should be created on Neon (console/API-created roles vs CREATE ROLE ... LOGIN PASSWORD in SQL) and whether a role created in SQL can authenticate through the Neon proxy with a password; the Neon roles page was not fetched in this sweep. Until confirmed, create the role in the Neon console and mark it .existing() in Drizzle.
- Whether SET LOCAL ROLE is explicitly permitted through Neon's PgBouncer in transaction mode. The Neon page lists session-level SET/RESET as unsupported and says connections return to the pool after each transaction; transaction-scoped SET LOCAL and set_config(..., true) should therefore be safe, but this was verified only on PGlite, not through the Neon pooler. Validate on a Neon branch during scaffold.
- Neon's naming: no deprecation notice for Neon RLS/Neon Authorize was found, but the old /docs/guides/neon-rls URL now 404s and the current pages are Data API-centric. Confirm with Neon support whether the JWT-based authorize feature is still offered if the Data API is ever considered.
- Exact publication year of create-branch-action 6.3.1 (the releases page shows March 31 without a year; assumed 2026) and whether the Neon GitHub integration's sample workflow will be updated from v5 to v6.
- When the Better Auth CLI package changed from @better-auth/cli to auth (between 1.4.21 in August 2026 and 1.7.x); docs and npm agree on auth@latest today.
- Whether Better Auth's rateLimit table should itself be excluded from RLS (it is not user-scoped) and whether auth tables should be owned by a separate schema; the generate output places everything in public.
- Node runtime on Vercel: Node 24 is current LTS and Node 26 becomes LTS on 2026-10-28; confirm Vercel's supported Node versions for Fluid compute before pinning engines (outside this dimension).

### Sources that could not be read

- GitHub REST API for neondatabase/* , drizzle-team/drizzle-orm, better-auth/better-auth and electric-sql/pglite releases (session-bound gh returned 403); release tags were taken from the public HTML releases pages and READMEs instead.
- GitHub Security Advisories API (/advisories blocked for this session); OSV.dev was used as the primary advisory source.
- https://neon.com/docs/guides/branch-reset (404; the content now lives at https://neon.com/docs/guides/reset-from-parent).
- https://neon.com/docs/guides/neon-rls (404; current pages are /docs/guides/row-level-security and /docs/guides/neon-rls-drizzle).
- https://orm.drizzle.team/docs/connect-node-postgres (404; node-postgres setup taken from /docs/get-started-postgresql).
- https://orm.drizzle.team/docs/latest-releases served stale content (latest entries dated February 2025); npm dist-tags and publish times were used for current versions.
- https://hono.dev/docs/getting-started/vercel no longer contains the Next.js route handler section; the hono/vercel deprecation and @hono/vercel handle were verified from the packages themselves.
- https://pglite.dev/docs/ does not state the bundled Postgres version; it was obtained by running select version() on PGlite 0.5.8.
- NIST SP 800-38D landing page (https://csrc.nist.gov/pubs/sp/800/38/d/final) lacks the technical text; the PDF was downloaded and text-extracted for sections 5.2.1.1, 8.2.2 and 8.3.
- Neon's https://neon.com/docs/guides/vercel-overview is only a chooser page; connection guidance came from /docs/guides/vercel-connection-methods and /docs/connect/choose-connection.

## contract-ci

<a id="contract-ci"></a>

Dimension: API contract tooling and CI/CD on GitHub Actions

### Summary

The memos' contract stack holds up against current primary sources, with a few sharpenings. @hono/zod-openapi 1.6.3 requires zod ^4 and hono >=4.10, exports its own pre-extended z, and emits OpenAPI 3.1 through app.doc31 and app.getOpenAPI31Document; I verified in a sandbox that z from "zod", "zod/v4" and "@hono/zod-openapi" are the same object, that basePath("/v1") is folded into the emitted paths, and that a plain Node type-stripping script writes openapi/v1.json without tsx. openapi-typescript 7.13.0 has a --check flag that exits 1 when the committed types are stale, and openapi-fetch 0.17.0 passes credentials: "include" straight through to fetch; both were compiled and exercised, while @hey-api/openapi-ts (0.99.0, MIT) is a fine alternative that generates a runtime SDK the project does not need. oasdiff-action v0.1.18 (released 2026-10-01) with fail-on ERR against a committed spec is the drift gate; a local oasdiff run on the emitted 3.1 document flagged a removed required response property and a new required query parameter and passed an additive change. An RFC 9457 handler built from Hono's onError, HTTPException and the OpenAPIHono defaultHook was executed and returns application/problem+json for validation (422), auth (401), crashes (500) and 404; the Idempotency-Key draft (07, Oct 2025) has expired but still gives the 400/422/409 rules the Postgres pattern follows. Current action releases are actions/checkout v7.0.1, actions/setup-node v7.0.0, actions/upload-artifact v7.0.1 and pnpm/action-setup v6.1.0, and the v6 moving tag of pnpm/action-setup still points at v6.0.10, which predates pnpm 12 support, so pin the v6.1.0 SHA. GitHub's hardening guide says a full-length SHA is the only immutable pin, permissions blocks zero out unspecified scopes, and Playwright explicitly advises against caching browsers. One finding changes the automation picture: iurman/tidefern is currently a public repository, which makes rulesets, CodeQL default setup and push protection free, but means a privacy-sensitive product's source is public and must be a deliberate choice. The GitHub API was blocked in this session, so release SHAs came from github.com pages and should be re-confirmed with gh api at build time, after which Renovate's helpers:pinGitHubActionDigests keeps them current.

### Findings

- @hono/zod-openapi 1.6.3 requires Zod 4 and Hono 4.10+, and its 1.0.0 release was the Zod v4 migration.
  Source: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-openapi/package.json (checked 2026-10-04, confidence high)
  Evidence: package.json peerDependencies: { "hono": ">=4.10.0", "zod": "^4.0.0" }; dependencies include "@asteasolutions/zod-to-openapi": "^9.1.0". CHANGELOG 1.0.0: "feat: support Zod v4 ... Zod OpenAPI has been migrated the Zod version from v3 to v4. As a result, the zod in peerDependencies has been updated to 4.0.0 or higher." npm view today: @hono/zod-openapi 1.6.3, zod 4.6.5, hono 4.13.13.
  Implication: Install hono@4.13.13, zod@4.6.5 and @hono/zod-openapi@1.6.3 together; no zod/v4 compatibility shims are needed.

- Import z from @hono/zod-openapi; it is the root zod instance with .openapi() patched in, and in Zod 4.x the root "zod" and "zod/v4" resolve to the same module.
  Source: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-openapi/src/index.ts (checked 2026-10-04, confidence high)
  Evidence: README: "The z object should be imported from @hono/zod-openapi". Source index.ts lines 44 to 45 and 861 to 862: import { z } from 'zod' ... extendZodWithOpenApi(z); export { extendZodWithOpenApi, z }. Sandbox check with zod 4.6.5: {"direct":true,"v4":true,"identical":true} (z from 'zod', 'zod/v4' and '@hono/zod-openapi' all expose .openapi and are the same object). zod.dev library-authors page: the "zod" root export "resolves to Zod 3 in 3.x versions and Zod 4 in 4.x versions".
  Implication: Shared schema packages can import z from @hono/zod-openapi (or from zod after the API package has loaded) without a second zod instance; do not import from zod/v3. Keep one zod version pinned across the monorepo so there is exactly one instance.

- OpenAPI 3.1 is produced by app.doc31(path, config) for a route and app.getOpenAPI31Document(config, generatorOptions) for build-time emission; basePath is folded into the document.
  Source: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-openapi/README.md (checked 2026-10-04, confidence high)
  Evidence: README: "app.doc31('/docs', { openapi: '3.1.0', info: { title: 'foo', version: '1' } }) // new endpoint" and "app.getOpenAPI31Document({ openapi: '3.1.0', info: {...} }, { unionPreferredType: 'oneOf' })". Source: getOpenAPI31Document uses OpenApiGeneratorV31 and "return this._basePath ? addBasePathToDocument(document, this._basePath) : document". Sandbox: new OpenAPIHono().basePath('/v1') produced paths ['/v1/cycles'], components ['Cycle','Problem'], and GET /v1/openapi.json returned 200 with openapi 3.1.0 via @hono/node-server 2.1.3. zod-to-openapi README: ".openapi('User')" registers "#/components/schemas/User"; "Starting from v8 (and zod v4) you can also use zod's .meta".
  Implication: Serve app.doc31('/openapi.json', ...) under the /v1 base and commit the output of getOpenAPI31Document to openapi/v1.json from a script; name schemas with .openapi('Name') so clients get named components.

- The spec can be emitted at build time with plain Node (type stripping is on by default), no tsx required, provided the API package uses erasable TypeScript syntax and explicit .ts import extensions.
  Source: https://nodejs.org/api/typescript.html (checked 2026-10-04, confidence high)
  Evidence: Node docs: type stripping "enabled by default since v23.6.0 and v22.18.0", stable (Stability 2) in "v25.2.0 and v24.12.0"; unsupported without transform: Enum declarations, namespaces with runtime code, parameter properties, decorators; "File extensions are mandatory" in imports; recommended tsconfig: erasableSyntaxOnly, verbatimModuleSyntax, rewriteRelativeImportExtensions, module nodenext. Sandbox (Node 22.22.0): `node scripts/emit-openapi.ts` wrote openapi/v1.json importing ../src/app.ts.
  Implication: With Node 24.21.0 LTS the gen script is `node packages/api/scripts/emit-openapi.ts`; keep the app module free of side effects (no DB connect at import) and avoid enums and path aliases in the API package, or fall back to `pnpm dlx tsx`.

- Scalar and Swagger UI both mount as one Hono route pointed at the spec URL; Scalar is the maintained choice (0.12.9, peer hono ^4.12.5).
  Source: https://scalar.com/products/api-references/integrations/hono (checked 2026-10-04, confidence medium)
  Evidence: Scalar docs: `import { Scalar } from '@scalar/hono-api-reference'` ... `app.get('/scalar', Scalar({ url: '/doc' }))`, and for Zod OpenAPI Hono "pass the configured URL to the Scalar middleware". npm view: @scalar/hono-api-reference 0.12.9, peerDependencies hono ^4.12.5; @hono/swagger-ui 0.6.1, peer hono >=4.0.0, usage `app.get('/ui', swaggerUI({ url: '/doc' }))`.
  Implication: Mount `app.get('/reference', Scalar({ url: '/v1/openapi.json' }))` on the OpenAPIHono instance; gate it to non-production or behind auth since the API is private.

- openapi-typescript 7.13.0 generates types from a local 3.1 JSON file and its --check flag fails CI when the committed types are stale; it declares peer typescript ^5.x.
  Source: https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/docs/cli.md (checked 2026-10-04, confidence high)
  Evidence: CLI docs: "npx openapi-typescript schema.yaml -o schema.ts"; flag table row "--check | false | Check that the generated types are up-to-date." Sandbox: generation printed "openapi/v1.json -> src/api.d.ts"; `--check` exit 0 when fresh and "Generated types are not up-to-date!" exit 1 after appending a comment. npm view: openapi-typescript 7.13.0 peerDependencies { typescript: '^5.x' }.
  Implication: Commit packages/api-client/src/schema.d.ts and run `openapi-typescript openapi/v1.json -o packages/api-client/src/schema.d.ts --check` in CI. The ^5.x peer range means a TypeScript 6 or 7 workspace will get a pnpm peer warning; confirm it still runs in the scaffold.

- openapi-fetch 0.17.0 forwards any native fetch option (including credentials) from createClient and per request, and supports middleware with onRequest/onResponse/onError.
  Source: https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/docs/openapi-fetch/api.md (checked 2026-10-04, confidence high)
  Evidence: API docs createClient options table: "(Fetch options) | Any valid fetch option (headers, mode, cache, signal ...)"; same row exists for per-request options; middleware registered with client.use() with callbacks onRequest, onResponse, onError; "onResponse() will be called in reverse order". Sandbox: `createClient<paths>({ baseUrl: '/', credentials: 'include', headers: {...} })` type-checked with tsc (strict, moduleResolution bundler) and a wrong path literal failed with TS2345.
  Implication: Cookie-based Better Auth sessions work with openapi-fetch by setting credentials: 'include' once in createClient; no bearer middleware is needed for first-party web.

- @hey-api/openapi-ts 0.99.0 (MIT) is a viable alternative that generates an SDK plus a bundled fetch client, but it is a larger generated surface than the project needs.
  Source: https://heyapi.dev/openapi-ts/get-started (checked 2026-10-04, confidence medium)
  Evidence: Docs: install "npm install @hey-api/openapi-ts -D -E", generate "npx @hey-api/openapi-ts -i hey-api/backend -o src/client", config `defineConfig({ input, output })`, clients "Fetch API, Angular, Axios, Next.js, Nuxt, and more"; fetch client docs: `client.setConfig({ baseUrl })` and "pass any Fetch API configuration option to setConfig()". npm view: @hey-api/openapi-ts 0.99.0, license MIT, peer typescript '>=5.5.3 || >=6.0.0 || 6.0.1-rc'; @hey-api/client-fetch deprecated: "Starting with v0.73.0, this package is bundled directly inside @hey-api/openapi-ts."
  Implication: Keep the memos' openapi-typescript + openapi-fetch choice (types only, zero generated runtime); revisit hey-api only if TypeScript 6/7 peer support becomes a blocker for openapi-typescript.

- oasdiff-action v0.1.18 (2026-10-01) provides a breaking sub-action that fails the job at a severity threshold, works against git refs with a one-commit fetch of the base branch, and oasdiff understands OpenAPI 3.1.
  Source: https://raw.githubusercontent.com/oasdiff/oasdiff-action/main/README.md (checked 2026-10-04, confidence high)
  Evidence: README workflow: `- run: git fetch --depth=1 origin ${{ github.base_ref }}` then `- uses: oasdiff/oasdiff-action/breaking@v0` with `base: 'origin/${{ github.base_ref }}:openapi.yaml'`, `revision: 'HEAD:openapi.yaml'`, `fail-on: WARN`, `github-token: ${{ github.token }}`; inputs: fail-on accepts ERR or WARN; note that fetch-depth: 0 is not required, fetching only the base branch is sufficient; posting the review link needs `pull-requests: write`. Tags page: v0.1.18 b9325c9, Oct 1, 2026 (v0 points at the same commit). oasdiff repo: "OpenAPI 3.1 and 3.2 support"; docs/BREAKING-CHANGES.md: "To exit with return code 1 if ERR-level changes are found, add the --fail-on ERR flag." Local run on the sandbox 3.1 spec: breaking revision exited 1 with [new-required-request-parameter] and [response-required-property-removed]; additive revision exited 0 ("No breaking changes to report, but the specs are different").
  Implication: Gate PRs with oasdiff breaking on openapi/v1.json at fail-on ERR (WARN once the API has external clients); it composes with the freshness check so the committed spec is both current and non-breaking.

- RFC 9457 defines application/problem+json with members type, status, title, detail, instance; type defaults to about:blank, status must equal the HTTP status, and extensions are permitted.
  Source: https://www.rfc-editor.org/rfc/rfc9457.html (checked 2026-10-04, confidence high)
  Evidence: RFC 9457: media type "application/problem+json"; "type": "A JSON string containing a URI reference that identifies the problem type"; when absent "its value is assumed to be 'about:blank'"; generators "MUST use the same status code in the actual HTTP response"; "Problem type definitions MAY extend the problem details object with additional members" and "Clients consuming problem details MUST ignore any such extensions that they don't recognize." Hono docs: `app.onError((err, c) => { if (err instanceof HTTPException) { return err.getResponse() } ... })`, `app.notFound`, and "HTTPException.getResponse is not aware of Context". Sandbox handler output: validation 422 application/problem+json with an errors extension built from Zod issues; HTTPException 401; thrown Error 500; unknown route 404; `c.json(body, 400, { 'Content-Type': 'application/problem+json' })` also overrides the content type.
  Implication: Use one problem() helper for onError, notFound and the OpenAPIHono defaultHook, declare a Problem schema in responses so the client types carry it, and keep type URIs under a stable https://tidefern.app/problems/* namespace.

- The IETF Idempotency-Key draft (07, 2025-10-15) has expired but remains the reference for header semantics: UUID keys, 400 when missing, 422 on payload mismatch, 409 while in flight, replay of the stored response; RFC 9110 confirms POST is not idempotent.
  Source: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header (checked 2026-10-04, confidence medium)
  Evidence: Draft: Idempotency-Key is "an Item Structured Header" whose "value MUST be a String"; "the idempotency key MUST be unique and MUST NOT be reused with another request with a different request payload"; recommends "a UUID or a similar random identifier"; server "SHOULD respond with the result of the previously completed operation" on a repeat, "SHOULD respond with a resource conflict error" on a concurrent retry; 400 when the header is missing, 422 when reusing a key with a different payload, 409 when retrying before completion. Datatracker: "This Internet-Draft is no longer active" (expired after 2026-04-18). RFC 9110 9.2.2: GET, HEAD, OPTIONS, TRACE, PUT, DELETE are idempotent; POST is not. Drizzle insert docs: `.onConflictDoNothing({ target })` and `.returning()`.
  Implication: Implement a (user_id, key) primary-keyed idempotency_keys table claimed with INSERT ... ON CONFLICT DO NOTHING RETURNING, store the request hash and final status/body, and expire rows after 24 hours via the outbox cron; cite the draft in the API docs with the note that it is expired.

- Current GitHub Actions releases are actions/checkout v7.0.1, actions/setup-node v7.0.0, actions/upload-artifact v7.0.1 and pnpm/action-setup v6.1.0; the pnpm/action-setup v6 moving tag still points at v6.0.10, which predates pnpm 12 support.
  Source: https://github.com/pnpm/action-setup/tags (checked 2026-10-04, confidence medium)
  Evidence: Tags pages (github.com HTML, API was blocked): actions/checkout "v7.0.1 3d3c42e, Jul 17, 2026" and "v7 3d3c42e"; actions/setup-node "v7.0.0 8207627, Jul 14, 2026" and "v7 8207627"; actions/upload-artifact "v7.0.1 043fb46, Apr 10, 2026" and "v7 043fb46"; pnpm/action-setup "v6.1.0 ea17c68, Sep 5, 2026", "v6.0.10 0977fd9, Aug 3, 2026", "v6 0977fd9, Aug 3, 2026". Release pages: checkout v7.0.1 full SHA 3d3c42e5aac5ba805825da76410c181273ba90b1; setup-node v7.0.0 820762786026740c76f36085b0efc47a31fe5020; upload-artifact v7.0.1 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a; action-setup v6.1.0 ea17c68df8912ef543352723c149a84f56e3d413 with notes "feat: support pnpm v12 by @zkochan in #288"; v6.0.10 notes reference pnpm v11.19.0 only. pnpm/action-setup README banner: "This action supports pnpm v12 and earlier" and "For pnpm v12, this input [standalone] has no effect because the plain pnpm package already installs a standalone native executable." Successor pnpm/setup v3.0.0 (fbda4c85fc2e1e08721cd8763afea8f48d60f024, Sep 20, 2026) "installs pnpm v11 and newer only" and can install Node and cache the store in one step.
  Implication: Pin pnpm/action-setup to the v6.1.0 SHA (not @v6) because the repo will declare packageManager pnpm@12.9.1; re-confirm all five SHAs with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` at build time since they were read from HTML pages. pnpm/setup@v3 is a reasonable later simplification but is two weeks old.

- GitHub's hardening guide recommends full-length SHA pins, least-privilege GITHUB_TOKEN, and the permissions key semantics zero out unspecified scopes.
  Source: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions (checked 2026-10-04, confidence high)
  Evidence: "Pinning an action to a full-length commit SHA is currently the only way to use an action as an immutable release." "It's good security practice to set the default permission for the GITHUB_TOKEN to read access only for repository contents." Workflow syntax reference: "If you specify the access for any of these permissions, all of those that are not specified are set to none." with shortcuts `permissions: read-all`, `write-all`, `{}`; job-level `jobs.<job_id>.permissions`. Concurrency docs: `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`, and an expression form such as `cancel-in-progress: ${{ !contains(github.ref, 'release/') }}` to avoid cancelling protected branches. Renovate github-actions manager: "Renovate will update the commit SHA according to the GitHub tag you specified" when the line carries a version comment, and "Actions pinned to a bare SHA without a version comment are disabled by default".
  Implication: Workflow-level `permissions: contents: read`, job-level `pull-requests: write` only for the oasdiff comment job, SHA pins with `# vX.Y.Z` comments so Renovate can bump them, and a concurrency group that cancels PR runs but not main.

- actions/setup-node v7 caches the pnpm store with cache: pnpm only if pnpm is installed first (pnpm/action-setup before setup-node); cache-dependency-path points at the root pnpm-lock.yaml in a monorepo.
  Source: https://raw.githubusercontent.com/actions/setup-node/main/docs/advanced-usage.md (checked 2026-10-04, confidence high)
  Evidence: Advanced usage example: `- uses: actions/checkout@v7`, `- uses: pnpm/action-setup@v6 with: version: 10`, `- uses: actions/setup-node@v7 with: node-version: '24' cache: 'pnpm'`, `- run: pnpm install`; "pnpm caching support requires pnpm version >= 6.10.0"; cache-dependency-path for a lock file at the project root. setup-node README: node-version-file supports "package.json, mise.toml, .nvmrc, .node-version, .tool-versions". pnpm/action-setup README: `version` is "Optional when there is a packageManager or devEngines.packageManager field in the package.json", and it has its own `cache: true` (store directory) and `cache_dependency_path` inputs.
  Implication: Order is checkout, pnpm/action-setup (version read from packageManager), setup-node with node-version-file: .node-version and cache: pnpm, then pnpm install --frozen-lockfile. Use only one of the two cache mechanisms.

- Playwright's CI guidance: install browsers with `npx playwright install --with-deps`, upload playwright-report as an artifact, optionally run inside mcr.microsoft.com/playwright:v1.63.0-noble with --user 1001, and do not cache browser binaries.
  Source: https://playwright.dev/docs/ci (checked 2026-10-04, confidence high)
  Evidence: Docs workflow: `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: lts/*`, `npm ci`, `npx playwright install --with-deps`, `npx playwright test`, `actions/upload-artifact@v5` uploading "playwright-report/" with retention-days 30. Container variant: `container: image: mcr.microsoft.com/playwright:v%%VERSION%%-noble  options: --user 1001`. "Caching browser binaries is not recommended, since the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries. Especially under Linux, operating system dependencies need to be installed, which are not cacheable." MCR tags list includes v1.63.0-noble (checked via https://mcr.microsoft.com/v2/playwright/tags/list).
  Implication: Run e2e on ubuntu-latest in the same job as unit tests with `playwright install --with-deps chromium` (one browser keeps it fast), skip browser caching, and upload playwright-report with if: ${{ !cancelled() }}. Playwright's doc pins are one major behind the actions' own READMEs; use the newer v7 lines.

- The documented Postgres service container block uses pg_isready health checks and a 5432:5432 port map for jobs on the runner; container jobs reach it by the service label instead of localhost.
  Source: https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers (checked 2026-10-04, confidence high)
  Evidence: Runner job YAML: `services: postgres: image: postgres  env: POSTGRES_PASSWORD: postgres  options: >- --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5  ports: - 5432:5432`, with the comment "Set health checks to wait until postgres has started". Container job variant sets `POSTGRES_HOST: postgres` because "Docker containers on the same user-defined bridge network expose all ports to each other". Docker Hub tags present today: 18, 18.6, 18-alpine, 18.6-alpine.
  Implication: Use image postgres:18 (matching the Postgres 18.6 line) with DATABASE_URL=postgres://postgres:postgres@localhost:5432/tidefern_test for Drizzle migrations and Vitest integration tests; if the job is ever moved into the Playwright container, switch the host to postgres.

- turbo run --affected equals --filter=...[main...HEAD], is overridable with TURBO_SCM_BASE/TURBO_SCM_HEAD, and treats every package as changed when the checkout is too shallow; Turborepo's GitHub Actions guide YAML is stale.
  Source: https://turborepo.dev/docs/reference/run (checked 2026-10-04, confidence high)
  Evidence: "By default, the flag is equivalent to --filter=...[main...HEAD]"; overrides `TURBO_SCM_BASE=development turbo run build --affected` and `TURBO_SCM_HEAD=your-branch ...`; "The comparison requires everything between base and head to exist in the checkout. If the checkout is too shallow, then all packages will be considered changed." --filter syntax: `--filter=ui`, `--filter=./apps/*`, `--filter=[HEAD^1]`, `--filter=!./apps/admin`. CI guide: "Filtering using source control changes is only possible when history is available on the machine." The GitHub Actions guide page still shows `actions/checkout@v4`, `pnpm/action-setup@v3 version: 8`, `actions/setup-node@v4 node-version: 20` and `fetch-depth: 2`. turborepo.com now 301-redirects to turborepo.dev.
  Implication: On pull_request use fetch-depth: 0 (the repo is small) and `--affected`; on push to main run the full graph because main...HEAD is empty there. Do not copy the versions from the Turborepo guide.

- Vercel skips unaffected monorepo projects by default for GitHub-connected pnpm workspaces, so turbo-ignore is only a fallback; when used, the setting is `npx turbo-ignore --fallback=HEAD^1`.
  Source: https://vercel.com/docs/monorepos (checked 2026-10-04, confidence high)
  Evidence: "Vercel automatically skips builds for projects in a monorepo that are unchanged by the commit. This setting does not occupy concurrent build slots, unlike the Ignored Build Step feature"; requirements: GitHub-connected, npm/yarn/pnpm/Bun workspaces, unique package names, internal dependencies declared in package.json. Changelog 2025-02-24: "New monorepo projects now skip builds with unchanged code by default". Turborepo page on Vercel: Ignored Build Step value `npx turbo-ignore --fallback=HEAD^1`, and for custom logic `turbo query affected --base=$VERCEL_GIT_PREVIOUS_SHA --packages <your-project-name> --exit-code`. turbo-ignore README: uses `turbo run build --dry` to decide whether "the given workspace, or any dependencies of the workspace, have changed since the previous commit".
  Implication: Leave the built-in "Skip deployment" toggle on for the web project and make the web package depend explicitly on every internal package it imports; add turbo-ignore only if the dashboard shows builds that should have been skipped.

- iurman/tidefern is currently a public repository, which makes rulesets, CodeQL default setup and push protection free, whereas a private personal repo would lose most of them.
  Source: https://docs.github.com/en/code-security/getting-started/github-security-features (checked 2026-10-04, confidence high)
  Evidence: GitHub API via the session's GitHub tool: full_name iurman/tidefern, created 2026-10-04T18:05:50Z, "private": false, "visibility": "public", default_branch main. Security features page, available for all repositories: "Repository rulesets", "Dependabot alerts and security updates", "Dependabot version updates", "Secret scanning alerts for partners", "Push protection for users" (public repos). CodeQL default setup page: available where the repository is "publicly visible, or GitHub Code Security is enabled", enabled via Settings, Advanced Security, CodeQL analysis, Set up, Default, Enable CodeQL. About secret scanning: for user-owned private repositories the feature needs GitHub Enterprise Cloud with Enterprise Managed Users or Enterprise Server; Advanced Security page: organizations "on a GitHub Team or GitHub Enterprise plan" can purchase Code Security or Secret Protection. GitHub plans page lists "Protected branches" for private repositories under GitHub Pro, not under Free. gitleaks-action v3 README: "If you are scanning repos that belong to a personal account, then no license key is required."
  Implication: If the repo stays public: enable CodeQL default setup, Secret Protection push protection and a main ruleset now, all free. If it goes private (plausible for a privacy product): rulesets and branch protection need GitHub Pro, CodeQL and push protection are unavailable to a personal account, and gitleaks-action is the free substitute. Either way the repo must never contain secrets or user data fixtures.

- Renovate: config:recommended plus helpers:pinGitHubActionDigests, group:allNonMajor, :maintainLockFilesWeekly and schedule:weekly cover a pnpm monorepo; automerge needs passing required checks, the repository's Allow auto-merge setting, and a ruleset requiring at least one status check.
  Source: https://docs.renovatebot.com/key-concepts/automerge/ (checked 2026-10-04, confidence high)
  Evidence: config:recommended extends ":dependencyDashboard", "group:monorepos", "group:recommended", "replacements:all", "workarounds:all" and others. helpers:pinGitHubActionDigests = packageRules [{ matchDepTypes: ["action","workflow"], pinDigests: true }]. group:allNonMajor groups minor and patch updates into one PR. :maintainLockFilesWeekly: "Run lock file maintenance (updates) early Monday mornings"; schedule:weekly extends schedule:earlyMondays ("* 0-3 * * 1"). Automerge docs: Renovate will not automerge until passing status checks are present; with GitHub platform automerge you must enable "Allow auto-merge" and require at least one status check; example packageRule `{ matchDepTypes: ["devDependencies"], matchUpdateTypes: ["minor","patch"], automerge: true }` and `lockFileMaintenance: { enabled: true, automerge: true }`. npm manager: lock file maintenance for pnpm-lock.yaml is "delegated to the underlying package manager CLI"; packageManager field is honoured via Corepack. Config file locations: renovate.json, .github/renovate.json, renovate.json5. GitHub auto-merge docs: "Auto-merge merges a pull request automatically after all required reviews and status checks pass"; enable under Settings, General, Pull Requests, "Allow auto-merge". Rulesets rules: "Require a pull request before merging", "Require status checks to pass", "Block force pushes" (on by default), "Restrict deletions", "Require linear history".
  Implication: Install the Mend Renovate app on the repo, commit renovate.json (snippet below), create a main branch ruleset requiring a PR and the `verify` status check, and turn on Allow auto-merge; Renovate then merges grouped minor/patch and weekly lockfile PRs only after CI is green.

- git grep can detect U+2014 in tracked files with pathspec exclusions and clean exit codes; the naive `-P '\x{2014}'` fails under git's default non-UTF PCRE mode, and `git diff --exit-code` plus `git status --porcelain` give a reliable generated-file freshness gate.
  Source: https://git-scm.com/docs/git-grep (checked 2026-10-04, confidence high)
  Evidence: Sandbox with git 2.43.0: `git grep -n -I -P '\x{2014}'` failed with "character code point value in \x{} or \o{} is too large"; both `git grep -n -I -P '(*UTF)\x{2014}' -- . ':!skills/**'` and `git grep -n -I -F -e "$(printf '\xe2\x80\x94')" -- . ':!skills/**'` matched docs/b.md and skipped skills/vendor/c.md with exit 0, and exit 1 when nothing matched. `git diff --exit-code --stat -- docs` exited 1 after a tracked file changed; `git status --porcelain` printed `?? docs/new.json` for an untracked generated file.
  Implication: Use the literal-bytes fixed-string form (portable across git builds), exclude vendored skill directories and pnpm-lock.yaml by pathspec, and gate generated outputs with a regenerate step followed by git diff --exit-code and an empty git status --porcelain on the generated paths.

### Recommendations

- (consequential) Define the API with OpenAPIHono().basePath('/v1'), createRoute + z from @hono/zod-openapi, serve app.doc31('/openapi.json') and Scalar at /v1/reference (non-production or authenticated), and emit the committed contract to openapi/v1.json with `node packages/api/scripts/emit-openapi.ts` wired into a turbo `gen` task.
  Why: Verified end to end today: peer ranges match the resolved versions, basePath is folded into emitted paths, Node 24 runs the TypeScript emit script natively, and the committed JSON is what oasdiff, openapi-typescript and reviewers diff.
  Rejected: Generating the spec at request time only (no committed artifact to diff or gate); hono-openapi or zod-to-openapi direct (more wiring for the same output); tsx as a hard dependency (unnecessary unless non-erasable syntax creeps in).

- (consequential) Generate client types with openapi-typescript 7.13.0 into packages/api-client/src/schema.d.ts (committed) and consume them with openapi-fetch 0.17.0 via one createClient({ baseUrl, credentials: 'include' }) wrapper; run `openapi-typescript ... --check` in CI.
  Why: Types-only generation keeps the runtime at a few hundred bytes, credentials pass through to fetch for cookie sessions, and --check gives a free staleness gate; all compiled and executed in the sandbox.
  Rejected: @hey-api/openapi-ts (good, MIT, but generates SDK functions and a client the project does not need); hand-written fetch wrappers (lose path and body typing).

- (consequential) Gate contract drift with two steps on pull requests: regenerate and `git diff --exit-code` on openapi/v1.json, tokens.css and schema.d.ts, then oasdiff-action/breaking (v0.1.18 SHA) comparing origin/<base>:openapi/v1.json to HEAD with fail-on ERR, raising to WARN once external clients exist.
  Why: The freshness check proves the spec reflects the code; oasdiff proves the change is compatible; a one-commit fetch of the base branch is all oasdiff needs, and the local run confirmed it catches removed required properties and new required parameters.
  Rejected: A plain committed-spec diff gate alone (fails on every additive change or catches nothing); openapi-diff Java tools (heavier, no maintained action); Pro oasdiff approval gating (not needed for a solo developer).

- (consequential) Return RFC 9457 problem details from a single problem() helper used by app.onError, app.notFound and the OpenAPIHono defaultHook (422 with an `errors` extension built from Zod issues), declare a Problem schema in route responses, and implement Idempotency-Key for POST creates with a (user_id, key) Postgres table claimed via INSERT ... ON CONFLICT DO NOTHING RETURNING, request hash comparison (422), in-flight detection (409) and stored-response replay.
  Why: RFC 9457 is the current standard and the handler was executed against validation, auth, crash and 404 paths; the idempotency rules follow the IETF draft and RFC 9110 and fit the existing Postgres + Drizzle stack without new infrastructure.
  Rejected: Ad hoc { error: string } bodies (untyped, no status discipline); Redis-backed idempotency (extra service for two users); client-side dedupe only (does not survive retries after network failure).

- (consequential) Ship one ci.yml with a single `verify` job (checkout fetch-depth 0, pnpm/action-setup v6.1.0 SHA, setup-node v7 with cache: pnpm, frozen install, em dash check, generated-file freshness, turbo lint/typecheck/test with --affected on PRs only, build, Playwright chromium with --with-deps, report artifact) plus a PR-only `api-contract` job for oasdiff; workflow permissions contents: read, SHA pins with version comments, concurrency that cancels PR runs but not main, a postgres:18 service container, no matrix.
  Why: Every action version and SHA was resolved today, the pin and permission practices come from GitHub's hardening guide, Playwright advises against browser caching, and the single job keeps the 2,000 free minutes per month (Free) or 3,000 (Pro) comfortable for a solo developer.
  Rejected: pnpm/setup@v3 single-step action (promising but released 2026-09-20); Playwright container job (forces service hostname changes and a second job); actions/cache for browsers (explicitly discouraged by Playwright); moving tags like @v6 (pnpm/action-setup's v6 lags v6.1.0 and lacks pnpm 12 support).

- (advisory) On Vercel, keep the built-in "Skip deployment" for unaffected monorepo projects enabled and do not configure turbo-ignore unless the built-in requirements are unmet; declare every internal dependency in apps/web/package.json.
  Why: Vercel enables this by default for new GitHub-connected pnpm workspace projects, it does not consume build slots, and turbo-ignore remains available as `npx turbo-ignore --fallback=HEAD^1` if needed.
  Rejected: Custom Ignored Build Step scripts (count against concurrent build limits and duplicate the built-in logic).

- (advisory) Repository automation: commit renovate.json (config:recommended, helpers:pinGitHubActionDigests, group:allNonMajor, :maintainLockFilesWeekly, schedule:weekly, timezone America/Los_Angeles, automerge for minor/patch/digest/lockfile), install the Mend Renovate app, create a main ruleset (require PR with 0 approvals, require the `verify` status check, block force pushes, restrict deletions, linear history), enable Allow auto-merge, and, while the repo is public, enable CodeQL default setup and Secret Protection push protection in Settings, Advanced Security.
  Why: Renovate's automerge is safe only behind required checks, GitHub's auto-merge needs the repository setting and a ruleset, and CodeQL default setup plus push protection are free on public repositories; everything is configuration, not code.
  Rejected: Dependabot version updates (no lockfile maintenance, weaker grouping for pnpm monorepos); a codeql-action workflow (default setup is simpler and managed); gitleaks-action (keep as the fallback if the repo becomes private, where it stays free for personal accounts).

- (advisory) Add the em dash guard as a git grep step using literal UTF-8 bytes with pathspec exclusions for vendored skill directories and pnpm-lock.yaml, and keep it in the same `verify` job as the generated-file freshness check.
  Why: The fixed-string form works on git's default PCRE build where `\x{2014}` fails, returns exit 1 on no match so the step only fails on a hit, and runs in well under a second.
  Rejected: GNU grep -P over git ls-files (needs a UTF-8 locale set explicitly on the runner); an ESLint or Prettier rule (does not cover Markdown and YAML).

### Verified snippets

#### Complete ci.yml skeleton: install, em dash guard, generated-file freshness, lint/typecheck/unit, build, Playwright, report upload, Postgres service, and a PR-only oasdiff breaking-change job. SHAs resolved 2026-10-04 from github.com release and tag pages; re-confirm with gh api before committing and let Renovate maintain them.

Source: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

```
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

env:
  TURBO_TELEMETRY_DISABLED: '1'
  NEXT_TELEMETRY_DISABLED: '1'
  CI: 'true'

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 25
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: tidefern_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/tidefern_test
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0 # turbo --affected needs main...HEAD history

      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0 (first release with pnpm 12 support; version read from packageManager)

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Fail on em dashes (U+2014) outside vendored skills
        run: |
          set -euo pipefail
          EM="$(printf '\xe2\x80\x94')"
          if git grep -n -I -F -e "$EM" -- . ':!skills/**' ':!.claude/skills/**' ':!pnpm-lock.yaml'; then
            echo "::error::Em dash (U+2014) found in tracked files. Use a comma, colon, period or parentheses."
            exit 1
          fi

      - name: Regenerate derived files and verify they are committed
        run: |
          set -euo pipefail
          pnpm exec turbo run gen
          git diff --exit-code -- packages/tokens/tokens.css openapi/v1.json packages/api-client/src/schema.d.ts
          test -z "$(git status --porcelain -- packages/tokens openapi packages/api-client)"
          pnpm exec openapi-typescript openapi/v1.json -o packages/api-client/src/schema.d.ts --check

      - name: Lint, typecheck, unit and integration tests
        run: pnpm exec turbo run lint typecheck test ${{ github.event_name == 'pull_request' && '--affected' || '' }}

      - name: Build
        run: pnpm exec turbo run build

      - name: Install Playwright browser
        run: pnpm --filter @tidefern/web exec playwright install --with-deps chromium

      - name: End-to-end tests
        run: pnpm exec turbo run e2e ${{ github.event_name == 'pull_request' && '--affected' || '' }}

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          if-no-files-found: ignore
          retention-days: 14

  api-contract:
    name: api-contract
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: write # lets oasdiff post the review link as a PR comment
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - run: git fetch --depth=1 origin ${{ github.base_ref }}
      - uses: oasdiff/oasdiff-action/breaking@b9325c9e0a27ab65b0da3b766522cedec6be81dc # v0.1.18
        with:
          base: 'origin/${{ github.base_ref }}:openapi/v1.json'
          revision: 'HEAD:openapi/v1.json'
          fail-on: ERR
          github-token: ${{ github.token }}
```

#### Postgres service container block for a job running on the runner (localhost:5432). If the job moves inside a container, drop the ports map and use host `postgres`.

Source: https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers

```
services:
  postgres:
    image: postgres:18
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: tidefern_test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 5432:5432
```

#### Em dash guard step (verified with git 2.43: exit 0 on a hit, 1 on none; the \x{2014} PCRE form fails on git's default non-UTF mode, so literal bytes are used).

Source: https://git-scm.com/docs/git-grep

```
- name: Fail on em dashes (U+2014) outside vendored skills
  run: |
    set -euo pipefail
    EM="$(printf '\xe2\x80\x94')"
    if git grep -n -I -F -e "$EM" -- . ':!skills/**' ':!.claude/skills/**' ':!pnpm-lock.yaml'; then
      echo "::error::Em dash (U+2014) found in tracked files. Use a comma, colon, period or parentheses."
      exit 1
    fi
```

#### oasdiff breaking-change gate on pull requests against the committed spec (git ref form, one-commit fetch of the base branch).

Source: https://raw.githubusercontent.com/oasdiff/oasdiff-action/main/README.md

```
permissions:
  contents: read
  pull-requests: write
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - run: git fetch --depth=1 origin ${{ github.base_ref }}
  - uses: oasdiff/oasdiff-action/breaking@b9325c9e0a27ab65b0da3b766522cedec6be81dc # v0.1.18
    with:
      base: 'origin/${{ github.base_ref }}:openapi/v1.json'
      revision: 'HEAD:openapi/v1.json'
      fail-on: ERR
      github-token: ${{ github.token }}
```

#### OpenAPI 3.1 emit script (packages/api/scripts/emit-openapi.ts), executed in the sandbox with plain `node` type stripping; wire as the API package's `gen` script.

Source: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-openapi/README.md

```
// packages/api/scripts/emit-openapi.ts
// run: node packages/api/scripts/emit-openapi.ts  (Node 22.18+/24: type stripping is on by default)
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { app } from '../src/app.ts' // must be side-effect free: no DB connection at import time

const doc = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: 'Tidefern API', version: '1.0.0' },
  servers: [{ url: '/' }],
})

const out = fileURLToPath(new URL('../../../openapi/v1.json', import.meta.url))
mkdirSync(fileURLToPath(new URL('../../../openapi/', import.meta.url)), { recursive: true })
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
console.log(`wrote ${out}: ${Object.keys(doc.paths ?? {}).length} paths`)
```

#### Minimal OpenAPIHono app shape with basePath /v1, a registered component, the 3.1 doc route and Scalar reference (route handler and schemas verified; Scalar mount from Scalar's Hono docs).

Source: https://scalar.com/products/api-references/integrations/hono

```
// packages/api/src/app.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'

export const Problem = z.object({
  type: z.string().openapi({ example: 'about:blank' }),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
}).openapi('Problem')

const Cycle = z.object({
  id: z.uuid(),
  startedOn: z.iso.date().openapi({ example: '2026-10-01' }),
}).openapi('Cycle')

const listCycles = createRoute({
  method: 'get', path: '/cycles', operationId: 'listCycles',
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ items: z.array(Cycle) }) } } },
    401: { description: 'Unauthorized', content: { 'application/problem+json': { schema: Problem } } },
  },
})

export const app = new OpenAPIHono().basePath('/v1')
app.openapi(listCycles, (c) => c.json({ items: [] }, 200))
app.doc31('/openapi.json', { openapi: '3.1.0', info: { title: 'Tidefern API', version: '1.0.0' } })
if (process.env.NODE_ENV !== 'production') app.get('/reference', Scalar({ url: '/v1/openapi.json' }))
```

#### Client generation commands and the typed openapi-fetch wrapper with credentials: "include" (compiled with tsc strict in the sandbox; a wrong path literal fails typechecking).

Source: https://openapi-ts.dev/openapi-fetch/api

```
# generate (commit the output) and check in CI
pnpm add -D openapi-typescript@7.13.0
pnpm add openapi-fetch@0.17.0
pnpm exec openapi-typescript openapi/v1.json -o packages/api-client/src/schema.d.ts
pnpm exec openapi-typescript openapi/v1.json -o packages/api-client/src/schema.d.ts --check

// packages/api-client/src/client.ts
import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

const problemLogger: Middleware = {
  async onResponse({ response }) {
    if (!response.ok && response.headers.get('content-type')?.includes('application/problem+json')) {
      // body stays available to the caller via `error`; hook metrics or logging here
    }
    return response
  },
}

export const api = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/',
  credentials: 'include', // Better Auth cookie session; any native fetch option passes through
  headers: { Accept: 'application/json, application/problem+json' },
})
api.use(problemLogger)

export async function listCycles() {
  const { data, error, response } = await api.GET('/v1/cycles')
  return { data, error, status: response.status }
}
```

#### RFC 9457 problem() helper plus Hono onError, notFound and OpenAPIHono defaultHook (executed: 422 validation with errors extension, 401 from HTTPException, 500 from a thrown Error, 404 unknown route, all application/problem+json).

Source: https://www.rfc-editor.org/rfc/rfc9457.html

```
import { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

type Problem = { type: string; title: string; status: number; detail?: string; instance?: string; [k: string]: unknown }
const titles: Record<number, string> = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Content', 500: 'Internal Server Error' }

export function problem(c: Context, status: ContentfulStatusCode, p: Partial<Problem> = {}) {
  const body: Problem = { type: p.type ?? 'about:blank', title: p.title ?? titles[status] ?? 'Error', status, instance: c.req.path, ...p }
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' })
}

export const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return problem(c, 422, {
        type: 'https://tidefern.app/problems/validation',
        title: 'Validation failed',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      })
    }
  },
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const res = err.getResponse()
    return problem(c, res.status as ContentfulStatusCode, { detail: err.message || undefined })
  }
  console.error(err) // never echo err.message to clients on 500
  return problem(c, 500, { detail: 'Unexpected error' })
})
app.notFound((c) => problem(c, 404))
```

#### Idempotency-Key pattern for POST creates: Drizzle table plus Hono middleware. Follows draft-ietf-httpapi-idempotency-key-header-07 (400 missing, 422 payload mismatch, 409 in flight, replay stored response). Pattern is grounded in docs but was not executed against a database.

Source: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header

```
// packages/db/src/schema/idempotency.ts
import { pgTable, text, uuid, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core'
export const idempotencyKeys = pgTable('idempotency_keys', {
  userId: uuid('user_id').notNull(),
  key: text('key').notNull(),            // client-supplied, UUID recommended, max 255
  requestHash: text('request_hash').notNull(), // sha256(method + path + body)
  responseStatus: integer('response_status'),  // null while the first request is in flight
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })])
// cleanup: DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours' (outbox/cron job)

// packages/api/src/middleware/idempotent.ts
import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { db } from '@tidefern/db'
import { idempotencyKeys } from '@tidefern/db/schema'
import { problem } from '../problem.ts'

export const idempotent = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
  const key = c.req.header('Idempotency-Key')
  if (!key || key.length > 255) return problem(c, 400, { detail: 'Idempotency-Key header is required for this operation' })
  const userId = c.get('userId')
  const raw = await c.req.raw.clone().text()
  const requestHash = createHash('sha256').update(`${c.req.method} ${c.req.path}\n${raw}`).digest('hex')
  const where = and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key))

  const claimed = await db.insert(idempotencyKeys).values({ userId, key, requestHash })
    .onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.key] })
    .returning({ key: idempotencyKeys.key })

  if (claimed.length === 0) {
    const [row] = await db.select().from(idempotencyKeys).where(where)
    if (!row) return problem(c, 500)
    if (row.requestHash !== requestHash) return problem(c, 422, { detail: 'Idempotency-Key was already used with a different request payload' })
    if (row.responseStatus === null) return problem(c, 409, { detail: 'A request with this Idempotency-Key is still being processed' })
    return c.body(JSON.stringify(row.responseBody), row.responseStatus as ContentfulStatusCode, { 'Content-Type': 'application/json' })
  }

  try {
    await next()
  } catch (err) {
    await db.delete(idempotencyKeys).where(where) // release the key so the client can retry
    throw err
  }
  const body = await c.res.clone().json().catch(() => null)
  await db.update(idempotencyKeys).set({ responseStatus: c.res.status, responseBody: body }).where(where)
})
```

#### renovate.json for the pnpm monorepo: grouped weekly non-major updates, weekly lockfile maintenance, GitHub Actions digest pinning, automerge behind the required `verify` check.

Source: https://docs.renovatebot.com/presets-helpers/

```
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "helpers:pinGitHubActionDigests",
    "group:allNonMajor",
    ":maintainLockFilesWeekly",
    "schedule:weekly",
    ":semanticCommits"
  ],
  "timezone": "America/Los_Angeles",
  "platformAutomerge": true,
  "lockFileMaintenance": { "enabled": true, "automerge": true },
  "packageRules": [
    { "matchUpdateTypes": ["minor", "patch"], "automerge": true },
    { "matchDepTypes": ["action", "workflow"], "matchUpdateTypes": ["digest", "minor", "patch"], "automerge": true },
    { "matchUpdateTypes": ["major"], "automerge": false }
  ]
}
```

#### Turborepo tasks the ci.yml assumes (turbo.json excerpt): gen produces committed artifacts so it has no cache outputs beyond the files themselves.

Source: https://turborepo.dev/docs/reference/run

```
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "gen": { "cache": false },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "env": ["DATABASE_URL"] },
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "e2e": { "dependsOn": ["build"], "cache": false, "env": ["DATABASE_URL"] }
  }
}
```

### Open questions

- iurman/tidefern is public today. Is that intentional for a privacy-sensitive product? It makes rulesets, CodeQL default setup and push protection free, but if it becomes private under a personal account, branch protection and rulesets need GitHub Pro and CodeQL and push protection are unavailable (fall back to gitleaks-action, free for personal accounts).
- openapi-typescript 7.13.0 declares peerDependencies typescript ^5.x while the toolchain memo may pick TypeScript 6.0.3 or 7.0.2; pnpm will warn rather than fail, but confirm generation still works in the scaffold. @hey-api/openapi-ts already accepts TS 6.
- Action SHAs were read from github.com release and tag pages because api.github.com, gh and the GitHub MCP tool were blocked for non-session repos; re-run `gh api repos/actions/checkout/git/ref/tags/v7.0.1` (and the other four) before committing ci.yml.
- pnpm/action-setup's v6 moving tag still points at v6.0.10 (no pnpm 12 support) while v6.1.0 adds it; verify with `git ls-remote https://github.com/pnpm/action-setup v6 v6.1.0` and decide whether to adopt pnpm/setup@v3 (single step, pnpm 11+ only, released 2026-09-20) later.
- The emit script relies on Node type stripping; if the API package uses enums, parameter properties, decorators or tsconfig path aliases, switch the gen script to `pnpm dlx tsx` or restructure.
- The em dash exclusions assume vendored skills live under skills/ or .claude/skills/; adjust the pathspecs to the real directories.
- @hono/zod-openapi emits the 3.0-style `example` keyword inside 3.1 schemas; Scalar, oasdiff and openapi-typescript accepted it today, but `.openapi({ examples: [...] })` is the 3.1-native form if a validator complains.
- turbo --affected on push to main compares main...HEAD and selects nothing; the skeleton runs the full graph on main for that reason. Confirm Vitest integration tests only connect to DATABASE_URL (the CI Postgres is 18; Neon's default major should match or migrations should be tested on both).
- Whether Playwright e2e should run against `next start` locally in CI (assumed) or against the Vercel preview URL; the latter needs the deployment-status event and a bypass token.
- Renovate platformAutomerge needs the main ruleset to require at least one status check named exactly `verify`; the job name in ci.yml and the ruleset entry must match.

### Sources that could not be read

- api.github.com, gh CLI and the GitHub MCP release tools for actions/checkout, actions/setup-node, pnpm/action-setup, actions/upload-artifact, oasdiff/oasdiff-action, github/codeql-action (session restricted to iurman repositories); release tags and SHAs were taken from github.com release and tag pages rendered through the fetch tool instead.
- https://raw.githubusercontent.com/oasdiff/oasdiff/{main,master}/README.md returned 404; used the repository HTML page and docs/BREAKING-CHANGES.md.
- Turborepo raw mdx sources under vercel/turborepo docs/site returned 404; used the rendered turborepo.dev pages (the old turborepo.com URLs now 301 to turborepo.dev).
- GitHub docs pages about-protected-branches and about-rulesets did not expose a plan-availability sentence through the fetch tool; plan gating was taken from githubs-plans and github-security-features pages.
- openapi-fetch docs contain no explicit credentials: 'include' example; behaviour was confirmed by the 'any valid fetch option' passthrough statement and by compiling the client.
- heyapi.dev configuration page did not yield a full plugin example through the fetch tool; only input/output config and the fetch client setConfig usage were captured.
- Dependabot alerts page availability statement was not extractable; availability for all repositories was taken from the GitHub security features overview.
- mcr.microsoft.com manifest endpoint returned 404 for a direct manifest check; the tags list endpoint confirmed v1.63.0-noble exists.

## sound-darkmode

<a id="sound-darkmode"></a>

Dimension: Interface sound and haptics, and dark mode design

### Summary

Web Audio for UI sounds is well supported but gated by sticky user activation in Chrome (Web Audio covered by autoplay since Chrome 71), Safari (contexts suspended until resume() in a user action since Safari 14.1 / iOS 14.5) and Firefox (AudioContext blocked until the document is activated by a user gesture, fixed in Firefox 62). The activation-triggering events per the HTML standard are keydown (not Escape), mousedown, pointerdown only for mouse, pointerup for non-mouse pointers, and touchend, so an unlock that listens only to pointerdown fails on touch screens. The spec forbids exponential ramps to zero, so envelopes should ramp to a tiny positive floor and finish with setTargetAtTime; a hand-rolled TypeScript module built this way type-checked under TypeScript 6.0.3 and ran in headless Chromium with the context running after one click (baseLatency 0.010 s with latencyHint interactive) and peaks between -20 and -33 dBFS. On iOS, Web Audio plays in the ambient audio session and is muted by the Ring/Silent switch, which matches Apple HIG for sound effects, so do not set navigator.audioSession.type to playback for UI sounds. Haptics on the web are navigator.vibrate on Chromium Android browsers only (user gesture required since Chrome 60, removed from Firefox desktop 129, no Safari), and the sole iOS web path is Safari 17.4's input type=checkbox switch, whose haptic WebKit plays only during a trusted user gesture via UIImpactFeedbackGenerator Light. WCAG 1.4.2 applies only to audio that plays automatically for more than 3 seconds, and no media query expresses a sound preference, so a persistent in-app mute is the accessibility control; I recommend action sounds on by default (hover sounds off), a visible mute, and a localStorage preference disclosed as functional storage, which the ICO and WP29 guidance treat as strictly necessary when the user sets it explicitly. For dark mode, Apple and Material both say avoid pure black, raise elevated surfaces with lighter tones, desaturate accents, and meet at least 4.5:1; the measured token set (base #0F1A17 through highest #2A4039, Mist text, #8FC1B9 and #DDA58E accents) passes AA for body text, large text and non-text UI on every surface, while the light set needs #3F736C instead of Sea Glass and #9E5F48 instead of Clay for text. Theme should default to system with a persisted three-way override, resolved by an inline before-paint script that sets data-theme and color-scheme, plus two theme-color metas with media attributes (Chrome Android uses them, Safari 26 only in installed web apps, Firefox ignores them).

### Findings

- Chrome's autoplay policy covers the Web Audio API: an AudioContext created before a user gesture starts suspended and must be resumed after the gesture.
  Source: https://developer.chrome.com/blog/autoplay/ (checked 2026-10-04, confidence high)
  Evidence: "The Web Audio API has been covered by autoplay since Chrome 71." If the context is created before user interaction "it will be created in the 'suspended' state, and you will need to call resume() after the user gesture." Detection: "check AudioContext.state after you've created it. If playing is allowed, it should immediately switch to running. Otherwise it will be suspended." The Chromium project page adds: "call context.resume() after the first user gesture (e.g. a click, or tap)" and that enforcement for Web Audio launched in M70/M71 (https://www.chromium.org/audio-video/autoplay/).
  Implication: Create or resume the single AudioContext inside a gesture handler and treat state === 'running' as the readiness signal; never schedule sounds before that.

- Safari suspends new AudioContexts until resume() is called from a user action, and iOS Safari adds a non-standard 'interrupted' state when the page is backgrounded.
  Source: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state (checked 2026-10-04, confidence high)
  Evidence: MDN browser-compat-data 8.1.4 (api.AudioContext.AudioContext, safari 14.1 and safari_ios 14.5): "New audio contexts are suspended until the resume() method is called via user action, such as the click event." MDN state page lists "interrupted: The audio context has been interrupted by an occurrence outside the control of the web app" and notes "In iOS Safari, when a user leaves the page (e.g., switches tabs, minimizes the browser, or turns off the screen) the audio context's state changes to 'interrupted' and needs to be resumed."
  Implication: The unlock helper must handle both 'suspended' and 'interrupted' by calling resume() on the next gesture; playSound() should silently no-op when the state is not 'running'.

- Firefox blocks AudioContext from starting until the document has been activated by a user gesture (shipped in Firefox 62); Firefox ignores latencyHint.
  Source: https://bugzilla.mozilla.org/show_bug.cgi?id=1413098 (checked 2026-10-04, confidence high)
  Evidence: Bug 1413098 "Should also block web audio when the pref 'media.autoplay.enabled=false'", RESOLVED FIXED, target milestone mozilla62: AudioContext may start when "its document has been activated by user gesture" or "it's a offline audio context"; "all resume promises would be pending until audio context has been allowed and user calls resume() again." BCD 8.1.4 api.AudioContext.AudioContext.options_latencyHint_parameter: firefox version_added false (Chrome 58, Safari 14.1).
  Implication: Same gesture-first pattern works in Firefox; do not rely on latencyHint for Firefox latency, and do not await resume() in a way that blocks UI when the promise stays pending.

- The Web Audio spec ties the suspended-to-running transition to sticky activation, and the HTML standard defines exactly which input events grant it: pointerdown counts only for mouse, touch needs pointerup or touchend, Escape never counts.
  Source: https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation (checked 2026-10-04, confidence high)
  Evidence: Web Audio API spec: "An AudioContext is said to be allowed to start if the user agent allows the context state to transition from suspended to running. A user agent may disallow this initial transition, and to allow it only when the AudioContext's relevant global object has sticky activation." HTML standard: an activation triggering input event is "any event whose isTrusted attribute is true and whose type is one of: keydown (provided the key is neither the Esc key nor a shortcut key reserved by the user agent); mousedown; pointerdown (provided the event's pointerType is mouse); pointerup (provided the event's pointerType is not mouse); or touchend." MDN's user activation page lists "Autoplay of Media and Web Audio APIs (in particular for AudioContexts)" and "Navigator.vibrate()" under APIs requiring sticky activation (https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation).
  Implication: The unlock listener must register pointerdown, pointerup, touchend, keydown and click (capture, passive) and skip Escape; a pointerdown-only unlock will never fire on phones.

- latencyHint 'interactive' is the default and asks for the lowest glitch-free latency; measured baseLatency in headless Chromium was 0.010 s.
  Source: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext (checked 2026-10-04, confidence high)
  Evidence: MDN: "interactive (default value): The audio is involved in interactive elements, such as responding to user actions ... The browser selects the lowest possible latency that doesn't cause glitches in the audio. This is likely to require increased power consumption." Spec enum text: "Provide the lowest audio output latency possible without glitching. This is the default." Local run of the verified module in Chromium (Playwright 1.63.0) after one click: {state: running, baseLatency 0.01, outputLatency 0.032, sampleRate 44100}.
  Implication: Pass latencyHint: 'interactive' explicitly for clarity; UI sounds will land within roughly 10 to 40 ms of the gesture, well under perceptual thresholds for click feedback.

- Exponential ramps cannot start or end at zero; the spec says to use setTargetAtTime for decays, and MDN quantifies that 3 time constants reach 95 percent of the target.
  Source: https://webaudio.github.io/web-audio-api/#dom-audioparam-exponentialramptovalueattime (checked 2026-10-04, confidence high)
  Evidence: Spec: "If V0 and V1 have opposite signs or if V0 is zero, then v(t) = V0 ... This also implies an exponential ramp to 0 is not possible. A good approximation can be achieved using setTargetAtTime() with an appropriately chosen time constant." MDN exponentialRampToValueAtTime: "an invalid or illegal string error is thrown if 0 is used; the value needs to be positive." MDN setTargetAtTime: "useful for decay or release portions of ADSR envelopes" and "getting 95% toward the target value may already be enough; in that case, you could set timeConstant to one third of the desired duration." (https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)
  Implication: Envelope pattern: setValueAtTime(0.0001), exponentialRampToValueAtTime(peak, t+attack), setTargetAtTime(0.0001, t+attack, decay/3), stop the oscillator after attack + 2*decay. This is what the verified module does and it produced no NaN samples and no pops in offline rendering.

- Hand-rolled synthesis beats sample decoding for this use: the verified module produced four distinct sounds with peaks between -20.8 and -32.5 dBFS and durations of 44 to 312 ms, with zero network requests; use-sound (MIT) is the main file-based alternative but drags in howler.
  Source: https://github.com/joshwcomeau/use-sound (checked 2026-10-04, confidence high)
  Evidence: Offline render in Chromium of the module with master gain 0.2: tick peak 0.0694 (-23.2 dBFS, 76 ms audible), hover 0.0238 (-32.5 dBFS, 44 ms), drop 0.0916 (-20.8 dBFS, 237 ms), error 0.0536 (-25.4 dBFS, 312 ms), nan 0. npm view today: use-sound 5.0.0 (MIT, peer react >=16.8, depends on howler ^2.2.4; howler 2.2.4 last published 2023-09-19). use-sound README: "<1kb bytes (gzip) in your bundle! ~10kb loaded async", options volume, playbackRate, interrupt, soundEnabled, sprite; "browsers don't allow websites to produce sound until the user has interacted with them".
  Implication: Ship the hand-rolled Web Audio module (no dependency, no audio assets, no CDN, consistent with the privacy posture); reserve use-sound only if the owner later commissions recorded samples.

- On iOS, Web Audio output is on the ambient session and is muted by the Ring/Silent switch; Apple HIG says that is the expected behavior for sound effects, so UI sounds should not opt into 'playback'.
  Source: https://bugs.webkit.org/show_bug.cgi?id=237322 (checked 2026-10-04, confidence high)
  Evidence: WebKit bug 237322 "webaudio api is muted when the iOS ringer is muted": media elements use the media channel while Web Audio is on the ringer channel; a 2024 comment: "Since iOS 17, you can set the audio session type to 'playback'. Add ... navigator.audioSession.type = "playback" and audio will not be suspended" because "by default the session type is ambient". Apple HIG Playing audio: "When a device is in silent mode, it plays only the audio that people explicitly initiate ... they also want to silence nonessential sounds, such as keyboard clicks, sound effects, game soundtracks, and other audible feedback." and "the system volume always governs the final output." BCD: navigator.audioSession Safari 16.4+, Firefox preview only, no Chromium. Audio Session API is an Editor's Draft (13 November 2024) at https://w3c.github.io/audio-session/.
  Implication: Leave the audio session type alone (ambient by default on iOS) so the silent switch mutes Tidefern's ticks; document this as intended behavior so it is not filed as a bug.

- Vibration API support: Chromium-based Android browsers yes (gesture required), Safari no on every platform, Firefox desktop removed in 129, Firefox Android reports success but never vibrates; caniuse global support 79.28 percent.
  Source: https://caniuse.com/vibration (checked 2026-10-04, confidence high)
  Evidence: caniuse features-json/vibration.json today: usage_perc_y 79.28, status rec; chrome 154 y, and_chr 154 y, samsung 19.0 y, edge 154 y, safari 26.6 through TP n, ios_saf 26.6 through 27.2 n, firefox 159/160 n, and_ff 157 n. BCD 8.1.4 api.Navigator.vibrate: chrome_android "Beginning in Chrome 60, this method requires a user gesture. Otherwise it returns false"; firefox version_added 16, version_removed 129; firefox_android partial: "navigator.vibrate() returns true, but no vibration takes place (regardless of hardware support)"; safari and safari_ios version_added false. MDN vibrate page: "Sticky user activation is required." Pattern semantics: "Each value indicates a number of milliseconds to vibrate or pause, in alternation."
  Implication: Treat navigator.vibrate as a progressive enhancement for Android only; call it inside the gesture handler, keep pulses short (4 to 20 ms), and never gate UX on its return value.

- The only iOS web haptic is Safari 17.4's switch control: WebKit plays a light impact haptic when a switch toggles, and only during a trusted user gesture, which is what the ios-haptics package (MIT) exploits with a label overlay.
  Source: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/CheckboxInputType.cpp (checked 2026-10-04, confidence high)
  Evidence: Safari 17.4 release notes: "Added support for <input type="checkbox" switch>. (119378678)". WebKit CheckboxInputType.cpp: "if (!RenderTheme::singleton().hasSwitchHapticFeedback(trigger)) return; if (trigger == SwitchTrigger::Click && !UserGestureIndicator::processingUserGesture()) return; ... page->chrome().client().performSwitchHapticFeedback();" RenderTheme.h default: "virtual bool hasSwitchHapticFeedback(SwitchTrigger) const { return false; }". PageClientImplIOS.mm: "performSwitchHapticFeedback() { ... [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight] ... impactOccurred]". BCD html.elements.input.switch: safari 17.4, safari_ios 17.4, all others false. ios-haptics 3.2.0 README: "this uses the <input type="checkbox" switch /> (introduced in safari 17.4), which has haptic feedback when toggled ... renders a transparent <label> on top of your element, wired to a hidden switch ... the label forwards the tap to the switch as a trusted click".
  Implication: iOS haptics are possible only for direct taps via a label overlay, cannot be patterned reliably, and are Safari-only; treat as optional polish (ios-haptics, MIT, 3.2.0) after launch, not as a core feature. Apple HIG also says "Make haptics optional" and "Avoid overusing haptics".

- WCAG 2.2 SC 1.4.2 Audio Control (Level A) applies only to audio that plays automatically for more than 3 seconds; sub-3-second UI sounds triggered by the user are outside it, but G171 and SC 1.3.3 still argue for user control and for never relying on sound alone.
  Source: https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html (checked 2026-10-04, confidence high)
  Evidence: SC 1.4.2: "If any audio on a web page plays automatically for more than 3 seconds, either a mechanism is available to pause or stop the audio, or a mechanism is available to control audio volume independently from the overall system volume level." Sufficient technique G60: "The sound plays for 3 or less seconds and stops automatically." G171 "Playing sounds only on user request": "Someone that uses a screen reader may find it very distracting and difficult to listen to their screen reader if there are also sounds coming from web content." SC 1.3.3 (Level A): "Instructions provided for understanding and operating content do not rely solely on sensory characteristics of components such as shape, color, size, visual location, orientation, or sound."
  Implication: Keep every UI sound under 3 s and in direct response to a user action (never on page load, toast arrival or timer), provide a keyboard-reachable persistent mute, and make sure every sound has a visual equivalent.

- No media query expresses a sound preference: Media Queries Level 5 defines prefers-reduced-motion, prefers-reduced-transparency, prefers-contrast, forced-colors, prefers-color-scheme and prefers-reduced-data only, so the app must own the mute preference.
  Source: https://www.w3.org/TR/mediaqueries-5/#mf-user-preferences (checked 2026-10-04, confidence high)
  Evidence: Section 12 User Preference Media Features lists exactly: prefers-reduced-motion, prefers-reduced-transparency, prefers-contrast, forced-colors, prefers-color-scheme, prefers-reduced-data. No audio or sound feature exists in the section. MDN prefers-reduced-motion page has no mention of sound; values are "reduce" and "no-preference".
  Implication: Do not couple sound to prefers-reduced-motion (they are different needs); implement an explicit sound toggle persisted per device, and expose it in the header and in Settings.

- Storing the sound and theme preferences in localStorage is regulated storage under PECR/ePrivacy but falls under the strictly necessary exemption when the user explicitly sets it, which WP29 ties to session duration unless the control itself discloses that the choice is remembered.
  Source: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/ (checked 2026-10-04, confidence medium)
  Evidence: ICO: "regulation 6 actually applies to anyone who stores information on a user's device or gains access to information on a user's device, in either case by any method"; exemption when "the cookie is strictly necessary to provide an 'information society service' ... requested by the subscriber or user"; "cookies that are helpful or convenient but not essential ... will still require consent." WP29 Opinion 04/2012 section 3.6: UI customisation cookies "are only set if the user has explicitly requested the service to remember a certain piece of information, for example, by clicking on a button or ticking a box"; "only session (or short term) cookies storing such information are exempted under CRITERION B. The addition of additional information in a prominent location (e.g. 'uses cookies' written next to the flag) would constitute sufficient information for valid consent to remember the user's preference for a longer duration."
  Implication: Washington State users need no banner, but to stay clean for any EU/UK visitor: put "Remembered on this device" next to the sound and theme toggles, and list the keys tidefern.sound and tidefern.theme under functional storage in the privacy notice. No consent banner is required for these two keys.

- Prior art converges on: sounds only in direct response to user actions, quiet and short, no hover or focus sounds by default, variation to avoid monotony, and a persistent mute; Microsoft ships control sounds off by default and Arc lets users disable all app sounds.
  Source: https://learn.microsoft.com/en-us/windows/apps/design/style/sound (checked 2026-10-04, confidence medium)
  Evidence: Microsoft WinUI: "By default, control sounds are not played" (ElementSoundPlayer.State default Auto); sound kinds Invoke, Show, Hide, MovePrevious, MoveNext, GoBack, Focus; "Typically the Focus sound does not play on PointerEntered or mouse hover events"; "the sound system will, by default, cycle through 4 different sounds on each navigation trigger ... focus sounds will be played most often and therefore should be the most subtle"; "sounds within the app cannot get louder than the system volume". Material (m2.material.io/design/sound/applying-sound-to-ui.html): sound "isn't usually suitable for: UIs that require privacy or discretion; Users who have requested no interruptions; Actions that are performed frequently"; primary UX sounds "should be in harmony with a product's sound aesthetic, while remaining simple and understated". Josh Comeau (joshwcomeau.com/blog/whimsical-animations/): "All of the sound effects I use on this landing page are short and in direct response to a user action"; fireworks stay silent because sounds "would quickly become irritating"; use-sound post: "It's important to include a 'mute' button somewhere on your page, accessible by using keyboard navigation" and "Critical information is never communicated exclusively by sound". Apple HIG visionOS: "the system subtly varies the pitch and volume of the virtual keyboard's sounds ... randomize a sound file's pitch and volume during playback". Arc 2022 release note (search snippet, page itself blocked by Cloudflare): users "can disable all Arc-generated sounds in Advanced Preferences". Linear: no evidence of UI sound design found in its changelog or docs.
  Implication: Tidefern's sound palette: tick (press), drop (save/confirm), soft two-tone error, optional hover; add plus or minus 3 percent pitch jitter per play; hover off by default and rate limited to one per 80 ms; mute toggle in header and Settings.

- Apple HIG dark mode guidance: respect the system setting, avoid an app-specific appearance setting on native, use dimmer backgrounds with base and elevated tiers, aim for at least 4.5:1 and strive for 7:1 on custom colors, and test with Increase Contrast and Reduce Transparency.
  Source: https://developer.apple.com/design/human-interface-guidelines/dark-mode (checked 2026-10-04, confidence high)
  Evidence: "Avoid offering an app-specific appearance setting. An app-specific appearance mode option creates more work for people ... they may think your app is broken because it doesn't respond to their systemwide appearance choice." "people can choose the Auto appearance setting, which switches between the light and dark appearances as conditions change throughout the day". "At a minimum, make sure the contrast ratio between colors is no lower than 4.5:1. For custom foreground and background colors, strive for a contrast ratio of 7:1, especially in small text." iOS: "the system uses two sets of background colors, called base and elevated ... The base colors are dimmer, making background interfaces appear to recede, and the elevated colors are brighter, making foreground interfaces appear to advance." "Soften the color of white backgrounds."
  Implication: Default the web app to the system scheme; still offer an in-app override because a web page cannot rely on OS Auto schedules in every browser (Material explicitly supports a toggle), and keep dark surfaces tiered rather than flat.

- Material guidance for dark themes: dark grey not black (#121212 reference), elevation expressed by lighter overlays (5 to 16 percent), desaturated accents in the 200 to 50 tone range, high-emphasis text at 87 percent, and body text at least 4.5:1 on the lightest surface; M3 adds five surface container tiers and promises 3:1 minimum on role pairs.
  Source: https://m2.material.io/design/color/dark-theme.html (checked 2026-10-04, confidence high)
  Evidence: "Use dark grey, rather than black, to express elevation and space"; "The recommended dark theme surface color is #121212"; overlay table 00dp 0%, 01dp 5%, 02dp 7%, 03dp 8%, 04dp 9%, 06dp 11%, 08dp 12%, 12dp 14%, 16dp 15%, 24dp 16%; "Dark surfaces and 100% white body text have a contrast level of at least 15.8:1"; "A dark theme should avoid using saturated colors, as they don't pass WCAG's accessibility standard of at least 4.5:1 ... Saturated colors also produce optical vibrations"; "it's recommended to use lighter tones (200-50) in dark theme"; "To create branded dark surfaces, overlay the primary brand color at a low opacity over ... #121212"; "High-emphasis text has an opacity of 87%, Medium-emphasis text and hint text have opacities of 60%, Disabled text has an opacity of 38%". M3 roles (m3.material.io/styles/color/roles): "five surface container roles ... Surface container lowest, low, container, high, highest"; "These color pairs provide an accessible minimum 3:1 contrast." Material 2 is marked "no longer maintained".
  Implication: Tidefern's dark canvas #0F1A17 (a fern-tinted near-black, 16.3:1 against Mist) follows the branded-dark-surface recipe; use the five measured surfaces as container tiers and lighter desaturated accents (#8FC1B9, #DDA58E) instead of the light-theme brand values.

- Measured WCAG ratios: the proposed dark token set passes AA for body text, large text and non-text UI on all five surfaces; in the light set Fern passes everywhere but Sea Glass and Clay fail as text and need #3F736C and #9E5F48 variants.
  Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (checked 2026-10-04, confidence high)
  Evidence: Formula per WCAG 2.2: (L1 + 0.05) / (L2 + 0.05) with L = 0.2126 R + 0.7152 G + 0.0722 B and the 0.04045 threshold. Results from contrast.py (dark, bg base #0F1A17 / surface #142420 / container #1B2C27 / raised #22352F / highest #2A4039): Mist 16.32 / 14.78 / 13.41 / 11.90 / 10.19; Sand 12.51 / 11.34 / 10.29 / 9.13 / 7.81; Stone 12.56 / 11.38 / 10.32 / 9.16 / 7.84; muted #A3B5AE 8.28 / 7.50 / 6.81 / 6.04 / 5.17; Sea Glass #6EA7A0 6.52 / 5.91 / 5.36 / 4.76 / 4.07; #8FC1B9 8.89 / 8.06 / 7.31 / 6.49 / 5.55; Clay #C98B74 6.29 / 5.70 / 5.17 / 4.59 / 3.93; #DDA58E 8.34 / 7.56 / 6.86 / 6.08 / 5.21; border #5C7A70 3.79 / 3.43 / 3.11 / 2.76 / 2.37; #0F1A17 on #8FC1B9 8.89, on #DDA58E 8.34. Light (Mist / white / Sand / Stone): Fern 8.28 / 9.02 / 6.35 / 6.37; #1F3A33 11.26 / 12.27 / 8.63 / 8.66; Sea Glass 2.50 / 2.73 / 1.92 / 1.93 (fail); #4F8A82 3.64 / 3.97 / 2.79 / 2.80; #3F736C 4.96 / 5.41 / 3.81 / 3.82; Clay 2.59 / 2.83 / 1.99 / 2.00 (fail); #9E5F48 4.60 / 5.02 / 3.53 / 3.54; #8A5240 5.73 / 6.25 / 4.39 / 4.41; muted #5B6E68 4.97 / 5.42 / 3.81 / 3.83; border #6B7F78 3.91 / 4.26; Mist on Fern 8.28; Mist on #3F736C 4.96; Fern on Sea Glass 3.31; #0F1A17 on Sea Glass 6.52, on Clay 6.29. SC 1.4.11 requires 3:1 for "Visual information required to identify user interface components and states" and focus indicators.
  Implication: Adopt the token tables in the snippets: Sea Glass (#6EA7A0) and Clay (#C98B74) stay decorative fills in light mode (with #0F1A17 labels when text sits on them), text accents use #3F736C and #9E5F48, and input borders that are the only identifying cue use #6B7F78 (light) or #5C7A70 on the three darkest surfaces.

- The before-paint theme pattern is an inline head script that reads localStorage and prefers-color-scheme and sets an html attribute; Tailwind 4 needs a custom dark variant for attribute toggling; color-scheme is Baseline and theme-color with media works in Chrome Android but Safari 26 uses it only for installed web apps and Firefox ignores it.
  Source: https://tailwindcss.com/docs/dark-mode (checked 2026-10-04, confidence high)
  Evidence: Tailwind: "@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));" and "On page load or when changing themes, best to add inline in head to avoid FOUC ... localStorage.theme === "dark" || (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)". next-themes 0.4.6 README: "relies on a script injection to avoid screen flashing on page load", requires "<html suppressHydrationWarning>", "defaultTheme = 'system'", "enableColorScheme = true: Whether to indicate to browsers which color scheme is used", "You should delay rendering any theme toggling UI until mounted on the client." MDN color-scheme: "Baseline: Widely available ... since January 2022"; it sets "The color of the canvas surface. The default colors of scrollbars ... The default colors of form controls"; include "<meta name="color-scheme"> ... before any CSS style information ... helping prevent unwanted screen flashes". MDN theme-color example: two metas with media="(prefers-color-scheme: light)" and "(prefers-color-scheme: dark)". BCD 8.1.4 theme-color: chrome_android 92 full, chrome desktop and edge "only on installed progressive web apps", firefox false, safari and safari_ios: "From Safari 26, the theme color is only used for installed web apps." Next.js 16.3.8 scripts guide: beforeInteractive loads "before any Next.js code and before any page hydration occurs"; "An id property must be assigned for inline scripts".
  Implication: Put a plain inline <script> in the root layout head (before stylesheets) that sets data-theme and style.colorScheme, add suppressHydrationWarning on <html>, declare @custom-variant dark on data-theme, and ship both theme-color metas; when the user picks an explicit theme at runtime, also update the matching meta so installed PWAs match.

- Historical Chrome limit of six AudioContexts per tab and the Material/Apple cautions about repetition both support one shared context and a small master gain, but there is no primary numeric guidance for UI sound loudness; the measured -20 to -33 dBFS peaks are a design choice.
  Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices (checked 2026-10-04, confidence medium)
  Evidence: MDN best practices: "Create or resume context from inside a user gesture" and if created outside a gesture "its state will be set to suspended and it will need to be started after user interaction." Search results cite the historic Chromium error "The number of hardware contexts provided (6) is greater than or equal to the maximum bound (6)" for Chrome before 66 (secondary sources, not verified on a Chromium page today). Microsoft: app sounds "cannot get louder than the system volume"; Apple: "the system volume always governs the final output"; Material: primary UX sounds should be "simple and understated". Josh Comeau's examples use volume 0.25.
  Implication: Keep exactly one AudioContext behind a module singleton with a master GainNode at 0.2 (user-adjustable later), never create per-component contexts, and treat the measured peak levels as the starting point for listening tests on a phone speaker.

### Recommendations

- (consequential) Hand-roll the sound system on Web Audio: one module-level AudioContext (latencyHint interactive) created or resumed inside the first activation-triggering input (pointerdown, pointerup, touchend, keydown except Escape, click), synthesized OscillatorNode + GainNode voices with exponential attack to a positive floor and setTargetAtTime decay, a master GainNode at 0.2, and no audio files or libraries.
  Why: Every browser gates Web Audio on sticky activation and the HTML standard excludes touch pointerdown, so the listener set matters; the spec forbids exponential ramps to zero; the verified module compiled under TypeScript 6.0.3, unlocked after one click in Chromium 1.63.0 headless with baseLatency 0.010 s, and rendered pop-free sounds at -20 to -33 dBFS with no network requests, which also fits the no-third-party policy.
  Rejected: use-sound 5.0.0 (MIT) requires howler 2.2.4 (unmaintained since 2023) and recorded samples; Tone.js 15.1.22 is far too large for four earcons; decoding small samples adds asset fetches and cache invalidation for no quality gain at this size.

- (advisory) Sound palette and triggers: tick on press (pointerdown/keydown activation of buttons, toggles, segmented controls), drop on save or confirm, soft two-tone error on validation failure, hover tick only when the user enables it, rate limited to one per 80 ms, with plus or minus 3 percent pitch jitter per play. No sounds on page load, route change, toast arrival or timers.
  Why: Material and Microsoft both warn against sound on frequent or implicit interactions (hover, focus) and Microsoft cycles focus sounds to avoid monotony; Apple randomizes keyboard pitch and volume; WCAG 1.4.2 and G171 are satisfied by keeping every sound under 3 s and in direct response to a user action.
  Rejected: Sound on every hover by default (fatiguing, and Material lists frequent actions as unsuitable); notification-style sounds for toasts (would be automatic audio and a privacy leak in public).

- (advisory) Default: action sounds ON after the first gesture, hover sounds OFF, with a keyboard-reachable mute in the app header and in Settings, persisted per device in localStorage key tidefern.sound and labeled "Remembered on this device". Do not set navigator.audioSession.type; leave iOS on the ambient session so the Ring/Silent switch mutes UI sounds.
  Why: Consumer platforms (iOS keyboard clicks, Android touch sounds, Josh Comeau's site) default UI sounds on with an easy mute, the sounds are quiet, short and user-triggered, and iOS silent mode already covers discretion for Web Audio per WebKit bug 237322 and Apple HIG. Hover stays off because it is the only high-frequency trigger. If the owner prefers discretion-first for a cycle-tracking product, flip readPref() to default 'off' and offer the toggle during onboarding; the code is identical.
  Rejected: Default off everywhere (hides the feature the owner wants and contradicts common consumer defaults); tying sound to prefers-reduced-motion (no spec basis, different need); setting audioSession to playback (would defeat the silent switch, contrary to HIG for sound effects).

- (advisory) Haptics: ship a tiny vibrate helper (tap 8 ms, select 4 ms, success [10,40,14], error [20,50,20,50,20]) called inside gesture handlers on Android Chromium browsers only, feature-detected, with its own toggle; defer iOS haptics (Safari 17.4 switch trick via ios-haptics 3.2.0, MIT) to a post-launch experiment on Expo rather than the web.
  Why: navigator.vibrate is Chromium-Android only, requires a user gesture since Chrome 60, was removed from Firefox desktop 129, and is absent from Safari; the iOS switch haptic fires only on trusted taps via a label overlay and cannot be patterned, and Apple HIG says to make haptics optional and not overuse them.
  Rejected: Shipping the iOS switch-overlay hack in v1 (fragile, Safari-only, interferes with pointer handling); @capacitor/haptics 8.0.2 (needs a Capacitor shell, out of scope before Expo).

- (consequential) Theme default is system with a persisted three-way override (system, light, dark) stored in tidefern.theme; an inline head script resolves the theme before paint, sets data-theme and style.colorScheme on html, and the root layout marks html with suppressHydrationWarning; Tailwind 4 uses @custom-variant dark on [data-theme=dark]; both theme-color metas use media attributes and are updated when the user overrides.
  Why: Apple HIG says people expect apps to follow the systemwide appearance and warns against app-specific settings on native, while Material documents a toggle; on the web the OS Auto schedule only reaches the page through prefers-color-scheme, so system default plus an override gives night-time users dark automatically and lets anyone pin a mode. color-scheme is Baseline and prevents white form controls and scrollbars; theme-color behavior differs per browser so it is cheap but not load-bearing.
  Rejected: Forcing dark for a health app (daytime users and HIG expectation violated); light-only (night feeding and logging sessions); next-themes 0.4.6 (fine, but its peer range targets React 16 to 19 and the hand-rolled script is 12 lines with no hydration gymnastics beyond suppressHydrationWarning).

- (consequential) Adopt the measured dark and light token sets in the CSS snippet: dark surfaces #0F1A17 base, #142420 surface, #1B2C27 container, #22352F raised, #2A4039 highest; dark text Mist #F7F5EF (primary), Sand #E6D6C3 (headings), #A3B5AE (muted); dark accents #8FC1B9 (primary, label #0F1A17) and #DDA58E (warm, label #0F1A17); light text Fern #2F4F46 on Mist/white/Sand, accent text #3F736C, warm text #9E5F48, decorative fills Sea Glass and Clay with #0F1A17 labels, identifying borders #6B7F78 (light) and #5C7A70 (dark base/surface/container).
  Why: Every pair listed passes WCAG 2.2 AA for its role per the contrast script (body 4.5:1, large and non-text 3:1), most dark pairs exceed Apple's 7:1 target, and the set follows Material's dark recipe (tinted near-black, tiered lighter surfaces, lighter desaturated accents). Sea Glass fails body text in light mode (2.50:1 on Mist) and Clay fails (2.59:1), so darker text variants are mandatory.
  Rejected: Using #4F8A82 for text (3.64:1 on Mist, large text only); Sea Glass fills with Mist labels (2.50:1); pure black #000 canvas (Material and Apple both advise against it; harder to show elevation).

- (advisory) Disclose tidefern.sound and tidefern.theme as functional device storage in the privacy notice and label the toggles "Remembered on this device"; no consent banner for these keys.
  Why: ICO treats any storage on the device as in scope but exempt when strictly necessary for a service the user requested; WP29 treats user-set interface preferences as exempt and says a prominent note at the control supports remembering them longer. The app is US-based, so this is belt and braces rather than a legal requirement in Washington.
  Rejected: Storing preferences server-side only (breaks pre-login and before-paint theming); a cookie banner (not required for strictly necessary storage and adds friction).

### Verified snippets

#### ui-sound.ts: shared AudioContext unlock plus synthesized tick, hover, drop and error sounds (type-checked with TypeScript 6.0.3; verified in headless Chromium: context running after one click, no errors, no NaN samples, peaks -20.8 to -32.5 dBFS)

Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

```
// ui-sound.ts: one shared AudioContext, unlocked on the first activation-triggering input,
// with synthesized "tick" (click) and "drop" (confirm) sounds. No audio files, no dependencies.

export type SoundName = 'tick' | 'hover' | 'drop' | 'error';

const STORAGE_KEY = 'tidefern.sound'; // 'on' | 'off'; functional preference, not tracking

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = readPref();
let lastHoverAt = 0;
const HOVER_MIN_INTERVAL_MS = 80; // rate limit for hover sounds

function readPref(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function isSoundEnabled(): boolean { return enabled; }

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
  if (on) void ensureContext();
}

/** Create (or resume) the shared context. Call from inside a user gesture handler. */
export async function ensureContext(): Promise<AudioContext | null> {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.2; // master level: UI sounds stay quiet; system volume governs final output
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') { // 'suspended', or iOS Safari's 'interrupted'
    try { await ctx.resume(); } catch { /* not yet allowed; a later gesture will retry */ }
  }
  return ctx.state === 'running' ? ctx : null;
}

/**
 * Register once at app start. Listens for the events that grant sticky activation
 * (HTML spec: keydown, mousedown, pointerdown for mouse, pointerup for non-mouse, touchend).
 * pointerdown alone is NOT enough on touch screens, hence pointerup and touchend.
 */
export function installUnlock(target: Document = document): () => void {
  const events: (keyof DocumentEventMap)[] = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];
  const onGesture = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') return; // Escape does not activate
    void ensureContext().then((c) => { if (c) events.forEach((n) => target.removeEventListener(n, onGesture, true)); });
  };
  events.forEach((n) => target.addEventListener(n, onGesture, { capture: true, passive: true }));
  return () => events.forEach((n) => target.removeEventListener(n, onGesture, true));
}

type Voice = { freq: number; type: OscillatorType; attack: number; decay: number; peak: number; slideTo?: number };

const VOICES: Record<SoundName, Voice[]> = {
  tick: [{ freq: 1800, type: 'sine', attack: 0.002, decay: 0.045, peak: 0.35 }],
  hover: [{ freq: 1400, type: 'sine', attack: 0.002, decay: 0.03, peak: 0.12 }],
  drop: [
    { freq: 660, type: 'sine', attack: 0.004, decay: 0.16, peak: 0.3, slideTo: 330 },
    { freq: 180, type: 'triangle', attack: 0.003, decay: 0.12, peak: 0.25 },
  ],
  error: [
    { freq: 320, type: 'triangle', attack: 0.004, decay: 0.12, peak: 0.25 },
    { freq: 240, type: 'triangle', attack: 0.004, decay: 0.16, peak: 0.25 },
  ],
};

function playVoice(c: BaseAudioContext, out: GainNode, v: Voice, at: number): void {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = v.type;
  const jitter = 1 + (Math.random() - 0.5) * 0.06; // +/- 3% pitch variation avoids monotony
  osc.frequency.setValueAtTime(v.freq * jitter, at);
  if (v.slideTo) osc.frequency.exponentialRampToValueAtTime(v.slideTo * jitter, at + v.decay);
  // Envelope: start at a tiny positive value (exponential ramps cannot start or end at 0),
  // ramp up quickly, then decay with setTargetAtTime (about 95% of the way after 3 time constants).
  const floor = 0.0001;
  env.gain.setValueAtTime(floor, at);
  env.gain.exponentialRampToValueAtTime(v.peak, at + v.attack);
  env.gain.setTargetAtTime(floor, at + v.attack, v.decay / 3);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + v.attack + v.decay * 2); // well after the tail is inaudible
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/** Fire-and-forget. Safe to call before unlock (it simply does nothing). */
export function playSound(name: SoundName): void {
  if (!enabled || !ctx || !master || ctx.state !== 'running') return;
  if (name === 'hover') {
    const now = performance.now();
    if (now - lastHoverAt < HOVER_MIN_INTERVAL_MS) return;
    lastHoverAt = now;
  }
  const at = ctx.currentTime + 0.005;
  VOICES[name].forEach((v, i) => playVoice(ctx!, master!, v, at + (name === 'error' ? i * 0.09 : 0)));
}

// Usage: installUnlock() once in a client component on mount;
// <button onPointerDown={() => playSound('tick')} ...>; after a successful save playSound('drop').
```

#### haptics.ts: best-effort vibrate helper (Android Chromium only) plus switch-control feature detection for the iOS Safari 17.4 path

Source: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate

```
// haptics.ts: Android Chromium browsers support navigator.vibrate (user gesture required since
// Chrome 60; Firefox desktop removed it in 129; Firefox Android reports true but never vibrates).
// Safari on iOS and macOS do not implement it. Keep haptics optional (Apple HIG).

export type HapticKind = 'tap' | 'select' | 'success' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 4,
  success: [10, 40, 14],
  error: [20, 50, 20, 50, 20],
};

let hapticsEnabled = true;
export function setHapticsEnabled(on: boolean): void { hapticsEnabled = on; }

/** Returns true if the platform accepted the request. Call inside a user gesture handler. */
export function haptic(kind: HapticKind): boolean {
  if (!hapticsEnabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try { return navigator.vibrate(PATTERNS[kind]); } catch { return false; }
}

/** iOS Safari 17.4+ exposes <input type="checkbox" switch>; WebKit plays a light impact haptic
 *  when it toggles inside a trusted user gesture. A programmatic .click() from JS is not a user
 *  gesture, so a <label for> overlay must receive the real tap (see the ios-haptics package, MIT). */
export function supportsSwitchControl(): boolean {
  if (typeof document === 'undefined') return false;
  const input = document.createElement('input');
  input.setAttribute('type', 'checkbox');
  input.setAttribute('switch', '');
  return 'switch' in input; // true in Safari 17.4+, false elsewhere today
}
```

#### contrast.py: WCAG 2.2 contrast calculator used to produce every ratio in this report (run with two hex colors for one pair, or with no args for the Tidefern matrices)

Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

```
#!/usr/bin/env python3
"""WCAG 2.x contrast ratio calculator (sRGB relative luminance, WCAG 2.2 formula).
Usage: python3 contrast.py '#2F4F46' '#F7F5EF'
"""
import sys

def srgb_to_linear(c8: int) -> float:
    c = c8 / 255.0
    # WCAG 2.2 threshold 0.04045 (changed from 0.03928 in May 2021, no practical effect)
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def luminance(hex_color: str) -> float:
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)

def ratio(fg: str, bg: str) -> float:
    l1, l2 = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)

def grade(r: float) -> str:
    # AA body 4.5:1 (SC 1.4.3), AA large text and non-text UI 3:1 (SC 1.4.3, 1.4.11), AAA body 7:1 (SC 1.4.6)
    if r >= 7: return 'AAA'
    if r >= 4.5: return 'AA'
    if r >= 3: return 'AA-large/UI'
    return 'FAIL'

def matrix(title, fgs, bgs):
    print(f"\n== {title}")
    print(f"{'fg / bg':<26}" + ''.join(f"{name:>22}" for name, _ in bgs))
    for fname, f in fgs:
        row = f"{fname:<26}"
        for bname, b in bgs:
            r = ratio(f, b)
            row += f"{r:>8.2f} {grade(r):<13}"
        print(row)

if __name__ == '__main__':
    if len(sys.argv) == 3:
        r = ratio(sys.argv[1], sys.argv[2]); print(f"{r:.2f}:1 {grade(r)}"); sys.exit(0)
    dark_bgs = [('#0F1A17 base', '#0F1A17'), ('#142420 surface', '#142420'), ('#1B2C27 container', '#1B2C27'),
                ('#22352F raised', '#22352F'), ('#2A4039 highest', '#2A4039')]
    dark_fg = [('Mist #F7F5EF', '#F7F5EF'), ('Sand #E6D6C3', '#E6D6C3'), ('Stone #D9D9D4', '#D9D9D4'),
               ('muted #A3B5AE', '#A3B5AE'), ('Sea Glass #6EA7A0', '#6EA7A0'), ('Sea Glass+ #8FC1B9', '#8FC1B9'),
               ('Clay #C98B74', '#C98B74'), ('Clay+ #DDA58E', '#DDA58E'), ('border #5C7A70', '#5C7A70')]
    matrix('DARK', dark_fg, dark_bgs)
    light_bgs = [('Mist #F7F5EF', '#F7F5EF'), ('white #FFFFFF', '#FFFFFF'), ('Sand #E6D6C3', '#E6D6C3'), ('Stone #D9D9D4', '#D9D9D4')]
    light_fg = [('Fern #2F4F46', '#2F4F46'), ('Fern+ #1F3A33', '#1F3A33'), ('Sea Glass #6EA7A0', '#6EA7A0'),
                ('#4F8A82', '#4F8A82'), ('#3F736C', '#3F736C'), ('Clay #C98B74', '#C98B74'), ('#9E5F48', '#9E5F48'),
                ('#8A5240', '#8A5240'), ('muted #5B6E68', '#5B6E68'), ('border #6B7F78', '#6B7F78')]
    matrix('LIGHT', light_fg, light_bgs)
```

#### Theme tokens with measured ratios (CSS custom properties keyed on data-theme), Tailwind 4 dark variant, before-paint head script, color-scheme and theme-color metas, and the Next.js root layout wiring

Source: https://tailwindcss.com/docs/dark-mode

```
/* app/globals.css (Tailwind 4.3.x) */
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root, [data-theme="light"] {
  color-scheme: light;
  /* surfaces */
  --bg: #F7F5EF;            /* Mist canvas */
  --surface: #FFFFFF;       /* cards */
  --surface-warm: #E6D6C3;  /* Sand panels */
  --divider: #D9D9D4;       /* Stone, decorative only (1.30:1 on Mist) */
  /* text: Fern 8.28 Mist, 9.02 white, 6.35 Sand, 6.37 Stone */
  --text: #2F4F46;
  --text-strong: #1F3A33;   /* 11.26 Mist, 8.63 Sand (AAA) */
  --text-muted: #5B6E68;    /* 4.97 Mist, 5.42 white; 3.81 on Sand so large text only there */
  /* accents */
  --accent-text: #3F736C;   /* links, text buttons: 4.96 Mist, 5.41 white */
  --accent-ui: #4F8A82;     /* icons, 3:1 non-text on Mist 3.64 and white 3.97 (not on Sand 2.79) */
  --accent-fill: #3F736C;   /* filled buttons, label Mist 4.96 */
  --accent-decor: #6EA7A0;  /* Sea Glass: decorative fills only; label #0F1A17 6.52 */
  --primary-fill: #2F4F46;  /* Fern button, label Mist 8.28 */
  --warm-text: #9E5F48;     /* 4.60 Mist, 5.02 white (use #8A5240 for 5.73) */
  --warm-decor: #C98B74;    /* Clay: decorative fills; label #0F1A17 6.29 */
  --border-strong: #6B7F78; /* identifying borders for inputs: 3.91 Mist, 4.26 white */
  --focus: #3F736C;         /* 4.96 Mist */
  --on-accent: #F7F5EF;
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0F1A17;            /* base canvas (fern-tinted near black) */
  --surface: #142420;       /* surface */
  --surface-warm: #1B2C27;  /* container */
  --surface-raised: #22352F;/* raised: sheets, menus */
  --surface-highest: #2A4039;
  --divider: #3A524A;       /* decorative only (2.11:1 on base) */
  /* text: Mist 16.32 base, 14.78 surface, 13.41 container, 11.90 raised, 10.19 highest */
  --text: #F7F5EF;
  --text-strong: #E6D6C3;   /* Sand headings: 12.51 base ... 7.81 highest */
  --text-muted: #A3B5AE;    /* 8.28 base ... 5.17 highest (AA everywhere) */
  --accent-text: #8FC1B9;   /* 8.89 base ... 5.55 highest */
  --accent-ui: #6EA7A0;     /* Sea Glass as icon/border: 6.52 base ... 4.07 highest (3:1 everywhere) */
  --accent-fill: #8FC1B9;   /* filled buttons, label #0F1A17 8.89 */
  --accent-decor: #6EA7A0;
  --primary-fill: #8FC1B9;
  --warm-text: #DDA58E;     /* 8.34 base ... 5.21 highest */
  --warm-decor: #C98B74;    /* 6.29 base ... 3.93 highest: text only up to raised (4.59) */
  --border-strong: #5C7A70; /* 3.79 base, 3.43 surface, 3.11 container; on raised use #6EA7A0 (4.76) */
  --focus: #8FC1B9;
  --on-accent: #0F1A17;
}
body { background: var(--bg); color: var(--text); }

<!-- app/layout.tsx (Next.js 16.x app router), head section -->
<html lang="en" suppressHydrationWarning>
  <head>
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#F7F5EF" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0F1A17" media="(prefers-color-scheme: dark)" />
    {/* Inline, before any stylesheet: resolves the theme before first paint. */}
    <script
      id="theme-boot"
      dangerouslySetInnerHTML={{ __html: `(function(){try{var s=localStorage.getItem('tidefern.theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var t=(s==='light'||s==='dark')?s:m;var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();` }}
    />
  </head>
  ...
</html>

// theme.ts (client): three-way setter used by the Settings toggle
export type ThemeChoice = 'system' | 'light' | 'dark';
export function applyTheme(choice: ThemeChoice): void {
  try { choice === 'system' ? localStorage.removeItem('tidefern.theme') : localStorage.setItem('tidefern.theme', choice); } catch {}
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const t = choice === 'system' ? system : choice;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  // keep installed-PWA chrome in sync (Chrome Android, Safari 26 installed apps)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => { m.content = t === 'dark' ? '#0F1A17' : '#F7F5EF'; });
}
// Also listen: window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(readChoice()))
```

### Open questions

- Whether the owner wants action sounds on or off by default for a discreet health product: the recommendation is on (hover off) with a visible mute, but Material explicitly lists privacy-sensitive UIs as a case for silence, so this is a product call that flips one line in readPref().
- Perceived loudness on real phone speakers: the measured peaks (-20 to -33 dBFS at master 0.2) are a starting point and need a listening pass on an iPhone and a mid-range Android before freezing the master gain and per-voice peaks.
- The historic Chrome limit of six AudioContexts per tab could not be verified on a current Chromium page today (secondary sources only); the single-context design makes it moot.
- Linear and Arc as prior art: Arc's release notes are behind a Cloudflare bot check and Linear's changelog and docs showed no UI sound entries, so neither is a verified reference for web UI sound design.
- Whether to expose a user-adjustable sound volume (Material and Microsoft both allow it) or only a mute; the module supports it via master.gain but the UI spec does not require it.
- Material 3 specific dark tone assignments (for example surface tone 6, primary tone 80) were not extractable from the rendered M3 pages, so the dark token set is justified by measured WCAG ratios and the M2 dark theme recipe rather than by M3 tone numbers.

### Sources that could not be read

- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Autoplay_guide (404; the MDN autoplay content now lives at https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay, which was used)
- https://support.mozilla.org/en-US/kb/block-autoplay (page shell loaded with an error in both WebFetch and headless Chromium; Firefox behavior taken from Bugzilla 1413098 and MDN instead)
- https://resources.arc.net/hc/en-us/articles/20498377604887-Arc-for-macOS-2023-Release-Notes and the 2022 release notes (HTTP 403 and a Cloudflare bot check in headless Chromium; the 'disable all Arc-generated sounds' note is from a search snippet only)
- https://github.com/jakearchibald/ios-haptics (404; the actual package is github.com/tijnjh/ios-haptics, whose README was read from unpkg)
- Linear changelog (loaded, but contained no sound-related entries; no primary source for Linear UI sound design was found)
- https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/ (loaded, but it covers only media elements and says nothing about Web Audio)

## Skeptic verdicts

<a id="skeptic-verdicts"></a>

No verdicts recorded yet.

## Completeness critique

<a id="completeness-critique"></a>

Not yet produced.

