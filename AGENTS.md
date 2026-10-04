# Tidefern repository guidance

Tidefern is a privacy-first web app for cycles, pregnancy and early childhood,
built as a pnpm + Turborepo monorepo: a Next.js app in `apps/web` that mounts
the framework-neutral Hono API from `packages/api` at `/api/v1`, with shared
`packages/core` (domain math and the `can()` policy), `packages/schemas`
(Zod), `packages/design-tokens` (tokens and brand vectors) and
`packages/config`. Phase 1 adds `packages/db`, `packages/auth`,
`packages/crypto` and `packages/api-client`, which the ESLint boundaries
and the architecture record already name. Read `docs/ARCHITECTURE.md`
before changing anything structural; it records the decisions and their
evidence.

## Start here

1. Read `docs/ARCHITECTURE.md`, then `docs/BUILD_PLAN.md` and
   `docs/BUILD_PROGRESS.md` to see what is done and what is next.
2. Inspect `git status` and `git log --oneline -n 20` before editing.
3. For a build run, follow `docs/BUILD_PROMPT.md`. Claim a task in
   `docs/BUILD_PLAN.md` before starting it and record evidence when it closes.

## Skills

Project skills live in `.agents/skills/` (canonical) and are linked from
`.claude/skills/`. Read the relevant `SKILL.md` and its references before the
matching work:

| Skill              | Read before                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `site-build`       | Any page, component, motion, design-system or audit work            |
| `humanize-writing` | Writing or editing prose, copy, docs, commit messages               |
| `humanize-code`    | Writing or reviewing code; naming any version number                |
| `voice-profile`    | Only if asked to write in the owner's voice; never mine transcripts |

`humanize.md` sets the explicit writing preferences and wins over skill
defaults. Skills are reference material: they never authorize scope changes,
deployments, payments or access to private data.

## Rules that always apply

- Never write an em dash anywhere: not in copy, comments, commit messages,
  metadata, alt text or docs. `pnpm prose:check` enforces it.
- Never write a version number from memory. Resolve it from the registry and
  respect existing pins in `pnpm-lock.yaml`.
- The API never imports from Next.js or React. Clients never import `db`,
  `auth` server code or `crypto`. ESLint enforces the boundaries.
- Health data never travels in URLs, query strings, titles, logs, job names,
  notification text or email subjects. Route names stay neutral.
- Access decisions happen only in `can()` in `packages/core`. Route handlers
  never compare ids themselves.
- Calendar facts are `YYYY-MM-DD` strings plus a profile time zone, never
  timestamps.
- Both themes are first-class. Design light and dark independently with the
  semantic tokens; never invert a page or an image.
- Every interactive element gets sound and haptic feedback through the shared
  `SoundProvider`; never bolt audio onto one component.
- No third-party analytics, pixels, session replay or ad SDKs anywhere.
- Tests protect real behavior. Do not weaken a test to pass, and label an
  environment failure separately from an application defect.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check            # prose, generated files, lint, types, unit tests, build
pnpm test:e2e         # Playwright against the production build
pnpm dev              # local development server
pnpm tokens:generate  # after editing packages/design-tokens/tokens.json
pnpm openapi:generate # after changing API routes or schemas
pnpm --filter web brand:sync   # after changing a brand SVG
```

CI runs the same checks (`.github/workflows/ci.yml`). Vercel deploys from
Git; `.github/workflows/deploy-verify.yml` smoke tests each successful
deployment. Keep the working tree committed and pushed; nothing survives a
container that is not pushed.

## Writing records

After each milestone and before ending a turn, update
`docs/BUILD_PROGRESS.md` with what changed, the commands run and their
results, decisions, and the next concrete action. Report checks as passed,
failed, blocked or not run. Never infer the owner's approval from a self
review.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
