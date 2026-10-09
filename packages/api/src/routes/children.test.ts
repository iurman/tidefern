import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { addDays, todayIn } from "@tidefern/core";
import type { KeyProvider } from "@tidefern/crypto";
import { schema } from "@tidefern/db";
import { CHILD_CONSENT_DISCLOSURES } from "@tidefern/schemas";
import type {
  Child,
  ChildEvent,
  ChildMeasurement,
  Consent,
  MilestoneChecklist,
  Problem,
} from "@tidefern/schemas";

import { createApp } from "../app";
import { FRESH_AUTHENTICATION_REQUIRED } from "../auth";
import { realCalendarClock } from "../clock";
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../middleware/index";
import { ANNA, BEN, CARA, OWN_ORIGIN } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import { CHILDREN_TOKENS, DANA, HOUSEHOLD, createChildrenFixture } from "../test/children";
import type { ChildrenFixture } from "../test/children";
import {
  ALREADY_GUARDIAN,
  ID_IN_USE,
  LAST_GUARDIAN,
  STALE_VERSION,
  guardianConsentHash,
} from "./children";
import { CHILD_CONSENT_NOT_WITHDRAWN_HERE } from "./profile";

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
  noConsent: "018f5e7a-3000-7000-8000-00000000e020",
  unchecked: "018f5e7a-3000-7000-8000-00000000e021",
  unknownText: "018f5e7a-3000-7000-8000-00000000e022",
  rolledBack: "018f5e7a-3000-7000-8000-00000000e023",
  withdrawChild: "018f5e7a-3000-7000-8000-00000000e024",
  breast: "018f5e7a-3000-7000-8000-00000000e025",
  bottle: "018f5e7a-3000-7000-8000-00000000e026",
  solids: "018f5e7a-3000-7000-8000-00000000e027",
  mixed: "018f5e7a-3000-7000-8000-00000000e028",
  wrong1: "018f5e7a-3000-7000-8000-00000000e029",
  wrong2: "018f5e7a-3000-7000-8000-00000000e02a",
  wrong3: "018f5e7a-3000-7000-8000-00000000e02b",
  wrong4: "018f5e7a-3000-7000-8000-00000000e02c",
  wrong5: "018f5e7a-3000-7000-8000-00000000e02d",
  wrong6: "018f5e7a-3000-7000-8000-00000000e02e",
  wrong7: "018f5e7a-3000-7000-8000-00000000e02f",
  annaBottle: "018f5e7a-3000-7000-8000-00000000e030",
  wren: "018f5e7a-3000-7000-8000-00000000e031",
  newest1: "018f5e7a-3000-7000-8000-00000000e032",
  newest2: "018f5e7a-3000-7000-8000-00000000e033",
  newest3: "018f5e7a-3000-7000-8000-00000000e034",
  newest4: "018f5e7a-3000-7000-8000-00000000e035",
  newest5: "018f5e7a-3000-7000-8000-00000000e036",
  newest6: "018f5e7a-3000-7000-8000-00000000e037",
  newest7: "018f5e7a-3000-7000-8000-00000000e038",
  newest8: "018f5e7a-3000-7000-8000-00000000e039",
};

/**
 * Task E12: a child is created only with the guardian's consent on the
 * child's behalf, so every create body in this file carries it, the E5
 * cases included; the cases about the consent itself are in their own
 * describe block below.
 */
