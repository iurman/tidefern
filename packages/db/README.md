# @tidefern/db

Drizzle schema, migrations, the pooled client and the two helpers every
database access goes through. Imported by `packages/api` (and later
`packages/auth`) only; it never imports Next.js or React.

## Environment variables

| Variable                | Used by                                      | Value                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`          | `src/client.ts` (the app)                    | The pooled Neon string (host contains `-pooler`)        |
| `DATABASE_URL_UNPOOLED` | `scripts/migrate.ts`, `drizzle.config.ts`, `pnpm jobs:run` | The owner role's direct string; migrations and the job runner |
| `MIGRATE_DESTRUCTIVE`   | the owner-triggered migration workflow (B12) | `1` lets the runner apply a contract migration (DROP, RENAME, ALTER COLUMN ... TYPE, TRUNCATE) |
| `TIDEFERN_KEK_V1`       | `scripts/seed.ts`                            | The KEK the seed seals its free text under; base64 of 32 bytes, the environment's own value |
| `TIDEFERN_FAKE_NOW`     | `scripts/seed.ts`                            | An ISO 8601 instant that freezes the seed's "today"; refused when `VERCEL_ENV` is `production` |
| `DATABASE_URL` and `DATABASE_URL_UNPOOLED` together | `scripts/grant-login.ts` (CI only) | The owner URL runs `ALTER ROLE tidefern_app WITH LOGIN PASSWORD`, with the role and password taken from `DATABASE_URL`; refused when `VERCEL_ENV` is `production` |

## Commands

From the repository root:

```sh
pnpm db:generate   # drizzle-kit generate: writes SQL and journal from src/schema
pnpm db:migrate    # applies the committed journal to DATABASE_URL_UNPOOLED
pnpm db:seed       # the synthetic cast of two households against DATABASE_URL (see Seed data)
pnpm --filter @tidefern/db exec tsx scripts/grant-login.ts   # CI only: let tidefern_app log in (see Continuous integration)
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
generated. The journal after task B8:

| Migration                     | File                          | Tables                                                                                                                      |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `0000_create_app_role`        | hand-written                  | the `tidefern_app` role and its grants                                                                                      |
| `0001_identity_and_profiles`  | `profiles.ts`, `keys.ts`      | the auth tables, `profiles`, `subject_keys`                                                                                 |
| `0002_relationships`          | `relationships.ts`            | `households`, `household_members`, `invitations`, `grants`, `consents`                                                      |
| `0003_cycle`                  | `cycle.ts`                    | `cycle_entries`, `entry_symptoms`, `cycle_predictions`, `vocabulary`                                                        |
| `0004_pregnancy`              | `pregnancy.ts`                | `pregnancies`, `pregnancy_events`, `due_date_changes`                                                                       |
| `0005_children`               | `children.ts`                 | `children`, `child_guardians`, `child_events`, `child_measurements`, plus the foreign key from `grants.child_id`            |
| `0006_platform`               | `platform.ts`                 | `notes`, `photos`, `photo_variants`, `audit_events`, `jobs`, `idempotency_keys`, `data_requests`, `product_events`, `disclosures` |
| `0007_row_level_security`     | hand-written                  | the policy helpers, `FORCE ROW LEVEL SECURITY` and four policies on every RLS table, three indexes (see Row level security below) |
| `0008_idempotency_response`   | `platform.ts`                 | `response_status` and `response_hash` on `idempotency_keys`, with the check that a `done` row carries both (task E1)        |

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
  `seedVocabulary(tx, { createdAt })` in `src/seed/vocabulary.ts` from the
  Zod enums with `ON CONFLICT DO NOTHING`; the second run inserts nothing,
  and the full seed passes its own instant so the rows do not take the
  clock.
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
Better Auth tables stay outside RLS (architecture record 7.2). Migration
`0007_row_level_security` (hand-written, task B8) adds `FORCE ROW LEVEL
SECURITY` to the 23 RLS-enabled tables, the helper functions, four policies
per table and three indexes. `src/schema.test.ts` pins the journal, the
flags and the policy count per table; `src/rls.test.ts` proves the
behaviour on PGlite inside `withActor`, which drops to `tidefern_app`.

#### The helpers

