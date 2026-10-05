/**
 * AES-256-GCM sealing shared by both layers of the envelope: a subject's data
 * encryption key seals field values, and the key encryption key seals that
 * data encryption key. One primitive for both keeps the tamper and AAD
 * guarantees identical at every layer.
 *
 * Layout (architecture record 7.3): version || iv || tag || ciphertext. The
 * version byte comes first so a future layout can be refused before any key
 * material is touched. The IV is 12 random bytes per value, the length NIST
 * SP 800-38D recommends for GCM, and the tag is Node's default 16 bytes,
 * written out explicitly so a default change upstream cannot shift the layout.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CIPHERTEXT_VERSION = 1;
export const KEY_BYTES = 32;

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

/** The blob is not a layout this module knows; nothing was decrypted. */
export class UnsupportedCiphertextError extends Error {
  override readonly name = "UnsupportedCiphertextError";
}

/** The tag did not verify: the bytes, the key or the AAD differ from sealing time. */
export class DecryptionError extends Error {
  override readonly name = "DecryptionError";
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new RangeError(`key must be ${KEY_BYTES} bytes, got ${key.byteLength}`);
  }
}

export function sealBytes(key: Uint8Array, plaintext: Uint8Array, aad: string): Uint8Array {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"), { plaintextLength: plaintext.byteLength });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([CIPHERTEXT_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function openBytes(key: Uint8Array, blob: Uint8Array, aad: string): Uint8Array {
  assertKey(key);
  if (blob.byteLength < HEADER_BYTES) {
    throw new UnsupportedCiphertextError("ciphertext is shorter than its header");
  }
  const version = blob[0];
  if (version !== CIPHERTEXT_VERSION) {
    throw new UnsupportedCiphertextError(`unsupported ciphertext version ${version}`);
  }
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, "utf8"), { plaintextLength: ciphertext.byteLength });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Node's own message is kept out so no caller logs anything about the key or AAD.
    throw new DecryptionError("ciphertext failed authentication");
  }
}
