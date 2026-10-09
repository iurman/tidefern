import { randomUUID } from "node:crypto";

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { withActor, withSystem } from "./actor";
import type { ActorDatabase, Transaction } from "./actor";
import type * as clientModule from "./client";
import { ownerDatabase } from "./owner";
import * as schema from "./schema/index";

/**
 * The pooled database check of architecture section 15 (task J9): a real
 * Postgres behind PgBouncer in transaction mode, with NODE_ENV=production,
 * reached through the production client in ./client as tidefern_app. What
 * PGlite cannot show, because it has one session and no pooler: that two
 * actors running at the same time on shared server connections each see
 * only their own rows, and that a server connection PgBouncer hands to the
 * next client carries no role and no actor from the last transaction, after
 * a commit and after a failure alike.
 *
 * DATABASE_URL is the app role's pooled URL and DATABASE_URL_UNPOOLED the
 * owner's direct URL, the same split production uses. Two module instances
 * of ./client stand in for two warm function instances, each with the
 * production pool settings, so four client connections compete for the
 * pooler's server connections. The rows are synthetic, created here through
 * the owner connection and removed at the end.
 */

type Row = Record<string, unknown>;
type AppClient = typeof clientModule;
type AppDatabase = AppClient["db"];

function rows(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

const ITERATIONS = 25;
const ENTRIES_EACH = 3;

// Fresh synthetic ids per run, so a rerun against the same database never collides.
const ANNA = randomUUID();
const BEN = randomUUID();

let first: AppClient;
let second: AppClient;
let owner: ReturnType<typeof ownerDatabase>;

/** Every server backend that ran an actor's transaction, and for whom. */
const actorPids = new Map<number, Set<string>>();

function recordActor(pid: number, actor: string) {
  const seen = actorPids.get(pid) ?? new Set<string>();
  seen.add(actor);
  actorPids.set(pid, seen);
}

/** What a transaction or statement sees of the session it landed on. */
async function sessionFacts(tx: Transaction | AppDatabase) {
  const [row] = rows(
    await tx.execute(
      sql`select pg_backend_pid() as pid, current_user as "user", current_setting('role') as role, coalesce(current_setting('app.actor_id', true), '') as actor, coalesce(current_setting('app.system', true), '') as system`,
    ),
  );
  return row as { pid: number; user: string; role: string; actor: string; system: string };
}

/** The synthetic entries per subject that the caller can see. */
async function visibleSubjects(tx: Transaction | AppDatabase) {
  const seen = rows(
    await tx.execute(
      sql`select subject_id::text as subject, count(*)::int as n from cycle_entries where subject_id in (${ANNA}::uuid, ${BEN}::uuid) group by subject_id`,
    ),
  );
  return Object.fromEntries(seen.map((row) => [row.subject as string, row.n as number]));
}

/**
 * One actor's transaction: it checks its own context, sleeps a little so
 * transactions overlap on the pooler, reads both subjects' rows and the
 * other's rows directly, and records the backend it ran on.
 */
async function actorRound(actor: string, other: string, database: ActorDatabase) {
  return withActor(
    actor,
    async (tx) => {
      const before = await sessionFacts(tx);
      await tx.execute(sql`select pg_sleep(0.005)`);
      const visible = await visibleSubjects(tx);
      const [foreign] = rows(
        await tx.execute(
          sql`select count(*)::int as n from cycle_entries where subject_id = ${other}::uuid`,
        ),
      );
      const after = await sessionFacts(tx);
      return { before, after, visible, foreign: foreign?.n as number };
    },
    database,
  );
}

function expectActorRound(result: Awaited<ReturnType<typeof actorRound>>, actor: string) {
  for (const facts of [result.before, result.after]) {
    expect(facts).toMatchObject({
      user: "tidefern_app",
      role: "tidefern_app",
      actor,
      system: "",
    });
  }
  // A transaction stays on one server backend from begin to commit.
  expect(result.after.pid).toBe(result.before.pid);
  expect(result.visible).toEqual({ [actor]: ENTRIES_EACH });
  expect(result.foreign).toBe(0);
  recordActor(result.before.pid, actor);
}

/** A statement outside withActor: what the next client sees on a reused backend. */
async function bareRound(client: AppClient) {
  const facts = await sessionFacts(client.db);
  const visible = await visibleSubjects(client.db);
  return { facts, visible };
}

function expectClean(result: Awaited<ReturnType<typeof bareRound>>) {
  expect(result.facts).toMatchObject({
    user: "tidefern_app",
    role: "none",
    actor: "",
    system: "",
  });
  // No actor means the policies show nothing, even of rows that exist.
  expect(result.visible).toEqual({});
}

beforeAll(async () => {
  const appUrl = process.env.DATABASE_URL;
  const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!appUrl || !ownerUrl) {
    throw new Error(
      "The pooled suite needs DATABASE_URL (tidefern_app through the pooler) and DATABASE_URL_UNPOOLED (the owner, direct).",
    );
  }
  expect(new URL(appUrl).username).toBe("tidefern_app");

  // Two module instances of the production client: two warm instances.
  first = await import("./client");
  vi.resetModules();
  second = await import("./client");
  expect(second.pool).not.toBe(first.pool);

  owner = ownerDatabase(ownerUrl);
  await withSystem(async (tx) => {
    for (const subject of [ANNA, BEN]) {
      await tx.insert(schema.user).values({
        id: subject,
        name: "A pooled tester",
        email: `pooled-${subject}@example.test`,
      });
      await tx.insert(schema.profiles).values({
        userId: subject,
        timeZone: "Europe/Berlin",
        ageAttestedAt: new Date("2026-10-04T18:30:00Z"),
      });
      await tx.insert(schema.cycleEntries).values(
        Array.from({ length: ENTRIES_EACH }, (_, day) => ({
          id: randomUUID(),
          subjectId: subject,
          date: `2026-09-0${day + 1}`,
          flow: "medium" as const,
        })),
      );
    }
  }, owner);
});

