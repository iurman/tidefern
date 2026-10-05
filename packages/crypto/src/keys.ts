/**
 * Key encryption keys (KEKs) wrap the per-subject data encryption keys that
 * seal free text. The provider is the one seam that changes when the Phase 2
 * gate replaces the environment variable with AWS KMS, so it is kept to two
 * operations and a version label; the field layer never sees a KEK.
 *
 * Phase 2 note for the KMS provider: AWS writes the encryption context in
 * plaintext to CloudTrail, so it may carry opaque identifiers only (subject
 * id, key id, KEK version), never a table or column name. The table and
 * column binding lives in the local AES-GCM AAD, which never leaves the
 * process.
 */

import { KEY_BYTES, openBytes, sealBytes } from "./envelope";

export interface KeyProvider {
  /** Stored beside each wrapped DEK as `kek_version`; "v1" for TIDEFERN_KEK_V1. */
  readonly version: string;
  wrapDek(dek: Uint8Array, aad: string): Promise<Uint8Array> | Uint8Array;
  unwrapDek(wrapped: Uint8Array, aad: string): Promise<Uint8Array> | Uint8Array;
}

/** The provider cannot work with the key material it was given or found. */
export class KeyConfigurationError extends Error {
  override readonly name = "KeyConfigurationError";
}

/**
 * Test-only provider: the key is handed in, so no test reads the environment
 * and a second instance with another key stands in for a rotated KEK.
 */
export class FixedKeyProvider implements KeyProvider {
  readonly version: string;
  readonly #key: Uint8Array;

  constructor(key: Uint8Array, version = "test") {
    if (key.byteLength !== KEY_BYTES) {
      throw new KeyConfigurationError(`fixed key must be exactly ${KEY_BYTES} bytes`);
    }
    this.#key = key;
    this.version = version;
  }

  wrapDek(dek: Uint8Array, aad: string): Uint8Array {
    return sealBytes(this.#key, dek, aad);
  }

  unwrapDek(wrapped: Uint8Array, aad: string): Uint8Array {
    return openBytes(this.#key, wrapped, aad);
  }
}

const ENV_NAME = /^TIDEFERN_KEK_V(\d+)$/;

/**
 * Phase 1 provider: the KEK is base64 of exactly 32 bytes in TIDEFERN_KEK_V1
 * (architecture record 17.1). The variable is read on first use, not at
 * construction, so the API can build its provider at module scope and a
 * build or test process without the variable still starts.
 */
export class EnvKeyProvider implements KeyProvider {
  readonly version: string;
  readonly #name: string;
  #key: Uint8Array | undefined;

  constructor(name = "TIDEFERN_KEK_V1") {
    const match = ENV_NAME.exec(name);
    if (!match) {
      throw new KeyConfigurationError(`${name} is not a TIDEFERN_KEK_V<n> variable name`);
    }
    this.version = `v${match[1]}`;
    this.#name = name;
  }

  wrapDek(dek: Uint8Array, aad: string): Uint8Array {
    return sealBytes(this.#load(), dek, aad);
  }

  unwrapDek(wrapped: Uint8Array, aad: string): Uint8Array {
    return openBytes(this.#load(), wrapped, aad);
  }

  #load(): Uint8Array {
    if (this.#key) return this.#key;
    const raw = process.env[this.#name];
    if (!raw) throw new KeyConfigurationError(`${this.#name} is not set`);
    const key = Buffer.from(raw, "base64");
    if (key.byteLength !== KEY_BYTES) {
      throw new KeyConfigurationError(`${this.#name} must be base64 of exactly ${KEY_BYTES} bytes`);
    }
    this.#key = key;
    return key;
  }
}
