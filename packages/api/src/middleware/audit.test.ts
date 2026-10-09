import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditActions as sharedAuditActions, schema, withActor } from "@tidefern/db";
import { ActivityPage } from "@tidefern/schemas";

import { createApp } from "../app";
import { KEK } from "../test/account";
import { ANNA, BEN, CARA, TOKENS, createActorFixture } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import type { ApiTestDatabase } from "../test/database";
import { audit, auditActions, readDedupeKey } from "./audit";

const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const GRANT = "018f5e7a-2000-7000-8000-000000000001";
const CHILD_GRANT = "018f5e7a-2000-7000-8000-000000000003";

let harness: ApiTestDatabase;

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  const { db } = harness;
  await db.insert(schema.households).values({ id: HOUSEHOLD });
  await db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" });
  await db
    .insert(schema.childGuardians)
    .values({ id: "018f5e7a-2000-7000-8000-00000000a001", childId: CHILD, userId: BEN });
  // Ben shares his status with Anna and his child with Cara.
  await db.insert(schema.grants).values([
    {
      id: GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.status",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    {
      id: CHILD_GRANT,
      ownerId: BEN,
      granteeId: CARA,
      category: "child",
      level: "contribute",
      childId: CHILD,
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
  ]);
});

afterAll(async () => {
  await harness.close();
});

async function rowsFor(subjectId: string) {
  return harness.db
    .select({
      actorId: schema.auditEvents.actorId,
      action: schema.auditEvents.action,
      category: schema.auditEvents.category,
      childId: schema.auditEvents.childId,
      dedupeKey: schema.auditEvents.dedupeKey,
    })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.subjectId, subjectId))
    .orderBy(schema.auditEvents.id);
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("expected the statement to be refused");
}

describe("readDedupeKey", () => {
  it("is the actor, subject, category and day, and needs all four", () => {
    expect(
      readDedupeKey({ actorId: ANNA, subjectId: BEN, category: "cycle.status", day: "2026-10-05" }),
    ).toBe(`${ANNA}/${BEN}/cycle.status/2026-10-05`);
    expect(() => readDedupeKey({ actorId: ANNA, subjectId: BEN, day: "2026-10-05" })).toThrow(
      TypeError,
    );
    expect(() =>
      readDedupeKey({ actorId: ANNA, subjectId: BEN, category: "cycle.status" }),
    ).toThrow(TypeError);
    expect(() =>
      readDedupeKey({
        actorId: ANNA,
        subjectId: BEN,
        category: "cycle.status",
        day: "2026-10-05T00:00Z",
      }),
    ).toThrow(TypeError);
  });
});

