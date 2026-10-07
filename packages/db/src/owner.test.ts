import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

// Vercel's helper is replaced by a spy: the test checks that the owner pool
// is handed to it like the app pool, not what Vercel does with a pool.
vi.mock("@vercel/functions", () => ({ attachDatabasePool: vi.fn() }));

import { attachDatabasePool } from "@vercel/functions";
import type { Pool } from "pg";

import type { ActorDatabase } from "./actor";
import { pool as appPool } from "./client";
import { ownerDatabase } from "./owner";

// A test-only string. Nothing is dialled: a pool connects on its first
// query, and no test here runs one.
const OWNER_URL = "postgresql://owner:test-only-password@127.0.0.1:9/tidefern";

const built: Pool[] = [];

function build() {
  const db = ownerDatabase(OWNER_URL);
  built.push(db.$client);
  return db;
}

beforeEach(() => {
  vi.mocked(attachDatabasePool).mockClear();
});

afterAll(async () => {
  await Promise.all(built.map((pool) => pool.end()));
});

describe("ownerDatabase", () => {
  test("is one pool of a single connection on the owner URL, handed to attachDatabasePool", () => {
    const db = build();
    // The job runner takes it wherever an ActorDatabase goes (`jobs.db`).
    const runner: ActorDatabase = db;
    expect(typeof runner.transaction).toBe("function");
    expect(db.$client.options.connectionString).toBe(OWNER_URL);
    expect(db.$client.options.max).toBe(1);
    expect(attachDatabasePool).toHaveBeenCalledTimes(1);
    expect(attachDatabasePool).toHaveBeenCalledWith(db.$client);
  });

  test("keeps the app pool's idle timeout, since attachDatabasePool times both with one timer", () => {
    const pool = build().$client;
    expect(pool.options.idleTimeoutMillis).toBe(5000);
    expect(pool.options.idleTimeoutMillis).toBe(appPool.options.idleTimeoutMillis);
  });

  test("opens no connection until the first query", () => {
    const pool = build().$client;
    expect(pool.totalCount).toBe(0);
    expect(pool.idleCount).toBe(0);
  });

  test("refuses an empty or missing string and builds nothing", () => {
    expect(() => ownerDatabase("")).toThrow(TypeError);
    expect(() => ownerDatabase(undefined as unknown as string)).toThrow("DATABASE_URL_UNPOOLED");
    expect(attachDatabasePool).not.toHaveBeenCalled();
  });

  test("logs an idle client's error by name and driver code only, and does not throw", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const pool = build().$client;
      const terminated = Object.assign(
        new Error(`terminating connection to ${OWNER_URL} due to administrator command`),
        { code: "57P01" },
      );
      expect(() => pool.emit("error", terminated, undefined)).not.toThrow();
      expect(() => pool.emit("error", new TypeError("socket closed"), undefined)).not.toThrow();
      expect(logged.mock.calls).toEqual([
        ["owner_pool_error", { name: "Error", code: "57P01" }],
        ["owner_pool_error", { name: "TypeError" }],
      ]);
      const lines = JSON.stringify(logged.mock.calls);
      expect(lines).not.toContain("test-only-password");
      expect(lines).not.toContain("administrator");
    } finally {
      logged.mockRestore();
    }
  });
});
