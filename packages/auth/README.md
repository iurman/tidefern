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
| `@tidefern/auth`          | `Mailer`, `MailMessage`, `ConsoleMailer`, `CaptureMailer`, `ResendMailer`, `ResendError`; `chooseMailer(env)`, `chooseMailTransport(env)`; `capturedMail()`, `clearCapturedMail()`, `linkIn(text)`, `setCaptureMailer(mailer)`; `verificationEmail(url)`, `passwordResetEmail(url)`, `reminderEmail(url, firstName?)`, `securityNoticeEmail(url, firstName?)`; `resolveHosts`, `hostFactsFromEnvironment`, `teamSlugFromDeploymentHost`, `previewHostPattern`, `apexOf`; the `Auth` and `Session` types |
| `@tidefern/auth/server`   | `createAuth(options)` and the module-scope `auth`                                                                                                                                                                                              |

Importing `@tidefern/auth` never builds the database pool; only the
`/server` entry does, and `apps/web`'s ESLint config forbids that path.

`createAuth(options)` takes the database (the raw client from
`@tidefern/db/client` by default; this package and `withActor()` are its only
importers), the drizzle schema, a `mailer`, the host facts and the secret.
Tests pass every one of them and never read the environment. Nothing
connects to a database at import; the pool opens on the first query.

### Mail

`Mailer` is one method, `send({ to, subject, text, html? })`, and three
transports implement it, all in `src/mailer.ts` and `src/mail/`:

| Transport       | What it does                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConsoleMailer` | Prints the recipient, the subject and the body to stdout so a developer can click the link. The default for `createAuth()`.                                                                                                                                                      |
| `CaptureMailer` | Keeps the last 20 messages in memory. `capturedMail()` returns them as `{ to, subject, link }` (the link is the first https URL in the body) and `clearCapturedMail()` forgets them; the `E2E_MAIL_CAPTURE` endpoint (`GET` and `DELETE /api/internal/e2e/mail` in `packages/api`, mounted by the web host only under `E2E_MAIL_CAPTURE=true` off Vercel) calls those two and nothing else. |
| `ResendMailer`  | `POST https://api.resend.com/emails` through `fetch` with a bearer key and a 10 second timeout that also bounds the read of an error body; no `resend` package. A refusal throws `ResendError` with the HTTP status and Resend's error name only; the recipient, the body and the message id Resend returns are never logged. |

`chooseMailer(env)` picks one from facts and never reads `process.env`
itself (the module-scope `auth` passes the real environment, tests pass an
object):

- `ResendMailer` only when `VERCEL_ENV` is `production` and both
  `RESEND_API_KEY` and `EMAIL_FROM` are set. One without the other on
  production throws, because the alternative is verification links in the
  production logs.
- `CaptureMailer` when `E2E_MAIL_CAPTURE` is exactly `true` and `VERCEL_ENV`
  is not `production`. Setting it on production throws at import, the same
  rule as `TIDEFERN_FAKE_NOW` (architecture 15 and 17.1).
- `ConsoleMailer` otherwise: local, previews and CI. Previews never hold a
  Resend key (architecture 7.5), so a seeded persona can never receive real
  mail, and CI never sends.

`chooseMailTransport(env)` returns the same decision as a name (`resend`,
`capture` or `console`) for a log line or a test.

The four templates in `src/mail/templates.ts` are functions of a link and,
for two of them, a first name: `verificationEmail`, `passwordResetEmail`,
`reminderEmail` and `securityNoticeEmail`. Every subject is one of the
generic strings from section 10.2 ("Confirm your email", "Reset your
Tidefern password", "Your Tidefern reminder", "A security notice for your
Tidefern account") and every body says what to do and nothing about health:
Resend sees addresses, subjects and bodies and lists AI providers among its
subprocessors (architecture 9.5), so the no-health-words rule is a unit test
in `templates.test.ts` that checks each template against a word list
(period, cycle, pregnancy, pregnant, fertile, ovulation, baby, child,
symptom) and requires every link to be an https URL on the apex.

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

And by `chooseMailer(process.env)` on the same instance:

| Variable           | Scope             | Purpose                                                                                                   |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`   | production only   | The bearer key for `POST https://api.resend.com/emails`                                                   |
| `EMAIL_FROM`       | production only   | The sender, an address or `Tidefern <hello@example>`, on the one domain authenticated in Cloudflare DNS   |
| `E2E_MAIL_CAPTURE` | local and CI only | `true` turns on `CaptureMailer` for the browser suite; refused when `VERCEL_ENV` is `production`          |

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
