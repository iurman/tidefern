import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { addDays, todayIn } from "@tidefern/core";
import { schema } from "@tidefern/db";
import type {
  Child,
  ChildEvent,
  ChildMeasurement,
  MilestoneChecklist,
  Problem,
} from "@tidefern/schemas";

import { FRESH_AUTHENTICATION_REQUIRED } from "../auth";
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../middleware/index";
import { ANNA, BEN, CARA, OWN_ORIGIN } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import { CHILDREN_TOKENS, DANA, HOUSEHOLD, createChildrenFixture } from "../test/children";
import type { ChildrenFixture } from "../test/children";
import { ALREADY_GUARDIAN, ID_IN_USE, LAST_GUARDIAN, STALE_VERSION } from "./children";

const KEYS = {
  create: "018f5e7a-3000-7000-8000-00000000e001",
  dana: "018f5e7a-3000-7000-8000-00000000e002",
  invalid: "018f5e7a-3000-7000-8000-00000000e003",
  guardianCara: "018f5e7a-3000-7000-8000-00000000e004",
  guardianBen: "018f5e7a-3000-7000-8000-00000000e005",
  guardianAgain: "018f5e7a-3000-7000-8000-00000000e006",
  guardianByBen: "018f5e7a-3000-7000-8000-00000000e007",
  feed: "018f5e7a-3000-7000-8000-00000000e008",
  sleep: "018f5e7a-3000-7000-8000-00000000e009",
  bad1: "018f5e7a-3000-7000-8000-00000000e00a",
  bad2: "018f5e7a-3000-7000-8000-00000000e00b",
  bad3: "018f5e7a-3000-7000-8000-00000000e00c",
  bad4: "018f5e7a-3000-7000-8000-00000000e00d",
  diaper: "018f5e7a-3000-7000-8000-00000000e00e",
  caraWrite: "018f5e7a-3000-7000-8000-00000000e00f",
  caraRead: "018f5e7a-3000-7000-8000-00000000e010",
  birth: "018f5e7a-3000-7000-8000-00000000e011",
  heavy: "018f5e7a-3000-7000-8000-00000000e012",
  danaMeasure: "018f5e7a-3000-7000-8000-00000000e013",
  early: "018f5e7a-3000-7000-8000-00000000e014",
  empty: "018f5e7a-3000-7000-8000-00000000e015",
  foreign: "018f5e7a-3000-7000-8000-00000000e016",
  reuse: "018f5e7a-3000-7000-8000-00000000e017",
  caraEvent: "018f5e7a-3000-7000-8000-00000000e018",
  caraRevoked: "018f5e7a-3000-7000-8000-00000000e019",
  anonymous: "018f5e7a-3000-7000-8000-00000000e01a",
  guardianStale: "018f5e7a-3000-7000-8000-00000000e01b",
  v4Id: "018f5e7a-3000-7000-8000-00000000e01c",
  bad5: "018f5e7a-3000-7000-8000-00000000e01d",
  bad6: "018f5e7a-3000-7000-8000-00000000e01e",
  caraFeed: "018f5e7a-3000-7000-8000-00000000e01f",
};

const CHILD_GRANT = "018f5e7a-2000-7000-8000-00000000c001";

/** The words that must never reach a stored byte in clear. */
const NOTE = "fussy after the bottle, maybe teething";
const NOTE_AGAIN = "settled once the room was dark";

let fixture: ChildrenFixture;
let app: ChildrenFixture["app"];
let db: ChildrenFixture["harness"]["db"];

/** Born a hundred days before today (UTC), so the 2 month checklist is the child's own. */
const BORN = addDays(todayIn("UTC"), -100);
const DAY_TEN = addDays(BORN, 10);

let childId = "";
let danaChildId = "";
let feedId = "";
let sleepId = "";

beforeAll(async () => {
  fixture = await createChildrenFixture();
  app = fixture.app;
  db = fixture.harness.db;
});

afterAll(async () => {
  await fixture.harness.close();
});

type Token = (typeof CHILDREN_TOKENS)[keyof typeof CHILDREN_TOKENS];

interface Call {
  token?: Token | null;
  body?: unknown;
  key?: string;
  ifMatch?: string;
}