describe("audit", () => {
  it("collapses a partner's reads of one category to one row per day", async () => {
    const read = {
      actorId: ANNA,
      action: auditActions.partnerRead,
      subjectId: BEN,
      category: "cycle.status",
    } as const;
    const first = await withActor(
      ANNA,
      (tx) => audit(tx, { ...read, day: "2026-10-05" }),
      harness.db,
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    const again = await withActor(
      ANNA,
      (tx) => audit(tx, { ...read, day: "2026-10-05" }),
      harness.db,
    );
    expect(again).toBeNull();
    const nextDay = await withActor(
      ANNA,
      (tx) => audit(tx, { ...read, day: "2026-10-06" }),
      harness.db,
    );
    expect(nextDay).not.toBeNull();
    expect(nextDay).not.toBe(first);

    expect(await rowsFor(BEN)).toEqual([
      {
        actorId: ANNA,
        action: "partner.read",
        category: "cycle.status",
        childId: null,
        dedupeKey: `${ANNA}/${BEN}/cycle.status/2026-10-05`,
      },
      {
        actorId: ANNA,
        action: "partner.read",
        category: "cycle.status",
        childId: null,
        dedupeKey: `${ANNA}/${BEN}/cycle.status/2026-10-06`,
      },
    ]);
  });

  it("records every partner write and every grant change without collapsing them", async () => {
    const write = {
      actorId: CARA,
      action: auditActions.partnerWrite,
      subjectId: CHILD,
      category: "child",
      childId: CHILD,
    } as const;
    const one = await withActor(CARA, (tx) => audit(tx, write), harness.db);
    const two = await withActor(CARA, (tx) => audit(tx, write), harness.db);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(two).not.toBe(one);
    expect(await rowsFor(CHILD)).toHaveLength(2);

    const change = {
      actorId: BEN,
      action: auditActions.grantCreate,
      subjectId: BEN,
      category: "cycle.status",
    } as const;
    await withActor(BEN, (tx) => audit(tx, change), harness.db);
    await withActor(
      BEN,
      (tx) => audit(tx, { ...change, action: auditActions.grantRevoke }),
      harness.db,
    );
    const bens = await rowsFor(BEN);
    expect(bens.map((row) => row.action)).toEqual([
      "partner.read",
      "partner.read",
      "grant.create",
      "grant.revoke",
    ]);
    expect(
      bens.filter((row) => row.action.startsWith("grant.")).every((row) => row.dedupeKey === null),
    ).toBe(true);
  });

  it("needs a day and a category for a read, and a known action", async () => {
    await expect(
      withActor(
        ANNA,
        (tx) =>
          audit(tx, {
            actorId: ANNA,
            action: auditActions.partnerRead,
            subjectId: BEN,
            category: "cycle.status",
          }),
        harness.db,
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      withActor(
        ANNA,
        (tx) =>
          audit(tx, {
            actorId: ANNA,
            action: "note.peek" as typeof auditActions.partnerWrite,
            subjectId: BEN,
          }),
        harness.db,
      ),
    ).rejects.toThrow(/unknown audit action/);
  });

  it("is refused by the policy for a stranger and for a row in someone else's name", async () => {
    const stranger = await refusal(
      withActor(
        CARA,
        (tx) =>
          audit(tx, {
            actorId: CARA,
            action: auditActions.partnerRead,
            subjectId: BEN,
            category: "cycle.status",
            day: "2026-10-05",
          }),
        harness.db,
      ),
    );
    expect(stranger).toMatch(/row-level security/);

    const impersonation = await refusal(
      withActor(
        ANNA,
        (tx) => audit(tx, { actorId: BEN, action: auditActions.grantCreate, subjectId: BEN }),
        harness.db,
      ),
    );
    expect(impersonation).toMatch(/row-level security/);
    expect((await rowsFor(BEN)).filter((row) => row.actorId === CARA)).toEqual([]);
  });

  it("rolls back with the transaction it runs in", async () => {
    const before = (await rowsFor(BEN)).length;
    await expect(
      withActor(
        BEN,
        async (tx) => {
          await audit(tx, { actorId: BEN, action: auditActions.grantUpdate, subjectId: BEN });
          throw new Error("the change after it failed");
        },
        harness.db,
      ),
    ).rejects.toThrow("the change after it failed");
    expect(await rowsFor(BEN)).toHaveLength(before);
  });

  it("shows the subject and the actor their rows and nobody else", async () => {
    const count = (actorId: string) =>
      withActor(
        actorId,
        async (tx) =>
          (await tx.select({ id: schema.auditEvents.id }).from(schema.auditEvents)).length,
        harness.db,
      );
    // Ben: everything about him and about his child; Anna: her two reads;
    // Cara: her two writes about the child. A row never shows to a third.
    expect(await count(BEN)).toBe(6);
    expect(await count(ANNA)).toBe(2);
    expect(await count(CARA)).toBe(2);
  });
});

describe("the session names (task C7)", () => {
  let fixture: Awaited<ReturnType<typeof createActorFixture>>;

  beforeAll(async () => {
    fixture = await createActorFixture();
  });
  afterAll(async () => {
    await fixture.harness.close();
  });

  it("are the shared vocabulary the session hooks in packages/auth write from", () => {
    expect(auditActions).toBe(sharedAuditActions);
    expect(auditActions.sessionSignIn).toBe("session.sign_in");
    expect(auditActions.sessionRevoke).toBe("session.revoke");
  });

  it("are listed by the activity route for the person and for nobody else", async () => {
    // Rows shaped as the hooks write them: the person as actor and subject,
    // no category, no child. A minute apart, so newest first is one order.
    const signedIn = new Date("2026-10-05T07:00:00.000Z");
    const signedOut = new Date("2026-10-05T07:01:00.000Z");
    for (const [action, occurredAt] of [
      [auditActions.sessionSignIn, signedIn],
      [auditActions.sessionRevoke, signedOut],
    ] as const) {
      await withActor(
        ANNA,
        (tx) => audit(tx, { actorId: ANNA, action, subjectId: ANNA, occurredAt }),
        fixture.harness.db,
      );
    }
    const app = createApp({
      auth: fixture.auth,
      db: fixture.harness.db,
      keys: KEK,
      log: { sink: () => undefined },
    });
    const activityOf = async (token: string) => {
      const response = await app.request("/api/v1/me/activity", { headers: sessionHeaders(token) });
      expect(response.status).toBe(200);
      return ActivityPage.parse(await response.json());
    };

    const anna = await activityOf(TOKENS.anna);
    expect(
      anna.items.map(({ action, actorId, subjectId, occurredAt }) => ({
        action,
        actorId,
        subjectId,
        occurredAt,
      })),
    ).toEqual([
      {
        action: "session.revoke",
        actorId: ANNA,
        subjectId: ANNA,
        occurredAt: signedOut.toISOString(),
      },
      {
        action: "session.sign_in",
        actorId: ANNA,
        subjectId: ANNA,
        occurredAt: signedIn.toISOString(),
      },
    ]);
    for (const item of anna.items) {
      expect(item).not.toHaveProperty("category");
      expect(item).not.toHaveProperty("childId");
    }
    for (const token of [TOKENS.ben, TOKENS.cara]) {
      expect((await activityOf(token)).items).toEqual([]);
    }
  });
});
