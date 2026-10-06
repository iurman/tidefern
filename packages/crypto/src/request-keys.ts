/**
 * The per-request key cache of architecture record 9.2, item 4: the API
 * unwraps a subject's DEK once per request and keeps it in memory for that
 * request only. The cache is an object the API constructs per request and
 * drops with it; nothing in this module keeps state at module level, so one
 * warm Fluid compute instance never carries a key from one request into the
 * next. Shared data is decrypted with the owner's DEK after `can()` approves,
 * so a cache may hold several subjects' keys and grants never share keys.
 */

import { decryptField, encryptField } from "./fields";
import type { FieldLocation } from "./fields";
import { unwrapSubjectDek } from "./fields";
import type { KeyProvider } from "./keys";
import { readSubjectKey } from "./provisioning";
import type { KeyDatabase } from "./provisioning";

/** A field plus whose DEK seals it: the subject the row belongs to. */
export interface SubjectFieldLocation extends FieldLocation {
  subjectId: string;
}

/** The DEK was never unwrapped in this request; call `unwrapForSubject` first. */
export class KeyNotUnwrappedError extends Error {
  override readonly name = "KeyNotUnwrappedError";
  readonly subjectId: string;

  constructor(subjectId: string) {
    super("the subject's key has not been unwrapped in this request");
    this.subjectId = subjectId;
  }
}

/**
 * Holds unwrapped DEKs for one request. Concurrent unwraps of the same
 * subject share one database read and one provider call; `clear()` zeroes
 * every key it holds, for a host that wants to scrub before the request
 * object is released.
 */
export class KeyCache {
  readonly #keys = new Map<string, Uint8Array>();
  readonly #pending = new Map<string, Promise<Uint8Array>>();

  /** How many subjects' keys the request has unwrapped so far. */
  get size(): number {
    return this.#keys.size;
  }

  has(subjectId: string): boolean {
    return this.#keys.has(subjectId);
  }

  /** The unwrapped DEK, or undefined when this request has not unwrapped it. */
  peek(subjectId: string): Uint8Array | undefined {
    return this.#keys.get(subjectId);
  }

  /** Unwraps once per subject; every later call for the subject returns the same bytes. */
  resolve(subjectId: string, unwrap: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const held = this.#keys.get(subjectId);
    if (held) return Promise.resolve(held);
    const pending = this.#pending.get(subjectId);
    if (pending) return pending;
    const inFlight = unwrap()
      .then((dek) => {
        this.#keys.set(subjectId, dek);
        return dek;
      })
      .finally(() => {
        this.#pending.delete(subjectId);
      });
    this.#pending.set(subjectId, inFlight);
    return inFlight;
  }

  /** Zeroes and forgets every key. The request is over. */
  clear(): void {
    for (const dek of this.#keys.values()) dek.fill(0);
    this.#keys.clear();
    this.#pending.clear();
  }
}

/** One per request; the API attaches it to the request context and never to a module. */
export function createKeyCache(): KeyCache {
  return new KeyCache();
}

/**
 * The subject's DEK for this request: read from `subject_keys` and unwrapped
 * on the first call, served from the cache afterwards. Reading the row goes
 * through the caller's transaction, so inside `withActor()` the B8 policy on
 * `subject_keys` decides whose key an actor may unwrap.
 */
export function unwrapForSubject(
  db: KeyDatabase,
  subjectId: string,
  provider: KeyProvider,
  cache: KeyCache,
): Promise<Uint8Array> {
  return cache.resolve(subjectId, async () => {
    const record = await readSubjectKey(db, subjectId);
    return unwrapSubjectDek(provider, subjectId, record);
  });
}

function keyFor(cache: KeyCache, subjectId: string): Uint8Array {
  const dek = cache.peek(subjectId);
  if (!dek) throw new KeyNotUnwrappedError(subjectId);
  return dek;
}

/**
 * Seals a field under the subject's DEK with the AAD `table:column:row_id`.
 * Synchronous on purpose: the key must already be in the cache, which keeps
 * the one database read per subject explicit in route code.
 */
export function encryptFieldFor(
  cache: KeyCache,
  location: SubjectFieldLocation,
  plaintext: string,
): Uint8Array {
  const { subjectId, ...field } = location;
  return encryptField(keyFor(cache, subjectId), field, plaintext);
}

/** Opens a field sealed by `encryptFieldFor`; a blob moved to another row or column fails. */
export function decryptFieldFor(
  cache: KeyCache,
  location: SubjectFieldLocation,
  ciphertext: Uint8Array,
): string {
  const { subjectId, ...field } = location;
  return decryptField(keyFor(cache, subjectId), field, ciphertext);
}
