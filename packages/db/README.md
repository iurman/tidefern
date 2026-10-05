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
migration must run correctly under the previous deployment's code. The
runner prints every `RAISE NOTICE` a migration emits as a `migration
notice` line, so a non-fatal problem (the first migration raises one when
the `GRANT ... WITH SET TRUE` fails) shows in the build log instead of
surfacing later as a runtime error from `withActor`.

### Contract migrations and `MIGRATE_DESTRUCTIVE`

Before it applies anything, `applyMigrations` reads the journal and the
`created_at` of the newest row in `drizzle.__drizzle_migrations` (a database
with no such table has nothing applied), and scans every pending SQL file
for `DROP`, `RENAME`, `ALTER COLUMN ... TYPE` and `TRUNCATE` as keywords,
case insensitive, after stripping `--` and block comments (nested ones
too), string literals (`''` and the backslash escapes of `E''`) and quoted
identifiers; a dollar-quoted body such as a `DO` block is one token that is
cleaned the same way and then scanned like any other statement, so a drop
inside it counts and an apostrophe inside it hides nothing after it.
Any `DROP` counts, including `DROP NOT NULL` and `DROP DEFAULT`. When a
pending file matches and `MIGRATE_DESTRUCTIVE` is not exactly `1`, the
runner throws `DestructiveMigrationError`, naming the file and the
statement kind, and applies nothing, so a Vercel build can never run a
contract step by accident. Applied files are never rescanned, so a contract
migration that the owner applied once does not block later builds. The
only place that sets the variable is `.github/workflows/migrate-production.yml`:
the owner dispatches it by hand with the journal tag of the contract
migration and the Neon restore point they noted first, GitHub asks the
required reviewer of the `production-migrations` environment to approve,
and the job applies every pending file against that environment's
`DATABASE_URL_UNPOOLED` secret. Creating the environment, its reviewer and
its secret is an owner step in `docs/LAUNCH_RUNBOOK.md`; ordinary CI never
holds the credential. Never set the variable on Vercel or locally against
a shared branch; `src/migrate.test.ts` proves the refusal on PGlite.

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

## Schema

`src/schema/index.ts` is what drizzle-kit reads. It re-exports the Better
Auth tables from `src/auth-schema.ts` (generated by the Better Auth CLI in
task C1; `user.id` and every other id there is a `uuid` with a
`gen_random_uuid()` default) and the hand-written tables, one file per
area of architecture record 7.4, in the order their migrations were
generated. The journal after task B7:

| Migration                     | File                          | Tables                                                                                                                      |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `0000_create_app_role`        | hand-written                  | the `tidefern_app` role and its grants                                                                                      |
| `0001_identity_and_profiles`  | `profiles.ts`, `keys.ts`      | the auth tables, `profiles`, `subject_keys`                                                                                 |
| `0002_relationships`          | `relationships.ts`            | `households`, `household_members`, `invitations`, `grants`, `consents`                                                      |
| `0003_cycle`                  | `cycle.ts`                    | `cycle_entries`, `entry_symptoms`, `cycle_predictions`, `vocabulary`                                                        |
| `0004_pregnancy`              | `pregnancy.ts`                | `pregnancies`, `pregnancy_events`, `due_date_changes`                                                                       |
| `0005_children`               | `children.ts`                 | `children`, `child_guardians`, `child_events`, `child_measurements`, plus the foreign key from `grants.child_id`            |
| `0006_platform`               | `platform.ts`                 | `notes`, `photos`, `photo_variants`, `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`, `disclosures` |

### Rules every table follows

- Ids are `uuid` primary keys with no database default: the API mints
  UUIDv7 (architecture record 5.1) and tests insert explicit ids. The one
  exception is `vocabulary`, reference data keyed by its natural
  `(kind, code)` pair, which is what makes the seed idempotent.
- `created_at` and `updated_at` are `timestamptz` with `now()` defaults.
  Four tables carry `created_at` only, because a row there is never
  edited in the ordinary way: `due_date_changes` and `audit_events` are
  append-only logs, `vocabulary` is seeded reference data, and
  `subject_keys` records its one change in place, a rotation, in
  `rotated_at`. `src/schema.test.ts` pins that list from the catalog.
  Every syncable user-data table (entries, symptoms, predictions,
  pregnancies, events, children, measurements, notes, photos, grants,
  consents) also carries `version` (default 1) and a content-free
  `deleted_at` tombstone (architecture record 7.3).
- Calendar facts are `date` columns read in the profile's time zone and
  come back from Drizzle as `YYYY-MM-DD` strings (`mode: "string"`): entry
  dates, due dates, a pregnancy's `ended_at`, a child's date of birth, the
  day of an event, measurement or photo. Instants are `timestamptz`.
