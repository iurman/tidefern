/**
 * What the API calls around every encrypted column and every `subject_keys`
 * row (architecture record 9.2). A field's AAD is the exact string
 * table:column:row_id, so a ciphertext copied into another row or column
 * fails authentication instead of decrypting in the wrong place. A wrapped
 * DEK's AAD is dek:<subjectId>:<kekVersion>, so a wrapped key cannot be
 * reassigned to another subject or replayed under a later KEK.
 *
 * Crypto-shred follows from the layout: once a subject's wrapped DEK row is
 * gone, the only remaining material is the KEK, and the KEK never sealed a
 * field directly, so every field under that DEK is unreadable.
 */

import { randomBytes } from "node:crypto";
import { KEY_BYTES, openBytes, sealBytes } from "./envelope";
import { KeyConfigurationError, type KeyProvider } from "./keys";

export interface FieldLocation {
  table: string;
  column: string;
  rowId: string;
}

export function fieldAad({ table, column, rowId }: FieldLocation): string {
  return `${table}:${column}:${rowId}`;
}

export function dekAad(subjectId: string, kekVersion: string): string {
  return `dek:${subjectId}:${kekVersion}`;
}

/** A fresh 32 byte data encryption key; it leaves the process only wrapped. */
export function generateDek(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

export function encryptField(
  dek: Uint8Array,
  location: FieldLocation,
  plaintext: string,
): Uint8Array {
  return sealBytes(dek, Buffer.from(plaintext, "utf8"), fieldAad(location));
}

export function decryptField(
  dek: Uint8Array,
  location: FieldLocation,
  ciphertext: Uint8Array,
): string {
  const plaintext = openBytes(dek, ciphertext, fieldAad(location));
  return Buffer.from(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).toString("utf8");
}

/** The two columns `subject_keys` stores for a subject. */
export interface WrappedDek {
  wrapped: Uint8Array;
  kekVersion: string;
}

/** Wraps a DEK and records which KEK version did it, so the row can say so. */
export async function wrapSubjectDek(
  provider: KeyProvider,
  subjectId: string,
  dek: Uint8Array,
): Promise<WrappedDek> {
  const wrapped = await provider.wrapDek(dek, dekAad(subjectId, provider.version));
  return { wrapped, kekVersion: provider.version };
}

/** Mints a subject's DEK at sign-up or child creation and returns it with its stored form. */
export async function createSubjectKey(
  provider: KeyProvider,
  subjectId: string,
): Promise<WrappedDek & { dek: Uint8Array }> {
  const dek = generateDek();
  return { dek, ...(await wrapSubjectDek(provider, subjectId, dek)) };
}

/**
 * Unwraps a stored DEK. A row wrapped under another KEK version is refused
 * before any key is used: that is the rotation job's cue to unwrap with the
 * retiring provider and wrap again with the current one.
 */
export async function unwrapSubjectDek(
  provider: KeyProvider,
  subjectId: string,
  record: WrappedDek,
): Promise<Uint8Array> {
  if (record.kekVersion !== provider.version) {
    throw new KeyConfigurationError(
      `wrapped key needs KEK ${record.kekVersion} but the provider is ${provider.version}`,
    );
  }
  return provider.unwrapDek(record.wrapped, dekAad(subjectId, record.kekVersion));
}