| Function | Runs as | Answers |
| --- | --- | --- |
| `current_actor()` | caller | `app.actor_id` as a uuid, null outside `withActor` |
| `is_system()` | caller | `app.system` is `on` and `current_user` is not `tidefern_app` |
| `in_policy_helper()` | caller | `app.policy_helper` is `on` and `current_user` is not `tidefern_app` |
| `actor_email()` | caller | the actor's sign-in email, lower-cased, from the `user` table; null until `email_verified` |
| `can_read(subject_id, category)` | definer | `can(actor, "summary" or "read", resource)`: the subject herself, a guardian when the category is `child`, or an active grant covering the category at any level |
| `can_write(subject_id, category)` | definer | `can(actor, "write", resource)`: the same, but a grant must be `contribute` |
| `can_use_key(subject_id)` | definer | who may read a wrapped key: the subject, a guardian, or any active grant from that subject or over that child |
| `is_guardian(child_id)`, `has_guardian(child_id)`, `child_household(child_id)` | definer | guardianship lookups |
| `is_household_member(household_id, role)`, `has_members(household_id)`, `may_join(household_id, role)` | definer | membership and invitation lookups |
| `is_related(other_id)` | definer | a grant in either direction, a shared household, or a shared child |
| `accept_invitation(invitation_id)` | definer, writes | sets `accepted_at` on an open invitation to the actor's verified email and nothing else; true when it closed one |

The `category` argument is text and the policies pass the literal they file
under, so a row never spans categories except `cycle_entries`, where either
grant reaches the row and the serializer projects the columns. A `child`
grant is matched on `child_id`, never on `owner_id`, because the subject of
a child record is the child (architecture record 8.3). `journal.private`
is never granted: both helpers return false for it unless the actor is the
subject. A grant is active while `revoked_at` is null; there is no expiry
column, as in `can()`. Every helper is `STABLE` with `SET search_path =
pg_catalog, public`, except `accept_invitation()`, which is `VOLATILE`
because it writes. `current_actor()`, `is_system()` and
`in_policy_helper()` carry `COST 1` so they stay the cheapest arm of every
policy; Postgres keeps the written order only among terms of equal cost,
and the lookup helpers keep the default cost of 100.

Two rules the SQL has to keep that `can()` never faces:

- `is_system()` appears only in policy expressions, never inside a helper.
  Inside a `SECURITY DEFINER` body `current_user` is the function owner, so
  a helper that consulted it would let the app role pass as system by
  setting `app.system` itself.
- On Neon the console role owns the tables and is bound by `FORCE`
  (membership of `neon_superuser` does not carry `BYPASSRLS`), so a
  definer helper reading `grants` would hit the `grants` policy, and if
  that policy called the helper back the query would recurse without end.
  Each definer helper therefore carries `SET app.policy_helper = 'on'` for
  the duration of the call, and the policies of the five tables the helpers
  read (`grants`, `child_guardians`, `household_members`, `children`,
  `invitations`) let `in_policy_helper()` through before anything else,
  and `invitations_update` does too, for the one write a helper makes
  (`accept_invitation()`).
  The marker counts only when `current_user` is not `tidefern_app`, so the
  app role setting it by hand changes nothing. `src/rls.test.ts` proves
  that from both roles, and its last block re-owns the helpers to a role
  that cannot bypass RLS (the shape of a Neon owner) and runs the scenarios
  again; task B10 repeats the check on a real Neon branch.

#### The policies

Four permissive policies per table, named `<table>_select`, `_insert`,
`_update` and `_delete`, each also allowing `is_system()`:

- Subject-scoped health tables (`cycle_entries`, `entry_symptoms`,
  `cycle_predictions`, `pregnancies`, `pregnancy_events`, `child_events`,
  `child_measurements`, `notes`, `photos`): `SELECT` with
  `can_read(subject, category)`, `INSERT` and `UPDATE` with
  `can_write(subject, category)`, `DELETE` for the subject herself or, for a
  child's rows, a guardian. For `notes` and `photos` the row's own
  `category` column names the category; a child photo's subject is its
  `child_id`. `photo_variants` follow their photo through a subquery.
  `due_date_changes` are hers alone to read; a contributor who changes the
  due date may append, and nobody edits the log.
