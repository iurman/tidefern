import type { BetterAuthOptions } from "better-auth";

import { provisionSubjectKey } from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import { withActor } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";

export type DatabaseHooks = NonNullable<BetterAuthOptions["databaseHooks"]>;

/** The signature Better Auth 1.7.7 gives `databaseHooks.user.create.after`. */
export type UserCreatedHook = NonNullable<
  NonNullable<NonNullable<DatabaseHooks["user"]>["create"]>["after"]
>;

export interface UserKeyHookOptions {
  /** Wraps the new user's DEK; `EnvKeyProvider` in Phase 1. */
  provider: KeyProvider;
  /** Where `subject_keys` lives; the pooled production client by default, PGlite in tests. */
  database?: ActorDatabase | undefined;
}

/**
 * Provisions a user's data encryption key the moment Better Auth creates the
 * user row (architecture record 9.2, item 1). Better Auth runs this hook
 * once its own transaction has committed, so the key is written in a
 * transaction of its own, as the new user: `subject_keys` lets a subject
 * write its own key, and `withActor()` works whichever role the connection
 * belongs to. `withSystem()` would not: `is_system()` is false on the app
 * role, which is what `DATABASE_URL` names on CI and in production (7.2).
 *
 * Provisioning is idempotent, so a repeated hook (or a later repair call
 * with the same function) never rotates a key. If the hook throws, Better
 * Auth fails the sign-up call while the user row stays; the next
 * `provisionSubjectKey` for that user completes what the hook could not.
 */
export function createUserKeyHook({ provider, database }: UserKeyHookOptions): UserCreatedHook {
  return async (user) => {
    await withActor(user.id, (tx) => provisionSubjectKey(tx, user.id, provider, "user"), database);
  };
}

/** The `databaseHooks` object `createAuth()` takes, with only the user key hook in it. */
export function userKeyDatabaseHooks(options: UserKeyHookOptions): DatabaseHooks {
  return { user: { create: { after: createUserKeyHook(options) } } };
}
