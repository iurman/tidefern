import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { expect } from "vitest";

import { migrationConfig } from "../migrate";
import * as schema from "./index";
import type { createTestDatabase } from "../test/harness";

/**
 * What the per-area schema tests share: synthetic ids, the refusal reader
 * and the journal assertion. Nothing here is exported from the package.
 */
export type Harness = Awaited<ReturnType<typeof createTestDatabase>>;

export type Row = Record<string, unknown>;

// Synthetic ids only; nothing here is a real person.
export const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
export const BEN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
export const CARA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f30";
export const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
export const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
export const OTHER_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f12";
export const ATTESTED_AT = new Date("2026-10-04T18:30:00Z");

/** A fresh UUIDv7-shaped id for the nth row of a test; never a database default. */
export function id(n: number): string {
  return `018f5e7a-2000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

/**
 * Drizzle wraps a driver error in "Failed query: ..." and keeps the
 * Postgres error as `cause`; the constraint or policy name lives there.
 */
export async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : (error as Error).message;
  }
  throw new Error("expected the query to be refused");
}

export async function insertUser(harness: Harness, userId: string, email: string) {
  await harness.db.insert(schema.user).values({ id: userId, name: "A tester", email });
}

export async function insertProfile(harness: Harness, userId: string) {
  await harness.db.insert(schema.profiles).values({
    userId,
    timeZone: "Europe/Berlin",
    ageAttestedAt: ATTESTED_AT,
  });
}

/** The committed journal tags, in order. */
export function journalTags(): string[] {
  const journal = JSON.parse(
    readFileSync(join(migrationConfig.migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

/**
 * Proves the whole journal applied from empty: every committed file's hash
 * is in the migrations table, in order, and `tag` is among them.
 */
export async function expectJournalApplied(harness: Harness, tag: string) {
  expect(journalTags()).toContain(tag);
  const files = readMigrationFiles(migrationConfig);
  const applied = rows(
    await harness.db.execute(
      sql`select hash from drizzle.__drizzle_migrations order by created_at`,
    ),
  );
  expect(applied.map((row) => row.hash)).toEqual(files.map((file) => file.hash));
}

/** `relrowsecurity` per table, for the RLS baseline assertions. */
export async function rowSecurityFlags(harness: Harness): Promise<Record<string, boolean>> {
  const flags = rows(
    await harness.db.execute(
      sql`select relname, relrowsecurity from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    ),
  );
  return Object.fromEntries(flags.map((row) => [row.relname, row.relrowsecurity]));
}

/** The constraint and index names declared on a table, from the catalog. */
export async function constraintNames(harness: Harness, table: string): Promise<string[]> {
  const names = rows(
    await harness.db.execute(
      sql`select conname as name from pg_catalog.pg_constraint where conrelid = ${table}::regclass union select indexname as name from pg_catalog.pg_indexes where schemaname = 'public' and tablename = ${table} order by name`,
    ),
  );
  return names.map((row) => row.name as string);
}
