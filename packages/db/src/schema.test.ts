import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withActor } from "./actor";
import { migrationConfig } from "./migrate";
import * as schema from "./schema/index";
import { createTestDatabase } from "./test/harness";

type Row = Record<string, unknown>;

let harness: Awaited<ReturnType<typeof createTestDatabase>>;

// Synthetic ids only; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
// A subject with no key row yet, so the refused insert below cannot hit the
// primary key first: the only thing standing in its way is RLS.
const NEWCOMER = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f12";
const ATTESTED_AT = new Date("2026-10-04T18:30:00Z");

/** 1 version byte, 12 IV bytes, 16 tag bytes, 32 wrapped key bytes. */
const WRAPPED_DEK = Uint8Array.from({ length: 61 }, (_, index) => (index * 7 + 3) % 256);

function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

/**
 * Drizzle wraps a driver error in "Failed query: ..." and keeps the
 * Postgres error as `cause`; the constraint or policy name lives there.
 */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : (error as Error).message;
  }
  throw new Error("expected the query to be refused");
}

async function insertUser(id: string, email: string) {
  await harness.db.insert(schema.user).values({ id, name: "A tester", email });
}

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

describe("the journal", () => {
  test("applies from empty with the identity migration second", async () => {
    const journal = JSON.parse(
      readFileSync(join(migrationConfig.migrationsFolder, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([
      "0000_create_app_role",
      "0001_identity_and_profiles",
    ]);

    const files = readMigrationFiles(migrationConfig);
    const applied = rows(
      await harness.db.execute(
        sql`select hash from drizzle.__drizzle_migrations order by created_at`,
      ),
    );
    expect(applied.map((row) => row.hash)).toEqual(files.map((file) => file.hash));
  });

  test("creates the Better Auth tables with uuid ids and the two profile tables", async () => {
    const tables = rows(
      await harness.db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      ),
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      "account",
      "passkey",
      "profiles",
      "rate_limit",
      "session",
      "subject_keys",
      "two_factor",
      "user",
      "verification",
    ]);

    const [userId] = rows(
      await harness.db.execute(
        sql`select data_type from information_schema.columns where table_name = 'user' and column_name = 'id'`,
      ),
    );
    expect(userId).toEqual({ data_type: "uuid" });
  });

  test("pins the stage vocabulary to the four values of the Stage schema", () => {
    expect(schema.stageValues).toEqual(["none", "cycle", "pregnancy", "postpartum"]);
    expect(schema.stageEnum.enumValues).toEqual([...schema.stageValues]);
  });
});

describe("profiles and subject_keys", () => {
  beforeAll(async () => {
    await insertUser(ANNA, "anna@example.test");
  });

  test("store a profile with every column and read it back with the right types", async () => {
    const [written] = await harness.db
      .insert(schema.profiles)
      .values({
        userId: ANNA,
        displayName: "Anna",
        timeZone: "Europe/Berlin",
        stage: "cycle",
        weekStart: 7,
        units: "imperial",
        notificationDetail: "gentle",
        ageAttestedAt: ATTESTED_AT,
      })
      .returning();

    expect(written).toMatchObject({
      userId: ANNA,
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      weekStart: 7,
      units: "imperial",
      notificationDetail: "gentle",
      version: 1,
      deletedAt: null,
    });
    expect(written?.ageAttestedAt).toBeInstanceOf(Date);
    expect(written?.ageAttestedAt.toISOString()).toBe(ATTESTED_AT.toISOString());
    expect(written?.createdAt).toBeInstanceOf(Date);
    expect(written?.updatedAt).toBeInstanceOf(Date);

    const read = await harness.db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ANNA),
    });
    expect(read).toEqual(written);
  });

  test("fill the defaults for stage, week start, units and notification detail", async () => {
    const columns = rows(
      await harness.db.execute(
        sql`select column_name, column_default from information_schema.columns where table_name = 'profiles' and column_name in ('stage', 'week_start', 'units', 'notification_detail', 'version') order by column_name`,
      ),
    );
    const defaults = Object.fromEntries(
      columns.map((column) => [column.column_name, column.column_default]),
    );
    expect(defaults).toEqual({
      notification_detail: "'generic'::notification_detail",
      stage: "'none'::stage",
      units: "'metric'::units",
      version: "1",
      week_start: "1",
    });
  });

  test("round-trip a 61-byte wrapped key for a user and for a child", async () => {
    await harness.db.insert(schema.subjectKeys).values([
      {
        subjectId: ANNA,
        kind: "user",
        wrappedDek: WRAPPED_DEK,
        kekProvider: "env",
        kekVersion: "v1",
      },
      {
        subjectId: CHILD,
        kind: "child",
        wrappedDek: WRAPPED_DEK,
        kekProvider: "env",
        kekVersion: "v1",
      },
    ]);

    const keys = await harness.db.query.subjectKeys.findMany({
      orderBy: schema.subjectKeys.subjectId,
    });
    expect(keys.map((key) => [key.subjectId, key.kind])).toEqual([
      [ANNA, "user"],
      [CHILD, "child"],
    ]);
    for (const key of keys) {
      expect(key.wrappedDek).toBeInstanceOf(Uint8Array);
      expect(key.wrappedDek).toHaveLength(61);
      expect(Array.from(key.wrappedDek)).toEqual(Array.from(WRAPPED_DEK));
      expect(key.kekProvider).toBe("env");
      expect(key.kekVersion).toBe("v1");
      expect(key.createdAt).toBeInstanceOf(Date);
      expect(key.rotatedAt).toBeNull();
    }

    const [stored] = rows(
      await harness.db.execute(
        sql`select pg_typeof(wrapped_dek)::text as type, octet_length(wrapped_dek) as bytes from subject_keys where subject_id = ${ANNA}`,
      ),
    );
    expect(stored).toEqual({ type: "bytea", bytes: 61 });
  });

  test("refuse a second profile for the same user", async () => {
    const message = await refusal(
      harness.db.insert(schema.profiles).values({
        userId: ANNA,
        timeZone: "Europe/Berlin",
        ageAttestedAt: ATTESTED_AT,
      }),
    );
    expect(message).toMatch(/profiles_pkey/);
  });

  test("refuse a stage outside the vocabulary", async () => {
    const message = await refusal(
      harness.db.execute(
        sql`insert into profiles (user_id, time_zone, stage, age_attested_at) values (${CHILD}, 'Europe/Berlin', 'other', now())`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum stage/);
  });

  test("refuse a week start outside 1 to 7", async () => {
    const message = await refusal(
      harness.db.execute(
        sql`insert into profiles (user_id, time_zone, week_start, age_attested_at) values (${CHILD}, 'Europe/Berlin', 8, now())`,
      ),
    );
    expect(message).toMatch(/profiles_week_start_range/);
  });

  test("delete the profile when the user is deleted", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, ANNA));
    const left = await harness.db.query.profiles.findMany();
    expect(left).toEqual([]);
    // The wrapped key has no foreign key: destroying it is the API's job.
    const keys = await harness.db.query.subjectKeys.findMany();
    expect(keys).toHaveLength(2);
  });
});