- `profiles`: the person, plus anyone `is_related()` may read the row.
  RLS works per row, so the projection is the API's contract: a related
  reader (a partner with no grant included) is shown `display_name` and
  `time_zone` only; `stage` and `age_attested_at` are health data and
  `units` and `notification_detail` are hers, and the serializer in
  `packages/core` never puts them in another person's view. Splitting a
  `profiles_public` view off is the change to make if a route ever needs
  the database to enforce that. `subject_keys`: read with
  `can_use_key()`, written by the subject, a guardian or the system.
- `households`, `household_members`, `invitations`: members see their
  household and each other; any signed-in actor creates a household and
  becomes its owner through the first membership row on an empty
  household; an invitee joins in the invited role while an open invitation
  to her verified email exists (`may_join`), so the acceptance route
  inserts the membership first and then calls `accept_invitation(id)`,
  the only write she can make to the invitation (she reads hers, and an
  update of her own matches no row). The owner of the household an
  invitation names invites, changes and withdraws it; the inviter alone may
  still withdraw. The owner changes or ends any membership, including
  moving a member between two households she owns; a member ends her own,
  and her row must keep its household and role (the check reads the
  pre-statement row), so she cannot promote herself or move. Membership
  shows nothing about another member's records (architecture record 8.1).
- `grants`: both parties see a grant; only the owner makes one, and a child
  grant only by a guardian of that child; the owner or a co-guardian
  revokes (an update); the owner removes the row. `consents`: the subject,
  or a guardian consenting on a child's behalf and recorded as such.
- `children` and `child_guardians`: a child is visible through
  `can_read(id, 'child')`, so a household partner without guardianship or a
  grant sees none; an active member of the household creates a child and
  becomes its first guardian (`NOT has_guardian`), after that only a
  guardian adds one; guardians or a contributor edit the row in place, and
  only a guardian moves it, into a household she is an active member of;
  guardians see each other, step down or remove another, and alone remove
  the child.
- `audit_events`: the subject (or a child's guardian) and the actor read;
  an actor appends only as herself and only about a subject she holds a
  key relationship to (`can_use_key`: herself, a child she guards, a person
  who granted to her, or that child), so nobody files a read that could not
  have happened; nothing edits the log and only the system removes. `data_requests`: hers to read, file and cancel; the
  system closes. `disclosures`: hers to read, the product's to write.

Changing a rule later is `ALTER POLICY ... USING (...)` or `CREATE OR
REPLACE FUNCTION`, both additive; drizzle-kit does not model the helpers,
the policies, `FORCE` or the three indexes (`due_date_changes_subject_idx`,
`photos_child_idx`, `invitations_invitee_email_idx`), so they live only in
the SQL and `drizzle-kit push` must never run against a database.

## Continuous integration

The `verify` job in `.github/workflows/ci.yml` runs the browser suite
against a real database, so the signed-in screens are tested against the
seeded cast rather than canned answers (architecture record 15 and 16.1).
The job starts a `postgres:18.6` service container, pinned by the digest of
its image index with the version in a comment, and runs these steps in this
order before `pnpm build`:

1. `pnpm db:migrate` with `DATABASE_URL_UNPOOLED` set to the service's
   `postgres` superuser, which stands in for the Neon owner role. That URL
   is written on this step and the next two only, never on the job, so the
   servers started later do not inherit it. Migration
   `0000_create_app_role` creates `tidefern_app` `NOLOGIN`, exactly as it
   does on Neon.
2. `scripts/grant-login.ts`, the role-login helper, with both URLs set. It
   reads the role name and the password out of `DATABASE_URL` (which must
   name `tidefern_app`), runs `ALTER ROLE tidefern_app WITH LOGIN PASSWORD
   '...'` on the owner connection with both parts escaped by `pg`, then
   connects back on `DATABASE_URL` and prints `tidefern_app can log in;
   rolbypassrls=false rolsuper=false`, exiting 1 if the role could bypass
   row level security. On Neon this step is the owner's, done once per
   branch in the SQL editor (architecture record 7.2); the helper refuses to
   run when `VERCEL_ENV` is `production`. `psql` is on the runner image too,
   but the helper keeps the password out of shell quoting and ties the
   provisioned role to the URL the server is about to use.
3. `pnpm db:seed` with `DATABASE_URL` overridden to the owner URL, because
   the seed runs inside `withSystem()` and the app role is refused, and with
   `TIDEFERN_FAKE_NOW` fixed to `2026-10-05`.

`pnpm build` then runs with `DATABASE_URL` set to the `tidefern_app` URL,
and the job starts `next start` with the same variables spelled out on the
step: the app URL, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the server's
own origin, which Better Auth trusts for sign-ins), `TIDEFERN_KEK_V1`,
`LOG_HMAC_SECRET`, `E2E_MAIL_CAPTURE=true`, `TIDEFERN_FAKE_NOW` and
`BETTER_AUTH_TELEMETRY=0`. Every one of them is a test-only value written
in the workflow and listed in `turbo.json` `globalEnv`, so the build hash
keys on it; `CRON_SECRET` stays unset on purpose, so the job runner answers
404. `pnpm test:e2e` runs against that server through
`PLAYWRIGHT_BASE_URL`. A second `next start` with `DATABASE_URL` and
`DATABASE_URL_UNPOOLED` removed from its environment then serves the
`@smoke` subset, proving those tests never need a database; the rule in
`apps/web/tests/e2e/smoke-rule.ts` fails any tagged test that reaches
`/api/auth`, injects cookies or storage state, or holds a session cookie
in any context it used, the fixture's or one it opened through
`browser.newContext()`. The smoke run writes its html report inside the
full suite's (`playwright-report/smoke`), so the report a failure left is
still there when the job uploads the folder. CI never holds a real
database credential: the service database and its throwaway passwords
live and die with the job.

