import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { schema } from "@tidefern/db";
import {
  ConsentList,
  ConsentRecord,
  ConsentWithdrawal,
  DataSummary,
  Problem,
  Profile,
} from "@tidefern/schemas";
import type { ConsentInput } from "@tidefern/schemas";

import { createApp } from "../app";
import { FRESH_AUTHENTICATION_REQUIRED } from "../auth";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_REPLAYED_HEADER,
} from "../middleware/idempotency";
import { sessionHeaders } from "../test/auth-fake";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import type { ApiTestDatabase } from "../test/database";
import {
  AGE_ATTESTATION_REQUIRED,
  CHILD_CONSENT_NOT_WITHDRAWN_HERE,
  CLOSURE_JOB_TYPE,
  CLOSURE_UNDO_WINDOW_MS,
  CONSENT_ALREADY_WITHDRAWN,
  CURSOR_INVALID,
  IF_MATCH_INVALID,
  IF_MATCH_REQUIRED,
  PROCESSORS,
  STAGE_LOCKED_BY_RECORD,
  STAGE_NEEDS_RECORD,
  STALE_VERSION,
  disclosureHash,
  parseIfMatch,
} from "./profile";

// Synthetic people and records only. Dan has no relationship with anyone.
const DAN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const CHILD_CONSENT = "018f5e7a-5000-7000-8000-000000000001";
const PREGNANCY = "018f5e7a-5000-7000-8000-000000000002";
const MISSING = "018f5e7a-5000-7000-8000-0000000000ff";

const TOKEN = { ...TOKENS, dan: "dan", annaStale: "anna-stale" } as const;

// Distinct values so a leak of Anna's profile into another response is visible as text.
const ANNA_NAME = "Annabel Quill";
const ANNA_ZONE = "Asia/Kolkata";

const DISCLOSURE: ConsentInput = {
  categories: [
    {
      category: "cycle.history",
      basis: "necessary",
      purpose: "Keep the dates you log so the calendar and the estimates work.",
    },
    {
      category: "journal.private",
      basis: "necessary",
      purpose: "Keep your notes, encrypted, so you can read them later.",
    },
  ],
  processors: ["Vercel", "Neon (Databricks, Inc.)", "GitHub", "Resend", "Cloudflare"],
  textVersion: "2026-10",
  termsVersion: "2026-10",
};

let harness: ApiTestDatabase;
let app: ReturnType<typeof createApp>;
let keyCounter = 0;

/** A fresh UUID-shaped idempotency key per call. */
function newKey(): string {
  keyCounter += 1;
  return `018f5e7a-6000-7000-8000-${String(keyCounter).padStart(12, "0")}`;
}

interface CallOptions {
  body?: unknown;
  headers?: Record<string, string>;
  key?: string | null;
}

