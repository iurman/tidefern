import { describe, expect, it } from "vitest";
import { CIPHERTEXT_VERSION, DecryptionError, UnsupportedCiphertextError } from "./envelope";
import {
  createSubjectKey,
  decryptField,
  encryptField,
  generateDek,
  unwrapSubjectDek,
  wrapSubjectDek,
} from "./fields";
import { FixedKeyProvider, KeyConfigurationError, type KeyProvider } from "./keys";

const kekBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
const kek = new FixedKeyProvider(kekBytes, "v1");
const subject = "0192f1d8-5c1e-7a3b-9d4e-0123456789ab";
const location = { table: "entries", column: "body", rowId: subject };
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("field encryption", () => {
  it("round trips text and lays the blob out as version, iv, tag, ciphertext", () => {
    const dek = generateDek();
    const text = "slept badly, long walk after lunch";
    const blob = encryptField(dek, location, text);
    expect(blob[0]).toBe(CIPHERTEXT_VERSION);
    expect(blob.byteLength).toBe(1 + 12 + 16 + Buffer.byteLength(text, "utf8"));
    expect(decryptField(dek, location, blob)).toBe(text);
  });
  it("draws a fresh IV for every encryption of the same text", () => {
    const dek = generateDek();
    const first = encryptField(dek, location, "same text");
    const second = encryptField(dek, location, "same text");
    expect(hex(first.subarray(1, 13))).not.toBe(hex(second.subarray(1, 13)));
    expect(hex(first)).not.toBe(hex(second));
  });
  it("rejects a flipped byte in the IV, the tag and the ciphertext", () => {
    const dek = generateDek();
    const blob = encryptField(dek, location, "a short note");
    for (const offset of [1, 1 + 12, 1 + 12 + 16]) {
      const tampered = Uint8Array.from(blob);
      tampered[offset] = (tampered[offset] ?? 0) ^ 0x01;
      expect(() => decryptField(dek, location, tampered)).toThrow(DecryptionError);
    }
  });
  it("rejects ciphertext read under another row id or another column", () => {
    const dek = generateDek();
    const blob = encryptField(dek, location, "a short note");
    expect(() => decryptField(dek, { ...location, rowId: "another-row" }, blob)).toThrow(
      DecryptionError,
    );
    expect(() => decryptField(dek, { ...location, column: "title" }, blob)).toThrow(
      DecryptionError,
    );
  });
  it("refuses an unknown version byte or a truncated blob before decrypting", () => {
    const dek = generateDek();
    const blob = Uint8Array.from(encryptField(dek, location, "a short note"));
    blob[0] = CIPHERTEXT_VERSION + 1;
    expect(() => decryptField(dek, location, blob)).toThrow(UnsupportedCiphertextError);
    expect(() => decryptField(dek, location, blob.subarray(0, 20))).toThrow(
      UnsupportedCiphertextError,
    );
  });
});

describe("subject keys", () => {
  it("wraps a DEK, records the KEK provider and version, and unwraps it back", async () => {
    const dek = generateDek();
    const record = await wrapSubjectDek(kek, subject, dek);
    expect(record.kekProvider).toBe("fixed");
    expect(record.kekVersion).toBe("v1");
    expect(hex(record.wrapped)).not.toContain(hex(dek));
    expect(hex(await unwrapSubjectDek(kek, subject, record))).toBe(hex(dek));
  });
  it("refuses a record wrapped under another KEK version or for another subject", async () => {
    const record = await wrapSubjectDek(kek, subject, generateDek());
    const rotated = new FixedKeyProvider(Uint8Array.from(kekBytes).reverse(), "v2");
    await expect(unwrapSubjectDek(rotated, subject, record)).rejects.toThrow(KeyConfigurationError);
    await expect(unwrapSubjectDek(kek, "another-subject", record)).rejects.toThrow(DecryptionError);
  });
  it("refuses a record wrapped by another provider even at the same KEK version", async () => {
    const record = await wrapSubjectDek(kek, subject, generateDek());
    // Same key bytes and version, so only the provider label differs: the Phase 2 re-wrap cue.
    const kms: KeyProvider = {
      provider: "aws-kms",
      version: kek.version,
      wrapDek: (dek, aad) => kek.wrapDek(dek, aad),
      unwrapDek: (wrapped, aad) => kek.unwrapDek(wrapped, aad),
    };
    await expect(unwrapSubjectDek(kms, subject, record)).rejects.toThrow(KeyConfigurationError);
  });
  it("leaves a field unreadable once its wrapped DEK is discarded", async () => {
    const { dek, kekProvider, kekVersion } = await createSubjectKey(kek, subject);
    const blob = encryptField(dek, location, "a short note");
    dek.fill(0);
    // The wrapped row is gone; what remains is the KEK, the blob and a zeroed buffer.
    expect(() => decryptField(dek, location, blob)).toThrow(DecryptionError);
    expect(() => decryptField(kekBytes, location, blob)).toThrow(DecryptionError);
    await expect(
      unwrapSubjectDek(kek, subject, { wrapped: blob, kekProvider, kekVersion }),
    ).rejects.toThrow(DecryptionError);
  });
});