The same sequence works locally against a throwaway container, for example
`podman run -d -e POSTGRES_PASSWORD=... -e POSTGRES_DB=tidefern -p 127.0.0.1:54331:5432 docker.io/library/postgres:18.6`,
with the two URLs pointing at it. Start the server the way the job does,
`setsid nohup pnpm --filter web start --port 3151 --hostname 127.0.0.1 > server.log 2>&1 &`
with the pid saved from `$!`, and stop it with `kill -- -<pid>`: the saved
pid leads the process group, and the negative form kills the `next-server`
child with it, which a plain `kill <pid>` leaves listening.

## Seed data

`pnpm db:seed` (`scripts/seed.ts`) writes the synthetic cast of
architecture record 7.5 through `seed(db, { now, kek })` in
`src/seed/index.ts`: two households that between them cover every stage
and every grant state, with verified users a browser test can sign in as.
It runs inside one `withSystem()` transaction against `DATABASE_URL`, so
the connection must belong to a role that can act as the system (the owner
role on Neon, Postgres itself in CI); when `is_system()` is false, which is
what a `DATABASE_URL` belonging to `tidefern_app` gives, the script prints
`SeedRoleError` and writes nothing. "Today" is `TIDEFERN_FAKE_NOW` when
set and the clock otherwise, read once and turned into a `YYYY-MM-DD`
date in each profile's own time zone; every calendar fact in the cast is an
offset from that date. The free text (note bodies, event labels, a child
event note) is sealed under each subject's DEK with D2's helpers
(`provisionSubjectKey`, `unwrapForSubject`, `encryptFieldFor`), the DEKs
wrapped under `TIDEFERN_KEK_V1`, so a database seeded under one KEK reads
only under that KEK. Passwords are hashed by Better Auth's own
`hashPassword` (`better-auth/crypto`), the function its sign-in verifies
against, and the `account` row has `provider_id` `credential`.

The seed is idempotent: every insert is `ON CONFLICT DO NOTHING` on its
primary key, the ids are fixed (`018f5e7a-5eed-7<block>-8000-<n>`, one
block per table in `src/seed/cast.ts`), key provisioning goes through the
idempotent D2 helper, and the script prints how many rows each table
gained, all zeros on a database seeded before. A second run with a later
`now` still adds nothing: the dates stay where the first run put them, so a
local database that should follow the calendar is reset and seeded again.
Every `created_at` and `updated_at` is set by the seed to the row's own
moment (a sign-up, a join, a logged day, a revocation, a read), never left
to the database clock, so two databases seeded from the same `now` match
column for column; the test proves it against a second PGlite. What cannot
be fixed is not: the DEKs, the IVs under them and the password salts are
random each run, as the envelope and scrypt require, so `account.password`,
`subject_keys.wrapped_dek`, `notes.body`, `pregnancy_events.label` and
`child_events.note` are the only columns that differ.