/** One request through the whole app with the test database bound as the routes' `db`. */
async function call(
  method: "GET" | "PUT" | "POST",
  path: string,
  token: string | null,
  options: CallOptions = {},
): Promise<Response> {
  const headers = new Headers(token === null ? {} : sessionHeaders(token));
  if (method !== "GET") headers.set("origin", OWN_ORIGIN);
  if (method === "POST" && options.key !== null) {
    headers.set(IDEMPOTENCY_KEY_HEADER, options.key ?? newKey());
  }
  if (options.body !== undefined) headers.set("content-type", "application/json");
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  return app.request(
    `/api${path}`,
    {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    { db: harness.db },
  );
}

async function problemOf(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  return Problem.parse(await response.json());
}

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: ANNA_NAME,
    timeZone: ANNA_ZONE,
    stage: "cycle",
    weekStart: 1,
    units: "metric",
    notificationDetail: "generic",
    ...overrides,
  };
}

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  const { db } = harness;
  await db
    .insert(schema.user)
    .values({ id: DAN, name: "Dan", email: "dan@example.com", emailVerified: true });
  fixture.auth.signIn(TOKEN.dan, DAN, "dan@example.com", 60);
  // Signed in an hour ago: a session, but not a fresh authentication.
  fixture.auth.signIn(TOKEN.annaStale, ANNA, "anna@example.com", 3600);

  // Anna and Ben guard one child; Anna gave a consent on the child's behalf.
  await db.insert(schema.households).values({ id: HOUSEHOLD });
  await db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" });
  await db.insert(schema.childGuardians).values([
    { id: "018f5e7a-5000-7000-8000-00000000a001", childId: CHILD, userId: ANNA },
    { id: "018f5e7a-5000-7000-8000-00000000a002", childId: CHILD, userId: BEN },
  ]);
  await db.insert(schema.consents).values({
    id: CHILD_CONSENT,
    subjectId: CHILD,
    consentingGuardianId: ANNA,
    category: "child",
    basis: "necessary",
    purpose: "Keep the child's records for the guardians.",
    policyVersion: "2026-10",
    textHash: "0".repeat(64),
  });

  // Anna shares her history with Ben (read) and her status with Cara
  // (summary); a pregnancy grant to Cara was revoked.
  await db.insert(schema.grants).values([
    {
      id: "018f5e7a-5000-7000-8000-00000000b001",
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.history",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    {
      id: "018f5e7a-5000-7000-8000-00000000b002",
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.status",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    {
      id: "018f5e7a-5000-7000-8000-00000000b003",
      ownerId: ANNA,
      granteeId: CARA,
      category: "pregnancy.overview",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
      revokedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
  ]);

  // Anna's own rows, for the counts: two logged days and one private note.
  await db.insert(schema.cycleEntries).values([
    {
      id: "018f5e7a-5000-7000-8000-00000000c001",
      subjectId: ANNA,
      date: "2026-09-01",
      flow: "medium",
    },
    {
      id: "018f5e7a-5000-7000-8000-00000000c002",
      subjectId: ANNA,
      date: "2026-09-02",
      flow: "light",
    },
  ]);
  await db.insert(schema.notes).values({
    id: "018f5e7a-5000-7000-8000-00000000c003",
    subjectId: ANNA,
    authorId: ANNA,
    category: "journal.private",
    date: "2026-09-02",
    body: new Uint8Array([1, 2, 3]),
    kekVersion: "v1",
  });

  // Cara has an active pregnancy record, which decides her stage.
  await db.insert(schema.pregnancies).values({
    id: PREGNANCY,
    subjectId: CARA,
    dueDate: "2027-03-01",
    datingMethod: "lmp",
  });

  app = createApp({ auth: fixture.auth, db, log: { sink: () => undefined } });
});

afterAll(async () => {
  await harness.close();
});

