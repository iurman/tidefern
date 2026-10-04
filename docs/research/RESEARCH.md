# Research findings

Status: this file is the generated record of the research sweep and its verification, kept as evidence. Where a snippet or value here differs from `docs/ARCHITECTURE.md`, `packages/design-tokens/tokens.json` or the pins in `pnpm-lock.yaml`, the repository wins: the record resolved the contradictions between dimensions (mount path, build command, typography, color values, pnpm and ESLint majors) and the skeptic verdicts below correct the researchers where they were wrong.

Generated from the research workflow run on 2026-10-04 (eight dimensions, one skeptic per dimension, one completeness critic). Every finding carries its source and the date it was checked. Quoted evidence that contained an em dash was normalized to a comma because the repository bans that character; follow the source link for the exact wording. Snippets were verified by the researcher as stated in each heading; re-run them before relying on them in a different version.

Contents: [hosting-api](#hosting-api), [data-auth](#data-auth), [contract-ci](#contract-ci), [sound-darkmode](#sound-darkmode), [design-galleries](#design-galleries), [fonts-brand](#fonts-brand), [product-domain](#product-domain), [agent-practices-compliance](#agent-practices-compliance), then the [skeptic verdicts](#skeptic-verdicts) and the [completeness critique](#completeness-critique).

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

## design-galleries

<a id="design-galleries"></a>

Dimension: Visual direction research from live galleries and design-system references

### Summary

Phloom's /design is the strongest model found for Tidefern's interactive reference: six chapters (Foundations, Brand, Color, Type and Space, Components, Motion) that render the real shipped components and read every token value out of the running document, so the catalog "cannot drift from what ships". Its load-bearing ideas are semantic colour roles shipped as pairs plus a third "ink" member for text weight, thirty-odd tokens derived from one brand hue with relative colour syntax, two easing curves and one orchestrated entrance per page, a hard ban on transition-all, and reduced motion that degrades to instant rather than absent. All six Phloom pages plus Foundations were captured first-hand at 1440 px light, 1440 px dark (OS colour-scheme emulation, since the site follows system theme) and 390 px mobile; the screenshots and full text dumps are in the scratchpad. The seven galleries could only be inspected as fetched text, because Playwright's Chromium does not trust the session proxy CA and the permission classifier blocked the second screenshot batch; the fetched text was still enough to classify them. component.gallery is the one gallery that directly serves Tidefern's calendar, empty-state and timeline needs, by indexing 44 date-picker examples (including shadcn/ui Calendar, Geist Calendar, HeroUI Range Calendar and Nord Calendar), 16 empty-state examples and 12 progress-indicator or timeline examples across design systems. 21st.dev has 78 calendar components but its terms vest marketplace content in 21st Labs and require link-backs on redistribution, so it is an inspiration source, not a code source. landing.love, inspora and amicro are motion-forward and mostly counter-signals for a calm health product; details.so and rebrand.gallery have relevant Health and Healthcare filters behind accounts or paywalls. The Vercel web-design-guidelines skill is MIT and fetches a 190-line rule file at run time whose animation, dark-mode, Intl date formatting and empty-state rules match the direction here; find-skills is MIT and optional. Browser-support facts were pulled from the web-features dataset: relative colour syntax is Baseline low since 2024-09-16, corner-shape squircle is Chrome and Edge 139 only, so both need @supports or static fallbacks. Fraunces (serif) and Nunito Sans (sans) were verified as OFL variable families on Google Fonts as a pairing candidate that is distinct from Phloom's Figtree plus Instrument Serif; Tidefern must not reuse Phloom's five-petal rosette, pink and plum palette, or type pairing.

### Findings

- Phloom's /design index is a hub of five chapters plus Foundations, and its one-line thesis is that the catalog renders the shipped components rather than describing them.
  Source: https://phloom.app/design (checked 2026-10-04, confidence high)
  Evidence: Page text: "The language this product is built in. Every chapter shows the real components, so nothing here can drift from what ships." Chapter blurbs: Brand "The mark, the wordmark, and how Phloom talks."; Color "Two gardens, one palette, and the glass between them."; Type and Space "Three families, one scale, and the rhythm they sit on."; Components "Every primitive we ship, live and interactive."; Motion "Two curves, a handful of beats, and when to hold still."; Foundations "What the language holds to, and who it has to work for." Computed fonts on the page: Figtree, Instrument Serif, Geist Mono; body background lab(98.27 0.28 1.88) (warm cream). Inspected: 1440x900 light, 1440x900 dark via colorScheme emulation (site uses next-themes defaultTheme=system), 390x844 mobile. [static screenshots] Evidence: /tmp/claude-0/-home-user/84c43d3b-6d57-58cc-9ef5-34bdf07dace1/scratchpad/research/visual-direction/phloom-design--desktop-light.png, phloom-design--desktop-dark.png, phloom-design--mobile-light.png, phloom-design.txt.
  Implication: Tidefern's /design should be a route group inside the real Next.js app that imports the real primitives and tokens, with a hub page, a Foundations chapter stating audience and accessibility commitments, and five chapters. The five-petal flower hub and the pink/plum identity are Phloom's and must not be copied; Tidefern can use a tide or fern motif of its own.

- Phloom's Color chapter reads token values live from computed styles, paints each chip with var(--token), prints the browser-resolved value, and points to the source file instead of offering CSS or JSON export downloads.
  Source: https://phloom.app/design/color (checked 2026-10-04, confidence high)
  Evidence: "Every value below is read out of the running document, so this page cannot disagree with the stylesheet. The number after resolved is the browser's own canonical form, not the authored one: Tailwind registers theme colours as <color>, so Chrome reports lab(). The oklch() you would edit lives in app/globals.css. The chip itself is painted with var(--token), so the swatch is the browser resolving the variable rather than us re-serialising it." Each chip row shows: human name, --token name in mono, "resolved lab(...)" and a one-line usage note (for example --border: "An alpha value, not a solid: it tints whatever it sits on."). Theming: "Every token above is declared twice, once in :root and once in .dark, which is why the 144 token names come to 221 declarations." No export, copy, download, or JSON links exist anywhere in the six chapters (grep of all text dumps). Section anchors: #palette, #semantic, #glass, #derived, #theming. [static screenshot plus text] Evidence: crops/color-surfaces-chips.png, crops/color-header.png, phloom-color--desktop-light.png, phloom-color--desktop-dark.png, phloom-color.txt.
  Implication: Build Tidefern's colour chapter as a client component that enumerates a token manifest, reads getComputedStyle(document.documentElement).getPropertyValue(name), paints chips with var(--name), and shows the resolved value. Add what Phloom lacks: a "copy as CSS" and "download tokens.json" action generated from the same manifest, so the page is both truthful and exportable.

- Phloom ships every status colour as a pair (fill plus measured foreground) and adds a third "ink" member at text weight, with contrast ratios printed in the specimen; brand needs three members because the brand fill sits at a lightness that carries text of neither polarity.
  Source: https://phloom.app/design/color#semantic (checked 2026-10-04, confidence high)
  Evidence: "A status colour is never used on its own. Each one has a foreground token measured against it, and the pair is the unit you reach for. Reaching for --warn without --warn-foreground is how you end up with amber text on amber, which is why these are shown as plates rather than as chips." Third member: "--warn is a fill at oklch(0.68 ...), and as text on cream paper it measures 2.83:1, falling to 2.47 on an 18% tint of itself ... So each role has a third member, the same hue at text weight, solved per theme against every plate it lands on. Reach for text-warn-ink whenever the colour has to be read, and keep bg-warn for the surface." Brand specimen prints "3.94:1. A fill, not a plate for text." / "5.63:1. Filled buttons, checked box, selected card." / "5.80:1. Opaque, never an alpha on the plate." and "--brand-ink: lch(from ... 36 c h)" derived "in CIE L* rather than oklch, so one value holds 4.5:1 for any hue a team picks". The specimen is a grid: PAGE / 10% TINT / 15% TINT rows, each showing the word "fill" and "ink" so the unreadable fill row is visible. [static screenshot] Evidence: crops/color-semantic-plates.png, crops/color-brand-three-members.png.
  Implication: Tidefern's token set should define, per role (fern/brand, success, warn, info, destructive, and cycle phase colours), a fill, a foreground measured on that fill, and an ink member for text on page and tints. The design reference should print measured contrast ratios next to each plate. This is also what keeps cycle and pregnancy status colours readable on a cream page and on tinted calendar cells.

- Phloom's two themes are not inversions of each other and the dark theme is tinted toward the brand hue; theme switching uses an opacity-only "frost veil" and about thirty tokens derive from one --brand hue through relative colour syntax.
  Source: https://phloom.app/design/color#theming (checked 2026-10-04, confidence high)
  Evidence: "Garden Morning is warm cream paper at oklch(0.985 0.005 80), not white; the hue is on the yellow side, so the whole light theme reads as paper rather than as a screen. Twilight Garden is a deep plum-violet, not neutral black, so the pink sits in the same family as its background instead of glowing off it." "Thirty-odd tokens are stated as functions of --brand rather than as values, so re-pointing one variable rotates the scrollbar rail, the sidebar ambient wash, the focus ring, the accent tint, and the glass corners together." Examples: "--accent ... oklch(from var(--brand) 0.94 0.02 h)", "--ring ... color-mix(in oklch, var(--brand) 50%, transparent)", sidebar ambient B uses "calc(h + 45)". Chart series: "Five hues, spaced for categorical data rather than for a gradient. Series 1 is brand pink." Theme switch: "Switching themes plays a frost veil: an opacity-only overlay that covers, swaps mid-cover, and uncovers ... A blur there would be the expensive thing in the one moment the whole page is repainting." Dark screenshot confirms deep plum background and pink shifted lighter. [static screenshots, dark via OS emulation] Evidence: phloom-color--desktop-dark.png, phloom-motion--desktop-dark.png, phloom-color.txt.
  Implication: Tidefern should author two named palettes in oklch (for example a warm paper light theme and a deep green-blue night theme, not neutral black), derive accent, ring and chart series from one fern or tide hue, and keep the theme class on <html> with system default. Dark theme should carry the brand hue family so cycle rings and timelines do not glow off a black page.

- Phloom's Type chapter assigns three families three jobs (sans for interface, serif for names and titles only, mono for comparable identifiers), presents the scale as live utility-class rows, and mandates tabular numerals for compared columns.
  Source: https://phloom.app/design/type (checked 2026-10-04, confidence high)
  Evidence: "Figtree is the interface. It carries every label, every button, every table cell, and it is the reason the product reads as calm rather than as literary. Instrument Serif is for names and titles only: the wordmark, page headings, section heads. Geist Mono is for anything a person might have to compare character by character." "Serif italic is not a utility voice ... at small sizes it is harder to read than the sans, for no gain." Scale: "These are utilities, not sizes to reinvent per page. Each row below is set in the real class named beside it" with rows .font-display, .font-display-sm, .text-h1, .text-h2, .text-h3, .text-body, .text-body-sm ("The most-used body size in the product interior"), .text-caption, .font-mono-sm. Numbers: "Any column of numbers a person compares gets .tabular-nums-pro. Proportional digits are prettier in a sentence and useless in a column" with a side-by-side wrong/right specimen. Spacing: "gap-1.5 to gap-2.5 inside a control, gap-4 between cards, gap-6 to gap-8 between page sections, and p-5 rising to sm:p-7 inside a card." Radii: "Radii come off one root, --radius (currently .625rem), multiplied into seven tiers" and "a squircle needs MORE radius than a circle to look the same" so the step-up lives "inside an @supports block". Mobile view collapses the specimen table to a single column with class name above sample. [static screenshots] Evidence: crops/type-scale.png, phloom-type--mobile-light.png, phloom-type.txt.
  Implication: Tidefern should adopt the same division of labour with its own faces (serif reserved for page titles, child names and milestone headings; sans everywhere else; mono only for codes), expose the scale as named utilities rendered live in /design/type, and apply tabular numerals to cycle-day counts, week numbers, weights and dates in calendar and timeline columns.

- Phloom's Components chapter groups live primitives into Actions, Status and identity, Forms, Overlays, Structure, Page patterns and shell-only entries, and states explicit rules for empty states, progress, skeletons and toasts.
  Source: https://phloom.app/design/components (checked 2026-10-04, confidence high)
  Evidence: Empty state rule: "Say what would be here, why it is not, and the one action that changes that. Never just 'No results'." Sample: "No devices yet / Connect a phone to a provider host and it shows up here within a few seconds. / Set up a provider". Progress: "Determinate only. If you do not know the proportion, use the brand loader instead of a bar that lies." Skeleton: "Once a value exists, DataReveal crossfades it in rather than swapping a skeleton row for a content row, because swapping rows makes the page jump." Forms: "Every control is labelled, and the label is a real <Label htmlFor> rather than a paragraph above the field. Placeholder text is an example, never the label." Table: "A status cell pairs a tone-coded dot with its word, because colour is never the only signal." Toasts: "Success is short. An error names what to do next. Never fire two for one action." Overlays: "a Dialog is a task, an AlertDialog is a decision you cannot undo, a Sheet is a side surface for something long, and a Popover is a detail attached to its trigger." Shell-only entries (sidebar, gooey tab pill, pointer-events guard) are described and linked, not rendered: "faking their context would mean building a copy, and a copy is exactly what this catalog exists to avoid." Caveat observed: in the 1440 px full-page capture only Actions through Forms painted; Overlays, Structure and Page patterns were blank until the BACK/NEXT footer, consistent with viewport-gated entrance animation holding off-screen sections at opacity 0. [static screenshot plus text] Evidence: crops/components-actions.png, crops/components-forms.png, crops/components-mobile-top.png, phloom-components--desktop-light.png, phloom-components.txt.
  Implication: Tidefern's components chapter should use the same seven groups, render the real shadcn-based primitives, and add Tidefern-specific page patterns: day cell, cycle ring, week card, milestone row, quick-log sheet. Copy the empty-state formula for first-run screens (no cycles logged, no pregnancy started, no milestones yet). Gate entrance animation to above-the-fold content so full-page screenshots, print and Playwright visual tests never capture blank regions.

- Phloom's Motion chapter fixes two easing curves, one orchestrated entrance per mount with named beats, bans transition-all, and requires reduced motion to degrade to instant rather than hidden; demos have Replay buttons and a live prefers-reduced-motion readout.
  Source: https://phloom.app/design/motion (checked 2026-10-04, confidence high)
  Evidence: "Page interiors move on one editorial curve: cubic-bezier(0.16, 1, 0.3, 1), exported as EASE_EXPO_OUT from lib/ui/motion-tokens.ts." "Shell chrome keeps its own contract: 480ms on cubic-bezier(0.22, 1, 0.36, 1) ... Do not mix the two families on one element." "A page entrance is a single cascade down the page, not each component deciding for itself. The beats live in lib/ui/dashboard-entrance-motion.ts ... as named delays" (Page title 0.05s, Meta line 0.2s, Counter tiles 0.15s, Activity card 0.28s, Activity rows 0.38s, Quick links 0.42s) with a "Replay the cascade" button: "Delays are read from DASHBOARD_BEATS, so this demo re-times itself if the module is retuned." "Colour feedback is transition-colors duration-200. Transform feedback is motion-safe:transition-transform duration-200, rising to 300ms on large surfaces." "transition-all is banned. PRO-644 took it from 31 files to zero." Reduced motion: "Every animation is gated, by one of three mechanisms: useReducedMotion for JS-driven work, motion-safe: for utility transitions, or a prefers-reduced-motion media query in globals.css for keyframes ... The rule is that the interface arrives complete and instant, never hidden." Exemptions: "progress spinners stay spinning, because a frozen spinner reads as 'stuck', and colour-only fades are left alone". Live readout: "prefers-reduced-motion is no-preference. Demos animate ... Read live from the same hook the product uses." [static screenshot; Replay controls present but not clicked] Evidence: crops/motion-curves-cascade.png, phloom-motion--desktop-dark.png, phloom-motion--mobile-light.png, phloom-motion.txt.
  Implication: Tidefern should export EASE and BEATS constants from one motion-tokens module, import them in both the app and /design/motion, provide Replay buttons that re-read the constants, show the visitor's reduced-motion state live, and lint against transition-all. Cycle ring fills and timeline reveals should animate transform and opacity only, with crossfade for async values.

- Phloom's Brand and Foundations chapters set voice rules (no em dashes in user-facing copy, errors say what to do next, no accent hairline under titles) and four accessibility commitments, and define an eight-principle foundation.
  Source: https://phloom.app/design/brand#voice (checked 2026-10-04, confidence high)
  Evidence: Voice: "copy is plain, specific, and short. Page titles are Title Case; everything else is sentence case. A label says what the thing is; a description says what it does or what will happen." "no em dashes in user-facing copy ... A hard rule, not a preference. Two short sentences almost always read better, and a comma, colon, or pair of parentheses covers the rest." "say what happens, not that something happened" with pairs such as "An error occurred." (wrong) versus "That team name is already taken. Try another." (right), and "Loading..." versus "Connecting to the device". Misuse section: "Every tile is deliberately wrong" rendered with the real component (stretch, rotate, shadow, shrink master, on own colour, crowded). Foundations (fetched text): eight principles including "Documents, not dashboards", "One accent per block", "Motion is feedback, not performance", "Tokens, never literals", "Match the nearest surface", "Say what happens next", "The catalog cannot lie"; accessibility: focus ring follows brand via --ring "3px, 45% opacity", "Reduced motion degrades animations to instant, never to absent", "Color is never sole signal", logos "aria-hidden when paired with text". Mark invariants (five petals, clockwise, central squircle, currentColor only) are Phloom identity. [static screenshot plus text; Foundations text fetch only] Evidence: crops/brand-mark-sizes.png, phloom-brand--desktop-light.png, phloom-brand.txt.
  Implication: Tidefern's Brand chapter should hold its own mark invariants, a misuse grid built from the real logo component, and a voice section with right/wrong pairs tuned to health copy (for example "Period logged for today. Undo" rather than "Saved!"). Adopt the no-em-dash rule and the error-copy rule as lint checks on message catalogs. Do not reuse the rosette, the squircle-centre concept, or the pink.

- The CSS features Phloom relies on have uneven support: relative colour syntax is Baseline low since 2024-09-16, corner-shape (squircle) is not Baseline and is Chrome and Edge 139 only, color-mix is Baseline high, light-dark() is Baseline low, view transitions are Baseline low since 2025-10-14, scroll-driven animations are not Baseline.
  Source: https://unpkg.com/web-features@latest/data.json (checked 2026-10-04, confidence high)
  Evidence: web-features data.json entries read on 2026-10-04: relative-color: baseline low, baseline_low_date 2024-09-16, support chrome 125, firefox 128, safari 18, safari_ios 18 ("The from keyword for color functions ... creates a new color based on a given color"). corner-shape: baseline false, support chrome 139, chrome_android 139, edge 139 only. color-mix: baseline high, high date 2025-11-09. light-dark: baseline low, 2024-05-13. view-transitions: baseline low, 2025-10-14 (firefox 144, safari 18). scroll-driven-animations: baseline false (chrome 115, safari 26, no firefox). prefers-reduced-motion: baseline high since 2022-07-15. MDN corner-shape page (fetched) says "Limited availability - This feature is not Baseline because it does not work in some of the most widely-used browsers" and shows @supports usage; MDN relative colours page shows "@supports (color: hsl(from white h s l))" as the feature test.
  Implication: Tidefern can use relative colour derivation but must ship static oklch fallbacks ahead of the derived declarations (or build tokens at compile time) because Safari 17 and Firefox below 128 still exist on family devices. corner-shape squircles are an enhancement only, wrapped in @supports as Phloom does. Prefer CSS transitions and the View Transitions API (now Baseline low) over scroll-driven animations.

- component.gallery is a free Astro-built index of 60 components, 95 design systems and 2,671 examples, and its Datepicker, Empty state and Progress indicator pages are the fastest way to compare calendar, empty-state and timeline patterns across real design systems.
  Source: https://component.gallery/components/datepicker/ (checked 2026-10-04, confidence high)
  Evidence: Homepage: "The Component Gallery is an up-to-date repository of interface components based on examples from the world of design systems, designed to be a reference for anyone building user interfaces." Counts: 60 components, 95 design systems, 2,671 examples; built "using Astro, Airtable, Cloudflare Pages, and Tailwind CSS". Datepicker: "A visual way to choose a date using a calendar view." with 44 examples including shadcn/ui Calendar (ui.shadcn.com/docs/components/calendar), Geist Calendar (vercel.com/geist/calendar), HeroUI Calendar and Range Calendar, Gestalt DateRange, Nord Calendar, Material 3 Date pickers, Elastic Date picker range; six systems flagged as documenting accessibility (Atlassian, Elisa, Fluent UI, Material, Polaris, Visa). Date input is a separate entry: "A means of inputting a date, often separated into multiple individual fields for day/month/year." Empty state: "An indication to the user that there is no data to display in the current view; it often includes an alternative action" with 16 examples (Nord, Geist, Primer Blankslate, Chakra, PatternFly, Atlassian). Progress indicator: "A representation of a user's progress through a series of discrete steps", other names "Progress tracker, Stepper, Steps, Timeline, Meter", 12 examples (Carbon, Clarity timeline, Spectrum meter). No licence stated on the homepage. [text fetch only; no screenshot]
  Implication: Use component.gallery as the comparison index when designing Tidefern's calendar (single date, range, month grid), the date-of-birth input (date input, not a picker), first-run empty states and the milestone timeline. Link these three pages from Tidefern's /design as external references; do not embed their content.

- Nord, a healthcare design system by Nordhealth, documents calendar range semantics and keyboard behaviour that match what Tidefern's cycle calendar needs, and advises a text input rather than a picker for date of birth.
  Source: https://nordhealth.design/components/calendar/ (checked 2026-10-04, confidence medium)
  Evidence: "Use when the user needs to choose a single date or a date range." "Close calendar after a single date is selected, unless a range with a start and end date is required." "Set range to select a start and end date instead of a single day. The first click sets the start, the second sets the end (the two are swapped if the second is earlier), and the days in between are highlighted with a live preview as you hover." Keyboard: the component "manages keyboard navigation between days, so users can move through the grid and select a date with the keyboard alone" and is "built to closely follow W3C Date Picker Dialog example" with arrow keys, Page Up/Down, Home/End and Shift combinations for year navigation. "Don't use for entering date of birth. Use input component instead" and "Don't use for choosing a date that is over 10 years in the future or the past." Licence: npm view @nordhealth/css reports license "SEE LICENSE IN LICENSE.md" and the raw main/LICENSE.md returned 404, so the licence text was not verified. [text fetch only]
  Implication: Specify Tidefern's period-range logging exactly this way (first tap start, second tap end, swap if earlier, hover or drag preview), follow the WAI-ARIA Date Picker Dialog keyboard model via react-day-picker through shadcn/ui Calendar, and use a segmented date input for child date of birth and due date. Treat Nord as a behaviour reference only until its licence is confirmed.

- 21st.dev lists 78 calendar components for React and Tailwind, but its terms vest Marketplace content in 21st Labs Inc. and require visible link-backs on redistribution, so its components are inspiration rather than vendorable code.
  Source: https://21st.dev/terms (checked 2026-10-04, confidence high)
  Evidence: Homepage: "12,000+ hand-crafted React and Tailwind CSS components, templates, and shadcn themes by real design engineers"; components "use your design tokens, so they inherit your theme instead of fighting it" and install via the shadcn CLI format. /s/calendar: "Find 78 versatile calendar components for React, styled with Tailwind CSS and designed for seamless scheduling and date-picking in Next.js" (authors include shadcn, Ruixen, Hero UI, ShadcnSpace; variants include event calendars, habit trackers, heatmaps). Pricing: Hobby "$0/mo" with "2 free copies / day"; Builder "$6/mo billed yearly". Terms (fetched summary): 21st Labs Inc. owns Marketplace content; "Removing, copying, or otherwise obtaining the underlying component code does not grant any right to our demos, previews, or associated media"; redistribution elsewhere requires "a clear and visible link back to the original component page on 21st.dev"; publishers building on open source must "keep their licence and give visible credit to the original author". The GitHub repo serafimcloud/21st is MIT but its README is silent on per-component licensing. [text fetch only]
  Implication: Do not copy 21st.dev calendar or timeline code into Tidefern. Build the calendar on shadcn/ui Calendar (react-day-picker) directly and use 21st.dev only to survey layouts (month grid density, range highlight, habit-tracker heatmaps). If any snippet is ever taken, record its origin and licence in the component header.

- details.so indexes UI details rather than full pages, with Health (39 entries) and Timeline (18 entries) filters, but the full library, remixing and code vault sit behind $9 and $19 per month plans and references are explicitly for inspiration, not copying.
  Source: https://details.so/inspo (checked 2026-10-04, confidence medium)
  Evidence: Heading: "The details behind the world's best websites." Filters: Industries include "Health" (39 entries); Sections include "Timeline" (18 entries), "Steps", "404"; Styles include "Minimal", "Editorial", "Organic"; Effects include "Page transitions", "Scroll animations". Plans: "Free: Browse limited inspiration", "Pro ($9/month): Full library access, remix capabilities", "Vault ($19/month): Code snippets and AI integration" with MCP integration for Claude Code, Cursor, Codex and v0. Usage: "references are for training and inspiration, not direct copying." The guessed path /industries/health returned 404. [text fetch only]
  Implication: Worth one Pro month if the owner wants to browse Health and Timeline details while designing the pregnancy week view and milestone timeline; otherwise skip. Nothing from the Vault should be pasted into Tidefern without reading its licence.

- landing.love, inspora.design and rebrand.gallery are primarily motion-, trend- and identity-driven showcases with limited relevance to a calm health product, and their useful filters (Light Mode, Serif, Warm, Healthcare) are either small or gated.
  Source: https://www.landing.love/ (checked 2026-10-04, confidence medium)
  Evidence: landing.love: "the best 2163 Animation Websites" with full-page video recordings; filters "Dark Mode (634)", "Light Mode (88)", "Minimal (1,383)", GSAP (191), WebGL (134); "All screenshots © of their respective owners."; the collection URLs /websites/ and /websites/light-mode returned 404. inspora.design: "Updated hourly" feed with filters All, Web, Branding, Product, Motion, Illustration, 3D, Print; entries described as dither and ASCII art cards, liquid metal effects, jelly themes; no licence stated. rebrand.gallery: "The curated reference library for brand designers" with filters Typography (Sans Serif, Serif, Display, Mono), Feels (Vibrant, Modern, Confident, Human, Warm), Industries (Healthcare); the healthcare page shows the heading "Healthcare branding", counts 28 identities, and asks to "Keep browsing with a free account"; footer "© 2026 Rebrand. All rights reserved." [text fetch only]
  Implication: Treat these as counter-signals: Tidefern's marketing site should sit in the small light-mode, minimal, serif-and-warm intersection, not the dark WebGL mainstream these galleries reward. rebrand.gallery's Healthcare plus Serif plus Warm filter is the one worth a free account for identity references, viewed but never copied.

- amicro.vercel.app is a Vite single-page app for a Motion-powered React micro-interaction library (MIT on npm) whose catalogue is mostly 3D card spreads, cover flows and dithered charts; it is a reject for Tidefern's restraint, apart from two chart interaction ideas.
  Source: https://amicro.vercel.app/ (checked 2026-10-04, confidence high)
  Evidence: HTML title: "Amicro, Premium React Micro-transitions & Interaction Components"; meta description: "Add beautiful, lightweight, and tree-shakeable micro-interactions and transition components to your React website with a single CLI command." WebFetch saw only the title because the page is a Vite SPA (assets/index-JxbPLTrQ.js). sitemap.xml routes: /buttons, /cards, /carousels, /loaders, /text-animations, /dither-charts, /mono-charts, /3d, /cli, /skills. Bundle strings: "Apple-style perspective depth card stack with a scrubber timeline controls.", "Canvas area growth line graph with white dither tiles & date scrubber cursor.", "Click time period pills (Week, Month, Quarter, Year) to animate segment data.", install "npx @subhanhq/amicro@latest add card-cover-flow". npm view @subhanhq/amicro: version 1.0.1, license MIT. [HTML and bundle inspection only; no screenshot]
  Implication: Do not adopt amicro components. Two ideas transfer: period pills (Week, Month, Cycle, Year) above gentle charts, and a date scrubber on the pregnancy or cycle line, both implemented with Tidefern's own tokens and transform/opacity-only motion.

- The Vercel web-design-guidelines skill is a thin MIT-licensed wrapper that fetches a 190-line rule file at run time; its rules on animation, dark mode, forms, Intl formatting and empty states align with the Phloom-derived direction, with one copy-style conflict.
  Source: https://skills.sh/vercel-labs/agent-skills/web-design-guidelines (checked 2026-10-04, confidence high)
  Evidence: skills.sh: install "npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines", 698.4K installs, security audits Pass (Gen Agent Trust Hub, Snyk) and Warn (Socket). SKILL.md (raw): "Fetch fresh guidelines before each review: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md" then "Output findings in the terse file:line format". Licence: repo README line 237 "## License" followed by "MIT" (no LICENSE file at the repo root; raw LICENSE, LICENSE.md, LICENSE.txt all 404); the rules repo vercel-labs/web-interface-guidelines has an MIT LICENSE "Copyright (c) 2025 Vercel Labs". command.md rules relevant to Tidefern: "Honor prefers-reduced-motion", "Animate transform/opacity only", never transition all, "color-scheme: dark on <html> for dark themes", "<meta name=\"theme-color\"> matches page background", "Dates/times: use Intl.DateTimeFormat not hardcoded formats", "font-variant-numeric: tabular-nums for number columns/comparisons", "Use text-wrap: balance or text-pretty on headings", "Handle empty states", "URL reflects state", "Destructive actions need confirmation modal or undo window", "Placeholders end with … and show example pattern", "Error messages include fix/next step". Conflict: command.md says "Title Case for headings/buttons (Chicago style)" while Phloom uses sentence case below page titles.
  Implication: Install the skill as a pre-merge audit for Tidefern UI files, but vendor a dated copy of command.md next to it because the skill depends on a live GitHub fetch. Decide the capitalisation rule up front (recommend sentence case everywhere except page titles for a calmer tone) and expect the audit to flag it.

- The find-skills skill is an MIT-licensed discovery helper around the npx skills CLI; it is optional for Tidefern and its own guidance is to prefer skills with over 1,000 installs from official sources.
  Source: https://skills.sh/vercel-labs/skills/find-skills (checked 2026-10-04, confidence high)
  Evidence: skills.sh: install "npx skills add https://github.com/vercel-labs/skills --skill find-skills", 3.7 million installs, first seen January 26, 2026. SKILL.md (raw): "The Skills CLI (npx skills) is the package manager for the open agent skills ecosystem"; commands "npx skills find [query] [--owner <owner>]", "npx skills add <package>", "npx skills update"; "Do not recommend a skill based solely on search results" and "Prefer skills with 1K+ installs. Be cautious with anything under 100." Licence: raw LICENSE in vercel-labs/skills is "MIT License / Copyright (c) 2026 Vercel, Inc."
  Implication: Optional. Install only if the owner wants in-session discovery; it adds no design value by itself. The web-design-guidelines skill can be installed directly without it.

- Fraunces (serif) and Nunito Sans (sans) are both OFL-licensed variable families on Google Fonts and form a warm, soft pairing that is distinct from Phloom's Figtree plus Instrument Serif.
  Source: https://fonts.google.com/metadata/fonts/Fraunces (checked 2026-10-04, confidence high)
  Evidence: Google Fonts metadata (the specimen pages render only via JavaScript, so the JSON metadata endpoint was read): Fraunces: license "ofl", category "Serif", designers Undercase Type (Phaedra Charles, Flavia Zimbardi), axes SOFT 0 to 100, WONK 0 to 1, opsz 9 to 144, wght 100 to 900, 18 static styles, lastModified 2025-09-10. Nunito Sans (https://fonts.google.com/metadata/fonts/Nunito%20Sans): license "ofl", category "Sans Serif", designers Vernon Adams, Jacques Le Bailly, Manvel Shmavonyan, Alexei Vanyashin, axes YTLC 440 to 540, opsz 6 to 12, wdth 75 to 125, wght 200 to 1000, lastModified 2025-09-16.
  Implication: A defensible default for Tidefern: Fraunces at opsz 72 to 144 with SOFT raised for display and page titles, Nunito Sans for interface, plus a mono only for codes. Self-host via next/font to avoid third-party requests on authenticated screens. The owner should confirm the pairing visually before it is locked into tokens.

### Recommendations

- (advisory) Build Tidefern's /design as a live, truthful catalog inside the Next.js app: a hub page plus Foundations, Brand, Color, Type and Space, Components, Motion chapters that import the real primitives and read token values from computed styles, each with a one-line poetic blurb, in-page anchors, and BACK/NEXT chapter navigation.
  Why: Phloom's pages demonstrate that specimens drawn from the running document cannot drift from what ships, and that per-chapter anchors (#palette, #semantic, #glass, #derived, #theming, #actions, #forms, #page-patterns) make a long chapter navigable. The hub, blurbs and footer navigation give a consistent reading order on mobile too.
  Rejected: A Storybook or separate docs site (duplicates components and drifts); static Figma exports (cannot show live tokens or reduced-motion state); Markdown-only tokens page (no specimens, no contrast proof).

- (advisory) Add what Phloom lacks: a token manifest in packages/tokens that drives both globals.css and the /design chips, with "Copy as CSS" and "Download tokens.json" actions and printed contrast ratios on every plate.
  Why: Phloom reads tokens live but offers no export; Tidefern needs the same values later for Expo and for the marketing site, so a single manifest keeps web, native and docs in step while the live readout keeps the page honest.
  Rejected: Hand-maintained JSON beside CSS (drifts); Style Dictionary pipeline now (too heavy for a solo developer at two users).

- (consequential) Define colour roles as triples: fill, foreground measured on the fill, and an ink member for text on page and tints; author everything in oklch; ship two non-inverted themes (warm paper light, deep green-blue night) with the theme class on <html>, color-scheme set, and a matching theme-color meta.
  Why: Phloom's measured ratios (fill 3.94:1 versus plate 5.63:1 and ink derived in CIE L*) show that a single status colour cannot serve both surface and text; cycle, pregnancy and milestone states will live on tinted calendar cells where this matters most. WIG rules require color-scheme and theme-color for correct scrollbars and inputs.
  Rejected: Inverted dark theme (brand colours glow off neutral black); hex palettes (no perceptual derivation); relying on Tailwind defaults (not semantic, no ink tier).

- (consequential) Use relative colour syntax and color-mix for derived tokens only with static fallbacks declared first, wrap corner-shape squircles in @supports, and do not use scroll-driven animations.
  Why: web-features data shows relative colour is Baseline low (Safari 18, Firefox 128, Chrome 125) and corner-shape is Chrome and Edge 139 only; family devices often run older Safari, and a missing fallback leaves unparsed colours.
  Rejected: Derive everything at run time like Phloom without fallbacks (breaks older Safari); avoid modern colour entirely (loses one-hue theming).

- (consequential) Adopt a motion contract: one editorial easing and one shell easing exported from a motion-tokens module, named entrance beats per page, transform and opacity only, transition-all forbidden by lint, reduced motion degrading to instant and never hidden, and entrance animation limited to above-the-fold content.
  Why: Phloom's rules produce calm, consistent feedback and its reduced-motion stance avoids blank pages; the observed blank lower half of its components screenshot shows why off-screen content must never wait at opacity 0 (visual tests, print, scroll restoration).
  Rejected: Per-component ad hoc animation (drift); heavy GSAP or WebGL motion seen on landing.love (counter to a calm health product).

- (advisory) Type system: serif for page titles, child names and milestone headings only; sans for all interface text; mono only for codes; the scale exposed as named utilities rendered live; tabular numerals on every compared column. Candidate faces Fraunces plus Nunito Sans, self-hosted with next/font, pending the owner's visual approval.
  Why: Phloom's three-jobs split reads as calm rather than literary and its tabular specimen is persuasive; both candidate faces are OFL variable families and avoid copying Phloom's pairing.
  Rejected: Instrument Serif plus Figtree (Phloom's identity); serif for body copy (harder to read at small sizes, per Phloom's own review); Google Fonts CDN loading on authenticated screens (third-party request).

- (consequential) Calendar and date inputs: build on shadcn/ui Calendar (react-day-picker) with Nord-style range semantics (first tap start, second tap end, swap if earlier, hover or drag preview) and WAI-ARIA Date Picker Dialog keyboard support; use a segmented date input for date of birth and due date; never vendor 21st.dev calendars.
  Why: component.gallery and Nord document these behaviours across mature systems; 21st.dev's terms vest marketplace content in 21st Labs and require link-backs, which is incompatible with a privacy-sensitive product's clean licensing.
  Rejected: 21st.dev calendar components (licensing); custom calendar from scratch (accessibility cost); date picker for date of birth (Nord advises against it).

- (advisory) Write first-run and empty states with the Phloom formula (what would be here, why it is not, the one action that changes it) and apply the voice rules: no em dashes in user-facing copy, errors say what to do next, sentence case below page titles, no accent hairline under headings.
  Why: Tidefern's dashboard, calendar, pregnancy view and milestone timeline all start empty for the two first users; the formula turns each empty screen into onboarding without a separate wizard.
  Rejected: Generic "No results" placeholders; a multi-step onboarding tour (more surface to maintain than content-led empty states).

- (advisory) Install the Vercel web-design-guidelines skill (MIT) as a pre-merge UI audit, vendor a dated copy of command.md beside it, and treat find-skills as optional.
  Why: The rule file matches this direction (reduced motion, transform/opacity, color-scheme, Intl dates, tabular nums, empty states, URL state, undo for destructive actions) and the skill fetches it live, so a pinned copy keeps audits reproducible offline.
  Rejected: Writing a bespoke checklist from scratch (duplicates a maintained MIT list); installing find-skills by default (adds discovery, not design value).

### Verified snippets

#### Feature-test relative colour syntax before relying on derived tokens (MDN pattern); declare the static fallback first in Tidefern's globals.css

Source: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_colors/Relative_colors

```
@supports (color: hsl(from white h s l)) {
  /* safe to use hsl() relative color syntax */
}
```

#### Gate corner-shape squircles (Chrome and Edge 139 only) behind a feature query, as MDN shows and as Phloom does for its card radii step-up

Source: https://developer.mozilla.org/en-US/docs/Web/CSS/corner-shape

```
@supports not (corner-shape: scoop) {
  body::before {
    content: "Your browser does not support the 'corner-shape' property.";
    /* fallback styles */
  }
}
```

#### Install the Vercel web-design-guidelines audit skill (MIT)

Source: https://skills.sh/vercel-labs/agent-skills/web-design-guidelines

```
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

#### Optional: install the find-skills discovery skill (MIT)

Source: https://skills.sh/vercel-labs/skills/find-skills

```
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

#### The rule source the web-design-guidelines skill fetches at run time; vendor a dated copy for reproducible audits

Source: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

#### Dark mode and theming rules from the Web Interface Guidelines that Tidefern's root layout must satisfy

Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

```
### Dark Mode & Theming

- `color-scheme: dark` on `<html>` for dark themes (fixes scrollbar, inputs)
- `<meta name="theme-color">` matches page background
- Native `<select>`: explicit `background-color` and `color` (Windows dark mode)
```

#### Skill audit output format expected by the web-design-guidelines rule file (for CI parsing)

Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

```
## src/Button.tsx

src/Button.tsx:42 - icon button missing aria-label
src/Button.tsx:18 - input lacks label
src/Button.tsx:55 - animation missing prefers-reduced-motion

## src/Card.tsx

✓ pass
```

### Open questions

- Phloom's copy says "the theme toggle in the header above is the demo", but no toggle was visible in the 1440 px light header crop (only the mark, a back arrow and the Design Language breadcrumb); the dark capture came from OS colour-scheme emulation. Confirm whether Tidefern wants an explicit in-page theme switch on /design or system-only.
- Capitalisation conflict: the Web Interface Guidelines rule file wants Title Case for headings and buttons, Phloom uses Title Case for page titles and sentence case elsewhere. Tidefern needs one rule before copy and lint are written.
- Font pairing (Fraunces plus Nunito Sans) is a verified-licence candidate, not an approved identity; the owner should review specimens at display and 14 px body sizes, and decide on a mono face.
- Whether to adopt corner-shape squircles at all given Chrome and Edge 139 only support; the @supports pattern is safe but adds a second radius tier to maintain.
- Nord's licence could not be read (npm says SEE LICENSE IN LICENSE.md, raw main/LICENSE.md 404); it is cited only as a behaviour reference, not as code.
- component.gallery states no licence on its homepage; its content is used here only as an index of links.
- Phloom's lower component sections (Overlays, Structure, Page patterns) did not paint in the full-page capture; the cause (viewport-gated entrance animation) is inferred from its motion chapter, not proven. Worth a quick manual check before copying its entrance pattern.
- details.so Health and Timeline entries and rebrand.gallery Healthcare identities require a free account or Pro plan; decide whether a one-month subscription is worth it for the pregnancy week view and timeline design pass.

### Sources that could not be read

- Chromium screenshots of https://amicro.vercel.app/, https://www.landing.love/, https://www.rebrand.gallery/, https://component.gallery/, https://details.so/, https://inspora.design/ and https://21st.dev/: Playwright's bundled Chromium reported ERR_CERT_AUTHORITY_INVALID through the session proxy even with the NSS store present and with the suggested npx playwright screenshot command; the Phloom batch succeeded by pinning Chromium's trust to the proxy CA's SPKI hash, but the permission classifier denied the second batch (TLS/Auth weaken), so these seven sites were inspected as fetched text only and have no evidence screenshots.
- https://www.landing.love/websites/light-mode and https://www.landing.love/websites/ returned 404; the light-mode collection could not be opened by URL.
- https://details.so/industries/health returned 404 (guessed path); the Health filter counts came from https://details.so/inspo.
- https://www.rebrand.gallery/industries/healthcare is gated behind a free account; only the heading and the count of 28 identities were visible.
- https://component.gallery/design-systems/nord/ returned 404 (guessed slug); Nord was read directly at nordhealth.design instead.
- https://21st.dev/pricing contains no licence text; licence terms came from https://21st.dev/terms as a fetched summary, not a verbatim legal read.
- https://fonts.google.com/specimen/Fraunces and /specimen/Nunito+Sans render only via JavaScript; licence and axes were read from the fonts.google.com/metadata/fonts JSON endpoint instead.
- https://raw.githubusercontent.com/vercel-labs/agent-skills/main/LICENSE (and LICENSE.md, LICENSE.txt, license) returned 404; the MIT statement comes from the repository README line 237 and the GitHub repository page.
- https://raw.githubusercontent.com/nordhealth/design-system/main/LICENSE.md returned 404.
- gh api repos/vercel-labs/* returned HTTP 403 (repository access not enabled for this session), so star counts and licence metadata were taken from skills.sh and the GitHub HTML pages via WebFetch.
- MDN browser-compatibility tables for corner-shape and relative colour syntax were not included in the fetched page text; Baseline and version data were taken from the web-features data.json package via unpkg instead.
- amicro's Terms and License page text is inside a lazily loaded SPA chunk and was not retrieved; the MIT licence was confirmed from the npm registry entry for @subhanhq/amicro instead.

## fonts-brand

<a id="fonts-brand"></a>

Dimension: Typography and brand asset strategy

### Summary

All 14 candidate fonts are SIL OFL 1.1 per the google/fonts METADATA.pb files checked today, but two shortlist entries are weaker than their reputations: Instrument Serif ships as static Regular and Italic only (no variable axes, no @fontsource-variable package), and Fraunces has no tabular figures and its default instance is Black at optical size 9, so the wght-only fontsource file renders the chunky 9pt cut rather than the high-contrast display cut. Measured stroke contrast on a rasterized lowercase o puts Fraunces at opsz 144 far ahead (11.0 thick/thin), then Cormorant Garamond (3.67) and Instrument Serif (3.10), with Newsreader at opsz 72 (2.41) and EB Garamond (2.93) in the moderate band; Cormorant is the closest literal match to an old-style high-contrast wordmark but its 0.386 x-height makes it unsuitable for UI headings at 14 to 16 px. The recommended pairing is Newsreader (opsz plus wght variable file, tabular figures built in, 132 KB Latin WOFF2) for headings and the outlined wordmark, with Figtree (20 KB Latin WOFF2, wght 300 to 900, tnum and pnum, described by Google Fonts as retaining punch in uppercase for labels) for UI, body and the tracked uppercase tagline; the fallback pairing is EB Garamond plus Plus Jakarta Sans. Next.js 16.3.8 docs confirm next/font/local accepts weight ranges such as "200 800", adjustFontFallback of "Arial", "Times New Roman" or false, and a declarations array; the loader source rejects src, font-display, font-weight and font-style inside declarations. OFL FAQ 2.1 explicitly allows self-hosting via @font-face, 2.6 says subsetting is modification (so pick RFN-free families, which Newsreader and Figtree are), and 1.10 says the license text must accompany distributed fonts, so each vendored font needs its OFL.txt in the repo; pyftsubset drops the license name IDs by default unless --name-IDs+=13,14 is passed. Next.js 16 metadata conventions verified: favicon.ico only in app/ root, icon.svg gets sizes="any", apple-icon must be jpg or png, manifest.ts types icon purpose as any, maskable or monochrome, opengraph-image accepts static png/jpg/gif plus an .alt.txt, and ImageResponse only takes ttf, otf or woff within a 500 KB bundle, so a static 1200x630 PNG built by sharp is the simpler path. A working pipeline was proven today in the scratchpad: hand-authored 512 viewBox SVG to 16/32/48/180/192/512 PNGs with sharp 0.35.5 (and resvg-js 2.6.2), favicon.ico with png-to-ico 3.0.2, 1200x630 card with sharp composite, SVGO 4.1.0 minification. WCAG 2.2 contrast math (sRGB 0.04045 threshold, 4.5:1, 3:1, large text 24px or 18.5px bold, no rounding) shows the brand's light neutrals and mid accents fail against each other: Sea Glass 500, Clay 500, Sage, Sand and Stone must never carry text on Mist or white, while Fern 700/900 text on Mist, White, Sand, Stone and Sage pass AA normal comfortably, and Fern 900 text on Sea Glass 500 (4.78) and Clay 500 (4.61) rescues those accents as filled chips. Stone on Mist is 1.30, so Stone can only be a decorative divider; control boundaries need Sea Glass 600 (3.64 on Mist) or darker to satisfy 1.4.11. Icon safe zones come from primary specs: W3C maskable safe zone is a 40% radius circle (about 10% padding), Android keeps the inner 66 of 108 dp, Apple wants square unmasked 1024 px layers with system-applied corners, and Chromium requires 192 and 512 px manifest icons.

### Findings

- Every shortlisted family is licensed OFL per the google/fonts repository METADATA.pb, and the repo README states these are the exact TTFs Google Fonts serves, with the license file in each family directory.
  Source: https://raw.githubusercontent.com/google/fonts/main/README.md (checked 2026-10-04, confidence high)
  Evidence: README: "The top-level directories indicate the license of all files found within them." and "Each family subdirectory contains the .ttf font files served by Google Fonts, plus a METADATA.pb file" and "Most of the fonts in the collection use the SIL Open Font License, v1.1." METADATA.pb for newsreader, fraunces, cormorantgaramond, ebgaramond, sourceserif4, lora, instrumentserif, figtree, plusjakartasans, albertsans, instrumentsans, nunitosans, dmsans, onest all read license: "OFL" (fetched from https://raw.githubusercontent.com/google/fonts/main/ofl/<dir>/METADATA.pb).
  Implication: Any of the 14 can be self-hosted. Raw download pattern verified today: https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/<FileName>%5Baxes%5D.ttf (brackets URL-encoded), plus OFL.txt in the same directory.

- Serif axes and weight ranges, read from the fvar tables of the downloaded TTFs: Newsreader opsz 6 to 72 and wght 200 to 800 (default 400 at opsz 18); Fraunces SOFT 0 to 100, WONK 0 to 1, opsz 9 to 144, wght 100 to 900 with defaults wght 900, opsz 9, WONK 1; Cormorant Garamond wght 300 to 700 only; EB Garamond wght 400 to 800; Source Serif 4 opsz 8 to 60 and wght 200 to 900; Lora wght 400 to 700; Instrument Serif has no fvar table (static Regular and Italic only). All except Instrument Serif and Onest ship a separate italic variable file.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/METADATA.pb (checked 2026-10-04, confidence high)
  Evidence: METADATA.pb for Fraunces lists axes SOFT 0 to 100, WONK 0 to 1, opsz 9 to 144, wght 100 to 900 and full_name "Fraunces 9pt Black"; the Fraunces README table states Default opsz "144pt" but the shipped TTF fvar default read by fontTools is opsz 9.0, wght 900.0, WONK 1.0. Instrument Serif METADATA.pb lists only InstrumentSerif-Regular.ttf and InstrumentSerif-Italic.ttf with no axes block. fontTools fvar dump for Newsreader: [('wght', 200, 400, 800), ('opsz', 6, 18, 72)].
  Implication: Instrument Serif cannot be declared with a weight range and has no @fontsource-variable package (npm 404 verified). Fraunces needs explicit font-variation-settings or the opsz file to look like its display cut; the wght-only fontsource file pins opsz at 9.

- Sans axes and weights from fvar: Figtree wght 300 to 900; Plus Jakarta Sans 200 to 800; Albert Sans 100 to 900; Instrument Sans wdth 75 to 100 and wght 400 to 700; Nunito Sans YTLC, opsz 6 to 12, wdth 75 to 125, wght 200 to 1000; DM Sans opsz 9 to 40 and wght 100 to 1000; Onest wght 100 to 900 with no italic file.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/METADATA.pb (checked 2026-10-04, confidence high)
  Evidence: Figtree METADATA.pb: filename "Figtree[wght].ttf", axes wght min 300 max 900, plus "Figtree-Italic[wght].ttf". Onest METADATA.pb lists only "Onest[wght].ttf" with no italic entry. Nunito Sans METADATA.pb lists YTLC 440 to 540, opsz 6 to 12, wdth 75 to 125, wght 200 to 1000.
  Implication: Figtree and Plus Jakarta Sans offer the simplest single-axis files. Onest has no italics, which matters for emphasis in body copy.

- Tabular figures (OpenType tnum) are present in Newsreader, EB Garamond, Cormorant Garamond (tnum but no pnum), Source Serif 4, Lora, Figtree, Plus Jakarta Sans, Instrument Sans and Onest; absent in Fraunces, Instrument Serif, Albert Sans, DM Sans and Nunito Sans (Nunito Sans digits are all 600 units wide by default, so they align without the feature). Newsreader, EB Garamond, Source Serif 4 and Nunito Sans have equal-width digits by default.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf (checked 2026-10-04, confidence high)
  Evidence: fontTools GSUB FeatureList dump run today on each downloaded TTF: Newsreader features ['tnum','pnum','liga','case','sups'] with digit advance widths all 1100 units; Figtree ['tnum','pnum','ss01','ss02','case','frac','subs','sups']; Fraunces ['ss01','liga','case'] only; DM Sans ['ss01','ss02','liga','case','frac','calt','sups'] with digit widths [342..656]; Albert Sans ['ss01','ss02','liga','frac','sups'].
  Implication: Cycle-day counters, dates and weight charts need aligned numerals; prefer Newsreader and Figtree (both expose tnum and pnum, usable through font-variant-numeric: tabular-nums, Tailwind class tabular-nums). Fraunces, DM Sans and Albert Sans are poor choices for data-heavy screens.

- Fontsource variable packages exist for every candidate except Instrument Serif, all at version 5.3.0 (Onest 5.3.1), license OFL-1.1, and ship Latin-only variable WOFF2 files under files/ named <id>-latin-<axes>-<style>.woff2. Latin normal sizes: Newsreader wght 58,084 B and opsz (wght+opsz) 132,000 B; Fraunces wght 36,620 B, opsz 67,304 B, full 121,016 B; Cormorant Garamond 37,640 B; EB Garamond 44,336 B; Source Serif 4 wght 50,824 B, opsz 122,360 B; Lora 37,788 B; Instrument Serif static 21,032 B; Figtree 20,156 B; Plus Jakarta Sans 27,348 B; Albert Sans 32,020 B; Instrument Sans wght 30,092 B; Nunito Sans wght 31,076 B; DM Sans wght 36,932 B, opsz 62,724 B; Onest 33,760 B.
  Source: https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable/newsreader@5.3.0?structure=flat (checked 2026-10-04, confidence high)
  Evidence: npm view today: @fontsource-variable/newsreader version 5.3.0 license OFL-1.1; @fontsource-variable/figtree 5.3.0; @fontsource/instrument-serif 5.3.0 (static); @fontsource-variable/instrument-serif returns E404. jsdelivr file listing: /files/newsreader-latin-opsz-normal.woff2 132000 bytes, /files/newsreader-latin-wght-normal.woff2 58084 bytes, /files/figtree-latin-wght-normal.woff2 20156 bytes. fontTools on the downloaded newsreader-latin-wght-normal.woff2: axes [('wght', 200, 400, 800)] only; on newsreader-latin-opsz-normal.woff2: wght plus opsz 6 to 72; fraunces-latin-wght-normal.woff2: axes [('wght', 100, 900, 900)] with opsz pinned at its default of 9. Each package bundles a LICENSE file beginning with the family copyright and "This Font Software is licensed under the SIL Open Font License, Version 1.1."
  Implication: Download pattern: https://cdn.jsdelivr.net/npm/@fontsource-variable/<id>@5.3.0/files/<id>-latin-<axes>-<style>.woff2, or pnpm add the package and copy from node_modules. For Newsreader ship the opsz file (132 KB) so font-optical-sizing: auto can vary contrast between 16 px headings and 72 px display; the wght-only file freezes it at opsz 18.

- Measured stroke contrast (thick/thin stem ratio of a 400 px lowercase o) and x-height ratios: Fraunces opsz 144 11.0 (x-height 0.482); Cormorant Garamond 3.67 (0.386); Instrument Serif 3.10 (0.510); EB Garamond 2.93 (0.400); Source Serif 4 opsz 60 2.50 (0.475); Newsreader opsz 72 2.41 and opsz 18 2.20 (0.426); Lora 2.35 (0.500). Official descriptions: Fraunces is a display "Old Style" soft-serif; Cormorant is a display family inspired by Garamond; EB Garamond is a close revival of Garamont; Source Serif 4 is transitional (Fournier); Lora has moderate contrast for body text; Instrument Serif is condensed display with old-style characteristics; Newsreader is for continuous on-screen reading.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/DESCRIPTION.en_us.html (checked 2026-10-04, confidence medium)
  Evidence: DESCRIPTION.en_us.html texts: Fraunces "is a display, 'Old Style' soft-serif typeface inspired by the mannerisms of early 20th century typefaces such as Windsor, Souvenir, and the Cooper Series"; Cormorant "is a free display type family"; EB Garamond "reproduces the original design by Claude Garamont closely"; Source Serif 4 "is a serif typeface in the transitional style"; Lora "is a text typeface with moderate contrast well suited for body text"; Instrument Serif "is a condensed display font... intended for use at large sizes and offers a contemporary take on... old-style serifs"; Newsreader is "primarily intended for continuous on-screen reading". Pixel measurements and OS/2 sxHeight/unitsPerEm computed today with Pillow 12 and fontTools 4.66.1 on the google/fonts TTFs (specimen images saved in the scratchpad).
  Implication: Closest literal match to "high-contrast old-style serif" for the wordmark is Cormorant Garamond (Garamond model, highest contrast among the true old-styles) but its x-height is the lowest of the set and it has no opsz axis, so it would be weak for 14 to 16 px UI headings. Newsreader at opsz 72 gives a crisp, moderately high contrast wordmark and stays legible for headings, which is why it is the single-serif recommendation; the wordmark will be outlined to SVG anyway, so the owner may approve Cormorant for the wordmark only without shipping it as a webfont.

- For a widely tracked uppercase geometric tagline, Figtree and Plus Jakarta Sans are the two geometric candidates with tabular figures; Google's Figtree description explicitly calls out uppercase use for buttons and short labels, and Plus Jakarta Sans cites Futura and Neuzeit Grotesk. Albert Sans and DM Sans are geometric but lack tnum; Instrument Sans and Onest are grotesque hybrids; Nunito Sans is humanist with a rounded heritage.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/article/ARTICLE.en_us.html (checked 2026-10-04, confidence medium)
  Evidence: Figtree article: "Figtree is a clean yet friendly geometric sans serif font for usage in web and mobile apps. It's light-hearted and crisp when used for text, yet still retains some punch when used in uppercase, perfect for buttons and short labels." Plus Jakarta Sans description: "a fresh take on geometric sans serif styles... Taking inspiration in Neuzeit Grotesk, Futura, and 1930s grotesque sans serifs with almost monolinear contrast". Albert Sans: "a modern geometric sans serif family". DM Sans: "a low-contrast geometric sans serif design, intended for use at smaller text sizes". Onest: "a hybrid of geometric and humanistic grotesques". Rendered specimen today (sans-specimen.png) of "LIFE FLOWS TOGETHER" at 0.18em tracking in each candidate confirmed even uppercase rhythm in Figtree and Plus Jakarta Sans.
  Implication: Use Figtree for UI, body and the tagline (one 20 KB file, tnum available, x-height 0.500 reads well at 14 to 16 px). Plus Jakarta Sans is the fallback sans (27 KB, taller 0.536 x-height, more Futura-like O).

- next/font/local in Next.js 16.3.8 takes src as a string or an array of {path, weight, style}, weight as a single value or a range string such as "100 900" for variable fonts, display default "swap", preload default true, adjustFontFallback as "Arial" (default), "Times New Roman" or false, a variable option for a CSS custom property, and a declarations array of @font-face descriptors; the loader source rejects declarations for src, font-display, font-weight and font-style and generates one @font-face per src entry using that entry's weight and style.
  Source: https://nextjs.org/docs/app/api-reference/components/font (checked 2026-10-04, confidence high)
  Evidence: Docs (version 16.3.8): "weight: '100 900': A string for the range between 100 and 900 for a variable font"; "For next/font/local: A string or boolean false value that sets whether an automatic fallback font should be used to reduce Cumulative Layout Shift. The possible values are 'Arial', 'Times New Roman' or false. The default is 'Arial'."; "declarations: [{ prop: 'ascent-override', value: '90%' }]". Source packages/font/src/local/validate-local-font-function-call.ts (canary): "if (['src', 'font-display', 'font-weight', 'font-style'].includes(declaration?.prop)) { nextFontError(`Invalid declaration prop: ...`) }" and loader.ts emits ['font-weight', weight ?? defaultWeight] per src file.
  Implication: Declare Newsreader with weight '200 800' and adjustFontFallback 'Times New Roman'; Figtree with weight '300 900' (Arial fallback default). Roman and italic variable files go in one src array with style per entry. Put unicode-range or font-feature-settings in declarations only if needed; never font-weight.

- Tailwind CSS v4 maps next/font CSS variables through @theme inline, and the Next docs show exactly that pattern; the --font-* namespace produces font-<name> utilities and the inline keyword is required when a theme variable references another variable.
  Source: https://tailwindcss.com/docs/theme (checked 2026-10-04, confidence high)
  Evidence: Tailwind docs: "@theme inline { --font-sans: var(--font-inter); }" with "Using the inline option, the utility class will use the theme variable value instead of referencing the actual theme variable" and the namespace table "--font-* Font family utilities like font-sans". Next docs global.css example: "@import 'tailwindcss'; @theme inline { --font-sans: var(--font-inter); --font-mono: var(--font-roboto-mono); }".
  Implication: Define --font-serif: var(--font-newsreader) and --font-sans: var(--font-figtree) under @theme inline; apply the variable classNames on <html>.

- OFL permits self-hosting via @font-face (FAQ 2.1), treats subsetting as modification that is permitted but normally bars use of Reserved Font Names (2.6), allows WOFF/WOFF2 conversion without renaming only if font data is unchanged apart from compression (2.2.1), requires the license text to accompany the font except when embedded in a document or bundled within a program (1.10), and requires each distributed copy to carry the copyright notice and license (condition 2). Newsreader and Figtree copyright lines declare no Reserved Font Name; Lora and Source Serif 4 do.
  Source: https://openfontlicense.org/ofl-faq/ (checked 2026-10-04, confidence high)
  Evidence: 2.1: "loading the fonts dynamically as webfonts through CSS @font-face declarations is a much better method... This is recommended and explicitly allowed by the licensing model because it is distribution." 2.6: "Removing any parts of the font when delivering a webfont to a browser, including unused glyphs and smart font code, is considered modification. This is permitted by the OFL but would not normally allow the use of RFNs." 1.10: "The only situation in which an OFL font can be distributed without the text of the OFL (either in a separate file or in font metadata), is when a font is embedded in a document or bundled within a program." OFL text condition 2: "Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license." Condition 3: "No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted". METADATA.pb copyright lines: Lora "with Reserved Font Name \"Lora\""; Source Serif 4 "with Reserved Font Name 'Source'"; Newsreader and Figtree have no RFN clause.
  Implication: Vendor the Latin WOFF2 subsets alongside a copy of each family's OFL.txt (fontsource ships it as LICENSE; google/fonts as OFL.txt) in apps/web/src/fonts/, and list both fonts with copyright lines on an /about or /licenses page. Picking RFN-free Newsreader and Figtree avoids the rename question for subset files; next/font generates its own hashed font-family name so no RFN appears in CSS anyway.

- pyftsubset (fonttools 4.66.1 installed via pip today) subsets variable fonts while keeping fvar axes; --flavor=woff2 needs the brotli package; by default only name IDs 0 to 6 are kept, which silently drops the OFL license description (ID 13) and URL (ID 14) unless --name-IDs+=13,14 is passed. glyphhanger 6.0.0 is a wrapper that requires pyftsubset. A Latin subset of Newsreader with all layout features came to 137 KB WOFF2 with both axes and tnum/pnum intact.
  Source: https://fonttools.readthedocs.io/en/latest/subset/index.html (checked 2026-10-04, confidence high)
  Evidence: Docs: "--layout-features: Specify (=), add to (+=) or exclude from (-=) the comma-separated set of OpenType layout feature tags that will be preserved."; "WOFF2 requires the Brotli Python extension"; "By default, only nameIDs between 0 and 6 are preserved, the rest are dropped." Verified run today: output without the flag had nameID 13 missing; with --name-IDs+=13,14 nameID 13 reads "This Font Software is licensed under the SIL Open Font License, Version 1.1..." and nameID 14 "http://scripts.sil.org/OFL"; fvar axes [('wght', 200, 400, 800), ('opsz', 6, 18, 72)] retained. glyphhanger README: "Prerequisite: pyftsubset ... pip3 install fonttools brotli".
  Implication: Custom subsetting is optional because fontsource already ships Latin subsets; if the build agent re-subsets (for example dropping Vietnamese or trimming to ASCII for a marketing page), use the pyftsubset command in code_snippets and keep name IDs 13 and 14.

- Next.js 16.3.8 metadata file conventions: favicon.ico only in the top level of app/; icon accepts .ico .jpg .jpeg .png .svg anywhere under app/ and SVG gets sizes="any"; apple-icon accepts only .jpg .jpeg .png; numbered variants (icon0.svg, icon1.png) are allowed; manifest.ts returns MetadataRoute.Manifest whose icon type includes purpose 'any' | 'maskable' | 'monochrome'; opengraph-image accepts static .jpg .jpeg .png .gif with an opengraph-image.alt.txt sibling, or a .tsx route using ImageResponse.
  Source: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons (checked 2026-10-04, confidence high)
  Evidence: Docs: "The favicon image can only be located in the top level of app/." Table: favicon .ico app/; icon .ico .jpg .jpeg .png .svg app/**/*; apple-icon .jpg .jpeg .png app/**/*. "sizes=\"any\" is added to icons when the extension is .svg". Manifest docs: "Add or generate a manifest.(json|webmanifest) file ... in the root of app directory" and the app/manifest.ts example returning MetadataRoute.Manifest with an icons array. next@16.3.8 dist/lib/metadata/types/manifest-types.d.ts line 10: "purpose?: 'any' | 'maskable' | 'monochrome' | undefined". opengraph-image docs: supported file types .jpg .jpeg .png .gif, "opengraph-image file size must not exceed 8MB", and the alt.txt convention producing og:image:alt.
  Implication: File plan: app/favicon.ico, app/icon.svg, app/apple-icon.png (180x180, opaque Mist background), app/manifest.ts referencing /icons/icon-192.png, /icons/icon-512.png and /icons/icon-512-maskable.png in public/, app/opengraph-image.png plus app/opengraph-image.alt.txt.

- ImageResponse (next/og, built on Satori and resvg) only accepts ttf, otf and woff fonts, not woff2, within a 500 KB bundle, supports letterSpacing and textTransform, and renders images from base64 data URIs; so a dynamic opengraph-image.tsx would need a separate TTF copy of Newsreader, while a static PNG has no such constraint.
  Source: https://nextjs.org/docs/app/api-reference/functions/image-response (checked 2026-10-04, confidence high)
  Evidence: Docs: "Maximum bundle size of 500KB. The bundle size includes your JSX, CSS, fonts, images, and any other assets." and "Only ttf, otf, and woff font formats are supported. To maximize the font parsing speed, ttf or otf are preferred over woff." Satori README: "Satori currently supports three font formats: TTF, OTF and WOFF. Note that WOFF2 is not supported at the moment." and letterSpacing and textTransform listed as supported CSS.
  Implication: For a marketing-only, unchanging card, generate app/opengraph-image.png offline with sharp from the lockup SVG (verified pipeline) and skip ImageResponse. If per-page cards are wanted later, read Newsreader[opsz,wght].ttf (452 KB) is too big for the 500 KB bundle with Figtree too; subset to a static TTF first.

- The SVG to raster pipeline works end to end with the live versions: sharp 0.35.5 rasterizes SVG input (density option, default 72 DPI, up to 100000) to PNG but has no ICO or SVG output; @resvg/resvg-js 2.6.2 renders SVG to PNG with fitTo width; png-to-ico 3.0.2 (engines node >=20) packs 16/32/48 PNGs into favicon.ico; svgo 4.1.0 minified the hand-authored mark by 37% and preset-default no longer includes removeViewBox.
  Source: https://sharp.pixelplumbing.com/api-constructor/ (checked 2026-10-04, confidence high)
  Evidence: sharp docs: density "The DPI at which to render SVG and PDF images, in the range 1 to 100000" default 72; output docs list JPEG, PNG, WebP, GIF, JP2, TIFF, AVIF, HEIF, JXL and raw, no ICO. png-to-ico README: "const buf = await pngToIco(['electron16x16.png', 'electron32x32.png']); fs.writeFileSync('app.ico', buf);". resvg-js README: "fitTo: { mode: 'width', value: 1200 }" then "resvg.render().asPng()". svgo preset-default.js on main imports no removeViewBox plugin. Run today in the scratchpad: icon-16/32/48/180/192/512.png, icon-512-resvg.png, favicon.ico ("MS Windows icon resource - 3 icons"), opengraph-image.png 1200x630 RGBA; svgo "1.322 KiB - 37.1% = 0.831 KiB".
  Implication: Add a scripts/brand/generate-icons.mjs tooling step (sharp + png-to-ico) that regenerates every raster from design/brand/mark.svg; commit outputs so Vercel builds need no native step. Keep the viewBox attribute (svgo will not strip it).

- Icon safe zones from primary specs: the W3C manifest safe zone is a circle of radius 40% of the icon's minimum dimension and most maskable icons need about 10% padding; Android adaptive icons are 108 dp with only the inner 66 dp guaranteed visible and the outer 18 dp per side reserved for masks; Apple wants square, unmasked 1024x1024 layers because the system applies the rounded corners, prefers vector artwork with text converted to outlines, and advises against text in icons; Chromium requires at least 192x192 and 512x512 manifest icons; Safari web clips use apple-touch-icon with 180x180 for iPhone and 167x167 or 152x152 for iPad.
  Source: https://www.w3.org/TR/appmanifest/ (checked 2026-10-04, confidence high)
  Evidence: W3C: safe zone is "a circle with center point in the center of the icon and with a radius of 2/5 (40%) of the icon size" and "most icons will have around 10% padding on the top, bottom, right and left". Android: "The outer 18 dp on each of the four sides of the layers is reserved for masking" and the logo "must not exceed 66x66 dp". Apple HIG (app-icons JSON data): "For iOS, iPadOS, and macOS icons, provide square layers so the system can apply rounded corners... Providing layers with pre-defined masking negatively impacts specular highlight effects and makes edges look jagged"; "Include text only when it's essential to your experience or brand"; layout size "1024x1024 px". web.dev: "For Chromium, you must provide at least a 192x192 pixel icon and a 512x512 pixel icon." Apple Safari archive: link rel="apple-touch-icon" sizes="180x180", "167x167", "152x152".
  Implication: Author the mark on a 512 canvas with the frond and wave inside the central 410 px (80%) circle; export the web icon.svg with its own rx=112 rounded square, but export apple-icon.png and the Expo/App Store 1024 master as square full-bleed Mist with no corner rounding and no transparency; export a separate 512 maskable PNG with extra padding.

- WCAG 2.2 thresholds and math: 1.4.3 requires 4.5:1 for text and 3:1 for large-scale text (18 pt, or 14 pt bold, which the Understanding document converts to about 24 px and 18.5 px); 1.4.6 enhanced is 7:1 and 4.5:1; 1.4.11 requires 3:1 for UI components and graphical objects against adjacent colors; contrast ratio is (L1 + 0.05)/(L2 + 0.05) with relative luminance L = 0.2126R + 0.7152G + 0.0722B using the 0.04045 sRGB threshold; computed values must not be rounded up.
  Source: https://www.w3.org/TR/WCAG22/ (checked 2026-10-04, confidence high)
  Evidence: WCAG 2.2 glossary: "L = 0.2126 * R + 0.7152 * G + 0.0722 * B where ... if RsRGB <= 0.04045 then R = RsRGB/12.92 else R = ((RsRGB+0.055)/1.055) ^ 2.4" and "Before May 2021 the value of 0.04045 in the definition was different (0.03928)"; "contrast ratio (L1 + 0.05) / (L2 + 0.05)"; "large scale (text) with at least 18 point or 14 point bold". Understanding 1.4.3: "1pt = 1.333px, therefore 14pt and 18pt are equivalent to approximately 18.5px and 24px" and "the computed values should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)".
  Implication: The contrast table below uses exactly this formula (script contrast.py in the scratchpad). Treat 4.5 and 3.0 as hard floors; a Playwright + axe-core check should enforce them in CI.

- Computed WCAG 2.2 ratios for the palette. AA normal text (>= 4.5): White/Fern900 13.04, Mist/Fern900 11.96, Stone/Fern900 9.21, Sand/Fern900 9.17, White/Fern700 9.02, Mist/Fern700 8.28, Sage/Fern900 7.45, SeaGlass300/Fern900 6.52, Stone/Fern700 6.37, Sand/Fern700 6.35, Fern900/Clay300 6.12, White/Fern500 6.11, Mist/Fern500 5.60, White/SeaGlass700 5.41, Sage/Fern700 5.16, Mist/SeaGlass700 4.96, SeaGlass500/Fern900 4.78, Fern900/Clay500 4.61, SeaGlass300/Fern700 4.51. Large text and non-text only (3.0 to 4.49): Stone/Fern500 4.31, Sand/Fern500 4.30, Fern700/Clay300 4.23, White/SeaGlass600 3.97, Stone/SeaGlass700 3.82, Sand/SeaGlass700 3.81, White/Clay600 3.77, Mist/SeaGlass600 3.64, Sage/Fern500 3.49, Fern900/Clay600 3.46, Mist/Clay600 3.46, SeaGlass500/Fern700 3.31, SeaGlass600/Fern900 3.29, Fern700/Clay500 3.19, Sage/SeaGlass700 3.09, SeaGlass300/Fern500 3.05. Everything else fails all three, including Mist/SeaGlass500 2.50, White/SeaGlass500 2.73, Mist/Clay500 2.59, White/Clay500 2.83, Mist/Sage 1.60, Mist/Stone 1.30, Mist/Sand 1.30, Stone/Sand 1.00, Fern700/Fern900 1.45. Extra derived shades: Clay 800 #7F4C3A 6.43 on Mist and 4.93 on Sand; danger #A63D33 5.77 on Mist, 6.29 on white, 4.43 on Sand; danger-strong #8C3129 7.45 on Mist; Sea Glass 800 #2F5B55 7.01 on Mist.
  Source: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio (checked 2026-10-04, confidence high)
  Evidence: Relative luminance computed today per the WCAG 2.2 definition: White 1.0000, Mist 0.9131, Stone 0.6913, Sand 0.6886, Sage 0.5501, SeaGlass300 0.4748, SeaGlass500 0.3349, SeaGlass600 0.2145, SeaGlass700 0.1440, Fern500 0.1219, Fern700 0.0664, Fern900 0.0305, Clay300 0.4424, Clay500 0.3214, Clay600 0.2286. Full 105-pair CSV saved at /tmp/claude-0/-home-user/84c43d3b-6d57-58cc-9ef5-34bdf07dace1/scratchpad/research/typography-brand/contrast.csv.
  Implication: Text on light surfaces must be Fern 900, Fern 700, Fern 500 or Sea Glass 700 (Sea Glass 700 and Fern 500 fail on Sand for normal text, so panels on Sand must use Fern 700 or darker). Sea Glass 500 (brand accent) and Clay 500 (nurture) are decoration-only on Mist and white, but both work as chip fills with Fern 900 text. Sea Glass 600 and Clay 600 are limited to large text, icons and borders on light. Sage, Sea Glass 300, Sand, Stone and Mist are text colors only on Fern 700/900. Stone cannot be the sole boundary of a control (1.30 on Mist).

- Open Graph images should be at least 1200 x 630 px, as close to 1.91:1 as possible, with a minimum of 600 x 315 (200 x 200 absolute minimum) and under 8 MB; Next.js fails the build if opengraph-image exceeds 8 MB or twitter-image exceeds 5 MB.
  Source: https://developers.facebook.com/docs/sharing/webmasters/images/ (checked 2026-10-04, confidence high)
  Evidence: Facebook: "Use images that are at least 1200 x 630 pixels for the best display on high resolution devices." "Try to keep your images as close to 1.91:1 aspect ratio as possible" "The size of the image file must not exceed 8 MB." Next docs: "the opengraph-image file size must not exceed 8MB. If the image file size exceeds these limits, the build will fail."
  Implication: The generated 1200x630 PNG (26 KB in the demo) is far under limits; keep the lockup inside a central 1000x500 safe area because some previews crop edges.

- Browsers apply the opsz axis automatically: CSS font-optical-sizing defaults to auto, so shipping the opsz-bearing Newsreader file makes headings at 16 to 20 px use the sturdier low-opsz design and the 40 px+ wordmark use the higher-contrast design without extra CSS. Tailwind exposes tabular-nums, proportional-nums and lining-nums utilities mapping to font-variant-numeric.
  Source: https://developer.mozilla.org/en-US/docs/Web/CSS/font-optical-sizing (checked 2026-10-04, confidence high)
  Evidence: MDN: "auto: The browser will modify the shape of glyphs for optimal viewing." and "Optical sizing is enabled by default for fonts that have an optical size variation axis." Tailwind docs table: "tabular-nums -> font-variant-numeric: tabular-nums;". MDN font-variant-numeric: tabular-nums "corresponds to the OpenType values tnum".
  Implication: No font-variation-settings hacks are needed for Newsreader; add class tabular-nums on counters, tables and date columns in both fonts.

### Recommendations

- (consequential) Primary pairing: Newsreader (variable, opsz 6 to 72 plus wght 200 to 800, Latin opsz WOFF2 from @fontsource-variable/newsreader@5.3.0) for h1 to h3, display numbers and the outlined wordmark; Figtree (variable wght 300 to 900, Latin WOFF2 from @fontsource-variable/figtree@5.3.0) for UI, body, buttons and the tracked uppercase tagline (text-transform uppercase, letter-spacing 0.18em to 0.22em, weight 500 to 600, minimum 11 px). Fallback pairing: EB Garamond (wght 400 to 800) plus Plus Jakarta Sans (wght 200 to 800).
  Why: Both primaries are OFL with no Reserved Font Name, both expose tnum and pnum for cycle-day and date alignment, both are small (132 KB and 20 KB Latin), Newsreader's opsz axis lets one file serve 16 px headings and the 72 px wordmark, and Figtree is described by Google Fonts as crisp in uppercase for labels. EB Garamond is the faithful old-style alternative with full figure sets, and Plus Jakarta Sans is the most Futura-like geometric with tnum.
  Rejected: Fraunces: no tabular figures, default instance Black at opsz 9, needs the 67 KB opsz file or variation settings to look like the display cut. Cormorant Garamond: closest literal match to high-contrast old-style but x-height 0.386 and no opsz, poor at 14 to 16 px; acceptable only as outlined wordmark geometry if the owner prefers it. Instrument Serif: static single weight, no tnum. Source Serif 4: transitional not old-style, 122 KB opsz file. Lora: moderate contrast, narrow 400 to 700 range. Albert Sans and DM Sans: no tnum. Instrument Sans: weight range stops at 400 to 700. Nunito Sans: humanist rounded character, four axes bloat. Onest: no italics.

- (consequential) Self-host with next/font/local from vendored files in apps/web/src/fonts/ (newsreader-latin-opsz-normal.woff2, newsreader-latin-opsz-italic.woff2 optional, figtree-latin-wght-normal.woff2, figtree-latin-wght-italic.woff2), each family with its OFL.txt copied beside it and credited on the licenses page; do not import the fontsource CSS and never use next/font/google in this app.
  Why: OFL FAQ 1.10 and condition 2 require the license text to accompany redistributed fonts; next/font/local emits per-file @font-face with weight ranges and adjustFontFallback metrics, keeps all requests first-party (matching the no-third-party-analytics stance), and the fontsource CSS would otherwise register six unicode-range faces per family and the 'Name Variable' family names.
  Rejected: next/font/google downloads at build time but makes the build depend on Google's endpoints and cannot pin the exact file; importing @fontsource-variable/* CSS directly bypasses next/font's preload and fallback metrics; custom pyftsubset runs are unnecessary because fontsource already ships Latin subsets (use pyftsubset only for narrower marketing subsets, with --name-IDs+=13,14).

- (advisory) Treat the wordmark as outlined SVG paths (text converted to outlines from Newsreader at opsz 72, wght 500, title case, fill Fern 700 #2F4F46) stored in design/brand/wordmark.svg, never as live webfont text; the tagline in lockups is also outlined (Figtree 600, uppercase, 0.2em tracking, Sea Glass 500 only on Mist/white at decorative sizes, Sea Glass 700 when it must be readable).
  Why: Outlines remove font loading from the logo, make the lockup identical in email, OG cards and app icons, and let the owner approve a Cormorant Garamond wordmark variant later without shipping another webfont. Sea Glass 500 fails text contrast on light surfaces (2.50 on Mist), so the tagline color must be documented as decorative.
  Rejected: Live-text wordmark in Newsreader (shifts on fallback fonts, breaks in ImageResponse which rejects woff2); Cormorant Garamond as the shipped heading face (weak at UI sizes).

- (advisory) Reconstruct the mark as hand-authored SVG on a 512 viewBox: rounded square rx=112 filled Mist, Sea Glass wave band as one cubic path, a Mist stroke highlight curve (stroke-linecap round), a Fern stem ending in a spiral drawn with cubic beziers (or an A arc for the final coil), alternating Sage and Fern leaflets as closed cubic paths; keep all ink inside the central 80% circle; mark the file with <title> and a data-status="reconstruction-pending-owner-approval" attribute plus a STATUS.md in design/brand; derive a mono variant using fill="currentColor" and a simplified 16/32 px variant without the highlight curve and lower leaflets.
  Why: Only a raster sheet exists; hand-authored paths stay tiny (demo minified to 851 bytes), editable and crisp, and the safe-zone rule satisfies W3C maskable (40% radius), Android (66/108 dp) and Apple (system-applied corners). Auto-tracing a raster yields hundreds of noisy nodes and bakes in anti-aliasing errors.
  Rejected: Potrace/auto-trace of the brand sheet; embedding the raster PNG as a data URI inside SVG (not scalable, 16 MB artifact risk, not a true vector).

- (consequential) Next.js 16 asset layout: app/favicon.ico (16+32+48 via png-to-ico), app/icon.svg (rounded-square version, sizes any), app/apple-icon.png (180x180, opaque Mist, no own corner rounding), public/icons/icon-192.png, icon-512.png and icon-512-maskable.png (extra 10% padding) referenced from app/manifest.ts with purpose 'any' and 'maskable', theme_color Fern 700 #2F4F46 and background_color Mist #F7F5EF, app/opengraph-image.png (1200x630 static, built by sharp) with app/opengraph-image.alt.txt; generate all of them from design/brand/mark.svg with scripts/brand/generate-icons.mjs (sharp 0.35.5 + png-to-ico 3.0.2) and commit the outputs.
  Why: These are the exact conventions in the 16.3.8 docs (favicon.ico root-only, apple-icon png-only, manifest purpose typing) and Chromium's 192/512 requirement; the pipeline was executed successfully today. Static PNG avoids ImageResponse's ttf/otf/woff and 500 KB limits.
  Rejected: opengraph-image.tsx with ImageResponse (needs a TTF copy of Newsreader and stays under 500 KB; revisit only for per-page cards); resvg-js (works, verified, but adds a second native dependency when sharp is already present for images); a .ico-less setup (older crawlers still request /favicon.ico).

- (consequential) Light semantic tokens (all pairs pass as noted): page Mist #F7F5EF; surface White #FFFFFF (cards on Mist, separated by soft-border or shadow since 1.09); panel Sand #E6D6C3 (text must be Fern 700 or 900: 6.35 and 9.17); text Fern 900 #1F3530 (11.96 on page, 13.04 on surface); muted Fern 500 #3F6A5F on page/surface (5.60, 6.11) and Fern 700 on panels; accent Sea Glass 500 #6EA7A0 as fills, icons and chips only, with chip text Fern 900 (4.78); action Fern 700 #2F4F46 with action-text Mist (8.28), hover Fern 900; border Sea Glass 600 #4F8A82 for inputs and control outlines (3.64 on Mist, 3.97 on white; use Fern 500 on Sand panels, 4.30); soft-border Stone #D9D9D4 for decorative dividers only; success text Sea Glass 700 #3F736C (4.96) on a Sage tint with Fern 900 text (7.45); warning text Clay 800 #7F4C3A (6.43 on Mist, 4.93 on Sand) on a Clay 300 tint with Fern 900 text (6.12), Clay 500 reserved for icons and fills; danger text #A63D33 (5.77 on Mist, 6.29 on white; large-only on Sand at 4.43) and danger-strong #8C3129 (7.45) for buttons with white text; focus ring Sea Glass 600 2 px with a 2 px Mist offset on light (3.64), Sea Glass 300 #8FC1B9 on Fern surfaces (4.51 on Fern 700, 6.52 on Fern 900).
  Why: Every assignment uses a pair at or above the WCAG floor computed today with the 2.2 formula; the brand's pastel accents only reach AA when paired with Fern 900 text or used on Fern backgrounds, so the tokens encode that constraint rather than leaving it to component authors.
  Rejected: Sea Glass 500 or Clay 500 as text or button fills with light text (2.50 to 2.83); Stone as input border (1.30); Sea Glass 700 or Fern 500 as muted text on Sand (3.81, 4.30 fail normal text); a generic red danger token unrelated to Clay (the #A63D33 hue keeps the warm family while clearing 4.5).

- (advisory) Lockup and icon rules to document in design/brand/brand.md: clear space on all sides equal to the cap height of the wordmark T (same unit as the wave band height in the mark); minimum sizes: mark 16 px (simplified variant below 32 px), horizontal lockup 120 px wide, stacked lockup 96 px wide, wordmark alone 72 px wide; color variants: full color on Mist or white only; on Fern 700/900 surfaces use the mark in Mist (8.28 and 11.96) or Sage (5.16 and 7.45) with wordmark in Mist and tagline in Sea Glass 300 (4.51 and 6.52); one-color variant uses currentColor; never place the lockup on Sea Glass 500, Sage, Sand or Clay fills; never recolor the frond Clay; never add drop shadows, outlines or rotations; always keep the wave under the frond.
  Why: Clear-space-by-cap-height is the standard brand convention (no primary spec exists; public brand portals checked today did not publish their numbers) and ties spacing to the wordmark's own geometry; the color rules follow directly from the contrast table; the icon rules follow the W3C, Android and Apple safe-zone specs.
  Rejected: Clear space as a fixed pixel value (does not scale); allowing the full-color mark on Sea Glass backgrounds (Fern 700 on Sea Glass 500 is only 3.31 and Sage on Sea Glass 500 is 1.56).

- (advisory) design/brand contents: brand.md (story, tagline, footer line, voice), tokens.json (palette, derived shades, semantic light tokens, type scale), contrast.csv (the computed table), mark.svg, mark-mono.svg, mark-simplified.svg, wordmark.svg, lockup-horizontal.svg, lockup-stacked.svg, app-icon-1024.png (square, no rounding, for Expo later), STATUS.md stating the mark is a reconstruction pending owner approval with a dated approval line, fonts/README.md with the exact fontsource versions and OFL.txt copies, and the generate-icons script.
  Why: Gives the build agent and the future Expo app one source of truth, keeps the approval state explicit, and satisfies OFL distribution notices in one place.
  Rejected: Keeping brand files only inside apps/web (the API emails via Resend and the Expo app will need the same assets).

### Verified snippets

#### apps/web/src/fonts.ts: next/font/local declarations for the two variable fonts (weight ranges, CSS variables, fallbacks)

Source: https://nextjs.org/docs/app/api-reference/components/font

```
import localFont from 'next/font/local'

// Files copied from node_modules/@fontsource-variable/newsreader/files and
// node_modules/@fontsource-variable/figtree/files (version 5.3.0), OFL.txt beside them.
export const newsreader = localFont({
  src: [
    { path: './fonts/newsreader-latin-opsz-normal.woff2', weight: '200 800', style: 'normal' },
    { path: './fonts/newsreader-latin-opsz-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-newsreader',
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'serif'],
})

export const figtree = localFont({
  src: [
    { path: './fonts/figtree-latin-wght-normal.woff2', weight: '300 900', style: 'normal' },
    { path: './fonts/figtree-latin-wght-italic.woff2', weight: '300 900', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-figtree',
  // adjustFontFallback defaults to 'Arial' for next/font/local
  fallback: ['system-ui', 'Arial', 'sans-serif'],
})

// app/layout.tsx: <html lang="en" className={`${figtree.variable} ${newsreader.variable}`}>
```

#### apps/web/src/app/globals.css: Tailwind v4 theme mapping for the font variables and numeric figures

Source: https://tailwindcss.com/docs/theme

```
@import 'tailwindcss';

@theme inline {
  --font-sans: var(--font-figtree);
  --font-serif: var(--font-newsreader);
}

/* Headings get the serif; opsz is applied automatically (font-optical-sizing: auto is the default). */
h1, h2, h3 { font-family: var(--font-serif); font-weight: 500; }

/* Tagline treatment */
.tagline { font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.2em; font-weight: 600; }

/* Use class="tabular-nums" (Tailwind utility) on counters, tables and date columns. */
```

#### Optional re-subsetting with pyftsubset that keeps variable axes, all layout features and the OFL name-table entries (IDs 13 and 14 are dropped by default)

Source: https://fonttools.readthedocs.io/en/latest/subset/index.html

```
pip install fonttools brotli
pyftsubset "Newsreader[opsz,wght].ttf" \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features='*' \
  --name-IDs+=13,14 \
  --flavor=woff2 \
  --output-file=newsreader-latin-opsz-normal.woff2
# glyphhanger 6.0.0 wraps the same tool: npx glyphhanger --LATIN --formats=woff2 --subset="*.ttf"
```

#### apps/web/src/app/manifest.ts with any and maskable icons and brand colors

Source: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest

```
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tidefern',
    short_name: 'Tidefern',
    description: 'One app for every chapter, from cycles to pregnancy to childhood, for you and the people who grow with you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F5EF',
    theme_color: '#2F4F46',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

#### scripts/brand/generate-icons.mjs: SVG to favicon.ico, apple-icon, PWA icons and the 1200x630 social card (verified today with sharp 0.35.5 and png-to-ico 3.0.2)

Source: https://sharp.pixelplumbing.com/api-constructor/

```
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const mark = readFileSync('design/brand/mark.svg')          // 512 viewBox, rounded square on Mist
const markSquare = readFileSync('design/brand/mark-square.svg') // same art, square full-bleed Mist, no rx
const lockup = readFileSync('design/brand/lockup-horizontal.svg')
mkdirSync('apps/web/public/icons', { recursive: true })

const png = (svg, size, density = 288) => sharp(svg, { density }).resize(size, size).png().toBuffer()

for (const s of [16, 32, 48]) writeFileSync(`tmp-icon-${s}.png`, await png(mark, s))
writeFileSync('apps/web/src/app/favicon.ico', await pngToIco(['tmp-icon-16.png', 'tmp-icon-32.png', 'tmp-icon-48.png']))
writeFileSync('apps/web/src/app/apple-icon.png', await png(markSquare, 180))   // opaque, square, no rounding
writeFileSync('apps/web/public/icons/icon-192.png', await png(mark, 192))
writeFileSync('apps/web/public/icons/icon-512.png', await png(mark, 512))
// maskable: art inside the central 80% circle, extra padding, full-bleed Mist
writeFileSync('apps/web/public/icons/icon-512-maskable.png',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#F7F5EF' } })
    .composite([{ input: await png(markSquare, 410), left: 51, top: 51 }]).png().toBuffer())
writeFileSync('design/brand/app-icon-1024.png', await png(markSquare, 1024))
// social card
writeFileSync('apps/web/src/app/opengraph-image.png',
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#F7F5EF' } })
    .composite([{ input: await sharp(lockup, { density: 288 }).resize({ width: 900 }).png().toBuffer(), gravity: 'centre' }])
    .png().toBuffer())
// sharp has no ICO or SVG output; @resvg/resvg-js 2.6.2 is an equivalent rasterizer if librsvg output differs.
```

#### design/brand/mark.svg skeleton: hand-authored reconstruction (placeholder geometry proven to rasterize; refine curves against the brand sheet, then get owner approval)

Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="t" data-status="reconstruction-pending-owner-approval">
  <title id="t">Tidefern mark</title>
  <rect width="512" height="512" rx="112" fill="#F7F5EF"/>
  <!-- Sea Glass wave with Mist highlight curve -->
  <path d="M0 352 C 96 300, 160 300, 256 352 S 416 404, 512 352 L512 512 L0 512 Z" fill="#6EA7A0"/>
  <path d="M40 372 C 120 332, 184 332, 256 372 S 392 412, 472 372" fill="none" stroke="#F7F5EF" stroke-width="14" stroke-linecap="round"/>
  <!-- Fern stem rising from the wave, spiral tip (cubic beziers; an A arc also works for the final coil) -->
  <path d="M256 352 C 250 300, 246 240, 262 180 C 272 142, 300 118, 322 128 C 342 138, 334 166, 314 164 C 302 163, 300 148, 312 146" fill="none" stroke="#2F4F46" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Leaflets: Sage on the left, Fern on the right -->
  <g fill="#B7C9B1">
    <path d="M254 320 C 214 318, 196 296, 198 272 C 226 272, 248 292, 254 320 Z"/>
    <path d="M256 272 C 222 262, 208 236, 214 214 C 240 220, 256 244, 256 272 Z"/>
    <path d="M262 226 C 240 212, 232 190, 240 172 C 260 182, 268 204, 262 226 Z"/>
  </g>
  <g fill="#2F4F46">
    <path d="M258 320 C 298 318, 316 296, 314 272 C 286 272, 264 292, 258 320 Z"/>
    <path d="M258 272 C 290 262, 302 238, 296 218 C 272 226, 258 248, 258 272 Z"/>
  </g>
</svg>
<!-- mono variant: replace every fill/stroke color with currentColor and drop the background rect -->
```

#### svgo.config.mjs for brand SVGs (preset-default in svgo 4 keeps viewBox; keep ids and the data-status attribute)

Source: https://svgo.dev/docs/preset-default/

```
export default {
  multipass: true,
  plugins: [
    { name: 'preset-default', params: { overrides: { cleanupIds: false, removeUnknownsAndDefaults: { keepDataAttrs: true } } } },
  ],
}
// npx svgo design/brand/mark.svg -o apps/web/src/app/icon.svg
```

#### WCAG 2.2 contrast check used for the token table (drop into packages/tokens as a test)

Source: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance

```
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)   # do not round before comparing to 4.5 or 3.0

assert contrast('#1F3530', '#F7F5EF') >= 4.5   # text on page: 11.96
assert contrast('#4F8A82', '#F7F5EF') >= 3.0   # border on page: 3.64
assert contrast('#D9D9D4', '#F7F5EF') < 3.0    # Stone is decorative only: 1.30
```

### Open questions

- Owner approval of the reconstructed mark geometry and of the wordmark face: Newsreader at opsz 72 (single-serif consistency) versus Cormorant Garamond outlines (closer to the sheet's high-contrast old-style description but shipped only as SVG).
- Whether italics are needed at launch; dropping the two italic files saves about 168 KB (Newsreader italic opsz 147 KB, Figtree italic 21 KB) and they can be added later without layout changes.
- Dark theme tokens were not computed (brief asked for light only); Fern 900 page with Mist text, Sea Glass 300 accents and Sage marks pass per the table, but a full dark set needs its own pass.
- Whether the raster brand sheet's actual pixel colors match the palette JSON hexes; the JSON was treated as canonical. If the sheet differs, re-run contrast.py before freezing tokens.
- Expo later: Apple HIG now describes layered icons built in Icon Composer for iOS 26 style appearances (default, dark, clear, tinted); the 1024 px square master covers the web clip and store listing, but layered variants will need a design pass.
- Fontsource LICENSE files combine roman and italic copyright lines; confirm the credits page lists both the Newsreader and Figtree copyright holders exactly as in OFL.txt.

### Sources that could not be read

- https://brand.github.com/foundations/logo (redirect target of github.com/logos; the page summary had no clear-space or minimum-size rules and the trailing-slash URL returned 404)
- https://brand.mozilla.com/all-brands (JavaScript-only brand portal; no text retrievable)
- https://design.wikimedia.org/style-guide/visual-style_logos.html (404)
- https://slack.com/media-kit and https://atlassian.design/foundations/logos/ (reachable but contain no quantitative clear-space rules)
- https://developer.apple.com/design/human-interface-guidelines/app-icons (HTML is JavaScript-rendered and Chromium failed TLS through the proxy; the same content was read from Apple's JSON data endpoint https://developer.apple.com/tutorials/data/design/human-interface-guidelines/app-icons.json)
- https://fonts.google.com specimen pages (JavaScript-rendered; license, axes and descriptions were taken from the google/fonts GitHub repository instead)
- https://raw.githubusercontent.com/erikdkennedy/figtree README (404 on both main and master; description taken from google/fonts ofl/figtree/article/ARTICLE.en_us.html)
- https://fontsource.org/docs/getting-started/variable (reachable, but it does not document the files/ naming scheme; file names and sizes were verified from the jsdelivr package listing instead)

## product-domain

<a id="product-domain"></a>

Dimension: Product references and domain math (cycle, pregnancy, postpartum, child growth and milestones, units and locale, safety and tone)

### Summary

The clinical math Tidefern needs is small and well sourced: ACOG CO 700 fixes EDD at LMP plus 280 days, gives redating thresholds by ultrasound gestational age, and says the EDD should rarely change once set; ACOG patient FAQs define trimesters (LMP to 13w6d, 14w0d to 27w6d, 28w0d on), the fertile window as 5 days before ovulation through 1 day after, and ovulation about 14 days before the next period, while Bull 2019 (612,613 cycles) and Wilcox 2000 show real luteal phases average 12.4 days and that the fertile window is "highly unpredictable" even for regular cycles, so predictions must be ranges with confidence, never points. Apple and Natural Cycles supply the two reference patterns for uncertainty: Apple subtracts a fixed 13-day luteal phase and states "Cycle Tracking should not be used as a form of birth control"; Natural Cycles only shows a non-fertile day when a temperature rise confirms ovulation and is the only FDA De Novo "software application for contraception" (21 CFR 884.5370, Class II), which is exactly the claim Tidefern must never make. FDA's General Wellness guidance was reissued January 6, 2026 and still does not list cycle or fertility tracking, so the posture is: general wellness copy, no contraception or diagnosis claims, clinician reminders (also required by App Store guideline 1.4.1). For children, CDC says use WHO growth standards under 24 months and CDC charts from 2 years, both are LMS tables with a published z-score formula (CDC example: 9-month male, L -0.1600954, M 9.476500305, S 0.11218624, 5th percentile 7.90 kg), and the CDC 2022 milestones (159 items at 12 ages, the 75% criterion, surveillance not screening) are public domain if attributed with a non-endorsement disclaimer; WHO tables carry WHO terms that require attribution and, for commercial use, written authorization, which is an open licensing question. Competitor partner sharing is either coarse (Flo view-only calendar with symptoms and notes hidden, Glow all-or-nothing bidirectional) or role based (Ovia caregivers versus family and friends), which supports Tidefern's explicit per-data-class grants with default deny and instant revocation. Store calendar facts as Postgres date, keep an IANA zone on the profile (tzdata 2026e), derive "today" from Intl.DateTimeFormat formatToParts because Node 24 has no Temporal (Node 26 does), read week start from Intl.Locale weekInfo (Node 24 has getWeekInfo), and store SI integers (grams, millimetres) converting with exact factors (2.54 cm per inch, 0.45359237 kg per pound). Loss handling should follow Clue's pattern (a user-initiated "I'm no longer pregnant" flow, resources, mode change "once you feel ready", hide the pregnancy cycle from averages) and BJA Education's communication guidance (mirror the user's words, acknowledge, no platitudes).

### Findings

- ACOG CO 700 (May 2017): EDD is LMP plus 280 days; first-trimester ultrasound is the most accurate dating; redating thresholds depend on gestational age at the scan; once set, the EDD should rarely change.
  Source: https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date (checked 2026-10-04, confidence high)
  Evidence: "By convention, the EDD is 280 days after the first day of the LMP." "Ultrasound measurement of the embryo or fetus in the first trimester (up to and including 13 6/7 weeks of gestation) is the most accurate method to establish or confirm gestational age." "If ultrasound dating before 14 0/7 weeks of gestation differs by more than 7 days from LMP dating, the EDD should be changed ... before 9 0/7 weeks of gestation, a discrepancy of more than 5 days is an appropriate reason for changing the EDD." "between 14 0/7 weeks and 15 6/7 weeks ... more than 7 days, or ... between 16 0/7 weeks and 21 6/7 weeks ... more than 10 days"; "between 22 0/7 weeks and 27 6/7 weeks ... more than 14 days"; third trimester "discrepancy in gestational dating of more than 21 days." "If pregnancy resulted from ART, the ART-derived gestational age should be used ... for a day-5 embryo, the EDD would be 261 days from the embryo replacement date." "Subsequent changes to the EDD should be reserved for rare circumstances."
  Implication: packages/core implements eddFromLmp (plus 280), eddFromUltrasound (scan date plus 280 minus GA at scan), eddFromTransfer (day-5 embryo: plus 261), and a redating helper keyed to ultrasound GA bands; the app stores one canonical EDD with a provenance field and treats later changes as deliberate, user-confirmed edits.

- ACOG defines trimesters and the weeks-and-days notation: first trimester LMP to 13w6d, second 14w0d to 27w6d, third 28w0d to 40w6d; pregnancy is counted from LMP with two weeks before conception included.
  Source: https://www.acog.org/womens-health/faqs/how-your-fetus-grows-during-pregnancy (checked 2026-10-04, confidence high)
  Evidence: "A pregnancy that is '36 and 3/7 weeks' means '36 weeks and 3 days of pregnancy.'" "First trimester (first day of LMP to 13 weeks and 6 days) ... Second trimester (14 weeks and 0 days to 27 weeks and 6 days) ... Third trimester (28 weeks and 0 days to 40 weeks and 6 days)". "A normal pregnancy lasts about 40 weeks from the first day of your last menstrual period (LMP). Pregnancy is assumed to start 2 weeks after the first day of the LMP."
  Implication: gestationalAge returns days, weeks, remainder days, a label like 38w1d, and trimester from day counts 0..97, 98..195, 196 and up; UI shows week-by-week content keyed to this.

- ACOG and NHS agree on cycle conventions: day 1 is the first day of bleeding, ovulation is about 14 days (NHS: 12 to 16 days) before the next period, the egg lives about 24 hours, sperm up to 5 days, and the fertile window runs from 5 days before ovulation to 1 day after.
  Source: https://www.acog.org/womens-health/faqs/fertility-awareness-based-methods-of-family-planning (checked 2026-10-04, confidence high)
  Evidence: ACOG: "counted from the first day of menstrual bleeding (called day 1) of one menstrual period to the first day of menstrual bleeding of the next. An average menstrual cycle lasts 28 days ... ovulation occurs about 14 days before the start of the next menstrual period. The number of days between ovulation and the start of the menstrual period is the most consistent in a menstrual cycle." "You can become pregnant if you have sex anywhere from 5 days before ovulation until 1 day after ovulation." NHS (https://www.nhs.uk/conditions/periods/): "around every 28 days ... ranging from every 21 days to every 35 days"; "Your period can last between 2 and 7 days, but it will usually last for about 5 days"; ovulation "is about 12 to 16 days before the start of your next period."
  Implication: Default luteal assumption 14 days with a plus or minus 2 day band (12 to 16); fertile window = ovulation minus 5 through ovulation plus 1; period length default 5 days.

- Normal versus irregular cycle thresholds from ACOG: adults 21 to 35 days, adolescents 21 to 45 days, bleeding up to 7 days; cycle length varying by more than 7 to 9 days, cycles over 35 or under 21 days, or no period for 3 to 6 months are listed as abnormal bleeding patterns.
  Source: https://www.acog.org/womens-health/faqs/abnormal-uterine-bleeding (checked 2026-10-04, confidence high)
  Evidence: "The normal length of the menstrual cycle is typically between 21 and 35 days. A normal menstrual period generally lasts up to 7 days." Abnormal: "Menstrual cycles that are longer than 35 days or shorter than 21 days"; "'Irregular' periods in which cycle length varies by more than 7 to 9 days"; "Not having a period for 3 to 6 months". ACOG CO 651 (reaffirmed 2025, https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/12/menstruation-in-girls-and-adolescents-using-the-menstrual-cycle-as-a-vital-sign): "Menstrual cycle interval: Typically 21-45 days ... Menstrual flow length: 7 days or less". ACOG Your First Period: "cycles that are 21 to 45 days are also normal. It may take 6 years or more after your period starts for your cycle to get regular."
  Implication: summarizeCycles classifies regularity by span of recent cycle lengths (span of 7 or less regular, 8 to 9 borderline, over 9 irregular) and flags lengths outside 21 to 35 (adult) or 21 to 45 (under 20) with a gentle, non-diagnostic clinician nudge, never a diagnosis.

- Wilcox, Dunson and Baird (BMJ 2000) show the fertile window is six days ending on ovulation and that its timing is unpredictable even in regular cycles, so a fixed-day fertile window is wrong for most users.
  Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC27529/ (checked 2026-10-04, confidence high)
  Evidence: The fertile window is "the six days ending on the day of ovulation". "On every day between days 6 and 21, women had at minimum a 10% probability of being in their fertile window." Only about 30% of women had the fertile window entirely within days 10 to 17. "Women should be advised that the timing of their fertile window can be highly unpredictable, even if their cycles are usually regular."
  Implication: Copy must call fertile and non-fertile days estimates, never safe days; the UI shades a likely window and never implies protection from pregnancy.

- Bull et al. 2019 (npj Digital Medicine, Natural Cycles data) quantify real-world cycle parameters: mean cycle 29.3 days, mean follicular 16.9, mean luteal 12.4 days (95% CI 7 to 17), ovulation on day 14 is not typical, and cycle length falls 0.18 days per year between ages 25 and 45.
  Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC6710244/ (checked 2026-10-04, confidence high)
  Evidence: "612,613 ovulatory cycles with a mean length of 29.3 days from 124,648 users"; mean follicular phase 16.9 days; luteal phase "12.4 days (95% CI: 7-17)"; regarding day-14 ovulation, "for the majority of women in the real-world that this is not the case"; "Mean cycle length decreased by 0.18 days (95% CI: 0.17-0.18)" per year of age, while "the luteal phase length varied very little between age cohorts."
  Implication: Keep the luteal constant configurable (14 default per ACOG convention, Apple uses 13, population mean 12.4) and present ovulation as a date with a plus or minus 2 day band rather than a single day.

- Apple Health Cycle Tracking is the reference for a privacy-respecting consumer pattern: predictions from logged history, fertile window from a fixed 13-day luteal phase, factors (Pregnancy, Lactation, Contraceptive) that pause predictions, Cycle Deviation notifications, hideable predictions, and explicit non-contraception and non-diagnosis disclaimers.
  Source: https://support.apple.com/en-us/120356 (checked 2026-10-04, confidence high)
  Evidence: "The fertile window is calculated by subtracting 13 days (the luteal phase) from the estimated next cycle start date." Period predictions use "data that you've logged about your previous periods and cycle length". Factors "Pregnancy, Lactation, or Contraceptive" can turn predictions off. "Cycle Tracking should not be used as a form of birth control" and "Data from Cycle Tracking should not be used to diagnose a health condition." iPhone User Guide (https://support.apple.com/guide/iphone/view-menstrual-cycle-predictions-and-history-iph1a4a00aa0/ios): "Irregular periods, infrequent periods, prolonged periods, and persistent spotting are common cycle deviations that may indicate an underlying condition, or may be due to other factors"; "You can turn off period, fertility, and cycle deviation notifications, hide period and fertility predictions"; with two-factor authentication "your health data synced to iCloud is encrypted end to end".
  Implication: Tidefern's today screen should show a next-period range, a toggle to hide predictions, chapter factors that pause predictions (pregnancy, postpartum, contraception), and deviation nudges worded as observations plus a clinician suggestion.

- Natural Cycles is the only FDA-authorized app for contraception (De Novo DEN170052, 21 CFR 884.5370, Class II, product code PYT); its algorithm defaults to fertile (Red) and only grants Green days after a temperature rise confirms ovulation. A tracker that claims contraception becomes this device type.
  Source: https://www.accessdata.fda.gov/cdrh_docs/reviews/DEN170052.pdf (checked 2026-10-04, confidence high)
  Evidence: "FDA identifies this generic type of device as: Software application for contraception. A software application for contraception is a device that provides user-specific fertility information for preventing a pregnancy ... NEW REGULATION NUMBER: 21 CFR 884.5370 CLASSIFICATION: Class II PRODUCT CODE: PYT ... INDICATIONS FOR USE Natural Cycles is a stand-alone software application, intended for women 18 years and older, to monitor their fertility. Natural Cycles can be used for preventing a pregnancy (contraception) or planning a pregnancy (conception)." Help center (https://help.naturalcycles.com/hc/en-us/articles/360003335494-How-Natural-Cycles-detects-ovulation): "on average, a rise of 0.3 °C or 0.5 °F ... Only if and when ovulation has been confirmed by a clear enough temperature rise will the algorithm start giving Green Days again". Home page (https://www.naturalcycles.com/): "The only FDA-cleared birth control app"; "98% when used as intended, 93% with typical use."
  Implication: Tidefern never uses the words birth control, contraception, protection, or safe days in predictions; if a future chapter ever wants that claim it is a Class II device with special controls and clinical performance testing.

- FDA's General Wellness guidance was reissued January 6, 2026 (superseding the 2019 version). It defines general wellness products by two factors (general wellness intended use only, low risk), lists category 1 claim areas (weight, fitness, relaxation or stress, mental acuity, self-esteem, sleep management, sexual function) and does not mention menstrual, fertility, or pregnancy tracking; FDA's separate examples list treats tracking a normal baby's sleeping and feeding as not a device.
  Source: https://www.fda.gov/media/90652/download (checked 2026-10-04, confidence high)
  Evidence: "Document issued on January 6, 2026. This document supersedes 'General Wellness: Policy for Low Risk Devices' issued on September 27, 2019." "CDRH defines general wellness products as products that meet the following two factors: (1) are intended for only general wellness use, as defined in this guidance, and (2) present a low risk to the safety of users and other persons." "CDRH does not intend to examine low risk general wellness products to determine whether they are devices". Category 1 claims "relate to: weight management, physical fitness ..., relaxation or stress management, mental acuity, self-esteem ..., sleep management, or sexual function." The words fertility, menstrual, ovulation, pregnancy and contraception do not appear in the document. FDA examples page (https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices): "Track a normal baby's sleeping and feeding habits" is listed as not a medical device.
  Implication: Cycle prediction without a contraception or disease claim sits outside the named examples, so Tidefern relies on the statutory 520(o)(1)(B) healthy-lifestyle carve-out plus careful copy; child feeding and sleep logs are explicitly non-device. Keep a short regulatory note in the repo and review copy against it.

- Apple App Store Review Guidelines require medical-adjacent apps to remind users to consult a doctor, forbid using health data for advertising or marketing, and forbid storing personal health information in iCloud.
  Source: https://developer.apple.com/app-store/review/guidelines/ (checked 2026-10-04, confidence high)
  Evidence: 1.4.1: "Apps should remind users to check with a doctor in addition to using the app and before making medical decisions." 5.1.3: "Apps may not use or disclose to third parties data gathered in the health, fitness, and medical research context ... for advertising, marketing, or other use-based data mining purposes" and "may not store personal health information in iCloud."
  Implication: Bake the clinician reminder into shared copy components now so the later Expo app passes review without rewrites; the no-analytics-on-authenticated-screens decision is consistent with 5.1.3.

- Flo's privacy and partner patterns: Anonymous Mode creates a new account with no email, Apple or Google ID, payment or device identifiers, routes traffic through an OHTTP relay, blocks third-party requests, and sacrifices device transfer and recovery; Flo for Partners is view-only cycle phase and daily insights with symptoms, notes and calendar detail hidden, revocable from a Partner tab, and partners are notified on mode switches.
  Source: https://flo.health/media/10463/download/Flo%20Anonymous%20Mode%20overview.pdf?v=1 (checked 2026-10-04, confidence high)
  Evidence: Overview (May 2024): "creating a new Anonymous Mode account that does not contain any unique user identifiers, such as email address and Google/Apple account ID; payment identifiers; or technical identifiers, such as IP address, ID for advertisers (IDFA), or other IDs." "The device communicates with Flo servers only via OHTTP relay"; "All requests to third parties are blocked." Limitations: features "unavailable in Anonymous Mode, such as transferring their Flo data to a new device"; "not available for paying web users because of the clear connection to their credit cards"; "the original account is deactivated immediately". Partners (https://help.flo.health/hc/en-us/articles/19872048333972-What-data-will-be-shared-with-my-partner): "Your partner will have access to a view-only version of your cycle calendar. They will also receive tailored daily insights"; partners cannot see past or future calendar information, personal notes, or logged symptoms; in pregnancy "They won't see any symptoms that you have personally logged in Flo." Stop sharing (https://help.flo.health/hc/en-us/articles/19872084558612-Can-I-stop-sharing-at-any-time): "Go to the Partner tab and tap 'Stop sharing.'" App Store: "Flo does not provide medical advice, diagnosis, or treatment, and is not a method of birth control." Pregnancy mode help: gestational age "calculated from the first day of your last period"; the change-due-date article says Flo computes the due date as "your last period plus 41 weeks (the maximum setting by default)" and "changing the due date will not automatically change gestational age".
  Implication: Tidefern can match the spirit (no third-party calls, minimal identifiers, optional passcode) without the account-splitting trick because it never collects ad identifiers in the first place; partner grants should be finer than Flo's single view-only bundle and must keep EDD and gestational age coupled (Flo's decoupled fields are a known confusion).

- Clue's stance and flows: EU-hosted data never sold to advertisers, GDPR, an explicit non-contraceptive disclaimer, predictions that start from literature averages and learn per user, modes for period, conceive, pregnancy and perimenopause, and a loss flow ('I'm no longer pregnant') with resources, user-timed mode change, and hiding the pregnancy cycle from averages.
  Source: https://helloclue.com/privacy (checked 2026-10-04, confidence medium)
  Evidence: Privacy: "All of our data is securely stored on servers located in the European Union (EU)"; health data "is never shared with or sold to advertisers". App Store (https://apps.apple.com/us/app/clue-period-cycle-tracker/id657189652): "Clue should not be used as a contraceptive"; modes for "Period tracking, trying to conceive, pregnancy, and perimenopause". Science article (https://helloclue.com/articles/about-clue/science-your-cycle-evidence-based-app-design): "Before Clue's algorithm has had a chance to learn about each individual user, the starting estimates are based on averages from medical literature." Help article on miscarriage or abortion (https://support.helloclue.com/hc/en-us/articles/18388633366301-How-can-I-track-a-miscarriage-or-abortion, content via search snippet because the page blocks automated fetching): tap 'I'm no longer pregnant', optionally give a reason, read support resources, and change mode once you feel ready; hide the pregnancy cycle so it is not used for averages.
  Implication: Adopt the same loss pattern: user-initiated, optional reason, resources, no automatic return to predictions, and exclude pregnancy and postpartum spans from cycle statistics by default.

- Other partner and multi-caregiver models: Glow shares health data bidirectionally on connection with no customization; Ovia separates Caregivers (full child health data) from Family and Friends (no health data); Huckleberry and Baby Tracker sync multiple caregivers and children, Baby Tracker computes cues on device; Ovia Cycle and Pregnancy transitions to pregnancy and postpartum inside one app.
  Source: http://support.glowing.com/help/en-us/11-partner-experience/12 (checked 2026-10-04, confidence high)
  Evidence: Glow: "upon your approving this connection, health data from your account will be shared with your partner's account, and vice versa. This data can include information from your daily log, treatment log and medical log." and (http://support.glowing.com/help/en-us/13-partner-experience/24) "there's currently no way to customize what partners can see on the app. Certain logs will stay hidden from partners ... denoted with the 'Hidden from partner' icon". Ovia (https://ovuline.helpshift.com/hc/en/11-ovia-parenting-ios/faq/1434-how-do-i-invite-a-friend-or-family-member-to-my-account/): Caregivers can "add, edit, delete and view logged health data for children"; Family & Friends "cannot see, add, delete or edit health information"; invite "sends an email with a unique code". Huckleberry (https://apps.apple.com/us/app/huckleberry-baby-tracker/id1169136078): "Track multiple children with individual profiles", "Sync with multiple caregivers across devices", SweetSpot "predicts your baby's ideal nap and sleep times". Baby Tracker (https://apps.apple.com/us/app/baby-tracker-newborn-log/id779656557): "What's Next cues are created directly on your device. Your baby's logs aren't sent to us to generate them." Ovia (https://apps.apple.com/app/570244389): "Add your spouse, partner, sibling, or your BFF to share your daily updates"; transitions to pregnancy and postpartum in the same app.
  Implication: Tidefern's grant model should name data classes (cycle calendar, symptoms, notes, pregnancy updates, child logs, growth, photos) and roles (owner, caregiver, viewer), default deny, per-grant expiry and revocation, and an audit trail; this is strictly better than Glow's all-or-nothing and Flo's single bundle while matching Ovia's role idea.

- CDC Learn the Signs Act Early (2022 revision): checklists at 2, 4, 6, 9, 12, 15, 18, 24, 30 months and 3, 4, 5 years; milestones are ones at least 75% of children achieve by that age; 159 milestones across 12 checklists; crawling removed; explicitly surveillance, not a screening tool.
  Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9680195/ (checked 2026-10-04, confidence high)
  Evidence: Zubler et al. 2022 (Pediatrics 149(3) e2021052138): milestones are skills "most (≥75%) children would be expected to demonstrate" at health supervision visit ages; checklists added for 15 and 30 months; total milestones reduced from 216 to 159 across 12 checklists; "crawling was removed"; the tools "support developmental surveillance, clinical judgment regarding screening between recommended ages, and research in developmental surveillance processes." CDC index (https://www.cdc.gov/act-early/milestones/index.html, rendered via Chromium): lists "Milestones by 2 Months" through "Milestones by 5 Years" including 15 and 30 months, and states "Learn the Signs. Act Early. resources are not a substitute for standardized, validated developmental screening tools."
  Implication: Embed the 12 checklists as versioned JSON data (age key, domain, text) with a "most children (75%) do this by" framing, a per-child corrected-age option, and a persistent line that this is not screening; link out to the pediatrician rather than scoring.

- Growth charts: CDC recommends WHO standards for children under 24 months and CDC charts from 2 to 19 years, with 2.3rd and 97.7th percentiles (plus or minus 2 SD) as WHO cutoffs; CDC publishes LMS data files and the exact z-score and percentile formulas; WHO publishes expanded z-score and percentile tables and documents the plus or minus 3 SD adjustment for weight-based indicators.
  Source: https://www.cdc.gov/growthcharts/cdc-data-files.htm (checked 2026-10-04, confidence high)
  Evidence: CDC data files page: "These files contain the L, M, and S parameters needed to generate exact percentiles and z-scores"; "Z = ((X/M)**L) - 1) / (LS), L≠0 or Z = ln(X/M)/S, L=0"; "X = M (1 + LSZ)**(1/L), L ≠ 0 Or X = M exp(SZ), L = 0"; "Age is listed at the half month point for the entire month; for example, 1.5 months represents 1.0-1.99 months ... The only exception is birth"; example "9-month-old male ... L=-0.1600954, M=9.476500305, and S=0.11218624. For the 5th percentile, we would use Z=-1.645 ... the 5th percentile is 7.90 kg"; "These data remain unchanged from the initial release on May 30, 2000." MMWR 2010 (https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5909a1.htm): "CDC recommends that clinicians in the United States use the 2006 WHO international growth charts, rather than the CDC growth charts, for children aged <24 months ... The CDC growth charts should continue to be used for the assessment of growth in persons aged 2--19 years"; "use of the 2.3rd and 97.7th percentiles (or ±2 standard deviations) are recommended, rather than the 5th and 95th percentiles." WHO weight-for-age page (https://www.who.int/tools/child-growth-standards/standards/weight-for-age) offers z-score and percentile tables for "Birth to 13 weeks" and "Birth to 5 years" plus "Expanded tables for constructing national health cards" (Excel). WHO computation note (https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/computation.pdf?sfvrsn=c2ff6a95_4): "a restriction was imposed on all indicators to enable the derivation of percentiles only within the interval corresponding to z-scores between -3 and 3" and for weight-based indicators "Beyond these limits, the standard deviation at each age was fixed to the distance between ±2 SD and ±3 SD, respectively", "Following the same methodology applied to the WHO Child Growth Standards".
  Implication: Core ships one LMS engine with two datasets, chooses WHO under 730 days and CDC after, uses day-based WHO expanded tables for infants and CDC half-month rows for older children, implements the WHO tail adjustment for weight, BMI and weight-for-length, and labels WHO extremes at 2.3 and 97.7.

- Licensing: US Government works are not copyrightable, but CDC requires attribution and a non-endorsement disclaimer and forbids logo use, and some CDC content is contractor-owned; WHO publications are CC BY-NC-SA 3.0 IGO and WHO site terms require acknowledgment and written authorization for substantial or commercial reuse.
  Source: https://www.cdc.gov/other/agencymaterials.html (checked 2026-10-04, confidence high)
  Evidence: 17 U.S.C. 105(a) (https://www.law.cornell.edu/uscode/text/17/105): "Copyright protection under this title is not available for any work of the United States Government". CDC: "Most of the information on the CDC and ATSDR websites is not subject to copyright, is in the public domain"; "some resources ... are restricted in their use because they were developed by government contractors or grantees, or have been licensed by a third party"; "1) Attribution to the agency that developed the material must be provided ... (e.g., 'Source: CDC'); 2) You must utilize a disclaimer which clearly indicates that your use of the material ... does not imply endorsement by CDC"; the CDC logo "may not be used without express written permission". WHO (https://www.who.int/about/policies/publishing/copyright): publications licensed "CC BY-NC-SA 3.0 IGO"; "WHO publications cannot be used to promote or endorse products, services or any specific organization." WHO terms of use (https://www.who.int/about/policies/terms-of-use): "Any use of information in the web site should be accompanied by an acknowledgment of WHO as the source, citing the uniform resource locator (URL)"; substantial reproduction or use beyond educational and non-commercial purposes requires written authorization.
  Implication: CDC milestone text and CDC LMS CSVs can be vendored into packages/core/data with a SOURCES.md carrying 'Source: CDC' and the non-endorsement sentence; WHO LMS tables should be vendored only with attribution plus a permission request filed before any paid tier, or derived at build time from WHO files the user downloads, which is tracked as an open question.

- Feeding, diaper and sleep norms for logging UI: AAP says breastfed newborns nurse about every 2 hours (10 to 12 sessions per day), bottle-fed every 2 to 3 hours with 8 feeds minimum, volumes grow from 1 to 2 oz to 6 to 8 oz by 6 months, and wet diapers should reach at least 5 to 6 per day after day 4 or 5; AASM gives 12 to 16 hours of sleep at 4 to 12 months, 11 to 14 at 1 to 2 years, 10 to 13 at 3 to 5 years, and no recommendation under 4 months.
  Source: https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-Often-and-How-Much-Should-Your-Baby-Eat.aspx (checked 2026-10-04, confidence high)
  Evidence: AAP: "Breastfed newborns usually nurse every 2 hours ... so 10-12 sessions in 24 hours is the norm"; "most newborns eat every 2 to 3 hours; 8 times is generally recommended as the minimum every 24 hours"; "usually drink 1 to 2 ounces at each feeding"; "at least 3 or 4 ounces per feeding, about every 3 to 4 hours" by the end of month one; "6 to 8 ounces at each of 4 or 5 feedings" at 6 months; "a baby should have 2 to 3 wet diapers each day. After the first 4 to 5 days, a baby should have at least 5 to 6 wet diapers a day." AASM consensus (https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/): "Infants 4 months to 12 months should sleep 12 to 16 hours per 24 hours (including naps)"; "Children 1 to 2 years of age should sleep 11 to 14 hours"; "Children 3 to 5 years of age should sleep 10 to 13 hours"; "Recommendations for infants younger than 4 months are not included due to the wide range of normal variation".
  Implication: Logging chips: feed (breast left/right with timer, bottle with ml or oz, solids), diaper (wet, dirty, mixed), sleep (start/stop). Daily summaries can show counts against these published ranges as context, never as alarms, and show no sleep target before 4 months.

- Postpartum return of cycles: without breastfeeding ovulation can return within weeks and periods by 5 to 6 weeks; with exclusive breastfeeding ovulation usually returns by about 6 months and pregnancy is possible before the first period; LAM requires exclusive frequent feeding (gaps no longer than 4 hours by day, 6 by night); after miscarriage a period can take up to 8 weeks and conception is possible within 2 weeks.
  Source: https://www.acog.org/womens-health/faqs/postpartum-birth-control (checked 2026-10-04, confidence high)
  Evidence: ACOG: "If you are not breastfeeding, ovulation may happen within a few weeks of childbirth. If you are breastfeeding, ovulation may be delayed, but it usually returns by about 6 months ... you can get pregnant during the postpartum time frame even if you have not yet had a period." LAM "requires exclusive, frequent breastfeeding. The time between feedings should not be longer than 4 hours during the day or 6 hours at night." NHS (https://www.nhs.uk/pregnancy/labour-and-birth/after-the-birth/your-body/): "If you bottle feed your baby, or combine bottle feeding with breastfeeding, your first period could start as soon as 5 to 6 weeks after you give birth"; "You can get pregnant again just 3 weeks after the birth of your baby". NHS miscarriage (https://www.nhs.uk/conditions/miscarriage/afterwards/): "After a miscarriage it can take up to 8 weeks before you have a period again"; "You can try to get pregnant again when you feel ready". ACOG early pregnancy loss (https://www.acog.org/womens-health/faqs/early-pregnancy-loss): "You can get pregnant again as soon as 2 weeks after an early miscarriage"; "You also may want to wait until you have had a menstrual period so that calculating the due date of your next pregnancy is easier."
  Implication: Postpartum chapter: predictions paused; a 'first period since birth' log event restarts cycle statistics from that date with the postpartum span excluded; optional LAM-aware info card worded as information, not advice; after a loss, no predictions until the first logged bleed or the user opts in.

- Communication after pregnancy or baby loss should mirror the parents' own words, acknowledge the baby, avoid platitudes and clinical euphemisms, and be led by the parent; NHS health-literacy data says most adults struggle with numeric health content.
  Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9214425/ (checked 2026-10-04, confidence high)
  Evidence: Crossingham and Abramson, BJA Education 2022: "If the parents choose to use such phrases, it is appropriate for you to mirror their words"; "Most bereaved parents report feeling comforted when other people talk about or acknowledge their baby who died"; avoid "I know how you feel", "at least you know you can get pregnant", "things happen for a reason"; communication should be "sensitive, compassionate, non-judgemental and led by the parent". NHS service manual (https://service-manual.nhs.uk/content/health-literacy): "more than 4 in 10 adults struggle with health content for the public" and "more than 6 in 10 adults struggle with health content that includes numbers and statistics".
  Implication: Loss flow copy: let the user choose the word (pregnancy or baby) and reuse it; no auto-generated week-by-week or milestone content after a loss; percentages and z-scores are shown with plain-language framing and can be hidden.

- Units: inch to centimetre (2.54) and foot to metre (0.3048) are exact in NIST SP 811; the avoirdupois pound is exactly 0.45359237 kg by the 1959 agreement (NIST SP 811 tabulates the rounded 4.535 924 E-01), so 1 oz is exactly 28.349523125 g.
  Source: https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9 (checked 2026-10-04, confidence medium)
  Evidence: NIST SP 811 B.9: "inch (in)" to "centimeter (cm)" factor "2.54 E+00" in boldface (exact); "foot (ft)" to "meter (m)" "3.048 E-01" boldface (exact); "pound (avoirdupois) (lb)" to "kilogram (kg)" "4.535 924 E-01"; "ounce (avoirdupois) (oz)" to "gram (g)" "2.834 952 E+01". The 1959 Federal Register notice (https://www.ngs.noaa.gov/PUBS_LIB/FedRegister/FRdoc59-5442.pdf, located via search) defines "1 pound (avoirdupois) = 0.453 592 37 kilogram" exactly.
  Implication: Store grams and millimetres as integers; convert with 28.349523125 g per oz and 25.4 mm per inch; round only at display (0.1 oz, 0.1 in, 10 g, 0.5 cm).

- Date and time zone platform facts: Postgres date is a 4-byte calendar date with no time of day; IANA tzdata 2026e was released 2026-09-29; Intl.Locale weekInfo has shipped in Node since 18 (accessor) and getWeekInfo since Node 24, Chrome 130, Safari 17, Firefox 153; Temporal ships in Node 26, Chrome 144 and Firefox 139 but not in Node 24 or Safari; Intl.DateTimeFormat with a timeZone option yields the local calendar date for any instant.
  Source: https://www.postgresql.org/docs/current/datatype-datetime.html (checked 2026-10-04, confidence high)
  Evidence: Postgres: "date | 4 bytes | date (no time of day)"; "we recommend using date/time types that contain both date and time when using time zones. We do not recommend using the type time with time zone". IANA (https://www.iana.org/time-zones): the database "is updated periodically to reflect changes made by political bodies to time zone boundaries, UTC offsets, and daylight-saving rules"; latest release 2026e, 2026-09-29. MDN compat data (https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/Intl/Locale.json): getWeekInfo nodejs "24.0.0" (weekInfo accessor "18.0.0"), chrome "130", safari "17", firefox "153"; Temporal (javascript/builtins/Temporal.json): nodejs "26.0.0", chrome "144", firefox "139", safari "preview". MDN getWeekInfo (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getWeekInfo): firstDay is "between 1 (Monday) and 7 (Sunday)"; en-GB returns "{ firstDay: 1, weekend: [6, 7], minimalDays: 4 }". Local Node 22 check: en-US weekInfo accessor returned {firstDay:7, weekend:[6,7], minimalDays:1}; Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles', year, month, day}) formatted 2026-10-04T06:30:00Z as 2026-10-03 and Pacific/Auckland as 2026-10-04. MDN Temporal.Now.plainDateISO (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/plainDateISO): returns "The current date in the specified time zone, as a Temporal.PlainDate object".
  Implication: Calendar facts (period starts, LMP, EDD, birth dates, feeds by day) are Postgres date columns; events with instants are timestamptz; the profile carries an IANA zone; core exposes localToday(instant, zone) built on Intl.DateTimeFormat so it runs on Node 24 and all browsers, with a Temporal upgrade path when Node 26 is LTS on 2026-10-28; week start comes from Intl.Locale weekInfo with a per-user override.

### Recommendations

- (consequential) Implement cycle statistics deterministically: use the most recent completed cycles (up to 6, minimum 3 for a confident prediction), exclude spans flagged pregnancy, postpartum, or hidden, drop any cycle whose length deviates from the median by more than 7 days when at least 4 cycles remain, round the mean to whole days, and classify regularity by span (7 or fewer regular, 8 to 9 borderline, over 9 irregular).
  Why: ACOG treats variation over 7 to 9 days as irregular; Clue needs 3 cycles for core predictions; a median-based exclusion keeps one anomalous 45-day cycle (common after illness or travel) from shifting every prediction; whole days match how every reference app displays dates.
  Rejected: Plain mean of all cycles (one outlier moves predictions by days); machine-learned per-user models (unverifiable in a deterministic core with two users); fixed 28-day assumption (Bull 2019 shows mean 29.3 and wide spread).

- (consequential) Predict as ranges with explicit confidence: next period = last start plus rounded mean, shown as a window whose half-width is max(1, round(stdev)) for regular cycles, max(2, ceil(span/2)) for borderline, clamp(ceil(span/2), 3, 7) for irregular, and 4 days with a 'learning' label when fewer than 3 cycles; ovulation = expected start minus 14 days with a plus or minus 2 day band; fertile window = ovulation minus 5 through plus 1.
  Why: ACOG gives the 14-day convention and the 5-before to 1-after window; NHS gives 12 to 16 days; Wilcox shows timing is unpredictable even in regular cycles; Apple and Natural Cycles both surface uncertainty rather than single days.
  Rejected: Apple's fixed 13-day luteal (defensible but ACOG's 14 is the convention used in due-date math, keeping one constant across chapters); point predictions (misleading per Wilcox); BBT-based ovulation confirmation (device-adjacent, out of scope).

- (consequential) Pregnancy math follows ACOG CO 700: EDD = LMP + 280, or scan date + (280 - GA at scan), or transfer date + 261 for a day-5 embryo; GA on any date = 280 - (EDD - date); trimesters at 98 and 196 days; a redating helper applies the CO 700 bands (more than 5 days before 9w0d, 7 before 14w0d, 7 for 14w0d to 15w6d, 10 for 16w0d to 21w6d, 14 for 22w0d to 27w6d, 21 after) and the app stores one EDD with provenance.
  Why: These are the published clinical rules; keeping EDD as the single source of truth avoids Flo's decoupled gestational-age and due-date fields.
  Rejected: Storing LMP only (fails for ultrasound or ART dating); storing both EDD and GA independently (inconsistent); Flo's 41-week default.

- (consequential) Model chapters as an explicit state machine with gentle transitions: cycle to pregnancy on user confirmation (the open cycle is marked excluded), pregnancy to postpartum on birth (predictions paused until a 'first period since birth' event), pregnancy to cycle on loss via an 'I'm no longer pregnant' flow with optional reason, resources, user-chosen timing, no automatic predictions until the first logged bleed, and copy that mirrors the user's own word for the pregnancy or baby.
  Why: Clue's loss flow and the BJA Education guidance are the best documented patterns; ACOG and NHS show periods may take 8 weeks to return after loss and up to 6 months or more while breastfeeding, so automatic predictions would be wrong and hurtful.
  Rejected: Separate apps per chapter (Ovia and Glow historically); auto-detecting pregnancy from a long cycle; resuming predictions immediately after a loss.

- (consequential) Ship one LMS growth engine with two vendored datasets: CDC LMS CSVs (public domain, attributed) for 2 to 20 years and WHO Child Growth Standards tables for birth to 24 months, selecting by age in days (under 730 WHO), implementing the WHO plus or minus 3 SD adjustment for weight-based indicators, and labelling WHO extremes at the 2.3rd and 97.7th percentiles.
  Why: This is CDC's own recommendation (MMWR 2010) and the formulas are published; a single engine keeps tests small.
  Rejected: CDC charts from birth (CDC says WHO under 2); third-party growth APIs (privacy); showing only percentiles without z-scores (loses precision at the tails).

- (consequential) Embed the CDC 2022 milestone checklists (12 ages, 159 items) as versioned JSON with 'Source: CDC' attribution and the non-endorsement disclaimer, framed as 'most children (75%) do this by', with an optional corrected-age view for preterm children and a permanent 'not a screening tool' line.
  Why: CDC's reuse terms require attribution and disclaimer; Zubler 2022 defines the 75% criterion and surveillance intent; Wonder Weeks demonstrates due-date-based timing for development.
  Rejected: Licensing a proprietary milestone set; scoring or flagging delays (that is screening); Wonder Weeks leap content (copyrighted and contested).

- (consequential) Store SI integers (grams, millimetres, millilitres) and convert at the edge with exact factors (25.4 mm per inch, 28.349523125 g per oz); keep calendar facts as Postgres date, instants as timestamptz, an IANA zone on the profile, and compute 'today' with Intl.DateTimeFormat formatToParts (Temporal later); derive week start from Intl.Locale weekInfo with a user override.
  Why: NIST factors are exact; Postgres documents date as a pure calendar type; Node 24 lacks Temporal while Intl is universal; week start varies by locale (en-US Sunday, en-GB Monday).
  Rejected: Floating-point pounds in the database; timestamptz for period dates (off-by-one across zones); server-zone 'today'; hard-coded Monday or Sunday.

- (consequential) Copy and regulatory posture: general wellness framing only, never the words birth control, contraception, protection or safe days; every prediction surface carries 'estimates, not medical advice' and a clinician reminder; cycle deviation nudges are observations plus a suggestion to talk to a clinician; keep a one-page regulatory note citing FDA guidance of 2026-01-06, 21 CFR 884.5370, and App Store 1.4.1 and 5.1.3.
  Why: Contraception claims are a Class II device; FDA's wellness guidance omits fertility tracking so the carve-out is statutory and copy-dependent; Apple requires the doctor reminder.
  Rejected: Natural Cycles style Red and Green days (contraceptive semantics); silent predictions without disclaimers.

- (consequential) Partner and caregiver access as explicit grants per data class (cycle calendar, symptoms, notes, pregnancy updates, child logs, growth, photos) and role (owner, caregiver, viewer), default deny, revocable instantly, with notification on mode changes and an audit log.
  Why: Flo hides symptoms and notes from partners and notifies on mode switches; Ovia separates caregivers from family; Glow's bidirectional all-or-nothing sharing is the pattern users complain about.
  Rejected: Single 'partner mode' bundle; account linking that shares both ways by default.

- (advisory) Privacy UX borrowed selectively: no third-party requests from authenticated screens, minimal identifiers, optional device passcode, on-device derivation of cues where cheap, and a short plain-language privacy explainer; skip Flo's account-splitting Anonymous Mode for now.
  Why: Flo's design spends heavily on OHTTP and loses device transfer; Tidefern can reach the same outcome by never collecting ad identifiers and keeping analytics off.
  Rejected: Full Anonymous Mode clone (complex, breaks recovery for two first users).

### Verified snippets

#### packages/core spec: function signatures (TypeScript, ISO date strings, no Date objects) with verified test vectors; rules cite ACOG CO 700, ACOG FAQs, NHS, Wilcox 2000, Bull 2019, CDC growth data files, MMWR 2010, WHO computation note, NIST SP 811

Source: https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date

```
// packages/core/src/dates.ts
export type ISODate = `${number}-${number}-${number}`; // 'YYYY-MM-DD', calendar fact, no zone
export function addDays(d: ISODate, n: number): ISODate;
export function diffDays(a: ISODate, b: ISODate): number; // b - a
export function localToday(nowUtc: string /* ISO instant */, timeZone: string /* IANA */): ISODate;
export function weekStart(locale: string, override?: 1|2|3|4|5|6|7): 1|2|3|4|5|6|7; // 1=Mon..7=Sun (Intl convention)

// packages/core/src/cycle.ts
export function cycleLengths(periodStarts: ISODate[]): number[]; // sorted asc, consecutive diffs
export interface CycleSummary { used: number[]; excluded: number[]; mean: number; rounded: number; median: number; span: number; stdev: number | null;
  regularity: 'insufficient'|'regular'|'borderline'|'irregular'; outsideTypicalRange: boolean }
export function summarizeCycles(lengths: number[], o?: { maxCycles?: number /*6*/; minCycles?: number /*3*/; outlierDays?: number /*7*/; adolescent?: boolean }): CycleSummary;
// rules: take last maxCycles; if >=4, drop |x - median| > outlierDays; regularity by span: <=7 regular, 8..9 borderline, >9 irregular; insufficient if used < minCycles
// outsideTypicalRange = any used < 21 or > (adolescent ? 45 : 35)  (ACOG)
export interface Prediction { expected: ISODate; earliest: ISODate; latest: ISODate; confidence: 'learning'|'low'|'medium'|'high' }
export function predictNextPeriod(lastStart: ISODate, s: CycleSummary): Prediction;
// halfWidth: regular max(1, round(stdev)); borderline max(2, ceil(span/2)); irregular clamp(ceil(span/2),3,7); insufficient 4 (mean of what exists, else 28)
export function predictOvulation(nextStart: ISODate, lutealDays = 14): { expected: ISODate; earliest: ISODate; latest: ISODate } // +-2 days (NHS 12..16)
export function fertileWindow(ovulation: ISODate): { start: ISODate; end: ISODate } // ov-5 .. ov+1 (ACOG)

// packages/core/src/pregnancy.ts
export function eddFromLmp(lmp: ISODate): ISODate;                         // +280 (ACOG CO 700)
export function eddFromUltrasound(scan: ISODate, gaWeeks: number, gaDays: number): ISODate; // scan + (280 - ga)
export function eddFromTransfer(transfer: ISODate, embryoDay: 3|5): ISODate; // day-5: +261 (CO 700 example); day-3: +263
export interface GA { days: number; weeks: number; remDays: number; label: string; trimester: 1|2|3 }
export function gestationalAge(on: ISODate, edd: ISODate): GA;             // days = 280 - diffDays(on, edd); T1 <=97, T2 98..195, T3 >=196
export function redatingAdvice(lmpEdd: ISODate, usEdd: ISODate, usGaDaysAtScan: number): { discrepancyDays: number; thresholdDays: number; suggestUltrasoundDate: boolean }
// threshold by usGaDaysAtScan: <63 -> 5; <98 -> 7; <112 -> 7; <154 -> 10; <196 -> 14; else 21  (CO 700)

// packages/core/src/chapters.ts
export type Chapter = 'cycle'|'pregnancy'|'postpartum';
export type Transition = { kind: 'startPregnancy'; edd: ISODate; source: 'lmp'|'ultrasound'|'art'|'manual' } | { kind: 'birth'; date: ISODate } | { kind: 'loss'; date: ISODate; word: 'pregnancy'|'baby' } | { kind: 'firstPeriodAfter'; date: ISODate };
export function applyTransition(state: ChapterState, t: Transition): ChapterState; // loss or birth => predictionsPaused=true until firstPeriodAfter
export function lamEligible(i: { birth: ISODate; on: ISODate; exclusiveBreastfeeding: boolean; bleedingReturned: boolean }): boolean; // on < birth+6mo && exclusive && !bleeding (ACOG)

// packages/core/src/growth.ts
export function zFromLms(x: number, L: number, M: number, S: number): number;     // CDC formula
export function valueFromZ(z: number, L: number, M: number, S: number): number;   // CDC inverse
export function percentileFromZ(z: number): number;                            // 100*Phi(z)
export function whoAdjustedZ(x: number, L: number, M: number, S: number): number; // weight-based: beyond +-3 use SD fixed to distance between 2SD and 3SD
export function chooseReference(ageDays: number): 'who'|'cdc';                 // <730 -> who (MMWR 2010)
export function cdcAgeRow(ageDays: number): number;                             // birth -> 0 else floor(days/30.4375)+0.5
export function ageOn(dob: ISODate, on: ISODate, dueDate?: ISODate): { days: number; weeks: number; correctedDays?: number };

// packages/core/src/units.ts
export const G_PER_OZ = 28.349523125; export const MM_PER_IN = 25.4;
export function gramsFromLbOz(lb: number, oz: number): number;   // round((lb*16+oz)*G_PER_OZ)
export function lbOzFromGrams(g: number): { lb: number; oz: number }; // oz to 0.1
export function mmFromIn(inches: number): number; export function inFromMm(mm: number): number;

/* TEST VECTORS (computed 2026-10-04)
TV1 eddFromLmp('2026-01-10') => '2026-10-17'
TV2 gestationalAge('2026-10-04','2026-10-17') => {days:267, weeks:38, remDays:1, label:'38w1d', trimester:3}; boundaries: 97d=13w6d T1, 98d=14w0d T2, 195d=27w6d T2, 196d=28w0d T3
TV3 eddFromUltrasound('2026-03-01',8,2) => '2026-10-09'; redatingAdvice('2026-10-17','2026-10-09',58) => {discrepancyDays:8, thresholdDays:5, suggestUltrasoundDate:true}
TV4 cycleLengths(['2026-03-07','2026-04-04','2026-05-04','2026-05-31','2026-06-29','2026-08-13','2026-09-10']) => [28,30,27,29,45,28]
    summarizeCycles(...) => {median:28.5, excluded:[45], used:[28,30,27,29,28], mean:28.4, rounded:28, span:3, stdev:1.14, regularity:'regular', outsideTypicalRange:false}
    predictNextPeriod('2026-09-10', s) => {expected:'2026-10-08', earliest:'2026-10-07', latest:'2026-10-09', confidence:'high'}
    predictOvulation('2026-10-08') => {expected:'2026-09-24', earliest:'2026-09-22', latest:'2026-09-26'}; fertileWindow('2026-09-24') => {start:'2026-09-19', end:'2026-09-25'}
TV5 CDC 9-month male L=-0.1600954 M=9.476500305 S=0.11218624: valueFromZ(-1.645) => 7.901 (CDC says 7.90); zFromLms(7.90) => -1.646 (5.0th pct); zFromLms(9.476500305) => 0 (50th); zFromLms(12.0) => 2.065 (98.1st)
TV6 ageOn('2026-01-15','2026-10-04') => {days:262}; cdcAgeRow(262) => 8.5; chooseReference(262) => 'who'
TV7 ageOn('2026-03-01','2026-10-04','2026-03-22') => {days:217 (31w0d), correctedDays:196 (28w0d)}
TV8 gramsFromLbOz(7,8) => 3402; lbOzFromGrams(3400) => {lb:7, oz:7.9}; inFromMm(508) => 20.0
TV9 localToday('2026-10-04T06:30:00Z','America/Los_Angeles') => '2026-10-03'; ('2026-10-04T06:30:00Z','Pacific/Auckland') => '2026-10-04'
TV10 lamEligible({birth:'2026-03-01', on:'2026-08-15', exclusiveBreastfeeding:true, bleedingReturned:false}) => true; on '2026-09-02' => false
TV11 summarizeCycles([28,29,28,30,29,28]) => {span:2, stdev:0.82, rounded:29, regularity:'regular'}; summarizeCycles([30,41]) => regularity:'insufficient'
*/
```

#### CDC LMS z-score and percentile formulas and the age-row convention, verbatim, for growth.ts and the data loader

Source: https://www.cdc.gov/growthcharts/cdc-data-files.htm

```
Z = ((X/M)**L) - 1) / (LS), L≠0   or   Z = ln(X/M)/S, L=0
X = M (1 + LSZ)**(1/L), L ≠ 0   or   X = M exp(SZ), L = 0
"Age is listed at the half month point for the entire month; for example, 1.5 months represents 1.0-1.99 months or 1.0 month up to but not including 2.0 months of age. The only exception is birth, which represents the point at birth."
Worked example (CDC): 9-month-old male, WTAGEINF: L=-0.1600954, M=9.476500305, S=0.11218624; Z=-1.645 gives the 5th percentile = 7.90 kg.
z-scores for 3rd,5th,10th,25th,50th,75th,85th,90th,95th,97th: -1.881,-1.645,-1.282,-0.674,0,0.674,1.036,1.282,1.645,1.881
Files (CSV): wtageinf, lenageinf, wtleninf, hcageinf (birth to 36 months); wtage, statage, bmiagerev, wtstat (2 to 20 years); sex 1=male 2=female.
```

#### WHO tail adjustment for weight-based indicators (weight-for-age, weight-for-length, BMI-for-age): compute z within -3..3 by LMS, then fix the SD beyond that to the 2SD to 3SD distance

Source: https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/computation.pdf?sfvrsn=c2ff6a95_4

```
// From WHO computation note (same methodology as the 2006 Child Growth Standards):
// zind = ((y/M)^L - 1) / (S*L)
// if zind > 3:  SD3pos = M*(1+L*S*3)^(1/L); SD23pos = SD3pos - M*(1+L*S*2)^(1/L); z = 3 + (y - SD3pos)/SD23pos
// if zind < -3: SD3neg = M*(1+L*S*(-3))^(1/L); SD23neg = M*(1+L*S*(-2))^(1/L) - SD3neg; z = -3 + (y - SD3neg)/SD23neg
// Height/length-for-age and head circumference use the plain LMS z (no adjustment).
// Screening cutoffs on WHO charts: 2.3rd and 97.7th percentiles (+-2 SD), per CDC MMWR 2010.
```

#### localToday without Temporal (Node 24 and all browsers); verified locally with Node: 2026-10-04T06:30:00Z gives 2026-10-03 in America/Los_Angeles and 2026-10-04 in Pacific/Auckland

Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts

```
export function localToday(nowUtcIso: string, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowUtcIso));
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}` as ISODate;
}
// Validate zones with Intl.supportedValuesOf('timeZone') (418 names on this Node) before saving to the profile.
// Week start: const wi = (loc: Intl.Locale) => (loc as any).getWeekInfo?.() ?? (loc as any).weekInfo; // Node 24+: getWeekInfo; Node 18+: weekInfo accessor
// Upgrade path when Node 26 is the runtime: Temporal.Now.plainDateISO(timeZone).
```

#### Data-source table for packages/core/data/SOURCES.md: what to vendor, what to attribute, what needs permission

Source: https://www.cdc.gov/other/agencymaterials.html

```
| Dataset | Source URL | Licence / terms | Embed? | Attribution text |
|---|---|---|---|---|
| CDC growth chart LMS files (8 CSVs, 2000 release, 2-20y and birth-36m) | https://www.cdc.gov/growthcharts/cdc-data-files.htm | US Government work (17 USC 105), CDC reuse terms: attribution + non-endorsement disclaimer, no logo | Yes, as CSV/JSON in repo | "Source: CDC. Reference to CDC materials does not imply endorsement by CDC, HHS or the U.S. Government." |
| CDC/WHO recommendation on chart choice (MMWR 2010;59(RR-9)) | https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5909a1.htm | Public domain | Cite only | "Grummer-Strawn LM et al., MMWR 2010" |
| WHO Child Growth Standards tables (z-score, percentile, expanded tables; birth-13 weeks and birth-5 years; LMS by day/month) | https://www.who.int/tools/child-growth-standards/standards/weight-for-age (and sibling indicator pages) | WHO terms of use: acknowledge WHO and URL; substantial or commercial reuse needs written authorization; WHO publications CC BY-NC-SA 3.0 IGO | Attribute; request permission before any paid tier (open question) | "WHO Child Growth Standards, World Health Organization, 2006. Used with acknowledgment; WHO does not endorse Tidefern." |
| CDC Learn the Signs. Act Early. milestone checklists (2022; 12 ages, 159 items) | https://www.cdc.gov/act-early/milestones/index.html ; method: Zubler 2022 https://pmc.ncbi.nlm.nih.gov/articles/PMC9680195/ | Public domain with CDC reuse terms (attribution, disclaimer, no logo); check items for contractor-owned media (photos/videos are often not public domain) | Yes, text only, versioned JSON | "Source: CDC 'Learn the Signs. Act Early.' Not a substitute for standardized, validated developmental screening tools." |
| ACOG dating rules (CO 700), trimester definitions, cycle FAQs | https://www.acog.org/... | Copyrighted; cite, do not copy prose | Encode rules as code constants with citation comments | "Based on ACOG Committee Opinion 700 (2017)" |
| NHS period, postpartum and miscarriage pages | https://www.nhs.uk/... | OGL-style NHS content (verify per page); cite | Cite | "NHS" |
| AAP feeding and diaper norms; AASM sleep durations | healthychildren.org; https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/ | Copyrighted; encode ranges as constants with citations | Constants only | "AAP HealthyChildren.org; AASM 2016 consensus" |
| Unit factors | https://www.nist.gov/pml/special-publication-811/... | US Government work | Constants | none required |
| IANA tz database (2026e) | https://www.iana.org/time-zones | Public domain data | Consumed via runtime Intl; no vendoring | none |
```

#### Copy templates for prediction, uncertainty, disclaimers, deviation nudges, and loss, modelled on Apple, Flo, Clue and the BJA guidance

Source: https://support.apple.com/en-us/120356

```
Prediction (regular): "Based on your last 5 cycles, your next period will likely start between Oct 7 and Oct 9."
Prediction (learning): "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 8, give or take 4 days."
Ovulation / fertile days: "Ovulation is estimated around Sep 24 (Sep 22 to 26). Days Sep 19 to 25 are when pregnancy is most likely. These are estimates, not a method of birth control."
Footer on every prediction surface: "Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis or treatment, and is not a form of birth control. Talk with your clinician before making health decisions."
Deviation nudge (observation, not diagnosis): "Your last 6 cycles ranged from 24 to 39 days. Variation like this is common and can also be worth mentioning to a clinician."
Loss flow: "I'm no longer pregnant" -> optional reason (skippable) -> "We're so sorry. Would you like to call this your pregnancy or your baby? We'll use your word." -> resources -> "Switch back to cycle tracking whenever you're ready. We won't show predictions until you log a period or turn them on."
Postpartum: "Predictions are paused after birth. When your first period comes, log it and Tidefern will start again from there."
```

### Open questions

- WHO licensing for embedding Child Growth Standards LMS or expanded tables in a product that may later be paid: WHO terms of use require written authorization for substantial or non-educational reuse. File a permissions request (WHO Press) before any commercial tier, or ship a build step that ingests WHO files without redistributing them. Also confirm whether the CDC-hosted WHO LMS data file (linked from https://www.cdc.gov/growthcharts/who-growth-charts.htm, not fetched) changes anything; it likely does not alter WHO's rights.
- CDC milestone checklist text must be captured from CDC pages that block automated fetching (Cloudflare challenge). Pull it manually from the Milestone Moments booklet or the per-age pages, and exclude photos and videos, which may be contractor-owned.
- Luteal constant: ACOG convention 14, Apple 13, Bull 2019 mean 12.4 (CI 7 to 17). Recommendation is 14 with a plus or minus 2 band; validate with the first two users and consider per-user luteal estimation only if ovulation tests are logged.
- FIGO AUB System 1 (2018) age-banded regularity thresholds (reported elsewhere as 9 days for ages 18 to 25 and 42 to 45, 7 days for 26 to 41) could not be verified from the paywalled primary text; ACOG's 'more than 7 to 9 days' was used instead.
- Flo's help article reportedly states the default due date is the last period plus 41 weeks; this came from a tool summary of the page and conflicts with the 40-week convention. Verify by hand before citing it as a competitor quirk.
- Node runtime: Node 24 (current LTS) lacks Temporal; Node 26 becomes LTS 2026-10-28 and ships Temporal. Decide whether core targets Intl-only until the Vercel runtime offers Node 26, or adopts a Temporal polyfill now.
- Clue's loss flow and the Wonder Weeks due-date explanation were captured from search snippets because both sites block automated fetching; confirm wording by hand before quoting in design docs.
- Whether Tidefern will ever ingest wearable temperature (Apple retrospective ovulation estimates). If so, revisit the FDA wellness guidance section on non-invasive sensing and the Natural Cycles special controls.

### Sources that could not be read

- https://help.flo.health/hc/en-us/articles/4406289325713-Anonymous-Mode (404; used Flo's May 2024 Anonymous Mode overview PDF and newsroom instead)
- https://flo.health/flo-for-partners (404; used help.flo.health partner articles instead)
- https://www.bmj.com/content/321/7271/1259 (403; used PMC27529 mirror)
- https://www.nature.com/articles/s41746-019-0152-7 (redirect to publisher IdP; used PMC6710244 mirror)
- https://www.cdc.gov/act-early/about/index.html and per-age checklist pages such as https://www.cdc.gov/act-early/milestones/milestones-2-months.html (Cloudflare challenge host blocked by the egress proxy; index page rendered, Zubler 2022 used for criteria)
- https://www.cdc.gov/growthcharts/percentile_data_files.htm (renders empty; https://www.cdc.gov/growthcharts/cdc-data-files.htm used)
- https://support.helloclue.com/hc/en-us/articles/* (403 via curl and WebFetch, blank or timeout via Chromium; helloclue.com articles and App Store listing used; loss flow from search snippet only)
- https://help.naturalcycles.com/hc/en-us/articles/360003306893-How-Natural-Cycles-works (403; sibling article on ovulation detection rendered via Chromium, plus FDA De Novo summary and naturalcycles.com home page)
- https://www.naturalcycles.com/how-it-works (404)
- https://thewonderweeks.com/blog/leaps/wonder-weeks-due-date-vs-birthdate/ (403 and Chromium timeout; search snippet only)
- https://obgyn.onlinelibrary.wiley.com/doi/10.1002/ijgo.12666 (403, paywalled; not in PMC per Europe PMC)
- https://support.apple.com/guide/iphone/log-a-pregnancy-iph27f6ec4d7/ios (connection failures; https://support.apple.com/en-us/120356 covers pregnancy factors)
- https://www.healthychildren.org/English/ages-stages/baby/diapers-clothing/Pages/Urination-in-Babies.aspx (404; diaper counts taken from the AAP feeding page)
- https://fphandbook.org/lactational-amenorrhea-method (404; ACOG postpartum birth control FAQ used)
- https://www.fda.gov/news-events/press-announcements/fda-allows-marketing-first-direct-consumer-app-contraceptive-use-prevent-pregnancy (404; De Novo decision summary DEN170052 used)
- https://stacks.cdc.gov/view/cdc/122643/cdc_122643_DS1.pdf (returned HTML, not PDF; PMC9680195 used)
- https://pubmed.ncbi.nlm.nih.gov/20829749/ (cookie wall; MMWR page rendered via Chromium instead)
- https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/computation.pdf (404; the 2007 reference computation note, which states it follows the same methodology, was used)
- https://www.acog.org/* via WebFetch (402; all ACOG pages were fetched successfully with curl and a browser user agent)

## agent-practices-compliance

<a id="agent-practices-compliance"></a>

Dimension: Agent working conventions, prompting, and compliance spot-check

### Summary

AGENTS.md is a plain-Markdown "README for agents" with nearest-file-wins semantics, read natively by Codex (root-to-cwd concatenation, 32 KiB cap), Cursor, GitHub Copilot (cloud agent, code review, CLI) and, since Claude Code v2.1.277, by Claude Code itself, but Claude Code only reads it when no CLAUDE.md or CLAUDE.local.md exists on the path, so the robust pattern is a root AGENTS.md plus a three-line CLAUDE.md whose first line is "@AGENTS.md". For skills, the agentskills.io spec fixes name (1 to 64 chars, lowercase, hyphens, must match directory) and description (1 to 1024 chars), recommends references/, scripts/ and assets/ folders, SKILL.md under 500 lines, and one-level relative references; Codex reads .agents/skills from cwd up to the repo root and follows symlinks, Cursor reads .agents/skills, .cursor/skills and, for compatibility, .claude/skills and .codex/skills, and Claude Code reads only .claude/skills but documents per-skill symlinked folders, so the recommended layout is canonical .agents/skills/<name> with .claude/skills/<name> symlinks, which git stores as mode 120000 link blobs (core.symlinks defaults to true; Windows checkouts need core.symlinks enabled). Anthropic's current prompting guidance converges on a small set of build-prompt rules: give the agent a check it can run, explore then plan then implement, be explicit and explain motivation, structure the prompt with XML or headers and put long material first, keep instruction files under 200 lines, use a different first-session prompt that creates a JSON feature list with passes:false, a progress file, an init script and an initial commit, resume by reading progress notes, the feature list and git log, mark features passing only after end-to-end verification, keep scope to the request, run independent tool calls in parallel, give subagents an objective, output format, tools and nonoverlapping boundaries and have them return condensed summaries, and tell the model what a compaction summary must preserve. The compliance delta since the memos is modest: New York's S929 was vetoed on December 19, 2025 and the revised S9269/A10357 passed both houses on June 3 and 4, 2026 but as of today has not been delivered to or signed by the governor, so it is not law; the FTC Health Breach Notification Rule as amended effective July 29, 2024 covers health apps, treats unauthorized disclosure as a breach, requires notice within 60 calendar days, and carries civil penalties up to $53,088 per violation, a figure the FTC confirmed will stay unchanged through 2026. Washington's MHMDA day-one obligations are confirmed in RCW 19.373: homepage link to a consumer health data privacy policy, opt-in consent for collection and a separate consent for sharing, deletion within 45 days including archived and backup systems (backups may take up to six months), notification of processors, binding processor contracts, authorization before any sale, and no geofencing of in-person health facilities, all enforceable through the Consumer Protection Act with a private right of action. No US law requires a consent banner for strictly functional storage (CCPA's homepage link applies only to businesses that sell or share), and in the EU Article 5(3) ePrivacy exempts storage that is strictly necessary for a service the user explicitly requested, with WP29 Opinion 04/2012 naming authentication, user-input, security and load-balancing session cookies as exempt and EDPB Guidelines 2/2023 confirming the rule reaches localStorage and similar storage too. WCAG 2.2 AA (Recommendation 5 October 2023, updated 12 December 2024) adds 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size 24 by 24 CSS pixels, and 3.3.8 Accessible Authentication, which matters for Tidefern's login. Every proposed vendor publishes a self-serve DPA: Vercel's binds on entering the Agreement but only for Pro and Enterprise plans and Hobby is non-commercial, so production should be on Pro from day one; Neon is now a Databricks product whose Product Specific Schedule accepts by use and whose MCSA incorporates the Databricks DPA with SCCs and the UK Addendum; Cloudflare's self-serve agreement incorporates DPA v6.4; Resend's DPA binds on entering the agreement and its subprocessor list (updated 2026-08-27) includes AWS for sending plus Anthropic and RunPod for AI features; GitHub's DPA (October 2025) attaches to the Customer Agreement, while individual accounts fall under the Privacy Statement, which is acceptable because GitHub holds only code and CI logs.

### Findings

- AGENTS.md is a plain Markdown file with no required fields; agents read the nearest AGENTS.md in the directory tree and explicit chat prompts override it.
  Source: https://agents.md/ (checked 2026-10-04, confidence high)
  Evidence: "a README for agents: a dedicated, predictable place to provide the context and instructions to help AI coding agents work on your project"; recommended content is "build steps, tests, and conventions", project overview, code style, testing instructions, security considerations, commit and PR guidelines; "The closest AGENTS.md to the edited file wins; explicit user chat prompts override everything."; "AGENTS.md is just standard Markdown. Use any headings you like; the agent simply parses the text you provide." Supported tools listed include OpenAI Codex, Google Jules, Aider, GitHub Copilot, VS Code, Cursor, Zed, Devin and JetBrains Junie.
  Implication: Tidefern's canonical cross-tool instruction file should be a root AGENTS.md with the sections the convention recommends (overview, commands, style, testing, security, PR etiquette). Keep it short because every supporting tool loads it in full.

- Claude Code reads AGENTS.md directly only when no CLAUDE.md or CLAUDE.local.md exists on the path (v2.1.277+); otherwise it reads CLAUDE.md only, so the portable pattern is a CLAUDE.md that imports AGENTS.md with @AGENTS.md. Claude Code never reads .agents/ or AGENTS.override.md.
  Source: https://code.claude.com/docs/en/memory (checked 2026-10-04, confidence high)
  Evidence: "By default, Claude reads AGENTS.md only when you have no CLAUDE.md in your working directory or above it." Table: "An AGENTS.md and a CLAUDE.md or CLAUDE.local.md in your working directory or above it | Your CLAUDE.md files only"; "Reading AGENTS.md directly requires Claude Code v2.1.277 or later."; "Not read: AGENTS.local.md, AGENTS.override.md, or anything under a .agents/ directory"; "you can still keep it as the one file every tool shares by putting an @AGENTS.md import in a CLAUDE.md next to it ... Add any Claude-specific instructions below the import, and Claude reads the imported file first, then the rest"; "Keeping the import never makes Claude read AGENTS.md twice, whichever Project instructions value you use." Import rules: "CLAUDE.md files can import additional files using @path/to/import syntax ... Relative paths resolve relative to the file containing the import ... maximum depth of four hops"; "Import parsing skips Markdown code spans and fenced code blocks"; "Size: target under 200 lines per CLAUDE.md file ... Imports help you organize a long file but don't reduce its context cost, because imported files also load at launch." Symlink alternative caveat: "Windows: ... use the @AGENTS.md import instead ... Git checks a committed symlink out as a plain text file unless core.symlinks is enabled". Also: "Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead."
  Implication: Ship AGENTS.md plus a tiny CLAUDE.md whose first line is @AGENTS.md followed by Claude-only notes; this works on every Claude Code version and setting, survives adding a gitignored CLAUDE.local.md, and fires InstructionsLoaded hooks. Keep AGENTS.md well under 200 lines because imports load at launch and count toward the length warning. Rules that must always hold belong in hooks, not prose. Do not mention paths like @README in prose outside backticks or they will be imported.

- Codex concatenates AGENTS.md files from the project root down to the cwd (later files override), skips empty files, caps combined size at 32 KiB by default, and honors AGENTS.override.md; Cursor treats a root AGENTS.md as a plain-markdown alternative to .cursor/rules and supports nested AGENTS.md; GitHub Copilot reads AGENTS.md anywhere in the repo (nearest wins) and a root-only CLAUDE.md, in cloud agent, code review, VS Code chat and CLI but not Copilot Chat on github.com.
  Source: https://learn.chatgpt.com/docs/agent-configuration/agents-md (checked 2026-10-04, confidence high)
  Evidence: Codex: "Starting at the project root (typically the Git root), Codex walks down to your current working directory" checking "AGENTS.override.md, then AGENTS.md, then fallback filenames"; "Codex concatenates files from the root down, joining them with blank lines. Files closer to your current directory override earlier guidance because they appear later in the combined prompt."; "Codex skips empty files and stops adding files once the combined size reaches the limit defined by project_doc_max_bytes (32 KiB by default)." Cursor (https://cursor.com/docs/context/rules): "Place it in your project root as an alternative to .cursor/rules for straightforward use cases."; "Unlike Project Rules, AGENTS.md is a plain markdown file without metadata or complex configurations."; "Nested AGENTS.md support in subdirectories is now available." Copilot (https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions): "You can create one or more AGENTS.md files, stored anywhere within the repository. When Copilot is working, the nearest AGENTS.md file in the directory tree will take precedence."; "Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository." Support matrix (https://docs.github.com/en/copilot/reference/custom-instructions-support): AGENTS.md supported by Copilot cloud agent and code review on GitHub.com, Copilot Chat and cloud agent in VS Code, cloud agent in JetBrains/Eclipse/Xcode, and Copilot CLI; not Copilot Chat on github.com.
  Implication: A single root AGENTS.md serves all three target tools. If per-package AGENTS.md files are added later (apps/web, packages/api), Codex only loads those on the path from root to cwd, Claude Code with a root CLAUDE.md will not load nested AGENTS.md unless each package also gets a CLAUDE.md importing it or the project-instructions setting is changed, so keep a single root file for now and put package detail in skills.

- The Agent Skills specification defines SKILL.md frontmatter (name, description required; license, compatibility, metadata, allowed-tools optional), strict name and description limits, optional scripts/, references/ and assets/ folders, progressive disclosure, a 500-line SKILL.md ceiling, and one-level relative file references.
  Source: https://agentskills.io/specification (checked 2026-10-04, confidence high)
  Evidence: name: "Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen." ... "Must not contain consecutive hyphens (--)" ... "Must match the parent directory name". description: "Max 1024 characters. Non-empty. Describes what the skill does and when to use it." compatibility: "Max 500 characters". allowed-tools: "Space-separated string of pre-approved tools the skill may use. (Experimental)". Directories: "scripts/ Optional: executable code; references/ Optional: documentation; assets/ Optional: templates, resources". "Metadata (~100 tokens) ... Instructions (< 5000 tokens recommended) ... Resources (as needed)"; "Keep your main SKILL.md under 500 lines. Move detailed reference material to separate files."; "When referencing other files in your skill, use relative paths from the skill root"; "Keep file references one level deep from SKILL.md. Avoid deeply nested reference chains."; validation: "skills-ref validate ./my-skill". The home page states the format "was originally developed by Anthropic, released as an open standard" and lists Claude Code, ChatGPT & Codex, Cursor, GitHub Copilot, VS Code, Gemini CLI, OpenCode and others as clients.
  Implication: Tidefern skills should use only the six spec fields in frontmatter so they load unchanged in Claude Code, Codex and Cursor, keep SKILL.md short with detail in references/, use relative paths only, and be checked with skills-ref validate in CI.

- Claude Code loads project skills only from .claude/skills (plus parents up to the repo root), explicitly supports a per-skill folder being a symlink to a directory elsewhere and dedupes it, and extends the spec with Claude-only frontmatter fields that other tools may reject.
  Source: https://code.claude.com/docs/en/skills (checked 2026-10-04, confidence high)
  Evidence: Table: "Project | .claude/skills/<skill-name>/SKILL.md | Sessions in this repository". "Claude Code loads project skills from .claude/skills/ in the directory where you start it and in every parent directory up to the repository root". "Symlinked folders: a <skill-name> entry in the enterprise, personal, or project location can be a symlink to a directory elsewhere on disk. Claude Code reads SKILL.md from the target and loads the skill once even if several locations point at the same target." "Claude Code skills follow the Agent Skills open standard ... Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection." "Outside Claude Code, you can use only the fields in the Agent Skills spec" (name, description, license, compatibility, allowed-tools, metadata); "Restricting frontmatter to the spec's six fields avoids the unexpected-key error". Claude-only fields include disable-model-invocation, user-invocable, context, agent, model, effort, background, hooks, paths, shell, argument-hint, arguments, when_to_use. The memory page states Claude Code does not read "anything under a .agents/ directory".
  Implication: Claude Code will not see .agents/skills, so each canonical skill needs a .claude/skills/<name> symlink (or copy). Symlinks are the documented, deduplicated path. Avoid Claude-only fields in shared skills; if a Claude-specific variant is needed, add a separate Claude-only skill rather than polluting the shared one.

- Codex scans .agents/skills in every directory from the cwd up to the repository root, follows symlinked skill folders, and does not merge same-named skills; Cursor loads .agents/skills and .cursor/skills natively, plus .claude/skills and .codex/skills for compatibility, discovers nested skill folders recursively, and says nothing about symlinks or duplicate handling.
  Source: https://learn.chatgpt.com/docs/build-skills (checked 2026-10-04, confidence high)
  Evidence: Codex: "For repositories, Codex scans .agents/skills in every directory from your current working directory up to the repository root. If two skills share the same name, Codex doesn't merge them; both can appear in skill selectors." Scopes: REPO $CWD/.agents/skills (and parents), USER $HOME/.agents/skills, ADMIN /etc/codex/skills, SYSTEM bundled. "Codex supports symlinked skill folders and follows the symlink target when scanning these locations." Optional "agents/openai.yaml" for UI metadata and "allow_implicit_invocation" (default true). Cursor (https://cursor.com/docs/context/skills): "Skills are automatically loaded from these locations: .agents/skills/ Project-level; .cursor/skills/ Project-level; ~/.agents/skills/ ...; ~/.cursor/skills/"; "For compatibility, Cursor also loads skills from Claude and Codex directories: .claude/skills/, .codex/skills/, ~/.claude/skills/, and ~/.codex/skills/."; "Cursor walks the skills root recursively and picks up any SKILL.md it finds"; "Agent Skills is an open standard. Learn more at agentskills.io." No mention of symlinks or of deduplicating the same skill reached through two directories.
  Implication: Canonical .agents/skills/<name> is read natively by Codex and Cursor; .claude/skills/<name> symlinks serve Claude Code. Cursor will see both paths for the same skill; whether it shows a duplicate entry is undocumented and should be checked once in Cursor (cosmetic if it happens, since both resolve to identical content).

- Git stores symbolic links as link-text blobs and checks them out as real symlinks when core.symlinks is true, which is the default except where the filesystem cannot support them; on such filesystems (and Windows without core.symlinks) they appear as small plain files containing the link text.
  Source: https://git-scm.com/docs/git-config (checked 2026-10-04, confidence high)
  Evidence: "core.symlinks If false, symbolic links are checked out as small plain files that contain the link text. git-update-index[1] and git-add[1] will not change the recorded type to regular file. Useful on filesystems like FAT that do not support symbolic links. The default is true, except git-clone[1] or git-init[1] will probe and set core.symlinks false if appropriate when the repository is created." Claude Code memory docs add: "Creating a symlink there [Windows] needs Administrator privileges or Developer Mode, and Git checks a committed symlink out as a plain text file unless core.symlinks is enabled".
  Implication: Committed relative symlinks (.claude/skills/<name> -> ../../.agents/skills/<name>) work for a solo developer on macOS or Linux and in cloud sandboxes; document the Windows caveat in AGENTS.md and add a CI check that each symlink resolves and that every .agents/skills entry has a .claude/skills counterpart.

- Anthropic's current prompting reference prescribes: be clear and direct, explain the motivation behind instructions, wrap examples in <example> tags, use XML tags to separate instructions, context and inputs, put long documents at the top with the query at the end, ask for relevant quotes first on long documents, tell Claude what to do rather than what not to do, and ask Claude to self-check against stated criteria.
  Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices (checked 2026-10-04, confidence high)
  Evidence: "Claude responds well to clear, explicit instructions ... If you want 'above and beyond' behavior, explicitly request it"; "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can help Claude better understand your goals"; "Wrap examples in <example> tags (multiple examples in <examples> tags) so Claude can distinguish them from instructions ... Include 3-5 examples for best results"; "XML tags help Claude parse complex prompts unambiguously ... Wrapping each type of content in its own tag (for example, <instructions>, <context>, <input>) reduces misinterpretation"; "Put longform data at the top: Place your long documents and inputs near the top of your prompt, above your query, instructions, and examples"; "Queries at the end can improve response quality by up to 30 percent in tests"; "Ground responses in quotes: For long document tasks, ask Claude to quote relevant parts of the documents first before carrying out its task"; "Tell Claude what to do instead of what not to do"; "Ask Claude to self-check. Append something like 'Before you finish, verify your answer against [test criteria].'" The overview page (https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) now points to this page as "the living reference". The context-engineering article (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) adds the altitude rule: prompts should be "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics", organized "into distinct sections (like <background_information>, <instructions>, ## Tool guidance, ## Output description, etc)", aiming for "the smallest possible set of high-signal tokens".
  Implication: The Tidefern build prompt should be sectioned with XML or H2 headers (context, architecture decisions, constraints, task list, verification, output), place the architecture memo and plan before the instructions, give 3 to 5 worked examples where format matters (commit messages, task log entries), phrase constraints positively, and state why privacy rules exist so the agent generalizes correctly.

- Claude Code best practices: give Claude a check it can run and demand evidence; explore, plan, then implement (skip planning for one-sentence diffs); keep CLAUDE.md to what Claude cannot infer; use subagents to keep research out of the main context and for adversarial review in a fresh context; use hooks for rules that must hold every time; clear context between unrelated tasks.
  Source: https://code.claude.com/docs/en/best-practices (checked 2026-10-04, confidence high)
  Evidence: "Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from."; "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."; "Separate research and planning from implementation to avoid solving the wrong problem." with phases Explore, Plan, Implement, Commit; "If you could describe the diff in one sentence, skip the plan."; CLAUDE.md: "For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"; include "Bash commands Claude can't guess", "Repository etiquette", "Architectural decisions specific to your project", exclude "Anything Claude can figure out by reading code"; "Subagents run in separate context windows and report back summaries"; "Before treating a task as done, have a subagent review the diff in a fresh context and report gaps." and "Tell the reviewer to flag only gaps that affect correctness or the stated requirements"; "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."; "Run /clear between unrelated tasks to reset context."; "The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works." The former anthropic.com/engineering/claude-code-best-practices URL now redirects (308) to this page.
  Implication: Each build task in Tidefern's plan should carry an executable acceptance check (pnpm turbo test, typecheck, Playwright, axe), the prompt should require evidence in the task log, and the plan should include a fresh-context review subagent step before marking a task done. Rules like 'never commit .env' belong in PreToolUse hooks.

- Anthropic's long-running agent harness and multi-window guidance: use a different prompt for the first session (initializer) that writes a JSON feature list with passes:false, a progress notes file, setup scripts and an initial git commit; later sessions start by reading progress notes, the feature list and git log, run a fundamental integration test, then pick the highest-priority unfinished feature; use git as checkpoints; mark features passing only after end-to-end verification; never remove or edit tests.
  Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (checked 2026-10-04, confidence high)
  Evidence: "an initializer agent that sets up the environment on the first run, and a coding agent that is tasked with making incremental progress in every session"; the initializer creates "a claude-progress.txt file that keeps a log of what agents have done" and "a structured JSON file with a list of end-to-end feature descriptions" each with a "passes" field; "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."; sessions "Read the git logs and progress files to get up to speed on what was recently worked on. Read the features list file and choose the highest-priority feature."; agents "commit its progress to git with descriptive commit messages"; "Self-verify all features. Only mark features as 'passing' after careful testing." Failure modes: "The agent tended to try to do too much at once" and "A later agent instance would look around, see that progress had been made, and declare the job done." The prompting reference (https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) codifies this: "Use a different prompt for the very first context window", "keep track of them in a structured format (for example, tests.json)", "create setup scripts (for example, init.sh)", "Review progress.txt, tests.json, and the git logs.", "Manually run through a fundamental integration test before moving on to implementing new features.", "Use structured formats for state data ... Use unstructured text for progress notes ... Use git for state tracking ... Emphasize incremental progress".
  Implication: Tidefern's build prompt should ship as two prompts (kickoff and resume), keep a tracked task list with stable IDs and pass/fail status in a JSON file, a free-text progress log, an init script, and a resume protocol that reads log, task file and git log then runs the smoke test before new work. Treat the task file as append-only for tests.

- Multi-agent guidance: a lead agent delegates to subagents that each receive an objective, output format, tool guidance and clear boundaries; effort scales with complexity; subagents should write artifacts to the filesystem and return references or condensed summaries rather than full transcripts; the lead should keep working while subagents run.
  Source: https://www.anthropic.com/engineering/multi-agent-research-system (checked 2026-10-04, confidence high)
  Evidence: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries."; without that "agents duplicate work, leave gaps, or fail to find necessary information"; "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each"; "implement artifact systems where specialized agents can create outputs that persist independently"; "When context limits approach, agents can spawn fresh subagents with clean contexts while maintaining continuity through careful handoffs." Context engineering article: each subagent "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)". Building Effective Agents (https://www.anthropic.com/engineering/building-effective-agents): "find the simplest solution possible, and only increasing complexity when needed"; agents need "ground truth from the environment at each step (such as tool call results or code execution)"; include "stopping conditions (such as a maximum number of iterations)". Fable 5.1 page: "letting the lead continue while subagents run lowers average time to completion at similar quality" and "Use subagents when tasks can run in parallel, require isolated context".
  Implication: When the build prompt spawns subagents (for example API package vs web app), give each a written brief with scope, files it may touch, output location and done criteria, require a written handoff file, and keep the lead merging and verifying rather than idle.

- Claude Fable 5.1 specific prompting: add an explicit autonomy block so the model finishes the whole task instead of ending with a plan or permission question; add a scope block so it neither narrows nor widens the request and reports pre-existing bugs as follow-ups; ask for brief user-facing progress text; nudge batching of independent tool calls each turn; and tell it what a compaction summary must preserve.
  Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1 (checked 2026-10-04, confidence high)
  Evidence: "nudge it not to end its turn before the work is done. Without the nudge, the model sometimes describes what it would do next instead of doing it ('Next, I'll ...') or stops to ask permission for a step the original request already covered"; sample: "You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task ... Stop only for destructive actions or genuine scope changes the user must decide ... Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ... do that work now with tool calls ... Do not stop because the context or session is long."; "The opening sentence, which tells the model the user isn't watching, carries much of the effect. Keep it as written."; scope: "If, while working or testing, you find a pre-existing bug, a performance concern, or behavior the task doesn't mention, don't fix, optimize or extend it in this change unless the requested behavior cannot work without it; report it as a follow-up in your summary."; progress: "Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own"; batching: "First privately list what you need next; then request every item that doesn't depend on another's result in this one response."; compaction: "Be sure to preserve: (1) any difficulties or problems that came up, and how they were handled or resolved; (2) any possibilities, options, or approaches that were raised, tried, or set aside, and why; (3) anything that was asked for, decided, agreed, ruled out, or established ... (4) exactly where things stand now ... (5) anything still open, unresolved, promised, or expected to happen next; (6) specific details that would be hard to reconstruct". General reference adds for safety: confirm "Hard to reverse operations: git push --force, git reset --hard, amending published commits" and "don't bypass safety checks (e.g. --no-verify)".
  Implication: Since the build agent will likely run on Claude Fable 5.1 unattended, paste the autonomy block verbatim at the top of the build prompt, add the scope block, list the few actions that still require a human (production migrations, deleting data, force pushes, spending money), and include a compaction-preservation instruction in CLAUDE.md so task IDs, modified files and test commands survive summarization.

- New York's Health Information Privacy Act S929/A2141 was vetoed on December 19, 2025; the revised 2026 bill S9269/A10357 passed the Senate on June 3, 2026 and the Assembly on June 4, 2026, but as of October 4, 2026 has not been delivered to the governor, signed, or vetoed, so it is not law.
  Source: https://www.nysenate.gov/legislation/bills/2025/S9269 (checked 2026-10-04, confidence high)
  Evidence: S929 (https://www.nysenate.gov/legislation/bills/2025/S929): actions "December 8, 2025: Delivered to governor; December 19, 2025: Vetoed by governor", status "Vetoed By Governor". S9269: introduced "Feb 20, 2026", "Jun 03, 2026: Passed Senate (48 aye, 13 nay); delivered to Assembly", "Jun 04, 2026: Passed Assembly; returned to Senate"; the Actions list contains no "DELIVERED TO GOVERNOR", "SIGNED CHAP." or "VETOED" entry and the status bar reads "Passed Senate & Assembly". The Assembly record (https://nyassembly.gov/leg/?default_fld=&leg_video=&bn=S09269&term=2025&Summary=Y&Actions=Y) lists same-as A10357, sponsor Krueger, last action "06/04/2026: Returned to Senate", summary "requires either written consent or a designated necessary purpose for the processing of an individual's health information".
  Implication: No New York obligation applies today. Because New York delivers passed bills to the governor in batches through December, add a monitoring item for S9269; if signed, Tidefern's consent and 'necessary purpose' model built for Washington MHMDA is the right foundation but the effective date and definitions must be re-checked.

- The FTC Health Breach Notification Rule (16 CFR Part 318), as amended effective July 29, 2024, covers developers of health apps that draw identifiable health information from multiple sources, treats unauthorized disclosure as a breach, requires individual notice without unreasonable delay and within 60 calendar days, FTC notice contemporaneously for 500 or more and annually for fewer, and carries civil penalties of up to $53,088 per violation, unchanged for 2026.
  Source: https://www.govinfo.gov/content/pkg/FR-2024-05-30/html/2024-10855.htm (checked 2026-10-04, confidence high)
  Evidence: Final rule 89 FR 47028: "DATES: The amendments are effective July 29, 2024."; "The amendments: (1) clarify the Rule's scope, including its coverage of developers of many health applications ('apps'); (2) clarify what it means for a vendor of personal health records to draw PHR identifiable health information from multiple sources; (3) revise the definition of breach of security to clarify that a breach of security includes data security breaches and unauthorized disclosures ... (7) alter the Rule's timing requirement for notifying the FTC". eCFR Part 318 (API, current as of 2026-10-01): "Source: 74 FR 42980, Aug. 25, 2009, as amended at 89 FR 47054, May 30, 2024"; "Breach of security means ... acquisition of such information without the authorization of the individual"; 318.4: "without unreasonable delay and in no case later than 60 calendar days after the discovery of a breach of security"; FTC notice for "500 or more individuals shall be provided contemporaneously", fewer than 500 "annually ... no later than 60 calendar days following the end of the calendar year"; violations are "subject to civil penalties (as adjusted for inflation pursuant to § 1.98 of this chapter)". FTC guidance (https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0): "a civil penalty of up to $53,088 per violation". FTC notice 91 FR 58446 (https://www.govinfo.gov/content/pkg/FR-2026-09-15/html/2026-18853.htm): "the Federal Trade Commission ('FTC')'s civil penalty amounts will remain unchanged during 2026. The FTC will continue to apply the 2025 civil penalty levels. DATES: Effective September 15, 2026." The rule's preamble cites the Premom period-tracking app enforcement action.
  Implication: Tidefern (cycle, pregnancy, child health data from user entry plus imports) is squarely a vendor of personal health records. The architecture needs a breach-response runbook with a 60-day clock, an inventory of what counts as unauthorized disclosure (including misconfigured third-party sharing), and a design that avoids any disclosure to analytics or email vendors beyond what the user authorized.

- Washington MHMDA (RCW 19.373) requires on day one: a prominently linked consumer health data privacy policy on the homepage, opt-in consent for collection for a specified purpose, a separate and distinct consent for sharing, deletion within 45 days (one 45-day extension) including archived and backup systems with up to six months for backups, notice of deletion to processors and third parties, binding processor contracts, valid authorization before any sale, and no geofencing of in-person health facilities; violations are per se Consumer Protection Act violations with a private right of action.
  Source: https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true (checked 2026-10-04, confidence high)
  Evidence: 19.373.010: consumer health data is "personal information that is linked or reasonably linkable to a consumer and that identifies the consumer's past, present, or future physical or mental health status"; consent is "a clear affirmative act that signifies a consumer's freely given, specific, informed, opt-in, voluntary, and unambiguous agreement". 19.373.020: "A regulated entity and a small business shall prominently publish a link to its consumer health data privacy policy on its homepage." 19.373.030: "may not collect any consumer health data except: (i) With consent from the consumer for such collection for a specified purpose" and sharing requires "consent from the consumer for such sharing that is separate and distinct from the consent obtained to collect consumer health data". 19.373.040: "Delete the consumer health data from its records, including from all parts of the regulated entity's or the small business's network, including archived or backup systems" "within 45 days of receipt of the request" with one 45-day extension; "Notify all affiliates, processors, contractors, and other third parties with whom the regulated entity or the small business has shared consumer health data of the deletion request"; for archived or backup systems the "delay may not exceed six months from authenticating the deletion request". 19.373.050: processors act "pursuant to a binding contract between the processor and the regulated entity or the small business that sets forth the processing instructions". 19.373.060: unlawful "to sell or offer to sell consumer health data ... without first obtaining valid authorization". 19.373.080: "unlawful for any person to implement a geofence around an entity that provides in-person health care services". 19.373.090: a violation "is an unfair or deceptive act in trade or commerce" under RCW 19.86. AG page (https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy): effective "March 31, 2024" for regulated entities, "June 30, 2024" for small businesses, geofencing "July 23, 2023"; the policy link must be "separate and distinct"; "Any violation of the Act is a per se violation of the Washington Consumer Protection Act (CPA)" enforced "by the Attorney General as well as through private action".
  Implication: Confirms the memos. Day-one build items: a dedicated /consumer-health-data-privacy page linked from the marketing homepage footer, a consent record table with separate collection and sharing consents (sharing consent off by default and unused in v1), a deletion job that purges primary data within 45 days and tracks backup expiry at or before six months (Neon PITR retention must be set accordingly), a processor register, and no location features near clinics.

- No US law requires a cookie consent banner for strictly functional storage (CCPA's homepage link duty is conditioned on selling or sharing personal information), and in the EU Article 5(3) ePrivacy requires consent for storing or accessing information on a user's device except where strictly necessary for a service the user explicitly requested; WP29 Opinion 04/2012 lists authentication, user-input, security and load-balancing session cookies as exempt, and EDPB Guidelines 2/2023 (v2.0, adopted 7 October 2024) confirm Article 5(3) applies to any storage or access regardless of whether personal data is involved.
  Source: https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf (checked 2026-10-04, confidence high)
  Evidence: EDPB Guidelines 2/2023 v2.0 "Adopted on 7 October 2024" quote Article 5(3): consent is not required for "technical storage or access for the sole purpose of carrying out the transmission of a communication over an electronic communications network, or as strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service"; "scenarios that do intrude into this private sphere even without involving any personal data are explicitly covered by the wording of Article 5(3)". WP29 Opinion 04/2012 (https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf, adopted 7 June 2012): "CRITERION B: the cookie is 'strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service'"; "The exemption that applies to authentication cookies under CRITERION B ... can be extended to other cookies set for the specific task of increasing the security of the service", for example "cookies used to detect repeated failed login attempts"; load-balancer session cookies are exempt because "The information in the cookie has the sole purpose" of routing. Cal. Civ. Code 1798.135(a)(1) (https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.135): a business "that sells or shares consumers' personal information" must "Provide a clear and conspicuous link on the business' internet homepages, titled 'Do Not Sell or Share My Personal Information'"; the duty is triggered only by selling or sharing.
  Implication: Tidefern's session cookie, CSRF token, theme preference and offline cache (localStorage/IndexedDB) need no banner in the US or EU so long as they are strictly necessary for the requested service and no third-party analytics or marketing storage is set; document each stored item and its exemption basis in the privacy policy. Any future analytics on public pages would change this analysis.

- WCAG 2.2 (W3C Recommendation 5 October 2023, updated 12 December 2024) adds nine criteria; the Level AA ones relevant to Tidefern are 2.4.11 Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum, 24 by 24 CSS pixels with spacing, equivalent, inline, user-agent and essential exceptions) and 3.3.8 Accessible Authentication (Minimum); 4.1.1 Parsing is removed.
  Source: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ (checked 2026-10-04, confidence high)
  Evidence: "WCAG 2.2 was published as a 'W3C Recommendation' web standard on 5 October 2023."; spec status line "W3C Recommendation 12 December 2024" (https://www.w3.org/TR/WCAG22/); "4.1.1 Parsing is obsolete and removed from WCAG 2.2." New AA criteria: "2.4.11 Focus Not Obscured (Minimum) (AA): Ensure when an item gets keyboard focus, it is at least partially visible"; "2.5.7 Dragging Movements (AA): For any action that involves dragging, provide a simple pointer alternative"; "2.5.8 Target Size (Minimum) (AA): Ensure targets meet a minimum size or have sufficient spacing around them"; "3.3.8 Accessible Authentication (Minimum) (AA): Don't make people solve, recall, or transcribe something to log in". Normative texts: 2.5.8 "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when: Spacing ... a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not intersect another target ...; Equivalent ...; Inline: The target is in a sentence or its size is otherwise constrained by the line-height of non-target text; User agent control ...; Essential" (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); 2.4.11 "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." (https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html); 2.5.7 "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging, unless dragging is essential or the functionality is determined by the user agent and not modified by the author." (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
  Implication: Design tokens should enforce a 24px minimum hit area (44px preferred) on calendar day cells and symptom chips, sticky headers and toasts must not fully cover focused elements, any drag-to-reorder or slider needs a click or button alternative, and login should use passkeys or magic links with password-manager-friendly fields rather than CAPTCHAs or memorized puzzles. Run @axe-core/playwright with the wcag22aa tag set.

- Vercel's Data Processing Addendum (Last Updated March 17, 2026; Effective March 31, 2026) binds automatically on entering the Agreement and deems the SCCs signed, but it applies only to Pro and Enterprise plans, and the Hobby plan is restricted to non-commercial personal use.
  Source: https://vercel.com/legal/dpa (checked 2026-10-04, confidence high)
  Evidence: "This Addendum applies to Vercel's Processing of Personal Data as a Processor under the Agreement for Customers who are on Enterprise and Pro plans."; "This Addendum shall become legally binding upon Customer entering into the Agreement or upon execution of this Addendum."; "By entering into the Agreement, Data Exporter is deemed to have signed these Standard Contractual Clauses"; UK: "the UK IDTA will be deemed entered into"; "A list of Vercel's Subprocessors, including their functions and locations, is available at https://security.vercel.com"; "Last Updated March 17, 2026 Effective Date March 31, 2026". Hobby docs (https://vercel.com/docs/plans/hobby, last_updated 2026-09-14): "As stated in the fair use guidelines, the Hobby plan restricts users to non-commercial, personal use only."; Runtime Logs retention "1 hour of logs" on Hobby and "1 day of logs" on Pro.
  Implication: Run the production Tidefern project on Vercel Pro from the first external user so the DPA (and therefore the MHMDA processor contract) actually covers it; Hobby is fine only for throwaway previews. Vercel sees request paths, headers, IPs and function logs, so keep identifiers and health data out of URLs and log lines, and set Log Drains only to a vendor with its own DPA.

- Neon is now a Databricks product: the Neon Product Specific Schedule (Last Updated August 5, 2026) is accepted by accessing the service and sits under the Databricks Master Cloud Services Agreement (Last Updated February 20, 2026), which incorporates the Databricks Data Processing Addendum by reference with SCCs and the UK Addendum; a HIPAA BAA is self-serve on the Scale plan.
  Source: https://neon.com/platform-terms (checked 2026-10-04, confidence high)
  Evidence: neon.com/dpa redirects to the Product Specific Schedule: "This Product Specific Schedule (Neon) ... is entered into as of the Effective Date between Databricks, Inc., the parent company of Neon, LLC ('Databricks'), and Customer"; "By accessing the Platform Services, Customer agrees to the terms of this Schedule"; "This Schedule is subject to the terms of the then-current Databricks Master Cloud Services Agreement located at https://www.databricks.com/legal/mcsa"; "Subprocessor List. The Platform Services use Grafana Labs located in the United States for infrastructure services in addition to all other listed subprocessors located at https://www.databricks.com/legal/databricks-subprocessors". MCSA (https://www.databricks.com/legal/mcsa): "The terms of the DPA are incorporated by reference and shall apply to the processing of Personal Data as described in the DPA."; "Last Updated February 20, 2026". Databricks DPA PDF (https://www.databricks.com/legal/dpa): "This Data Processing Addendum, including its Annexes and the Standard Contractual Clauses ('DPA'), forms an integral part of the Databricks Master Cloud Services Agreement"; restricted transfers "shall be governed by the Standard Contractual Clauses"; defines "UK Addendum" as the ICO International Data Transfer Addendum. HIPAA (https://neon.com/docs/security/hipaa): "HIPAA compliance is available as a self-serve feature available to customers on the Scale plan."; "Once HIPAA compliance is enabled on a project, it cannot be disabled."
  Implication: The memo's Neon decision stands, but the processor contract is now the Databricks MCSA plus DPA rather than a Neon-branded DPA; record that in the processor register and watch databricks.com/legal/databricks-subprocessors for changes. Tidefern is not a HIPAA covered entity, so the Scale-plan BAA is optional; the Launch or Scale plan choice should be driven by PITR retention needed for the six-month backup deletion window.

- Cloudflare's self-serve agreement incorporates its Customer DPA (v6.4, effective April 3, 2026) by reference; Resend's DPA binds on entering the agreement and its subprocessor list (updated 2026-08-27) includes AWS for hosting and sending plus Anthropic and RunPod for AI; GitHub's DPA (Version October 2025) forms part of the GitHub Customer Agreement with GitHub as processor, SCCs and UK Addendum, while individual accounts are governed by the Privacy Statement (effective April 27, 2026).
  Source: https://www.cloudflare.com/terms/ (checked 2026-10-04, confidence high)
  Evidence: Cloudflare Self-Serve Subscription Agreement (Last Updated September 12, 2025): "Cloudflare is a data processor or sub-processor, as applicable, and Cloudflare will handle such Personal Data in compliance with Cloudflare's Data Processing Addendum ('Data Processing Addendum'), which is hereby incorporated by reference into this Agreement."; DPA (https://www.cloudflare.com/cloudflare-customer-dpa/): "Version 6.4, effective April 3, 2026", sub-processors at "https://www.cloudflare.com/gdpr/subprocessors/" with 30 days' notice, EU SCCs plus UK Addendum. Resend DPA (https://resend.com/legal/dpa): "This Addendum shall become legally binding upon Customer entering into the Agreement or upon execution of this Addendum."; "Module Two (Controller to Processor) of the EU SCCs applies when Customer is a controller"; deletion "within 90 days of the account termination"; subprocessors (https://resend.com/legal/subprocessors, "2026-08-27"): "Amazon Web Services, Inc. (USA): Third party hosting and sending provider", "Anthropic, PBC (USA): Artificial Intelligence", "RunPod, Inc. (USA): Self-hosted LLMs", "Google, Inc. (USA): Email communications and analytics", "Vercel Inc. (USA): Server hosting" among 22 entries. GitHub DPA (https://github.com/customer-terms/github-data-protection-agreement): "This GitHub Data Protection Agreement forms part of the GitHub Customer Agreement"; "You are the Controller of Customer Personal Data, and we are the Processor of that data"; "The SCCs shall apply to Personal Data that is protected by the GDPR"; "The UK Addendum will apply"; subprocessors at "https://github.com/subprocessors"; "Version: October 2025". GitHub Terms of Service (effective April 27, 2026) reference only the Privacy Statement; the Privacy Statement says a DPA "governs the relationship between GitHub and the Data Controller" when an organization provides the account.
  Implication: All four are acceptable self-serve processors. Resend receives recipient addresses, subjects and bodies, and lists AI subprocessors, so keep transactional emails generic (no health terms in subjects or bodies) and check Resend account settings for any AI features that touch content. Cloudflare DNS sees only query metadata today; R2 later will hold encrypted objects under the same DPA. GitHub must never receive user data: enforce no fixtures with real data and scrub CI logs.

### Recommendations

- (consequential) Make AGENTS.md the canonical instruction file at the repo root (under 150 lines, under 32 KiB), and add a three-line CLAUDE.md whose first line is @AGENTS.md followed by Claude-only notes (compaction preservation instruction, pointer to .claude/rules). Do not create nested AGENTS.md files yet; do not symlink CLAUDE.md to AGENTS.md.
  Why: Codex, Cursor and Copilot read AGENTS.md natively. Claude Code reads it directly only when no CLAUDE.md exists on the path, and the docs recommend the @AGENTS.md import as the pattern that works on every version, every setting, with CLAUDE.local.md present, and with InstructionsLoaded hooks. Imports load at launch, so length discipline still applies. Nested AGENTS.md would be skipped by Claude Code once a root CLAUDE.md exists, unless the project-instructions setting is changed.
  Rejected: AGENTS.md only with no CLAUDE.md (breaks the moment a CLAUDE.local.md is added and loses Claude-specific notes); a CLAUDE.md symlinked to AGENTS.md (Edit tool refuses to write through symlinks and Windows clones get a one-line file); duplicating content in both files (drift).

- (consequential) Store skills canonically in .agents/skills/<name>/SKILL.md (spec frontmatter only: name, description, optional license, compatibility, metadata, allowed-tools; references/ for detail; relative paths; under 500 lines) and commit relative symlinks .claude/skills/<name> -> ../../.agents/skills/<name>. Add a CI step that runs skills-ref validate on each skill and checks every symlink resolves.
  Why: Codex scans .agents/skills from cwd to repo root and follows symlinks; Cursor reads .agents/skills natively (and .claude/skills for compatibility); Claude Code reads only .claude/skills but documents per-skill symlinked folders and dedupes them. Git stores symlinks as link blobs with core.symlinks defaulting to true on macOS and Linux. Spec-only frontmatter avoids unexpected-key errors outside Claude Code.
  Rejected: Canonical .claude/skills with .agents/skills symlinks (works too, but puts the Claude-specific directory first and .agents is the vendor-neutral location two tools read natively); plain copies in three directories (drift, and Codex would list same-named duplicates); a whole-directory symlink .claude/skills -> .agents/skills (not the documented per-skill form).

- (consequential) Structure the build prompt as two prompts (kickoff and resume) with these rules: XML or H2 sections (context, decisions, constraints, tasks, verification, output) with long reference material first; the Fable 5.1 autonomy block verbatim at the top plus a short list of actions that still need a human (production migrations, data deletion, force pushes, spending); the scope block; a tracked task list with stable IDs and passes true/false in tasks.json that is append-only for tests; a free-text PROGRESS.md log; an init script; a resume protocol of read PROGRESS.md, tasks.json and git log then run the smoke test before new work; evidence (command and output) required before marking a task passing; commit after each task; batch independent tool calls; subagent briefs with objective, output format, allowed files and done criteria; a fresh-context review subagent before closing a task; a compaction-preservation instruction.
  Why: Each rule traces to Anthropic's current prompting reference, the Claude Code best-practices page, the long-running harness article, the multi-agent article, and the Fable 5.1 page, which together target the two observed failure modes: trying to one-shot the app and declaring the job done prematurely.
  Rejected: A single monolithic prompt without state files (loses progress across context windows); relying on compaction alone (docs recommend fresh context plus filesystem state); unbounded subagent use (docs warn of overuse and duplicated work).

- (consequential) Compliance deltas to apply to the memos: (1) New York: nothing applies today; add a monitoring item for S9269 delivery and signature. (2) FTC HBNR: write a breach runbook with a 60-day clock and treat any unauthorized disclosure (including vendor misconfiguration) as a breach; note the $53,088 per-violation exposure. (3) WA MHMDA: confirm the day-one list already in the memos and add the six-month backup purge ceiling, processor notification on deletion, and a processor register. (4) No cookie banner for functional storage in the US or EU; document each stored item and its strictly-necessary basis. (5) Target WCAG 2.2 AA and add 3.3.8 Accessible Authentication to the three criteria already named; run axe with wcag22aa tags.
  Why: Primary sources checked today confirm the memos and sharpen them; the only material corrections are the NY status (passed but not signed), the explicit 2026 penalty figure, the backup deletion ceiling, and the login accessibility criterion.
  Rejected: Treating NY HIPA as imminent law and building its 'necessary purpose' model now (premature; the bill may be vetoed again or amended); adding a cookie banner defensively (adds friction with no legal basis for functional-only storage and no third-party analytics).

- (consequential) Vendor and processor decisions: run production on Vercel Pro from the first external user (Hobby is non-commercial and outside the DPA); accept Neon under the Databricks MCSA plus DPA and record Databricks as the contracting party; rely on Cloudflare's self-serve agreement incorporating DPA v6.4; keep Resend emails free of health terms and review Resend's AI-related settings given Anthropic and RunPod appear on its subprocessor list; use GitHub for code only with a no-real-data rule for fixtures and CI logs.
  Why: MHMDA 19.373.050 requires a binding processor contract for each processor; every vendor's self-serve DPA satisfies this except Vercel Hobby, which excludes itself. Data exposure per vendor: Vercel sees request paths, headers, IPs and function logs; Neon stores the database (ciphertext for free text under envelope encryption); Resend sees addresses, subjects and bodies; Cloudflare sees DNS metadata now and encrypted R2 objects later; GitHub sees source and CI output.
  Rejected: Starting on Vercel Hobby to save cost (violates fair use once the product is commercial and leaves no processor contract); switching email vendors over the AI subprocessor listing (unnecessary if content stays generic; revisit if Resend processes bodies with AI by default).

### Verified snippets

#### Recommended Tidefern AGENTS.md skeleton, composed from the sections agents.md recommends (project overview, build and test commands, code style, testing, security, PR guidelines) and kept short because Codex caps combined instruction files at 32 KiB and Claude Code recommends under 200 lines

Source: https://agents.md/

```
# Tidefern: agent guide

## What this is
Privacy-sensitive web app (cycle tracking, pregnancy, early childhood). Two first users, then a consumer product. Washington MHMDA and the FTC Health Breach Notification Rule apply; treat all user content as consumer health data.

## Repo layout
- apps/web: Next.js on Vercel
- packages/api: Hono REST API, Zod schemas -> OpenAPI 3.1, mounted under /v1
- packages/db: Drizzle schema and migrations (Neon Postgres)
- packages/tokens: design tokens
- .agents/skills: canonical skills (symlinked into .claude/skills)

## Commands (pnpm + Turborepo)
- Install: pnpm install
- Dev: pnpm dev
- Typecheck, lint, test: pnpm turbo typecheck lint test
- E2E: pnpm --filter web test:e2e (Playwright; axe wcag22aa tags)
- DB: pnpm --filter db migrate (never run against production without a human)

## Non-negotiables
- No third-party analytics, fonts, or scripts on authenticated screens.
- No health terms in URLs, logs, email subjects, or email bodies.
- Free-text fields are envelope-encrypted before they reach Postgres.
- Separate consent records for collection and for sharing; sharing is off in v1.
- Deletion requests purge primary data within 45 days and backups within 6 months.
- WCAG 2.2 AA: 24x24 CSS px targets, focus never fully obscured, no drag-only controls, no cognitive-test login.

## Working rules
- Read PROGRESS.md, tasks.json, and git log before starting. Run the smoke test first.
- One task at a time; mark passes:true only with evidence (command and output) in PROGRESS.md.
- Never remove or edit existing tests to make a task pass.
- Commit after each task with a descriptive message. Ask before: production migrations, deleting data, force pushes, anything that spends money.
- Report pre-existing bugs as follow-ups; do not fix them in the current task.

## Conventions
- TypeScript strict; ES modules; Zod schemas are the source of truth for request and response types.
- Branch names: feat/<task-id>-<slug>; PR description lists task IDs and verification evidence.
```

#### Thin CLAUDE.md that imports AGENTS.md so Claude Code reads the shared file on every version and setting, with Claude-only notes below (import syntax and placement per Claude Code memory docs)

Source: https://code.claude.com/docs/en/memory

```
@AGENTS.md

# Claude-only notes
- When compacting, always preserve the full list of modified files, the current task ID, open follow-ups, and the exact test commands.
- Path-scoped rules live in .claude/rules/.
```

#### Skills directory layout and the symlink commands; Claude Code documents per-skill symlinked folders, Codex follows symlinks under .agents/skills, Cursor reads both locations

Source: https://code.claude.com/docs/en/skills

```
.agents/
  skills/
    api-conventions/
      SKILL.md
      references/REFERENCE.md
    privacy-review/
      SKILL.md
.claude/
  skills/
    api-conventions -> ../../.agents/skills/api-conventions
    privacy-review -> ../../.agents/skills/privacy-review

# create the links from the repo root
mkdir -p .claude/skills
for d in .agents/skills/*/; do n=$(basename "$d"); ln -sfn "../../.agents/skills/$n" ".claude/skills/$n"; done

# CI check: every canonical skill is linked and every link resolves
for d in .agents/skills/*/; do n=$(basename "$d"); test -f ".claude/skills/$n/SKILL.md" || { echo "missing link: $n"; exit 1; }; done
skills-ref validate .agents/skills/*
```

#### Portable SKILL.md frontmatter using only the six Agent Skills spec fields (name must match the directory name)

Source: https://agentskills.io/specification

```
---
name: privacy-review
description: Checks a diff for consumer health data leaks: URLs, logs, email content, third-party scripts, and unencrypted free text. Use before opening a PR that touches apps/web, packages/api, or email templates.
license: Proprietary. See LICENSE.
metadata:
  tidefern-version: "1"
---
# Privacy review

1. List changed files and classify each as UI, API, DB, email, or infra.
2. For API and UI changes, grep for identifiers or health terms in paths, query strings, and log lines.
3. For DB changes, confirm free-text columns are written through the envelope encryption helper.
4. For email changes, confirm subject and body contain no health terms.
5. Report findings as a checklist with file and line references. See references/REFERENCE.md for the term list.
```

#### Autonomy block for an unattended Claude Fable 5.1 build agent (copy verbatim at the top of the system prompt; the docs say the opening sentence carries much of the effect)

Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1

```
You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work. For reversible actions that follow from the original request, proceed without asking. Stop only for destructive actions or genuine scope changes the user must decide. Offering follow-ups after the task is done is fine; asking permission before doing the work is not.

Exception: when the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one.

Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ('I'll…', 'let me know when…'), do that work now with tool calls. That includes retrying after errors and gathering missing information yourself. Do not stop because the context or session is long. End your turn only when the task is complete or you are blocked on input only the user can provide.

Before running a command that changes system state (such as restarts, deletes, or config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause.
```

#### Scope block for the build agent (Fable 5.1 docs report unrequested additions and extra test files drop substantially with no change in task success); the original's single em dash has been replaced with a comma

Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1

```
If, while working or testing, you find a pre-existing bug, a performance concern, or behavior the task doesn't mention, don't fix, optimize or extend it in this change unless the requested behavior cannot work without it; report it as a follow-up in your summary. Where the task is ambiguous, implement the reading its wording and the surrounding code most directly support, state that assumption in your summary, and don't build for the other readings as well. Verify your work however you like; scratch scripts and quick checks need not be kept. Commit tests only where the task asks for them or this repository already keeps tests for this kind of change, sized like the neighboring test files, roughly one focused test per stated behavior, and don't turn scratch checks into additional permanent test files. This is about extras only: implement every behavior the task asks for, completely.
```

#### Resume-session instruction and state-file conventions from Anthropic's multi-window workflow guidance (structured JSON for task status, free text for progress notes, git for checkpoints)

Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

```
Start of every session:
- Review PROGRESS.md, tasks.json, and the git logs.
- Manually run through a fundamental integration test before moving on to implementing new features.
- Choose the highest-priority task whose passes field is false.

tasks.json (structured; tests are append-only):
{
  "tasks": [
    { "id": "T-012", "title": "Cycle log entry API", "passes": false, "verify": "pnpm --filter api test -- cycle" }
  ]
}

PROGRESS.md (free text, newest at the bottom):
Session 3 progress:
- T-011 passing: ran pnpm --filter api test -- consent, 14 tests green, committed 3f2a9c1
- Next: investigate user_management test failures (test #2)
- Note: Do not remove tests as this could lead to missing functionality

It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality.
```

#### Parallel tool-call instruction for agent loops (per-turn nudge recommended for Fable 5.1 in coding harnesses)

Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1

```
First privately list what you need next; then request every item that doesn't depend on another's result in this one response.
```

#### Compaction summarization instruction for client-side compaction (em dashes in the original replaced with commas)

Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1

```
Summarize the transcript inside <summary></summary> tags. Include relevant information in the summary such that this conversation will be continued by a new context window without needing to redo work or be reprovided with relevant constraints or context. Be sure to preserve: (1) any difficulties or problems that came up, and how they were handled or resolved; (2) any possibilities, options, or approaches that were raised, tried, or set aside, and why; (3) anything that was asked for, decided, agreed, ruled out, or established as a preference, constraint, or boundary, stated exactly; (4) exactly where things stand now, what has been covered, settled, or completed so far; (5) anything still open, unresolved, promised, or expected to happen next; (6) specific details that would be hard to reconstruct, names, numbers, dates, exact wording, links or references, kept exactly. Be complete on these even at the cost of length; keep everything else concise.
```

#### Optional Claude Code setting to load both CLAUDE.md and AGENTS.md (only needed if the repo ever drops the @AGENTS.md import; user or managed settings only, ignored in project settings)

Source: https://code.claude.com/docs/en/memory

```
{
  "pluginConfigs": {
    "agents-md@builtin": {
      "options": { "instructionFiles": "claude-md-and-agents-md" }
    }
  }
}
```

### Open questions

- Cursor loads both .agents/skills and .claude/skills; whether it deduplicates a skill reached through a symlink in both locations is undocumented. Open the repo in Cursor once and check the skill list; duplicates would be cosmetic.
- GitHub Copilot supports Agent Skills (listed on agentskills.io with docs at docs.github.com/en/copilot/concepts/agents/about-agent-skills) but its skill directory (.github/skills or .agents/skills) was not verified; irrelevant unless Copilot is added to the toolset.
- NY S9269/A10357 passed both houses on June 3 and 4, 2026 but has not been delivered to the governor; delivery typically happens in batches through December, so signature, veto, and any effective date remain unknown.
- Resend's subprocessor list names Anthropic and RunPod for AI features; whether any transactional email content is processed by those features by default, and whether it can be disabled per account, was not verified.
- Vercel's exact runtime log fields (whether query strings and request bodies are logged) were not verified from Vercel docs; the recommendation to keep identifiers and health terms out of URLs holds regardless.
- Whether MHMDA's consent requirement reaches device storage that is merely linkable to a health account (session cookies, offline cache) is a legal judgment not settled by the statute text; the current plan treats all such storage as strictly necessary and consented at account creation.
- The Databricks subprocessor list (databricks.com/legal/databricks-subprocessors) was not fetched; confirm the regions and entities that apply to Neon's Postgres hosting before onboarding users outside the US.
- Codex loads nested AGENTS.md files only on the path from the repo root to the cwd; behavior for sibling package directories when launched at the root is as documented (root file only), so package-level guidance should live in skills if Codex is used.

### Sources that could not be read

- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219 (HTML returned HTTP 202 with an empty body; the PDF export returned a zero-page file). Article 5(3) text was taken instead from EDPB Guidelines 2/2023 v2.0, which quotes it verbatim.
- https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule and https://www.federalregister.gov/documents/2026/09/15/2026-18853/civil-penalty-inflation-adjustments (redirected to unblock.federalregister.gov); the same documents were read from the official govinfo.gov mirror.
- https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-318 (web page redirected to a bot check); the eCFR versioner API (https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=318) was used instead.
- https://www.nysenate.gov/legislation/bills/2025/S9269 returned HTTP 403 to curl; it was readable through WebFetch, and the NY Assembly bill record corroborated the action list.
- https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement-non-enterprise and .../github-data-protection-agreement-for-customers returned 404; the DPA was read at https://github.com/customer-terms/github-data-protection-agreement.
- https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en.pdf (404); the correct file is .../2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf, which was read.
- GitHub GraphQL (gh issue view) is unavailable from this session, so the status of anthropics/claude-code issues #37590 and #25367 on symlinked skills was not checked; the current Claude Code skills documentation now states symlinked skill folders are supported, which supersedes those issues.
- Cursor documentation contains no statement on symlinked skill folders or duplicate-skill handling, so those points could not be confirmed from a primary source.

## Skeptic verdicts

<a id="skeptic-verdicts"></a>

### hosting-api

- partially_correct: `hono/vercel` is deprecated as of hono 4.13.9 (published 2026-09-24); the adapter now lives in `@hono/vercel` 1.0.0 (peer `hono >=4.13.9`) and is a one-line wrapper around `app.fetch(req)`.
  Evidence: https://www.npmjs.com/package/@hono/vercel
  Note: Checked 2026-10-04 by unpacking tarballs. `@hono/vercel@1.0.0` exists, published 2026-09-28T06:33Z, `peerDependencies: { hono: '>=4.13.9' }`, `engines.node >=16.9.0`, dist/handler.js is exactly `const handle = (app) => (req) => { return app.fetch(req); }` and dist/conninfo.js reads `c.req.header("x-real-ip")`. README: "The exports are the same. Change the import path ... `hono/vercel` is deprecated and will be removed in Hono v5." However the version attribution is wrong: hono@4.13.9 (2026-09-24) dist/adapter/vercel/handler.js and handler.d.ts contain NO deprecation comment; the `@deprecated` JSDoc first appears in hono@4.13.10 (2026-09-28, same day as @hono/vercel 1.0.0) and is present in 4.13.11, 4.13.12 and 4.13.13. The v4.13.10 release notes (PR #5463) say all runtime adapters (`@hono/bun`, `@hono/deno`, `@hono/cloudflare-workers`, `@hono/aws-lambda`, `@hono/lambda-edge`, `@hono/netlify`, `@hono/vercel`, `@hono/service-worker`) moved to their own packages and "hono/<adapter> still works in v4 but is deprecated and will be removed in v5".
- confirmed: Hono's official Next.js guide documents `app/api/[[...route]]/route.ts` with `new Hono().basePath('/api')`, `import { handle } from '@hono/vercel'`, per-method exports, and targets the Node.js runtime.
  Evidence: https://hono.dev/docs/getting-started/nextjs
  Note: Checked 2026-10-04. Page says "You can run Hono on Next.js when using the Node.js runtime. On Vercel, deploying Hono with Next.js is easy by using Vercel Functions." App Router file is `app/api/[[...route]]/route.ts`; code is `import { handle } from '@hono/vercel'`, `const app = new Hono().basePath('/api')`, `export const GET = handle(app)`, `export const POST = handle(app)`. Pages Router section uses `@hono/node-server` `getRequestListener`, `bodyParser: false` and `NODEJS_HELPERS=0`, which is irrelevant to the App Router plan.
- partially_correct: Next.js 16.3.8 route handlers support GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS; GET is dynamic by default since v15; `runtime` defaults to `'nodejs'` with `'edge'` deprecated; `maxDuration` is set by platform; `dynamic`, `revalidate`, `fetchCache` are removed when Cache Components is enabled (all cited to the route.js page).
  Evidence: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
  Note: Checked 2026-10-04. Content is accurate but half of it is on a different page than cited. The route.js page (version 16.3.8, lastUpdated 2026-04-30) confirms the seven methods, "If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS`", and version history "v15.0.0-RC: The default caching for `GET` handlers was changed from static to dynamic". The `runtime | 'nodejs' | 'edge' (deprecated) | 'nodejs'`, `maxDuration | number | Set by deployment platform`, `preferredRegion ... (deprecated)` table and the "v16.0.0: `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when Cache Components is enabled" entry live on the route-segment-config page. Note the route.js page still shows `export const dynamic = 'auto'`, `revalidate`, `fetchCache` as valid segment options when Cache Components is off, so these are not globally invalid, only under Cache Components.
- confirmed: Vercel cron jobs: 100 per project on all plans; Hobby minimum interval once per day with per-hour (±59 min) precision and deployment fails for more frequent expressions; Pro per-minute; `crons` in vercel.json applies to the production deployment only.
  Evidence: https://vercel.com/docs/cron-jobs/usage-and-pricing
  Note: Checked 2026-10-04 (page last_updated 2026-07-15). Table: "Hobby | 100 cron jobs | Once per day | Per-hour (±59 min)", "Pro | 100 cron jobs | Once per minute | Per-minute". "Expressions like `0 * * * *` (per-hour) or `*/30 * * * *` (every 30 minutes) will fail deployment with the error: Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day." Also: "a cron job configured as `0 1 * * *` ... will trigger anywhere between 1:00 am and 1:59 am" and "Cron jobs are included in all plans" but invocations bill as function usage. vercel.json page: "crons: Used to configure cron jobs for the production deployment of a project", path max 512 chars, schedule max 256 chars.
- confirmed: Fluid compute default since 2025-04-23; duration default 300 s, Hobby max 300 s, Pro max 800 s (1800 s beta); precedence function code > vercel.json > dashboard > defaults; memory cannot be set in vercel.json under Fluid; Next.js `src/` projects need `src/` prefix in vercel.json function globs.
  Evidence: https://vercel.com/docs/fluid-compute
  Note: Checked 2026-10-04 (last_updated 2026-08-24). "As of April 23, 2025, fluid compute is enabled by default for new projects." Table: "Default / Max duration | 300s (5 minutes) / 300s (5 minutes) [Hobby] | 300s (5 minutes) / 800s [Pro]", "Extended max duration | - | 1800s (30 minutes) Beta". Precedence: 1 Function code (maxDuration), 2 vercel.json (maxDuration, region), 3 Dashboard (maxDuration, region, memory), 4 Fluid defaults. vercel.json page: "`memory`: Memory cannot be set in `vercel.json` with Fluid compute enabled." Duration page shows `export const maxDuration = 5` in `app/api/my-function/route.ts` and "If your Next.js project is configured to use src directory, you will need to prefix your function routes with `/src/` for them to be detected." Duration page also notes HTTP/1.1 idle connections may be closed on long requests and points to Vercel Workflows for unlimited execution time.
- confirmed: A Hobby team cannot connect a project to a GitHub-organization-owned repo, cannot deploy commits from anyone but the team owner, and is restricted to non-commercial use; Pro adds team collaboration, password protection, >300 s functions, 6,000 deployments/day.
  Evidence: https://vercel.com/docs/git
  Note: Checked 2026-10-04. docs/git (last_updated 2026-09-18): "You cannot deploy to a Hobby team from a private repository in a GitHub organization, GitLab group, or Bitbucket workspace. Consider making the repository public or upgrading to Pro." and "To deploy commits under a Hobby team, the commit author must be the owner of the Hobby team". docs/limits: "Vercel does not support connecting a project on your Hobby team to Git repositories owned by Git organizations." and "Vercel Projects Connected per Git Repository | 25 [Hobby] | 150 [Pro]". Fair use (last_updated 2026-09-14): "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan", with examples "Any method of requesting or processing payment", advertising, "Receiving payment to create, update, or host the site"; "Asking for Donations does not fall under commercial usage." Hobby plan page: "Team collaboration features | - | Yes", "Deployments per day | 100 | 6,000", "Vercel Function maximum duration | 300s (5 minutes) | 300s (default) - configurable up to 800s", Password Protection on Pro is "$20 per month per protected project", Developer seats "$20 per user / month". The researcher's "Hobby plans are limited to 1 Concurrent Build" FAQ quote was not found on the Hobby or Limits pages fetched; treat as unverified.
- partially_correct: Vercel Node.js runtimes are 24.x (default), 22.x and 20.x, overridable via `engines.node`; Node 24 became default on 2025-11-25.
  Evidence: https://vercel.com/changelog/node-js-20-is-being-deprecated
  Note: Checked 2026-10-04. The node-js-versions docs page (last_updated 2026-02-27) still lists "24.x (default), 22.x, 20.x" and the `"engines": { "node": "24.x" }` override, but it is stale: the changelog (published 2026-07-14) says "On October 1, 2026, Node.js 20 will be disabled in Project Settings", new builds on Node 20 error after that date, existing deployments keep running, and the upgrade target is Node 24. `@vercel/build-utils@14.17.0` (published 2026-10-02) encodes `major: 20 ... discontinueDate: new Date("2026-10-01")` with an escape hatch `VERCEL_ALLOW_DISCONTINUED_NODEJS20=1` that only extends the date to 2026-11-01. So as of today only 24.x and 22.x are usable. The 2025-11-25 default-change date was not verified.
- confirmed: TypeScript 7.0.2 (2026-07-08) ships no JavaScript API (expected in 7.1); `@typescript/typescript6` exists for side-by-side use; typescript-eslint 8.71.0 and typescript-estree pin `typescript >=4.8.4 <6.1.0`; issue #12518 closed as not planned; eslint-config-next 16.3.8 peers `eslint >=9.0.0`, `typescript >=3.3.1`; drizzle-kit has no TypeScript dependency.
  Evidence: https://typescript-eslint.io/users/dependency-versions/
  Note: Checked 2026-10-04. npm: typescript dist-tags latest 7.0.2 (published 2026-07-08T15:55Z), 6.0.3 published 2026-04-16, next 7.1.0-dev.20261004.1; `@typescript/typescript6` latest is 6.0.2 (note: lower than typescript 6.0.3). TS 7.0 blog (July 8th, 2026): "TypeScript 7.0 is made to ship without an API. We expect TypeScript 7.1 to ship with a new (and different) API", `tsc6` executable, alias example `"@typescript/native": "npm:typescript@^7.0.2", "typescript": "npm:@typescript/typescript6@^6.0.2"`, and 7.0 rejects `baseUrl`, `moduleResolution node/node10`, `target es5`, `esModuleInterop`/`allowSyntheticDefaultImports: false`. typescript-eslint docs: "The version range of TypeScript currently supported is `>=4.8.4 <6.1.0`", ESLint `^8.57.0 || ^9.0.0 || ^10.0.0`; npm peers for typescript-eslint@8.71.0 and @typescript-eslint/typescript-estree@8.71.0 match. GitHub issue #12518 "TypeScript 7.0.2 Support": "Closed as not planned", error "TypeError: Cannot read properties of undefined (reading 'Cjs')". eslint-config-next@16.3.8 peers `{ eslint: '>=9.0.0', typescript: '>=3.3.1' }`; drizzle-kit@0.31.11 deps are tsx, esbuild, @drizzle-team/brocli, @esbuild-kit/esm-loader; drizzle-orm@0.45.3 has no typescript peer.
- confirmed: Next.js 16.3.8 defaults `experimental.useTypeScriptCli` to true so `next build` runs project-local `tsc` and works with TypeScript 7; docs still label it experimental; 16.3.0 published 2026-08-03.
  Evidence: https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli
  Note: Checked 2026-10-04. next@16.3.8 dist/server/config-shared.js line 257: `useTypeScriptCli: true`. Docs (version 16.3.8, lastUpdated 2026-08-03): "By default, `next build` runs the project-local `tsc` command instead of loading the TypeScript JavaScript compiler API. This supports TypeScript 6 and enables TypeScript 7 while its JavaScript API is unavailable." and "If you opt out while using TypeScript 7, `next build` exits because the TypeScript JavaScript compiler API is unavailable." Experimental banner present. npm: next 16.3.0 published 2026-08-03T20:34Z, 16.3.8 2026-09-30. One caveat on the researcher's implication: neither the TypeScript page nor the useTypeScriptCli page states that the `next.config.ts` loader requires the TypeScript JS API; the TypeScript page only says the IDE plugin is "a custom TypeScript plugin and type checker". Keep TS 6.0.3 for typescript-eslint, not for next.config.ts.
- confirmed: `@vercel/build-utils` 14.17.0 (2026-10-02) installs pnpm majors 12 through 6, auto-selects pnpm 10 for lockfile 9.0 (pnpm 11 gated to projects created on/after 2027-03-01), honors `packageManager` / `devEngines.packageManager` pins without corepack; Vercel docs still list pnpm 6 to 10; corepack is opt-in via `ENABLE_EXPERIMENTAL_COREPACK=1`; pnpm 12 still writes lockfileVersion 9.0; pnpm `pmOnFail` defaults to `download`.
  Evidence: https://www.npmjs.com/package/@vercel/build-utils/v/14.17.0
  Note: Checked 2026-10-04 by unpacking the tarball (published 2026-10-02T19:31Z). run-user-scripts.js: `PNPM_10_PREFERRED_AT = new Date("2025-02-27T20:00:00Z")`, `PNPM_11_PREFERRED_AT = new Date("2027-03-01T20:00:00Z")`, `INSTALLED_PNPM_MAJORS = [12, 11, 10, 9, 8, 7, 6]`; lockfile 9 case returns pnpm 11 only if created after 2027-03-01 and Node supports it, else pnpm 10 (projects after 2025-02-27), else pnpm 9; `validLockfileForPackageManager` `case 12: case 11: case 10: return lockfileVersion === 9`; devEngines and packageManager pins resolve via `pnpmPathOverride(major)`; comment "Do not pass `--unsafe-perm`: pnpm 11 treated it as a no-op, but pnpm 12's Rust CLI rejects unknown flags"; warning text about `engines.pnpm` and ERR_PNPM_UNSUPPORTED_ENGINE present; corepack only when `env.ENABLE_EXPERIMENTAL_COREPACK === "1"`. Docs package-managers page (last_updated 2026-08-11) still says pnpm "6, 7, 8, 9, 10" and "lockfileVersion: 9.0 ... pnpm 9 or 10"; configure-a-build confirms `ENABLE_EXPERIMENTAL_COREPACK` = `1`. pnpm.io/settings/cli: pmOnFail "Default: download", types download/error/warn/ignore, download "download and run the declared pnpm version (this is the default and matches the previous `managePackageManagerVersions: true` behavior)". npm times: pnpm 12.0.0 2026-08-26, 12.9.1 2026-10-03, 11.0.0 2026-04-28, 10.34.6 2026-09-28, engines node >=18. I did not re-run the local lockfileVersion test; the build-utils compatibility table is consistent with the claim.
- confirmed: Vercel Services (Beta, all plans) lets one project deploy a frontend and a backend service with top-level rewrites; build keys move inside each service object.
  Evidence: https://vercel.com/docs/services
  Note: Checked 2026-10-04 (last_updated 2026-08-10). "Availability: Services (Beta) are available on all plans"; "Services let you deploy multiple backends and frontends within a single Vercel project ... replacing the need to split monorepos into separate Vercel projects." Example `services: { my_frontend: { root: 'frontend/' }, my_backend: { root: 'backend/', entrypoint: 'main:app' } }` with rewrites to `{ "service": "my_backend" }`. "`functions`, `installCommand`, `buildCommand`, `devCommand`, `ignoreCommand`, `outputDirectory` and `framework` keys should be moved into the relevant service." A service is internal unless exposed by a rewrite; services call each other via bindings; `vercel dev` and `vercel dev -L` run them locally. The earlier `experimentalServices` model is superseded.
- partially_correct: Vercel monorepo: per-project Root Directory; source files outside Root Directory included by default; automatic skipping of unaffected projects is default, GitHub-only, requires workspaces, unique names and explicit deps, and does not consume build slots; `ignoreCommand` exit 0 skips, exit 1 builds; 25/150 projects per repo.
  Evidence: https://vercel.com/docs/monorepos
  Note: Checked 2026-10-04 (last_updated 2026-08-11). Confirmed: "Vercel automatically skips builds for projects in a monorepo that are unchanged by the commit. This setting does not occupy concurrent build slots"; requirements "only available for projects connected to GitHub repositories", npm/yarn/pnpm/Bun workspaces, "All packages within the workspace must have a unique `name`", "Dependencies between packages in the monorepo must be explicitly stated"; disable via the Root Directory "Skip deployment" switch; filtered install example `"installCommand": "pnpm install --filter web..."` in apps/web/vercel.json; vercel.json: "When the command exits with code 1, the build will continue. When the command exits with 0, the build is ignored."; limits page: 25 (Hobby) / 150 (Pro) projects per repo. Not re-verified: the FAQ quote about "Include source files outside of the Root Directory" being enabled by default (monorepo FAQ page not fetched). Caution: configure-a-build's Root Directory section says "Your app will not be able to access files outside of that directory. You also cannot use `..` to move up a level", which applies to the deployed app, so workspace packages must be installed via pnpm workspace linking, not reached by relative path at runtime. The monorepos page also says "Changes that are not a part of the workspace definition will be considered global changes and deploy all applications" and that a lockfile change affecting the project counts as a change.
- confirmed: Turborepo marks `turbo-ignore` deprecated in favor of `turbo query affected`.
  Evidence: https://turborepo.dev/docs/reference/turbo-ignore
  Note: Checked 2026-10-04. Page states: "`turbo-ignore` is deprecated and will no longer receive updates. Use `turbo query affected` instead, which provides more precise task-level change detection." with a migration guide at /docs/reference/query#migrating-from-turbo-ignore. Vercel's monorepos page likewise says Turborepos "might use `turbo query` in the Ignored Build Step". The `--exit-code` semantics and Remote Cache quotas quoted by the researcher were not re-verified.
- confirmed: Hobby plan comparison: no team collaboration, 100 deployments/day vs 6,000, 300 s functions vs 800 s configurable on Pro, password protection on Pro.
  Evidence: https://vercel.com/docs/plans/hobby
  Note: Checked 2026-10-04 (last_updated 2026-09-14). Rows: "Team collaboration features | - | Yes", "Deployments per day | 100 | 6,000", "Vercel Function maximum duration | 300s (5 minutes) | 300s (default) - configurable up to 800s; extended max duration up to 1800s (30 minutes, beta)", "Runtime Logs | 1 hour of logs | 1 day of logs", "Drains | - | Configurable", Deployment Protection: Hobby has Vercel Authentication for preview and production plus Deployment Protection Exceptions and Shareable Links; Pro adds "Password Protection for $20 per month per protected project". Also "the Hobby plan restricts users to non-commercial, personal use only" and Pro trial availability. Build machine: Hobby 2 vCPU / 8 GB / 32 GB disk.

Corrected recommendations:

- Hono mount decision stands, but fix the version floor: pin `hono` to 4.13.13 (any >=4.13.10 is where `hono/vercel` is marked deprecated; 4.13.9 has no deprecation) and add `@hono/vercel@1.0.0` (peer `hono >=4.13.9`) to apps/web. Import `handle` from `@hono/vercel` only. Also avoid `hono/bun`, `hono/cloudflare-workers`, `hono/aws-lambda` etc. anywhere in the API package or tests; every runtime adapter moved to `@hono/*` in 4.13.10 and the `hono/<adapter>` paths are removed in v5.
- Route file: `apps/web/src/app/api/v1/[[...route]]/route.ts` exporting `GET/POST/PUT/PATCH/DELETE = handle(app)` with `export const maxDuration = 60` is correct (function-code setting has top precedence; Hobby ceiling is 300 s). Do not export `runtime`, `dynamic`, `revalidate` or `fetchCache`; `runtime` already defaults to `'nodejs'`, `'edge'` and `preferredRegion` are deprecated, and the caching exports are removed under Cache Components (route-segment-config page, v16.0.0 entry). If a vercel.json duration override is ever used, the glob must be `src/app/api/**/*`.
- Node: pin `"engines": { "node": "24.x" }` in the root package.json and select 24.x in Project Settings. Do not reference Node 20 anywhere (CI matrix, `.nvmrc`, docs): Vercel disabled Node 20 for new builds on 2026-10-01 (changelog 2026-07-14; build-utils 14.17.0 `discontinueDate 2026-10-01`). Node 22.x is the only fallback runtime on Vercel today.
- pnpm: `"packageManager": "pnpm@12.9.1"` in root package.json, no `engines.pnpm`, no `ENABLE_EXPERIMENTAL_COREPACK`, `pnpm install --frozen-lockfile` in CI. build-utils 14.17.0 resolves the pin to the image's pnpm 12 and treats pnpm 12 as lockfile-9 compatible, while the public docs table (pnpm 6 to 10) lags the shipped build image. On the first Vercel build, read the install log to confirm it reports pnpm 12.x; if not, fall back to `pnpm@10.34.6` (the version Vercel auto-selects for lockfile 9.0 on projects created after 2025-02-27). Also keep `packageManager` set because Vercel's unaffected-project skipping uses it to detect the package manager.
- TypeScript: pin `typescript@6.0.3` at the root; TS 7.0.2 has no JS API and typescript-eslint 8.71.0 (pulled in by `eslint-config-next/typescript`) refuses `>=6.1.0`. Do not use the `@typescript/typescript6` alias trick: its latest is 6.0.2, a downgrade from 6.0.3, and it adds two TypeScript installs for no gain. Write tsconfigs TS 7 clean (no `baseUrl`, `moduleResolution: bundler`, `esModuleInterop: true`, `target` es2022+, explicit `types`). The `next build` type check already runs via the `tsc` CLI by default in 16.3.8, so the later TS 7 bump is gated only on typescript-eslint.
- Plan decision stands with two additions: (a) Pro Password Protection is a $20 per month per protected project add-on, so preview protection on both plans should rely on Vercel Authentication (free on Hobby and Pro) plus Protection Bypass for Automation in the smoke-test workflow; (b) Hobby retains Runtime Logs for only 1 hour and has no Drains, so for a privacy-sensitive app plan structured logging into the app's own Postgres audit table or accept 1-hour log visibility until Pro. Move to Pro before any payment, advertising, org-owned repo, >300 s function, or sub-daily cron; a Pro trial exists for evaluation.
- Outbox/cron: keep the daily `crons` entry in `apps/web/vercel.json` (production deployment only, path under `/api/v1/...`, `CRON_SECRET` check) and drain inline or via `waitUntil` on enqueue. If any job ever needs more than 300 s on Hobby, Vercel Workflows (no duration limit) is the documented alternative to upgrading, and HTTP/1.1 clients may drop idle long-running connections, so stream heartbeats on any long request.

Missing from the research:

- Node 20 is already discontinued on Vercel (disabled 2026-10-01 per changelog published 2026-07-14; build-utils 14.17.0 encodes the date and a `VERCEL_ALLOW_DISCONTINUED_NODEJS20=1` escape hatch that only extends to 2026-11-01). The researcher listed 20.x as available.
- hono 4.13.10 deprecated every `hono/<runtime-adapter>` subpath (bun, deno, cloudflare-workers, aws-lambda, lambda-edge, netlify, vercel, service-worker), not only `hono/vercel`; any test harness or future Expo/Cloudflare experiment must use `@hono/*` packages.
- Vercel's unaffected-project skipping treats changes outside the workspace definition (root turbo.json, tsconfig.base.json, pnpm-workspace.yaml, root package.json) and relevant lockfile changes as global changes that deploy every connected project; with one project today this is harmless, but it matters the day apps/api becomes a second project.
- Hobby Runtime Logs are retained for 1 hour and Drains are Pro-only; the researcher did not flag log retention for a privacy-sensitive product, which also bears on what must never be logged (free text, health data) since Pro drains would later export logs to third parties.
- Pro Password Protection costs $20 per month per protected project; Vercel Authentication is the free preview-protection method on both plans and is what the smoke-test bypass secret works with.
- Vercel Workflows are documented as the escape for jobs that exceed function duration limits (relevant to the outbox design on Hobby's 300 s cap), and the duration page warns that HTTP/1.1 intermediaries may close idle long-running connections.
- Related Projects (`relatedProjects` in vercel.json, max 3 projects, same repo, exposes `VERCEL_RELATED_PROJECTS`) is the documented way to wire a frontend preview to the matching backend preview if the API is ever split into a second Vercel project.
- The researcher's `Hobby plans are limited to 1 Concurrent Build` quote could not be located on the Hobby or Limits pages; the Hobby page does list build machine size (2 vCPU, 8 GB, 32 GB disk) but not a concurrency figure, so the one-build-slot rationale for colocating the API should be re-verified before it is used as an argument.
- `@typescript/typescript6` is at 6.0.2 while `typescript` 6.0.3 exists, so the Microsoft side-by-side alias would silently downgrade the type checker; the memo should say so explicitly if it keeps the alias as an alternative.
- The Next.js TypeScript docs do not state that the `next.config.ts` loader needs the TypeScript JavaScript API; the researcher's rationale for TS 6 should rest on typescript-eslint alone.

### data-auth

- confirmed: Drizzle 0.45.3 and drizzle-kit 0.31.11 are the stable line; the public docs describe the v1 RC (withRLS, @rc installs, folder-per-migration), and the 0.45.3 types expose enableRLS() and migrate(db, { migrationsFolder }).
  Evidence: https://orm.drizzle.team/docs/upgrade-v1
  Note: Checked 2026-10-04. npm view: drizzle-orm dist-tags latest 0.45.3, rc 1.0.0-rc.4, beta 1.0.0-beta.22 (modified 2026-09-21); drizzle-kit latest 0.31.11, rc 1.0.0-rc.4. Unpacked drizzle-orm@0.45.3: pg-core/table.d.ts line 22 reads enableRLS: () => Omit<PgTableWithColumns<T>, 'enableRLS'> and no withRLS exists; node-postgres/migrator.d.ts and pglite/migrator.d.ts both declare migrate(db, config: MigrationConfig) with migrationsFolder: string, migrationsTable?, migrationsSchema?. pg-core exports pgPolicy(name, config) and pgRole(name, config). Docs: upgrade-v1 says npm i drizzle-orm@rc, removing journal.json, grouping SQL files and snapshots into separate migration folders, removing the drizzle-kit drop command, step 1 npx drizzle-kit up; the RLS page shows pgTable.withRLS('users', ...); connect-neon shows npm i drizzle-orm@rc pg. drizzle-kit 0.31.11 migrate --help lists only --config; generate --help includes --custom; index.d.mts line 132 has roles?: boolean | { provider ... }. better-auth 1.7.7 peers: drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0, drizzle-kit >=0.31.4 || >=1.0.0-beta.1. drizzle-orm pg-core has no GRANT API.
- confirmed: Better Auth 1.7.7's CLI is the npm package auth (npx auth@latest generate), @better-auth/cli is deprecated, and passkeys ship as @better-auth/passkey.
  Evidence: https://www.better-auth.com/docs/concepts/cli
  Note: Checked 2026-10-04. npm view auth@1.7.7: description 'The CLI for Better Auth', repository better-auth/better-auth, bin { auth, better-auth }. @better-auth/cli latest 1.4.21 with deprecated = 'Package no longer supported'. Docs: npx auth@latest generate (--config, --output, --adapter, --dialect, -y); migrate is 'available exclusively for the Kysely adapter', other adapters use their ORM's migration tool; also secret, info, check schema, init. @better-auth/passkey 1.7.7 peers better-auth ^1.7.7, depends on @simplewebauthn/server ^13.3.1; passkey docs: import { passkey } from '@better-auth/passkey', client import from '@better-auth/passkey/client', options rpID, rpName, origin, authenticatorSelection, requires a passkey table. Sharpening: the Drizzle adapter docs page now shows import { drizzleAdapter } from '@better-auth/drizzle-adapter' (better-auth 1.7.7 depends on @better-auth/drizzle-adapter 1.7.7); the legacy better-auth/adapters/drizzle export still exists in package.json exports. I did not re-run the generate command, so the exact generated table list rests on the researcher's run.
- confirmed: Neon's pooled connection string runs PgBouncer in transaction mode and forbids session-level features; migrations must use the direct string; transaction-scoped set_config / SET LOCAL is safe through the pooler.
  Evidence: https://neon.com/docs/connect/connection-pooling
  Note: Checked 2026-10-04. Page: 'Neon uses PgBouncer in transaction mode (pool_mode=transaction), which means connections are returned to the pool after each transaction completes'; not supported: SET / RESET (session variables), LISTEN / NOTIFY, WITH HOLD CURSOR, PREPARE / DEALLOCATE, PRESERVE / DELETE ROWS temp tables, LOAD, session-level advisory locks; config block pool_mode=transaction, max_client_conn=10000, default_pool_size=0.9 * max_connections, max_prepared_statements=1000; direct connections for schema migrations, pg_dump/pg_restore, logical replication, admin tasks; protocol-level prepared statements supported (PgBouncer 1.22.0). PgBouncer features table (pgbouncer.org/features.html) lists SET/RESET as Never in transaction pooling and has no separate SET LOCAL row. Postgres 18 docs (sql-set.html): 'The effects of SET LOCAL last only till the end of the current transaction'; functions-admin: set_config(..., is_local true) 'will only apply during the current transaction'. Neon's own guide (https://neon.com/guides/test-rls-on-neon-branches): 'set_config(..., true) is just the function form of SET LOCAL. Both reset when the transaction ends, so a reused connection never carries one tenant's context into another request', and 'owners and superusers skip it by default ... Create a role app_user ... app_user has no BYPASSRLS, so policies always apply'. It also recommends testing two tenants concurrently through the pooled host.
- confirmed: Launch vs Scale differ mainly in branch count and maximum restore window; Launch $0.106/CU-hour and $0.35/GB-month, 10 branches/project ($1.50 extra), history Free 6h, Launch max 7 days, Scale max 30 days at $0.20/GB-month via history_retention_seconds.
  Evidence: https://neon.com/docs/introduction/plans
  Note: Checked 2026-10-04. Plans page: Free $0/month, 100 CU-hours/project, 1 GB/project storage, 10 branches/project, 100 projects, restore window '6 hours, up to 1 GB-month'; Launch 'Pay for what you use', $0.106/CU-hour, $0.35/GB-month, 10 branches/project, $1.50/branch-month extra, 100 projects, 'Up to 7 days'; Scale $0.222/CU-hour, $0.35/GB-month, 25 branches/project, $1.50/branch-month, '1,000 (can be increased on request)' projects, 'Up to 30 days'. History window page: Free default 6 hours max 6 hours (capped at 1 GB), Launch default 1 day max 7 days, Scale default 1 day max 30 days; $0.20/GB-month; property history_retention_seconds (604800 = 7 days). Manage branches page: root branch allowance Free 3, Launch 5, Scale 25; Console expiration options 1 hour, 1 day, 7 days; 'API and CLI branches have no expiration by default'; neon branches set-expiration br-... --expires-at 2025-08-15T18:00:00Z. Reset-from-parent page confirms 'neon branches reset development --parent --project-id noisy-pond-12345678', root branches cannot be reset, children must be deleted first, no backup preserved.
- confirmed: Neon's GitHub integration sample pins create-branch-action@v5 while v6 (6.3.1) is current with renamed inputs/outputs and expires_at.
  Evidence: https://github.com/neondatabase/create-branch-action/releases
  Note: Checked 2026-10-04. Releases page: latest 6.3.1; v6.0.0 breaking changes 'The field username now becomes role', 'The field parent now becomes parent_branch', 'Outputs suffixed with with_pooler become pooled'; expires_at added in v6.1.0. Raw action.yml on main: inputs api_key, api_host, branch_name, project_id, parent_branch, prisma, database, role, branch_type, ssl, suspend_timeout, expires_at, masking_rules, get_auth_url, get_data_api_url; outputs db_url, db_url_pooled, db_host, db_host_pooled, password, branch_id, created, auth_url, data_api_url; runs on node24. README: uses: neondatabase/create-branch-action@v6 and an IMPORTANT note 'Ensure the database role specified in the input is already created in your Neon project. This action will fail if the specified role does not exist'. Neon integration guide sample still uses create-branch-action@v5, delete-branch-action@v3, reset-branch-action@v1, schema-diff-action@v1, and installs NEON_API_KEY (secret) and NEON_PROJECT_ID (variable).
- partially_correct: On Vercel Fluid compute, Neon, Vercel and Drizzle all point to a module-scope pg Pool with attachDatabasePool rather than the Neon serverless driver; pool max 2 to 5 with idleTimeoutMillis 5000.
  Evidence: https://neon.com/docs/guides/serverless-connection-pooling
  Note: Checked 2026-10-04. Driver guidance confirmed: Neon vercel-connection-methods recommends 'a standard Postgres TCP driver (like node-postgres) and implementing a connection pool' for Fluid and keeps @neondatabase/serverless for classic serverless; Vercel KB (last updated July 23, 2026): 'Create your pool in a global scope', 'Avoid max pool size of 1 ... Instead, keep the minimum pool size to 1', 'Use a relatively short idle timeout (e.g., 5 seconds)'; @vercel/functions reference (last_updated 2026-09-03): attachDatabasePool 'ensures that idle pool clients are properly released before functions suspend', supports PostgreSQL (pg), MySQL2, MariaDB, MongoDB, ioredis, cassandra-driver; Fluid docs (last_updated 2026-08-24): enabled by default since April 23, 2025, multiple invocations share one instance, 300s default / 800s max on Pro, after() from next/server recommended for Next.js 15.1+. npm: pg 8.23.1, @vercel/functions 3.9.11, @neondatabase/serverless 1.2.0 (engines node >=19). Correction on size: Neon's serverless pooling guide says 'Set your local pool's maximum to 1 or 2 per container' with the example max: 2, idleTimeoutMillis: 5000; nothing in the sources supports max 5. Also, the 3.9.11 type definition still marks attachDatabasePool with a JSDoc @experimental tag and declares experimental_attachDatabasePool as deprecated, even though the Vercel docs present it as the supported helper.
- confirmed: Better Auth's Hono mount is app.all on /api/auth/* with c.req.raw (or /auth/* under basePath('/api')), CORS registered before it, and hono/vercel handle is deprecated in 4.13.13 in favour of @hono/vercel with identical exports.
  Evidence: https://www.better-auth.com/docs/integrations/hono
  Note: Checked 2026-10-04. Hono docs: app.all('/api/auth/*', (c) => auth.handler(c.req.raw)); with new Hono().basePath('/api') mount at '/auth/*'; CORS: app.use('/api/auth/*', cors({ origin: 'http://localhost:3001', credentials: true })) registered before the auth route and the same origin added to trustedOrigins; session middleware uses auth.api.getSession({ headers: c.req.raw.headers }). hono@4.13.13 dist/adapter/vercel/handler.js: '@deprecated hono/vercel will be removed in v5. Install @hono/vercel and import from there instead.' with const handle = (app) => (req) => app.fetch(req). @hono/vercel 1.0.0 (peer hono >=4.13.9) exports handle and getConnInfo. better-auth 1.7.7 dist/integrations/next-js.mjs: toNextJsHandler returns GET, POST, PATCH, PUT, DELETE each calling auth.handler; nextCookies hooks '/get-session' and calls warnIfCookiePluginNotLast. Next docs: route at app/api/auth/[...all]/route.ts exporting { GET, POST }, nextCookies 'must be the last plugin in the array', Next.js 16 renames middleware.ts to proxy.ts, getSessionCookie for optimistic checks. Cookie source: __Secure- prefix when advanced.useSecureCookies is set, else https baseURL, else isProduction.
- partially_correct: Rate limiting defaults to 100 requests per 10 seconds in memory; sessions default to 7 days with 1-day updateAge; cookieCache delays revocation; generateId accepts a function, false, serial or uuid; trustedOrigins accepts wildcards.
  Evidence: https://www.better-auth.com/docs/concepts/rate-limit
  Note: Checked 2026-10-04. Docs confirm window 10 seconds, max 100 in production, 'Rate limiting is disabled in development mode by default', memory storage default with database or secondary storage recommended for serverless, modelName rateLimit. Session docs: expiresIn 60*60*24*7, updateAge 60*60*24, freshAge 1 day, cookieCache maxAge 5*60 with compact/jwt/jwe strategies and the warning that revoked sessions may remain active until maxAge. Options reference: generateId 'Accepts a custom function, false, serial, or uuid'; trustedOrigins static array, function, or patterns like https://*.example.com; baseURL falls back to BETTER_AUTH_URL then the incoming request; basePath default /api/auth; telemetry.enabled default false. Missing from the claim: built-in stricter rules found in dist/api/rate-limiter/index.mjs getDefaultSpecialRules: paths starting with /sign-in, /sign-up, /change-password, /change-email are limited to 3 requests per 10 seconds, and /request-password-reset, /send-verification-email, /forget-password, email-otp send paths to 3 per 60 seconds; the twoFactor plugin adds /two-factor/* at 3 per 10 seconds. These apply to any production build, including the Playwright run against the production build.
- partially_correct: All Better Auth advisories from April through July 2026 are fixed at or before 1.7.7; the April cookieCache 2FA bypass is the most relevant.
  Evidence: https://api.osv.dev/v1/query
  Note: Checked 2026-10-04 via OSV POST {package: better-auth, ecosystem: npm}. Confirmed: GHSA-xg6x-h9c9-2m83 (2026-04-03, cookieCache 2FA bypass) fixed 1.4.9; GHSA-p6v2-xcpg-h6xw (2026-05-15, IPv6 rate-limit keying) fixed 1.4.17; GHSA-wxw3-q3m9-c3jr (2026-05-15) fixed 1.6.2; GHSA-cq3f-vc6p-68fh (2026-06-04, device authorization) fixed 1.6.11; 2026-07-07 batch GHSA-2vg6-77g8-24mp, GHSA-7w99-5wm4-3g79, GHSA-9h47-pqcx-hjr4, GHSA-fmh4-wcc4-5jm3, GHSA-g38m-r43w-p2q7, GHSA-pw9m-5jxm-xr6h fixed 1.6.11; GHSA-86j7-9j95-vpqj fixed 1.6.13; GHSA-qq9h-g4jm-xgf3 (2026-07-24) fixed 1.6.22. Correction: OSV lists GHSA-392p-2q2v-4372 (refresh-token rotation) as fixed in 1.6.0, not 1.6.11. Every listed fix version is below 1.7.7, so the conclusion stands. @better-auth/passkey GHSA-4vcf-q4xf-f48m fixed 1.4.0.
- confirmed: PGlite 0.5.8 runs the Postgres 18 engine with working RLS, roles, set_config and SET LOCAL ROLE, so unit tests get policy-semantics parity.
  Evidence: https://www.npmjs.com/package/@electric-sql/pglite
  Note: Checked 2026-10-04 by installing @electric-sql/pglite@0.5.8 (npm latest, modified 2026-08-26) under Node v22.22.0 and running it: select version() returned 'PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten'. CREATE ROLE app_user NOLOGIN, ENABLE/FORCE ROW LEVEL SECURITY, CREATE POLICY ... TO app_user USING (owner_id = current_setting('app.user_id', true)) WITH CHECK (...), GRANT app_user TO postgres all succeeded; inside db.transaction with set_config('app.user_id', 'u1', true) and set local role app_user, select returned only id 1 and an insert for u2 failed with 'new row violates row-level security policy for table notes'; after the transaction current_user was postgres and the setting was empty; pg_roles shows rolsuper true and rolbypassrls true for the default role, so RLS only bites after SET LOCAL ROLE. Postgres 18 ddl-rowsecurity docs: 'Superusers and roles with the BYPASSRLS attribute always bypass the row security system ... Table owners normally bypass row security as well'; role-attributes: 'A role must be explicitly given permission to bypass every row-level security (RLS) policy', so BYPASSRLS on neon_superuser is not inherited by SQL-created roles. drizzle-orm 0.45.3 peer @electric-sql/pglite >=0.2.0.
- confirmed: Neon's RLS-with-Drizzle guide targets the Data API (auth.user_id(), authenticatedRole) and does not apply to a self-hosted Better Auth backend; no deprecation notice exists.
  Evidence: https://neon.com/docs/guides/neon-rls-drizzle
  Note: Checked 2026-10-04. Guide: import { crudPolicy, authenticatedRole, authUid } from 'drizzle-orm/neon'; 'The authUid(column) helper generates the SQL condition (select auth.user_id() = column)' and 'this function automatically extracts the user identifier from the active JWT claims' when using the Data API. RLS overview: 'The Data API handles JWT validation and provides the auth.user_id() function'; RLS policies are required for Data API tables. No deprecation notice on either page. drizzle-orm@0.45.3 neon/rls.d.ts exports crudPolicy, authenticatedRole, anonymousRole, authUid. Neon roles page: neon_superuser carries CREATEDB, CREATEROLE, BYPASSRLS, NOLOGIN, REPLICATION plus pg_read_all_data and pg_write_all_data, and 'Your Postgres role and roles created in the Neon Console, API, and CLI are granted membership in the neon_superuser role', while SQL-created roles get only basic public schema privileges. Combined with the Postgres rule that BYPASSRLS is not inherited, the SET LOCAL ROLE app_user design is sound, but queries run as the console role without SET ROLE bypass RLS because that role owns the tables.
- confirmed: AES-256-GCM via node:crypto with a 12-byte IV and 16-byte default tag plus AAD is the documented primitive, and the KMS upgrade path is GenerateDataKey plus Decrypt with EncryptionContext.
  Evidence: https://nodejs.org/docs/latest-v24.x/api/crypto.html
  Note: Checked 2026-10-04. Node.js v24.21.0 crypto docs: 'In GCM mode, the authTagLength option is not required but can be used to set the length of the authentication tag that will be returned by getAuthTag() and defaults to 16 bytes'; cipher.setAAD 'sets the value used for the additional authenticated data (AAD) input parameter. The plaintextLength option is optional for GCM and OCB'; getAuthTag 'should only be called after encryption has been completed using the cipher.final() method'; decipher.setAuthTag: 'If no tag is provided, or if the cipher text has been tampered with, decipher.final() will throw'. AWS KMS GenerateDataKey API page: returns 'a plaintext copy of the data key and a copy that is encrypted under a symmetric encryption KMS key', KeySpec AES_256 | AES_128, 'If you specify an EncryptionContext, you must specify the same encryption context (a case-sensitive exact match) when decrypting', recommended flow encrypt outside KMS, erase plaintext key, store CiphertextBlob, Decrypt to recover. Caveat the researcher omitted: the same page says of EncryptionContext 'Do not include confidential or sensitive information in this field. This field may be displayed in plaintext in CloudTrail logs and other output.' NIST SP 800-38D was not re-opened in this pass.
- confirmed: Postgres 18 is the default major for new Neon projects and Neon has run 18.6 since 2026-08-18.
  Evidence: https://neon.com/docs/cli/projects
  Note: Checked 2026-10-04. CLI projects page: 'Neon projects created using the CLI use the default Postgres version, which is Postgres 18' and --pg-version accepts 'Major PostgreSQL version (14-19). Version 19 is available only in regions where it has been enabled.' Version policy page table: 2026-08-13 release of 18.6 and 17.11 available on Neon 2026-08-18 (5 days); 'Neon only supports the latest minor release for each major Postgres version' and it 'does not support skipping minor releases or downgrading'. The Docker Hub postgres:18.6 tag and the 2026-06-05 changelog entry were not independently re-checked here.

Corrected recommendations:

- Driver pool: set pg Pool max to 2 (not 2 to 5) with idleTimeoutMillis 5000 and attachDatabasePool from @vercel/functions 3.9.11; Neon's serverless pooling guide says 1 or 2 per container and Vercel's KB says avoid exactly 1. Note in the ADR that attachDatabasePool is still tagged @experimental in the 3.9.11 type definitions even though Vercel's reference documents it as the supported helper.
- Better Auth adapter import: use import { drizzleAdapter } from '@better-auth/drizzle-adapter' (the path the 1.7.7 docs show; better-auth depends on it) rather than better-auth/adapters/drizzle, which remains only as a compatibility export.
- Preview deployments: do not hard-code baseURL to the production URL and do not trust https://*.vercel.app. Use Better Auth 1.7.7's dynamic baseURL { allowedHosts: ['<prod host>', 'tidefern-*-<team>.vercel.app'], fallback: 'https://<prod host>', protocol: 'https' } or compute baseURL from VERCEL_ENV and VERCEL_BRANCH_URL / VERCEL_URL (both lack the protocol) at startup, and give trustedOrigins the same narrow pattern. A blanket *.vercel.app pattern makes every other Vercel customer's deployment a trusted origin. Set passkey rpID and origin from the same host logic and accept that passkeys registered on a preview host do not work on production.
- RLS wiring: drizzle-kit emits CREATE ROLE, ENABLE ROW LEVEL SECURITY and CREATE POLICY but has no API for GRANT. Add a custom migration (drizzle-kit generate --custom) that runs GRANT USAGE ON SCHEMA, GRANT SELECT/INSERT/UPDATE/DELETE on user-data tables TO app_user, ALTER DEFAULT PRIVILEGES for future tables, and GRANT app_user TO <neon login role> so SET LOCAL ROLE app_user succeeds. Configure entities.roles as { provider: 'neon' } so drizzle-kit manages app_user while ignoring Neon-managed roles. Add an integration test that runs two actors concurrently through the pooled host, as Neon's RLS guide recommends; PGlite cannot reproduce pooler reuse.
- Rate limiting versus tests: Better Auth's built-in rules limit /sign-in*, /sign-up*, /change-password* and /change-email* to 3 requests per 10 seconds and password-reset and verification-email sends to 3 per 60 seconds in any production build (and /two-factor/* to 3 per 10 seconds with the plugin). Because pnpm test:e2e runs Playwright against the production build, either reuse one authenticated storageState across tests, space sign-ins, or pass rateLimit.customRules overrides when a test flag is set. Keep storage: 'database' in production.
- KMS upgrade path: keep EncryptionContext to opaque identifiers only (userId, dekId, kekVersion). AWS states EncryptionContext may appear in plaintext in CloudTrail logs, so table and column names such as those that reveal pregnancy or cycle data belong only in the local AES-GCM AAD layer, never in the KMS context. This keeps the repository rule that health data never travels in logs.
- Advisory bookkeeping: record GHSA-392p-2q2v-4372 as fixed in 1.6.0 (OSV), not 1.6.11; all other fix versions stand and 1.7.7 carries every fix.
- Telemetry: Better Auth 1.7.7 telemetry is opt-in (default false per docs and source), but set telemetry: { enabled: false } in the config and BETTER_AUTH_TELEMETRY=0 in CI and Vercel env so the no-third-party-analytics rule is explicit; the CLI generate command also emits telemetry when enabled.
- Neon branch workflow: when using create-branch-action@v6, the role input must already exist on the parent branch (the action fails otherwise); pass role as the migration owner role and use db_url for drizzle-kit migrate and db_url_pooled for the preview app, with expires_at set on PR branches.

Missing from the research:

- The e2e suite will collide with Better Auth's built-in 3-per-10-second sign-in rate limit on production builds unless tests share an authenticated storageState or override customRules under a test flag.
- Preview deployments need a multi-host auth configuration: Better Auth 1.7.7 ships baseURL { allowedHosts, fallback, protocol } for exactly this, and VERCEL_URL / VERCEL_BRANCH_URL / VERCEL_PROJECT_PRODUCTION_URL (no protocol) are the inputs; the researcher's static BETTER_AUTH_URL plus *.vercel.app wildcard is both too broad and breaks preview sign-in.
- GRANT statements for the app role are outside drizzle-kit's model; without a custom migration granting table privileges and GRANT app_user TO the login role, SET LOCAL ROLE app_user fails or every query is denied.
- The Neon console role is a member of neon_superuser (which carries BYPASSRLS) and owns the tables, so any query path that forgets withActor runs with full visibility; add a lint or wrapper that forbids using db directly outside withActor for user-data tables, and a pooled-endpoint concurrency test.
- AWS KMS EncryptionContext is written to CloudTrail in plaintext, so the proposed AAD convention (table.column names) must not be mirrored into the KMS context verbatim.
- Better Auth's twoFactor trustDevice option remembers a device for 30 days and backup codes are single-use; decide whether trusted devices are allowed for a privacy-sensitive app before shipping the 2FA UI.
- Rate limiting is disabled in development, so local testing never exercises the database rate_limit table; the integration job against postgres:18.6 should run with NODE_ENV=production or an explicit rateLimit.enabled: true.

### contract-ci

- confirmed: @hono/zod-openapi 1.6.3 requires Zod 4 and Hono 4.10+, and its 1.0.0 release was the Zod v4 migration.
  Evidence: https://registry.npmjs.org/@hono/zod-openapi/1.6.3
  Note: Checked 2026-10-04. `npm view @hono/zod-openapi` prints version 1.6.3 and peerDependencies { zod: '^4.0.0', hono: '>=4.10.0' }; hono is 4.13.13, zod 4.6.5, @asteasolutions/zod-to-openapi 9.1.0 (peer zod ^4.0.0). CHANGELOG.md `## 1.0.0` Major Changes: "Zod OpenAPI has been migrated the Zod version from v3 to v4. As a result, the `zod` in `peerDependencies` has been updated to 4.0.0 or higher." @hono/node-server is 2.1.3 (peer hono ^4).
- confirmed: OpenAPI 3.1 is produced by app.doc31(path, config) and app.getOpenAPI31Document(config, generatorOptions); basePath is folded into the document; z is re-exported from @hono/zod-openapi after extendZodWithOpenApi.
  Evidence: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-openapi/src/index.ts
  Note: Checked 2026-10-04. README line 312: `app.doc31('/docs', { openapi: '3.1.0', info: { title: 'foo', version: '1' } }) // new endpoint`; lines 313 to 319 show getOpenAPI31Document with `unionPreferredType: 'oneOf'`. index.ts line 693 `getOpenAPI31Document = (`, line 697 `new OpenApiGeneratorV31(this.openAPIRegistry.definitions, generatorConfig)`, line 700 `return this._basePath ? addBasePathToDocument(document, this._basePath) : document`, line 722 `doc31 = <P extends string>(`, lines 861 to 862 `extendZodWithOpenApi(z)` / `export { extendZodWithOpenApi, z }`. README line 23: "The `z` object should be imported from `@hono/zod-openapi`". Sharpening: zod-to-openapi README says `.meta({ id: 'Schema2', ... })` produces the same registered component as `.openapi('Schema', ...)` and that you "could even generate a schema without using `extendZodWithOpenApi`", which lets packages/schemas import z from plain zod and stay free of a hono dependency.
- confirmed: The spec can be emitted at build time with plain Node (type stripping on by default, stable), no tsx required, provided the API package uses erasable syntax and explicit .ts import extensions.
  Evidence: https://nodejs.org/api/typescript.html
  Note: Checked 2026-10-04 against doc/api/typescript.md on nodejs/node main and v24.x. Changelog: "v23.6.0, v22.18.0: Type stripping is enabled by default"; "v24.3.0, v22.18.0: Type stripping no longer emits an experimental warning"; "v25.2.0, v24.12.0: Type stripping is now stable"; page header "Stability: 2 - Stable"; v26.0.0 "Removed `--experimental-transform-types` flag". Node 24.21.0 LTS therefore has stable default type stripping. Unsupported without transform: "`Enum` declarations", "`namespace` with runtime code", "parameter properties", "import aliases" (the researcher omitted import aliases). Recommended tsconfig: target esnext, module nodenext, rewriteRelativeImportExtensions, erasableSyntaxOnly, verbatimModuleSyntax, "we recommend version 5.8 or newer" of TypeScript.
- partially_correct: openapi-typescript 7.13.0 generates types from a local 3.1 JSON file, --check fails CI when committed types are stale, and it declares peer typescript ^5.x; a TypeScript 6 or 7 workspace will only get a pnpm peer warning.
  Evidence: https://github.com/openapi-ts/openapi-typescript/issues/2841
  Note: Checked 2026-10-04. Registry: openapi-typescript 7.13.0 (latest, last modified 2026-06-15), peerDependencies { typescript: '^5.x' }; cli.md table row "`--check` | false | Check that the generated types are up-to-date." Sandbox with typescript@6.0.3 and typescript@5.9.3 (--legacy-peer-deps): generation and `--check` exit 0. Sandbox with typescript@7.0.2 resolved: the CLI crashes at import, `dist/lib/ts.mjs:11 const BOOLEAN = ts.factory.createKeywordTypeNode(...)` TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode'), exit 1. Root cause: the typescript@7.0.2 npm package (2.5 MB unpacked vs 24.3 MB for 6.0.3) ships only bin/tsc, lib/tsc.js (an execve shim to a native binary), dist/api and dist/ast under `./unstable/*` exports, and its `"."` export is `./lib/version.cjs`, which exports only version and versionMajorMinor. Upstream issue #2841 ("7.13.0 fails with TypeScript 7.0.2") is open with no fix; PR #2774 "feat: add TypeScript 6 support" (peer `^5.x || ^6.x`) has been open since 2026-04-15; PR #2877 is a draft design doc that "makes no runtime changes and does not fix #2841". The implication is wrong: this is a hard crash, not a warning.
- confirmed: openapi-fetch 0.17.0 forwards any native fetch option (including credentials) from createClient and per request, and supports middleware with onRequest/onResponse/onError.
  Evidence: https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/docs/openapi-fetch/api.md
  Note: Checked 2026-10-04. Registry: openapi-fetch 0.17.0 (latest), dependencies { 'openapi-typescript-helpers': '^0.1.0' }, no typescript peer, so it is unaffected by the TypeScript 7 problem. api.md line 23 and 44: "(Fetch options) | Any valid fetch option (`headers`, `mode`, `cache`, `signal` ...)" for both createClient and per-request; line 254: "Middleware is an object with `onRequest()`, `onResponse()` and `onError()` callbacks"; lines 313 to 315 list the allowed return values; `client.use(...)` at lines 74, 280, 327.
- partially_correct: oasdiff-action v0.1.18 (2026-10-01) provides a breaking sub-action that fails at a severity threshold, works with a one-commit fetch of the base branch, and oasdiff understands OpenAPI 3.1.
  Evidence: https://raw.githubusercontent.com/oasdiff/oasdiff-action/main/breaking/action.yml
  Note: Checked 2026-10-04. `git ls-remote --tags`: v0 and v0.1.18 both resolve to b9325c9e0a27ab65b0da3b766522cedec6be81dc. README workflow confirmed verbatim: `git fetch --depth=1 origin ${{ github.base_ref }}`, `oasdiff/oasdiff-action/breaking@v0`, `base: 'origin/${{ github.base_ref }}:openapi.yaml'`, `revision: 'HEAD:openapi.yaml'`, `fail-on: WARN`. action.yml `fail-on` default '' ("such as ERR or WARN"); `include-checks` is "Deprecated and ignored". Behavior verified locally with oasdiff v1.33.0 on an openapi 3.1.0 spec: removed required property plus new required query parameter gave "2 changes: 2 error" ([new-required-request-parameter], [response-required-property-removed]) exit 1; an additive property gave "No breaking changes to report, but the specs are different." exit 0. The action's Dockerfile is `FROM tufin/oasdiff:v1.33.0`, so CI runs that same engine. Not found: the quoted phrase "OpenAPI 3.1 and 3.2 support" is absent from README.md, docs/BREAKING-CHANGES.md and docs/DIFF.md (3.1 handling is verified empirically, not by that quote). Missed: input `review` defaults to 'true' and "Upload[s] the comparison to oasdiff.com" (encrypted client side); `github-token` defaults to `${{ github.token }}`, so the PR comment is posted automatically whenever the job grants pull-requests: write.
- confirmed: Current releases are actions/checkout v7.0.1, actions/setup-node v7.0.0, actions/upload-artifact v7.0.1 and pnpm/action-setup v6.1.0; the pnpm/action-setup v6 moving tag still points at v6.0.10, which predates pnpm 12 support.
  Evidence: https://github.com/pnpm/action-setup/releases/tag/v6.1.0
  Note: Checked 2026-10-04 with `git ls-remote --tags` (gh api was blocked for these repos). actions/checkout: v7 and v7.0.1 = 3d3c42e5aac5ba805825da76410c181273ba90b1. actions/setup-node: v7 and v7.0.0 = 820762786026740c76f36085b0efc47a31fe5020. actions/upload-artifact: v7 and v7.0.1 = 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a. pnpm/action-setup tags are annotated: v6 peels to 0977fd99725f1db4007ccb2928dbb4e90d06cc86 (same commit as v6.0.10), v6.1.0 peels to ea17c68df8912ef543352723c149a84f56e3d413. pnpm/setup v3 and v3.0.0 peel to fbda4c85fc2e1e08721cd8763afea8f48d60f024. v6.1.0 release notes: "feat: support pnpm v12" by zkochan in #288, September 5. README banner: "This action supports pnpm v12 and earlier."; `version` is "Optional when there is a `packageManager` or `devEngines.packageManager` field in the `package.json`"; `cache` (boolean, default false) caches the pnpm store; `cache_dependency_path` default pnpm-lock.yaml; `standalone` applies "For pnpm v11 and earlier".
- confirmed: Playwright CI guidance: `npx playwright install --with-deps`, upload playwright-report, optional container mcr.microsoft.com/playwright:v1.63.0-noble with --user 1001, and do not cache browser binaries.
  Evidence: https://playwright.dev/docs/ci
  Note: Checked 2026-10-04. Page uses `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: lts/*`, `actions/upload-artifact@v5`, `npx playwright install --with-deps`, `npx playwright test`, artifact `name: playwright-report`, `path: playwright-report/`, `retention-days: 30`, `if: ${{ !cancelled() }}`; container `image: mcr.microsoft.com/playwright:v1.63.0-noble`, `options: --user 1001`; "Caching browser binaries is not recommended, since the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries." MCR tags list (https://mcr.microsoft.com/v2/playwright/tags/list) contains v1.63.0, v1.63.0-jammy and v1.63.0-noble; @playwright/test latest is 1.63.0. Docker Hub library/postgres has tags 18, 18.6, 18.6-alpine, 18.6-bookworm, 18.6-trixie.
- confirmed: iurman/tidefern is public, which makes rulesets, CodeQL default setup and push protection free; a private personal repo would lose most of them (rulesets and protected branches need GitHub Pro).
  Evidence: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
  Note: Checked 2026-10-04. Unauthenticated https://api.github.com/repos/iurman/tidefern returns 200 with "private": false, "visibility": "public", "default_branch": "main", "created_at": "2026-10-04T18:05:50Z". About rulesets: "Rulesets are available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, and GitHub Enterprise Cloud." About protected branches has the matching sentence. GitHub's plans page lists under Pro "3,000 GitHub Actions minutes per month" and, for private repositories, "Required pull request reviewers", "Protected branches", "Code owners"; Free lists "2,000 minutes per month". CodeQL default setup prerequisites: "It is publicly visible, or GitHub Code Security is enabled." About push protection: push protection for users "stops you from pushing secrets to public repositories"; for repositories it "Requires GitHub Secret Protection to be enabled". Hardening guide (now at /en/actions/reference/security/secure-use, the researcher's URL 301s there): "Pinning an action to a full-length commit SHA is currently the only way to use an action as an immutable release." Workflow syntax: "If you specify the access for any of these permissions, all of those that are not specified are set to `none`."
- confirmed: Vercel skips unaffected monorepo projects by default for GitHub-connected pnpm workspaces, so turbo-ignore is only a fallback; the Ignored Build Step value is `npx turbo-ignore --fallback=HEAD^1`.
  Evidence: https://vercel.com/docs/monorepos
  Note: Checked 2026-10-04 (page last_updated 2026-08-11). "Vercel automatically skips builds for projects in a monorepo that are unchanged by the commit. This setting does not occupy concurrent build slots, unlike the Ignored Build Step feature". Requirements: "only available for projects connected to GitHub repositories"; npm, yarn, pnpm or Bun workspaces; "All packages within the workspace must have a unique `name` field"; "Dependencies between packages in the monorepo must be explicitly stated in each package's `package.json` file"; also "Changes that are not a part of the workspace definition will be considered global changes and deploy all applications in the repository." Toggle: Settings, Build and Deployment, Root Directory, "Skip deployment". Changelog dated February 24, 2025: skipping is now "the default for new projects"; existing projects must enable it in Build and Deployment settings. Turborepo page shows `npx turbo-ignore --fallback=HEAD^1` and `turbo query affected --base=$VERCEL_GIT_PREVIOUS_SHA --packages <your-project-name> --exit-code`.
- confirmed: turbo run --affected equals --filter=...[main...HEAD], is overridable with TURBO_SCM_BASE/TURBO_SCM_HEAD, treats every package as changed on a shallow checkout; the Turborepo GitHub Actions guide YAML is stale.
  Evidence: https://turborepo.dev/docs/reference/run
  Note: Checked 2026-10-04. Run reference: the flag is by default "--filter=...[main...HEAD]"; `TURBO_SCM_BASE=development turbo run build --affected` and `TURBO_SCM_HEAD=your-branch turbo run build --affected`; "The comparison requires everything between base and head to exist in the checkout. If the checkout is too shallow, then all packages will be considered changed." The GitHub Actions guide (turborepo.dev/docs/guides/ci-vendors/github-actions) still shows `actions/checkout@v4` with `fetch-depth: 2`, `pnpm/action-setup@v3` with `version: 8`, `actions/setup-node@v4` with `node-version: 20` and `cache: 'pnpm'`. turbo and turbo-ignore are both 2.11.7 on npm.
- partially_correct: Renovate automerge needs passing required checks, the repository's Allow auto-merge setting, and a ruleset requiring at least one status check; config:recommended plus helpers:pinGitHubActionDigests, group:allNonMajor, :maintainLockFilesWeekly cover a pnpm monorepo.
  Evidence: https://docs.renovatebot.com/key-concepts/automerge/
  Note: Checked 2026-10-04. Confirmed: "By default, Renovate will not automerge until it sees passing status checks / check runs for the branch."; "By default, Renovate uses platform-native automerge" which "requires the 'Allow auto-merge' checkbox in the repository settings to be enabled" (Settings, Pull Requests section). presets-config page lists config:recommended extending ":dependencyDashboard", ":semanticPrefixFixDepsChoreOthers", ":ignoreModulesAndTests", "group:monorepos", "group:recommended" and more, and shows `helpers:pinGitHubActionDigests` and `:maintainLockFilesWeekly` as presets. Missed and consequential: "If you have mandatory Pull Request reviews then it means Renovate can't automerge its own PR until such a review has happened." and "If you have configured your project to require Pull Requests before merging, it means that branch automerging is not possible" (PR automerge still works). The docs' automerge example also guards 0.x packages: `"matchUpdateTypes": ["minor", "patch"], "matchCurrentVersion": "!/^0/", "automerge": true`, relevant because openapi-fetch (0.17.0) and @scalar/hono-api-reference (0.12.9) are 0.x. The exact sentence about requiring "at least one status check" was not located on the page (unverified wording).
- confirmed: RFC 9457 defines application/problem+json (type defaults to about:blank, status must match, extensions allowed); the IETF Idempotency-Key draft 07 (2025-10-15) has expired but defines UUID keys, 400 missing, 422 mismatch, 409 in flight.
  Evidence: https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.txt
  Note: Checked 2026-10-04. RFC 9457: media types "application/problem+json" and "application/problem+xml"; "type" is "a JSON string containing a URI reference that identifies the problem type" and when absent "its value is assumed to be 'about:blank'"; "Generators MUST use the same status code in the actual HTTP response"; "Clients consuming problem details MUST ignore any such extensions that they don't recognize"; obsoletes RFC 7807. Draft 07 text: dated "15 October 2025", "Expires: 18 April 2026", "Idempotency-Key is an Item Structured Header [RFC8941]. Its value MUST be a String", recommends "a UUID [RFC4122] or a similar random identifier", and SHOULD responses of 400 (missing), 422 Unprocessable Content (key reused with different payload) and 409 Conflict (still processing). Datatracker: "This Internet-Draft is no longer active." Hono exception docs confirm `app.onError((err, c) => { if (err instanceof HTTPException) { return err.getResponse() } ... })` and "HTTPException.getResponse is not aware of Context".

Corrected recommendations:

- Pin the workspace `typescript` devDependency to 6.0.3 (or 5.9.3 if a clean peer tree is preferred), not 7.0.2: openapi-typescript 7.13.0 crashes at import under typescript@7.0.2 because that package's root export is lib/version.cjs with no compiler API (verified in a sandbox; upstream issue #2841 open, TS 6 peer PR #2774 unmerged since 2026-04-15). If the owner wants the native TypeScript 7 checker, install it under a pnpm alias (for example "tsgo": "npm:typescript@7.0.2") and run `tsgo --noEmit` from that alias while `typescript` stays 6.0.3; add a Renovate packageRule that keeps `typescript` below 7 until openapi-typescript ships TS 7 support. Expect a pnpm peer warning for `typescript ^5.x` with 6.0.3; it ran correctly, including `--check`.
- Keep openapi-typescript 7.13.0 + openapi-fetch 0.17.0, but treat the TypeScript peer range as a release-blocking dependency: the CI `verify` job must run `openapi-typescript openapi/v1.json -o packages/api-client/src/schema.d.ts --check` with the pinned TypeScript 6 line so a stray TypeScript bump fails loudly rather than silently generating nothing.
- In packages/schemas import `z` from plain `zod` and name components with `.meta({ id: 'Cycle', description: ... })`; zod-to-openapi 9.1.0 reads `.meta` identically to `.openapi('Name')` and does not require extendZodWithOpenApi. Use `z` from @hono/zod-openapi and `.openapi()` only inside packages/api (route parameters, headers, examples). This keeps the schema package free of a hono dependency for the Next.js client and avoids `.openapi is not a function` at runtime in a client bundle that never loaded the patch.
- Configure the oasdiff step as `oasdiff/oasdiff-action/breaking@b9325c9e0a27ab65b0da3b766522cedec6be81dc # v0.1.18` with `fail-on: ERR`, `base: 'origin/${{ github.base_ref }}:openapi/v1.json'`, `revision: 'HEAD:openapi/v1.json'`, and explicitly `review: false` (the default uploads an encrypted copy of both specs to oasdiff.com, which a privacy-first project should decide about consciously). Either grant that job `pull-requests: write` to get the PR comment (github-token already defaults to github.token) or set `github-token: ''` and keep `permissions: contents: read` only, reading the result from the job summary. The action is a Docker action built FROM tufin/oasdiff:v1.33.0, so it runs only on Linux runners.
- Pin pnpm/action-setup to the peeled commit ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0 (the v6 tag peels to 0977fd99725f1db4007ccb2928dbb4e90d06cc86, the v6.0.10 commit, which predates pnpm 12 support). Confirmed pins for the rest: actions/checkout 3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1, actions/setup-node 820762786026740c76f36085b0efc47a31fe5020 # v7.0.0, actions/upload-artifact 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1. Order: checkout (fetch-depth: 0 on pull_request), pnpm/action-setup (version from packageManager), setup-node with node-version-file and cache: pnpm, pnpm install --frozen-lockfile.
- For Renovate automerge to work on a solo repo, create the main ruleset with "Require a pull request before merging" set to 0 required approvals (or add the Renovate app to the bypass list), "Require status checks to pass" naming the `verify` check, and enable "Allow auto-merge"; with any required approval Renovate's PRs wait forever. Add `"matchCurrentVersion": "!/^0/"` to the minor/patch automerge rule so 0.x packages such as openapi-fetch and @scalar/hono-api-reference are not automerged across what are effectively breaking releases, and keep `helpers:pinGitHubActionDigests` so the `# vX.Y.Z` comments drive SHA bumps.
- Keep Vercel's built-in "Skip deployment" on, and note the extra rule from the docs: any change outside the pnpm workspace definition (root configs, .github, docs) is treated as a global change and deploys every project, so turbo-ignore gains nothing for those commits; declare every internal dependency (including an e2e package depending on web) in package.json so the dependency graph is accurate.

Missing from the research:

- The TypeScript 7.0.2 npm package no longer ships the JavaScript compiler API (only bin/tsc, lib/tsc.js shim, platform binaries and `./unstable/*` exports; 2.5 MB vs 24.3 MB for 6.0.3). This affects every tool in the toolchain that does `import ts from 'typescript'` at runtime, not only openapi-typescript (candidates in other dimensions: typescript-eslint, vitest typecheck, Next's TypeScript plugin, drizzle-kit). The workspace needs one deliberately chosen `typescript` version (6.0.3 is the safe line today) and the other researchers' version matrix should be re-checked against it.
- oasdiff-action `review` input defaults to true and uploads the two specs (client-side encrypted) to oasdiff.com; for a project whose policy is no third-party data flows, this must be set to false or explicitly accepted. The action also pulls tufin/oasdiff:v1.33.0 at job time (Linux only), adding image pull time to the PR job.
- Renovate cannot automerge when the ruleset requires an approval; the researcher's "require a PR" ruleset needs required approvals set to 0 (or a bypass actor) for a solo developer. The Renovate docs also recommend excluding 0.x versions from automerge (`matchCurrentVersion: "!/^0/"`).
- Shared schema packages should prefer zod's `.meta({ id })` over `.openapi('Name')` so clients never depend on @hono/zod-openapi or hono and never hit a missing `.openapi` method in a bundle that did not load extendZodWithOpenApi; zod-to-openapi 9.1.0 documents this as equivalent.
- Scalar's Hono integration documents `Scalar.serve()` for Zod OpenAPI Hono, which serves the reference and the generated document from a single route (pass `document` as the OpenAPI object or a function); this is an alternative to pointing Scalar at a separate /openapi.json route and matters if the reference is gated behind auth, because both the UI and the document then share the same middleware chain.
- Node's unsupported-syntax list also includes import aliases (`import x = require(...)`), and the Node docs recommend TypeScript 5.8 or newer for `erasableSyntaxOnly` and `rewriteRelativeImportExtensions`; with TypeScript 6.0.3 pinned both options exist.
- The GitHub hardening guide URL cited by the researcher now 301-redirects to https://docs.github.com/en/actions/reference/security/secure-use; cite the new URL in docs so the link does not rot.
- Vercel's skip-unaffected feature treats any change outside the workspace definition as global; a CI-only or docs-only commit still triggers a production build, so the build agent should expect that and not read it as a misconfiguration.

### sound-darkmode

- confirmed: The HTML standard defines activation triggering input events as keydown (not Esc or a reserved shortcut), mousedown, pointerdown only when pointerType is mouse, pointerup only when pointerType is not mouse, and touchend; Web Audio ties allowed-to-start to sticky activation.
  Evidence: https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation
  Note: Checked 2026-10-04. The spec reads: "any event whose isTrusted attribute is true and whose type is one of: keydown, provided the key is neither the Esc key nor a shortcut key reserved by the user agent; mousedown; pointerdown, provided the event's pointerType is mouse; pointerup, provided the event's pointerType is not mouse; or touchend." Web Audio Editor's Draft (9 September 2026): "A user agent may disallow this initial transition, and to allow it only when the AudioContext's relevant global object has sticky activation." The researcher's listener set (pointerdown, pointerup, touchend, keydown minus Escape, click) is correct; a pointerdown-only unlock would indeed miss touch.
- partially_correct: iOS Safari adds a non-standard 'interrupted' AudioContext state when the page is backgrounded.
  Evidence: https://webaudio.github.io/web-audio-api/#enumdef-audiocontextstate
  Note: Checked 2026-10-04. The iOS behavior is confirmed on MDN ("In iOS Safari, when a user leaves the page ... the audio context's state changes to 'interrupted' and needs to be resumed"). But the state is no longer non-standard: the Web Audio API Editor's Draft defines enum AudioContextState { "suspended", "running", "closed", "interrupted" } with "interrupted: This context is currently interrupted and cannot process audio until the interruption ends", plus a [[state before interruption]] slot. TypeScript 6.0.3 lib.dom.d.ts line 44248 types AudioContextState = "closed" | "interrupted" | "running" | "suspended", so the unlock helper can compare against 'interrupted' with no cast. Handling is right; the label "non-standard" is stale.
- confirmed: Vibration API: Chromium Android yes with gesture, Safari none, Firefox desktop removed in 129, Firefox Android returns true but never vibrates, caniuse global support 79.28 percent.
  Evidence: https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/vibration.json
  Note: Checked 2026-10-04. caniuse vibration.json: usage_perc_y 79.28, status rec; chrome 154-157 y, and_chr 154 y, safari 26.6 to TP n, ios_saf 26.6 to 27.2 n, firefox 159/160 n, and_ff 157 n, samsung 19.0 y. BCD 8.1.4 api.Navigator.vibrate (downloaded from unpkg): chrome_android note "Beginning in Chrome 60, this method requires a user gesture. Otherwise it returns false"; firefox version_added 16, version_removed 129; firefox_android partial_implementation true, "navigator.vibrate() returns true, but no vibration takes place (regardless of hardware support)"; safari and safari_ios version_added false. MDN vibrate page: "Sticky user activation is required." MDN user activation page lists Navigator.vibrate() and "Autoplay of Media and Web Audio APIs (in particular for AudioContexts)" under sticky-activation-gated APIs.
- confirmed: Safari 17.4 added input type=checkbox switch; WebKit plays a light impact haptic on toggle only during a trusted gesture; ios-haptics 3.2.0 (MIT) exploits this via a label overlay.
  Evidence: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/CheckboxInputType.cpp
  Note: Checked 2026-10-04. Safari 17.4 release notes (Apple JSON data endpoint): "Added support for <input type="checkbox" switch>. (119378678)". WebKit CheckboxInputType.cpp lines 414-421: "if (!RenderTheme::singleton().hasSwitchHapticFeedback(trigger)) return; if (trigger == SwitchTrigger::Click && !UserGestureIndicator::processingUserGesture()) return; ... page->chrome().client().performSwitchHapticFeedback();". RenderTheme.h line 282: "virtual bool hasSwitchHapticFeedback(SwitchTrigger) const { return false; }". PageClientImplIOS.mm lines 1208-1214: UIImpactFeedbackGenerator initWithStyle:UIImpactFeedbackStyleLight, impactOccurred. BCD html.elements.input.switch: safari 17.4, safari_ios 17.4, all others false. npm view ios-haptics: version 3.2.0, MIT, modified 2026-09-22; README: "this uses the <input type="checkbox" switch /> (introduced in safari 17.4), which has haptic feedback when toggled" and "renders a transparent <label> on top of your element, wired to a hidden switch". Apple HIG Playing haptics (JSON endpoint): "Make haptics optional. Let people turn off or mute haptics" and "Avoid overusing haptics."
- confirmed: use-sound 5.0.0 (MIT, peer react >=16.8) depends on howler ^2.2.4, howler last published 2023-09-19; next-themes 0.4.6 peer range targets React 16.8 to 19.
  Evidence: https://registry.npmjs.org/use-sound
  Note: Checked 2026-10-04 with npm view. use-sound: version 5.0.0, license MIT, peerDependencies { react: '>=16.8' }, dependencies { howler: '^2.2.4' }. howler: version 2.2.4, time.modified 2023-09-19T14:59:40Z. next-themes: version 0.4.6, MIT, peerDependencies react and react-dom '^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc' (so React 19.3.0 is within range; the researcher's reason to skip it is taste, not compatibility). Both the rejection of use-sound and the hand-rolled approach stand.
- confirmed: WCAG 2.2 SC 1.4.2 Audio Control (Level A) applies only to audio that plays automatically for more than 3 seconds; G60 and G171 are sufficient techniques.
  Evidence: https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
  Note: Checked 2026-10-04. SC text: "If any audio on a web page plays automatically for more than 3 seconds, either a mechanism is available to pause or stop the audio, or a mechanism is available to control audio volume independently from the overall system volume level." Sufficient techniques listed: "G60: Playing a sound that turns off automatically within three seconds", G170, and "G171: Playing sounds only on user request". Media Queries Level 5 (W3C Working Draft, 19 February 2026) section 12 lists only prefers-reduced-motion, prefers-reduced-transparency, prefers-contrast, forced-colors, prefers-color-scheme and prefers-reduced-data, so the app must own the mute preference, as the researcher said.
- partially_correct: localStorage theme and sound keys are regulated under PECR but fall under the strictly necessary exemption when the user explicitly sets them, which WP29 ties to session duration unless the control discloses that the choice is remembered.
  Evidence: https://www.legislation.gov.uk/uksi/2003/2426/schedule/A1
  Note: Checked 2026-10-04. The ICO and WP29 quotes are accurate (ICO: "regulation 6 actually applies to anyone who stores information on a user's device or gains access to information on a user's device, in either case by any method"; WP29 wp194 section 3.6: "only session (or short term) cookies storing such information are exempted under CRITERION B"). But UK law changed and the researcher missed it: the Data (Use and Access) Act 2025 (c. 18) s. 112 and Sch. 12 inserted PECR Schedule A1, in force 5 February 2026 (S.I. 2026/82 reg. 2(z13), which lists "section 112 (storing information in the terminal equipment of a subscriber or user)" and "Schedule 12"). Paragraph 6 "Website appearance etc" reads: "Regulation 6(1) does not prevent a person storing information ... if (a) the person provides an information society service by means of a website, (b) the sole purpose of the storage or access is (i) to enable the way the website appears or functions when displayed on, or accessed by, the terminal equipment to adapt to the preferences of the subscriber or user, or (ii) to otherwise enable an enhancement of the appearance or functionality of the website ..., (c) the subscriber or user is provided with clear and comprehensive information about the purpose of the storage or access, and (d) the subscriber or user is given a simple means of objecting, free of charge, to the storage or access and does not object." Sub-paragraph (2): the information and objection requirements need only be met "in respect of the initial use". ICO guidance (updated 29 April 2026) lists five exceptions: communication, strictly necessary, statistical purposes, appearance, emergency assistance, and names "detecting and applying operating system preferences like dark mode" as an example. So for UK visitors the operative test is now disclosure plus a free objection route, not the WP29 session-duration argument; the WP29 opinion still governs EU visitors. Note the exception is worded for a service "by means of a website", so the later Expo app cannot rely on it.
- confirmed: Before-paint theme pattern: inline head script sets an html attribute; Tailwind 4 needs @custom-variant dark on [data-theme=dark]; color-scheme is Baseline; theme-color with media works in Chrome Android, Safari 26 uses it only for installed web apps, Firefox ignores it; Next.js inline scripts need an id.
  Evidence: https://nextjs.org/docs/app/api-reference/functions/generate-viewport
  Note: Checked 2026-10-04. Tailwind docs: "@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));" and the inline script "localStorage.theme === "dark" || (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)". BCD 8.1.4 html.elements.meta.name.theme-color: chrome_android 92 full; chrome desktop and edge "uses the color only on installed progressive web apps"; firefox false; safari "From Safari 26, the theme color is only used for installed web apps." css.properties.color-scheme: chrome 81, firefox 96, safari 13. Next.js 16.3.8 Script docs: "An id property must be assigned for inline scripts"; "Scripts with the beforeInteractive strategy must be placed inside a root layout"; "Scripts with beforeInteractive will always be injected inside the head of the HTML document regardless of where it's placed". Sharpening the researcher missed: Next.js 16.3.8 has a first-class convention for both metas. The viewport export with themeColor: [{ media: '(prefers-color-scheme: light)', color }, { media: '(prefers-color-scheme: dark)', color }] emits exactly the two theme-color metas, and colorScheme emits <meta name="color-scheme">; viewport exports are only supported in Server Components.
- partially_correct: Measured WCAG ratios: the dark token set passes AA on all five surfaces; in light mode Sea Glass (2.50) and Clay (2.59) fail as text and need #3F736C and #9E5F48; identifying borders use #6B7F78 (light) or #5C7A70 on the three darkest dark surfaces.
  Evidence: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  Note: Checked 2026-10-04 by recomputing with the WCAG 2.2 relative-luminance formula (0.04045 threshold, 2.4 gamma). Every number the researcher reported matched to two decimals: Mist on the five dark surfaces 16.32 / 14.78 / 13.41 / 11.90 / 10.19; Sea Glass light 2.50 / 2.73 / 1.92; Clay 2.59 / 2.83 / 1.99; #3F736C 4.96 / 5.41 / 3.81; #9E5F48 4.60 / 5.02 / 3.53; #5C7A70 dark 3.79 / 3.43 / 3.11 / 2.76 / 2.37. One gap: the researcher reported the light border #6B7F78 only on Mist and white (3.91 / 4.26); on Sand #E6D6C3 it measures 2.99:1, just under the 3:1 that SC 1.4.11 requires when the border is the only cue identifying a control. Also #3F736C and #9E5F48 at 3.81 and 3.53 on Sand pass only as large text or non-text (not 4.5:1 body text), which the table shows but the implication does not call out.
- confirmed: Apple HIG dark mode guidance: avoid an app-specific appearance setting, Auto appearance switches during the day, at least 4.5:1 and strive for 7:1 on custom colors, base and elevated background tiers, soften white backgrounds.
  Evidence: https://developer.apple.com/design/human-interface-guidelines/dark-mode
  Note: Checked 2026-10-04 via Apple's JSON data endpoint (developer.apple.com/tutorials/data/design/human-interface-guidelines/dark-mode.json; the HTML page is JavaScript-only). Verbatim: "Avoid offering an app-specific appearance setting. An app-specific appearance mode option creates more work for people because they have to adjust more than one setting to get the appearance they want. Worse, they may think your app is broken because it doesn't respond to their systemwide appearance choice."; "people can choose the Auto appearance setting, which switches between the light and dark appearances as conditions change throughout the day, potentially while your app is running"; "At a minimum, make sure the contrast ratio between colors is no lower than 4.5:1. For custom foreground and background colors, strive for a contrast ratio of 7:1, especially in small text."; "Soften the color of white backgrounds." Playing audio page: "they also want to silence nonessential sounds, such as keyboard clicks, sound effects, game soundtracks, and other audible feedback. When a device is in silent mode, it plays only the audio that people explicitly initiate" and "the system volume always governs the final output." WebKit bug 237322 (RESOLVED CONFIGURATION CHANGED) comment of 2024-09-25 confirmed verbatim. Nuance: the Audio Session Editor's Draft (13 November 2024) default AudioSessionType is "auto", not "ambient"; iOS treats the default like ambient for Web Audio per the WebKit comment, and BCD shows navigator.audioSession in Safari 16.4 only.
- unverifiable: Material 2 dark theme guidance: #121212 reference surface, dark grey not black, elevation overlays 5 to 16 percent, 200 to 50 tones, 87/60/38 percent text opacities, page marked no longer maintained; M3 roles promise 3:1 on role pairs.
  Evidence: https://m2.material.io/design/color/dark-theme.html
  Note: Checked 2026-10-04. Both m2.material.io and m3.material.io return a JavaScript shell with no quoted text (68 KB and 62 KB of boilerplate, no '#121212', 'no longer maintained' or '3:1' in the HTML), and no JSON data endpoint exists (dark-theme.json and ?format=json return the same shell). Playwright Chromium 1.63.0 at /opt/pw-browsers could not open the page through the agent proxy (net::ERR_CERT_AUTHORITY_INVALID), and I did not disable TLS verification. The quotes match my memory of the M2 page, but I could not confirm them from the primary source today; treat them as medium confidence and non-load-bearing (the contrast math, not Material prose, carries the token decision).

Corrected recommendations:

- Privacy notice and toggles: for UK visitors, rely on PECR Schedule A1 paragraph 6 (the 'website appearance etc' exception inserted by the Data (Use and Access) Act 2025, in force 5 February 2026) rather than the WP29 session-duration argument. That exception requires (c) clear and comprehensive information about the purpose and (d) a simple, free means of objecting, so: label the sound and theme controls 'Remembered on this device', list tidefern.theme and tidefern.sound under functional storage in the privacy notice, and give each a visible way to stop storing (the 'System' option must remove the key, and a 'Forget on this device' action should clear both). The same UI also satisfies the WP29 04/2012 reasoning for EU visitors. No consent banner is needed for these two keys. Note the exception covers services 'by means of a website'; revisit when the Expo app ships.
- Theme metas: emit the two theme-color metas and the color-scheme meta through the Next.js 16.3.8 viewport export in the root layout (themeColor as an array of { media, color }, colorScheme: 'light dark') instead of hand-written <meta> tags; keep the inline head script (id required if it uses next/script with beforeInteractive, which is always injected into head and must live in the root layout) to set data-theme and style.colorScheme before paint, and update document.querySelector('meta[name=theme-color][media*=' + scheme + ']') content when the user overrides so installed web apps match.
- Light-mode border token: #6B7F78 measures 2.99:1 on Sand #E6D6C3, under the 3:1 SC 1.4.11 needs when a border is the only cue identifying a control. Either use the muted text color #5B6E68 (3.81:1 on Sand) for identifying borders on Sand surfaces, or reserve Sand for non-form surfaces. Also document that #3F736C (3.81) and #9E5F48 (3.53) pass on Sand only as large text or non-text, so body-size accent text on Sand must use Fern #2F4F46.
- AudioContext state handling: treat 'interrupted' as a standard AudioContextState value (Web Audio Editor's Draft 9 September 2026; TypeScript 6.0.3 lib.dom.d.ts includes it), so the helper compares state against 'suspended' and 'interrupted' directly, calls resume() on the next activation triggering event, and plays only when state === 'running'. Do not describe it as non-standard in code comments or docs.
- Unlock helper: keep the confirmed listener set (pointerdown, pointerup, touchend, keydown excluding Escape, click; capture and passive) and add a fast path: if navigator.userActivation?.hasBeenActive is true (Chrome 72, Firefox 120, Safari 16.4 per BCD 8.1.4) create or resume the context immediately. Read state after creation rather than assuming 'suspended', because Chrome's Media Engagement Index can allow a running context with no gesture on desktop.
- System theme mode: when the stored preference is 'system' (key absent), subscribe to matchMedia('(prefers-color-scheme: dark)') 'change' events and re-apply data-theme, because Apple's Auto appearance can flip 'potentially while your app is running'; also listen to the window 'storage' event so a change in one tab updates other open tabs.

Missing from the research:

- The Data (Use and Access) Act 2025 amendment to PECR regulation 6 (new Schedule A1, in force 5 February 2026 via S.I. 2026/82 reg. 2(z13)) with its dedicated appearance/functionality exception; the researcher cited only the pre-2026 ICO page and the 2012 WP29 opinion.
- The navigator.userActivation API (hasBeenActive for sticky activation, isActive for transient), Baseline across Chrome 72, Firefox 120 and Safari 16.4, which lets the sound module decide synchronously whether creating the AudioContext will start it.
- The Next.js 16.3.8 viewport export (themeColor array with media, colorScheme) as the framework-native way to emit the theme-color and color-scheme metas, plus the rule that viewport exports are Server Component only and that beforeInteractive scripts must sit in the root layout.
- Live switching while in system mode: a matchMedia change listener (and cross-tab storage event sync) so the OS Auto schedule changing mid-session re-themes the page without a reload.
- Light-mode identifying border on Sand (#6B7F78 on #E6D6C3 = 2.99:1) fails the 3:1 non-text threshold; the token table only reported Mist and white backgrounds for borders.
- Chrome's Media Engagement Index can let an AudioContext start without a gesture on desktop, so readiness must be read from state, not inferred from whether a gesture has happened.
- The Web Audio Editor's Draft now standardizes the 'interrupted' state and TypeScript 6.0.3 types it, which removes the need for any cast or string widening in the sound module.
- The Audio Session API default type is 'auto' per the Editor's Draft (13 November 2024), with iOS treating Web Audio as ambient by default; only Safari 16.4+ implements navigator.audioSession, so leaving it unset is the only cross-browser option anyway.
- The historical six-AudioContext-per-tab limit is recorded in BCD 8.1.4 itself ("Before Chrome 66, each tab is limited to 6 audio contexts"), so it can be cited as primary rather than as unverified secondary sources.
- Material 2 and Material 3 pages cannot be read without a JavaScript-capable browser and were not verifiable through the proxy today; the build should cite the measured contrast table and Apple HIG (verifiable via Apple's JSON data endpoints) as the load-bearing sources for the dark palette.

### design-galleries

- confirmed: CSS feature support per web-features: relative colour Baseline low (2024-09-16, Safari 18, Firefox 128, Chrome 125); corner-shape not Baseline (Chrome/Edge 139 only); color-mix Baseline high; light-dark Baseline low; view transitions Baseline low since 2025-10-14; scroll-driven animations not Baseline; prefers-reduced-motion Baseline high since 2022-07-15.
  Evidence: https://unpkg.com/web-features@latest/data.json
  Note: Checked 2026-10-04 against web-features 3.40.1 (npm latest). Every status, date and browser version in the claim matches the data file exactly. Two related facts the researcher did not record: oklab/oklch is Baseline high (low 2023-05-09, high 2025-11-09, Safari 15.4+), so oklch values themselves need no hex fallback; and text-wrap: pretty is baseline false (Chrome 117, Safari 26, no Firefox) while text-wrap: balance is Baseline low (2024-05-13). MDN corner-shape page also confirmed: "Limited availability" and "not Baseline because it does not work in some of the most widely-used browsers".
- partially_correct: Nord (Nordhealth) calendar docs describe range semantics (first click start, second end, swap if earlier, hover preview), follow the W3C Date Picker Dialog example, and advise against a picker for date of birth; licence is "SEE LICENSE IN LICENSE.md" and the text could not be verified.
  Evidence: https://nordhealth.design/components/calendar/
  Note: Behaviour quotes confirmed verbatim on 2026-10-04 ("The first click sets the start, the second sets the end (the two are swapped if the second is earlier), and the days in between are highlighted with a live preview as you hover"; "Don't use for entering date of birth. Use input component instead"; "Don't use for choosing a date that is over 10 years in the future or the past"; built to follow the "W3C Date Picker Dialog example with some small exceptions"). The licence is now verified from the npm tarball of @nordhealth/css 5.2.4 (LICENSE.md): "Nordhealth hereby grants you a limited, non-exclusive, revocable license to access and use the Package solely for the purpose of performing your duties for and on behalf of Nordhealth" and "You may not access or use the Package or reproduce, retransmit, disseminate, sell, publish, broadcast or use it for any other reason." Governing law Finland. So Nord is proprietary and no Nord code, CSS or markup may be used by Tidefern at all; reading the public documentation as a behaviour reference is the most that is permitted. Nord's link points at the retired wai-aria-practices URL; the current APG page https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ returns 200.
- partially_correct: 21st.dev lists 78 calendar components; its terms vest Marketplace content in 21st Labs Inc. and require visible link-backs on redistribution; pricing is Hobby $0/mo with 2 free copies/day and Builder $6/mo billed yearly.
  Evidence: https://21st.dev/terms
  Note: Terms (Last updated: July 20, 2026) checked 2026-10-04. The ownership clause is joint, not 21st Labs alone: "All code, content, and materials published on the Marketplace ... are the sole and exclusive property of their respective authors and 21st Labs Inc. Users are granted access to view and use the content solely through the official 21st.dev platform in accordance with these Terms." The "independent works authored and owned by 21st Labs Inc." clause applies to demos, previews, curation and 21st's modifications, "even where the underlying component code was originally authored by a third party and remains separately owned or licensed by that author." Link-back clause confirmed verbatim. Pricing: /pricing today shows Builder $6 per month billed yearly, Builder + AI $15, Team $7.50 per seat per month; no plan named Hobby appears there. The homepage FAQ says "Browsing the whole registry is free, and you get 2 free component copies every day." Calendar count is ambiguous: the /s/calendar description says "Find 78 versatile calendar components" while the page title says "239+ Calendar Components for React & Tailwind". The conclusion (survey only, never vendor) stands and is stronger given the "solely through the official 21st.dev platform" wording.
- confirmed: Vercel web-design-guidelines skill fetches a 190-line command.md at run time; agent-skills has no LICENSE file but README line 237 says MIT; web-interface-guidelines has an MIT LICENSE (c) 2025 Vercel Labs; the listed rules exist, including a Title Case conflict; 698.4K installs.
  Evidence: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md
  Note: Checked 2026-10-04. SKILL.md says "Fetch fresh guidelines before each review" with the exact raw URL and "Output findings in the terse file:line format". command.md is 190 lines; rules found at lines 53 (prefers-reduced-motion), 54 ("Animate transform/opacity only (compositor-friendly)"), 55 (never transition: all), 68 (tabular-nums), 69 (text-wrap: balance or text-pretty), 75 (empty states), 97 (URL reflects state), 100 (destructive confirmation or undo), 119 (color-scheme: dark on html), 120 (theme-color meta), 125 (Intl.DateTimeFormat), 144 ("Title Case for headings/buttons (Chicago style)"), 147 (error messages include fix/next step). LICENSE, LICENSE.md, LICENSE.txt all 404 in agent-skills; README is 239 lines with "## License" at 237 and "MIT" at 239. web-interface-guidelines LICENSE: "MIT License / Copyright (c) 2025 Vercel Labs". skills.sh now shows 698.8K installs, first seen January 19, 2026, audits Gen Agent Trust Hub Pass, Socket Warn, Snyk Pass. Hazard the researcher missed: command.md contains 7 em dashes, so a verbatim vendored copy would fail pnpm prose:check.
- confirmed: Fraunces and Nunito Sans are OFL variable families on Google Fonts with the stated axes, designers and lastModified dates.
  Evidence: https://fonts.google.com/metadata/fonts/Fraunces
  Note: Metadata JSON read 2026-10-04 (after stripping the )]}' prefix). Fraunces: license ofl, category Serif, designers Undercase Type, Phaedra Charles, Flavia Zimbardi, axes SOFT 0-100, WONK 0-1, opsz 9-144, wght 100-900, 18 fonts, lastModified 2025-09-10. Nunito Sans (https://fonts.google.com/metadata/fonts/Nunito%20Sans): license ofl, category Sans Serif, designers Vernon Adams, Jacques Le Bailly, Manvel Shmavonyan, Alexei Vanyashin, axes YTLC 440-540, opsz 6-12, wdth 75-125, wght 200-1000, 18 fonts, lastModified 2025-09-16. All match.
- confirmed: amicro.vercel.app is a Vite SPA for @subhanhq/amicro (npm 1.0.1, MIT) with routes /buttons, /cards, /carousels, /loaders, /text-animations, /dither-charts, /mono-charts, /3d, /cli, /skills.
  Evidence: https://amicro.vercel.app/sitemap.xml
  Note: npm view @subhanhq/amicro on 2026-10-04: version 1.0.1, license MIT, dist-tags latest 1.0.1. sitemap.xml lists all claimed routes plus /Anime and /sponsors, which the researcher omitted. Reject verdict for Tidefern is sound.
- confirmed: component.gallery indexes 60 components, 95 design systems and 2,671 examples; the Datepicker page says "A visual way to choose a date using a calendar view" with 44 examples including Geist and Nord.
  Evidence: https://component.gallery/components/datepicker/
  Note: Homepage text on 2026-10-04: "60 components, 95 design systems, 2,671 examples." and "The Component Gallery is an up-to-date repository of interface components based on examples from the world of design systems". Datepicker page: "A visual way to choose a date using a calendar view." and "44 Examples"; Geist Design System (geist/calendar) and Nord Design System entries present. Site is built with Astro (astro-island markup). No licence statement found on the homepage, as the researcher said.
- partially_correct: details.so has Health (39) and Timeline (18) filters; plans are Free, Pro $9/month (full library, remix) and Vault $19/month (code snippets, AI/MCP); references are for inspiration, not direct copying.
  Evidence: https://details.so/pricing
  Note: Checked 2026-10-04. The pricing page title is "Pricing: Pro, Max & Lifetime plans" (ampersand and plan names as shown; punctuation normalised). Plans: Starter (free), Pro $9/mo billed yearly or $12 monthly ("Everything in Free, plus", "(Vault not included)", 300 MCP credits/mo), Max $19/mo billed yearly or $25 monthly ("Access to Inspo + Vault", "Copy-ready code snippets", 1,000 MCP credits/mo), Team $22 to $28 per seat/mo, Lifetime $490 one-time (limited to 100 spots). CTA buttons read "Get Pro, $9 / month" and "Get Vault, $19 / month", which is where the researcher's "Vault plan" naming came from; the plan that includes the Vault is Max. Commercial use: "You cannot resell or republish the resources themselves as a competing library or resource pack" and "paid purchases are non-refundable". The Health (39) and Timeline (18) counts and the "not direct copying" sentence could not be confirmed from the served HTML because /inspo is JavaScript-rendered (data-shell-booting shell); treat those counts as unverified.
- confirmed: Phloom's /design pages say what the researcher quotes: live token readout (144 tokens, 221 declarations), measured ratios 3.94:1 / 5.63:1 / 5.80:1 / 2.83:1, Garden Morning oklch(0.985 0.005 80), frost veil, thirty-odd derived tokens, next-themes defaultTheme system, EASE_EXPO_OUT cubic-bezier(0.16, 1, 0.3, 1), shell curve cubic-bezier(0.22, 1, 0.36, 1), transition-all banned (PRO-644), DASHBOARD_BEATS, no em dashes rule, eight foundations, 45% ring opacity, --radius .625rem, tabular-nums-pro.
  Evidence: https://phloom.app/design/color
  Note: All seven pages (/design, color, type, components, motion, brand, foundations) returned 200 on 2026-10-04 and every quoted phrase was found in the served HTML; three phrases ("Figtree is the interface", "Instrument Serif is for names", "transition-all is banned") appeared split across <code> and <strong> tags rather than missing, and the Type page meta description confirms "Figtree, Instrument Serif, and Geist Mono". The colour page contains next-themes and defaultTheme="system". Phloom publishes no licence for its design-language text, so Tidefern should paraphrase principles and write its own rules rather than copy Phloom's prose. The researcher's observation about blank lower sections in a full-page screenshot was not re-verified here (no rendering performed).
- partially_correct: Build the calendar on shadcn/ui Calendar, which wraps react-day-picker, with WAI-ARIA Date Picker Dialog keyboard support.
  Evidence: https://daypicker.dev/upgrading
  Note: shadcn docs confirm the Calendar is "built on top of React DayPicker" and the registry item https://ui.shadcn.com/r/styles/new-york-v4/calendar.json declares dependencies ["cn","react-day-picker@latest","date-fns"]. On 2026-10-04 npm latest for react-day-picker is 10.0.2 (10.0.0 published 2026-05-08, 10.0.2 on 2026-09-30; newest 9.x is 9.14.0; peers react >=16.8.0, MIT). The v10 guide says "DayPicker v10 is mostly a cleanup release", "Deprecated classNames and styles compatibility keys were removed", "shadcn/ui users with a copied Calendar component should also update their local class name mappings", and "@daypicker/react is the new preferred package name. The react-day-picker package name remains available for compatibility." @daypicker/react 10.0.2 (MIT) exists on npm. shadcn's calendar.tsx still imports from "react-day-picker" and uses v9-era snake_case keys (root, months, month_caption, button_previous, range_start ...), which the guide implies are current, but nothing in the recommendation pins a version, so `shadcn add calendar` will float with the registry's @latest.
- confirmed: find-skills is an MIT discovery helper (3.7M installs, first seen January 26, 2026) whose guidance prefers skills with 1K+ installs and warns under 100.
  Evidence: https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md
  Note: Checked 2026-10-04. SKILL.md: "The Skills CLI (npx skills) is the package manager for the open agent skills ecosystem"; commands npx skills find [query] [--owner <owner>], npx skills add <package>, npx skills update; "Do not recommend a skill based solely on search results"; "Prefer skills with 1K+ installs. Be cautious with anything under 100." LICENSE: "MIT License / Copyright (c) 2026 Vercel, Inc." skills.sh: 3.7M installs, first seen January 26, 2026, audits Gen Agent Trust Hub Pass, Socket Pass, Snyk Warn.

Corrected recommendations:

- Nord is a documentation-only reference: its npm LICENSE.md restricts use to people acting on behalf of Nordhealth and forbids reproduction or any other use, so Tidefern must never install @nordhealth/* packages or copy Nord CSS, markup or code. Cite the WAI-ARIA APG Date Picker Dialog pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) as the normative keyboard model and write the range semantics in Tidefern's own words.
- Calendar dependency: after `shadcn add calendar`, replace the registry's `react-day-picker@latest` with an explicit, lockfile-pinned version chosen by the build agent after reading https://daypicker.dev/upgrading (today's latest is 10.0.2 on the renamed @daypicker/react line; 9.14.0 is the last 9.x). Verify the copied calendar.tsx classNames keys against the pinned version and add a unit test for range selection (start, end, swap when earlier) so a registry float cannot silently change behaviour.
- Vercel web-design-guidelines audit: install the skill but do not vendor command.md verbatim into the repo, because the file contains 7 em dashes and would fail pnpm prose:check. Either pin a commit SHA of vercel-labs/web-interface-guidelines in the wrapper and fetch at audit time, or vendor a copy under a path excluded from prose:check with a header noting the upstream commit and that punctuation was unchanged. Decide the capitalisation rule in advance (sentence case except page titles) and expect the audit to flag rule 144.
- 21st.dev: unchanged conclusion (survey layouts only, never copy), with the corrected legal basis: content is the property of "their respective authors and 21st Labs Inc." and may be used "solely through the official 21st.dev platform"; redistribution needs a visible link back. Pricing to record: free browsing with 2 component copies per day; Builder $6 per month billed yearly; Builder + AI $15; Team $7.50 per seat.
- details.so: if the owner wants to browse Health and Timeline references for one month, the monthly Pro price is $12 (the $9 figure is the yearly-billed rate), and the plan that includes the Vault is Max at $25 monthly or $19 per month billed yearly; purchases are non-refundable. Nothing from the Vault may be republished as a library, and no Vault code should enter Tidefern without recording its source and the plan under which it was obtained.
- Headings: use text-wrap: balance, not text-wrap: pretty, as the default heading rule, because web-features marks pretty as not Baseline (Chrome 117, Safari 26, no Firefox) while balance is Baseline low since 2024-05-13. oklch literals need no hex fallback (Oklab/OkLCh Baseline high since 2025-11-09, Safari 15.4+); only relative colour syntax (from keyword) and corner-shape need the fallback and @supports treatment the researcher proposed.

Missing from the research:

- The shadcn registry pins `react-day-picker@latest`, and the package has moved to a v10 line (10.0.0 on 2026-05-08) with a preferred rename to @daypicker/react; the researcher's calendar recommendation gave the build agent no version to pin and did not mention the v10 guide's explicit note that shadcn users must update classNames mappings.
- Nord's licence was left unverified; the npm tarball LICENSE.md shows it is proprietary and limited to Nordhealth's own staff, which rules out even partial reuse and should be stated as a hard rule in the build prompt.
- command.md from vercel-labs/web-interface-guidelines contains 7 em dashes; vendoring it as proposed collides with the repository's pnpm prose:check rule.
- text-wrap: pretty (recommended by the Vercel rules file and implicitly by the researcher) is not Baseline per web-features; text-wrap: balance is the safe default for headings.
- The Oklab/OkLCh colour space itself is Baseline high (Safari 15.4+), which the researcher did not record; this narrows the fallback work to relative colour derivations and corner-shape only.
- details.so plan naming and prices were misread: the Vault lives in the Max plan, $9 and $19 are yearly-billed rates ($12 and $25 monthly), Lifetime ($490) and Team tiers exist, and purchases are non-refundable; the Health (39) and Timeline (18) filter counts come from a JavaScript-rendered page and were not confirmable from HTML.
- 21st.dev's calendar count is inconsistent on its own page (78 in the description, 239+ in the title), and the ownership clause names authors jointly with 21st Labs; the Hobby plan label is not on /pricing today.
- Phloom publishes no licence for its design-language prose or rules; the researcher warned against copying the visual identity but not against copying its documentation text, which Tidefern should paraphrase in its own voice.
- Nord's documentation links the retired W3C wai-aria-practices URL for the Date Picker Dialog; the build agent should link the current APG URL, which returns 200.

### fonts-brand

- partially_correct: Fontsource variable packages exist for every candidate except Instrument Serif at 5.3.0 (Onest 5.3.1), OFL-1.1, Latin WOFF2 files named <id>-latin-<axes>-<style>.woff2 with the stated byte sizes; the Newsreader wght-only file pins opsz at its default of 18.
  Evidence: https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable/newsreader@5.3.0?structure=flat
  Note: Checked 2026-10-04. npm view: @fontsource-variable/newsreader 5.3.0 OFL-1.1, @fontsource-variable/figtree 5.3.0, @fontsource-variable/onest 5.3.1, @fontsource/instrument-serif 5.3.0, @fontsource-variable/instrument-serif E404, eb-garamond and plus-jakarta-sans 5.3.0. jsdelivr listing: /files/newsreader-latin-opsz-normal.woff2 132000 B, newsreader-latin-wght-normal.woff2 58084 B, figtree-latin-wght-normal.woff2 20156 B, italic opsz 146872 B, figtree italic 20928 B; LICENSE 4520 B present. fontTools on the downloaded files: opsz file axes wght 200/400/800 and opsz 6/18/72 with GSUB liga, pnum, rvrn, tnum. Correction: the wght-only file is instanced at opsz 16, not 18. Its name ID 1 reads 'Newsreader 16pt 16pt' and its digit advance is 1133 units, which matches fontTools instancer output of the google/fonts TTF at opsz 16 (1133, H 1600); the opsz 18 instance gives 1100 and H 1559. Also: fontsource files keep name ID 14 (OFL URL) but drop name ID 13 (license text), and they strip layout features present in the google/fonts TTFs (Newsreader loses case, locl, ordn, sups; Figtree loses case, ss01, ss02, subs, sups, sinf, aalt, ordn). tnum and pnum survive in both.
- confirmed: next/font/local in Next.js 16.3.8 accepts src as a string or array of {path, weight, style}, weight as a range string such as '100 900', display default 'swap', preload default true, adjustFontFallback 'Arial' (default) | 'Times New Roman' | false, a variable option and a declarations array; the loader rejects declarations for src, font-display, font-weight, font-style and emits one @font-face per src entry.
  Evidence: https://nextjs.org/docs/app/api-reference/components/font
  Note: Checked 2026-10-04, page header version 16.3.8. Docs: src 'Array<{path: string, weight?: string, style?: string}>'; "weight: '100 900': A string for the range between 100 and 900 for a variable font"; display "default value of 'swap'"; preload "The default is true"; adjustFontFallback for next/font/local "The possible values are 'Arial', 'Times New Roman' or false. The default is 'Arial'"; declarations example "[{ prop: 'ascent-override', value: '90%' }]"; Tailwind example "@theme inline { --font-sans: var(--font-inter); ... }". Source (canary) validate-local-font-function-call.ts rejects ['src', 'font-display', 'font-weight', 'font-style'] as declaration props; loader.ts emits ['font-weight', weight ?? defaultWeight] and ['font-style', style ?? defaultStyle] per file. Two details the researcher did not state: preload is a single flag passed to emitFontFile for every file in src, so each src entry gets its own preload link; and fallback metrics come from pickFontFileForFallbackGeneration, which picks the src entry whose weight (or range containing 400) is nearest 400, keeping the first entry on ties (https://raw.githubusercontent.com/vercel/next.js/canary/packages/font/src/local/pick-font-file-for-fallback-generation.ts).
- confirmed: Tailwind CSS v4 maps next/font CSS variables through @theme inline; --font-* produces font-<name> utilities; inline is required when a theme variable references another variable.
  Evidence: https://tailwindcss.com/docs/theme
  Note: Checked 2026-10-04. Tailwind docs: "@theme inline { --font-sans: var(--font-inter); }" and "Using the inline option, the utility class will use the theme variable value instead of referencing the actual theme variable" with the explanation that var(--font-sans) otherwise resolves where --font-sans is defined; namespace table "--font-* Font family utilities like font-sans" and "The font-sans, font-serif, and font-mono utilities only exist by default because Tailwind's default theme defines the --font-sans, --font-serif, and --font-mono theme variables", so overriding --font-serif is in-namespace.
- confirmed: OFL permits self-hosting via @font-face (FAQ 2.1), treats subsetting as permitted modification that normally bars Reserved Font Names (2.6), allows WOFF conversion without renaming only if data is unchanged except compression (2.2.1), requires the license text except when embedded in a document or bundled in a program (1.10), and condition 2 requires every copy to carry the copyright notice and license; Lora and Source Serif 4 declare RFNs, Newsreader and Figtree do not.
  Evidence: https://openfontlicense.org/ofl-faq/
  Note: Checked 2026-10-04. FAQ 2.1: "loading the fonts dynamically as webfonts through CSS @font-face declarations is a much better method... This is recommended and explicitly allowed by the licensing model because it is distribution." 2.6: "Removing any parts of the font when delivering a webfont to a browser, including unused glyphs and smart font code, is considered modification. This is permitted by the OFL but would not normally allow the use of RFNs." 2.2.1: "without changing the font name, but only if the original font data remains unchanged except for WOFF compression". 1.10: "The only situation in which an OFL font can be distributed without the text of the OFL (either in a separate file or in font metadata), is when a font is embedded in a document or bundled within a program." The condition 2 and 3 sentences are in the license text, not the FAQ: https://openfontlicense.org/open-font-license-official-text/ reads "provided that each copy contains the above copyright notice and this license. These can be included either as stand-alone text files, human-readable headers or in the appropriate machine-readable metadata fields" and "No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted". METADATA.pb copyright lines today: Lora 'with Reserved Font Name "Lora"', Source Serif 4 'with Reserved Font Name Source', Newsreader and Figtree carry no RFN clause (and neither do EB Garamond or Plus Jakarta Sans).
- confirmed: Next.js 16.3.8 metadata conventions: favicon.ico only in the top level of app/; icon accepts .ico .jpg .jpeg .png .svg under app/**/*, with sizes="any" for SVG; apple-icon accepts .jpg .jpeg .png only; numbered variants allowed; manifest.ts returns MetadataRoute.Manifest whose icon purpose is 'any' | 'maskable' | 'monochrome'; opengraph-image accepts .jpg .jpeg .png .gif with an alt.txt sibling and fails the build above 8 MB.
  Evidence: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
  Note: Checked 2026-10-04. App icons page (header version 16.3.7, lastUpdated 2026-03-03): "The favicon image can only be located in the top level of app/"; table favicon .ico app/, icon .ico .jpg .jpeg .png .svg app/**/*, apple-icon .jpg .jpeg .png app/**/*; "You can set multiple icons by adding a number suffix to the file name. For example, icon1.png, icon2.png"; "sizes=\"any\" is added to icons when the extension is .svg or the image size of the file is not determined"; "You cannot generate a favicon icon." Manifest page (16.3.8): "in the root of app directory", example app/manifest.ts returning MetadataRoute.Manifest with icons. next@16.3.8 dist/lib/metadata/types/manifest-types.d.ts line 10: "purpose?: 'any' | 'maskable' | 'monochrome' | undefined" (via unpkg). Opengraph page (16.3.8, lastUpdated 2026-07-09): types .jpg .jpeg .png .gif, "the opengraph-image file size must not exceed 8MB... the build will fail", twitter-image 5MB, opengraph-image.alt.txt produces og:image:alt.
- partially_correct: ImageResponse (next/og, Satori plus resvg) accepts only ttf, otf and woff fonts within a 500 KB bundle, supports letterSpacing and textTransform, and a dynamic opengraph-image.tsx would need a separate TTF copy of Newsreader, subset first to fit.
  Evidence: https://nextjs.org/docs/app/api-reference/functions/image-response
  Note: Checked 2026-10-04. Docs (16.3.8): "Maximum bundle size of 500KB. The bundle size includes your JSX, CSS, fonts, images, and any other assets." and "Only ttf, otf, and woff font formats are supported." fonts option typed {name, data: ArrayBuffer, weight: number, style: 'normal' | 'italic'}. Satori README line 465: "Satori currently supports three font formats: TTF, OTF and WOFF. Note that WOFF2 is not supported at the moment." and the CSS table lists letterSpacing "Supported" and textTransform none/lowercase/uppercase/capitalize. Correction: a subset of the variable Newsreader TTF is not enough. Satori parses fonts with opentype.js and fails on variable fonts (vercel/satori issue #712 "Variable fonts not working", TypeError in fvar parsing, closed as duplicate of #162). Any ImageResponse path needs a static instance exported at the chosen wght and opsz (fontTools instancer), then subset, as TTF/OTF.
- confirmed: The SVG to raster pipeline works with sharp 0.35.5 (density 1 to 100000, default 72; no ICO or SVG output), @resvg/resvg-js 2.6.2, png-to-ico 3.0.2 (node >=20) and svgo 4.1.0 whose preset-default no longer includes removeViewBox.
  Evidence: https://sharp.pixelplumbing.com/api-constructor/
  Note: Checked 2026-10-04. npm view: sharp 0.35.5 engines node >=20.9.0; png-to-ico 3.0.2 engines node >=20; svgo 4.1.0 engines node >=16; @resvg/resvg-js 2.6.2. sharp constructor docs: density renders SVG and PDF at a default of 72 DPI in the range 1 to 100000; api-output lists toFormat, jpeg, png, webp, gif, jp2, tiff, avif, heif, jxl, raw with no ICO or SVG output. svgo plugins/preset-default.js at 4.1.0 (cdn.jsdelivr.net/npm/svgo@4.1.0/plugins/preset-default.js) and on main contain zero references to removeViewBox (removeDesc is the last import). The researcher's run artefacts (favicon.ico with 3 icons, 1200x630 PNG) were not re-executed here.
- confirmed: Icon safe zones: W3C manifest safe zone is a circle of radius 40% of the icon size with about 10% padding; Android adaptive icons are 108 dp with the inner 66 dp visible and the outer 18 dp per side reserved for masks; Apple wants square unmasked 1024x1024 layers because the system applies rounded corners and advises against text; Chromium requires 192 and 512 manifest icons; Safari web clips use 180x180, 167x167, 152x152.
  Evidence: https://www.w3.org/TR/appmanifest/
  Note: Checked 2026-10-04. W3C appmanifest (purpose and safe zone are defined in this spec itself, section 2.1 and 2.3): "a circle with center point in the center of the icon and with a radius of 2/5 (40%) of the icon size", "most icons will have around 10% padding on the top, bottom, right and left", purposes monochrome, maskable, any. Android (developer.android.com/develop/ui/views/launch/icon_design_adaptive): "Size all layers to 108x108 dp", inner safe zone 66x66 dp, logo at least 48x48 and "must not exceed 66x66 dp", "The outer 18 dp on each of the four sides of the layers is reserved for masking". web.dev/articles/install-criteria: "icons - must include a 192px and a 512px icon". Apple HIG app-icons JSON (developer.apple.com/tutorials/data/design/human-interface-guidelines/app-icons.json, alert dated 2026-06-08 "Refined guidance for Liquid Glass"): "For iOS, iPadOS, and macOS icons, provide square layers so the system can apply rounded corners", "Providing layers with pre-defined masking negatively impacts specular highlight effects and makes edges look jagged", "Include text only when it's essential to your experience or brand", layout size "1024x1024 px". Apple Safari Web Content Guide archive lists apple-touch-icon sizes 152x152, 180x180, 167x167 and says icons must be PNG. Sharpening: the same HIG now says "iOS, iPadOS, macOS, and watchOS app icons include a background layer and one or more foreground layers" built in Icon Composer and "Although you can provide a flattened image for your icon, layers give you the most control", so the 1024 master should be kept as separable layers, not only a flat PNG.
- confirmed: WCAG 2.2 thresholds (4.5:1 text, 3:1 large text at about 24 px or 18.5 px bold, 3:1 non-text, 7:1 enhanced), the luminance and contrast formulas, the no-rounding rule, and the computed palette ratios (White/Fern900 13.04, Mist/Fern900 11.96, Sand/Fern700 6.35, Mist/SeaGlass700 4.96, Mist/SeaGlass600 3.64, Mist/SeaGlass500 2.50, SeaGlass500/Fern900 4.78, Mist/Stone 1.30, Clay800 6.43 on Mist, danger #A63D33 5.77 on Mist, danger-strong 7.45, Sea Glass 800 7.01, and the rest).
  Evidence: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  Note: Checked 2026-10-04. Understanding 1.4.3: "contrast ratio of at least 4.5:1", large-scale "at least 3:1", "at least 18 point or 14 point bold", "1pt = 1.333px, therefore 14pt and 18pt are equivalent to approximately 18.5px and 24px", "the computed values should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)". Recomputed today with the WCAG 2.2 formula (0.04045 threshold, (L1+0.05)/(L2+0.05)) for 29 pairs using the hex values stated in the findings: every value matches the researcher's to two decimals (e.g. White/Fern900 13.042, Mist/Fern900 11.963, Sand/Fern700 6.346, Sand/Fern500 4.296, Mist/SG700 4.964, Mist/SG600 3.641, SG500/Fern900 4.781, SG300/Fern700 4.509, Mist/Stone 1.299, Mist/Clay800 6.427, Sand/Danger 4.427, Mist/DangerStrong 7.447, Mist/SG800 7.008). Pairs involving Sage and Clay 300/500/600 could not be re-derived because their hex values are not stated in the findings; the luminances given (Sage 0.5501, Clay300 0.4424, Clay500 0.3214, Clay600 0.2286) are internally consistent with the ratios claimed.
- confirmed: Newsreader fvar is opsz 6 to 72 (default 18) and wght 200 to 800 (default 400); Figtree is wght 300 to 900; both expose tnum and pnum; Newsreader digits are equal width by default; Plus Jakarta Sans and EB Garamond also expose tnum; Fraunces has no tnum and defaults to wght 900.
  Evidence: https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf
  Note: Checked 2026-10-04 with fontTools 4.66.1 on the google/fonts TTFs (451664 B Newsreader, 62712 B Figtree) and the fontsource WOFF2 files. Newsreader fvar [('wght', 200, 400, 800), ('opsz', 6, 18, 72)], GSUB case, liga, locl, ordn, pnum, rvrn, sups, tnum, all digits 1100 units of 2000 upm, name ID 13 holds the OFL text and ID 14 the URL. Figtree fvar [('wght', 300, 300, 900)] (default instance is 300 'Figtree Light', not 400), GSUB includes tnum and pnum, digits proportional by default (638, 410, 551...). Plus Jakarta Sans fontsource wght 200/400/800 with tnum and pnum; EB Garamond fontsource wght 400/400/800 with tnum and pnum and 480-unit equal digits; Fraunces fontsource wght 100/900/900 with only liga and rvrn. The pyftsubset claims also hold: fonttools subset docs read "By default, only nameIDs between 0 and 6 are preserved, the rest are dropped" and "WOFF2 requires the Brotli Python extension" (https://fonttools.readthedocs.io/en/latest/subset/index.html).

Corrected recommendations:

- Keep the Newsreader Latin opsz WOFF2 (132 KB) as the shipped file, but correct the record: the fontsource wght-only file (58 KB) is a fixed opsz 16 instance (name 'Newsreader 16pt 16pt', digit advance 1133), not opsz 18; do not describe it as the default cut if it is ever chosen for a size budget.
- If the tracked uppercase tagline or any all-caps labels need case-sensitive punctuation (OpenType 'case') or superscript ordinals ('sups', 'ordn'), do not use the fontsource WOFF2 files, which strip those features; subset the google/fonts TTFs instead with pyftsubset --flavor=woff2 --layout-features+=case,tnum,pnum,sups,ordn --name-IDs+=13,14 --unicodes=<latin ranges>. If those features are not needed, the fontsource files are fine and tnum/pnum work as claimed.
- Treat the Newsreader italic as a real cost, not 'optional': every src entry in one localFont() call is preloaded on every route the root layout covers (preload is one flag applied per file), so adding newsreader-latin-opsz-italic.woff2 adds 147 KB of preload. Either omit serif italics (headings and display numbers rarely need them, and the browser synthesizes a slanted fallback) and set font-synthesis-style: none if synthesized italics are unwanted, or accept the preload knowingly. Figtree italic at 21 KB is fine to include.
- Order the src array with the roman variable file first and give both entries their weight range: Next picks the fallback-metrics file by closeness to weight 400 and keeps the first entry on ties, so this guarantees adjustFontFallback 'Times New Roman' metrics come from the roman Newsreader file, and the Figtree Arial metrics from roman Figtree.
- For any future opengraph-image.tsx or icon.tsx built with ImageResponse, export a static instance first (fontTools instancer at the wordmark's wght and opsz, for example wght 500 opsz 72), then subset, and ship it as TTF or OTF under the 500 KB bundle. Satori's opentype.js cannot parse variable fonts (vercel/satori #162, #712) and does not accept WOFF2; a plain subset of the variable TTF will throw at runtime, not merely render the wrong weight.
- Keep the static 1200x630 PNG via sharp for the launch card as recommended, and in addition to the flat 1024 master keep the brand mark as separable layers (Mist background, frond and wave foreground) so the Expo/App Store icon can be assembled in Icon Composer as Apple's current HIG expects; the flat PNG remains a valid fallback.
- Record the hex values for Sage and Clay 300/500/600 in the token source alongside the others; the contrast table's ratios for those pairs could only be checked for internal consistency, not recomputed, because the findings never state their hex values.
- Ship the OFL text as a file beside each vendored WOFF2 (fontsource LICENSE or google/fonts OFL.txt): the fontsource WOFF2 files carry only name ID 14 (the OFL URL) and omit name ID 13 (the license text), so the file-level copy is what satisfies OFL condition 2 and FAQ 1.10, exactly as the researcher recommended.

Missing from the research:

- Fontsource (Google Fonts API) builds drop OpenType features that the google/fonts TTFs have: Newsreader loses case, locl, ordn and sups; Figtree loses case, ss01, ss02, subs, sups, sinf, aalt and ordn. The researcher's feature lists were read from the TTFs, not from the files actually recommended for shipping.
- Satori does not support variable fonts at all (opentype.js fvar parsing TypeError, issues #162 and #712), which the ImageResponse finding did not mention; 'subset to a static TTF' needs an instancer step, not a subset.
- next/font/local preloads every file in the src array; the per-route preload cost of the 147 KB Newsreader italic opsz file was not weighed.
- The fontsource wght-only Newsreader file is pinned at opsz 16, not 18, and the Figtree default instance is 300 (Light), not 400; both matter for any tool that renders the default instance (Satori, image generation, design handoff).
- Apple's HIG (alert dated 2026-06-08, 'Refined guidance for Liquid Glass') now describes iOS, iPadOS, macOS and watchOS icons as layered (background plus foreground layers assembled in Icon Composer) and says a flattened image is allowed but gives less control; the icon plan should keep separable layers for the later Expo app.
- The fallback-metrics selection rule (file nearest weight 400, first on ties) was not described, and it determines which file drives adjustFontFallback when roman and italic share one localFont call.
- Hex values for Sage, Clay 300, Clay 500 and Clay 600 are absent from the findings even though they appear in the token recommendations; the build agent needs them to reproduce the contrast table and to write packages/design-tokens/tokens.json.
- Twitter cards have a separate 5 MB limit and twitter-image.alt.txt convention in the same Next.js docs; if a twitter-image is added later it is not covered by the opengraph-image plan.
- No mention that google/fonts name ID 13 (license text) is present in the upstream TTFs but absent from the fontsource WOFF2 files, which is the concrete reason a sidecar OFL.txt is required rather than a nicety.

### product-domain

- confirmed: ACOG CO 700: EDD is LMP plus 280 days; redating bands are more than 5 days before 9 0/7 weeks, more than 7 days before 14 0/7, more than 7 for 14 0/7 to 15 6/7, more than 10 for 16 0/7 to 21 6/7, more than 14 for 22 0/7 to 27 6/7, more than 21 in the third trimester; day-5 embryo EDD is 261 days from transfer; later EDD changes should be rare. Trimesters per ACOG FAQ156: LMP to 13w6d, 14w0d to 27w6d, 28w0d to 40w6d.
  Evidence: https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date
  Note: Checked 2026-10-04 by fetching the page with a browser user agent (ACOG returns HTTP 402 to plain fetchers). Every quoted band is on the page verbatim, including 'before 9 0/7 weeks of gestation, a discrepancy of more than 5 days is an appropriate reason for changing the EDD' and 'Subsequent changes to the EDD should be reserved for rare circumstances'. The page is marked 'Reaffirmed 2025'. The researcher omitted the adjacent sentence: 'Likewise, the EDD for a day-3 embryo would be 263 days from the embryo replacement date.' FAQ156 (Last updated January 2024, Last reviewed March 2026) states the three trimester ranges and the '36 and 3/7 weeks' notation exactly as quoted.
- confirmed: ACOG: normal adult cycle 21 to 35 days, bleeding up to 7 days; abnormal includes cycles over 35 or under 21 days, variation of more than 7 to 9 days, and no period for 3 to 6 months; ACOG CO 651 gives adolescents 21 to 45 days and flow of 7 days or less.
  Evidence: https://www.acog.org/womens-health/faqs/abnormal-uterine-bleeding
  Note: Checked 2026-10-04. FAQ095 (Last reviewed August 2025): 'The normal length of the menstrual cycle is typically between 21 and 35 days. A normal menstrual period generally lasts up to 7 days.' The abnormal list includes 'Menstrual cycles that are longer than 35 days or shorter than 21 days', ''Irregular' periods in which cycle length varies by more than 7 to 9 days', 'Not having a period for 3 to 6 months'. CO 651 (Reaffirmed 2025): 'Menstrual cycle interval: Typically 21-45 days', 'Menstrual flow length: 7 days or less', and 'By the third year after menarche, 60-80% of menstrual cycles are 21-34 days long, as is typical of adults'.
- confirmed: FDA's General Wellness guidance was reissued January 6, 2026, superseding the 2019 version; category 1 claims are weight, fitness, relaxation or stress, mental acuity, self-esteem, sleep, sexual function; the words fertility, menstrual, ovulation, pregnancy and contraception do not appear; FDA's examples page lists tracking a normal baby's sleeping and feeding habits as not a device.
  Evidence: https://www.fda.gov/media/90652/download
  Note: Checked 2026-10-04 by downloading the PDF and running pdftotext. Title page: 'Document issued on January 6, 2026. This document supersedes "General Wellness: Policy for Low Risk Devices" issued on September 27, 2019.' Docket FDA-2014-N-1039, document number 1300013. The category 1 list reads 'weight management, physical fitness, including products intended for recreational use, relaxation or stress management, mental acuity, self-esteem ..., sleep management, or sexual function.' A case-insensitive grep for menstru, fertil, ovulat, pregnan, contracept, reproduct and cycle returned no hits. Section 520(o)(1)(B) is cited as the statutory basis. New in this edition: a section on products using 'non-invasive sensing (e.g. optical sensing) to estimate, infer, or output physiologic parameters (e.g. blood pressure, oxygen saturation ...)' that may be general wellness when non-invasive, not implanted and without disease claims. The examples page (Content current as of 09/29/2022) contains 'Track a normal baby's sleeping and feeding habits' and nothing about menstruation, fertility or pregnancy.
- partially_correct: Natural Cycles is the only FDA-authorized app for contraception (De Novo DEN170052, 21 CFR 884.5370, Class II, product code PYT).
  Evidence: https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K193330
  Note: Checked 2026-10-04. The De Novo facts are confirmed: FDA's De Novo database shows DEN170052, Natural Cycles, Regulation Number 884.5370, Product Code PYT, Decision 'granted (DENG)' on 08/10/2018, and the review PDF (now reachable at the same URL with a browser user agent) reads 'NEW REGULATION NUMBER: 21 CFR 884.5370 CLASSIFICATION: Class II PRODUCT CODE: PYT' and 'intended for women 18 years and older'. The word 'only' is refuted: FDA's 510(k) database lists K193330 'Clue Birth Control', applicant Biowink GmbH, Regulation Number 884.5370, Product Code PYT, Decision 'Substantially Equivalent (SESE)' on 02/18/2021, clinical trial NCT02833922. 'The only FDA-cleared birth control app' is Natural Cycles' own marketing copy on naturalcycles.com, not an FDA statement. Search results also show later Natural Cycles 510(k)s under PYT (K202897, K250561); I could not open the FDA listing for product code PYT (HTTP 503), so those two are unverified. Whether Clue still markets Clue Birth Control in 2026 could not be verified from Clue's site (pages 404 or 403); the clearance record stands regardless. The product implication (never claim contraception) is unchanged and strengthened.
- confirmed: 21 CFR 884.5370 defines 'software application for contraception' as a Class II device with special controls.
  Evidence: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-884/subpart-F/section-884.5370
  Note: Checked 2026-10-04 via the eCFR versioner API (the HTML site redirects non-browser clients to a bot wall). Text current to 2026-10-01: '(a) Identification. A software application for contraception is a device that provides user-specific fertility information for preventing a pregnancy. This device includes an algorithm that performs analysis of patient-specific data (e.g., temperature, menstrual cycle dates) to distinguish between fertile and non-fertile days, then provides patient-specific recommendations related to contraception. (b) Classification. Class II (special controls).' Special controls: clinical performance testing of contraceptive effectiveness, human factors evaluation, software verification and validation with a cybersecurity process, and labeling that states no method is 100% effective, that another method must be used on specified days, factors affecting accuracy, and no STI protection. Source citation: 84 FR 7995, Mar. 6, 2019. FDA's product classification page for PYT confirms 'Submission Type 510(k)', 'Device Class 2', 'GMP Exempt? No'.
- confirmed: Apple App Store Review Guidelines 1.4.1 require a reminder to check with a doctor; 5.1.3 forbids using health data for advertising or marketing and forbids storing personal health information in iCloud.
  Evidence: https://developer.apple.com/app-store/review/guidelines/
  Note: Checked 2026-10-04. 1.4.1: 'Apps should remind users to check with a doctor in addition to using the app and before making medical decisions. If your medical app has received regulatory clearance, please submit a link to that documentation with your app.' 5.1.3(i): health, fitness and medical research data may not be used or disclosed to third parties 'for advertising, marketing, or other use-based data mining purposes other than improving health management, or for the purpose of health research, and then only with permission', and 'You must disclose the specific health data that you are collecting from the device.' 5.1.3(ii): apps 'may not store personal health information in iCloud.' No last-updated date is shown on the page.
- confirmed: Apple Health Cycle Tracking computes the fertile window by subtracting a fixed 13-day luteal phase from the estimated next cycle start, bases period predictions on logged history, pauses predictions for Pregnancy, Lactation or Contraceptive factors, and carries non-contraception and non-diagnosis disclaimers.
  Evidence: https://support.apple.com/en-us/120356
  Note: Checked 2026-10-04. Page 'Track your period with Cycle Tracking - Apple Support', published September 14, 2026: 'The fertile window is calculated by subtracting 13 days (the luteal phase) from the estimated next cycle start date.' 'Period predictions are based on data that you've logged about your previous periods and cycle length ...' Factors named: 'Pregnancy, Lactation, or Contraceptive.' Disclaimers: 'Cycle Tracking should not be used as a form of birth control' and 'Data from Cycle Tracking should not be used to diagnose a health condition.'
- confirmed: CDC publishes LMS files and exact z-score and percentile formulas (unchanged since May 30, 2000); MMWR 2010 recommends WHO charts under 24 months and CDC charts for 2 to 19 years with 2.3rd and 97.7th percentile cutoffs; WHO publications are CC BY-NC-SA 3.0 IGO; WHO fixes the SD beyond plus or minus 2 SD for weight-based indicators.
  Evidence: https://www.cdc.gov/growthcharts/who-data-files.htm
  Note: Checked 2026-10-04. cdc-data-files.htm: 'Z = ((X/M)**L) - 1 / LS', 'Z = ln(X/M)/S' for L=0, 'X = M (1 + LSZ)**(1/L)', 'X = M exp(SZ)', the half-month age convention with birth as the exception, the 9-month male example yielding 7.90 kg, and 'These data remain unchanged from the initial release on May 30, 2000'. MMWR RR-59(9) 2010: WHO standard recommended 'for the assessment of growth among all children aged <24 months, regardless of type of feeding'; CDC charts 'should continue to be used ... in persons aged 2--19 years'; and 'Values of 2 standard deviations above and below the median, or the 2.3rd and 97.7th percentiles (labeled as the 2nd and 98th percentiles on the growth charts), are recommended' (the researcher paraphrased this as a quote). WHO copyright page: 'CC BY-NC-SA 3.0 IGO' and 'WHO publications cannot be used to promote or endorse products, services or any specific organization.' WHO terms of use: acknowledgment with URL required; substantial or non-educational use needs 'explicit, prior authorization in writing'. WHO computation PDF confirms the plus or minus 3 SD restriction and 'Following the same methodology applied to the WHO Child Growth Standards'. Consequential addition the researcher missed: CDC itself hosts the WHO 0 to 24 month data files (weight-for-age, length-for-age, weight-for-length, head circumference-for-age, boys and girls, XLS and CSV, with L, M, S and percentiles; page last reviewed September 2, 2024).
- partially_correct: Zubler et al. 2022: CDC checklists at 12 ages (2, 4, 6, 9, 12, 15, 18, 24, 30 months, 3, 4, 5 years), 159 milestones (down from 216), milestones placed where at least 75% of children achieve them, crawling removed, surveillance not screening.
  Evidence: https://pmc.ncbi.nlm.nih.gov/articles/PMC9680195/
  Note: Checked 2026-10-04. Confirmed in Zubler, Pediatrics 2022;149(3):e2021052138: 'Previously, CDC had 216 milestones across 10 checklists. With the addition of 15- and 30-month checklists and the evidence review process, 159 milestones were included across 12 checklists.' and 'the SMEs agreed that milestones should be easily observed in natural settings and ≥75% of children would be expected to achieve a milestone at a given age.' Also: 'These tools are not intended to replace validated screening tools'. The CDC index page (last reviewed February 17, 2026) links exactly the 12 ages listed and says 'Learn the Signs. Act Early. resources are not a substitute for standardized, validated developmental screening tools.' CDC key-points page: checklists 'should not be used as screening or diagnostic tools to detect developmental delays' and 'Milestones were placed at ages by which at least 75% of children would be expected to exhibit them'. Not confirmed: the word 'crawl' does not appear anywhere in the Zubler article text, and the CDC key-points page does not mention crawling. Crawling's absence from the 2022 checklists is reported by secondary sources (The Conversation, APTA commentary), so the fact is likely true but the attribution and 'quote' are wrong; do not cite Zubler for it.
- partially_correct: NIST SP 811 B.9: inch to centimetre (2.54) and foot to metre (0.3048) are exact; the avoirdupois pound is exactly 0.45359237 kg by the 1959 agreement, so 1 oz is exactly 28.349523125 g.
  Evidence: https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
  Note: Checked 2026-10-04. B.9 marks inch to centimetre '2.54' and foot to metre '3.048 E-01' in boldface, and the page states 'Factors in boldface are exact'. The pound to kilogram row is '4.535 924 E-01' and the ounce to gram row '2.834 952 E+01', neither in boldface, so SP 811 B.9 does not itself establish exactness; the exact 0.45359237 kg definition rests on the 1959 international yard and pound agreement (the researcher's Federal Register citation was not independently opened). Arithmetic check: 0.45359237 kg / 16 = 28.349523125 g, correct. Omission relevant to bottle feeding: B.9 lists 'fluid ounce (U.S.) (fl oz)' to millilitre as '2.957 353 E+01' (exact value 29.5735295625 mL), which the researcher's unit plan does not mention.

Corrected recommendations:

- Pregnancy math: implement eddFromTransfer with both ACOG CO 700 constants, day-5 embryo = transfer date plus 261 days and day-3 embryo = transfer date plus 263 days, and store the embryo age in the provenance record; the redating bands as written are confirmed and need no change.
- Regulatory note: replace 'Natural Cycles is the only FDA-authorized contraception app' with 'contraception apps are a Class II device class (21 CFR 884.5370, product code PYT) with at least two authorized products: Natural Cycles (De Novo DEN170052, granted 2018-08-10) and Clue Birth Control (510(k) K193330, cleared 2021-02-18)', and quote the special controls (clinical performance testing of contraceptive effectiveness, human factors study, labeling that another method must be used on specified days) as the concrete reason Tidefern copy never uses fertile or non-fertile days as contraceptive advice.
- Growth engine: vendor the WHO 0 to 24 month LMS tables from CDC's own hosting (cdc.gov/growthcharts/who-data-files.htm, CSV with L, M, S and percentiles for weight-for-age, length-for-age, weight-for-length and head circumference) rather than WHO's Excel 'expanded tables'; attribute both WHO (as author of the standard) and CDC (as source of the files), keep the WHO permission question open for any paid tier, and record that the files are factual parameter tables. Keep the under-730-days WHO selection, the 2.3rd and 97.7th labels, and the plus or minus 3 SD adjustment for weight-based indicators as planned.
- Milestones data: cite Zubler 2022 only for what it says (216 milestones across 10 checklists became 159 across 12; the at least 75% criterion; surveillance tools do not replace validated screening) and cite the CDC key-points page for 'should not be used as screening or diagnostic tools'; do not attribute 'crawling was removed' to Zubler or CDC. If the app wants to explain why crawling is absent, say only that the 2022 checklists do not include it.
- Units: define the pound as exactly 0.45359237 kg (so 1 oz = 28.349523125 g) citing the 1959 agreement rather than NIST SP 811 B.9, which tabulates rounded values for mass; add the US fluid ounce as exactly 29.5735295625 mL for bottle volumes; store millilitres as integers and round to 0.5 fl oz or 10 mL at display.
- Regulatory note dates: cite the FDA General Wellness guidance as issued January 6, 2026 (docket FDA-2014-N-1039, document 1300013), the FDA examples page as current 09/29/2022, Apple guidelines 1.4.1 and 5.1.3 as checked 2026-10-04, and ACOG CO 700 and CO 651 as 'Reaffirmed 2025'; store the quotes in the repo because acog.org returns HTTP 402 and ecfr.gov redirects non-browser clients, so live fetching in CI will fail.
- Legal posture: add Washington's My Health My Data Act (RCW 19.373) to the product-domain regulatory note: 'reproductive or sexual health information' is named consumer health data, a regulated entity is any entity that conducts business in Washington or targets Washington consumers, and the owner must publish a consumer health data privacy policy, obtain consent before collecting or sharing beyond what is necessary for the requested service, honour deletion requests, and avoid geofencing; small-business status (fewer than 100,000 consumers per year) only delays the start of obligations.

Missing from the research:

- Washington My Health My Data Act (RCW 19.373): the owner is in Washington and the first users are consumers, so the Act applies to cycle, pregnancy and child health data from day one; RCW 19.373.010 lists 'Reproductive or sexual health information', 'Gender-affirming care information', 'Biometric data' and health-service location as consumer health data. The researcher's product-domain findings contain no state law at all.
- CDC hosts the WHO birth to 24 month LMS data files itself (weight-for-age, length-for-age, weight-for-length, head circumference, boys and girls, CSV and XLS, last reviewed 2024-09-02), which changes the vendoring and licensing plan for the infant growth dataset.
- ACOG CO 700's day-3 embryo rule (EDD = transfer plus 263 days); the researcher only captured day-5.
- Clue Birth Control (K193330, Biowink GmbH, cleared 2021-02-18 under 884.5370 PYT) exists in FDA's database; the 'only FDA-authorized app' statement repeats Natural Cycles marketing. Later Natural Cycles 510(k)s (K202897, K250561) appear in search listings but were not verified because FDA's product-code listing returned HTTP 503.
- CDC's 2022 extended BMI-for-age charts (page last reviewed 2024-09-02) add percentiles above the 97th for ages 2 to 19 with a published 'Data File with LMS and Sigma Parameters'; the 2000 CDC BMI files alone cannot place very high BMI values. Relevant if the child chapter ever reports BMI past age 2.
- The 2026 General Wellness guidance adds a section on non-invasive sensing products that estimate physiologic parameters; if Tidefern ever ingests wearable temperature for ovulation estimates, that section plus the Natural Cycles De Novo (temperature-based fertility status for contraception is a device) should both be in the regulatory note.
- US fluid ounce to millilitre factor for bottle feeds (29.5735295625 mL exactly, NIST B.9 lists 2.957 353 E+01); the unit plan covers mass and length only.
- Source access facts for the build agent: acog.org returns HTTP 402 to non-browser clients, ecfr.gov redirects to unblock.federalregister.gov (the eCFR versioner API works with Accept-Encoding gzip), cdc.gov returned 403 to curl and the proxy CA blocks Chromium without configuration, and the FDA review PDFs need a browser user agent. Quotes should be vendored with dates, not fetched at build time.
- Supporting quotes verified but not listed above: Bull et al. 2019 (612,613 cycles, mean 29.3 days, follicular 16.9, luteal 12.4 with 95% CI 7 to 17, cycle length falling 0.18 days per year) is confirmed verbatim; AASM Paruthi 2016 J Clin Sleep Med 12(6):785-786 ranges and the under-4-months exclusion are confirmed; AAP healthychildren.org feeding and diaper figures are confirmed (page updated 4/2/2024); Flo's Anonymous Mode overview (May 2024, OHTTP via Cloudflare relay, IDFA excluded, original account deactivated, no device transfer) and the partner-sharing article (2024-01-22) are confirmed; NHS periods page figures are confirmed but it was last reviewed 2023-01-05 with a review due 2026-01-05, so it may change.

### agent-practices-compliance

- confirmed: Claude Code reads AGENTS.md directly only when no CLAUDE.md or CLAUDE.local.md exists on the path (v2.1.277+); the portable pattern is a CLAUDE.md that imports AGENTS.md with @AGENTS.md; Claude Code never reads .agents/ or AGENTS.override.md; imports load at launch, max depth four, code spans skipped; 200-line target.
  Evidence: https://code.claude.com/docs/en/memory
  Note: Checked 2026-10-04. Page states: 'By default, Claude reads AGENTS.md only when you have no CLAUDE.md in your working directory or above it'; table row 'An AGENTS.md and a CLAUDE.md or CLAUDE.local.md in your working directory or above it | Your CLAUDE.md files only'; 'Reading AGENTS.md directly requires Claude Code v2.1.277 or later'; 'Not read: AGENTS.local.md, AGENTS.override.md, or anything under a .agents/ directory'; 'Keeping the import never makes Claude read AGENTS.md twice, whichever Project instructions value you use'; 'maximum depth of four hops'; 'Import parsing skips Markdown code spans and fenced code blocks'; 'target under 200 lines per CLAUDE.md file ... imported files also load at launch'. Two sharpening details the researcher omitted: Claude also reads a '.claude/AGENTS.md', and the 'Project instructions' setting (claude-md-and-agents-md) is honored only in ~/.claude/settings.json, --settings or managed settings ('Claude Code ignores it in project and local settings files'), so the repository cannot force dual loading; the @AGENTS.md import is the only repo-controlled way to guarantee loading. Also, when AGENTS.md is read through the setting rather than an import, InstructionsLoaded hooks 'Don't fire'.
- confirmed: Claude Code loads project skills only from .claude/skills (plus parents up to the repo root), supports a per-skill folder symlink and dedupes it, and extends the spec with Claude-only frontmatter fields that cause an unexpected-key error elsewhere.
  Evidence: https://code.claude.com/docs/en/skills
  Note: Checked 2026-10-04. Location table lists Project as '.claude/skills/<skill-name>/SKILL.md' and Nested as '<subdir>/.claude/skills/<skill-name>/SKILL.md' (loads 'once Claude works on files there'); no .agents/skills entry. 'A <skill-name> entry in the enterprise, personal, or project location can be a symlink to a directory elsewhere on disk. Claude Code reads SKILL.md from the target and loads the skill once even if several locations point at the same target.' Spec fields: name, description, license, compatibility, metadata, allowed-tools. Nuance: the quoted 'Unexpected key(s) in SKILL.md frontmatter' error is documented for 'packaging or uploading to claude.ai', not as Codex or Cursor behavior; the cross-tool rejection risk is an inference, though staying on the six spec fields remains the safe choice.
- confirmed: Codex walks AGENTS.override.md then AGENTS.md from project root down to cwd, concatenates (later overrides), skips empty files, caps at project_doc_max_bytes 32 KiB by default; Codex scans .agents/skills from cwd up to repo root, follows symlinked skill folders, and does not merge same-named skills.
  Evidence: https://learn.chatgpt.com/docs/agent-configuration/agents-md
  Note: Checked 2026-10-04 (raw HTML). 'Starting at the project root (typically the Git root), Codex walks down to your current working directory ... it checks for AGENTS.override.md, then AGENTS.md, then any fallback names in project_doc_fallback_filenames. Codex includes at most one file per directory.' 'Codex concatenates files from the root down, joining them with blank lines ... Codex skips empty files and stops adding files once the combined size reaches the limit defined by project_doc_max_bytes (32 KiB by default).' Skills page (learn.chatgpt.com/docs/build-skills, resolves at /codex/build-skills): '$CWD/.agents/skills', parents, '$REPO_ROOT/.agents/skills', '$HOME/.agents/skills', '/etc/codex/skills'; 'Codex supports symlinked skill folders and follows the symlink target when scanning these locations'; 'If two skills share the same name, Codex doesn't merge them; both can appear in skill selectors.'
- confirmed: Cursor loads skills from .agents/skills and .cursor/skills natively plus .claude/skills and .codex/skills for compatibility, walks recursively, says nothing about symlinks or duplicates; Cursor treats root AGENTS.md as a plain-markdown alternative to .cursor/rules with nested support.
  Evidence: https://cursor.com/docs/context/skills
  Note: Checked 2026-10-04. Skills page lists project-level '.agents/skills/' and '.cursor/skills/', user-level equivalents, and 'For compatibility, Cursor also loads skills from Claude and Codex directories: .claude/skills/, .codex/skills/, ~/.claude/skills/, and ~/.codex/skills/'; 'Cursor walks the skills root recursively and picks up any SKILL.md it finds'; no symlink or dedupe statement. Rules page (cursor.com/docs/context/rules): 'Place it in your project root as an alternative to .cursor/rules for straightforward use cases'; 'AGENTS.md is a plain markdown file without metadata or complex configurations'; nested files 'automatically applied when working with files in that directory or its children'. Cursor will therefore reach each Tidefern skill via both .agents/skills and the .claude/skills symlink; duplicate display remains undocumented.
- partially_correct: The Agent Skills spec defines six frontmatter fields with the stated limits, optional scripts/, references/, assets/, a 500-line SKILL.md ceiling, one-level relative references, and validation with 'skills-ref validate ./my-skill' suitable for a CI step.
  Evidence: https://agentskills.io/specification
  Note: Checked 2026-10-04. Frontmatter table, name rules ('Max 64 characters ... Must not contain consecutive hyphens ... Must match the parent directory name'), description 'Max 1024 characters', compatibility 'Max 500 characters', allowed-tools '(Experimental)', 'Keep your main SKILL.md under 500 lines', 'Keep file references one level deep', and 'skills-ref validate ./my-skill' are all verbatim. Correction on the tooling: skills-ref is a Python package (pyproject: requires-python >=3.11, deps click and strictyaml, author klazuka@anthropic.com), published on PyPI as skills-ref 0.1.1 with repository github.com/anthropics/agentskills; its README says 'This library is intended for demonstration purposes only. It is not meant to be used in production.' The npm package named 'skills-ref' (0.1.5, author YanchaoMa) is a third-party package, not the reference library. A pnpm CI step must not 'npm install skills-ref'; use 'uvx skills-ref validate <dir>' (or pipx) or a small Node validator implementing the six-field rules.
- confirmed: GitHub Copilot reads AGENTS.md anywhere in the repo (nearest wins) and a root-only CLAUDE.md or GEMINI.md; AGENTS.md is supported by cloud agent and code review on GitHub.com, Copilot Chat and cloud agent in VS Code, cloud agent in JetBrains, Eclipse and Xcode, and Copilot CLI, but not Copilot Chat on github.com.
  Evidence: https://docs.github.com/en/copilot/reference/custom-instructions-support
  Note: Checked 2026-10-04 by parsing the six per-environment tables. GitHub.com: Copilot Chat lists no agent instructions; cloud agent lists 'Agent instructions (using AGENTS.md, CLAUDE.md or GEMINI.md files)'; code review lists 'AGENTS.md, CLAUDE.md, GEMINI.md or REVIEW.md files'. VS Code: Copilot Chat lists 'Agent instructions (using an AGENTS.md file)' (AGENTS.md only, not CLAUDE.md); cloud agent lists all three; code review repo-wide only. Visual Studio, JetBrains, Eclipse, Xcode: only the cloud agent lists agent instructions (JetBrains code review: 'Custom instructions are currently not supported'). The how-to page says 'one or more AGENTS.md files, stored anywhere within the repository ... the nearest AGENTS.md file in the directory tree will take precedence' and 'a single CLAUDE.md or GEMINI.md file stored in the root'. Consequence: a CLAUDE.md alone is invisible to VS Code Copilot Chat, which strengthens AGENTS.md as the canonical file.
- confirmed: Git's core.symlinks defaults to true except where clone or init probes an unsupporting filesystem; otherwise symlinks check out as small plain files with the link text.
  Evidence: https://git-scm.com/docs/git-config
  Note: Checked 2026-10-04. Verbatim: 'core.symlinks If false, symbolic links are checked out as small plain files that contain the link text. git-update-index[1] and git-add[1] will not change the recorded type to regular file. Useful on filesystems like FAT that do not support symbolic links. The default is true, except git-clone[1] or git-init[1] will probe and set core.symlinks false if appropriate when the repository is created.' Claude Code memory page adds the Windows caveat verbatim as quoted by the researcher.
- confirmed: The Claude Fable 5.1 prompting page provides the autonomy block ('You are operating autonomously...'), says the opening sentence carries much of the effect, the scope block on pre-existing bugs, progress-text guidance, the batching nudge, and the six-item compaction preservation list.
  Evidence: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
  Note: Checked 2026-10-04. Page exists (title 'Prompting Claude Fable 5.1'). Found verbatim: 'You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task ... Stop only for destructive actions or genuine scope changes the user must decide'; 'Before ending your turn, check your last paragraph ... Do not stop because the context or session is long'; 'The opening sentence, which tells the model the user isn't watching, carries much of the effect. Keep it as written. If your product needs the model to stop for specific confirmations, add a sentence after it listing them'; 'If, while working or testing, you find a pre-existing bug ... report it as a follow-up in your summary'; 'Before you start, say in a line what you're about to do'; 'First privately list what you need next; then request every item that doesn't depend on another's result in this one response'; compaction 'Be sure to preserve: (1) ... (6)'. Also present and useful for the build prompt: the scope block adds 'Commit tests only where the task asks for them or this repository already keeps tests for this kind of change' and 'Where the task is ambiguous, implement the reading its wording and the surrounding code most directly support, state that assumption in your summary'.
- confirmed: NY S929 was vetoed December 19, 2025; S9269/A10357 passed the Senate June 3, 2026 and the Assembly June 4, 2026, and as of October 4, 2026 has not been delivered to the governor, signed or vetoed.
  Evidence: https://www.nysenate.gov/legislation/bills/2025/S9269
  Note: Checked 2026-10-04 against the raw page HTML. Actions include 'passed senate', 'substituted for a10357', 'passed assembly', 'returned to senate'; no 'delivered to governor', 'signed chap' or 'vetoed' action exists. In the status graphic the steps through 'Passed Assembly' and 'Passed Senate' carry the class nys-bill-status-passed while the 'Delivered to Governor' step carries only nys-bill-status-no-group (not reached). A WebFetch summary of the page wrongly reported 'Delivered to Governor'; the markup refutes that summary and supports the researcher. S929 veto on 2025-12-19 not independently re-opened; medium confidence on that sub-claim.
- confirmed: The FTC Health Breach Notification Rule (16 CFR 318, amended effective July 29, 2024) covers health app developers whose PHR can draw from multiple sources, treats unauthorized acquisition including unauthorized disclosure as a breach, requires individual notice within 60 calendar days, FTC notice contemporaneously for 500 or more and annually for fewer, with civil penalties up to $53,088 per violation, unchanged for 2026.
  Evidence: https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=318
  Note: Checked 2026-10-04 via the eCFR API (point in time 2026-10-01; the HTML site redirects bots to unblock.federalregister.gov). 'Source: 74 FR 42980, Aug. 25, 2009, as amended at 89 FR 47054, May 30, 2024'; 'Personal health record (PHR) means an electronic record of PHR identifiable health information on an individual that has the technical capacity to draw information from multiple sources'; 'Breach of security means ... acquisition of such information without the authorization of the individual. Unauthorized acquisition will be presumed to include unauthorized access ... unless the vendor ... has reliable evidence showing that there has not been, or could not reasonably have been, unauthorized acquisition'; 318.4(a) 'without unreasonable delay and in no case later than 60 calendar days'; 318.4(b) 500 or more 'contemporaneously', fewer than 500 'annually ... no later than 60 calendar days following the end of the calendar year'; 318.7 'civil penalties (as adjusted for inflation pursuant to § 1.98)'. FTC guidance page: 'a civil penalty of up to $53,088 per violation' (page edited January 2025). 91 FR 58446 (govinfo, effective September 15, 2026): FTC 'civil penalty amounts will remain unchanged during 2026' and 'will continue to apply the 2025 civil penalty levels'. Omitted by the researcher: 318.5(a)(3) media notice to 'prominent media outlets serving a State or jurisdiction' when 500 or more residents of that state are affected, and 318.4(c) burden of proof on the vendor 'demonstrating that all notifications were made as required'.
- partially_correct: RCW 19.373 requires the homepage policy link (19.373.020), consent for collection and separate consent for sharing (19.373.030), deletion within 45 days plus one extension with a six-month backup ceiling and third-party notification (19.373.040), processor contracts (19.373.050), sale authorization (19.373.060), geofence ban (19.373.080) and per se CPA violation (19.373.090).
  Evidence: https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true
  Note: Checked 2026-10-04. Substantive quotes are accurate, but two section numbers are wrong: processors are RCW 19.373.060 ('a processor may process consumer health data only pursuant to a binding contract'), sale authorization is RCW 19.373.070 ('unlawful for any person to sell or offer to sell consumer health data ... without first obtaining valid authorization'), and RCW 19.373.050 is 'Data security practices' (restrict access to employees, processors and contractors 'for which access is necessary', plus reasonable administrative, technical and physical security). Also material and omitted: 19.373.030(1)(a)(ii) and (b)(ii) permit collection and sharing without consent 'To the extent necessary to provide a product or service that the consumer ... has requested', which shapes the consent model (lawful basis per data category, not a blanket opt-in); the consent definition excludes acceptance of general terms and deceptive designs; 19.373.040(1)(a) grants access to 'a list of all third parties and affiliates with whom the regulated entity ... has shared or sold the consumer health data and an active email address or other online mechanism' to contact them; 19.373.040(1)(h) requires a conspicuous appeal process with a written decision within 45 days and, on denial, information on contacting the attorney general; 19.373.020 lists required policy contents and bars collecting undisclosed categories or contracting processors inconsistently with the policy. 'Regulated entity' is any entity that 'Conducts business in Washington' and determines purposes and means, so Tidefern is covered from day one regardless of user count; 'Consumer' includes any Washington resident, so children's entries are consumer health data.
- confirmed: Vercel's DPA (Last Updated March 17, 2026; Effective March 31, 2026) binds on entering the Agreement, deems SCCs signed, applies only to Pro and Enterprise, and the Hobby plan is non-commercial personal use only with 1 hour of runtime logs.
  Evidence: https://vercel.com/legal/dpa
  Note: Checked 2026-10-04. DPA: 'Last Updated March 17, 2026', 'Effective Date March 31, 2026', 'This Addendum applies to Vercel's Processing of Personal Data as a Processor under the Agreement for Customers who are on Enterprise and Pro plans', 'shall become legally binding upon Customer entering into the Agreement or upon execution', SCCs 'deemed to have signed', subprocessors at security.vercel.com. Hobby docs (last_updated 2026-09-14): 'the Hobby plan restricts users to non-commercial, personal use only'; Runtime Logs '1 hour of logs' Hobby, '1 day of logs' Pro; Drains '-' on Hobby and 'Configurable (not on a trial)' on Pro. Fair use page (2026-09-14): 'Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan'; commercial usage includes 'Any method of requesting or processing payment from visitors of the site' and 'Receiving payment to create, update, or host the site'; 'Asking for Donations does not fall under commercial usage'. Two private first users with no payments could arguably stay on Hobby, but the DPA gap stands, so Pro is still right once any external user is onboarded.
- confirmed: Neon is now under Databricks: the Neon Product Specific Schedule (Last Updated August 5, 2026) is accepted by accessing the service under the Databricks MCSA, which incorporates the Databricks DPA; HIPAA BAA is self-serve on the Scale plan and irreversible per project.
  Evidence: https://neon.com/platform-terms
  Note: Checked 2026-10-04. neon.com/dpa resolves (after redirect) to neon.com/platform-terms#3.4. Schedule: 'Product Specific Schedule (Neon)', 'Last Updated: August 5, 2026', parties 'Databricks, Inc., the parent company of Neon, LLC', 'By accessing the Platform Services, Customer agrees to the terms of this Schedule', subject to 'the then-current Databricks Master Cloud Services Agreement located at https://www.databricks.com/legal/mcsa', 'The Platform Services use Grafana Labs located in the United States for infrastructure services in addition to all other listed subprocessors located at https://www.databricks.com/legal/databricks-subprocessors'. HIPAA page: 'HIPAA compliance as a self-serve feature available to customers on the Scale plan'; 'Once HIPAA compliance is enabled on a project, it cannot be disabled'; 'currently available at no additional cost. When we begin charging for HIPAA support, a 15% surcharge will be added'. MCSA and Databricks DPA text not re-opened by me; the researcher's quotes are consistent with the schedule's references.
- confirmed: WCAG 2.2 is a W3C Recommendation (5 October 2023, updated 12 December 2024) adding nine criteria; 2.5.8 Target Size (Minimum) AA requires 24 by 24 CSS pixels with Spacing, Equivalent, Inline, User agent control and Essential exceptions; 4.1.1 Parsing is removed; 3.3.8 Accessible Authentication (Minimum) is AA.
  Evidence: https://www.w3.org/TR/WCAG22/
  Note: Checked 2026-10-04. TR header: 'W3C Recommendation 12 December 2024'; table of contents shows '4.1.1 Parsing (Obsolete and removed)', '3.3.8 Accessible Authentication (Minimum)'. new-in-22 page: 'WCAG 2.2 was published as a W3C Recommendation web standard on 5 October 2023', nine new success criteria, 2.4.11, 2.5.7, 2.5.8 and 3.3.8 all listed at AA with the quoted one-line summaries. Understanding page for 2.5.8: 'The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:' followed by the five exceptions verbatim (Spacing uses 'a 24 CSS pixel diameter circle is centered on the bounding box of each').
- confirmed: EDPB Guidelines 2/2023 v2.0 were adopted 7 October 2024 and confirm Article 5(3) ePrivacy applies to any storage or access regardless of personal data; Cloudflare's Customer DPA is Version 6.4 effective April 3, 2026; GitHub's DPA is Version October 2025 with SCCs and UK Addendum; Resend's subprocessor list (2026-08-27) has 22 entries including AWS, Anthropic, RunPod, Google and Vercel.
  Evidence: https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
  Note: Checked 2026-10-04. EDPB PDF front matter: 'Version 2.0', 'Adopted on 7 October 2024'. Cloudflare DPA page: 'Version 6.4, effective April 3, 2026', subprocessors at cloudflare.com/gdpr/subprocessors/ with 30 days' notice, EU SCCs Modules Two and Three, UK Addendum deemed executed. GitHub DPA: 'Version: October 2025', 'forms part of the GitHub Customer Agreement', 'You are the Controller of Customer Personal Data, and we are the Processor', SCCs and UK Addendum in section 7.B. Resend subprocessors: 'Last Updated 2026-08-27', 22 entries, including 'Amazon Web Services, Inc. (USA) - Third party hosting and sending provider', 'Anthropic, PBC (USA) - Artificial Intelligence', 'RunPod, Inc. (USA) - Self-hosted LLMs', 'Google, Inc. (USA) - Email communications and analytics', 'Vercel Inc. (USA) - Server hosting'. Not re-checked: Resend DPA '90 days' deletion clause and WP29 Opinion 04/2012 quotes (plausible, medium confidence).

Corrected recommendations:

- Keep AGENTS.md as the canonical root instruction file with a CLAUDE.md whose first line is @AGENTS.md. Add two reasons the research missed: the repository cannot force Claude Code's claude-md-and-agents-md setting (it is ignored in project and local settings files), and VS Code Copilot Chat reads AGENTS.md but not CLAUDE.md. Keep the whole root-to-cwd AGENTS.md chain under Codex's 32 KiB default (project_doc_max_bytes) and under Claude Code's 200-line warning; for per-package guidance prefer nested <subdir>/.claude/skills (lazy-loaded by Claude Code) and skills over nested AGENTS.md files.
- For the skills CI check, do not add the npm package 'skills-ref' (third-party, different author). Run the official Python reference tool with 'uvx skills-ref validate <skill-dir>' (PyPI skills-ref, repo anthropics/agentskills, Python 3.11+) while noting its README calls it demonstration-only, or write a small Node script in the monorepo that enforces the six spec fields, name constraints (1 to 64 chars, lowercase alphanumerics and single hyphens, equals directory name), description 1 to 1024 chars, compatibility up to 500 chars, and the 500-line SKILL.md ceiling. Keep the separate symlink-resolution check for .claude/skills/<name> -> ../../.agents/skills/<name>.
- Correct the MHMDA citations in the architecture memo and plan: data security practices are RCW 19.373.050, processor contracts RCW 19.373.060, valid authorization to sell RCW 19.373.070, geofencing 19.373.080, CPA linkage 19.373.090, exemptions 19.373.100.
- Replace 'opt-in consent for collection' with a per-category lawful-basis model: record for each data category whether it is 'necessary to provide the product or service the consumer requested' (RCW 19.373.030(1)(a)(ii)) or collected under a specified-purpose consent, and keep sharing consent separate and distinct. Treat acceptance of terms of service, hovering, muting or closing content as non-consent, and audit the UI against the deceptive-design exclusion. Store consent records with the specified purpose text and timestamp.
- Add these MHMDA day-one build items that the research omitted: (1) an access response that includes the list of all third parties and affiliates with whom data was shared plus an active email or online contact for each (empty list acceptable in v1 but the response path must exist); (2) a conspicuous appeal process for refused requests, with a written decision within 45 days and attorney general contact information on denial; (3) RCW 19.373.050 access restriction (role-based access, documented need) and reasonable administrative, technical and physical safeguards; (4) a consumer health data privacy policy that lists categories collected, purposes, categories of sources, categories shared, the third parties shared with, and how to exercise and withdraw rights, with a rule that new categories require a policy update and affirmative consent before collection.
- Extend the FTC HBNR breach runbook: add media notice to prominent outlets when 500 or more residents of one state are affected, keep records that satisfy the vendor's burden of proof that notices were sent, and design access logging so the presumption that unauthorized access equals acquisition can be rebutted with 'reliable evidence'. Keep the $53,088 per-violation figure (2025 level, held for 2026 per 91 FR 58446, effective 2026-09-15).
- Vendor decisions stand: Vercel Pro before any external user (DPA covers Pro and Enterprise only; Hobby is non-commercial and has no Drains), Neon under the Databricks MCSA plus DPA with Databricks, Inc. recorded as the contracting party and Grafana Labs listed as an extra subprocessor, Cloudflare DPA v6.4, GitHub DPA October 2025, Resend with generic email content. Add to the processor register the URLs to watch: security.vercel.com, databricks.com/legal/databricks-subprocessors, cloudflare.com/gdpr/subprocessors, github.com/subprocessors, resend.com/legal/subprocessors.
- In the build prompt, paste the Fable 5.1 autonomy block verbatim and follow its own advice to append one sentence listing the confirmations still required (production migrations, data deletion, force pushes, spending, any new third-party data recipient). Include the scope block's test guidance ('Commit tests only where the task asks for them or this repository already keeps tests for this kind of change') alongside the harness rule that existing tests are never removed or weakened.

Missing from the research:

- RCW 19.373.040(1)(a) access right: the consumer may obtain 'a list of all third parties and affiliates with whom the regulated entity ... has shared or sold the consumer health data and an active email address or other online mechanism' to contact them. This needs a per-user sharing ledger even if sharing is off in v1.
- RCW 19.373.040(1)(h) appeal process: must be 'conspicuously available', decided in writing within 45 days, and on denial must tell the consumer how to contact the attorney general. Not in any day-one list.
- RCW 19.373.050 data security practices (access restricted to those for whom it is necessary; reasonable administrative, technical and physical safeguards) was mislabeled as the processor section and its content was not covered.
- RCW 19.373.030 'necessary to provide a product or service that the consumer ... has requested' exception for both collection and sharing, which changes the consent model from blanket opt-in to a per-category lawful basis, and the consent definition's exclusion of general terms acceptance and deceptive designs.
- RCW 19.373.010 'Regulated entity' covers any legal entity that 'Conducts business in Washington' and determines purposes and means; the small-business threshold only ever delayed effective dates (both passed in 2024). A solo Washington developer is covered from the first user. 'Consumer' includes any Washington resident, so a child's health data entered by a parent is the child's consumer health data; the memo should state who gives consent for a child's record and how deletion of a child's record is handled.
- 16 CFR 318.5(a)(3) media notice (500 or more residents of a state), 318.4(c) burden of proof on the vendor, and the 318.2 presumption that unauthorized access equals acquisition unless rebutted with reliable evidence; all three drive logging and record-keeping design.
- Claude Code honors the Project instructions setting only from user, --settings or managed settings ('Claude Code ignores it in project and local settings files'), and InstructionsLoaded hooks do not fire for an AGENTS.md read through the setting; both are reasons the @AGENTS.md import is the only repo-controlled guarantee.
- Copilot support detail: VS Code Copilot Chat supports AGENTS.md but not CLAUDE.md; GitHub.com code review also accepts a REVIEW.md; JetBrains code review supports no custom instructions. A CLAUDE.md-only repo would be invisible to the most common Copilot surface.
- skills-ref distribution: the official validator is a Python package (PyPI skills-ref 0.1.1, Anthropic author, repo anthropics/agentskills) whose README says it is 'intended for demonstration purposes only'; the npm package of the same name is unrelated. The researcher's CI recommendation named the command without the installation path, which would have led a pnpm-based build agent to the wrong package.
- Vercel Hobby lacks Drains entirely and Pro trials cannot configure them, so any log-drain plan already presumes a paid Pro team; Vercel's commercial-use definition hinges on payments, advertising or paid development, so the two-private-user phase is arguably non-commercial but still outside the DPA.
- Neon HIPAA: 'When we begin charging for HIPAA support, a 15% surcharge will be added to your monthly invoice'; irrelevant unless Tidefern later becomes a business associate, but worth recording so the Scale plan is not chosen for the BAA alone.
- Claude Code nested skills ('<subdir>/.claude/skills/<skill-name>/SKILL.md' loads 'once Claude works on files there') are a documented alternative to nested AGENTS.md for apps/web and packages/api guidance that the research did not weigh.

## Completeness critique

<a id="completeness-critique"></a>

### Gaps

- Turborepo strict environment mode versus Phase 1 secrets: turbo.json declares only NODE_ENV, VERCEL_ENV, VERCEL_URL, SITE_URL, SITE_INDEXABLE and CI in globalEnv, and `pnpm check` plus CI run `turbo run lint typecheck test build`. The installed Turborepo 2.11.7 docs (node_modules/turbo/docs/reference/configuration.mdx, `envMode` Default: "strict") say Strict Mode filters task runtimes to only the variables in `env` and `globalEnv`, so DATABASE_URL, DATABASE_URL_UNPOOLED, BETTER_AUTH_SECRET, TIDEFERN_KEK_V1, LOG_HMAC_SECRET, RESEND_API_KEY, CRON_SECRET, E2E_MAIL_CAPTURE, VERCEL_PROJECT_PRODUCTION_URL and VERCEL_BRANCH_URL will be invisible to `next build`, Vitest and any turbo-run script the moment Phase 1 needs them. The docs warn this does not guarantee failure: an app that tolerates a missing variable can hit cache with the wrong configuration. No dimension and no section of docs/ARCHITECTURE.md mentions env, passThroughEnv or .env inputs. Check: Read node_modules/turbo/docs/crafting-your-repository/using-environment-variables.mdx (Strict Mode, Passthrough variables, Platform Environment Variables, Handling .env files). Add per-task `env` (hash-affecting, for example SITE_INDEXABLE on build) and `passThroughEnv` (secrets the task only needs at runtime), add `.env*` to the build task `inputs`, and note that Vercel compares project variables against turbo.json and warns about missing ones (disable with TURBO_PLATFORM_ENV_DISABLED only deliberately). Decide whether the Vercel build command goes through turbo at all (see the build command contradiction).
- Vercel build command working directory and the automatic production migration: Architecture 3.4 and the runbook set the Vercel build command to `pnpm db:migrate && next build` with Root Directory `apps/web`, but `db:migrate` is a root script and apps/web/package.json has no such script, so the command fails as written unless it is `pnpm -w db:migrate`. More seriously, running migrations inside every production build means a merged contract migration (DROP, rename, type change) executes automatically, which contradicts the build prompt's human-only rule for production migrations that drop or rewrite data, and Vercel treats any change outside the workspace definition (docs, .github, root configs) as global, so docs-only commits also trigger the migration step. Check: Vercel limits page https://vercel.com/docs/limits (last_updated 2026-09-16) and the record's own note that global changes deploy every project. Decide one mechanism: a `MIGRATE_ON_BUILD` guard plus a migration linter that refuses destructive SQL in the automatic path, or run production migrations from a `workflow_dispatch` job the owner triggers, keeping build-time migration for previews only. Fix the cwd (`pnpm -w db:migrate` or a `web` script that calls the root runner).
- Neon preview branch parent: integrations branch from the default branch, not from `staging`: Architecture 7.5, task A4 and the runbook rely on Neon's Vercel integration creating preview branches from a seeded `staging` branch so production data never reaches a preview. Neon's docs do not offer that: the Vercel-managed integration page says preview branching creates a copy-on-write branch for every preview deployment with production as the parent, and the Neon-managed integration page says the preview branch "is a clone of your project's default branch (`main`)" with no documented parent selection. As written, every preview would fork real household health data, contradicting "Production data never leaves production", and the record's "reset from parent" refresh of the dev branch would also copy production rows into the shared branch. Check: https://neon.com/docs/guides/vercel-managed-integration and https://neon.com/docs/guides/neon-managed-vercel-integration (checked 2026-10-04; confidence high on the parent statement, medium on whether a hidden setting exists). Options to evaluate: make `staging` the Neon default branch and serve production from a non-default branch (verify what Neon ties to the default branch: deletion protection, compute settings, and that the integration's production variables then point where intended); or accept production-parent previews behind Vercel Authentication with encrypted free text and record it as a privacy decision; or create per-PR branches via the Neon API before Vercel builds and inject URLs with the Vercel REST API (the record rejected the timing). Also note the Vercel-managed integration keeps preview branches until the deployment is removed (Vercel retention defaults can hold them for months) while Launch allows 10 branches.
- Which role the injected preview DATABASE_URL uses versus the SQL-created `tidefern_app`: Section 7.2 has the app connect as `tidefern_app`, a role created by SQL so it never joins `neon_superuser` (which carries BYPASSRLS in projects created after 2023-08-15). Neon's Vercel integrations build connection strings from a role chosen at setup ("Choose your Neon project, database, and role"), and Neon's role docs say SQL-created roles get only basic public privileges and say nothing about Neon knowing their passwords or offering them in integrations. So the injected preview `DATABASE_URL` will almost certainly be a console role with BYPASSRLS, and previews would run with RLS bypassed unless `withActor()` always executes `SET LOCAL ROLE tidefern_app`. The same uncertainty is already listed in section 21 for production (B10) but not for previews. Check: https://neon.com/docs/manage/roles (quotes: "Your Postgres role and roles created in the Neon Console, API, and CLI are granted membership in the neon_superuser role"; "Roles created with SQL ... are only granted the basic public schema privileges"). Decide now that `withActor()` unconditionally runs `SET LOCAL ROLE tidefern_app` and that `withSystem()` is the only owner-role path, so correctness does not depend on which URL an integration injects; then make B10 record `current_user` and `rolbypassrls` on a preview branch as well as production.
- Preview KEK versus seeded ciphertext, and who seeds previews: Section 7.5 gives previews "a preview KEK" while their database is a fork of `staging`, whose seeded notes were encrypted under the staging KEK and recorded as `kek_version` V1. Those notes cannot be decrypted on a preview and the version label collides. Section 7.5 also says previews are "migrated and seeded by the build command", but 3.4 and the runbook define the build command as `pnpm db:migrate && next build` with no seed, and seeding on top of an already seeded fork must be idempotent. Check: Decide one of: previews reuse the staging KEK value in Vercel's preview scope (one secret, one `kek_version`), or previews fork an unseeded schema-only or empty branch and seed at build time with the preview KEK (then add `pnpm db:seed` to the preview build command and make the seed idempotent). Neon schema-only branches (https://neon.com/docs/guides/branching-schema-only) cannot be parents of data branches, so they cannot be the preview parent themselves.
- CI topology for browser tests against the production build: Section 15 says browser tests sign in through seeded users and a mail capture endpoint, and names an integration job against postgres:18 with NODE_ENV=production. ci.yml has one `verify` job, no service container, no migrate or seed step and no test env (E2E_MAIL_CAPTURE, a fixed test KEK, BETTER_AUTH_SECRET, LOG_HMAC_SECRET). `next start` cannot talk to PGlite, so the e2e step cannot run once auth lands. Better Auth's production rules allow 3 sign-ins per 10 seconds, which the config respects only through `workers: 1` and shared storageState. deploy-verify.yml runs `@smoke` against production, where no seeded users exist, so `@smoke` must stay anonymous-only and the preview smoke can sign in only if the preview database is seeded. Check: Add a `postgres:18.6` service container (data-auth pinned 18.6; ci.yml should match), a migrate and seed step before `pnpm build`, non-secret test values as job env (declared in turbo.json passthrough), and a rule in the Playwright config that `@smoke` tests never authenticate. Verify `next start` loads `.env.local` in CI or pass env explicitly to the webServer command.
- A frozen "today" for deterministic seeds and assertions: B9 seeds dates relative to a frozen today, but `todayIn()` in packages/core reads the real clock on the server, so prediction copy such as "between Oct 7 and Oct 9" drifts every day and e2e assertions rot. Playwright's clock API controls only the browser. Check: Add a test-only override (for example TIDEFERN_FAKE_NOW, refused when VERCEL_ENV is production exactly like E2E_MAIL_CAPTURE) read by `todayIn()`, or generate seeds at test time relative to the real date and compute expected strings in the test. Record which in architecture 15 and 17.1.
- Error reporting hook and the explicit analytics exclusion: Section 19 promises 5xx counts per route in `product_events` and section 9.1 forbids health data in logs, but nothing names the mechanism. Next.js 16.3.8 documents `instrumentation.ts` with `onRequestError(error, request, context)` for render, route, action and proxy errors; its `request.path` is "resource path, e.g. /blog?name=foo" (includes the query string) and `request.headers` includes cookies, so a naive handler would log exactly what the rule forbids. Separately, Vercel Web Analytics stores URL, dynamic path, referrer, filtered query params and geolocation per data point, so `@vercel/analytics` 2.0.1 and `@vercel/speed-insights` 2.0.0 must be named as excluded, not just "third-party analytics". Check: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation (version 16.3.8, lastUpdated 2026-06-09): record only `context.routePath`, `context.routeType`, a status and the error `digest`, never `request.path` or headers. https://vercel.com/docs/analytics/privacy-policy (last_updated 2026-06-26) for the data-point table. Add both exclusions to architecture 9.1.
- Vercel 4.5 MB body limit: uploads, exports and image delivery: Vercel Functions limits (last_updated 2026-08-24): "The maximum payload size for the request body or the response body of a Vercel Function is 4.5 MB" with a 413. The KB on bypassing it says streamed responses are exempt and recommends direct client uploads. Section 9.1's fallback "uploads proxy through the API" therefore cannot carry phone photos (routinely 3 to 12 MB), so direct-to-R2 presigned PUT and a `connect-src` exception for one R2 origin are mandatory, not optional. The on-demand export in section 11 must be streamed, not buffered. For Phase 2 photo display, next/image over presigned URLs would miss Vercel's image cache on every request (the URL changes), consuming the Hobby 5K transformations per month, after which Vercel returns 402 and alt text. Check: https://vercel.com/docs/functions/limitations, https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions, https://developers.cloudflare.com/r2/api/s3/presigned-urls/ (PUT supported, expiry 1 s to 7 days, CORS rules required for browser use), https://vercel.com/docs/image-optimization/limits-and-pricing (last_updated 2026-08-11). Since `photo_variants` are generated server-side, plan `unoptimized` images served through short-lived presigned GETs.
- Rollback mechanics on Hobby: The runbook's rollback is one line ("promote the previous production deployment"). Vercel's Instant Rollback page (last_updated 2026-07-07) says Hobby can roll back only to the immediately previous deployment, that after a rollback Vercel turns off auto-assignment of production domains so new pushes to main do not go live until "Undo Rollback" or `vercel promote`, that cron jobs revert to the rolled-back deployment's state, and that environment variable changes are not applied. An autonomous agent merging after an owner rollback would see green CI and a production that never updates. Check: https://vercel.com/docs/instant-rollback. Add the undo step, the cron reversion and the one-step Hobby limit to docs/LAUNCH_RUNBOOK.md, and have the deploy-verify production check compare the deployed commit SHA against main.
- Vercel WAF rate limiting is available on Hobby: Architecture 6.1 and 19 defer Vercel Firewall rate limits to the Pro upgrade. Vercel's WAF rate limiting page (last_updated 2026-08-28) states "WAF Rate Limiting is available on all plans" with Hobby limits of 1 rate-limit rule per project, IP and JA4 keys, a 10 s to 10 min window and 1,000,000 allowed requests included, plus up to 3 custom firewall rules. One free rule on `/api/auth/*` from Phase 1 is a real defense-in-depth gain for a public sign-in form. Check: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting. Add the single Hobby rule to the runbook's Vercel section and to architecture 6.1; keep per-actor database rate limiting as the primary control.
- HSTS scope, CAA for Let's Encrypt, and the reserved /.well-known path: Section 9.3 lists HSTS as a mitigation but configures nothing. Vercel sets `Strict-Transport-Security: max-age=63072000` on custom domains without includeSubDomains or preload (vercel.app hosts get both). Vercel issues certificates through Let's Encrypt with HTTP-01, so a CAA record that does not authorize letsencrypt.org breaks issuance and renewal; the runbook says "the authorities Vercel lists" without naming one. The /.well-known path "is reserved and cannot be redirected or rewritten", which constrains the www redirect and the proxy matcher that the record already plans to exclude. Check: https://vercel.com/docs/cdn-security/encryption (last_updated 2026-09-15), https://vercel.com/docs/domains/working-with-ssl (last_updated 2026-09-16) and the CAA entry under https://vercel.com/docs/domains/troubleshooting. Decide whether to add includeSubDomains and preload in next.config.ts headers() given the possible `api.` subdomain and email-related subdomains. The Cloudflare KB (https://vercel.com/kb/guide/cloudflare-with-vercel, updated 2026-10-02) now only says not to reverse-proxy Vercel; DNS-only records remain the right call.
- Protection bypass cookie for in-browser tests: apps/web/playwright.config.ts sends only `x-vercel-protection-bypass`. Vercel's Playwright example also sets `x-vercel-set-bypass-cookie: 'true'` so follow-up in-browser requests carry the authorization as a cookie, and notes the secret is exposed to deployments as VERCEL_AUTOMATION_BYPASS_SECRET and that regenerating it invalidates previous deployments. Missing the cookie is a classic source of flaky protected-preview runs. Check: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation (last_updated 2026-09-16). Add the second header; remember the smoke test secret must be rotated together with a redeploy.
- Email in previews and the Resend free tier: Section 7.5 says previews use the console transport; section 17.1 and the runbook store RESEND_API_KEY for preview and production. Resend's Free plan is 3,000 emails per month, 100 per day, 30-day retention; Resend provides `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev` and `suppressed@resend.dev` (with `+label` support) for safe sends. A preview that can send real mail from seeded personas is both a privacy and a quota problem. Check: https://resend.com/pricing and https://resend.com/docs/dashboard/emails/send-test-emails (checked 2026-10-04). Pick one preview policy: console transport (then remove RESEND_API_KEY from preview scope) or Resend restricted by an env allowlist to `*@resend.dev` recipients. Also confirm the open question in section 21 about Resend AI features before any send.
- Import boundary tooling and commit-message gates: AGENTS.md says ESLint enforces package boundaries, and 7.2 wants a rule forbidding `db` outside `withActor()`/`withSystem()`; `no-restricted-imports` cannot express a call-site rule, and no tool checks undeclared workspace dependencies. The em dash rule applies to commit messages but `prose:check` scans files only. Check: Installed Turborepo docs node_modules/turbo/docs/reference/boundaries.mdx: `turbo boundaries` (experimental in 2.11.7) flags imports outside a package directory and packages not declared in package.json, with tag rules (`internal`/`public`) in turbo.json; eslint-plugin-boundaries 7.2.0 (peer eslint >=6) is the alternative; the `db`-outside-`withActor` rule needs a small custom ESLint rule. Add a CI step `git log --format=%B origin/<base>..HEAD` piped to the em dash check; lefthook 2.1.16 or simple-git-hooks for a local commit-msg hook; @commitlint/cli 21.2.3 only if conventional subjects are wanted.
- global-error.tsx and the error.tsx prop name: apps/web/src/app has error.tsx and not-found.tsx but no global-error.tsx, so an error thrown in the root layout (theme script, fonts, SoundProvider) has no boundary. Next.js 16.3.8 requires global-error to render its own html and body, and its examples pass `{ error, retry }` to error boundaries. Check: https://nextjs.org/docs/app/getting-started/error-handling (version 16.3.8, lastUpdated 2026-06-10). Add global-error.tsx with the nonce-compatible minimal shell and check the existing error.tsx signature against the `retry` prop.
- PWA installability and offline states: A manifest exists, but `start_url`, `scope` and `display` for an authenticated app are undecided, G4 supplies the 192 and 512 icons, and section 12.2 promises designed offline states without a mechanism. Next's PWA guide says installation needs only a valid manifest plus HTTPS (no service worker), advises against `beforeinstallprompt` buttons, and points to the experimental `useOffline` hook for connectivity-aware UI; a service worker, if ever added, needs its own headers and a `script-src 'self'` policy that the nonce CSP must accommodate. Check: https://nextjs.org/docs/app/guides/progressive-web-apps (version 16.3.8, lastUpdated 2026-07-30). Set `start_url: /today`, `display: standalone`, `scope: /`, keep the light page color as the record says, and decide Phase 1 offline handling as `navigator.onLine` plus honest pending states rather than a service worker.
- Lighthouse and bundle budget tooling: J2 and section 15 state budgets (1.5 MB initial transfer, 200 KB compressed first-route JavaScript, LCP 2.5 s, CLS 0.1) but name no runner or enforcement, so the numbers are aspirations an agent can report without measuring. Check: lighthouse 13.5.0 CLI with `--chrome-flags` or `--chrome-path` pointed at the Playwright Chromium, or @lhci/cli 0.15.1 with a `budget.json` assertion file; @next/bundle-analyzer 16.3.8 for the JavaScript budget. Record tool version, device profile and throttling with every number, as the build prompt already demands.
- KEK custody and the "build only" variable scope: The Phase 1 KEK lives only as a sensitive Vercel variable, which Vercel stores in an unreadable form; losing the project or the variable makes every encrypted note unrecoverable, and the runbook's rotation table has no escrow step. Section 17.1 also scopes DATABASE_URL_UNPOOLED to "Vercel build only", but Vercel variables apply per environment to both the build step and functions; no build-only scope exists, so the runtime holds the owner-role URL too (which 7.2 relies on for jobs). Check: https://vercel.com/docs/environment-variables/sensitive-environment-variables (last_updated 2026-08-28) and https://vercel.com/docs/environment-variables (last_updated 2026-09-17; Production, Preview, Custom, Development scopes, branch-specific preview overrides). Add a KEK escrow line to the runbook (password manager, who holds it, how a restore uses it) and correct the 17.1 scope label.

### Contradictions

- Hono mount path and basePath: hosting-api mounts at apps/web/src/app/api/v1/[[...route]]/route.ts with basePath('/api/v1'); data-auth uses apps/web/app/api/[[...route]]/route.ts with basePath('/api'); contract-ci builds OpenAPIHono().basePath('/v1'). The repository settled on /api/[[...route]] with basePath('/api') and Better Auth at /api/auth/*; the hosting-api layout would leave /api/auth/* unreachable and the contract-ci layout emits /v1/... paths that do not match the committed /api/v1/... document. hosting-api also imports handle from @hono/vercel while data-auth and the record call app.fetch directly; the record's choice stands.
- Vercel build command: hosting-api recommends Build Command `turbo run build`; architecture 3.4 and the runbook set `pnpm db:migrate && next build` (which also bypasses turbo's env model and Remote Cache); architecture 7.5 says previews are "migrated and seeded by the build command" while 3.4 and the runbook include no seed.
- Vercel plan timing: hosting-api says stay on Hobby while the two first users are the household; agent-practices-compliance says production should be on Pro from day one and from the first external user because the Vercel DPA covers Pro and Enterprise only; the record itself says MHMDA regulates any entity doing business in Washington from its first consumer and requires processor contracts (RCW 19.373.060), yet Phase 1 runs on Hobby without Vercel's DPA. The owner or attorney must resolve whether a non-commercial household deployment is "conducting business"; if not, say so in the record.
- Preview databases: data-auth prescribes neondatabase/create-branch-action v6 from `production` in GitHub Actions; the record prescribes Neon's Vercel integration with `staging` as parent; Neon's integration docs (both variants, checked 2026-10-04) branch previews from the project's default branch with no parent selection documented.
- ESLint 10 in the web app: hosting-api states ESLint 10.12.0 is safe with eslint-config-next 16.3.8; the repository reproduced an eslint-plugin-react crash (`getFilename is not a function`) and pins 9.39.5 in apps/web with a Renovate guard, while packages use 10.12.0.
- pnpm major: hosting-api recommends pinning pnpm 12.9.1 (build-utils 14.17.0 installs it); the record and root package.json pin 10.34.6 and the lockfile was written by 10. Deliberate, but research snippets that mention pnpm 12 must not be copied into CI.
- Typography: design-galleries proposes Fraunces plus Nunito Sans and warns against Phloom's Figtree pairing; fonts-brand selects Newsreader plus Figtree; the record adopts Newsreader plus Figtree and answers the Phloom resemblance. docs/research/RESEARCH.md still carries both proposals.
- Color tokens: sound-darkmode (dark surfaces #142420/#1B2C27/#22352F, light text #2F4F46, accent text #3F736C, border #6B7F78), fonts-brand (text Fern 900 #1F3530, border Sea Glass 600 #4F8A82, muted #3F6A5F, warning Clay 800 #7F4C3A, danger #A63D33) and the record (#15221E/#1B2B26 surfaces, muted #4E6162, accent #35645D, border #6F8680, warning #8E5141, danger #9E3A33) disagree. packages/design-tokens/tokens.json with the contrast gate is the only source; the research snippets must be treated as superseded.
- Theme switching: sound-darkmode and the repository use a data-theme attribute with a Tailwind custom variant; design-galleries says "theme class on <html>". Resolved in favor of data-theme.
- Workspace naming: design-galleries says packages/tokens, the record says packages/design-tokens; fonts-brand puts brand files in design/brand and fonts in apps/web/src/fonts, the record uses packages/design-tokens/brand and apps/web/public/fonts; AGENTS.md lists five packages while the record and the web ESLint config reference @tidefern/db, @tidefern/auth, @tidefern/crypto and @tidefern/api-client that do not exist yet. AGENTS.md needs updating when they land.
- Hobby build concurrency: the hosting skeptic could not locate the one-concurrent-build quote; Vercel's limits page (last_updated 2026-09-16) lists "Concurrent Deployments: Hobby 1, Pro up to 500", plus 100 builds per hour and 100 deployments per day on Hobby, so hosting-api's rationale stands and the skeptic's doubt should be withdrawn.
- Firewall rate limiting plan gate: the record defers Vercel Firewall rate limits to Pro; Vercel's WAF rate limiting page (last_updated 2026-08-28) says it is available on all plans with one rule per project on Hobby.
- Next.js monorepo config: hosting-api says leave transpilePackages empty (Turbopack transpiles workspace packages) and set outputFileTracingRoot to the repo root; apps/web/next.config.ts lists all four workspace packages in transpilePackages and sets no outputFileTracingRoot. Harmless today, but the first Vercel build log should be checked for a workspace-root inference warning.
- Email transport in previews: architecture 7.5 says console transport; architecture 17.1 and the runbook store RESEND_API_KEY for preview and production.
- Postgres image pin: data-auth pins postgres:18.6 for CI; the record's section 15 and docker-compose.yml use postgres:18 (floating minor).

### Top risks

- The preview environment design is not implementable as written: Neon's Vercel integrations branch from the default branch (production), inject a console role's connection string (neon_superuser, BYPASSRLS), and the record pairs that with a separate preview KEK and an unseeded build command. Task A4 and every preview smoke test either fail or quietly run against real data with RLS bypassed. Decide the parent branch, the role strategy (SET LOCAL ROLE unconditionally inside withActor) and the KEK sharing before Stage 3.
- Turborepo strict env mode (default in 2.11.7) hides every Phase 1 secret from `turbo run build` and `turbo run test`. Failures will look like application defects, or worse, builds will succeed with the wrong configuration and be cached. Declare env and passThroughEnv per task before the first secret-dependent code lands.
- Build-time migrations execute merged destructive migrations in production automatically and run from the wrong working directory (`pnpm db:migrate` is a root script; Root Directory is apps/web). This both breaks the first production build and violates the human-only rule for destructive migrations. Add a guard and fix the command.
- CI cannot run the browser suite once authentication exists: no Postgres service, no migrate and seed step, no mail capture or test KEK env, and Better Auth's production rule of 3 sign-ins per 10 seconds. The e2e stage of `verify` will fail on the first auth PR unless the job topology is wired in advance, and `@smoke` must stay anonymous because production has no seeded users.
- The SQL-created `tidefern_app` login role through Neon's pooler is unverified (section 21, B10) and the owner must perform the Neon steps. Until B10 closes, every environment may be connecting as a BYPASSRLS role, so RLS protection depends entirely on `SET LOCAL ROLE` inside `withActor()`; the lint rule that forbids direct `db` use outside it does not exist yet and cannot be written with no-restricted-imports alone.
- Owner-gated blockers (Vercel import, Neon project on the paid Launch plan, domain, mark approval, repository visibility) stall A2, A3, A4, B10 and deploy-verify. Creating the Neon Launch project is spending money and is therefore owner-only; the agent must build against PGlite and seeds and must not improvise a Free-plan Neon project whose 6-hour history window changes the deletion-from-history promise.
- Version traps for an autonomous agent: TypeScript 7.0.2 is npm latest but has no compiler API (openapi-typescript, typescript-eslint); react-day-picker floats to 10.x and is being renamed @daypicker/react; ESLint 10 crashes eslint-config-next's plugins in apps/web; pnpm 12 is untested on Vercel; the development machine ran Node 22.22 while the target is 24 (tsx is required for the OpenAPI emit script there). Renovate guards cover typescript and eslint only.
- Vercel Hobby constraints shape the build process more than the record admits: one concurrent deployment serializes parallel subagent pull requests, 100 deployments per day, daily cron with plus or minus 59 minutes, 300 s functions, one-hour runtime logs, one-step rollback that disables production auto-assignment until undone. Deploy-verify runs will queue behind each other and a rollback can silently freeze production for later merges.
- Legal posture tension: the record asserts MHMDA applies from the first consumer and requires processor contracts, while Phase 1 runs on Hobby without Vercel's DPA and attorney review is deferred to Phase 2, after the partner's health data has already been collected. Either document the household non-commercial reasoning or move to Pro before the first real entry.
- The repository is public and will hold the full security design (CSP, roles, RLS helpers, environment names) and seeded personas. Fixtures must stay synthetic, push protection must be on before the first secret-adjacent commit, and the planning documents' candor about open security questions (unverified pooler role behavior) is visible to anyone.
