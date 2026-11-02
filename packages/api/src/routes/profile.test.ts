import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, or } from "drizzle-orm";
import { schema } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";
import {
  CONSENT_DISCLOSURES,
  Consent,
  ConsentList,
  ConsentRecord,
  ConsentWithdrawal,
  DataSummary,
  DataSummaryDisclosure,
  DataSummaryGrant,
  IdempotentReplay,
  Problem,
  Processor,
  Profile,
} from "@tidefern/schemas";
import type { ConsentInput } from "@tidefern/schemas";

import { createApp } from "../app";
import { ACCOUNT_CLOSING, FRESH_AUTHENTICATION_REQUIRED } from "../auth";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_REPLAYED_HEADER,
} from "../middleware/idempotency";
import { asAppRole } from "../test/account";
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
  disclosureFor,
  disclosureHash,
  parseIfMatch,
} from "./profile";

// Synthetic people and records only. Dan has no relationship with anyone.
const DAN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
// Eve onboards in her own test only, the here-for-someone-else way.
const EVE = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f41";
const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const CHILD_CONSENT = "018f5e7a-5000-7000-8000-000000000001";
const PREGNANCY = "018f5e7a-5000-7000-8000-000000000002";
const MISSING = "018f5e7a-5000-7000-8000-0000000000ff";
// Anna's session for this request, and another device of hers.
const ANNA_SESSION = "018f5e7a-7000-7000-8000-000000000001";
const ANNA_PHONE_SESSION = "018f5e7a-7000-7000-8000-000000000002";
const BEN_SESSION = "018f5e7a-7000-7000-8000-000000000003";
// A grant Anna holds: Ben shares his status with her.
const HELD_GRANT = "018f5e7a-5000-7000-8000-00000000b004";

const TOKEN = { ...TOKENS, dan: "dan", eve: "eve", annaStale: "anna-stale" } as const;

// Distinct values so a leak of Anna's profile into another response is visible as text.
const ANNA_NAME = "Annabel Quill";
const ANNA_ZONE = "Asia/Kolkata";

const DISCLOSURE: ConsentInput = {
  categories: ["journal.private", "cycle.history"],
  textVersion: "2026-10",
  termsVersion: "2026-10",
};
const CATALOG = CONSENT_DISCLOSURES["2026-10"];

/**
 * The keys of the JSON object as sent, before any schema parse could strip
 * an extra one, against the keys the contract declares.
 */
