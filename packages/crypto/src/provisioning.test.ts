import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { schema, withActor, withSystem } from "@tidefern/db";

import { decryptField, encryptField } from "./fields";
import { FixedKeyProvider } from "./keys";
import type { KeyProvider } from "./keys";
import {
  SubjectKeyMissingError,
  SubjectKindMismatchError,
  destroySubjectKey,
  provisionChildKey,
  provisionSubjectKey,
  readSubjectKey,
} from "./provisioning";
import { createKeyTestDatabase } from "./test/database";

type Row = Record<string, unknown>;

// Synthetic ids only; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const BEN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
const CARA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f30";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const OTHER_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f12";
const NEWCOMER = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";

const kekBytes = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
const kek = new FixedKeyProvider(kekBytes, "v1");
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

let harness: Awaited<ReturnType<typeof createKeyTestDatabase>>;

function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

async function wrappedBytes(subjectId: string): Promise<string> {
  const [row] = rows(
    await harness.db.execute(
      sql`select encode(wrapped_dek, 'hex') as wrapped from subject_keys where subject_id = ${subjectId}`,
    ),
  );
  return row?.wrapped as string;
}

beforeAll(async () => {
  harness = await createKeyTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

describe("provisionSubjectKey", () => {
  test("mints a wrapped key for a user inside the caller's transaction", async () => {
    const before = new Date();
    const provisioned = await withSystem((tx) => provisionSubjectKey(tx, ANNA, kek), harness.db);
    expect(provisioned).toMatchObject({
      subjectId: ANNA,
      kind: "user",
      kekProvider: "fixed",
      kekVersion: "v1",
      rotatedAt: null,
      created: true,
    });
    expect(provisioned.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect("wrapped" in provisioned).toBe(false);
    expect("wrappedDek" in provisioned).toBe(false);

    const stored = await readSubjectKey(harness.db, ANNA);
    expect(stored.kind).toBe("user");
    // A wrapped 32 byte key: version, iv, tag, ciphertext.
    expect(stored.wrapped.byteLength).toBe(1 + 12 + 16 + 32);
    const dek = await kek.unwrapDek(stored.wrapped, `dek:${ANNA}:v1`);
    expect(dek.byteLength).toBe(32);
  });

  test("returns the existing row on a second call and never rotates", async () => {
    const first = await wrappedBytes(ANNA);
    const again = await withSystem((tx) => provisionSubjectKey(tx, ANNA, kek), harness.db);
    expect(again.created).toBe(false);
    expect(again.subjectId).toBe(ANNA);
    expect(again.rotatedAt).toBeNull();
    expect(await wrappedBytes(ANNA)).toBe(first);

    // Even a provider at a newer KEK version leaves the stored key alone.
    const rotated = new FixedKeyProvider(Uint8Array.from(kekBytes).reverse(), "v2");
    const underNewKek = await provisionSubjectKey(harness.db, ANNA, rotated);
    expect(underNewKek).toMatchObject({ created: false, kekVersion: "v1" });
    expect(await wrappedBytes(ANNA)).toBe(first);

    const count = rows(await harness.db.execute(sql`select count(*)::int as n from subject_keys`));
    expect(count[0]?.n).toBe(1);
  });

  test("lets concurrent callers for one subject land on a single row", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => provisionSubjectKey(harness.db, BEN, kek)),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.subjectId))).toEqual(new Set([BEN]));
    const count = rows(
      await harness.db.execute(
        sql`select count(*)::int as n from subject_keys where subject_id = ${BEN}`,
      ),
    );
    expect(count[0]?.n).toBe(1);
  });

  test("refuses to call a provisioned user a child, or a child a user", async () => {
    await expect(provisionChildKey(harness.db, ANNA, kek)).rejects.toThrow(
      SubjectKindMismatchError,
    );
    await provisionChildKey(harness.db, CHILD, kek);
    await expect(provisionSubjectKey(harness.db, CHILD, kek)).rejects.toThrow(
      SubjectKindMismatchError,
    );
  });

  test("records the provider's labels verbatim", async () => {
    const labelled: KeyProvider = {
      provider: "env",
      version: "v3",
      wrapDek: (dek, aad) => kek.wrapDek(dek, aad),
      unwrapDek: (wrapped, aad) => kek.unwrapDek(wrapped, aad),
    };
    const provisioned = await provisionSubjectKey(harness.db, CARA, labelled);
    expect(provisioned).toMatchObject({ kekProvider: "env", kekVersion: "v3", created: true });
    const [row] = rows(
      await harness.db.execute(
        sql`select kek_provider, kek_version from subject_keys where subject_id = ${CARA}`,
      ),
    );
    expect(row).toEqual({ kek_provider: "env", kek_version: "v3" });
  });

  test("rolls back with the caller's transaction", async () => {
    await expect(
      withSystem(async (tx) => {
        await provisionSubjectKey(tx, NEWCOMER, kek);
        throw new Error("the caller's insert failed after the key");
      }, harness.db),
    ).rejects.toThrow("the caller's insert failed");
    await expect(readSubjectKey(harness.db, NEWCOMER)).rejects.toThrow(SubjectKeyMissingError);
  });

  test("hides another subject's key from an actor who holds no grant", async () => {
    // Row level security is on. Before B8 the app role has no policy and sees
    // no rows; after B8 the policy mirrors can_read and BEN, a stranger to
    // ANNA, still sees none. Either way the read inside withActor() finds
    // nothing, while the owner role, which sign-up uses, finds the row.
    await expect(withActor(BEN, (tx) => readSubjectKey(tx, ANNA), harness.db)).rejects.toThrow(
      SubjectKeyMissingError,
    );
    await expect(withSystem((tx) => readSubjectKey(tx, ANNA), harness.db)).resolves.toMatchObject({
      subjectId: ANNA,
      kind: "user",
    });
  });
});

