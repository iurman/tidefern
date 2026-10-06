import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { withSystem } from "@tidefern/db";

import { DecryptionError } from "./envelope";
import { FixedKeyProvider, KeyConfigurationError } from "./keys";
import type { KeyProvider } from "./keys";
import { SubjectKeyMissingError, destroySubjectKey, provisionSubjectKey } from "./provisioning";
import {
  KeyNotUnwrappedError,
  createKeyCache,
  decryptFieldFor,
  encryptFieldFor,
  unwrapForSubject,
} from "./request-keys";
import { createKeyTestDatabase } from "./test/database";

// Synthetic ids only; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const BEN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
const NOTE = "018f5e7a-2000-7000-8000-000000000001";
const OTHER_NOTE = "018f5e7a-2000-7000-8000-000000000002";

const kekBytes = Uint8Array.from({ length: 32 }, (_, index) => (index * 7) % 256);
const kek = new FixedKeyProvider(kekBytes, "v1");
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** The fixed provider with its unwrap counted, so a test can say how often a request unwrapped. */
function countingProvider(): KeyProvider & { unwraps: () => number } {
  const unwrapDek = vi.fn((wrapped: Uint8Array, aad: string) => kek.unwrapDek(wrapped, aad));
  return {
    provider: kek.provider,
    version: kek.version,
    wrapDek: (dek, aad) => kek.wrapDek(dek, aad),
    unwrapDek,
    unwraps: () => unwrapDek.mock.calls.length,
  };
}

let harness: Awaited<ReturnType<typeof createKeyTestDatabase>>;