describe("parseIfMatch and disclosureHash", () => {
  it("reads a bare, quoted or weak version and refuses anything else", () => {
    expect(parseIfMatch("3")).toBe(3);
    expect(parseIfMatch('"3"')).toBe(3);
    expect(parseIfMatch('W/"12"')).toBe(12);
    expect(parseIfMatch("0")).toBeNull();
    expect(parseIfMatch("abc")).toBeNull();
    expect(parseIfMatch("*")).toBeNull();
  });

  it("hashes the same disclosure the same in any order and a changed word differently", () => {
    const reordered: ConsentInput = {
      ...DISCLOSURE,
      categories: [...DISCLOSURE.categories].reverse(),
      processors: [...DISCLOSURE.processors].reverse(),
    };
    expect(disclosureHash(reordered)).toBe(disclosureHash(DISCLOSURE));
    expect(disclosureHash({ ...DISCLOSURE, termsVersion: "2026-11" })).not.toBe(
      disclosureHash(DISCLOSURE),
    );
    expect(disclosureHash(DISCLOSURE)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("GET and PUT /v1/me/profile", () => {
  it("answers 401 without a session", async () => {
    expect((await call("GET", "/v1/me/profile", null)).status).toBe(401);
    expect((await call("PUT", "/v1/me/profile", null, { body: profileInput() })).status).toBe(401);
  });

  it("answers 404 before onboarding creates the profile", async () => {
    const response = await call("GET", "/v1/me/profile", TOKENS.anna);
    expect(response.status).toBe(404);
    expect((await problemOf(response)).code).toBe("not_found");
  });

  it("refuses a create without the age attestation", async () => {
    const response = await call("PUT", "/v1/me/profile", TOKENS.anna, { body: profileInput() });
    expect(response.status).toBe(422);
    const body = await problemOf(response);
    expect(body.detail).toBe(AGE_ATTESTATION_REQUIRED);
    expect(body.errors?.[0]?.path).toBe("ageAttested");
  });

  it("refuses an unknown time zone, an offset and a week start out of range with field errors", async () => {
    for (const [field, value] of [
      ["timeZone", "Mars/Olympus"],
      ["timeZone", "+05:30"],
      ["weekStart", 8],
      ["stage", "trying"],
    ] as const) {
      const response = await call("PUT", "/v1/me/profile", TOKENS.anna, {
        body: profileInput({ ageAttested: true, [field]: value }),
      });
      expect(response.status, `${field}=${String(value)}`).toBe(422);
      const body = await problemOf(response);
      expect(body.code).toBe("validation_failed");
      expect(body.errors?.map((error) => error.path)).toContain(field);
    }
  });

  it("creates the profile with version 1, the attestation instant and an ETag", async () => {
    const before = Date.now();
    const response = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ ageAttested: true }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"1"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = Profile.parse(await response.json());
    expect(body).toMatchObject({
      displayName: ANNA_NAME,
      timeZone: ANNA_ZONE,
      stage: "cycle",
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
      version: 1,
    });
    expect(Date.parse(body.ageAttestedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(body.createdAt).toMatch(/\.\d{3}Z$/);

    const read = await call("GET", "/v1/me/profile", TOKENS.anna);
    expect(read.status).toBe(200);
    expect(read.headers.get("etag")).toBe('"1"');
    expect(Profile.parse(await read.json())).toEqual(body);
  });

  it("needs If-Match on a replace and answers 422 when it is missing or malformed", async () => {
    const missing = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ units: "imperial" }),
    });
    expect(missing.status).toBe(422);
    expect((await problemOf(missing)).detail).toBe(IF_MATCH_REQUIRED);

    const malformed = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ units: "imperial" }),
      headers: { "if-match": "latest" },
    });
    expect(malformed.status).toBe(422);
    expect((await problemOf(malformed)).detail).toBe(IF_MATCH_INVALID);
  });

  it("answers 409 on a stale version and replaces the profile on the current one", async () => {
    const stale = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ units: "imperial" }),
      headers: { "if-match": '"7"' },
    });
    expect(stale.status).toBe(409);
    const problem = await problemOf(stale);
    expect(problem.code).toBe("conflict");
    expect(problem.detail).toBe(STALE_VERSION);

    const current = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ units: "imperial", weekStart: 7, notificationDetail: "gentle" }),
      headers: { "if-match": '"1"' },
    });
    expect(current.status).toBe(200);
    expect(current.headers.get("etag")).toBe('"2"');
    const body = Profile.parse(await current.json());
    expect(body).toMatchObject({
      units: "imperial",
      weekStart: 7,
      notificationDetail: "gentle",
      version: 2,
    });

    // The version that just won is now stale for anyone still holding it.
    const again = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput(),
      headers: { "if-match": "1" },
    });
    expect(again.status).toBe(409);
  });

  it("refuses moving into pregnancy without a record, as the domain forbids", async () => {
    const response = await call("PUT", "/v1/me/profile", TOKENS.anna, {
      body: profileInput({ stage: "pregnancy" }),
      headers: { "if-match": "2" },
    });
    expect(response.status).toBe(422);
    const body = await problemOf(response);
    expect(body.detail).toBe(STAGE_NEEDS_RECORD);
    expect(body.errors?.[0]?.path).toBe("stage");
    // Nothing about the change reached the row.
    const [row] = await harness.db
      .select({ stage: schema.profiles.stage, version: schema.profiles.version })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, ANNA));
    expect(row).toEqual({ stage: "cycle", version: 2 });
  });

  it("holds the stage an active record decides, at creation and on a later change", async () => {
    const wrongAtCreate = await call("PUT", "/v1/me/profile", TOKENS.cara, {
      body: profileInput({ displayName: "Cara", timeZone: "Europe/Berlin", ageAttested: true }),
    });
    expect(wrongAtCreate.status).toBe(422);
    expect((await problemOf(wrongAtCreate)).detail).toBe(STAGE_LOCKED_BY_RECORD);

    const created = await call("PUT", "/v1/me/profile", TOKENS.cara, {
      body: profileInput({
        displayName: "Cara",
        timeZone: "Europe/Berlin",
        stage: "pregnancy",
        ageAttested: true,
      }),
    });
    expect(created.status).toBe(201);

    const leave = await call("PUT", "/v1/me/profile", TOKENS.cara, {
      body: profileInput({ displayName: "Cara", timeZone: "Europe/Berlin", stage: "postpartum" }),
      headers: { "if-match": "1" },
    });
    expect(leave.status).toBe(422);
    expect((await problemOf(leave)).detail).toBe(STAGE_LOCKED_BY_RECORD);

    // Other fields still change while the stage stays what the record says.
    const units = await call("PUT", "/v1/me/profile", TOKENS.cara, {
      body: profileInput({
        displayName: "Cara",
        timeZone: "Europe/Berlin",
        stage: "pregnancy",
        units: "imperial",
      }),
      headers: { "if-match": "1" },
    });
    expect(units.status).toBe(200);
  });

  it("serves each grantee her own profile and nothing of the owner's", async () => {
    const created = await call("PUT", "/v1/me/profile", TOKENS.ben, {
      body: profileInput({ displayName: "Ben", timeZone: "UTC", ageAttested: true }),
    });
    expect(created.status).toBe(201);

    // Ben holds a read grant from Anna, Cara a summary grant and a revoked one.
    for (const token of [TOKENS.ben, TOKENS.cara]) {
      const response = await call("GET", "/v1/me/profile", token);
      expect(response.status).toBe(200);
      const text = await response.text();
      const body = Profile.parse(JSON.parse(text));
      expect(Object.keys(body).sort()).toEqual(Object.keys(Profile.shape).sort());
      expect(text).not.toContain(ANNA);
      expect(text).not.toContain(ANNA_NAME);
      expect(text).not.toContain(ANNA_ZONE);
    }
    // Dan, a foreign actor, has no profile and sees no one else's.
    expect((await call("GET", "/v1/me/profile", TOKEN.dan)).status).toBe(404);
  });
});

