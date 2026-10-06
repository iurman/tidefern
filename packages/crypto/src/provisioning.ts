/**
 * The life of a subject's wrapped DEK in `subject_keys` (architecture record
 * 9.2): minted once when a user signs up or a child is created, read on every
 * request that touches an encrypted column, destroyed when the account or
 * the last guardianship ends. The row is written inside whatever transaction
 * the caller hands in, so a sign-up hook or a child insert decides where the
 * commit boundary lies; nothing here opens a transaction of its own.
 */

import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// The schema subpath only: the package index pulls in the client, which
// builds a pg Pool at import, and nothing here needs a connection of its own.
import * as schema from "@tidefern/db/schema";

import { createSubjectKey } from "./fields";
import type { WrappedDek } from "./fields";
import type { KeyProvider } from "./keys";

/**
 * Any drizzle handle over the schema: the transaction `withActor()` and
 * `withSystem()` hand to route code, or a raw PGlite instance in a test.
 */
export type KeyDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export type SubjectKind = (typeof schema.subjectKindValues)[number];

/** A `subject_keys` row without its key material. */
export interface SubjectKeyRecord {
  subjectId: string;
  kind: SubjectKind;
  kekProvider: string;
  kekVersion: string;
  createdAt: Date;
  rotatedAt: Date | null;
}

export interface ProvisionedSubjectKey extends SubjectKeyRecord {
  /** True when this call minted the key; false when the row already existed. */
  created: boolean;
}

/** The subject has no wrapped key: never provisioned, or already destroyed. */
export class SubjectKeyMissingError extends Error {
  override readonly name = "SubjectKeyMissingError";
  readonly subjectId: string;

  constructor(subjectId: string) {
    super("no wrapped key for the subject");
    this.subjectId = subjectId;
  }
}

/** The existing row says the subject is of another kind than the caller claims. */
export class SubjectKindMismatchError extends Error {
  override readonly name = "SubjectKindMismatchError";
}

/** The row's labels and dates without whatever key material travels beside them. */
function withoutKey(row: SubjectKeyRecord): SubjectKeyRecord {
  return {
    subjectId: row.subjectId,
    kind: row.kind,
    kekProvider: row.kekProvider,
    kekVersion: row.kekVersion,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
  };
}

/**
 * Mints a DEK for the subject, wraps it with the provider and inserts the
 * row in the caller's transaction. A second call for the same subject
 * returns the existing row untouched: the insert is `ON CONFLICT DO
 * NOTHING` on the primary key, so two concurrent callers cannot both mint,
 * and a key is never rotated by provisioning (rotation is its own job,
 * recorded in `rotated_at`). The plaintext DEK is zeroed before returning;
 * a request that needs it unwraps through the cache like any other.
 */
export async function provisionSubjectKey(
  db: KeyDatabase,
  subjectId: string,
  provider: KeyProvider,
  kind: SubjectKind = "user",
): Promise<ProvisionedSubjectKey> {
  const { dek, wrapped, kekProvider, kekVersion } = await createSubjectKey(provider, subjectId);
  dek.fill(0);
  const inserted = await db
    .insert(schema.subjectKeys)
    .values({ subjectId, kind, wrappedDek: wrapped, kekProvider, kekVersion })
    .onConflictDoNothing({ target: schema.subjectKeys.subjectId })
    .returning();
  const row = inserted[0];
  if (row) {
    return { ...withoutKey(row), created: true };
  }
  const existing = await readSubjectKey(db, subjectId);
  if (existing.kind !== kind) {
    throw new SubjectKindMismatchError(
      `subject key exists with kind ${existing.kind}, not ${kind}`,
    );
  }
  return { ...withoutKey(existing), created: false };
}

/** A child's key, minted in the transaction that inserts the child row (task E5). */
export function provisionChildKey(
  db: KeyDatabase,
  childId: string,
  provider: KeyProvider,
): Promise<ProvisionedSubjectKey> {
  return provisionSubjectKey(db, childId, provider, "child");
}

/** The stored row, key material included; what the request cache unwraps from. */
export async function readSubjectKey(
  db: KeyDatabase,
  subjectId: string,
): Promise<SubjectKeyRecord & WrappedDek> {
  const row = await db.query.subjectKeys.findFirst({
    where: eq(schema.subjectKeys.subjectId, subjectId),
  });
  if (!row) throw new SubjectKeyMissingError(subjectId);
  return {
    ...withoutKey(row),
    wrapped: row.wrappedDek,
    kekProvider: row.kekProvider,
    kekVersion: row.kekVersion,
  };
}

/**
 * Crypto-shred for account deletion (task I2) and for a child whose last
 * guardian leaves: once the wrapped key is gone, every ciphertext under it
 * is unreadable, before any row is deleted. Returns false when there was
 * nothing to destroy, so a retried closure step is harmless.
 */
export async function destroySubjectKey(db: KeyDatabase, subjectId: string): Promise<boolean> {
  const removed = await db
    .delete(schema.subjectKeys)
    .where(eq(schema.subjectKeys.subjectId, subjectId))
    .returning({ subjectId: schema.subjectKeys.subjectId });
  return removed.length > 0;
}
