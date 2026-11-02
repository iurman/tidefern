import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { FixedKeyProvider, readSubjectKey } from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import type { ActorDatabase } from "@tidefern/db";
import * as schema from "@tidefern/db/schema";

import { createAuth } from "./auth";
import type { HostFacts } from "./hosts";
import { createUserKeyHook, userKeyDatabaseHooks } from "./keys";
import { CaptureMailer } from "./mailer";
import { createMigratedAuthTestDatabase } from "./test/migrated-database";

const SECRET = "a-fixed-test-secret-that-is-long-enough";
const FACTS: HostFacts = {
  productionHost: "tidefern.example",
  teamSlug: "fern-team",
  vercelEnv: "production",
  vercelUrl: "tidefern-abc123def-fern-team.vercel.app",
};

// Synthetic ids only; nothing here is a real person.
const DIRECT_USER = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f50";
const APP_ROLE_USER = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f51";
const kek = new FixedKeyProvider(
  Uint8Array.from({ length: 32 }, (_, index) => (index * 3 + 1) % 256),
  "v1",
);

type Row = Record<string, unknown>;

let harness: Awaited<ReturnType<typeof createMigratedAuthTestDatabase>>;

function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

async function keyRows(): Promise<Row[]> {
  return rows(
    await harness.db.execute(
      sql`select subject_id, kind::text as kind, kek_provider, kek_version from subject_keys order by created_at`,
    ),
  );
}

async function userIdFor(email: string): Promise<string | undefined> {
  const [row] = rows(await harness.db.execute(sql`select id from "user" where email = ${email}`));
  return row?.id as string | undefined;
}

beforeAll(async () => {
  harness = await createMigratedAuthTestDatabase();
  await harness.db.insert(schema.user).values([
    { id: DIRECT_USER, name: "A tester", email: "direct@example.com" },
    { id: APP_ROLE_USER, name: "A second tester", email: "app-role@example.com" },
  ]);
});

afterAll(async () => {
  await harness.close();
});

describe("createUserKeyHook", () => {
  test("provisions the user's key as that user and is idempotent", async () => {
    const hook = createUserKeyHook({ provider: kek, database: harness.db });
    const user = {
      id: DIRECT_USER,
      name: "A tester",
      email: "direct@example.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await hook(user, null);
    const first = await readSubjectKey(harness.db, DIRECT_USER);
    expect(first).toMatchObject({ subjectId: DIRECT_USER, kind: "user", kekVersion: "v1" });

    await hook(user, null);
    const again = await readSubjectKey(harness.db, DIRECT_USER);
    expect(Buffer.from(again.wrapped).equals(Buffer.from(first.wrapped))).toBe(true);
    expect((await keyRows()).filter((row) => row.subject_id === DIRECT_USER)).toHaveLength(1);
  });

  test("provisions the key when the connection itself is the app role, as outside PGlite", async () => {
    // DATABASE_URL names tidefern_app on CI and in production (architecture
    // 7.2), the role is_system() refuses, so the hook must act as the new user.
    const appRole: ActorDatabase = {
      transaction: (fn) =>
        harness.db.transaction(async (tx) => {
          await tx.execute(sql`set local role tidefern_app`);
          return fn(tx);
        }),
    };
    const hook = createUserKeyHook({ provider: kek, database: appRole });
    await hook(
      {
        id: APP_ROLE_USER,
        name: "A second tester",
        email: "app-role@example.com",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      null,
    );
    expect(await readSubjectKey(harness.db, APP_ROLE_USER)).toMatchObject({
      subjectId: APP_ROLE_USER,
      kind: "user",
      kekVersion: "v1",
    });
  });

  test("builds the databaseHooks object with only the user create.after hook", () => {
    const hooks = userKeyDatabaseHooks({ provider: kek, database: harness.db });
    expect(Object.keys(hooks)).toEqual(["user"]);
    expect(Object.keys(hooks.user ?? {})).toEqual(["create"]);
    expect(Object.keys(hooks.user?.create ?? {})).toEqual(["after"]);
    expect(typeof hooks.user?.create?.after).toBe("function");
  });
});

describe("createAuth with the hook", () => {
  test("passes databaseHooks through only when given", () => {
    const without = createAuth({ database: harness.db, schema, hosts: FACTS, secret: SECRET });
    expect("databaseHooks" in without.options).toBe(false);

    const hooks = userKeyDatabaseHooks({ provider: kek, database: harness.db });
    const withHooks = createAuth({
      database: harness.db,
      schema,
      hosts: FACTS,
      secret: SECRET,
      databaseHooks: hooks,
    });
    expect(withHooks.options.databaseHooks).toBe(hooks);
  });

  test("provisions a wrapped key when a user signs up", async () => {
    const mailer = new CaptureMailer();
    const auth = createAuth({
      database: harness.db,
      schema,
      hosts: FACTS,
      secret: SECRET,
      mailer,
      databaseHooks: userKeyDatabaseHooks({ provider: kek, database: harness.db }),
    });
    const email = "newcomer@example.com";
    const result = await auth.api.signUpEmail({
      body: { name: "Newcomer", email, password: "correct horse battery staple" },
    });
    const userId = await userIdFor(email);
    expect(userId).toBeDefined();
    expect(result.user.id).toBe(userId);

    const key = await readSubjectKey(harness.db, userId as string);
    expect(key).toMatchObject({
      subjectId: userId,
      kind: "user",
      kekProvider: "fixed",
      kekVersion: "v1",
      rotatedAt: null,
    });
    const dek = await kek.unwrapDek(key.wrapped, `dek:${userId}:v1`);
    expect(dek.byteLength).toBe(32);

    // Sign-up still sent the confirmation mail, with nothing about keys in it.
    const message = mailer.last(email);
    expect(message?.subject).toBe("Confirm your email");
    expect(message?.text).not.toMatch(/key/i);
  });

  test("fails the sign-up call when provisioning fails, and a later call repairs it", async () => {
    const broken: KeyProvider = {
      provider: kek.provider,
      version: kek.version,
      wrapDek: () => {
        throw new Error("the KEK is unavailable");
      },
      unwrapDek: (wrapped, aad) => kek.unwrapDek(wrapped, aad),
    };
    const auth = createAuth({
      database: harness.db,
      schema,
      hosts: FACTS,
      secret: SECRET,
      mailer: new CaptureMailer(),
      databaseHooks: userKeyDatabaseHooks({ provider: broken, database: harness.db }),
    });
    const email = "unlucky@example.com";
    await expect(
      auth.api.signUpEmail({
        body: { name: "Unlucky", email, password: "correct horse battery staple" },
      }),
    ).rejects.toThrow();

    // Better Auth runs the hook after its own transaction committed, so the
    // user row exists without a key; provisioning is idempotent, so the hook
    // with a working provider completes the sign-up.
    const userId = await userIdFor(email);
    expect(userId).toBeDefined();
    expect((await keyRows()).some((row) => row.subject_id === userId)).toBe(false);

    const repair = createUserKeyHook({ provider: kek, database: harness.db });
    await repair(
      {
        id: userId as string,
        name: "Unlucky",
        email,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      null,
    );
    expect((await readSubjectKey(harness.db, userId as string)).kind).toBe("user");
  });
});