describe("POST and GET /v1/me/consents", () => {
  let record: ConsentRecord;
  const firstKey = newKey();

  it("needs an idempotency key", async () => {
    const response = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: DISCLOSURE,
      key: null,
    });
    expect(response.status).toBe(400);
    expect((await problemOf(response)).detail).toBe(IDEMPOTENCY_KEY_REQUIRED);
  });

  it("refuses a repeated category, an empty processor list and an unknown category with 422", async () => {
    const bodies = [
      { ...DISCLOSURE, categories: [DISCLOSURE.categories[0], DISCLOSURE.categories[0]] },
      { ...DISCLOSURE, processors: [] },
      {
        ...DISCLOSURE,
        categories: [{ category: "fertility", basis: "consent", purpose: "Anything" }],
      },
    ];
    for (const body of bodies) {
      const response = await call("POST", "/v1/me/consents", TOKENS.anna, { body });
      expect(response.status).toBe(422);
      const problem = await problemOf(response);
      expect(problem.code).toBe("validation_failed");
      expect(problem.errors?.length).toBeGreaterThan(0);
    }
  });

  it("records one row per category bound to the disclosure hash, the subject being the actor", async () => {
    const response = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: DISCLOSURE,
      key: firstKey,
    });
    expect(response.status).toBe(201);
    record = ConsentRecord.parse(await response.json());
    expect(record.textHash).toBe(disclosureHash(DISCLOSURE));
    expect(record.processors).toEqual(DISCLOSURE.processors);
    expect(record.termsVersion).toBe("2026-10");
    expect(record.items.map((item) => item.category).sort()).toEqual([
      "cycle.history",
      "journal.private",
    ]);
    for (const item of record.items) {
      expect(item).toMatchObject({
        subjectId: ANNA,
        consentingGuardianId: null,
        basis: "necessary",
        textVersion: "2026-10",
        textHash: record.textHash,
        withdrawnAt: null,
      });
    }
    const rows = await harness.db
      .select()
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, ANNA));
    expect(rows).toHaveLength(2);
  });

  it("replays the create for the same key and body without writing again", async () => {
    const replay = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: DISCLOSURE,
      key: firstKey,
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    const reused = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: { ...DISCLOSURE, textVersion: "2026-11" },
      key: firstKey,
    });
    expect(reused.status).toBe(409);
    expect((await problemOf(reused)).detail).toBe(IDEMPOTENCY_KEY_REUSED);
    const rows = await harness.db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, ANNA));
    expect(rows).toHaveLength(2);
  });

  it("lists her own consents and the child's she guards, oldest first, in pages", async () => {
    const all = ConsentList.parse(await (await call("GET", "/v1/me/consents", TOKENS.anna)).json());
    expect(all.nextCursor).toBeNull();
    expect(all.items.map((item) => item.id)).toEqual(
      [CHILD_CONSENT, ...record.items.map((item) => item.id)].sort(),
    );
    const child = all.items.find((item) => item.id === CHILD_CONSENT);
    expect(child).toMatchObject({
      subjectId: CHILD,
      consentingGuardianId: ANNA,
      category: "child",
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? "?limit=1" : `?limit=1&cursor=${cursor}`;
      const page = ConsentList.parse(
        await (await call("GET", `/v1/me/consents${query}`, TOKENS.anna)).json(),
      );
      expect(page.items.length).toBeLessThanOrEqual(1);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (cursor !== null) expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    } while (cursor !== null);
    expect(seen).toEqual(all.items.map((item) => item.id));
  });

  it("refuses a limit outside 1 to 200 and a cursor it did not issue", async () => {
    for (const query of ["?limit=0", "?limit=201", "?limit=many"]) {
      const response = await call("GET", `/v1/me/consents${query}`, TOKENS.anna);
      expect(response.status, query).toBe(422);
      expect((await problemOf(response)).errors?.[0]?.path).toBe("limit");
    }
    const forged = await call("GET", "/v1/me/consents?cursor=bm90LWFuLWlk", TOKENS.anna);
    expect(forged.status).toBe(422);
    expect((await problemOf(forged)).detail).toBe(CURSOR_INVALID);
  });

  it("shows a co-guardian the child's consent and never the other guardian's own", async () => {
    const list = ConsentList.parse(await (await call("GET", "/v1/me/consents", TOKENS.ben)).json());
    expect(list.items.map((item) => item.id)).toEqual([CHILD_CONSENT]);
  });

  it("shows a summary grantee, a read grantee and a foreign actor nothing of Anna's", async () => {
    for (const token of [TOKENS.ben, TOKENS.cara, TOKEN.dan]) {
      const response = await call("GET", "/v1/me/consents", token);
      expect(response.status).toBe(200);
      const list = ConsentList.parse(await response.json());
      expect(list.items.filter((item) => item.subjectId === ANNA)).toEqual([]);
    }
  });
});