function call(method: string, path: string, options: Call = {}) {
  const headers: Record<string, string> = {
    origin: OWN_ORIGIN,
    "content-type": "application/json",
  };
  if (options.token !== null) {
    Object.assign(headers, sessionHeaders(options.token ?? CHILDREN_TOKENS.anna));
  }
  if (options.key !== undefined) headers[IDEMPOTENCY_KEY_HEADER] = options.key;
  if (options.ifMatch !== undefined) headers["if-match"] = options.ifMatch;
  return app.request(`/api/v1${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function expectProblem(
  response: Response,
  status: number,
  code: Problem["code"],
): Promise<Problem> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body = await json<Problem>(response);
  expect(body.code).toBe(code);
  expect(body.status).toBe(status);
  return body;
}

async function auditRows(subjectId: string) {
  return db
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

async function setGrant(level: "summary" | "read" | "contribute" | "revoked") {
  await db.delete(schema.grants).where(eq(schema.grants.id, CHILD_GRANT));
  await db.insert(schema.grants).values({
    id: CHILD_GRANT,
    ownerId: ANNA,
    granteeId: CARA,
    category: "child",
    level: level === "revoked" ? "contribute" : level,
    childId,
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
    revokedAt: level === "revoked" ? new Date() : null,
  });
}

/** The keys a child grantee may see: everything the storage map files under `child`, nothing guardian-only. */
const GRANTEE_CHILD_KEYS = [
  "id",
  "displayName",
  "dateOfBirth",
  "sex",
  "createdAt",
  "updatedAt",
  "version",
];
const GRANTEE_MEASUREMENT_KEYS = [
  "id",
  "childId",
  "date",
  "weightGrams",
  "lengthMillimetres",
  "headMillimetres",
  "placements",
  "authorId",
  "createdAt",
  "updatedAt",
  "version",
];

/** A child event as a read grantee sees it: the whole `child` row, no key metadata. */
const GRANTEE_EVENT_KEYS = [
  "id",
  "childId",
  "kind",
  "date",
  "startedAt",
  "endedAt",
  "milestoneId",
  "quantityMl",
  "side",
  "note",
  "authorId",
  "createdAt",
  "updatedAt",
  "version",
  "deletedAt",
];
/** A deleted event as anyone sees it: the key, the version and when, nothing of the content. */
const TOMBSTONE_KEYS = ["id", "childId", "updatedAt", "version", "deletedAt"];
const CHECKLIST_KEYS = [
  "childId",
  "months",
  "label",
  "framing",
  "notScreeningLine",
  "attribution",
  "items",
];
const CHECKLIST_ITEM_KEYS = ["id", "domain", "text", "checked", "checkedOn", "eventId"];

/** A sync cursor older than any row, so `updatedSince` returns every live row and every tombstone. */
const EVERYTHING_SINCE = "2000-01-01T00:00:00.000Z";

const sorted = (keys: readonly string[]) => [...keys].sort();

describe("POST /v1/children", () => {
  it("creates the child in her household, as its guardian, with its own key, and replays the create", async () => {
    const response = await call("POST", "/children", {
      key: KEYS.create,
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male" },
    });
    expect(response.status).toBe(201);
    const child = await json<Child>(response);
    childId = child.id;
    expect(child).toMatchObject({
      displayName: "Mo",
      dateOfBirth: BORN,
      sex: "male",
      householdId: HOUSEHOLD,
      guardians: [ANNA],
      version: 1,
    });
    expect(child.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const guardians = await db
      .select({ userId: schema.childGuardians.userId })
      .from(schema.childGuardians)
      .where(eq(schema.childGuardians.childId, childId));
    expect(guardians).toEqual([{ userId: ANNA }]);
    const [key] = await db
      .select({ kind: schema.subjectKeys.kind, kekVersion: schema.subjectKeys.kekVersion })
      .from(schema.subjectKeys)
      .where(eq(schema.subjectKeys.subjectId, childId));
    expect(key).toEqual({ kind: "child", kekVersion: "test" });

    const replay = await call("POST", "/children", {
      key: KEYS.create,
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male" },
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await json<{ id: string }>(replay)).toEqual({ id: childId });
    const rows = await db.select({ id: schema.children.id }).from(schema.children);
    expect(rows).toHaveLength(1);
  });

  it("opens a household for a person who has none", async () => {
    const response = await call("POST", "/children", {
      token: CHILDREN_TOKENS.dana,
      key: KEYS.dana,
      body: { displayName: "Pip", dateOfBirth: BORN },
    });
    expect(response.status).toBe(201);
    const child = await json<Child>(response);
    danaChildId = child.id;
    expect(child.sex).toBeNull();
    expect(child.householdId).not.toBe(HOUSEHOLD);
    const members = await db
      .select({ userId: schema.householdMembers.userId, role: schema.householdMembers.role })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, child.householdId as string));
    expect(members).toEqual([{ userId: DANA, role: "owner" }]);
  });

  it("answers 422 with field errors for a date that does not exist, and 409 for a used id", async () => {
    const invalid = await call("POST", "/children", {
      key: KEYS.invalid,
      body: { displayName: "", dateOfBirth: "2026-02-31" },
    });
    const body = await expectProblem(invalid, 422, "validation_failed");
    expect(body.errors?.map((error) => error.path).sort()).toEqual(["dateOfBirth", "displayName"]);

    const reused = await call("POST", "/children", {
      key: KEYS.reuse,
      body: { id: childId, displayName: "Twin", dateOfBirth: BORN },
    });
    const conflict = await expectProblem(reused, 409, "conflict");
    expect(conflict.detail).toBe(ID_IN_USE);

    // Architecture 5.1: a client-minted id is a UUIDv7; a v4 is a field error.
    const v4 = await call("POST", "/children", {
      key: KEYS.v4Id,
      body: { id: "9b2f6c1e-4d3a-4f8b-9c2d-1e5f7a3b6c8d", displayName: "Mo", dateOfBirth: BORN },
    });
    expect((await expectProblem(v4, 422, "validation_failed")).errors?.map((e) => e.path)).toEqual([
      "id",
    ]);
  });

  it("needs a session", async () => {
    const response = await call("POST", "/children", {
      token: null,
      key: KEYS.anonymous,
      body: { displayName: "Nobody", dateOfBirth: BORN },
    });
    await expectProblem(response, 401, "unauthenticated");
  });
});

describe("reading children", () => {
  it("lists the guardian's child with its guardians and nothing for a partner without a grant", async () => {
    const anna = await json<{ items: Child[]; nextCursor: string | null }>(
      await call("GET", "/children"),
    );
    expect(anna.items.map((item) => item.id)).toEqual([childId]);
    expect(anna.items[0]?.guardians).toEqual([ANNA]);
    expect(anna.nextCursor).toBeNull();

    const ben = await json<{ items: Child[] }>(
      await call("GET", "/children", { token: CHILDREN_TOKENS.ben }),
    );
    expect(ben.items).toEqual([]);
    const dana = await json<{ items: Child[] }>(
      await call("GET", "/children", { token: CHILDREN_TOKENS.dana }),
    );
    expect(dana.items.map((item) => item.id)).toEqual([danaChildId]);
  });

  it("answers 404 to a household partner and to a stranger, and 422 to a cursor it never issued", async () => {
    await expectProblem(
      await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.ben }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.dana }),
      404,
      "not_found",
    );
    await expectProblem(await call("GET", `/children/${danaChildId}/events`), 404, "not_found");
    const bogus = await expectProblem(
      await call("GET", "/children?cursor=not-a-cursor"),
      422,
      "validation_failed",
    );
    expect(bogus.errors?.[0]?.path).toBe("cursor");
  });
});

describe("PUT /v1/children/{id}", () => {
  it("updates with and without If-Match and refuses a stale version", async () => {
    const plain = await call("PUT", `/children/${childId}`, {
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male" },
    });
    expect(plain.status).toBe(200);
    expect((await json<Child>(plain)).version).toBe(2);

    const stale = await call("PUT", `/children/${childId}`, {
      ifMatch: "1",
      body: { displayName: "Moe", dateOfBirth: BORN, sex: "male" },
    });
    expect((await expectProblem(stale, 409, "conflict")).detail).toBe(STALE_VERSION);

    const fresh = await call("PUT", `/children/${childId}`, {
      ifMatch: '"2"',
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male" },
    });
    expect(fresh.status).toBe(200);
    expect((await json<Child>(fresh)).version).toBe(3);

    await expectProblem(
      await call("PUT", `/children/${childId}`, {
        token: CHILDREN_TOKENS.ben,
        body: { displayName: "Mo", dateOfBirth: BORN },
      }),
      404,
      "not_found",
    );
  });
});

describe("guardians", () => {
  it("lets a guardian add a household member, not an outsider, and audits it", async () => {
    // Architecture 6.1: a guardianship is a grant, so it needs a fresh authentication.
    const stale = await call("POST", `/children/${childId}/guardians`, {
      token: CHILDREN_TOKENS.annaStale,
      key: KEYS.guardianStale,
      body: { userId: BEN },
    });
    expect((await expectProblem(stale, 401, "unauthenticated")).detail).toBe(
      FRESH_AUTHENTICATION_REQUIRED,
    );

    const outsider = await call("POST", `/children/${childId}/guardians`, {
      key: KEYS.guardianCara,
      body: { userId: CARA },
    });
    const refused = await expectProblem(outsider, 422, "validation_failed");
    expect(refused.errors?.[0]?.path).toBe("userId");

    const byBen = await call("POST", `/children/${childId}/guardians`, {
      token: CHILDREN_TOKENS.ben,
      key: KEYS.guardianByBen,
      body: { userId: BEN },
    });
    await expectProblem(byBen, 404, "not_found");

    const added = await call("POST", `/children/${childId}/guardians`, {
      key: KEYS.guardianBen,
      body: { userId: BEN },
    });
    expect(added.status).toBe(201);
    expect(await json<unknown>(added)).toMatchObject({ childId, userId: BEN });

    const again = await call("POST", `/children/${childId}/guardians`, {
      key: KEYS.guardianAgain,
      body: { userId: BEN },
    });
    expect((await expectProblem(again, 409, "conflict")).detail).toBe(ALREADY_GUARDIAN);

    const seen = await json<Child>(
      await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.ben }),
    );
    expect(seen.guardians).toEqual([ANNA, BEN]);
    expect(seen.householdId).toBe(HOUSEHOLD);

    expect(await auditRows(childId)).toEqual([
      { actorId: ANNA, action: "grant.create", category: "child", childId, dedupeKey: null },
    ]);
  });

  it("lets a guardian leave, audits it, and keeps the last guardian", async () => {
    const stale = await call("DELETE", `/children/${childId}/guardians/${BEN}`, {
      token: CHILDREN_TOKENS.annaStale,
    });
    expect((await expectProblem(stale, 401, "unauthenticated")).detail).toBe(
      FRESH_AUTHENTICATION_REQUIRED,
    );
    expect(
      (await json<Child>(await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.ben })))
        .guardians,
    ).toEqual([ANNA, BEN]);

    const left = await call("DELETE", `/children/${childId}/guardians/${BEN}`, {
      token: CHILDREN_TOKENS.ben,
    });
    expect(left.status).toBe(204);
    await expectProblem(
      await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.ben }),
      404,
      "not_found",
    );
    expect((await auditRows(childId)).map((row) => row.action)).toEqual([
      "grant.create",
      "grant.revoke",
    ]);

    const last = await call("DELETE", `/children/${childId}/guardians/${ANNA}`);
    expect((await expectProblem(last, 409, "conflict")).detail).toBe(LAST_GUARDIAN);

    await expectProblem(
      await call("DELETE", `/children/${childId}/guardians/${BEN}`),
      404,
      "not_found",
    );
  });
});

describe("events", () => {
  it("logs a feed with its note encrypted under the child's key and reads it back in clear", async () => {
    const response = await call("POST", `/children/${childId}/events`, {
      key: KEYS.feed,
      body: {
        kind: "feed",
        date: DAY_TEN,
        startedAt: `${DAY_TEN}T08:00:00Z`,
        endedAt: `${DAY_TEN}T08:20:00Z`,
        quantityMl: 90,
        side: "left",
        note: NOTE,
      },
    });
    expect(response.status).toBe(201);
    const event = await json<ChildEvent>(response);
    feedId = event.id;
    expect(event).toMatchObject({
      childId,
      kind: "feed",
      date: DAY_TEN,
      startedAt: `${DAY_TEN}T08:00:00.000Z`,
      endedAt: `${DAY_TEN}T08:20:00.000Z`,
      quantityMl: 90,
      side: "left",
      note: NOTE,
      milestoneId: null,
      authorId: ANNA,
      version: 1,
      deletedAt: null,
    });

    const [row] = await db
      .select({ note: schema.childEvents.note, kekVersion: schema.childEvents.kekVersion })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.id, feedId));
    expect(row?.kekVersion).toBe("test");
    expect(row?.note).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(row?.note as Uint8Array).includes(Buffer.from(NOTE))).toBe(false);
    expect(Buffer.from(row?.note as Uint8Array).includes(Buffer.from("teething"))).toBe(false);

    const sleep = await call("POST", `/children/${childId}/events`, {
      key: KEYS.sleep,
      body: {
        kind: "sleep",
        date: BORN,
        startedAt: `${BORN}T20:00:00Z`,
        endedAt: `${DAY_TEN}T02:00:00Z`,
      },
    });
    expect(sleep.status).toBe(201);
    sleepId = (await json<ChildEvent>(sleep)).id;

    const diaper = await call("POST", `/children/${childId}/events`, {
      key: KEYS.diaper,
      body: { kind: "diaper", date: DAY_TEN },
    });
    expect(diaper.status).toBe(201);
    expect((await json<ChildEvent>(diaper)).side).toBeNull();
    const [stored] = await db
      .select({ side: schema.childEvents.side })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.id, feedId));
    expect(stored).toEqual({ side: "left" });
  });

  it("answers 422 with the field for each rule an event breaks", async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      [KEYS.bad1, { kind: "milestone", date: DAY_TEN }, "milestoneId"],
      [KEYS.bad2, { kind: "sleep", date: DAY_TEN }, "startedAt"],
      [KEYS.bad3, { kind: "diaper", date: DAY_TEN, quantityMl: 10 }, "quantityMl"],
      [
        KEYS.bad5,
        { kind: "sleep", date: DAY_TEN, startedAt: `${DAY_TEN}T20:00:00Z`, side: "left" },
        "side",
      ],
      [KEYS.bad6, { kind: "feed", date: DAY_TEN, side: "middle" }, "side"],
      [
        KEYS.bad4,
        {
          kind: "feed",
          date: DAY_TEN,
          startedAt: `${DAY_TEN}T09:00:00Z`,
          endedAt: `${DAY_TEN}T08:00:00Z`,
        },
        "endedAt",
      ],
    ];
    for (const [key, body, path] of cases) {
      const response = await call("POST", `/children/${childId}/events`, { key, body });
      const problem = await expectProblem(response, 422, "validation_failed");
      expect(problem.errors?.some((error) => error.path === path)).toBe(true);
    }
  });

  it("lists by day with a cursor, and filters by date", async () => {
    const first = await json<{ items: ChildEvent[]; nextCursor: string | null }>(
      await call("GET", `/children/${childId}/events?limit=1`),
    );
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.id).toBe(sleepId);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const second = await json<{ items: ChildEvent[]; nextCursor: string | null }>(
      await call("GET", `/children/${childId}/events?limit=1&cursor=${first.nextCursor}`),
    );
    expect(second.items[0]?.id).toBe(feedId);
    expect(second.items[0]?.note).toBe(NOTE);

    const ranged = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${childId}/events?from=${DAY_TEN}&to=${DAY_TEN}`),
    );
    expect(ranged.items.map((item) => item.kind)).toEqual(["feed", "diaper"]);

    const feeds = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${childId}/events?kind=feed`),
    );
    expect(feeds.items.map((item) => item.id)).toEqual([feedId]);

    const badKind = await call("GET", `/children/${childId}/events?kind=bath`);
    await expectProblem(badKind, 422, "validation_failed");

    const tooMany = await call("GET", `/children/${childId}/events?limit=201`);
    await expectProblem(tooMany, 422, "validation_failed");
  });

  it("replaces an event with If-Match, keeps its kind, and leaves a content-free tombstone on delete", async () => {
    const stale = await call("PUT", `/children/${childId}/events/${feedId}`, {
      ifMatch: "7",
      body: { kind: "feed", date: DAY_TEN, quantityMl: 100, note: NOTE_AGAIN },
    });
    expect((await expectProblem(stale, 409, "conflict")).detail).toBe(STALE_VERSION);

    const kind = await call("PUT", `/children/${childId}/events/${feedId}`, {
      body: { kind: "diaper", date: DAY_TEN },
    });
    expect((await expectProblem(kind, 422, "validation_failed")).errors?.[0]?.path).toBe("kind");

    const sideless = await call("PUT", `/children/${childId}/events/${feedId}`, {
      ifMatch: "1",
      body: { kind: "diaper", date: DAY_TEN, side: "right" },
    });
    expect((await expectProblem(sideless, 422, "validation_failed")).errors?.[0]?.path).toBe(
      "side",
    );

    const updated = await call("PUT", `/children/${childId}/events/${feedId}`, {
      ifMatch: "1",
      body: { kind: "feed", date: DAY_TEN, quantityMl: 100, side: "right", note: NOTE_AGAIN },
    });
    expect(updated.status).toBe(200);
    expect(await json<ChildEvent>(updated)).toMatchObject({
      quantityMl: 100,
      side: "right",
      note: NOTE_AGAIN,
      startedAt: null,
      version: 2,
    });

    const before = new Date().toISOString();
    const removed = await call("DELETE", `/children/${childId}/events/${feedId}`);
    expect(removed.status).toBe(204);
    await expectProblem(
      await call("DELETE", `/children/${childId}/events/${feedId}`),
      404,
      "not_found",
    );

    const live = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${childId}/events`),
    );
    expect(live.items.map((item) => item.id)).not.toContain(feedId);

    const synced = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/events?updatedSince=${before}`),
    );
    const tombstone = synced.items.find((item) => item["id"] === feedId);
    expect(Object.keys(tombstone ?? {}).sort()).toEqual(sorted(TOMBSTONE_KEYS));
    expect(tombstone?.["version"]).toBe(3);

    const [row] = await db
      .select({
        note: schema.childEvents.note,
        kekVersion: schema.childEvents.kekVersion,
        quantityMl: schema.childEvents.quantityMl,
        side: schema.childEvents.side,
      })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.id, feedId));
    expect(row).toEqual({ note: null, kekVersion: null, quantityMl: null, side: null });
  });
});

describe("a child grantee", () => {
  it("at summary sees the child without the guardian-only facts and no events", async () => {
    await setGrant("summary");
    const list = await json<{ items: Child[] }>(
      await call("GET", "/children", { token: CHILDREN_TOKENS.cara }),
    );
    expect(list.items.map((item) => item.id)).toEqual([childId]);
    const one = await json<Child>(
      await call("GET", `/children/${childId}`, { token: CHILDREN_TOKENS.cara }),
    );
    expect(Object.keys(one).sort()).toEqual([...GRANTEE_CHILD_KEYS].sort());
    expect(one).not.toHaveProperty("householdId");
    expect(one).not.toHaveProperty("guardians");

    await expectProblem(
      await call("GET", `/children/${childId}/events`, { token: CHILDREN_TOKENS.cara }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("GET", `/children/${childId}/measurements`, { token: CHILDREN_TOKENS.cara }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("GET", `/children/${childId}/milestones`, { token: CHILDREN_TOKENS.cara }),
      404,
      "not_found",
    );

    // Two reads on one day collapse to one partner.read row.
    const reads = (await auditRows(childId)).filter((row) => row.actorId === CARA);
    expect(reads).toEqual([
      {
        actorId: CARA,
        action: "partner.read",
        category: "child",
        childId,
        dedupeKey: expect.stringMatching(
          new RegExp(`^${CARA}/${childId}/child/\\d{4}-\\d{2}-\\d{2}$`),
        ),
      },
    ]);
  });

  it("at read sees events and measurements without pointToCare, and cannot write", async () => {
    await setGrant("read");
    const events = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/events`, { token: CHILDREN_TOKENS.cara }),
    );
    expect(events.items.map((item) => item["id"])).toEqual([sleepId, expect.any(String)]);
    for (const item of events.items) {
      expect(Object.keys(item).sort()).toEqual(sorted(GRANTEE_EVENT_KEYS));
    }

    // The sync view adds the deleted feed as a tombstone, and nothing else about it.
    const synced = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/events?updatedSince=${EVERYTHING_SINCE}`, {
        token: CHILDREN_TOKENS.cara,
      }),
    );
    const tombstones = synced.items.filter((item) => item["deletedAt"] !== null);
    expect(tombstones.map((item) => item["id"])).toEqual([feedId]);
    for (const item of synced.items) {
      expect(Object.keys(item).sort()).toEqual(
        sorted(item["deletedAt"] === null ? GRANTEE_EVENT_KEYS : TOMBSTONE_KEYS),
      );
    }

    const checklist = await json<Record<string, unknown> & { items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/milestones?age=2`, { token: CHILDREN_TOKENS.cara }),
    );
    expect(Object.keys(checklist).sort()).toEqual(sorted(CHECKLIST_KEYS));
    expect(checklist.items.length).toBeGreaterThan(5);
    for (const item of checklist.items) {
      expect(Object.keys(item).sort()).toEqual(sorted(CHECKLIST_ITEM_KEYS));
    }

    await expectProblem(
      await call("POST", `/children/${childId}/events`, {
        token: CHILDREN_TOKENS.cara,
        key: KEYS.caraRead,
        body: { kind: "diaper", date: DAY_TEN },
      }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("PUT", `/children/${childId}`, {
        token: CHILDREN_TOKENS.cara,
        body: { displayName: "Mo", dateOfBirth: BORN },
      }),
      404,
      "not_found",
    );
  });

  it("at contribute writes an event, audited, and still cannot delete or add a guardian", async () => {
    await setGrant("contribute");
    const written = await call("POST", `/children/${childId}/events`, {
      token: CHILDREN_TOKENS.cara,
      key: KEYS.caraEvent,
      body: { kind: "diaper", date: DAY_TEN, note: "partner wrote this" },
    });
    expect(written.status).toBe(201);
    const event = await json<ChildEvent>(written);
    expect(event.authorId).toBe(CARA);
    expect(event.note).toBe("partner wrote this");
    expect(Object.keys(event).sort()).toEqual(sorted(GRANTEE_EVENT_KEYS));

    // The side is part of the child row, so a contributor records it and a
    // grantee reads it like the rest of the event.
    const feed = await call("POST", `/children/${childId}/events`, {
      token: CHILDREN_TOKENS.cara,
      key: KEYS.caraFeed,
      body: { kind: "feed", date: DAY_TEN, side: "both" },
    });
    expect(feed.status).toBe(201);
    const fed = await json<ChildEvent>(feed);
    expect(Object.keys(fed).sort()).toEqual(sorted(GRANTEE_EVENT_KEYS));
    expect(fed).toMatchObject({ kind: "feed", side: "both", authorId: CARA });
    const listed = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${childId}/events?kind=feed`, { token: CHILDREN_TOKENS.cara }),
    );
    expect(listed.items.find((item) => item.id === fed.id)?.side).toBe("both");

    const writes = (await auditRows(childId)).filter((row) => row.action === "partner.write");
    expect(writes).toEqual([
      { actorId: CARA, action: "partner.write", category: "child", childId, dedupeKey: null },
      { actorId: CARA, action: "partner.write", category: "child", childId, dedupeKey: null },
    ]);

    await expectProblem(
      await call("DELETE", `/children/${childId}/events/${event.id}`, {
        token: CHILDREN_TOKENS.cara,
      }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("POST", `/children/${childId}/guardians`, {
        token: CHILDREN_TOKENS.cara,
        key: KEYS.caraWrite,
        body: { userId: CARA },
      }),
      404,
      "not_found",
    );
    // Her note stays the child's: the guardian reads it.
    const mine = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${childId}/events`),
    );
    expect(mine.items.find((item) => item.id === event.id)?.note).toBe("partner wrote this");
  });

  it("revoked, and a stranger, get 404 everywhere", async () => {
    await setGrant("revoked");
    for (const token of [CHILDREN_TOKENS.cara, CHILDREN_TOKENS.dana]) {
      await expectProblem(await call("GET", `/children/${childId}`, { token }), 404, "not_found");
      await expectProblem(
        await call("GET", `/children/${childId}/events`, { token }),
        404,
        "not_found",
      );
      await expectProblem(
        await call("GET", `/children/${childId}/milestones?age=2`, { token }),
        404,
        "not_found",
      );
    }
    await expectProblem(
      await call("POST", `/children/${childId}/measurements`, {
        token: CHILDREN_TOKENS.cara,
        key: KEYS.caraRevoked,
        body: { date: DAY_TEN, weightGrams: 4000 },
      }),
      404,
      "not_found",
    );
    await expectProblem(
      await call("POST", `/children/${childId}/events`, {
        token: CHILDREN_TOKENS.dana,
        key: KEYS.foreign,
        body: { kind: "diaper", date: DAY_TEN },
      }),
      404,
      "not_found",
    );
    const list = await json<{ items: Child[] }>(
      await call("GET", "/children", { token: CHILDREN_TOKENS.cara }),
    );
    expect(list.items).toEqual([]);
  });
});