const CONSENT = { given: true, textVersion: "2026-10" } as const;

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
  // The test database is also bound as the routes' `db`, which the consent
  // routes (E2) read from the environment; the children routes ignore it.
  return app.request(
    `/api/v1${path}`,
    {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    { db },
  );
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
  "feedMethod",
  "diaperContents",
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
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male", guardianConsent: CONSENT },
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
      body: { displayName: "Mo", dateOfBirth: BORN, sex: "male", guardianConsent: CONSENT },
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
      body: { displayName: "Pip", dateOfBirth: BORN, guardianConsent: CONSENT },
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
      body: { displayName: "", dateOfBirth: "2026-02-31", guardianConsent: CONSENT },
    });
    const body = await expectProblem(invalid, 422, "validation_failed");
    expect(body.errors?.map((error) => error.path).sort()).toEqual(["dateOfBirth", "displayName"]);

    const reused = await call("POST", "/children", {
      key: KEYS.reuse,
      body: { id: childId, displayName: "Twin", dateOfBirth: BORN, guardianConsent: CONSENT },
    });
    const conflict = await expectProblem(reused, 409, "conflict");
    expect(conflict.detail).toBe(ID_IN_USE);

    // Architecture 5.1: a client-minted id is a UUIDv7; a v4 is a field error.
    const v4 = await call("POST", "/children", {
      key: KEYS.v4Id,
      body: {
        id: "9b2f6c1e-4d3a-4f8b-9c2d-1e5f7a3b6c8d",
        displayName: "Mo",
        dateOfBirth: BORN,
        guardianConsent: CONSENT,
      },
    });
    expect((await expectProblem(v4, 422, "validation_failed")).errors?.map((e) => e.path)).toEqual([
      "id",
    ]);
  });

  it("needs a session", async () => {
    const response = await call("POST", "/children", {
      token: null,
      key: KEYS.anonymous,
      body: { displayName: "Nobody", dateOfBirth: BORN, guardianConsent: CONSENT },
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

describe("a cursor neither list issued", () => {
  /** A cursor as the lists write one: base64url of a JSON object of strings. */
  const forged = (parts: Record<string, string>) =>
    Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
  const SOME_ID = "018f5e7a-4000-7000-8000-0000000000ff";
  const MALFORMED = [
    "not-a-cursor",
    forged({ i: "not-an-id" }),
    forged({ d: "2026-02-31", i: SOME_ID }),
    forged({ d: "yesterday", i: SOME_ID }),
    Buffer.from("[1,2]", "utf8").toString("base64url"),
  ];
  // Shaped like a cursor, but one the other list (or the notes or events list) issues.
  const FOREIGN_TO_CHILDREN = [
    forged({ d: DAY_TEN, i: SOME_ID }),
    forged({ o: "desc", d: DAY_TEN, t: "2026-10-05T05:00:00.000000Z", i: SOME_ID }),
    Buffer.from(`${DAY_TEN}|${SOME_ID}`, "utf8").toString("base64url"),
  ];
  const FOREIGN_TO_MEASUREMENTS = [
    forged({ i: SOME_ID }),
    forged({ d: DAY_TEN }),
    forged({ o: "desc", d: DAY_TEN, t: "2026-10-05T05:00:00.000000Z", i: SOME_ID }),
    Buffer.from(`${DAY_TEN}|${SOME_ID}`, "utf8").toString("base64url"),
  ];
  const OVERSIZED = forged({ i: SOME_ID, pad: "x".repeat(400) });

  it("answers the children list a 422 on the cursor, never a database error", async () => {
    for (const cursor of [...MALFORMED, ...FOREIGN_TO_CHILDREN, OVERSIZED]) {
      const response = await call("GET", `/children?cursor=${cursor}`);
      const body = await expectProblem(response, 422, "validation_failed");
      expect(body.errors?.map((error) => error.path)).toEqual(["cursor"]);
    }
  });

  it("answers the measurements list a 422 on the cursor, never a database error", async () => {
    for (const cursor of [...MALFORMED, ...FOREIGN_TO_MEASUREMENTS, OVERSIZED]) {
      const response = await call("GET", `/children/${childId}/measurements?cursor=${cursor}`);
      const body = await expectProblem(response, 422, "validation_failed");
      expect(body.errors?.map((error) => error.path)).toEqual(["cursor"]);
    }
  });

  it("still pages both lists with the cursors they issue", async () => {
    const first = await json<{ items: ChildMeasurement[]; nextCursor: string | null }>(
      await call("GET", `/children/${childId}/measurements?limit=1`),
    );
    expect(first.nextCursor).not.toBeNull();
    const second = await call(
      "GET",
      `/children/${childId}/measurements?limit=1&cursor=${first.nextCursor}`,
    );
    expect(second.status).toBe(200);
    const children = await call("GET", `/children?cursor=${forged({ i: SOME_ID })}`);
    expect(children.status).toBe(200);
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

/** Rows per table that a refused or rolled-back create must leave alone. */
async function createFootprint() {
  return {
    households: await db.$count(schema.households),
    householdMembers: await db.$count(schema.householdMembers),
    children: await db.$count(schema.children),
    childGuardians: await db.$count(schema.childGuardians),
    consents: await db.$count(schema.consents),
    subjectKeys: await db.$count(schema.subjectKeys),
  };
}

describe("the guardian's consent on the child's behalf", () => {
  it("is written with the child, in its transaction, in the catalog's words", async () => {
    const disclosure = CHILD_CONSENT_DISCLOSURES["2026-10"];
    for (const [subjectId, guardianId] of [
      [childId, ANNA],
      [danaChildId, DANA],
    ] as const) {
      // One row each: the idempotent replay of Mo's create wrote no second one.
      const rows = await db
        .select()
        .from(schema.consents)
        .where(eq(schema.consents.subjectId, subjectId));
      expect(rows).toHaveLength(1);
      const [consent] = rows;
      expect(consent).toMatchObject({
        subjectId,
        consentingGuardianId: guardianId,
        category: "child",
        basis: disclosure.basis,
        purpose: disclosure.purpose,
        policyVersion: "2026-10",
        textHash: guardianConsentHash("2026-10"),
        withdrawnAt: null,
        thirdPartySharing: null,
        deletedAt: null,
      });
      // The transaction's now(): granted the instant the child row was created.
      const [child] = await db
        .select({ createdAt: schema.children.createdAt })
        .from(schema.children)
        .where(eq(schema.children.id, subjectId));
      expect(consent?.grantedAt.getTime()).toBe(child?.createdAt.getTime());
    }
    expect(guardianConsentHash("2026-10")).toMatch(/^[0-9a-f]{64}$/);

    // The guardian finds it among the consents she gave, for herself and the children she guards.
    const listed = await json<{ items: Consent[] }>(await call("GET", "/me/consents"));
    const mine = listed.items.filter((item) => item.subjectId === childId);
    expect(mine).toEqual([
      {
        id: expect.any(String),
        subjectId: childId,
        consentingGuardianId: ANNA,
        category: "child",
        basis: disclosure.basis,
        purpose: disclosure.purpose,
        textVersion: "2026-10",
        textHash: guardianConsentHash("2026-10"),
        grantedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        withdrawnAt: null,
      },
    ]);
    // A guardian sees only the consents of the children she guards.
    const danas = await json<{ items: Consent[] }>(
      await call("GET", "/me/consents", { token: CHILDREN_TOKENS.dana }),
    );
    expect(danas.items.map((item) => item.subjectId)).not.toContain(childId);
  });

  it("is required: without it, unchecked or on a text the catalog lacks, a create is a 422 that writes nothing", async () => {
    const before = await createFootprint();
    const child = { displayName: "Kit", dateOfBirth: BORN };
    const cases: [string, Record<string, unknown>, string][] = [
      [KEYS.noConsent, child, "guardianConsent"],
      [
        KEYS.unchecked,
        { ...child, guardianConsent: { ...CONSENT, given: false } },
        "guardianConsent.given",
      ],
      [
        KEYS.unknownText,
        { ...child, guardianConsent: { ...CONSENT, textVersion: "2027-01" } },
        "guardianConsent.textVersion",
      ],
    ];
    // Cara has no household: a create that went through would open one.
    for (const [key, body, path] of cases) {
      const response = await call("POST", "/children", { token: CHILDREN_TOKENS.cara, key, body });
      const problem = await expectProblem(response, 422, "validation_failed");
      expect(problem.errors?.map((error) => error.path)).toEqual([path]);
    }
    expect(await createFootprint()).toEqual(before);
  });

  it("commits with the child, its guardian and its key, or not at all", async () => {
    const before = await createFootprint();
    // A key provider that cannot wrap: the create fails at its last step, after the consent row.
    const broken: KeyProvider = {
      provider: "broken",
      version: "test",
      wrapDek: () => {
        throw new Error("wrap refused");
      },
      unwrapDek: () => {
        throw new Error("unwrap refused");
      },
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // The same database and sessions behind an app whose key provider cannot wrap.
    const sound = app;
    app = createApp({
      auth: fixture.auth,
      db,
      keys: broken,
      log: { sink: () => undefined },
      clock: realCalendarClock,
    });
    try {
      const response = await call("POST", "/children", {
        token: CHILDREN_TOKENS.cara,
        key: KEYS.rolledBack,
        body: { displayName: "Kit", dateOfBirth: BORN, guardianConsent: CONSENT },
      });
      await expectProblem(response, 500, "internal");
    } finally {
      app = sound;
      quiet.mockRestore();
    }
    expect(await createFootprint()).toEqual(before);
  });

  it("is withdrawn through the child's closure path, never the collection consent's route", async () => {
    const [consent] = await db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, childId));
    const response = await call("POST", `/me/consents/${consent?.id}/withdraw`, {
      key: KEYS.withdrawChild,
    });
    const problem = await expectProblem(response, 422, "validation_failed");
    expect(problem.detail).toBe(CHILD_CONSENT_NOT_WITHDRAWN_HERE);
    const [still] = await db
      .select({ withdrawnAt: schema.consents.withdrawnAt })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, childId));
    expect(still).toEqual({ withdrawnAt: null });
  });
});

describe("a feed's method and a diaper's contents", () => {
  const at = (time: string) => `${DAY_TEN}T${time}:00Z`;
  const ids: Record<string, string> = {};

  it("logs a breast feed with its side, a bottle with its volume, solids alone, and a diaper with its contents", async () => {
    const cases: [string, string, Record<string, unknown>, Partial<ChildEvent>][] = [
      [
        "breast",
        KEYS.breast,
        {
          kind: "feed",
          date: DAY_TEN,
          startedAt: at("06:00"),
          endedAt: at("06:18"),
          feedMethod: "breast",
          side: "left",
        },
        { feedMethod: "breast", side: "left", quantityMl: null, diaperContents: null },
      ],
      [
        "bottle",
        KEYS.bottle,
        {
          kind: "feed",
          date: DAY_TEN,
          startedAt: at("09:00"),
          feedMethod: "bottle",
          quantityMl: 120,
        },
        { feedMethod: "bottle", side: null, quantityMl: 120, diaperContents: null },
      ],
      [
        "solids",
        KEYS.solids,
        { kind: "feed", date: DAY_TEN, startedAt: at("12:00"), feedMethod: "solids", note: NOTE },
        { feedMethod: "solids", side: null, quantityMl: null, diaperContents: null, note: NOTE },
      ],
      [
        "mixed",
        KEYS.mixed,
        { kind: "diaper", date: DAY_TEN, startedAt: at("12:30"), diaperContents: "mixed" },
        { feedMethod: null, side: null, quantityMl: null, diaperContents: "mixed" },
      ],
    ];
    for (const [name, key, body, expected] of cases) {
      const response = await call("POST", `/children/${danaChildId}/events`, {
        token: CHILDREN_TOKENS.dana,
        key,
        body,
      });
      expect(response.status, name).toBe(201);
      const event = await json<ChildEvent>(response);
      expect(event, name).toMatchObject({ ...expected, kind: body["kind"], authorId: DANA });
      ids[name] = event.id;
    }

    const stored = await db
      .select({
        id: schema.childEvents.id,
        feedMethod: schema.childEvents.feedMethod,
        diaperContents: schema.childEvents.diaperContents,
      })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.childId, danaChildId))
      .orderBy(schema.childEvents.id);
    expect(stored).toEqual([
      { id: ids["breast"], feedMethod: "breast", diaperContents: null },
      { id: ids["bottle"], feedMethod: "bottle", diaperContents: null },
      { id: ids["solids"], feedMethod: "solids", diaperContents: null },
      { id: ids["mixed"], feedMethod: null, diaperContents: "mixed" },
    ]);

    const listed = await json<{ items: ChildEvent[] }>(
      await call("GET", `/children/${danaChildId}/events?from=${DAY_TEN}&to=${DAY_TEN}`, {
        token: CHILDREN_TOKENS.dana,
      }),
    );
    expect(listed.items.map((item) => [item.feedMethod, item.diaperContents])).toEqual([
      ["breast", null],
      ["bottle", null],
      ["solids", null],
      [null, "mixed"],
    ]);
  });

  it("answers 422 naming the field for a method or contents on the wrong kind, and for what a method does not carry", async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      [KEYS.wrong1, { kind: "diaper", date: DAY_TEN, feedMethod: "bottle" }, "feedMethod"],
      [
        KEYS.wrong2,
        { kind: "sleep", date: DAY_TEN, startedAt: at("20:00"), diaperContents: "wet" },
        "diaperContents",
      ],
      [KEYS.wrong3, { kind: "feed", date: DAY_TEN, diaperContents: "dirty" }, "diaperContents"],
      [KEYS.wrong4, { kind: "feed", date: DAY_TEN, feedMethod: "bottle", side: "right" }, "side"],
      [
        KEYS.wrong5,
        { kind: "feed", date: DAY_TEN, feedMethod: "breast", quantityMl: 60 },
        "quantityMl",
      ],
      [
        KEYS.wrong6,
        { kind: "feed", date: DAY_TEN, feedMethod: "solids", quantityMl: 40 },
        "quantityMl",
      ],
      [KEYS.wrong7, { kind: "feed", date: DAY_TEN, feedMethod: "formula" }, "feedMethod"],
    ];
    for (const [key, body, path] of cases) {
      const response = await call("POST", `/children/${danaChildId}/events`, {
        token: CHILDREN_TOKENS.dana,
        key,
        body,
      });
      const problem = await expectProblem(response, 422, "validation_failed");
      expect(problem.errors?.map((error) => error.path)).toEqual([path]);
    }
  });

  it("replaces a method and contents, and leaves neither on the deleted row", async () => {
    const replaced = await call("PUT", `/children/${danaChildId}/events/${ids["bottle"]}`, {
      token: CHILDREN_TOKENS.dana,
      ifMatch: "1",
      body: {
        kind: "feed",
        date: DAY_TEN,
        startedAt: at("09:00"),
        feedMethod: "breast",
        side: "right",
      },
    });
    expect(replaced.status).toBe(200);
    expect(await json<ChildEvent>(replaced)).toMatchObject({
      feedMethod: "breast",
      side: "right",
      quantityMl: null,
      version: 2,
    });
    const refused = await call("PUT", `/children/${danaChildId}/events/${ids["mixed"]}`, {
      token: CHILDREN_TOKENS.dana,
      body: { kind: "diaper", date: DAY_TEN, feedMethod: "solids" },
    });
    expect((await expectProblem(refused, 422, "validation_failed")).errors?.[0]?.path).toBe(
      "feedMethod",
    );
    const changed = await call("PUT", `/children/${danaChildId}/events/${ids["mixed"]}`, {
      token: CHILDREN_TOKENS.dana,
      body: { kind: "diaper", date: DAY_TEN, startedAt: at("12:30"), diaperContents: "wet" },
    });
    expect((await json<ChildEvent>(changed)).diaperContents).toBe("wet");

    for (const name of ["bottle", "mixed"]) {
      const removed = await call("DELETE", `/children/${danaChildId}/events/${ids[name]}`, {
        token: CHILDREN_TOKENS.dana,
      });
      expect(removed.status).toBe(204);
    }
    const rows = await db
      .select({
        feedMethod: schema.childEvents.feedMethod,
        diaperContents: schema.childEvents.diaperContents,
        side: schema.childEvents.side,
      })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.childId, danaChildId))
      .orderBy(schema.childEvents.id);
    expect(rows).toEqual([
      { feedMethod: "breast", diaperContents: null, side: "left" },
      { feedMethod: null, diaperContents: null, side: null },
      { feedMethod: "solids", diaperContents: null, side: null },
      { feedMethod: null, diaperContents: null, side: null },
    ]);
  });

  it("reaches a read grantee with the rest of the event, and nothing at summary", async () => {
    const logged = await call("POST", `/children/${childId}/events`, {
      key: KEYS.annaBottle,
      body: {
        kind: "feed",
        date: BORN,
        startedAt: `${BORN}T23:00:00Z`,
        feedMethod: "bottle",
        quantityMl: 60,
      },
    });
    expect(logged.status).toBe(201);
    const loggedId = (await json<ChildEvent>(logged)).id;

    await setGrant("read");
    const seen = await json<{ items: Record<string, unknown>[] }>(
      await call("GET", `/children/${childId}/events?kind=feed`, { token: CHILDREN_TOKENS.cara }),
    );
    const bottle = seen.items.find((item) => item["id"] === loggedId);
    expect(Object.keys(bottle ?? {}).sort()).toEqual(sorted(GRANTEE_EVENT_KEYS));
    expect(bottle).toMatchObject({ feedMethod: "bottle", quantityMl: 60, diaperContents: null });

    await setGrant("summary");
    await expectProblem(
      await call("GET", `/children/${childId}/events?kind=feed&order=desc&limit=1`, {
        token: CHILDREN_TOKENS.cara,
      }),
      404,
      "not_found",
    );
    await setGrant("revoked");
  });
});