afterAll(async () => {
  if (owner) {
    await withSystem(async (tx) => {
      await tx.delete(schema.user).where(inArray(schema.user.id, [ANNA, BEN]));
    }, owner);
    await owner.$client.end();
  }
  await first?.pool.end();
  await second?.pool.end();
});

describe("the pooled connection", () => {
  test("runs in production mode through the production pool settings", () => {
    expect(process.env.NODE_ENV).toBe("production");
    expect(first.pool.options.max).toBe(2);
    expect(first.pool.options.idleTimeoutMillis).toBe(5000);
    expect(first.pool.options.connectionString).toBe(process.env.DATABASE_URL);
  });

  test("reaches Postgres 18 through something in between, not directly", async () => {
    // Postgres reports the port it listens on, which is not the port in the
    // URL when a pooler sits in front. That the pooler runs in transaction
    // mode is what the sharing test below proves: four client connections
    // that stay open share backends, which session mode never does.
    const [row] = rows(
      await first.db.execute(
        sql`select current_setting('server_version_num')::int as version, inet_server_port() as port`,
      ),
    );
    expect(row?.version as number).toBeGreaterThanOrEqual(180000);
    expect(String(row?.port)).not.toBe(new URL(process.env.DATABASE_URL ?? "").port);
  });
});

