import { TransactionRollbackError, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withActor } from "./actor";
import type { Transaction } from "./actor";
import * as schema from "./schema/index";
import {
  ANNA,
  BEN,
  CARA,
  CHILD,
  HOUSEHOLD,
  OTHER_CHILD,
  expectJournalApplied,
  id,
  insertUser,
  refusal,
  rows,
} from "./schema/testing";
import type { Harness, Row } from "./schema/testing";
import { createTestDatabase } from "./test/harness";

/**
 * Task E10, migration 0013: `revoke_closure_grants()`, the SECURITY DEFINER
 * step of account closure that the closing person's own policies refuse,
 * and the marker terms it writes through. Everything runs through
 * withActor(), which drops to tidefern_app, the role the request pool is on
 * CI and in production; the bound-owner block re-owns the function to a
 * role that cannot bypass RLS, the shape of a Neon owner under FORCE.
 *
 * The cast: Anna closes. She shares her history with Ben, holds Ben's
 * status card and a child grant Ben gave her over Lu, and still owns a
 * child grant to Cara over Mo although she stepped down as his guardian.
 * Ben guards both children. Holding nothing over Mo, she has no key
 * relationship to him, so her own audit policy refuses a row about him.
 * Ben shares his status with Cara, which is not hers. A grant of hers
 * revoked last month and a tombstoned one stay as they are. Dana has no
 * relationship with anyone until the bound-owner block.
 *
 * The same migration ends the search_path of every function in public with
 * pg_temp, and the last block proves on a database of its own that a
 * temporary table the app role creates under a real table's name no longer
 * stands in for it.
 */
let harness: Harness;

// Synthetic ids only; nothing here is a real person.
const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";

const ANNA_TO_BEN = id(1);
const BEN_TO_ANNA = id(2);
const BEN_TO_ANNA_CHILD = id(3);
const ANNA_TO_CARA_CHILD = id(4);
const BEN_TO_CARA = id(5);
const ANNA_REVOKED = id(6);
const ANNA_TOMBSTONED = id(7);
const CARA_TO_BEN = id(8);

const CLOSING_AT = new Date("2026-10-05T09:30:00.000Z");
const EARLIER = new Date("2026-09-01T00:00:00.000Z");

const VERSIONS = { policyVersion: "2026-10", descriptionVersion: "2026-10" };

async function revokeAs(actor: string, at: Date | null): Promise<unknown> {
  return withActor(
    actor,
    async (tx) => {
      const instant = at === null ? sql`null::timestamptz` : sql`${at.toISOString()}::timestamptz`;
      const [row] = rows(await tx.execute(sql`select revoke_closure_grants(${instant}) as ok`));
      return row?.ok;
    },
    harness.db,
  );
}

async function grantRows(ids: readonly string[]) {
  return harness.db
    .select({
      id: schema.grants.id,
      revokedAt: schema.grants.revokedAt,
      updatedAt: schema.grants.updatedAt,
      version: schema.grants.version,
      deletedAt: schema.grants.deletedAt,
    })
    .from(schema.grants)
    .where(inArray(schema.grants.id, [...ids]))
    .orderBy(schema.grants.id);
}

async function revocationsBy(actor: string): Promise<Row[]> {
  return rows(
    await harness.db.execute(
      sql`select subject_id, category::text as category, child_id, occurred_at, dedupe_key from audit_events where actor_id = ${actor}::uuid and action = 'grant.revoke' order by subject_id, category, child_id`,
    ),
  );
}

async function openClosureFor(userId: string, requestId: string, on: Harness = harness) {
  await on.db.insert(schema.dataRequests).values({
    id: requestId,
    userId,
    kind: "closure",
    state: "requested",
    requestedAt: CLOSING_AT,
    deadlineAt: new Date(CLOSING_AT.getTime() + 45 * 24 * 60 * 60_000),
    undoUntil: new Date(CLOSING_AT.getTime() + 7 * 24 * 60 * 60_000),
  });
}

/**
 * Runs `run` in one owner transaction after `statement` and rolls it all
 * back, so a policy can be put back as 0007 wrote it for one proof.
 */