describe("measurements", () => {
  it("places a birth weight on the WHO reference, approximate under eight weeks, and flags a far value for guardians only", async () => {
    const birth = await call("POST", `/children/${childId}/measurements`, {
      key: KEYS.birth,
      body: { date: BORN, weightGrams: 3346, lengthMillimetres: 499 },
    });
    expect(birth.status).toBe(201);
    const measured = await json<ChildMeasurement>(birth);
    expect(measured.pointToCare).toBe(false);
    const weight = measured.placements.find((placed) => placed.indicator === "weightForAge");
    expect(weight).toMatchObject({ reference: "who", approximate: true });
    expect(Math.abs((weight?.percentile ?? 0) - 50)).toBeLessThan(1);
    expect(Math.abs(weight?.z ?? 1)).toBeLessThan(0.05);
    expect(weight?.bands.median.value).toBe(3346);
    expect(measured.placements.map((placed) => placed.indicator).sort()).toEqual([
      "lengthForAge",
      "weightForAge",
      "weightForLength",
    ]);
    expect(measured).not.toHaveProperty("farOutsideBand");

    const heavy = await call("POST", `/children/${childId}/measurements`, {
      key: KEYS.heavy,
      body: { date: DAY_TEN, weightGrams: 7000 },
    });
    expect(heavy.status).toBe(201);
    expect((await json<ChildMeasurement>(heavy)).pointToCare).toBe(true);

    await setGrant("read");
    const theirs = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/measurements`, { token: CHILDREN_TOKENS.cara }),
    );
    expect(theirs.items).toHaveLength(2);
    for (const item of theirs.items) {
      expect(Object.keys(item).sort()).toEqual([...GRANTEE_MEASUREMENT_KEYS].sort());
      expect(item).not.toHaveProperty("pointToCare");
    }
    const far = theirs.items.find((item) => item["date"] === DAY_TEN);
    expect((far?.["placements"] as { z: number }[])[0]?.z).toBeGreaterThan(2);
    await setGrant("revoked");

    const own = await json<{ items: ChildMeasurement[] }>(
      await call("GET", `/children/${childId}/measurements?from=${DAY_TEN}`),
    );
    expect(own.items.map((item) => item.pointToCare)).toEqual([true]);
  });

  it("gives no placement without a sex, and refuses a date before birth or an empty session", async () => {
    const none = await call("POST", `/children/${danaChildId}/measurements`, {
      token: CHILDREN_TOKENS.dana,
      key: KEYS.danaMeasure,
      body: { date: DAY_TEN, headMillimetres: 360 },
    });
    expect(none.status).toBe(201);
    expect((await json<ChildMeasurement>(none)).placements).toEqual([]);

    const early = await call("POST", `/children/${childId}/measurements`, {
      key: KEYS.early,
      body: { date: addDays(BORN, -1), weightGrams: 3000 },
    });
    expect((await expectProblem(early, 422, "validation_failed")).errors?.[0]?.path).toBe("date");

    const empty = await call("POST", `/children/${childId}/measurements`, {
      key: KEYS.empty,
      body: { date: DAY_TEN },
    });
    await expectProblem(empty, 422, "validation_failed");
  });
});

describe("milestones", () => {
  it("serves the checklist for the child's age and for a chosen age, and refuses an age that is not one", async () => {
    const own = await json<MilestoneChecklist>(
      await call("GET", `/children/${childId}/milestones`),
    );
    expect(own.months).toBe(2);
    expect(own.framing).toBe("Most children do this by 2 months.");
    expect(own.notScreeningLine).toMatch(/not a screening tool/);
    expect(own.attribution).toMatch(/^Source: CDC/);
    expect(own.items.length).toBeGreaterThan(5);
    expect(own.items.every((item) => !item.checked && item.eventId === null)).toBe(true);

    const chosen = await json<MilestoneChecklist>(
      await call("GET", `/children/${childId}/milestones?age=12`),
    );
    expect(chosen.months).toBe(12);
    expect(chosen.label).toBe("1 year");

    await expectProblem(
      await call("GET", `/children/${childId}/milestones?age=3`),
      422,
      "validation_failed",
    );
  });

  it("checks an item off as a milestone event, shows it, moves its day, and unchecks it with a tombstone", async () => {
    const unknown = await call("PUT", `/children/${childId}/milestones`, {
      body: { itemId: "2m-social-99", checked: true },
    });
    expect((await expectProblem(unknown, 422, "validation_failed")).errors?.[0]?.path).toBe(
      "itemId",
    );

    const checked = await call("PUT", `/children/${childId}/milestones`, {
      body: { itemId: "2m-social-1", checked: true, date: DAY_TEN },
    });
    expect(checked.status).toBe(200);
    const item = await json<{ checked: boolean; checkedOn: string; eventId: string }>(checked);
    expect(item).toMatchObject({ checked: true, checkedOn: DAY_TEN });

    const list = await json<MilestoneChecklist>(
      await call("GET", `/children/${childId}/milestones?age=2`),
    );
    const social = list.items.find((candidate) => candidate.id === "2m-social-1");
    expect(social).toMatchObject({ checked: true, checkedOn: DAY_TEN, eventId: item.eventId });

    const moved = await call("PUT", `/children/${childId}/milestones`, {
      body: { itemId: "2m-social-1", checked: true, date: BORN },
    });
    expect(await json<unknown>(moved)).toMatchObject({ checkedOn: BORN, eventId: item.eventId });

    const beforeUncheck = new Date().toISOString();
    const unchecked = await call("PUT", `/children/${childId}/milestones`, {
      body: { itemId: "2m-social-1", checked: false },
    });
    expect(await json<unknown>(unchecked)).toMatchObject({
      checked: false,
      checkedOn: null,
      eventId: null,
    });
    const [row] = await db
      .select({ deletedAt: schema.childEvents.deletedAt })
      .from(schema.childEvents)
      .where(
        and(eq(schema.childEvents.id, item.eventId), eq(schema.childEvents.kind, "milestone")),
      );
    expect(row?.deletedAt).toBeInstanceOf(Date);
    // The stored row still keeps its kind, day and item (B6's constraints require them; the
    // request to relax them is with the lead), so the content-free promise is the response's.
    const synced = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/events?updatedSince=${beforeUncheck}`),
    );
    const tombstone = synced.items.find((candidate) => candidate["id"] === item.eventId);
    expect(Object.keys(tombstone ?? {}).sort()).toEqual(sorted(TOMBSTONE_KEYS));
  });
});

describe("the contract", () => {
  it("lists every children route with its components", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(await app.request("/api/v1/openapi.json"));
    const methods = Object.entries(document.paths)
      .filter(([path]) => path.startsWith("/api/v1/children"))
      .map(([path, item]) => `${Object.keys(item).sort().join(",")} ${path}`)
      .sort();
    expect(methods).toEqual([
      "delete /api/v1/children/{id}/guardians/{userId}",
      "delete,put /api/v1/children/{id}/events/{eventId}",
      "get,post /api/v1/children",
      "get,post /api/v1/children/{id}/events",
      "get,post /api/v1/children/{id}/measurements",
      "get,put /api/v1/children/{id}",
      "get,put /api/v1/children/{id}/milestones",
      "post /api/v1/children/{id}/guardians",
    ]);
    for (const name of [
      "Child",
      "ChildEvent",
      "ChildMeasurement",
      "MilestoneChecklist",
      "Guardian",
    ]) {
      expect(document.components.schemas).toHaveProperty(name);
    }
  });
});
