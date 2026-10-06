# @tidefern/crypto

Envelope encryption for free text, as `docs/ARCHITECTURE.md` section 9.2
describes: each subject (a user, a child) has a random 32 byte data
encryption key (DEK) that lives only wrapped in `subject_keys`; a key
encryption key (KEK) wraps it; fields are sealed with AES-256-GCM under the
DEK with additional authenticated data that names the table, the column and
the row. Imported by `packages/api` and `packages/auth` only; `apps/web`'s
ESLint config forbids it, because key material stays inside the API.

## What the package exports

| Module             | Exports                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `envelope.ts`      | `sealBytes`, `openBytes`, `CIPHERTEXT_VERSION`, `KEY_BYTES`, `UnsupportedCiphertextError`, `DecryptionError`                                                                                                                                                                             |
| `keys.ts`          | `KeyProvider`, `FixedKeyProvider` (tests), `EnvKeyProvider` (Phase 1, reads `TIDEFERN_KEK_V<n>` on first use), `KeyConfigurationError`                                                                                                                                                    |
| `fields.ts`        | `encryptField`, `decryptField`, `fieldAad`, `dekAad`, `generateDek`, `wrapSubjectDek`, `unwrapSubjectDek`, `createSubjectKey`, the `FieldLocation` and `WrappedDek` types                                                                                                                 |
| `provisioning.ts`  | `provisionSubjectKey`, `provisionChildKey`, `readSubjectKey`, `destroySubjectKey`, `SubjectKeyMissingError`, `SubjectKindMismatchError`, the `KeyDatabase`, `SubjectKind`, `SubjectKeyRecord` and `ProvisionedSubjectKey` types                                                            |
| `request-keys.ts`  | `createKeyCache`, `KeyCache`, `unwrapForSubject`, `encryptFieldFor`, `decryptFieldFor`, `KeyNotUnwrappedError`, the `SubjectFieldLocation` type                                                                                                                                           |

The ciphertext layout is `version || iv || tag || ciphertext` (architecture
7.3): one version byte, a 12 byte random IV, the 16 byte GCM tag. A field's
AAD is `table:column:row_id`; a wrapped DEK's AAD is
`dek:<subjectId>:<kekVersion>`. Both layers use the same primitive, so a
tampered byte, a moved blob or a wrong AAD fails the same way at either
layer, with `DecryptionError` and nothing about the key in the message.

## The life of a subject key

```ts
import { EnvKeyProvider, provisionSubjectKey, provisionChildKey, destroySubjectKey } from "@tidefern/crypto";
import { withSystem } from "@tidefern/db";

const provider = new EnvKeyProvider(); // TIDEFERN_KEK_V1, read on first use

// Sign-up: the Better Auth hook in packages/auth does this for every new user.
await withSystem((tx) => provisionSubjectKey(tx, userId, provider));

// Child creation (task E5): in the same transaction as the child row.
await provisionChildKey(tx, childId, provider);

// Account deletion (task I2): crypto-shred before any row is deleted.
await destroySubjectKey(tx, userId);
```

`provisionSubjectKey(db, subjectId, provider, kind = "user")` mints a DEK,
wraps it with the provider, and inserts the `subject_keys` row through the
handle it was given, so the row commits or rolls back with the caller's
transaction. The insert is `ON CONFLICT DO NOTHING` on the primary key: a
second call for the same subject returns the existing row with `created:
false` and never rotates, even when the provider is at a newer KEK version
(rotation is a separate job that re-wraps and sets `rotated_at`). A call
that names the wrong kind for an existing row throws
`SubjectKindMismatchError`. The plaintext DEK is zeroed before the function
returns; the returned record carries the labels and dates, never key
material. `kek_provider` and `kek_version` take the provider's labels
verbatim (`env` and `v1` in Phase 1).

`destroySubjectKey(db, subjectId)` deletes the wrapped key and returns
whether a row was removed, so a retried closure step is harmless. Once the
row is gone the only material left is the KEK, which never sealed a field,
so every ciphertext under that DEK is unreadable at once (architecture 9.2,
item 5). A child's key is destroyed only when the last guardian leaves.

The sign-up hook provisions through `withSystem()` because no actor is
signed in yet when the user row lands. Inside `withActor()` row level
security on `subject_keys` decides whose key an actor may read: no policy
before B8, so the app role sees no rows, and the `can_read` mirror after
it, so a stranger still sees none. The test reads another subject's key
under `withActor()` and expects `SubjectKeyMissingError`, which holds in
both states.

## Keys in a request

```ts
import { createKeyCache, unwrapForSubject, encryptFieldFor, decryptFieldFor } from "@tidefern/crypto";

const keys = createKeyCache(); // one per request, on the request context

await withActor(actorId, async (tx) => {
  await unwrapForSubject(tx, subjectId, provider, keys); // one read, one unwrap
  const body = encryptFieldFor(keys, { subjectId, table: "notes", column: "body", rowId }, text);
  await tx.insert(schema.notes).values({ id: rowId, body, kekVersion: provider.version, ... });
  const back = decryptFieldFor(keys, { subjectId, table: "notes", column: "body", rowId }, body);
});

keys.clear(); // optional: zero the keys before the request object goes away
```

`createKeyCache()` returns a `KeyCache` that holds unwrapped DEKs for one
request and nothing else; there is no module-level cache, so a warm
instance never carries a key from one request to the next.
`unwrapForSubject(db, subjectId, provider, cache)` reads the row through
the caller's transaction, unwraps it once per subject per request, shares a
single unwrap between concurrent callers, and refuses a row wrapped by
another provider or KEK version with `KeyConfigurationError` before any key
is used (the rotation cue). A failed unwrap is not cached. Shared data is
decrypted with the owner's DEK after `can()` approves, so a cache may hold
several subjects' keys; grants never share keys.

`encryptFieldFor(cache, { subjectId, table, column, rowId }, text)` and
`decryptFieldFor(cache, location, bytes)` are synchronous wrappers over
`encryptField` and `decryptField` with the AAD `table:column:row_id`. They
require the subject's key to be in the cache already and throw
`KeyNotUnwrappedError` otherwise, which keeps the one database read per
subject explicit in route code.

## Environment variables

| Variable          | Purpose                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TIDEFERN_KEK_V1` | The Phase 1 KEK: canonical base64 of exactly 32 random bytes, different per environment, a sensitive Vercel variable. Read on first use, never at import. |

Tests inject a `FixedKeyProvider` and never read the environment.

## Tests

`pnpm --filter @tidefern/crypto test` runs Vitest without a network. The
provisioning and request tests boot one in-memory PGlite each
(`src/test/database.ts`) and apply the committed journal through the db
package's `applyMigrations`, the same path production uses, so
`subject_keys` has the shape and the row level security the migrations give
it and `tidefern_app` exists for `withActor()`.
