import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MigrationConfig } from "drizzle-orm/migrator";

/**
 * Where the committed journal lives and which table records what was
 * applied. Production (`scripts/migrate.ts`, node-postgres) and the PGlite
 * harness share this so a test proves the same files the build applies.
 */
export const migrationConfig: MigrationConfig = {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  migrationsTable: "__drizzle_migrations",
  migrationsSchema: "drizzle",
};

/**
 * The slice of a drizzle database the runner needs for its own query. The
 * node-postgres instance in production and the PGlite instance in tests
 * both fit it; the driver's `migrate` does everything else.
 */
export interface MigrationDatabase {
  execute(query: SQL): PromiseLike<{ rows: Record<string, unknown>[] }>;
}

/** The statement kinds a Vercel build must never apply on its own. */
export type DestructiveKind = "DROP" | "RENAME" | "ALTER COLUMN ... TYPE" | "TRUNCATE";

/**
 * Thrown before anything is applied when a pending migration contains a
 * contract statement and MIGRATE_DESTRUCTIVE is not exactly "1".
 */
export class DestructiveMigrationError extends Error {
  readonly file: string;
  readonly kind: DestructiveKind;

  constructor(file: string, kind: DestructiveKind) {
    super(
      `Migration ${file} contains ${kind}, which a build never applies on its own. ` +
        "A contract migration runs only from the owner-triggered migrate-production.yml " +
        "workflow, which sets MIGRATE_DESTRUCTIVE=1 after a restore point is noted. " +
        "Nothing was applied.",
    );
    this.name = "DestructiveMigrationError";
    this.file = file;
    this.kind = kind;
  }
}

interface JournalEntry {
  tag: string;
  when: number;
}

/** Matches a dollar-quote opener such as `$$` or `$body$`; `$1` is a parameter, not a quote. */
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Removes everything the scanner must not read as SQL: `--` and block
 * comments (nested, as Postgres nests them), single-quoted literals (with
 * `''`, and backslash escapes in the `E''` form) and double-quoted
 * identifiers. A dollar-quoted body (`$$ ... $$` or `$tag$ ... $tag$`) is
 * one token: its text is kept, on purpose, because a `DO` block that drops
 * a table is still a drop, and it is cleaned the same way, so an apostrophe
 * inside it never opens a literal that swallows the rest of the file. Line
 * structure is kept so statements still split on their semicolons.
 */
function stripSqlNoise(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (ch === "-" && next === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "/" && text[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (text[j] === "*" && text[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      i = j;
      out += " ";
      continue;
    }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(text.slice(i, i + 64))?.[0];
      if (tag) {
        const bodyStart = i + tag.length;
        const end = text.indexOf(tag, bodyStart);
        const bodyEnd = end === -1 ? text.length : end;
        out += ` ${stripSqlNoise(text.slice(bodyStart, bodyEnd))} `;
        i = end === -1 ? text.length : end + tag.length;
        continue;
      }
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const escaped =
        quote === "'" && (text[i - 1] === "E" || text[i - 1] === "e") && !isWordChar(text[i - 2]);
      let j = i + 1;
      while (j < text.length) {
        if (escaped && text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          if (text[j + 1] === quote) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      i = j + 1;
      out += " ";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const KEYWORDS: { kind: DestructiveKind; pattern: RegExp }[] = [
  { kind: "DROP", pattern: /\bdrop\b/i },
  { kind: "TRUNCATE", pattern: /\btruncate\b/i },
  { kind: "RENAME", pattern: /\brename\b/i },
  { kind: "ALTER COLUMN ... TYPE", pattern: /\balter\s+column\b[\s\S]*?\btype\b/i },
];

/**
 * Finds the first contract statement in one migration file, or null when
 * the file is additive. Comments, string literals and quoted identifiers
 * are stripped first, so a comment that mentions DROP or a default value
 * of 'truncate' does not count. The ALTER COLUMN ... TYPE pair is matched
 * inside one statement so a SET DEFAULT in one statement and a TYPE word
 * in a later one cannot pair up.
 */
export function findDestructiveStatement(sqlText: string): DestructiveKind | null {
  for (const statement of stripSqlNoise(sqlText).split(";")) {
    for (const { kind, pattern } of KEYWORDS) {
      if (pattern.test(statement)) {
        return kind;
      }
    }
  }
  return null;
}

function readJournal(folder: string): JournalEntry[] {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

/**
 * The `created_at` of the newest applied migration, or null on a database
 * that has never been migrated (the migrations table does not exist yet).
 * Mirrors the driver's own rule, which treats every journal entry newer
 * than that row as pending.
 */
async function readLastApplied(
  db: MigrationDatabase,
  config: MigrationConfig,
): Promise<number | null> {
  const schema = config.migrationsSchema ?? "drizzle";
  const table = config.migrationsTable ?? "__drizzle_migrations";
  const qualified = `${schema}.${table}`;
  const [exists] = (await db.execute(sql`select to_regclass(${qualified}) as name`)).rows;
  if (!exists?.name) {
    return null;
  }
  const [row] = (
    await db.execute(
      sql`select max(created_at) as last from ${sql.identifier(schema)}.${sql.identifier(table)}`,
    )
  ).rows;
  return row?.last == null ? null : Number(row.last);
}

/**
 * Refuses to go on when a pending file contains a contract statement and
 * the environment does not say MIGRATE_DESTRUCTIVE=1. Applied files are
 * never rescanned, so a contract migration the owner applied once does
 * not block later builds.
 */
export async function assertPendingMigrationsAreAdditive(
  db: MigrationDatabase,
  config: MigrationConfig = migrationConfig,
): Promise<void> {
  if (process.env.MIGRATE_DESTRUCTIVE === "1") {
    return;
  }
  const lastApplied = await readLastApplied(db, config);
  for (const entry of readJournal(config.migrationsFolder)) {
    if (lastApplied !== null && entry.when <= lastApplied) {
      continue;
    }
    const file = `${entry.tag}.sql`;
    const kind = findDestructiveStatement(
      readFileSync(join(config.migrationsFolder, file), "utf8"),
    );
    if (kind) {
      throw new DestructiveMigrationError(file, kind);
    }
  }
}

/**
 * Each drizzle driver ships its own `migrate` (node-postgres, pglite), so the
 * caller passes the one that matches its database; everything else is shared.
 * Every pending file is scanned before the first one is applied, so a refusal
 * leaves the database exactly as it was.
 */
export async function applyMigrations<TDatabase extends MigrationDatabase>(
  db: TDatabase,
  migrate: (db: TDatabase, config: MigrationConfig) => Promise<void>,
  config: MigrationConfig = migrationConfig,
): Promise<void> {
  await assertPendingMigrationsAreAdditive(db, config);
  await migrate(db, config);
}
