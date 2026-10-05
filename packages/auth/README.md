# @tidefern/auth

The Better Auth server, configured as `docs/ARCHITECTURE.md` section 6.1
describes: email and password with required verification, passkeys, TOTP
with backup codes, database-backed rate limiting, 7-day sessions, the
multi-host base URL for Vercel previews, and telemetry off. Imported by
`packages/api` only (the Hono mount is task C2); it never imports Next.js
or React. The React client arrives with task C3.

## What the package exports

| Entry                     | Exports                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tidefern/auth`          | `Mailer`, `MailMessage`, `ConsoleMailer`, `CaptureMailer`; `verificationEmail(url)`, `passwordResetEmail(url)`; `resolveHosts`, `hostFactsFromEnvironment`, `teamSlugFromDeploymentHost`, `previewHostPattern`, `apexOf`; the `Auth` and `Session` types |
| `@tidefern/auth/server`   | `createAuth(options)` and the module-scope `auth`                                                                                                                                                                                              |

Importing `@tidefern/auth` never builds the database pool; only the
`/server` entry does, and `apps/web`'s ESLint config forbids that path.

`createAuth(options)` takes the database (the raw client from
`@tidefern/db/client` by default; this package and `withActor()` are its only
importers), the drizzle schema, a `mailer`, the host facts and the secret.
Tests pass every one of them and never read the environment. Nothing
connects to a database at import; the pool opens on the first query.

### Mail

`Mailer` is one method, `send({ to, subject, text, html? })`. The default
is `ConsoleMailer`, which prints to stdout; `CaptureMailer` keeps the last
messages in memory for the `E2E_MAIL_CAPTURE` endpoint task C5 wires. Resend
is wired in C5 behind the same interface and never here. The two templates
carry the generic subjects from section 10.2 ("Confirm your email", "Reset
your Tidefern password"), the link, and nothing about health.

### Hosts

`resolveHosts(facts)` turns the production host, the Vercel team slug,
`VERCEL_ENV` and `VERCEL_URL` into the base URL, the trusted origins and the
passkey relying party:

- On Vercel the base URL is the multi-host form
  `{ allowedHosts: ["<production host>", "tidefern-*-<team slug>.vercel.app"], fallback: "https://<production host>", protocol: "https" }`
  and `trustedOrigins` carries the same two patterns and nothing wider. A
  request on any other host falls back to production.
- The team slug is read off `VERCEL_URL`
  (`tidefern-<hash>-<slug>.vercel.app`). A host that is not this project's
  deployment URL yields no slug, so previews are not trusted at all rather
  than too widely.
- `rpID` is the apex production domain (a `www.` prefix is stripped) and
  the passkey origin is `https://<production host>`. A preview runs
  passkeys on its own host, so passkeys registered there are throwaway by
  design.
- Locally (no `VERCEL_ENV`) the base URL is the fixed `BETTER_AUTH_URL`
  origin, `http://localhost:3000` by default.

## Environment variables

Read only by the module-scope `auth` in `src/auth.ts`, through
`hostFactsFromEnvironment(process.env)`:

| Variable                        | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`            | Signs sessions and tokens. Required in production.                          |
| `BETTER_AUTH_URL`               | The production origin (production only) or the local origin; previews derive theirs from Vercel's variables |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Set by Vercel; pick the production host and the team slug |
| `BETTER_AUTH_TELEMETRY`         | `0` everywhere; the config also sets `telemetry.enabled: false`             |

`RESEND_API_KEY`, `EMAIL_FROM` and `E2E_MAIL_CAPTURE` belong to task C5's
transport, not to this package.

## Regenerating the schema

The identity tables (`user`, `session`, `account`, `verification`,
`two_factor`, `passkey`, `rate_limit`) are generated from this config by the
Better Auth CLI, which is the npm package `auth` (`@better-auth/cli` is
deprecated):

```sh
pnpm --filter @tidefern/auth generate
# runs: npx -y auth@1.7.7 generate --config src/auth.ts --output ../db/src/auth-schema.ts -y
```

Commit `packages/db/src/auth-schema.ts` exactly as the CLI writes it (its
output already matches Prettier). `packages/db/src/schema/index.ts`
re-exports it so drizzle-kit and the adapter see the tables; the migration
is task B2's. Rerun the command after any change to the plugins or to
`advanced.database.generateId`, and review the diff in the pull request
(architecture 4.3).

## Behaviour worth knowing

- `rateLimit.enabled` is `true` in every environment, not only production,
  so the dev server also limits sign-in, sign-up and credential changes to
  3 requests per 10 seconds per address. Better Auth's router consults the
  rate limiter before routing, so even an unknown auth path reads and
  writes `rate_limit` first.
- Better Auth skips its origin check whenever `NODE_ENV` is `test`;
  `advanced.disableOriginCheck: false` writes the production default down
  so the unit tests prove the narrow trusted origins reject a foreign
  `vercel.app` host.
- No client ever sends `trustDevice` on a two-factor verification: a
  remembered device on a shared household computer would defeat the second
  factor. `session.cookieCache` stays off so revocation is immediate.

## Tests

`pnpm --filter @tidefern/auth test` runs Vitest without a network. The
handler tests boot one in-memory PGlite and create the generated auth
tables straight from the schema module with drizzle-kit's API, so they do
not depend on a migration that another task writes.
