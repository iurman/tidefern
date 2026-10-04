# Tidefern

Life flows together. One app for every chapter, from cycles to pregnancy to
childhood, for you and the people who grow with you.

This repository holds the Tidefern web app, its API contract, its design
system and the documents that drive its build. It is a pnpm + Turborepo
monorepo deployed to Vercel.

## Layout

| Path                     | What it is                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Next.js app: marketing pages, the authenticated product, the `/design` reference, and the `/api/v1` mount            |
| `packages/api`           | The Hono REST API (Zod to OpenAPI 3.1). Framework neutral; mounted by the web app today, deployable on its own later |
| `packages/core`          | Pure domain logic: calendar dates, cycle and pregnancy math, the `can()` access policy                               |
| `packages/schemas`       | Zod request, response and domain schemas shared by every client                                                      |
| `packages/design-tokens` | Tokens (`tokens.json`), the CSS generator and the brand vectors                                                      |
| `packages/config`        | Shared TypeScript and ESLint configuration                                                                           |
| `openapi/v1.json`        | The committed API contract; CI fails if it drifts from the code                                                      |
| `docs/`                  | Architecture decisions, the build prompt and plan, progress log, runbook                                             |
| `.agents/skills/`        | Project skills (site-build, humanize-writing, humanize-code, voice-profile)                                          |

## Run it

```sh
nvm use                      # Node 24 from .nvmrc
corepack enable              # pnpm from packageManager
pnpm install --frozen-lockfile
pnpm dev                     # http://localhost:3000
```

Quality gates, the same ones CI runs:

```sh
pnpm check       # prose gate, generated files, lint, types, unit tests, build
pnpm test:e2e    # Playwright against the production build
```

## Documents

- `docs/ARCHITECTURE.md`: the decisions, the evidence and the phases.
- `docs/BUILD_PROMPT.md`: the instructions an agent follows to build the product.
- `docs/BUILD_PLAN.md` and `docs/BUILD_PROGRESS.md`: what is done, claimed and next.
- `docs/LAUNCH_RUNBOOK.md`: Vercel, Neon, DNS and release steps.
- `AGENTS.md`: rules for anyone, human or agent, working in this repository.

## Status

Foundation only. The public page, the design-system overview, the API health
route and the quality pipeline work. Accounts, logging, sharing and the
product screens are built by following `docs/BUILD_PROMPT.md`.