### The cast

Every person is synthetic; the emails sit on the reserved `example.test`
domain. The passwords are test-only values for browser tests and nothing
else; never reuse one anywhere real.

| Persona | Email | Password | Zone, stage | Household | What she or he can see |
| --- | --- | --- | --- | --- | --- |
| Noor | `noor@example.test` | `tidefern-seed-noor` | Europe/Berlin, `cycle` | A, owner | Her own day sheet (17 days, 14 symptoms, 3 period starts 28 days apart), the live prediction, a private note and a shared one, 4 consents, the invitations she sent, the grants she made |
| Theo | `theo@example.test` | `tidefern-seed-theo` | Europe/Berlin, `none` | A, partner | Noor's day sheet through a `read` grant on `cycle.symptoms` and a status card through a `summary` grant on `cycle.status` (notify on); his `read` grant on `cycle.history` was revoked 20 days ago, so no prediction; the shared note, never the private journal |
| Mira | `mira@example.test` | `tidefern-seed-mira` | America/Vancouver, `postpartum` | B, owner | Both children (Ilo, six weeks; Sol, thirty months) as a guardian: 10 events, 5 measurements, 5 checked milestones, her ended pregnancy (reason `birth`, hers alone), her private note, and Lena's journey through a `contribute` grant on `pregnancy.overview` (she authored one appointment and one note there) |
| Lena | `lena@example.test` | `tidefern-seed-lena` | America/Vancouver, `pregnancy` | B, partner | Her open pregnancy (22 weeks, redated by 8 days at the 14 week scan; the `due_date_changes` row is hers alone), 4 events, 2 notes under `pregnancy.overview`, both children as a guardian; nothing of Mira's history |
| Pia | `pia@example.test` | `tidefern-seed-pia` | America/New_York, `none`, imperial | none | Sol alone, through a `read` grant on `child` for that child: Sol's events and measurements, Sol's key, never Ilo and never the guardians |

Invitations, all from household A unless noted: Theo's accepted one, a
pending one to `kim@example.test` (expires in two days), an expired one to
`rafa@example.test` (guardian role, expired seven days ago), a withdrawn one
to `uma@example.test`, and Lena's accepted one in household B. The stored
`token_hash` is the SHA-256 hex of a plaintext token exported as
`invitationToken(id)` in `src/seed/cast.ts` (the pending one is
`seed-invitation-kim`); the mail that would carry it is never sent.

Rows per table, which `src/seed/seed.test.ts` pins:

| Table | Rows | Table | Rows |
| --- | --- | --- | --- |
| `user`, `account`, `profiles` | 5 each | `cycle_entries` | 17 |
| `subject_keys` | 7 (5 users, 2 children) | `entry_symptoms` | 14 |
| `households` | 2 | `cycle_predictions` | 1 |
| `household_members` | 4 | `pregnancies` | 2 |
| `invitations` | 5 | `pregnancy_events` | 5 |
| `grants` | 5 | `due_date_changes` | 1 |
| `consents` | 11 | `child_events` | 10 |
| `children` | 2 | `child_measurements` | 5 |
| `child_guardians` | 4 | `notes` | 5 |
| `vocabulary` | 27 | `audit_events` | 18 |

The audit trail holds one `session.sign_in` per person, every grant made
and the one revoked, the pending invitation's creation and the withdrawn
one's withdrawal, Theo's two reads of Noor's symptoms (one row per actor,
subject, category and day, keyed by `dedupe_key`, the day being the
reader's own calendar day), Pia's read of Sol, and
Mira's two writes for Lena. `photos`, `jobs`, `idempotency_keys`,
`data_requests`, `product_events` and `disclosures` stay empty, as do the
Better Auth session tables. No name, email, id or action name carries a
health word; the test scans them.

### Why `@tidefern/crypto` and `better-auth` are peer dependencies

The seed calls D2's helpers and Better Auth's hasher, but
`packages/crypto` already depends on this package (for the `subject_keys`
table), so a regular dependency closes a cycle that Turborepo refuses
(`@tidefern/crypto#typecheck -> @tidefern/db#typecheck` and back; `build`
has the same `^` edge). Declared as peer dependencies the packages are
still linked into `packages/db/node_modules` by pnpm, so the script and
the tests resolve them, while the task graph stays acyclic: neither package
has a build step, so no ordering between their checks is needed. Nothing
in `@tidefern/db`'s exports reaches the seed; `src/index.ts` is unchanged
and the app bundle never pulls it in.

