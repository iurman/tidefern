import type { BetterAuthOptions } from "better-auth";

import { provisionSubjectKey } from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import { withSystem } from "@tidefern/db";
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
 * `withSystem()` transaction of its own: Better Auth owns the identity
 * tables as the connection's role, and `subject_keys` has no policy that
 * would let an unauthenticated sign-up write it as the app role.
 *
 * Provisioning is idempotent, so a repeated hook (or a later repair call
 * with the same function) never rotates a key. If the hook throws, Better
 * Auth fails the sign-up call while the user row stays; the next
 * `provisionSubjectKey` for that user completes what the hook could not.
 */
export function createUserKeyHook({ provider, database }: UserKeyHookOptions): UserCreatedHook {
  return async (user) => {
    await withSystem((tx) => provisionSubjectKey(tx, user.id, provider, "user"), database);
  };
}

/** The `databaseHooks` object `createAuth()` takes, with only the user key hook in it. */
export function userKeyDatabaseHooks(options: UserKeyHookOptions): DatabaseHooks {
  return { user: { create: { after: createUserKeyHook(options) } } };
}
