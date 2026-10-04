# Build progress

Append-only log. Newest entry last. Each entry records the date, the agent,
what changed, the commands and their results, decisions with reasons, open
findings and the next concrete action. Resume from the last entry and
`git status`.

## 2026-10-04, session_019bNAugBr36XyCFxfiZJ2Xv (foundation)

Started from the empty repository (commit `32e1123`, README only).

### Done

- Analyzed both source architecture memos and recorded the comparison in
  `docs/research/SOURCE_ANALYSIS.md`. Ran an eight-dimension research
  sweep with per-dimension skeptic verification; findings and verified
  snippets in `docs/research/RESEARCH.md`.
- Vendored the Not a Robot skills (`humanize-writing`, `humanize-code`,
  `voice-profile`) and the `site-build` skill into `.agents/skills/`, with
  links in `.claude/skills/`, credits and licenses in `.agents/vendor/`.
  `install.sh --validate` logic reports all four skills conform to the
  Agent Skills spec.
- Scaffolded the pnpm + Turborepo monorepo: `apps/web` (Next.js 16.3.8,
  React 19.2.8, Tailwind 4.3.3, TypeScript 6.0.3), `packages/api` (Hono
  4.13.13, `@hono/zod-openapi` 1.6.3, Zod 4.6.5), `packages/core`,
  `packages/schemas`, `packages/design-tokens`, `packages/config`.
- Web shell: tokens generated to CSS for light and dark, system-preference
  default with a remembered choice applied before paint, self-hosted
  Newsreader and Figtree with OFL licenses, a vector reconstruction of the
  brand mark (light, dark, icon), the home page, the `/design` overview with
  live token tables and JSON and CSS exports, 404 and error pages, manifest,
  robots and sitemap gated on `SITE_INDEXABLE` and production.
- Sound and touch: synthesized Web Audio cues (hover, press, toggle,
  success, error) through one delegated `SoundProvider`, unlock on the
  first gesture, `navigator.vibrate` on touch, persistent mute in the
  header.
- API: the Hono app mounted at `/api/[[...route]]` with base path `/api`,
  `GET /api/v1/health`, `GET /api/v1/openapi.json` (OpenAPI 3.1), RFC 9457
  problem details, `private, no-store` on every response, security headers;
  `openapi/v1.json` committed with a drift gate.
- Core: calendar date helpers with time zone aware "today", cycle
  prediction with plausibility filtering and irregularity, Naegele's rule
  and gestational age, and the `can()` policy; 19 unit tests.
- CI: `ci.yml` (prose gate, generated-file freshness, format, lint, types,
  unit tests, production build, Playwright with axe), `deploy-verify.yml`
  (smoke test on every successful Vercel deployment with the protection
  bypass header), `codeql.yml`, Renovate, pull request template.
- Documents: `docs/ARCHITECTURE.md` (22 sections), `docs/BUILD_PROMPT.md`,
  `docs/BUILD_PLAN.md`, `docs/KICKOFF_PROMPT.md`, `docs/LAUNCH_RUNBOOK.md`,
  `AGENTS.md`, `CLAUDE.md`, `humanize.md`, `.env.example`, `README.md`.

### Commands and results

| Command                             | Result                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | 395 packages, pnpm 10.34.6, Node 22.22 locally (Node 24 is the target; a local engine warning is expected) |
| `pnpm check`                        | prose gate, tokens, OpenAPI, lint, typecheck, 23 unit tests, production build: all green                   |
| `pnpm test:e2e`                     | 8 Playwright cases green, including axe in both themes and 320 px reflow                                   |
| `node apps/web/scripts/capture.mjs` | screenshots of `/` and `/design` in both themes at 1440 and 390 px, inspected                              |

### Decisions made during the foundation

- ESLint: the web app stays on 9.39.5 because `eslint-config-next` 16.3.8
  pulls `eslint-plugin-react`, which crashed under ESLint 10 here
  (`getFilename is not a function`). Workspace packages use 10.12.0.
- Imports inside workspace packages carry no `.js` extension; Turbopack did
  not resolve `./app.js` to `./app.ts` in Just-in-Time packages.
- The route handler exports `maxDuration = 60` and no `dynamic` export,
  per the Next.js 16.3.8 route conventions.
- The API base path is `/api` (not `/api/v1`) so Better Auth can mount at
  `/api/auth/*` beside the versioned contract.
- The `openapi/v1.json` servers entry is `/` because the document's paths
  already carry the `/api/v1` prefix.
- Theme defaults to the system preference with a remembered explicit choice
  (reasons in `docs/ARCHITECTURE.md` section 13.4).

### Open findings

- The brand mark is a reconstruction pending the owner's approval or
  original vectors.
- The Playwright Chromium build (1243) had to be downloaded; machines with
  a preinstalled browser can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Vercel project and Neon project are not created yet (owner actions in
  `docs/LAUNCH_RUNBOOK.md`).

### Next action

Stage 0 of `docs/BUILD_PROMPT.md`: intake by the Phase 1 lead, task A1.