describe("POST /v1/me/consents/{id}/withdraw", () => {
  let consentIds: string[];

  beforeAll(async () => {
    const rows = await harness.db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, ANNA))
      .orderBy(schema.consents.id);
    consentIds = rows.map((row) => row.id);
  });

  it("answers 404 to a read grantee, a summary grantee with a revoked grant, a stranger and a missing id", async () => {
    const target = consentIds[0] ?? MISSING;
    for (const token of [TOKENS.ben, TOKENS.cara, TOKEN.dan]) {
      const response = await call("POST", `/v1/me/consents/${target}/withdraw`, token);
      expect(response.status).toBe(404);
      expect((await problemOf(response)).code).toBe("not_found");
    }
    const missing = await call("POST", `/v1/me/consents/${MISSING}/withdraw`, TOKENS.anna);
    expect(missing.status).toBe(404);
    // Nothing was withdrawn and no closure started for anyone.
    const open = await harness.db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(isNull(schema.consents.withdrawnAt));
    expect(open).toHaveLength(3);
    expect(await harness.db.select().from(schema.dataRequests)).toEqual([]);
  });

  it("refuses a path id that is not a UUID with 422", async () => {
    const response = await call("POST", "/v1/me/consents/latest/withdraw", TOKENS.anna);
    expect(response.status).toBe(422);
    expect((await problemOf(response)).errors?.[0]?.path).toBe("id");
  });

  it("needs a fresh authentication", async () => {
    const response = await call(
      "POST",
      `/v1/me/consents/${consentIds[0] ?? MISSING}/withdraw`,
      TOKEN.annaStale,
    );
    expect(response.status).toBe(401);
    expect((await problemOf(response)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
  });

  it("sends a child's consent to the child's closure path", async () => {
    const response = await call("POST", `/v1/me/consents/${CHILD_CONSENT}/withdraw`, TOKENS.ben);
    expect(response.status).toBe(422);
    expect((await problemOf(response)).detail).toBe(CHILD_CONSENT_NOT_WITHDRAWN_HERE);
  });

  let withdrawal: ConsentWithdrawal;
  const withdrawKey = newKey();

  it("withdraws every consent of hers at once, opens the closure and queues the job for the window's end", async () => {
    const before = Date.now();
    const response = await call(
      "POST",
      `/v1/me/consents/${consentIds[0] ?? MISSING}/withdraw`,
      TOKENS.anna,
      {
        key: withdrawKey,
      },
    );
    expect(response.status).toBe(200);
    withdrawal = ConsentWithdrawal.parse(await response.json());
    expect(withdrawal.id).toBe(consentIds[0]);
    expect(withdrawal.closure.state).toBe("requested");
    const undoUntil = Date.parse(withdrawal.closure.undoUntil);
    const withdrawnAt = Date.parse(withdrawal.withdrawnAt);
    expect(withdrawnAt).toBeGreaterThanOrEqual(before - 1000);
    expect(undoUntil - withdrawnAt).toBe(CLOSURE_UNDO_WINDOW_MS);

    const rows = await harness.db
      .select({ id: schema.consents.id, withdrawnAt: schema.consents.withdrawnAt })
      .from(schema.consents)
      .orderBy(schema.consents.id);
    for (const row of rows) {
      if (row.id === CHILD_CONSENT) expect(row.withdrawnAt).toBeNull();
      else expect(row.withdrawnAt?.toISOString()).toBe(withdrawal.withdrawnAt);
    }

    const requests = await harness.db.select().from(schema.dataRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: withdrawal.closure.requestId,
      userId: ANNA,
      kind: "closure",
      state: "requested",
    });
    expect(requests[0]?.undoUntil?.toISOString()).toBe(withdrawal.closure.undoUntil);

    const jobs = await harness.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.type, CLOSURE_JOB_TYPE));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("queued");
    expect(jobs[0]?.runAfter.toISOString()).toBe(withdrawal.closure.undoUntil);
    // Ids only in the payload; the job type is neutral.
    expect(jobs[0]?.payloadJson).toEqual({ userId: ANNA, requestId: withdrawal.closure.requestId });
  });

  it("replays the withdrawal for the same key and answers 409 for another attempt", async () => {
    const replay = await call(
      "POST",
      `/v1/me/consents/${consentIds[0] ?? MISSING}/withdraw`,
      TOKENS.anna,
      {
        key: withdrawKey,
      },
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await replay.json()).toEqual({ id: consentIds[0] });

    for (const id of consentIds) {
      const again = await call("POST", `/v1/me/consents/${id}/withdraw`, TOKENS.anna);
      expect(again.status).toBe(409);
      expect((await problemOf(again)).detail).toBe(CONSENT_ALREADY_WITHDRAWN);
    }
  });

  it("reuses the open closure when a newer consent is withdrawn inside the window", async () => {
    const created = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: { ...DISCLOSURE, textVersion: "2026-11" },
    });
    expect(created.status).toBe(201);
    const fresh = ConsentRecord.parse(await created.json());
    const response = await call(
      "POST",
      `/v1/me/consents/${fresh.items[0]?.id ?? MISSING}/withdraw`,
      TOKENS.anna,
    );
    expect(response.status).toBe(200);
    const second = ConsentWithdrawal.parse(await response.json());
    expect(second.closure.requestId).toBe(withdrawal.closure.requestId);
    expect(second.closure.undoUntil).toBe(withdrawal.closure.undoUntil);
    expect(await harness.db.select().from(schema.dataRequests)).toHaveLength(1);
    expect(
      await harness.db.select().from(schema.jobs).where(eq(schema.jobs.type, CLOSURE_JOB_TYPE)),
    ).toHaveLength(1);
  });
});