- Encrypted fields are `bytea` through the `bytea` custom type in
  `keys.ts` (drizzle-orm 0.45.3 has no bytea column) with a sibling
  `kek_version` text; a check constraint keeps the two in step wherever
  the field is optional. Free text lives only in such columns: note
  bodies, photo captions, event labels and notes.
- Measurements are SI integers: `weight_grams`, `length_millimetres`,
  `head_millimetres`, `quantity_ml`. Imperial is a display choice.
- Foreign keys to people reference `user.id` (`uuid`). A `subject_id` that
  can be a child as well as a user (`subject_keys`, `consents`, `photos`,
  `audit_events`) carries no foreign key; `child_id` names the child
  where a policy needs it.
- Closed vocabularies are Postgres enums (`src/schema/enums.ts`), not text
  columns with check constraints. Growing an enum is `ALTER TYPE ... ADD
VALUE`, an additive statement the build runner applies on its own;
  replacing a check constraint starts with a `DROP`, which the runner
  refuses outside the owner-triggered workflow. The lists are written out
  in `enums.ts` so drizzle-kit never loads zod, and the per-area tests pin
  each one to its twin in `packages/schemas` (`ShareCategory`,
  `ShareLevel`, `Stage`, `FlowLevel`, `SymptomCode`, `MoodCode`,
  `NoteCategory`) or `packages/core` (`DatingMethod`, `EndedReason`,
  `PredictionBasis`, `Sex`). `audit_events.action` and `jobs.type` are
  text, because they are neutral names owned by the API, not pickers.

### What each area adds

- Relationships: `invitations` hold `token_hash`, never the token, bound
  to `invitee_email` with `expires_at`, `accepted_at` and `withdrawn_at`;
  the owner role cannot be invited. `grants` carry `policy_version`,
  `description_version`, `notify` (default false) and `revoked_at`, and
  `child_id` is required exactly when the category is `child`. The unique
  partial index `grants_active_unique` covers
  `(grantee_id, owner_id, category, coalesce(child_id, nil uuid)) WHERE
revoked_at IS NULL`, so two active grants on one tuple cannot exist,
  with or without a child, while a revoked grant leaves room for a new
  one. `consents` record `basis` (`necessary` or `consent`), the purpose,
  `policy_version`, `text_hash`, `granted_at`, `withdrawn_at`, the
  consenting guardian for a child, and a reserved `third_party_sharing`.
- Cycle: `cycle_entries` is unique on `(subject_id, date)`; `flow` and
  `mood` are enums, symptoms are `entry_symptoms` rows unique per entry
  and code. `cycle_predictions` stores the shape core's `predictCycle`
  returns, one live row per subject. `vocabulary` is seeded by
  `seedVocabulary(tx)` in `src/seed/vocabulary.ts` from the Zod enums with
  `ON CONFLICT DO NOTHING`; the second run inserts nothing.
- Pregnancy: one open pregnancy per subject (`ended_at IS NULL`);
  `ended_at` and `ended_reason` are set together; `due_date_changes` is
  the append-only history core's `changeDueDate` writes; `pregnancy_events`
  are appointments and milestones with an optional encrypted label.
- Children: a child belongs to a household with `ON DELETE RESTRICT` (a
  household with children is wound down explicitly); `child_guardians` is
  unique per child and user; `child_events` carry a `milestone_id` exactly
  for milestones and a span for sleep; `child_measurements` need at least
  one positive value.
- Platform: `photos` hold the object key, status, content type, size,
  dimensions, an encrypted caption and the day taken, never a filename or
  EXIF; `audit_events` have no content columns and a partial unique
  `dedupe_key` for the per-day partner read dedupe, with the
  `(subject_id, created_at)` index; `jobs` have `(status, run_after)` and a
  status set that includes `dead`; `idempotency_keys` are unique on
  `(actor_id, key)` and hold `route`, `request_hash`, `state` and
  `resource_id`, never a response body; `data_requests` track the 45 day
  deadline, the closure `undo_until` and an `email_hmac` for people
  without an account; `product_events` are daily counts unique on
  `(day, name)` with no user column; `disclosures` is the per-user ledger
  of third parties.

### Row level security

Every user-data table is created with `.enableRLS()`; `jobs`,
`idempotency_keys`, `product_events`, `vocabulary`, `rate_limit` and the
Better Auth tables stay outside RLS (architecture record 7.2). Until the B8
migration adds `FORCE ROW LEVEL SECURITY` and the policies, the app role
inside `withActor` holds the grants from `0000` (the default privileges
reach tables created later) but sees zero rows and cannot insert, because
an RLS-enabled table with no policy denies everything to a role that does
not bypass RLS. `src/schema.test.ts` asserts exactly that as the baseline
and pins the journal, the table list and the `relrowsecurity` flag of every
table; `src/schema/*.test.ts` cover each area on PGlite.

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