describe("row level security", () => {
  test("is enabled on the two user-data tables and not on the auth tables", async () => {
    const flags = rows(
      await harness.db.execute(
        sql`select relname, relrowsecurity, relforcerowsecurity from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
      ),
    );
    expect(flags).toEqual([
      { relname: "account", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "passkey", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "profiles", relrowsecurity: true, relforcerowsecurity: false },
      { relname: "rate_limit", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "session", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "subject_keys", relrowsecurity: true, relforcerowsecurity: false },
      { relname: "two_factor", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "user", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "verification", relrowsecurity: false, relforcerowsecurity: false },
    ]);
  });

  test("has no policies yet, which is the baseline B8 adds to", async () => {
    const policies = rows(
      await harness.db.execute(sql`select policyname from pg_catalog.pg_policies`),
    );
    expect(policies).toEqual([]);
  });

  // What this proves: the grants and default privileges from 0000 reach a
  // table created by a later migration (the privilege check passes and the
  // query is not refused with "permission denied"), and RLS applies to the
  // app role inside withActor: with no policy, a read sees zero rows and a
  // write is refused by the row-level security check, not by a grant.
  test("leaves the app role with a grant but zero rows and no insert until B8's policies", async () => {
    await insertUser(ANNA, "anna@example.test");
    await harness.db.insert(schema.profiles).values({
      userId: ANNA,
      timeZone: "Europe/Berlin",
      ageAttestedAt: ATTESTED_AT,
    });

    const seen = await withActor(
      ANNA,
      async (tx) => {
        const [privileges] = rows(
          await tx.execute(
            sql`select has_table_privilege('tidefern_app', 'profiles', 'SELECT') as can_select, has_table_privilege('tidefern_app', 'profiles', 'INSERT') as can_insert, has_table_privilege('tidefern_app', 'subject_keys', 'SELECT') as can_select_keys`,
          ),
        );
        const profileRows = await tx.query.profiles.findMany();
        const keyRows = await tx.query.subjectKeys.findMany();
        return { privileges, profiles: profileRows.length, keys: keyRows.length };
      },
      harness.db,
    );
    expect(seen).toEqual({
      privileges: { can_select: true, can_insert: true, can_select_keys: true },
      profiles: 0,
      keys: 0,
    });

    const message = await refusal(
      withActor(
        ANNA,
        (tx) =>
          tx.insert(schema.subjectKeys).values({
            subjectId: NEWCOMER,
            kind: "user",
            wrappedDek: WRAPPED_DEK,
            kekProvider: "env",
            kekVersion: "v1",
          }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "subject_keys"/);
    expect(message).not.toMatch(/permission denied/);

    // The owner still sees the row: the refusal came from RLS, not a grant.
    const owner = await harness.db.query.profiles.findMany();
    expect(owner).toHaveLength(1);
  });
});