beforeAll(async () => {
  harness = await createKeyTestDatabase();
  await withSystem(async (tx) => {
    await provisionSubjectKey(tx, ANNA, kek);
    await provisionSubjectKey(tx, BEN, kek);
  }, harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe("unwrapForSubject", () => {
  test("unwraps once per request and serves the cache afterwards", async () => {
    const provider = countingProvider();
    const cache = createKeyCache();
    expect(cache.size).toBe(0);
    expect(cache.has(ANNA)).toBe(false);

    const first = await unwrapForSubject(harness.db, ANNA, provider, cache);
    const second = await unwrapForSubject(harness.db, ANNA, provider, cache);
    const third = await withSystem((tx) => unwrapForSubject(tx, ANNA, provider, cache), harness.db);
    expect(first.byteLength).toBe(32);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(provider.unwraps()).toBe(1);
    expect(cache.size).toBe(1);
    expect(cache.has(ANNA)).toBe(true);
  });

  test("shares one unwrap between concurrent calls for the same subject", async () => {
    const provider = countingProvider();
    const cache = createKeyCache();
    const deks = await Promise.all(
      Array.from({ length: 5 }, () => unwrapForSubject(harness.db, ANNA, provider, cache)),
    );
    expect(new Set(deks.map(hex)).size).toBe(1);
    expect(provider.unwraps()).toBe(1);
  });

  test("keeps each subject's key apart and never shares a key between subjects", async () => {
    const provider = countingProvider();
    const cache = createKeyCache();
    const anna = await unwrapForSubject(harness.db, ANNA, provider, cache);
    const ben = await unwrapForSubject(harness.db, BEN, provider, cache);
    expect(hex(anna)).not.toBe(hex(ben));
    expect(provider.unwraps()).toBe(2);
    expect(cache.size).toBe(2);
  });

  test("starts empty for every request", async () => {
    const provider = countingProvider();
    await unwrapForSubject(harness.db, ANNA, provider, createKeyCache());
    await unwrapForSubject(harness.db, ANNA, provider, createKeyCache());
    expect(provider.unwraps()).toBe(2);
  });

  test("refuses a provider at another KEK version before any key is used", async () => {
    const provider = countingProvider();
    const rotated: KeyProvider = { ...provider, version: "v2" };
    await expect(unwrapForSubject(harness.db, ANNA, rotated, createKeyCache())).rejects.toThrow(
      KeyConfigurationError,
    );
    expect(provider.unwraps()).toBe(0);
  });

  test("does not cache a failure", async () => {
    const cache = createKeyCache();
    const missing = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f99";
    await expect(unwrapForSubject(harness.db, missing, kek, cache)).rejects.toThrow(
      SubjectKeyMissingError,
    );
    expect(cache.size).toBe(0);
    expect(cache.has(missing)).toBe(false);
  });
});

describe("encryptFieldFor and decryptFieldFor", () => {
  test("round trip a field bound to its subject, table, column and row", async () => {
    const cache = createKeyCache();
    await unwrapForSubject(harness.db, ANNA, kek, cache);
    const location = { subjectId: ANNA, table: "notes", column: "body", rowId: NOTE };
    const text = "slept badly, long walk after lunch";

    const blob = encryptFieldFor(cache, location, text);
    expect(blob.byteLength).toBe(1 + 12 + 16 + Buffer.byteLength(text, "utf8"));
    expect(decryptFieldFor(cache, location, blob)).toBe(text);

    // The same blob opens in a fresh request once that request unwraps the key.
    const later = createKeyCache();
    await unwrapForSubject(harness.db, ANNA, kek, later);
    expect(decryptFieldFor(later, location, blob)).toBe(text);
  });

  test("refuse a ciphertext moved to another row, column, table or subject", async () => {
    const cache = createKeyCache();
    await unwrapForSubject(harness.db, ANNA, kek, cache);
    await unwrapForSubject(harness.db, BEN, kek, cache);
    const location = { subjectId: ANNA, table: "notes", column: "body", rowId: NOTE };
    const blob = encryptFieldFor(cache, location, "a short note");

    expect(() => decryptFieldFor(cache, { ...location, rowId: OTHER_NOTE }, blob)).toThrow(
      DecryptionError,
    );
    expect(() => decryptFieldFor(cache, { ...location, column: "title" }, blob)).toThrow(
      DecryptionError,
    );
    expect(() => decryptFieldFor(cache, { ...location, table: "photos" }, blob)).toThrow(
      DecryptionError,
    );
    expect(() => decryptFieldFor(cache, { ...location, subjectId: BEN }, blob)).toThrow(
      DecryptionError,
    );
  });

  test("require the key to be unwrapped in this request first", async () => {
    const cache = createKeyCache();
    const location = { subjectId: ANNA, table: "notes", column: "body", rowId: NOTE };
    expect(() => encryptFieldFor(cache, location, "a short note")).toThrow(KeyNotUnwrappedError);
    expect(() => decryptFieldFor(cache, location, new Uint8Array(40))).toThrow(
      KeyNotUnwrappedError,
    );
    const error = (() => {
      try {
        encryptFieldFor(cache, location, "a short note");
      } catch (caught) {
        return caught as KeyNotUnwrappedError;
      }
      return undefined;
    })();
    expect(error?.subjectId).toBe(ANNA);
    expect(error?.message).not.toContain(ANNA);
  });

  test("clear zeroes the keys and the next use must unwrap again", async () => {
    const provider = countingProvider();
    const cache = createKeyCache();
    const dek = await unwrapForSubject(harness.db, ANNA, provider, cache);
    const location = { subjectId: ANNA, table: "notes", column: "body", rowId: NOTE };
    const blob = encryptFieldFor(cache, location, "a short note");

    cache.clear();
    expect(cache.size).toBe(0);
    expect(hex(dek)).toBe("00".repeat(32));
    expect(() => decryptFieldFor(cache, location, blob)).toThrow(KeyNotUnwrappedError);

    await unwrapForSubject(harness.db, ANNA, provider, cache);
    expect(provider.unwraps()).toBe(2);
    expect(decryptFieldFor(cache, location, blob)).toBe("a short note");
  });
});

describe("after destroySubjectKey", () => {
  test("a new request can no longer unwrap, so the field is unreadable", async () => {
    const location = { subjectId: BEN, table: "notes", column: "body", rowId: NOTE };
    const before = createKeyCache();
    await unwrapForSubject(harness.db, BEN, kek, before);
    const blob = encryptFieldFor(before, location, "kept until the account closes");

    expect(await withSystem((tx) => destroySubjectKey(tx, BEN), harness.db)).toBe(true);

    const after = createKeyCache();
    await expect(unwrapForSubject(harness.db, BEN, kek, after)).rejects.toThrow(
      SubjectKeyMissingError,
    );
    expect(() => decryptFieldFor(after, location, blob)).toThrow(KeyNotUnwrappedError);
    // What remains is the KEK and the blob; the KEK never sealed a field.
    const kekCache = createKeyCache();
    await unwrapForSubject(harness.db, ANNA, kek, kekCache);
    expect(() => decryptFieldFor(kekCache, { ...location, subjectId: ANNA }, blob)).toThrow(
      DecryptionError,
    );
  });
});
