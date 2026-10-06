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