describe("events newest first", () => {
  // Wren's own child, so every event on it is this block's. Two days, logged out of order.
  const DAY_ONE = addDays(BORN, 20);
  const DAY_TWO = addDays(BORN, 21);
  let wrenId = "";
  const ID = (n: number) => `018f5e7a-4000-7000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
  type Page = { items: ChildEvent[]; nextCursor: string | null };
  const read = async (query: string) =>
    call("GET", `/children/${wrenId}/events?${query}`, { token: CHILDREN_TOKENS.dana });

  /** A cursor as the list writes one, for the cases the list never issues. */
  const forged = (parts: Record<string, string>) =>
    Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");

  it("orders by day, then by when each event happened, so an event logged later takes its place", async () => {
    const created = await call("POST", "/children", {
      token: CHILDREN_TOKENS.dana,
      key: KEYS.wren,
      body: { displayName: "Wren", dateOfBirth: BORN, guardianConsent: CONSENT },
    });
    expect(created.status).toBe(201);
    wrenId = (await json<Child>(created)).id;

    // In the order a tired parent logs them; ids rise with it.
    const events: [string, Record<string, unknown>][] = [
      [
        KEYS.newest1,
        {
          id: ID(1),
          kind: "feed",
          date: DAY_TWO,
          startedAt: `${DAY_TWO}T07:00:00Z`,
          feedMethod: "bottle",
        },
      ],
      [
        KEYS.newest2,
        {
          id: ID(2),
          kind: "diaper",
          date: DAY_ONE,
          startedAt: `${DAY_ONE}T09:00:00Z`,
          diaperContents: "wet",
        },
      ],
      // Logged after the 07:00 feed, given at 05:00: back-filled.
      [
        KEYS.newest3,
        {
          id: ID(3),
          kind: "feed",
          date: DAY_TWO,
          startedAt: `${DAY_TWO}T05:00:00Z`,
          feedMethod: "breast",
        },
      ],
      [
        KEYS.newest4,
        {
          id: ID(4),
          kind: "sleep",
          date: DAY_ONE,
          startedAt: `${DAY_ONE}T20:00:00Z`,
          endedAt: `${DAY_TWO}T04:00:00Z`,
        },
      ],
      // Two diapers without a time: they sit where they were logged, which is now.
      [KEYS.newest5, { id: ID(5), kind: "diaper", date: DAY_TWO, diaperContents: "dirty" }],
      [KEYS.newest6, { id: ID(6), kind: "diaper", date: DAY_TWO }],
      // The same moment twice: the id breaks the tie.
      [
        KEYS.newest7,
        { id: ID(7), kind: "diaper", date: DAY_ONE, startedAt: `${DAY_ONE}T12:00:00Z` },
      ],
      [
        KEYS.newest8,
        { id: ID(8), kind: "diaper", date: DAY_ONE, startedAt: `${DAY_ONE}T12:00:00Z` },
      ],
    ];
    for (const [key, body] of events) {
      const response = await call("POST", `/children/${wrenId}/events`, {
        token: CHILDREN_TOKENS.dana,
        key,
        body,
      });
      expect(response.status).toBe(201);
    }

    const newest = await json<Page>(await read("order=desc"));
    expect(newest.items.map((item) => item.id)).toEqual([
      ID(6),
      ID(5),
      ID(1),
      ID(3),
      ID(4),
      ID(8),
      ID(7),
      ID(2),
    ]);
    expect(newest.nextCursor).toBeNull();

    // The default stays the sync order: by day, then by id.
    const oldest = await json<Page>(await read(""));
    expect(oldest.items.map((item) => item.id)).toEqual([
      ID(2),
      ID(4),
      ID(7),
      ID(8),
      ID(1),
      ID(3),
      ID(5),
      ID(6),
    ]);

    const today = await json<Page>(await read(`order=desc&from=${DAY_TWO}&to=${DAY_TWO}`));
    expect(today.items.map((item) => item.id)).toEqual([ID(6), ID(5), ID(1), ID(3)]);
  });

  it("finds the last event of a kind in one row, the back-filled feed included", async () => {
    const lastFeed = await json<Page>(await read("kind=feed&order=desc&limit=1"));
    expect(lastFeed.items.map((item) => [item.id, item.feedMethod])).toEqual([[ID(1), "bottle"]]);
    const lastSleep = await json<Page>(await read("kind=sleep&order=desc&limit=1"));
    expect(lastSleep.items.map((item) => item.id)).toEqual([ID(4)]);
    const lastDiaper = await json<Page>(await read("kind=diaper&order=desc&limit=1"));
    expect(lastDiaper.items.map((item) => item.id)).toEqual([ID(6)]);
    expect(lastDiaper.nextCursor).not.toBeNull();
  });

  it("pages newest first with a cursor of its own, without skipping or repeating a row", async () => {
    for (const limit of [1, 3]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = `order=desc&limit=${limit}${cursor === null ? "" : `&cursor=${cursor}`}`;
        const page: Page = await json<Page>(await read(query));
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(seen, `limit ${limit}`).toEqual([
        ID(6),
        ID(5),
        ID(1),
        ID(3),
        ID(4),
        ID(8),
        ID(7),
        ID(2),
      ]);
    }
  });

  it("refuses a cursor from the other order, and one it never issued, as a 422 on the cursor", async () => {
    const desc = (await json<Page>(await read("order=desc&limit=2"))).nextCursor;
    const asc = (await json<Page>(await read("limit=2"))).nextCursor;
    expect(desc).not.toBeNull();
    expect(asc).not.toBeNull();
    const moment = "2026-10-01T05:00:00.000000Z";
    for (const query of [
      `limit=2&cursor=${desc}`,
      `order=desc&limit=2&cursor=${asc}`,
      `order=desc&cursor=${forged({ o: "desc", d: DAY_TWO, t: moment, i: "not-an-id" })}`,
      `order=desc&cursor=${forged({ o: "desc", d: "2026-02-31", t: moment, i: ID(1) })}`,
      `order=desc&cursor=${forged({ o: "desc", d: DAY_TWO, t: "2026-02-31T05:00:00.000000Z", i: ID(1) })}`,
      // JavaScript reads year 0000 as 1 BC; Postgres has no year zero, so the cast would fail.
      `order=desc&cursor=${forged({ o: "desc", d: DAY_TWO, t: "0000-01-01T00:00:00.000000Z", i: ID(1) })}`,
      `order=desc&cursor=${forged({ o: "desc", d: DAY_TWO, t: "yesterday", i: ID(1) })}`,
      `order=desc&cursor=${forged({ o: "desc", d: DAY_TWO, i: ID(1) })}`,
      `cursor=${forged({ d: "2026-13-01", i: ID(1) })}`,
      "order=desc&cursor=not-a-cursor",
    ]) {
      const problem = await expectProblem(await read(query), 422, "validation_failed");
      expect(
        problem.errors?.map((error) => error.path),
        query,
      ).toEqual(["cursor"]);
    }
    await expectProblem(await read("order=newest"), 422, "validation_failed");
  });

  it("keeps the cursor's moment to the microsecond, so two events logged in one millisecond both come back", async () => {
    // Two diapers without a time on a day of their own, written straight to the table so
    // their logged moments sit 100 microseconds apart inside one millisecond. The newer one
    // has the lower id, so only the moment orders them. A cursor rounded to the millisecond,
    // as a JavaScript Date would round it, skips the older one or repeats the newer one.
    const DAY_THREE = addDays(BORN, 22);
    const loggedAt = (micros: string) => sql`${`${DAY_THREE}T10:00:00.123${micros}Z`}::timestamptz`;
    await db.insert(schema.childEvents).values([
      {
        id: ID(9),
        childId: wrenId,
        authorId: DANA,
        kind: "diaper",
        date: DAY_THREE,
        createdAt: loggedAt("200"),
        updatedAt: loggedAt("200"),
      },
      {
        id: ID(10),
        childId: wrenId,
        authorId: DANA,
        kind: "diaper",
        date: DAY_THREE,
        createdAt: loggedAt("100"),
        updatedAt: loggedAt("100"),
      },
    ]);

    const seen: ChildEvent[] = [];
    let cursor: string | null = null;
    // Two rows need two pages; the bound makes a cursor that repeats a row fail, not loop.
    for (let pages = 0; pages < 4; pages += 1) {
      const query: string = `order=desc&from=${DAY_THREE}&to=${DAY_THREE}&limit=1${cursor === null ? "" : `&cursor=${cursor}`}`;
      const page: Page = await json<Page>(await read(query));
      seen.push(...page.items);
      cursor = page.nextCursor;
      if (cursor === null) break;
    }
    expect(seen.map((item) => item.id)).toEqual([ID(9), ID(10)]);
    // The API itself shows both at the same millisecond.
    expect(new Set(seen.map((item) => item.createdAt)).size).toBe(1);
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
      "GuardianConsentInput",
    ]) {
      expect(document.components.schemas).toHaveProperty(name);
    }
    // Task E12: the create body needs the guardian's consent; the events list reads either way.
    const input = document.components.schemas["ChildInput"] as { required?: string[] };
    expect(input.required).toContain("guardianConsent");
    const list = document.paths["/api/v1/children/{id}/events"]?.["get"] as {
      parameters: { name: string; in: string; schema: { enum?: string[]; default?: string } }[];
    };
    const order = list.parameters.find((parameter) => parameter.name === "order");
    expect(order).toMatchObject({ in: "query", schema: { enum: ["asc", "desc"], default: "asc" } });
  });
});