function expectExactKeys(value: unknown, shape: Record<string, unknown>, label: string): void {
  expect(typeof value === "object" && value !== null && !Array.isArray(value), label).toBe(true);
  expect(Object.keys(value as object).sort(), label).toEqual(Object.keys(shape).sort());
}

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
  /** Another app and database than the file's own: the app role block's. */
  target?: { app: ReturnType<typeof createApp>; db: ActorDatabase };
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
  const target = options.target ?? { app, db: harness.db };
  return target.app.request(
    `/api${path}`,
    {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    { db: target.db },
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
  await db
    .insert(schema.user)
    .values({ id: EVE, name: "Eve", email: "eve@example.com", emailVerified: true });
  fixture.auth.signIn(TOKEN.eve, EVE, "eve@example.com", 60);
  // Signed in an hour ago: a session, but not a fresh authentication.
  fixture.auth.signIn(TOKEN.annaStale, ANNA, "anna@example.com", 3600);
  // Anna's request session gets a UUID id like a Better Auth row, so the
  // withdrawal can keep it while it ends her other sessions.
  const annaLookup = fixture.auth.sessions.get(TOKENS.anna);
  if (annaLookup === undefined) throw new Error("the actor fixture signs Anna in");
  fixture.auth.sessions.set(TOKENS.anna, {
    ...annaLookup,
    session: { ...annaLookup.session, id: ANNA_SESSION },
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await db.insert(schema.session).values([
    { id: ANNA_SESSION, token: "db-anna", userId: ANNA, expiresAt, updatedAt: new Date() },
    {
      id: ANNA_PHONE_SESSION,
      token: "db-anna-phone",
      userId: ANNA,
      expiresAt,
      updatedAt: new Date(),
    },
    { id: BEN_SESSION, token: "db-ben", userId: BEN, expiresAt, updatedAt: new Date() },
  ]);

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

describe("parseIfMatch, disclosureFor and disclosureHash", () => {
  it("reads a bare, quoted or weak version and refuses anything else", () => {
    expect(parseIfMatch("3")).toBe(3);
    expect(parseIfMatch('"3"')).toBe(3);
    expect(parseIfMatch('W/"12"')).toBe(12);
    expect(parseIfMatch("0")).toBeNull();
    expect(parseIfMatch("abc")).toBeNull();
    expect(parseIfMatch("*")).toBeNull();
  });

  it("expands the categories into the catalog's sentences and processors for the version", () => {
    const disclosure = disclosureFor(DISCLOSURE);
    expect(disclosure.categories).toEqual([
      { category: "cycle.history", ...CATALOG.categories["cycle.history"] },
      { category: "journal.private", ...CATALOG.categories["journal.private"] },
    ]);
    expect(disclosure.processors).toEqual(CATALOG.processors);
    expect(disclosure.textVersion).toBe("2026-10");
    expect(disclosure.termsVersion).toBe("2026-10");
  });

  it("hashes the same agreement the same in any order and a changed version differently", () => {
    const reordered: ConsentInput = {
      ...DISCLOSURE,
      categories: [...DISCLOSURE.categories].reverse(),
    };
    const hash = disclosureHash(disclosureFor(DISCLOSURE));
    expect(disclosureHash(disclosureFor(reordered))).toBe(hash);
    expect(disclosureHash(disclosureFor({ ...DISCLOSURE, termsVersion: "2026-11" }))).not.toBe(
      hash,
    );
    const words = disclosureFor(DISCLOSURE);
    const first = words.categories[0];
    if (first === undefined) throw new Error("the disclosure has a category");
    expect(
      disclosureHash({ ...words, categories: [{ ...first, purpose: `${first.purpose} ` }] }),
    ).not.toBe(disclosureHash({ ...words, categories: [first] }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
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
      const raw: unknown = JSON.parse(text);
      // The raw keys, before Profile.parse could strip an extra one.
      expectExactKeys(raw, Profile.shape, token);
      Profile.parse(raw);
      expect(text).not.toContain(ANNA);
      expect(text).not.toContain(ANNA_NAME);
      expect(text).not.toContain(ANNA_ZONE);
    }
    // Dan, a foreign actor, has no profile and sees no one else's.
    expect((await call("GET", "/v1/me/profile", TOKEN.dan)).status).toBe(404);
  });

  it("records the terms version accepted at creation, with no consent row, as onboarding sends it", async () => {
    const before = Date.now();
    const created = await call("PUT", "/v1/me/profile", TOKEN.eve, {
      body: profileInput({
        displayName: "Eve",
        timeZone: "UTC",
        stage: "none",
        ageAttested: true,
        termsVersion: "2026-10",
      }),
    });
    expect(created.status).toBe(201);
    const body = Profile.parse(await created.json());
    expect(body.termsVersion).toBe("2026-10");
    expect(Date.parse(body.termsAcceptedAt ?? "")).toBeGreaterThanOrEqual(before - 1000);
    // Accepting the terms is never consent (architecture 7.4): no consent row is written.
    const consents = await harness.db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, EVE));
    expect(consents).toEqual([]);
    const read = Profile.parse(await (await call("GET", "/v1/me/profile", TOKEN.eve)).json());
    expect(read).toEqual(body);
  });

  it("keeps a profile made without the terms version at null until a write names one", async () => {
    const plain = Profile.parse(await (await call("GET", "/v1/me/profile", TOKENS.ben)).json());
    expect(plain.termsVersion).toBeNull();
    expect(plain.termsAcceptedAt).toBeNull();

    const accepted = await call("PUT", "/v1/me/profile", TOKENS.ben, {
      body: profileInput({ displayName: "Ben", timeZone: "UTC", termsVersion: "2026-10" }),
      headers: { "if-match": String(plain.version) },
    });
    expect(accepted.status).toBe(200);
    const first = Profile.parse(await accepted.json());
    expect(first.termsVersion).toBe("2026-10");
    expect(first.termsAcceptedAt).not.toBeNull();

    // The same version again, or none, leaves the acceptance as it was.
    for (const extra of [{ termsVersion: "2026-10" }, {}]) {
      const current = Profile.parse(await (await call("GET", "/v1/me/profile", TOKENS.ben)).json());
      const again = await call("PUT", "/v1/me/profile", TOKENS.ben, {
        body: profileInput({ displayName: "Ben", timeZone: "UTC", ...extra }),
        headers: { "if-match": String(current.version) },
      });
      expect(again.status).toBe(200);
      const body = Profile.parse(await again.json());
      expect(body.termsVersion).toBe("2026-10");
      expect(body.termsAcceptedAt).toBe(first.termsAcceptedAt);
    }

    // A label that is not a version is refused on the field, as on the consent.
    const current = Profile.parse(await (await call("GET", "/v1/me/profile", TOKENS.ben)).json());
    const refused = await call("PUT", "/v1/me/profile", TOKENS.ben, {
      body: profileInput({ displayName: "Ben", timeZone: "UTC", termsVersion: "I had a loss" }),
      headers: { "if-match": String(current.version) },
    });
    expect(refused.status).toBe(422);
    expect((await problemOf(refused)).errors?.map((error) => error.path)).toContain("termsVersion");
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

  it("refuses free text, an unknown version and a malformed category list with 422 and writes nothing", async () => {
    const bodies = [
      // The old shape: a sentence from the client. The server writes the catalog's words only.
      {
        ...DISCLOSURE,
        categories: [
          { category: "cycle.history", basis: "consent", purpose: "I had a loss in May" },
        ],
      },
      { ...DISCLOSURE, categories: ["cycle.history", "cycle.history"] },
      { ...DISCLOSURE, categories: [] },
      { ...DISCLOSURE, categories: ["fertility"] },
      { ...DISCLOSURE, textVersion: "2026-11" },
      { ...DISCLOSURE, termsVersion: "I had a loss in May" },
    ];
    for (const body of bodies) {
      const response = await call("POST", "/v1/me/consents", TOKENS.anna, { body });
      expect(response.status, JSON.stringify(body)).toBe(422);
      const problem = await problemOf(response);
      expect(problem.code).toBe("validation_failed");
      expect(problem.errors?.length).toBeGreaterThan(0);
    }
    const rows = await harness.db
      .select({ id: schema.consents.id })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, ANNA));
    expect(rows).toEqual([]);
  });

  it("records one row per category bound to the disclosure hash, the subject being the actor", async () => {
    const response = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: DISCLOSURE,
      key: firstKey,
    });
    expect(response.status).toBe(201);
    const raw: unknown = await response.json();
    expectExactKeys(raw, ConsentRecord.shape, "record");
    record = ConsentRecord.parse(raw);
    expect(record.textHash).toBe(disclosureHash(disclosureFor(DISCLOSURE)));
    expect(record.processors).toEqual(CATALOG.processors);
    expect(record.termsVersion).toBe("2026-10");
    expect(record.id).toBe(record.items[0]?.id);
    expect(record.items.map((item) => item.category).sort()).toEqual([
      "cycle.history",
      "journal.private",
    ]);
    for (const item of record.items) {
      expect(item).toMatchObject({
        subjectId: ANNA,
        consentingGuardianId: null,
        basis: CATALOG.categories[item.category].basis,
        purpose: CATALOG.categories[item.category].purpose,
        textVersion: "2026-10",
        textHash: record.textHash,
        withdrawnAt: null,
      });
    }
    // The plaintext purpose column holds the catalog's sentence and nothing else.
    const rows = await harness.db
      .select({ category: schema.consents.category, purpose: schema.consents.purpose })
      .from(schema.consents)
      .where(eq(schema.consents.subjectId, ANNA));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.purpose).toBe(CATALOG.categories[row.category].purpose);
    }
  });

  it("replays the create for the same key and body without writing again", async () => {
    const replay = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: DISCLOSURE,
      key: firstKey,
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    // The replay shape the 201 response declares beside ConsentRecord.
    expect(IdempotentReplay.parse(await replay.json())).toEqual({ id: record.id });
    const reused = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: { ...DISCLOSURE, categories: ["cycle.history"] },
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
    const raw = (await (await call("GET", "/v1/me/consents", TOKENS.anna)).json()) as {
      items: unknown[];
    };
    expectExactKeys(raw, ConsentList.shape, "list");
    for (const item of raw.items) expectExactKeys(item, Consent.shape, "consent");
    const all = ConsentList.parse(raw);
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
      const text = await response.text();
      const raw = JSON.parse(text) as { items: unknown[] };
      expectExactKeys(raw, ConsentList.shape, token);
      for (const item of raw.items) expectExactKeys(item, Consent.shape, token);
      const list = ConsentList.parse(raw);
      expect(list.items.filter((item) => item.subjectId === ANNA)).toEqual([]);
      // Ben co-guards the child, whose consent names Anna as the guardian who gave it.
      if (token !== TOKENS.ben) expect(text).not.toContain(ANNA);
    }
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
    // The processors the summary lists are the ones the consent text names.
    expect(PROCESSORS.map((processor) => processor.name)).toEqual(CATALOG.processors);
    expect(summary.disclosures).toEqual([]);

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
      const raw = JSON.parse(text) as {
        categories: unknown[];
        processors: unknown[];
        people: unknown[];
        disclosures: unknown[];
      };
      // The raw keys at every level, before DataSummary.parse could strip an extra one.
      expectExactKeys(raw, DataSummary.shape, token);
      for (const entry of raw.categories) {
        expectExactKeys(entry, DataSummary.shape.categories.element.shape, token);
      }
      for (const entry of raw.processors) expectExactKeys(entry, Processor.shape, token);
      const summary = DataSummary.parse(raw);
      const counts = countsOf(summary);
      expect(counts["cycle.history"]).toBe(0);
      expect(counts["journal.private"]).toBe(0);
      // Ben co-guards the child; that is his data too.
      expect(counts.child).toBe(child);
      expect(summary.people).toEqual([]);
      expect(summary.disclosures).toEqual([]);
      expect(text).not.toContain(ANNA);
      expect(text).not.toContain(ANNA_NAME);
    }
  });

  it("returns her disclosure ledger with every entry's contact, and nobody else's", async () => {
    const entry = {
      id: "018f5e7a-5000-7000-8000-00000000d001",
      userId: ANNA,
      recipient: "Example Lab",
      contact: "privacy@example.com",
      purpose: "Synthetic ledger entry for the test",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
    };
    await harness.db.insert(schema.disclosures).values(entry);
    try {
      const raw = (await (await call("GET", "/v1/me/data-summary", TOKENS.anna)).json()) as {
        people: unknown[];
        disclosures: unknown[];
      };
      for (const item of raw.disclosures) {
        expectExactKeys(item, DataSummaryDisclosure.shape, "disclosure");
      }
      for (const person of raw.people as { grants: unknown[] }[]) {
        for (const grant of person.grants) {
          // childId is optional and absent for a grant that is not a child grant.
          expectExactKeys(grant, DataSummaryGrant.omit({ childId: true }).shape, "grant");
        }
      }
      expect(DataSummary.parse(raw).disclosures).toEqual([
        {
          id: entry.id,
          recipient: entry.recipient,
          contact: entry.contact,
          purpose: entry.purpose,
          createdAt: "2026-09-03T00:00:00.000Z",
        },
      ]);
      for (const token of [TOKENS.ben, TOKENS.cara, TOKEN.dan]) {
        const other = DataSummary.parse(
          await (await call("GET", "/v1/me/data-summary", token)).json(),
        );
        expect(other.disclosures).toEqual([]);
      }
    } finally {
      await harness.db.delete(schema.disclosures).where(eq(schema.disclosures.id, entry.id));
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
    // Anna also holds a grant: Ben shares his status with her.
    await harness.db.insert(schema.grants).values({
      id: HELD_GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.status",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    // Her second consent has moved on to a later version than the first.
    await harness.db
      .update(schema.consents)
      .set({ version: 5 })
      .where(eq(schema.consents.id, consentIds[1] ?? MISSING));
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
    const revoked = await harness.db
      .select({ id: schema.grants.id })
      .from(schema.grants)
      .where(isNull(schema.grants.revokedAt));
    expect(revoked).toHaveLength(3);
    expect(await harness.db.select().from(schema.session)).toHaveLength(3);
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
      .select({
        id: schema.consents.id,
        withdrawnAt: schema.consents.withdrawnAt,
        version: schema.consents.version,
      })
      .from(schema.consents)
      .orderBy(schema.consents.id);
    for (const row of rows) {
      if (row.id === CHILD_CONSENT) expect(row.withdrawnAt).toBeNull();
      else expect(row.withdrawnAt?.toISOString()).toBe(withdrawal.withdrawnAt);
    }
    // Each row's own version moves on by one, whatever the clicked row's was.
    expect(
      Object.fromEntries(
        rows.filter((row) => row.id !== CHILD_CONSENT).map((row) => [row.id, row.version]),
      ),
    ).toEqual({ [consentIds[0] ?? MISSING]: 2, [consentIds[1] ?? MISSING]: 6 });

    // Closure revokes every grant she gave or holds at once; the one revoked
    // before keeps its own instant, and Ben's grant to nobody else is untouched.
    const grants = await harness.db
      .select({ id: schema.grants.id, revokedAt: schema.grants.revokedAt })
      .from(schema.grants)
      .where(or(eq(schema.grants.ownerId, ANNA), eq(schema.grants.granteeId, ANNA)))
      .orderBy(schema.grants.id);
    expect(
      Object.fromEntries(grants.map((grant) => [grant.id, grant.revokedAt?.toISOString()])),
    ).toEqual({
      "018f5e7a-5000-7000-8000-00000000b001": withdrawal.withdrawnAt,
      "018f5e7a-5000-7000-8000-00000000b002": withdrawal.withdrawnAt,
      "018f5e7a-5000-7000-8000-00000000b003": "2026-09-01T00:00:00.000Z",
      [HELD_GRANT]: withdrawal.withdrawnAt,
    });
    // Ben no longer reads her history, at once rather than after the window.
    const afterClosure = await call("GET", "/v1/me/data-summary", TOKENS.anna);
    expect(DataSummary.parse(await afterClosure.json()).people).toEqual([]);

    // Each revocation is audited as a grant change, with the owner as subject.
    // Ids minted in one millisecond do not sort in insert order, so the rows
    // are compared as a set.
    const audits = await harness.db
      .select({
        actorId: schema.auditEvents.actorId,
        action: schema.auditEvents.action,
        subjectId: schema.auditEvents.subjectId,
        category: schema.auditEvents.category,
      })
      .from(schema.auditEvents);
    const bySubjectAndCategory = (
      a: { subjectId: string; category: string | null },
      b: { subjectId: string; category: string | null },
    ): number =>
      `${a.subjectId}/${a.category ?? ""}`.localeCompare(`${b.subjectId}/${b.category ?? ""}`);
    expect(audits.sort(bySubjectAndCategory)).toEqual(
      [
        { actorId: ANNA, action: "grant.revoke", subjectId: ANNA, category: "cycle.history" },
        { actorId: ANNA, action: "grant.revoke", subjectId: ANNA, category: "cycle.status" },
        { actorId: ANNA, action: "grant.revoke", subjectId: BEN, category: "cycle.status" },
      ].sort(bySubjectAndCategory),
    );

    // Her other sessions end; the one that asked stays to cancel from, and Ben's is untouched.
    const sessions = await harness.db
      .select({ id: schema.session.id })
      .from(schema.session)
      .orderBy(schema.session.id);
    expect(sessions.map((session) => session.id)).toEqual([ANNA_SESSION, BEN_SESSION]);

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
    // The replay shape the 200 response declares beside ConsentWithdrawal.
    expect(IdempotentReplay.parse(await replay.json())).toEqual({ id: consentIds[0] });

    for (const id of consentIds) {
      const again = await call("POST", `/v1/me/consents/${id}/withdraw`, TOKENS.anna);
      expect(again.status).toBe(409);
      expect((await problemOf(again)).detail).toBe(CONSENT_ALREADY_WITHDRAWN);
    }
  });

  it("reuses the open closure when a newer consent is withdrawn inside the window", async () => {
    const created = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: { ...DISCLOSURE, categories: ["cycle.symptoms"] },
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

describe("audit events", () => {
  it("holds only the grant revocations the withdrawal wrote", async () => {
    // Architecture 8.3 audits partner reads, partner writes and grant
    // changes. The profile, the consents and the summary are the person
    // acting on her own records; only closure changes grants.
    const rows = await harness.db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents);
    expect(rows.map((row) => row.action)).toEqual(["grant.revoke", "grant.revoke", "grant.revoke"]);
  });
});

/**
 * Task E10: `DATABASE_URL` names `tidefern_app` on CI and in production
 * (architecture 7.2), and `is_system()` is false for that role by design.
 * Before E10 the withdrawal ran `withSystem()` on that pool, so its consent
 * update matched no row and the route answered 409
 * `consent_already_withdrawn` for a consent nobody had withdrawn. This
 * block has its own database, so the file's audit count above is unchanged.
 */
describe("POST /v1/me/consents/{id}/withdraw on the app role connection", () => {
  const REQUEST_SESSION = "018f5e7a-7000-7000-8000-0000000000e1";
  const PHONE_SESSION = "018f5e7a-7000-7000-8000-0000000000e2";
  const BEN_ROW_SESSION = "018f5e7a-7000-7000-8000-0000000000e3";
  const FIRST_CONSENT = "018f5e7a-5000-7000-8000-0000000000e1";
  const SECOND_CONSENT = "018f5e7a-5000-7000-8000-0000000000e2";
  // Anna shares her history with Ben; Ben shares his status with her.
  const GIVEN = "018f5e7a-5000-7000-8000-0000000000e3";
  const HELD = "018f5e7a-5000-7000-8000-0000000000e4";

  let local: ApiTestDatabase;
  let target: { app: ReturnType<typeof createApp>; db: ActorDatabase };
  let withdrawal: ConsentWithdrawal;

  beforeAll(async () => {
    const fixture = await createActorFixture();
    local = fixture.harness;
    const { db } = local;
    const annaLookup = fixture.auth.sessions.get(TOKENS.anna);
    if (annaLookup === undefined) throw new Error("the actor fixture signs Anna in");
    fixture.auth.sessions.set(TOKENS.anna, {
      ...annaLookup,
      session: { ...annaLookup.session, id: REQUEST_SESSION },
    });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    await db.insert(schema.session).values([
      { id: REQUEST_SESSION, token: "e10-anna", userId: ANNA, expiresAt, updatedAt: new Date() },
      { id: PHONE_SESSION, token: "e10-phone", userId: ANNA, expiresAt, updatedAt: new Date() },
      { id: BEN_ROW_SESSION, token: "e10-ben", userId: BEN, expiresAt, updatedAt: new Date() },
    ]);
    const consent = (id: string, category: "cycle.history" | "journal.private") => ({
      id,
      subjectId: ANNA,
      category,
      basis: "necessary" as const,
      purpose: "Keep what she logs.",
      policyVersion: "2026-10",
      textHash: "0".repeat(64),
    });
    await db
      .insert(schema.consents)
      .values([
        consent(FIRST_CONSENT, "cycle.history"),
        consent(SECOND_CONSENT, "journal.private"),
      ]);
    const versions = { policyVersion: "2026-10", descriptionVersion: "2026-10" };
    await db.insert(schema.grants).values([
      {
        id: GIVEN,
        ownerId: ANNA,
        granteeId: BEN,
        category: "cycle.history",
        level: "read",
        ...versions,
      },
      {
        id: HELD,
        ownerId: BEN,
        granteeId: ANNA,
        category: "cycle.status",
        level: "summary",
        ...versions,
      },
    ]);
    const appRole = asAppRole(db);
    target = {
      app: createApp({ auth: fixture.auth, db: appRole, log: { sink: () => undefined } }),
      db: appRole,
    };
  });
  afterAll(async () => {
    await local.close();
  });

  it("withdraws, revokes every grant in both directions, the one she holds too, and opens the closure", async () => {
    const response = await call("POST", `/v1/me/consents/${FIRST_CONSENT}/withdraw`, TOKENS.anna, {
      target,
    });
    expect(response.status).toBe(200);
    withdrawal = ConsentWithdrawal.parse(await response.json());
    expect(withdrawal).toMatchObject({ id: FIRST_CONSENT, closure: { state: "requested" } });
    const withdrawnAt = withdrawal.withdrawnAt;
    expect(Date.parse(withdrawal.closure.undoUntil) - Date.parse(withdrawnAt)).toBe(
      CLOSURE_UNDO_WINDOW_MS,
    );

    const consents = await local.db
      .select({ id: schema.consents.id, withdrawnAt: schema.consents.withdrawnAt })
      .from(schema.consents)
      .orderBy(schema.consents.id);
    expect(consents.map((row) => [row.id, row.withdrawnAt?.toISOString()])).toEqual([
      [FIRST_CONSENT, withdrawnAt],
      [SECOND_CONSENT, withdrawnAt],
    ]);

    const grants = await local.db
      .select({
        id: schema.grants.id,
        revokedAt: schema.grants.revokedAt,
        version: schema.grants.version,
      })
      .from(schema.grants)
      .orderBy(schema.grants.id);
    expect(
      grants.map((grant) => [grant.id, grant.revokedAt?.toISOString(), grant.version]),
    ).toEqual([
      [GIVEN, withdrawnAt, 2],
      [HELD, withdrawnAt, 2],
    ]);

    const audits = await local.db
      .select({
        actorId: schema.auditEvents.actorId,
        action: schema.auditEvents.action,
        subjectId: schema.auditEvents.subjectId,
        category: schema.auditEvents.category,
        occurredAt: schema.auditEvents.occurredAt,
      })
      .from(schema.auditEvents);
    expect(
      audits
        .map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }))
        .sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
    ).toEqual(
      [
        {
          actorId: ANNA,
          action: "grant.revoke",
          subjectId: ANNA,
          category: "cycle.history",
          occurredAt: withdrawnAt,
        },
        {
          actorId: ANNA,
          action: "grant.revoke",
          subjectId: BEN,
          category: "cycle.status",
          occurredAt: withdrawnAt,
        },
      ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
    );

    const sessions = await local.db
      .select({ id: schema.session.id })
      .from(schema.session)
      .orderBy(schema.session.id);
    expect(sessions.map((session) => session.id)).toEqual([REQUEST_SESSION, BEN_ROW_SESSION]);

    const requests = await local.db.select().from(schema.dataRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: withdrawal.closure.requestId,
      userId: ANNA,
      kind: "closure",
      state: "requested",
    });
    const jobs = await local.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.type, CLOSURE_JOB_TYPE));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.runAfter.toISOString()).toBe(withdrawal.closure.undoUntil);
    expect(jobs[0]?.payloadJson).toEqual({ userId: ANNA, requestId: withdrawal.closure.requestId });
  });

  it("locks the account: GET /v1/me answers 401 account_closing, her consents still answer", async () => {
    const me = await call("GET", "/v1/me", TOKENS.anna, { target });
    expect(me.status).toBe(401);
    expect((await problemOf(me)).detail).toBe(ACCOUNT_CLOSING);
    const consents = await call("GET", "/v1/me/consents", TOKENS.anna, { target });
    expect(consents.status).toBe(200);
  });

  it("reuses the open closure for a newer consent and revokes nothing twice", async () => {
    const created = await call("POST", "/v1/me/consents", TOKENS.anna, {
      body: { ...DISCLOSURE, categories: ["cycle.symptoms"] },
      target,
    });
    expect(created.status).toBe(201);
    const fresh = ConsentRecord.parse(await created.json());
    const response = await call(
      "POST",
      `/v1/me/consents/${fresh.items[0]?.id ?? MISSING}/withdraw`,
      TOKENS.anna,
      { target },
    );
    expect(response.status).toBe(200);
    const second = ConsentWithdrawal.parse(await response.json());
    expect(second.closure.requestId).toBe(withdrawal.closure.requestId);
    expect(second.closure.undoUntil).toBe(withdrawal.closure.undoUntil);
    expect(await local.db.select().from(schema.dataRequests)).toHaveLength(1);
    expect(
      await local.db.select().from(schema.jobs).where(eq(schema.jobs.type, CLOSURE_JOB_TYPE)),
    ).toHaveLength(1);
    const revocations = await local.db
      .select({ id: schema.auditEvents.id })
      .from(schema.auditEvents)
      .where(
        and(eq(schema.auditEvents.actorId, ANNA), eq(schema.auditEvents.action, "grant.revoke")),
      );
    expect(revocations).toHaveLength(2);
  });
});