async function rolledBack<T>(statement: SQL, run: (tx: Transaction) => Promise<T>): Promise<T> {
  let outcome: T | undefined;
  try {
    await harness.db.transaction(async (tx) => {
      await tx.execute(statement);
      outcome = await run(tx as unknown as Transaction);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  return outcome as T;
}

beforeAll(async () => {
  harness = await createTestDatabase();
  for (const [userId, email] of [
    [ANNA, "anna@example.test"],
    [BEN, "ben@example.test"],
    [CARA, "cara@example.test"],
    [DANA, "dana@example.test"],
  ] as const) {
    await insertUser(harness, userId, email);
  }
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
  await harness.db.insert(schema.children).values([
    { id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" },
    { id: OTHER_CHILD, householdId: HOUSEHOLD, displayName: "Lu", dateOfBirth: "2024-05-01" },
  ]);
  // Ben guards both; Anna stepped down as Mo's guardian, which left the
  // grant she gave over him in place.
  await harness.db.insert(schema.childGuardians).values([
    { id: id(20), childId: CHILD, userId: BEN },
    { id: id(21), childId: OTHER_CHILD, userId: BEN },
  ]);
  await harness.db.insert(schema.grants).values([
    {
      id: ANNA_TO_BEN,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.history",
      level: "read",
      ...VERSIONS,
    },
    {
      id: BEN_TO_ANNA,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.status",
      level: "summary",
      ...VERSIONS,
    },
    {
      id: BEN_TO_ANNA_CHILD,
      ownerId: BEN,
      granteeId: ANNA,
      category: "child",
      level: "read",
      childId: OTHER_CHILD,
      ...VERSIONS,
    },
    {
      id: ANNA_TO_CARA_CHILD,
      ownerId: ANNA,
      granteeId: CARA,
      category: "child",
      level: "read",
      childId: CHILD,
      ...VERSIONS,
    },
    {
      id: BEN_TO_CARA,
      ownerId: BEN,
      granteeId: CARA,
      category: "cycle.status",
      level: "summary",
      ...VERSIONS,
    },
    {
      id: ANNA_REVOKED,
      ownerId: ANNA,
      granteeId: DANA,
      category: "pregnancy.overview",
      level: "read",
      revokedAt: EARLIER,
      ...VERSIONS,
    },
    {
      id: ANNA_TOMBSTONED,
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.symptoms",
      level: "read",
      deletedAt: EARLIER,
      ...VERSIONS,
    },
    {
      id: CARA_TO_BEN,
      ownerId: CARA,
      granteeId: BEN,
      category: "cycle.symptoms",
      level: "read",
      ...VERSIONS,
    },
  ]);
});

afterAll(async () => {
  await harness.close();
});

describe("migration 0013", () => {
  test("applies from empty in journal order", async () => {
    await expectJournalApplied(harness, "0013_closure_grant_revocation_and_search_path");
  });

  test("declares revoke_closure_grants SECURITY DEFINER and VOLATILE with pg_temp last and the marker, one instant in, a boolean out", async () => {
    const functions = rows(
      await harness.db.execute(
        sql`select p.oid::regprocedure::text as signature, p.prosecdef as definer, p.provolatile as volatility, p.proconfig as config, pg_catalog.pg_get_function_result(p.oid) as result from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'revoke_closure_grants'`,
      ),
    );
    expect(functions).toEqual([
      {
        signature: "revoke_closure_grants(timestamp with time zone)",
        definer: true,
        volatility: "v",
        config: ["search_path=pg_catalog, public, pg_temp", "app.policy_helper=on"],
        result: "boolean",
      },
    ]);
  });

  test("lets the app role call it and nobody by default", async () => {
    await harness.db.execute(sql`create role tidefern_e10_probe nologin`);
    const [privileges] = rows(
      await harness.db.execute(
        sql`select has_function_privilege('tidefern_app', 'revoke_closure_grants(timestamptz)', 'execute') as app, has_function_privilege('tidefern_e10_probe', 'revoke_closure_grants(timestamptz)', 'execute') as anyone`,
      ),
    );
    expect(privileges).toEqual({ app: true, anyone: false });
  });

  test("lets the marker into grants_update and audit_events_insert only for the actor's own rows", async () => {
    const policies = rows(
      await harness.db.execute(
        sql`select policyname, qual, with_check from pg_catalog.pg_policies where policyname in ('grants_update', 'audit_events_insert') order by policyname`,
      ),
    );
    const [audit, grants] = policies;
    expect(audit?.with_check).toMatch(/in_policy_helper\(\) AND \(actor_id = current_actor\(\)\)/);
    const party =
      /in_policy_helper\(\) AND \(\(owner_id = current_actor\(\)\) OR \(grantee_id = current_actor\(\)\)\)/;
    expect(grants?.qual).toMatch(party);
    expect(grants?.with_check).toMatch(party);
  });
});

describe("revoke_closure_grants", () => {
  test("refuses an actor with no open closure and writes nothing", async () => {
    expect(await revokeAs(ANNA, CLOSING_AT)).toBe(false);
    // A closure that is over does not count either.
    await harness.db.insert(schema.dataRequests).values({
      id: id(30),
      userId: ANNA,
      kind: "closure",
      state: "cancelled",
      requestedAt: EARLIER,
      deadlineAt: CLOSING_AT,
      undoUntil: CLOSING_AT,
      completedAt: EARLIER,
    });
    expect(await revokeAs(ANNA, CLOSING_AT)).toBe(false);
    for (const grant of await grantRows([ANNA_TO_BEN, BEN_TO_ANNA, ANNA_TO_CARA_CHILD])) {
      expect(grant.revokedAt).toBeNull();
      expect(grant.version).toBe(1);
    }
    expect(await revocationsBy(ANNA)).toEqual([]);
  });

  test("refuses the app role with no actor, and an actor with no instant", async () => {
    await openClosureFor(ANNA, id(31));
    const anonymous = await harness.db.transaction(async (tx) => {
      await tx.execute(sql`set local role tidefern_app`);
      const [row] = rows(
        await tx.execute(
          sql`select revoke_closure_grants(${CLOSING_AT.toISOString()}::timestamptz) as ok`,
        ),
      );
      return row?.ok;
    });
    expect(anonymous).toBe(false);
    expect(await revokeAs(ANNA, null)).toBe(false);
    expect(await revocationsBy(ANNA)).toEqual([]);
  });

  test("leaves Anna's grants alone when Ben calls it, since the closure is not his", async () => {
    expect(await revokeAs(BEN, CLOSING_AT)).toBe(false);
    for (const grant of await grantRows([ANNA_TO_BEN, BEN_TO_ANNA, BEN_TO_CARA])) {
      expect(grant.revokedAt).toBeNull();
    }
  });

  test("would be refused as Anna herself: the grant she holds matches no row, and the child row is not hers to file", async () => {
    const held = await withActor(
      ANNA,
      (tx) =>
        tx
          .update(schema.grants)
          .set({ revokedAt: CLOSING_AT })
          .where(eq(schema.grants.id, BEN_TO_ANNA))
          .returning({ id: schema.grants.id }),
      harness.db,
    );
    expect(held).toEqual([]);
    const message = await refusal(
      withActor(
        ANNA,
        (tx) =>
          tx.insert(schema.auditEvents).values({
            id: id(40),
            actorId: ANNA,
            action: "grant.revoke",
            subjectId: CHILD,
            category: "child",
            childId: CHILD,
          }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "audit_events"/);
  });

  test("revokes every live grant she gave or holds at the instant given, each with one row in her name", async () => {
    expect(await revokeAs(ANNA, CLOSING_AT)).toBe(true);

    const revoked = await grantRows([
      ANNA_TO_BEN,
      BEN_TO_ANNA,
      BEN_TO_ANNA_CHILD,
      ANNA_TO_CARA_CHILD,
    ]);
    expect(revoked).toHaveLength(4);
    for (const grant of revoked) {
      expect(grant.revokedAt?.toISOString()).toBe(CLOSING_AT.toISOString());
      expect(grant.updatedAt.toISOString()).toBe(CLOSING_AT.toISOString());
      expect(grant.version).toBe(2);
    }
    // Ben's grant to Cara is not hers; the old revocation keeps its instant;
    // the tombstone is not a live grant.
    const untouched = await grantRows([BEN_TO_CARA, ANNA_REVOKED, ANNA_TOMBSTONED, CARA_TO_BEN]);
    expect(
      untouched.map((grant) => [grant.id, grant.revokedAt?.toISOString() ?? null, grant.version]),
    ).toEqual([
      [BEN_TO_CARA, null, 1],
      [ANNA_REVOKED, EARLIER.toISOString(), 1],
      [ANNA_TOMBSTONED, null, 1],
      [CARA_TO_BEN, null, 1],
    ]);

    // The subject is the child for a child grant and the owner otherwise,
    // as the API's audit helper files them; one row per grant, no dedupe
    // key, in subject order (Anna, Mo, Lu, Ben by id). The row about Mo is
    // the one her own policy refused above.
    const at = CLOSING_AT.toISOString();
    expect(
      (await revocationsBy(ANNA)).map((row) => ({
        ...row,
        occurred_at: new Date(row.occurred_at as string).toISOString(),
      })),
    ).toEqual([
      {
        subject_id: ANNA,
        category: "cycle.history",
        child_id: null,
        occurred_at: at,
        dedupe_key: null,
      },
      {
        subject_id: CHILD,
        category: "child",
        child_id: CHILD,
        occurred_at: at,
        dedupe_key: null,
      },
      {
        subject_id: OTHER_CHILD,
        category: "child",
        child_id: OTHER_CHILD,
        occurred_at: at,
        dedupe_key: null,
      },
      {
        subject_id: BEN,
        category: "cycle.status",
        child_id: null,
        occurred_at: at,
        dedupe_key: null,
      },
    ]);
  });

  test("revokes nothing twice when it runs again", async () => {
    expect(await revokeAs(ANNA, new Date(CLOSING_AT.getTime() + 60_000))).toBe(true);
    for (const grant of await grantRows([ANNA_TO_BEN, BEN_TO_ANNA, ANNA_TO_CARA_CHILD])) {
      expect(grant.revokedAt?.toISOString()).toBe(CLOSING_AT.toISOString());
      expect(grant.version).toBe(2);
    }
    expect(await revocationsBy(ANNA)).toHaveLength(4);
  });

  test("gives the app role nothing when it sets the marker by hand", async () => {
    const marked = await withActor(
      BEN,
      async (tx) => {
        await tx.execute(sql`select set_config('app.policy_helper', 'on', true)`);
        // Cara's grant to Ben is one he holds: the owner's alone to revoke.
        const updated = await tx
          .update(schema.grants)
          .set({ revokedAt: CLOSING_AT })
          .where(eq(schema.grants.id, CARA_TO_BEN))
          .returning({ id: schema.grants.id });
        return updated.length;
      },
      harness.db,
    );
    expect(marked).toBe(0);
    const message = await refusal(
      withActor(
        BEN,
        async (tx) => {
          await tx.execute(sql`select set_config('app.policy_helper', 'on', true)`);
          await tx.insert(schema.auditEvents).values({
            id: id(41),
            actorId: BEN,
            action: "grant.revoke",
            subjectId: DANA,
          });
        },
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "audit_events"/);
  });
});

/**
 * On Neon the function is owned by the console role, which FORCE binds to
 * the policies. Re-owned here to such a role, it must still revoke the
 * grant Cara holds and file the child row she could not, through the two
 * marker terms; with either policy as 0007 wrote it, it cannot.
 */
describe("with the function owned by a role that cannot bypass RLS", () => {
  const DANA_TO_CARA = id(50);
  const CARA_TO_DANA_CHILD = id(51);
  const DANA_TO_BEN = id(53);
  const call = sql`select revoke_closure_grants(${CLOSING_AT.toISOString()}::timestamptz) as ok`;

  beforeAll(async () => {
    await harness.db.execute(sql`create role tidefern_e10_bound nologin nobypassrls noinherit`);
    await harness.db.execute(sql`grant usage on schema public to tidefern_e10_bound`);
    await harness.db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to tidefern_e10_bound`,
    );
    await harness.db.execute(
      sql`alter function revoke_closure_grants(timestamptz) owner to tidefern_e10_bound`,
    );
    // Cara closes now: she owns her grant to Ben, holds Ben's and one from
    // Dana, and owns a child grant to Dana over Lu, whom she never guarded
    // and holds nothing over. Dana's grant to Ben is nobody's closure.
    await harness.db.insert(schema.grants).values([
      {
        id: DANA_TO_CARA,
        ownerId: DANA,
        granteeId: CARA,
        category: "cycle.status",
        level: "summary",
        ...VERSIONS,
      },
      {
        id: CARA_TO_DANA_CHILD,
        ownerId: CARA,
        granteeId: DANA,
        category: "child",
        level: "read",
        childId: OTHER_CHILD,
        ...VERSIONS,
      },
      {
        id: DANA_TO_BEN,
        ownerId: DANA,
        granteeId: BEN,
        category: "cycle.history",
        level: "read",
        ...VERSIONS,
      },
    ]);
    await openClosureFor(CARA, id(52));
  });

  test("runs it as the bound role", async () => {
    const [owner] = rows(
      await harness.db.execute(
        sql`select r.rolname as owner, r.rolbypassrls as bypass from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner where p.proname = 'revoke_closure_grants'`,
      ),
    );
    expect(owner).toEqual({ owner: "tidefern_e10_bound", bypass: false });
  });

  test("needs the marker in grants_update: without it the grant she holds stays live", async () => {
    const live = await rolledBack(
      sql`alter policy grants_update on grants using (is_system() or owner_id = current_actor() or (child_id is not null and is_guardian(child_id))) with check (is_system() or owner_id = current_actor() or (child_id is not null and is_guardian(child_id)))`,
      async (tx) => {
        await tx.execute(sql`select set_config('app.actor_id', ${CARA}, true)`);
        await tx.execute(sql`set local role tidefern_app`);
        await tx.execute(call);
        const [row] = rows(
          await tx.execute(
            sql`select revoked_at is null as live from grants where id = ${DANA_TO_CARA}::uuid`,
          ),
        );
        return row?.live;
      },
    );
    expect(live).toBe(true);
  });

  test("needs the marker in audit_events_insert: without it the child row is refused", async () => {
    const message = await rolledBack(
      sql`alter policy audit_events_insert on audit_events with check (is_system() or (actor_id = current_actor() and can_use_key(subject_id)))`,
      async (tx) => {
        await tx.execute(sql`select set_config('app.actor_id', ${CARA}, true)`);
        await tx.execute(sql`set local role tidefern_app`);
        return refusal(tx.execute(call));
      },
    );
    expect(message).toMatch(/row-level security policy for table "audit_events"/);
  });

  test("still revokes every grant in both directions and files every row", async () => {
    const ok = await withActor(CARA, async (tx) => rows(await tx.execute(call))[0]?.ok, harness.db);
    expect(ok).toBe(true);
    const grants = await grantRows([CARA_TO_BEN, BEN_TO_CARA, DANA_TO_CARA, CARA_TO_DANA_CHILD]);
    expect(grants).toHaveLength(4);
    for (const grant of grants) {
      expect(grant.revokedAt?.toISOString()).toBe(CLOSING_AT.toISOString());
      expect(grant.version).toBe(2);
    }
    // In subject order: Lu, Ben, Cara, Dana by id.
    expect((await revocationsBy(CARA)).map((row) => `${row.subject_id}/${row.category}`)).toEqual([
      `${OTHER_CHILD}/child`,
      `${BEN}/cycle.status`,
      `${CARA}/cycle.symptoms`,
      `${DANA}/cycle.status`,
    ]);
    // Dana's grant to Ben is not Cara's, and the child grant Anna gave Cara
    // keeps the revocation Anna's closure wrote.
    const [danaToBen] = await grantRows([DANA_TO_BEN]);
    expect(danaToBen).toMatchObject({ revokedAt: null, version: 1 });
    const [annaToCara] = await grantRows([ANNA_TO_CARA_CHILD]);
    expect(annaToCara?.revokedAt?.toISOString()).toBe(CLOSING_AT.toISOString());
    expect(annaToCara?.version).toBe(2);
  });
});

/**
 * B8 and B14 wrote SET search_path = pg_catalog, public. With pg_temp left
 * out of the path, Postgres searches the session's temporary schema first
 * for tables and types, and the app role may create temporary tables, so it
 * could hand any function its own copy of a table. Each attempt below
 * worked with that path; the migration now ends every path with pg_temp.
 * Every attempt discards the session's cached plans first, as an attacker
 * on a fresh connection would have none, so no attempt leans on the order
 * the tests run in. A database of its own: Anna guards Mo and has verified
 * her address, Ben guards nobody, and they share one grant each way.
 */
describe("a temporary table named like a real one", () => {
  const HARDENED = "search_path=pg_catalog, public, pg_temp";
  const ANNA_TO_BEN_HERE = id(60);
  const BEN_TO_ANNA_HERE = id(61);
  const call = sql`select revoke_closure_grants(${CLOSING_AT.toISOString()}::timestamptz) as ok`;
  let fresh: Harness;

  /** Runs `fn` as `actor` on this block's database, with no cached plan. */
  function attempt<T>(actor: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return withActor(
      actor,
      async (tx) => {
        await tx.execute(sql`discard plans`);
        return fn(tx);
      },
      fresh.db,
    );
  }

  async function liveGrants() {
    return fresh.db
      .select({ id: schema.grants.id, revokedAt: schema.grants.revokedAt })
      .from(schema.grants)
      .orderBy(schema.grants.id);
  }

  beforeAll(async () => {
    fresh = await createTestDatabase();
    for (const [userId, email] of [
      [ANNA, "anna@example.test"],
      [BEN, "ben@example.test"],
      [CARA, "cara@example.test"],
    ] as const) {
      await insertUser(fresh, userId, email);
    }
    await fresh.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, ANNA));
    await fresh.db.insert(schema.households).values({ id: HOUSEHOLD });
    await fresh.db
      .insert(schema.children)
      .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" });
    await fresh.db
      .insert(schema.childGuardians)
      .values({ id: id(62), childId: CHILD, userId: ANNA });
    await fresh.db.insert(schema.grants).values([
      {
        id: ANNA_TO_BEN_HERE,
        ownerId: ANNA,
        granteeId: BEN,
        category: "cycle.history",
        level: "read",
        ...VERSIONS,
      },
      {
        id: BEN_TO_ANNA_HERE,
        ownerId: BEN,
        granteeId: ANNA,
        category: "cycle.status",
        level: "summary",
        ...VERSIONS,
      },
    ]);
  });

  afterAll(async () => {
    await fresh.close();
  });

  test("ends the search_path of every function in public with pg_temp", async () => {
    const functions = rows(
      await fresh.db.execute(
        sql`select p.oid::regprocedure::text as signature, p.proconfig as config from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace order by signature`,
      ),
    );
    expect(functions.map((row) => row.signature)).toEqual(
      expect.arrayContaining([
        "current_actor()",
        "actor_email()",
        "is_guardian(uuid)",
        "can_use_key(uuid)",
        "cycle_status_for(uuid)",
        "revoke_closure_grants(timestamp with time zone)",
      ]),
    );
    // A function added later fails here, by name, until its path does too.
    expect(
      functions
        .filter((row) => !((row.config as string[] | null) ?? []).includes(HARDENED))
        .map((row) => row.signature),
    ).toEqual([]);
  });

  test("cannot make Ben a guardian of Mo", async () => {
    const seen = await attempt(BEN, async (tx) => {
      await tx.execute(
        sql`create temp table child_guardians (child_id uuid, user_id uuid) on commit drop`,
      );
      await tx.execute(
        sql`insert into pg_temp.child_guardians values (${CHILD}::uuid, current_actor())`,
      );
      const [guardian] = rows(await tx.execute(sql`select is_guardian(${CHILD}::uuid) as yes`));
      const [children] = rows(
        await tx.execute(sql`select count(*)::int as n from public.children`),
      );
      return { guardian: guardian?.yes, children: children?.n };
    });
    expect(seen).toEqual({ guardian: false, children: 0 });
  });

  test("cannot let in an audit row in Anna's name about Cara", async () => {
    const message = await refusal(
      attempt(ANNA, async (tx) => {
        await tx.execute(
          sql`create temp table grants (owner_id uuid, grantee_id uuid, category text, child_id uuid, revoked_at timestamptz) on commit drop`,
        );
        await tx.execute(
          sql`insert into pg_temp.grants values (${CARA}::uuid, current_actor(), 'cycle.history', null, null)`,
        );
        await tx.execute(
          sql`insert into public.audit_events (id, actor_id, action, subject_id, category) values (${id(63)}::uuid, current_actor(), 'grant.revoke', ${CARA}::uuid, 'cycle.history')`,
        );
      }),
    );
    expect(message).toMatch(/row-level security policy for table "audit_events"/);
  });

  test("cannot give actor_email() another person's address", async () => {
    const email = await attempt(ANNA, async (tx) => {
      await tx.execute(
        sql`create temp table "user" (id uuid, email text, email_verified boolean) on commit drop`,
      );
      await tx.execute(
        sql`insert into pg_temp."user" values (current_actor(), 'someone@example.test', true)`,
      );
      const [row] = rows(await tx.execute(sql`select actor_email() as email`));
      return row?.email;
    });
    expect(email).toBe("anna@example.test");
  });

  test("cannot stand in for a closure Anna never filed", async () => {
    const ok = await attempt(ANNA, async (tx) => {
      await tx.execute(
        sql`create temp table data_requests (user_id uuid, kind text, state text) on commit drop`,
      );
      await tx.execute(
        sql`insert into pg_temp.data_requests values (current_actor(), 'closure', 'requested')`,
      );
      return rows(await tx.execute(call))[0]?.ok;
    });
    expect(ok).toBe(false);
    expect(await liveGrants()).toEqual([
      { id: ANNA_TO_BEN_HERE, revokedAt: null },
      { id: BEN_TO_ANNA_HERE, revokedAt: null },
    ]);
    expect(rows(await fresh.db.execute(sql`select count(*)::int as n from audit_events`))).toEqual([
      { n: 0 },
    ]);
  });

  test("revokes and audits in the real tables when Ben closes beside copies of both", async () => {
    await openClosureFor(BEN, id(64), fresh);
    const inside = await attempt(BEN, async (tx) => {
      await tx.execute(
        sql`create temp table grants (owner_id uuid, grantee_id uuid, category text, child_id uuid, revoked_at timestamptz, deleted_at timestamptz, updated_at timestamptz, version int) on commit drop`,
      );
      await tx.execute(
        sql`insert into pg_temp.grants values (${CARA}::uuid, current_actor(), 'cycle.history', null, null, null, now(), 1)`,
      );
      await tx.execute(
        sql`create temp table audit_events (id uuid, actor_id uuid, action text, subject_id uuid, category text, child_id uuid, occurred_at timestamptz) on commit drop`,
      );
      const ok = rows(await tx.execute(call))[0]?.ok;
      const [copies] = rows(
        await tx.execute(
          sql`select (select count(*)::int from pg_temp.grants where revoked_at is null) as live, (select count(*)::int from pg_temp.audit_events) as audited`,
        ),
      );
      return { ok, copies };
    });
    expect(inside).toEqual({ ok: true, copies: { live: 1, audited: 0 } });
    const at = CLOSING_AT.toISOString();
    expect(
      (await liveGrants()).map((grant) => [grant.id, grant.revokedAt?.toISOString() ?? null]),
    ).toEqual([
      [ANNA_TO_BEN_HERE, at],
      [BEN_TO_ANNA_HERE, at],
    ]);
    // One row per real grant, in Ben's name, and none about Cara.
    expect(
      rows(
        await fresh.db.execute(
          sql`select subject_id, category::text as category from audit_events where actor_id = ${BEN}::uuid and action = 'grant.revoke' order by subject_id`,
        ),
      ),
    ).toEqual([
      { subject_id: ANNA, category: "cycle.history" },
      { subject_id: BEN, category: "cycle.status" },
    ]);
  });
});