describe("GET /v1/me/data-summary", () => {
  function countsOf(summary: DataSummary): Record<string, number> {
    return Object.fromEntries(summary.categories.map((entry) => [entry.category, entry.count]));
  }

  it("lists her categories with counts, every processor with a contact and the people holding active grants", async () => {
    const response = await call("GET", "/v1/me/data-summary", TOKENS.anna);
    expect(response.status).toBe(200);
    const summary = DataSummary.parse(await response.json());
    expect(countsOf(summary)).toEqual({
      "cycle.status": 0,
      "cycle.history": 2,
      "cycle.symptoms": 0,
      "journal.private": 1,
      "pregnancy.overview": 0,
      "pregnancy.photos": 0,
      child: 1,
    });
    expect(summary.processors.map((processor) => processor.name)).toEqual(
      PROCESSORS.map((processor) => processor.name),
    );
    for (const processor of summary.processors) expect(processor.contact).toMatch(/^https:\/\//);

    const people = summary.people.map((person) => ({
      personId: person.personId,
      displayName: person.displayName,
      grants: person.grants.map((grant) => `${grant.category}:${grant.level}`),
    }));
    // The revoked pregnancy grant to Cara is not listed.
    expect(people).toEqual([
      { personId: BEN, displayName: "Ben", grants: ["cycle.history:read"] },
      { personId: CARA, displayName: "Cara", grants: ["cycle.status:summary"] },
    ]);
  });

  it("gives a read grantee, a summary grantee and a stranger their own summary and none of Anna's rows or grants", async () => {
    for (const [token, child] of [
      [TOKENS.ben, 1],
      [TOKENS.cara, 0],
      [TOKEN.dan, 0],
    ] as const) {
      const response = await call("GET", "/v1/me/data-summary", token);
      expect(response.status).toBe(200);
      const text = await response.text();
      const summary = DataSummary.parse(JSON.parse(text));
      const counts = countsOf(summary);
      expect(counts["cycle.history"]).toBe(0);
      expect(counts["journal.private"]).toBe(0);
      // Ben co-guards the child; that is his data too.
      expect(counts.child).toBe(child);
      expect(summary.people).toEqual([]);
      expect(text).not.toContain(ANNA);
      expect(text).not.toContain(ANNA_NAME);
    }
  });
});

describe("audit events", () => {
  it("writes none: every route here is the person acting on her own records", async () => {
    // Architecture 8.3 audits partner reads, partner writes and grant
    // changes; nothing in this module is any of the three.
    expect(await harness.db.select().from(schema.auditEvents)).toEqual([]);
  });
});