describe("provisionChildKey", () => {
  test("mints a child key with its own kind, separate from the guardians' keys", async () => {
    const provisioned = await withSystem(
      (tx) => provisionChildKey(tx, OTHER_CHILD, kek),
      harness.db,
    );
    expect(provisioned).toMatchObject({ subjectId: OTHER_CHILD, kind: "child", created: true });

    const child = await readSubjectKey(harness.db, OTHER_CHILD);
    const anna = await readSubjectKey(harness.db, ANNA);
    const childDek = await kek.unwrapDek(child.wrapped, `dek:${OTHER_CHILD}:v1`);
    const annaDek = await kek.unwrapDek(anna.wrapped, `dek:${ANNA}:v1`);
    expect(hex(childDek)).not.toBe(hex(annaDek));

    // A child's field cannot be read with a guardian's key.
    const location = { table: "child_events", column: "note", rowId: OTHER_CHILD };
    const blob = encryptField(childDek, location, "first smile");
    expect(decryptField(childDek, location, blob)).toBe("first smile");
    expect(() => decryptField(annaDek, location, blob)).toThrow(/failed authentication/);
  });

  test("is idempotent like a user key", async () => {
    const again = await provisionChildKey(harness.db, OTHER_CHILD, kek);
    expect(again).toMatchObject({ kind: "child", created: false });
  });
});

describe("destroySubjectKey", () => {
  test("removes the wrapped key so nothing can unwrap it, and is harmless twice", async () => {
    const before = await readSubjectKey(harness.db, CARA);
    expect(before.subjectId).toBe(CARA);

    expect(await withSystem((tx) => destroySubjectKey(tx, CARA), harness.db)).toBe(true);
    await expect(readSubjectKey(harness.db, CARA)).rejects.toThrow(SubjectKeyMissingError);
    expect(await destroySubjectKey(harness.db, CARA)).toBe(false);

    // The other subjects' rows are untouched.
    expect((await readSubjectKey(harness.db, ANNA)).subjectId).toBe(ANNA);
    expect((await readSubjectKey(harness.db, OTHER_CHILD)).subjectId).toBe(OTHER_CHILD);
  });

  test("names the subject on a missing key without any key material", async () => {
    const error = await readSubjectKey(harness.db, CARA).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubjectKeyMissingError);
    expect((error as SubjectKeyMissingError).subjectId).toBe(CARA);
    expect((error as Error).message).not.toContain(CARA);
  });

  test("leaves the schema's enum as the source of the kinds", () => {
    expect([...schema.subjectKindValues]).toEqual(["user", "child"]);
  });
});