## Jobs

`src/jobs.ts` is the outbox of architecture record 10.1, reached as
`@tidefern/db/jobs`. The `jobs` table (B7) sits outside row level security
because a job names ids and never content; a handler that acts for one
person opens `withActor` itself.

- `enqueue(tx, type, payload, { runAfter?, id? })` inserts one `queued` row
  inside the caller's transaction, so the job commits with the change that
  caused it or not at all. `type` is one of `jobTypeValues` (neutral names:
  `reminder.send`, `account.delete`, `export.step` and so on) and the
  payload is checked to hold UUIDs only, as strings or lists under camelCase
  keys; anything else is a `JobPayloadError`. The id is a UUIDv7 from
  `jobId()` unless the caller mints one.
- `claimDue(db, limit, now)` claims up to `limit` jobs that are `queued` or
  `failed` with `run_after` in the past, plus any `running` row whose lock
  is older than `CLAIM_LOCK_TIMEOUT_MS` (15 minutes, a drain that died). The
  rows are selected `FOR UPDATE SKIP LOCKED`, so two drains at once never
  take the same job, then set `running` with `locked_at` and one more
  attempt. `claimByIds(db, ids, now)` is the same claim for the ids one
  request enqueued; the inline drain in `packages/api` calls it.
- `complete(db, id)` marks a running job `done`. `fail(db, id, error)` puts
  it back as `failed` with `run_after` pushed out by `BACKOFF_MS` for its
  attempt count (1 minute, 5, 30, then 2 hours), or to `dead` after the
  fifth attempt. `last_error` holds the error's name and driver code and
  never its message, because a database error can quote the row it refused.
- `sweep(db, now)` runs the retention purges in one `withSystem`
  transaction and returns the counts: `idempotency_keys` rows after 24
  hours, tombstoned rows after 30 days on every table with a `deleted_at`
  column (`tombstonedTables()` reads them off the schema), `audit_events`
  after a year, `product_events` after 90 days, closure windows as 0 until
  I2 defines them, and the number of jobs sitting in `dead`. Those tables
  are under forced row level security, so the sweep first checks
  `is_system()` and throws `SweepRoleError` on the app role rather than
  deleting nothing in silence: the job runner's connection is the owner
  role (`DATABASE_URL_UNPOOLED`, architecture 7.2).

The drains live in `packages/api/src/jobs`: the inline drain after a
request (`c.var.drainJobs(ids)` through the host's `defer`), the scheduled
`GET /api/internal/jobs/run` behind `CRON_SECRET` (daily at 06:00 UTC in
`apps/web/vercel.json`, the Vercel root directory), and `pnpm jobs:run`
locally against `DATABASE_URL_UNPOOLED`, or `DATABASE_URL` when only that
is set. The scheduled run and the manual run both drain, then sweep, and
the scheduled one mails the owner a count-only notice when the dead queue is
not empty. The manual run calls `assertSweepRole(db)` before it drains, so
a connection the sweep would refuse is refused before any job is claimed.
`src/jobs.test.ts` proves the claim, the backoff and the purges on PGlite;
with its single connection two claimers run back to back there, and B10
covers the pooled endpoint.

## What the package exports

- `@tidefern/db`: `withActor`, `withSystem`, `isActorId`, the `schema`
  namespace, `applyMigrations` and `migrationConfig`, plus the `Transaction`
  and `ActorDatabase` types. Never the raw `db` or `pool`.
- `@tidefern/db/jobs`: the outbox above (`enqueue`, `claimDue`,
  `claimByIds`, `complete`, `fail`, `sweep`, `assertSweepRole`, `jobId`, the
  constants and the `Job`, `JobType`, `JobPayload` and `SweepCounts` types).
  The api package imports it at runtime without pulling the migration runner
  into a bundle.
- `@tidefern/db/client`: the raw `db` and `pool`. Only `withActor` and
  `withSystem` inside this package and the Better Auth adapter (task C1) may
  import it. The `jobs:run` entry in `packages/api/src/jobs/run.ts` opens its
  own one-connection pool on the owner role's URL instead.
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
