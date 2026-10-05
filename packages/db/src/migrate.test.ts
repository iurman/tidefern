import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { MigrationConfig } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  DestructiveMigrationError,
  applyMigrations,
  findDestructiveStatement,
  migrationConfig,
} from "./migrate";

type Row = Record<string, unknown>;

function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

/**
 * A scratch migrations folder with its own journal, so the committed
 * journal is never touched. Each `add` appends one entry, later than the
 * previous one, exactly as drizzle-kit would.
 */
function scratchMigrations() {
  const folder = mkdtempSync(join(tmpdir(), "tidefern-migrations-"));
  mkdirSync(join(folder, "meta"));
  const entries: {
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }[] = [];
  const config: MigrationConfig = { ...migrationConfig, migrationsFolder: folder };
  return {
    config,
    add(tag: string, body: string) {
      const idx = entries.length;
      entries.push({ idx, version: "7", when: 1000 * (idx + 1), tag, breakpoints: true });
      writeFileSync(join(folder, `${tag}.sql`), body);
      writeFileSync(
        join(folder, "meta", "_journal.json"),
        JSON.stringify({ version: "7", dialect: "postgresql", entries }, null, 2),
      );
    },
    remove() {
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

async function withDestructiveAllowed<T>(value: string, fn: () => Promise<T>): Promise<T> {
  process.env.MIGRATE_DESTRUCTIVE = value;
  try {
    return await fn();
  } finally {
    delete process.env.MIGRATE_DESTRUCTIVE;
  }
}

describe("findDestructiveStatement", () => {
  test("catches each contract keyword in any case", () => {
    expect(findDestructiveStatement("DROP TABLE widgets;")).toBe("DROP");
    expect(findDestructiveStatement("drop index if exists widgets_idx;")).toBe("DROP");
    expect(findDestructiveStatement("Truncate Table widgets;")).toBe("TRUNCATE");
    expect(findDestructiveStatement("ALTER TABLE widgets RENAME TO gadgets;")).toBe("RENAME");
    expect(findDestructiveStatement("alter table widgets rename column a to b;")).toBe("RENAME");
    expect(
      findDestructiveStatement("ALTER TABLE widgets ALTER COLUMN label TYPE varchar(10);"),
    ).toBe("ALTER COLUMN ... TYPE");
    expect(
      findDestructiveStatement("ALTER TABLE widgets ALTER COLUMN label SET DATA TYPE text;"),
    ).toBe("ALTER COLUMN ... TYPE");
  });

  test("ignores comments, string literals and quoted identifiers", () => {
    expect(
      findDestructiveStatement(
        [
          "-- drop the old widgets table in the next release, then truncate the log",
          "/* RENAME happens later */",
          "CREATE TABLE notes (",
          '  "type" text NOT NULL,',
          "  body text DEFAULT 'truncate me',",
          "  note text DEFAULT E'it''s a drop'",
          ");",
          "--> statement-breakpoint",
          "ALTER TABLE notes ALTER COLUMN body SET DEFAULT 'rename';",
        ].join("\n"),
      ),
    ).toBeNull();
  });

  test("pairs ALTER COLUMN with TYPE only inside one statement", () => {
    expect(
      findDestructiveStatement(
        "ALTER TABLE notes ALTER COLUMN body SET DEFAULT 1;\nCREATE TYPE mood AS ENUM ('calm');",
      ),
    ).toBeNull();
  });

  test("looks inside DO blocks, where a drop is still a drop", () => {
    expect(
      findDestructiveStatement(
        "DO $$\nBEGIN\n  RAISE NOTICE 'keeping it';\n  DROP TABLE IF EXISTS legacy;\nEND\n$$;",
      ),
    ).toBe("DROP");
  });
});

describe("applyMigrations", () => {
  const scratch = scratchMigrations();
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  async function appliedCount(): Promise<number> {
    const [row] = rows(
      await db.execute(sql`select count(*)::int as total from drizzle.__drizzle_migrations`),
    );
    return row?.total as number;
  }

  async function tableExists(name: string): Promise<boolean> {
    const [row] = rows(await db.execute(sql`select to_regclass(${name}) as name`));
    return row?.name != null;
  }

  beforeAll(() => {
    client = new PGlite();
    db = drizzle({ client });
  });

  afterAll(async () => {
    await client.close();
    scratch.remove();
  });

  test("applies an additive file to an empty database without a migrations table", async () => {
    scratch.add("0000_expand", "CREATE TABLE widgets (id integer PRIMARY KEY, label text);");
    await applyMigrations(db, migrate, scratch.config);
    expect(await appliedCount()).toBe(1);
    expect(await tableExists("widgets")).toBe(true);
  });

  test("refuses a pending DROP without the variable and applies nothing", async () => {
    scratch.add("0001_contract", "DROP TABLE widgets;");
    delete process.env.MIGRATE_DESTRUCTIVE;
    const run = applyMigrations(db, migrate, scratch.config);
    await expect(run).rejects.toBeInstanceOf(DestructiveMigrationError);
    await expect(run).rejects.toMatchObject({ file: "0001_contract.sql", kind: "DROP" });
    await expect(run).rejects.toThrow("0001_contract.sql contains DROP");
    expect(await appliedCount()).toBe(1);
    expect(await tableExists("widgets")).toBe(true);
  });

  test("only the exact value 1 counts", async () => {
    await withDestructiveAllowed("true", async () => {
      await expect(applyMigrations(db, migrate, scratch.config)).rejects.toBeInstanceOf(
        DestructiveMigrationError,
      );
    });
    expect(await appliedCount()).toBe(1);
  });

  test("applies the same file with MIGRATE_DESTRUCTIVE=1", async () => {
    await withDestructiveAllowed("1", () => applyMigrations(db, migrate, scratch.config));
    expect(process.env.MIGRATE_DESTRUCTIVE).toBeUndefined();
    expect(await appliedCount()).toBe(2);
    expect(await tableExists("widgets")).toBe(false);
  });

  test("never rescans an applied contract file", async () => {
    await applyMigrations(db, migrate, scratch.config);
    expect(await appliedCount()).toBe(2);
  });

  test("lets a comment mentioning DROP and a literal containing truncate through", async () => {
    scratch.add(
      "0002_quiet",
      [
        "-- DROP the widgets leftovers once the notes table is in use",
        "CREATE TABLE notes (id integer PRIMARY KEY, body text DEFAULT 'truncate me');",
      ].join("\n"),
    );
    await applyMigrations(db, migrate, scratch.config);
    expect(await appliedCount()).toBe(3);
    expect(await tableExists("notes")).toBe(true);
  });

  test("catches ALTER COLUMN ... TYPE", async () => {
    scratch.add("0003_retype", "ALTER TABLE notes ALTER COLUMN body TYPE varchar(10);");
    await expect(applyMigrations(db, migrate, scratch.config)).rejects.toMatchObject({
      file: "0003_retype.sql",
      kind: "ALTER COLUMN ... TYPE",
    });
    expect(await appliedCount()).toBe(3);
    await withDestructiveAllowed("1", () => applyMigrations(db, migrate, scratch.config));
    expect(await appliedCount()).toBe(4);
  });

  test("catches RENAME", async () => {
    scratch.add("0004_rename", "ALTER TABLE notes RENAME TO memos;");
    await expect(applyMigrations(db, migrate, scratch.config)).rejects.toMatchObject({
      file: "0004_rename.sql",
      kind: "RENAME",
    });
    expect(await appliedCount()).toBe(4);
    expect(await tableExists("notes")).toBe(true);
  });
});