describe("the app role", () => {
  test("is neither a superuser nor able to bypass row level security", async () => {
    const [role] = rows(
      await first.db.execute(
        sql`select rolsuper, rolbypassrls from pg_catalog.pg_roles where rolname = current_user`,
      ),
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  test("gets no system context from withSystem", async () => {
    const seen = await withSystem(async (tx) => {
      const facts = await sessionFacts(tx);
      const [system] = rows(await tx.execute(sql`select is_system() as on`));
      return { facts, system: system?.on, visible: await visibleSubjects(tx) };
    }, first.db);
    // The setting is on, the helper refuses it for tidefern_app, and the
    // policies show none of the rows the owner just wrote.
    expect(seen.facts).toMatchObject({ user: "tidefern_app", system: "on" });
    expect(seen.system).toBe(false);
    expect(seen.visible).toEqual({});
  });
});

describe("two actors at once on shared server connections", () => {
  test("each sees only its own rows on every round, and the backends are shared", async () => {
    const bare: Awaited<ReturnType<typeof bareRound>>[] = [];
    let reusedBare = 0;

    for (let round = 0; round < ITERATIONS; round += 1) {
      const knownBefore = new Set(actorPids.keys());
      const [a1, b2, a2, b1, bare1, bare2] = await Promise.all([
        actorRound(ANNA, BEN, first.db),
        actorRound(BEN, ANNA, second.db),
        actorRound(ANNA, BEN, second.db),
        actorRound(BEN, ANNA, first.db),
        bareRound(first),
        bareRound(second),
      ]);
      expectActorRound(a1, ANNA);
      expectActorRound(a2, ANNA);
      expectActorRound(b1, BEN);
      expectActorRound(b2, BEN);
      for (const result of [bare1, bare2]) {
        expectClean(result);
        bare.push(result);
        if (knownBefore.has(result.facts.pid)) reusedBare += 1;
      }
    }

    // Pooler reuse happened: at least one backend served both actors, and
    // statements outside withActor landed on backends an actor had used.
    const shared = [...actorPids.values()].filter((actors) => actors.size === 2);
    expect(shared.length).toBeGreaterThan(0);
    expect(reusedBare).toBeGreaterThan(0);
    console.info(
      `pooled rounds: ${ITERATIONS}, actor transactions: ${ITERATIONS * 4}, backends: ${actorPids.size}, backends shared by both actors: ${shared.length}, bare statements on a reused backend: ${reusedBare} of ${bare.length}`,
    );
  });

  test("a reused backend carries no role and no actor after a commit", async () => {
    await withActor(ANNA, async () => undefined, first.db);
    await withActor(BEN, async () => undefined, second.db);
    const after = await Promise.all(
      Array.from({ length: 8 }, (_, index) => bareRound(index % 2 === 0 ? first : second)),
    );
    for (const result of after) {
      expectClean(result);
      expect(actorPids.has(result.facts.pid)).toBe(true);
    }
  });
});

describe("a failed transaction", () => {
  test("leaves no role and no actor on the backend, whether the code or the SQL failed", async () => {
    const failedOn = new Set<number>();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const database = attempt % 2 === 0 ? first.db : second.db;
      await expect(
        withActor(
          ANNA,
          async (tx) => {
            failedOn.add((await sessionFacts(tx)).pid);
            throw new Error("thrown inside withActor");
          },
          database,
        ),
      ).rejects.toThrow("thrown inside withActor");

      await expect(
        withActor(
          BEN,
          async (tx) => {
            failedOn.add((await sessionFacts(tx)).pid);
            await tx.execute(sql`select 1 / 0`);
          },
          database,
        ),
      ).rejects.toThrow();
    }

    // Statements from both instances until every backend that hosted a
    // failed transaction has been seen clean again.
    const cleanOn = new Set<number>();
    for (let attempt = 0; attempt < 40 && cleanOn.size < failedOn.size; attempt += 1) {
      const results = await Promise.all([bareRound(first), bareRound(second)]);
      for (const result of results) {
        expectClean(result);
        if (failedOn.has(result.facts.pid)) cleanOn.add(result.facts.pid);
      }
    }
    expect([...cleanOn].sort()).toEqual([...failedOn].sort());

    // And the next actor on those backends still sees only her own rows.
    const next = await Promise.all([
      actorRound(BEN, ANNA, first.db),
      actorRound(ANNA, BEN, second.db),
    ]);
    expectActorRound(next[0], BEN);
    expectActorRound(next[1], ANNA);
  });
});
