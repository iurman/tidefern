# @tidefern/db

Drizzle schema, migrations, the pooled client and the two helpers every
database access goes through. Imported by `packages/api` (and later
`packages/auth`) only; it never imports Next.js or React.

## Environment variables

| Variable                | Used by                                      | Value                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`          | `src/client.ts` (the app)                    | The pooled Neon string (host contains `-pooler`)        |
| `DATABASE_URL_UNPOOLED` | `scripts/migrate.ts`, `drizzle.config.ts`    | The owner role's direct string; migrations only         |
| `MIGRATE_DESTRUCTIVE`   | the owner-triggered migration workflow (B12) | `1` lets the runner apply a contract migration (DROP, RENAME, ALTER COLUMN ... TYPE, TRUNCATE) |

## Commands

From the repository root:

```sh
pnpm db:generate   # drizzle-kit generate: writes SQL and journal from src/schema
pnpm db:migrate    # applies the committed journal to DATABASE_URL_UNPOOLED
pnpm db:seed       # synthetic data; arrives with task B9
```

A hand-written migration (grants, functions, anything drizzle-kit cannot
express) starts with `pnpm --filter @tidefern/db exec drizzle-kit generate --custom --name <name>`,
then the SQL goes into the file it created. Commit the SQL together with
`drizzle/meta/_journal.json` and the snapshot exactly as drizzle-kit wrote
them; never edit the journal by hand and never run `drizzle-kit up`.

The Vercel build command runs `pnpm -w db:migrate` before `next build`, so
every environment migrates itself. Migrations are expand then contract: a
migration must run correctly under the previous deployment's code.

## The role model

The first migration creates `tidefern_app` by SQL: `NOLOGIN NOBYPASSRLS
NOINHERIT`, so it never joins Neon's `neon_superuser` and cannot bypass
row level security. It grants that role `USAGE` on `public`, `SELECT`,
`INSERT`, `UPDATE`, `DELETE` on every table, `USAGE` on every sequence, and
the matching default privileges, so tables added by later migrations need
no new grant. It also grants `tidefern_app` to the migrating role `WITH SET
TRUE`; on PGlite that is the superuser, on Neon the owner role.

`withActor(actorId, fn)` opens a transaction, sets `app.actor_id` for that
transaction with a bound parameter, runs `SET LOCAL ROLE tidefern_app`
unconditionally, and runs `fn(tx)`. Whichever role the connection string
carries, the queries inside run as a role RLS applies to, and both the role
and the setting reset when the transaction ends, which is what Neon's
transaction-mode pooler needs. The actor id must be a UUID; anything else
is rejected before the transaction opens.

`withSystem(fn)` opens a transaction, sets `app.system` to `on`, and runs
`fn(tx)` as the connection's own role. It is the only owner-role path, for
seeds, sweeps and backfills. The policy helpers (task B8) honour
`app.system` only when `current_user` is not `tidefern_app`, so an app
connection can never claim system context.

Both helpers take the database as their last argument, defaulting to the
production client, so tests pass the PGlite instance.

## What the package exports

- `@tidefern/db`: `withActor`, `withSystem`, `isActorId`, the `schema`
  namespace, `applyMigrations` and `migrationConfig`, plus the `Transaction`
  and `ActorDatabase` types. Never the raw `db` or `pool`.
- `@tidefern/db/client`: the raw `db` and `pool`. Only `withActor` and
  `withSystem` inside this package and the Better Auth adapter (task C1)
  may import it.
- `@tidefern/db/schema`: the tables, for drizzle-kit and the auth adapter.

### Keeping route code out of the raw client

`packages/config/eslint/library.js` exports `dbClientRestriction`, a
`no-restricted-imports` path entry for `@tidefern/db/client`. Task E1 adds
it to the api package like this:

```js
import { dbClientRestriction, libraryConfig, libraryRules } from "@tidefern/config/eslint/library";

const [, options] = libraryRules["no-restricted-imports"];

export default [
  ...libraryConfig(),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...options.paths, dbClientRestriction], patterns: options.patterns },
      ],
    },
  },
];
```

## Tests

`src/test/harness.ts` boots one in-memory PGlite 0.5.8 (Postgres 18 engine)
and applies the committed journal through `applyMigrations`, the same
function `scripts/migrate.ts` uses. PGlite holds a single exclusive
connection, so call `createTestDatabase()` once per test file in
`beforeAll` and `close()` it in `afterAll`:

```ts
import { createTestDatabase } from "./test/harness";

let harness: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  harness = await createTestDatabase();
});
afterAll(() => harness.close());
```

PGlite's default role is a superuser that bypasses RLS, so a policy test
only proves anything inside `withActor`, which drops to `tidefern_app`.
`pnpm --filter @tidefern/db test` runs the suite; `pnpm check` at the root
runs it with everything else.
