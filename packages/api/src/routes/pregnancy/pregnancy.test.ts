import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { addDays, todayIn } from "@tidefern/core";
import { EnvKeyProvider, provisionSubjectKey } from "@tidefern/crypto";
import { schema } from "@tidefern/db";
import { Pregnancy, PregnancyEvent, PregnancyView, Problem } from "@tidefern/schemas";

import { createApp } from "../../app";
import { FRESH_AUTHENTICATION_REQUIRED } from "../../auth";
import { realCalendarClock } from "../../clock";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  RATE_LIMIT_KEY_PREFIX,
} from "../../middleware/index";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "../../test/actors";
import { sessionHeaders } from "../../test/auth-fake";
import type { ApiTestDatabase } from "../../test/database";
import {
  ID_IN_USE,
  PREGNANCY_ENDED,
  PREGNANCY_OPEN,
  PREGNANCY_PAUSED,
  PROFILE_REQUIRED,
  REMINDER_JOB_TYPE,
  STALE_VERSION,
} from "./index";

// The registry's EnvKeyProvider reads the KEK on first use; a throwaway key
// for this file, never the escrowed one.
process.env["TIDEFERN_KEK_V1"] = randomBytes(32).toString("base64");

const ZONE = "Europe/Berlin";
const TODAY = todayIn(ZONE);
/** Ten weeks ago, so the gestational age today is 10w0d and the due date is 30 weeks out. */
const LMP = addDays(TODAY, -70);
const DUE = addDays(LMP, 280);
const GRANT = "018f5e7a-2000-7000-8000-000000000101";
const CARA_GRANT = "018f5e7a-2000-7000-8000-000000000102";
const START_KEY = "018f5e7a-3000-7000-8000-000000000201";
const STALE = "anna-stale";
const ATTESTED_AT = new Date("2026-10-04T18:30:00Z");

let harness: ApiTestDatabase;
let app: ReturnType<typeof createApp>;
let startedAt: string;
let pregnancyId = "";
let eventId = "";
let partnerEventId = "";

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  const { db } = harness;
  await db.insert(schema.profiles).values([
    {
      userId: ANNA,
      displayName: "Anna",
      timeZone: ZONE,
      stage: "cycle",
      ageAttestedAt: ATTESTED_AT,
    },
    { userId: BEN, displayName: "Ben", timeZone: ZONE, stage: "none", ageAttestedAt: ATTESTED_AT },
  ]);
  // Ben holds a summary grant on Anna's overview; Cara holds nothing yet.
  await db.insert(schema.grants).values({
    id: GRANT,
    ownerId: ANNA,
    granteeId: BEN,
    category: "pregnancy.overview",
    level: "summary",
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
  });
  await provisionSubjectKey(db, ANNA, new EnvKeyProvider(), "user");
  fixture.auth.signIn(STALE, ANNA, "anna@example.com", 700);
  // The real calendar whatever the runner's environment says: CI exports
  // TIDEFERN_FAKE_NOW for its seeded server, and TODAY above is the real one.
  app = createApp({
    auth: fixture.auth,
    db,
    log: { sink: () => undefined },
    clock: realCalendarClock,
  });
  startedAt = new Date(Date.now() - 1_000).toISOString();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  // One file's worth of mutations stays under the window, but the counter is not what is under test.
  await harness.db
    .delete(schema.rateLimit)
    .where(sql`${schema.rateLimit.key} like ${`${RATE_LIMIT_KEY_PREFIX}%`}`);
});

type Level = (typeof schema.shareLevelValues)[number];

const headers = (token: string, extra: Record<string, string> = {}): Record<string, string> => ({
  ...(sessionHeaders(token) as Record<string, string>),
  origin: OWN_ORIGIN,
  "content-type": "application/json",
  ...extra,
});

const post = (
  path: string,
  body: unknown,
  token: string = TOKENS.anna,
  key: string = randomUUID(),
) =>
  app.request(`/api/v1${path}`, {
    method: "POST",
    headers: headers(token, { [IDEMPOTENCY_KEY_HEADER]: key }),
    body: JSON.stringify(body),
  });

const put = (path: string, body: unknown, version: number | null, token: string = TOKENS.anna) =>
  app.request(`/api/v1${path}`, {
    method: "PUT",
    headers: headers(token, version === null ? {} : { "if-match": String(version) }),
    body: JSON.stringify(body),
  });

const del = (path: string, version: number, token: string = TOKENS.anna) =>
  app.request(`/api/v1${path}`, {
    method: "DELETE",
    headers: headers(token, { "if-match": String(version) }),
  });

const get = (path: string, token: string = TOKENS.anna) =>
  app.request(`/api/v1${path}`, { headers: sessionHeaders(token) });

const setLevel = (level: Level) =>
  harness.db.update(schema.grants).set({ level }).where(eq(schema.grants.id, GRANT));

async function auditRows(action: string) {
  return harness.db
    .select({
      actorId: schema.auditEvents.actorId,
      category: schema.auditEvents.category,
      dedupeKey: schema.auditEvents.dedupeKey,
    })
    .from(schema.auditEvents)
    .where(and(eq(schema.auditEvents.subjectId, ANNA), eq(schema.auditEvents.action, action)))
    .orderBy(schema.auditEvents.id);
}

async function stageOf(userId: string) {
  const [row] = await harness.db
    .select({ stage: schema.profiles.stage })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId));
  return row?.stage;
}

async function problemOf(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  return Problem.parse(await response.json());
}

const sortedKeys = (value: object) => Object.keys(value).sort();

describe("starting a pregnancy", () => {
  const dating = { method: "lmp", lastPeriodStart: LMP };

  it("needs a profile, which holds the time zone every date is read in", async () => {
    const response = await post("/pregnancies", { dating }, TOKENS.cara);
    expect(response.status).toBe(422);
    expect((await problemOf(response)).detail).toBe(PROFILE_REQUIRED);
  });

  it("refuses an input that is not a calendar day or not a known method", async () => {
    const notADay = await post("/pregnancies", {
      dating: { method: "lmp", lastPeriodStart: "2026-02-30" },
    });
    expect(notADay.status).toBe(422);
    expect((await problemOf(notADay)).errors).toEqual([
      { path: "dating.lastPeriodStart", message: "Not a calendar day." },
    ]);
    const unknown = await post("/pregnancies", { dating: { method: "guess" } });
    expect(unknown.status).toBe(422);
    const body = await problemOf(unknown);
    expect(body.code).toBe("validation_failed");
    expect(body.errors?.[0]?.path).toMatch(/^dating/);
  });

  it("creates it with the due date from core and moves her stage to pregnancy", async () => {
    expect(await stageOf(ANNA)).toBe("cycle");
    const response = await post("/pregnancies", { dating }, TOKENS.anna, START_KEY);
    expect(response.status).toBe(201);
    const body = Pregnancy.parse(await response.json());
    pregnancyId = body.id;
    expect(response.headers.get("location")).toBe(`/api/v1/pregnancies/${pregnancyId}`);
    expect(body).toMatchObject({
      subjectId: ANNA,
      status: "active",
      dueDate: DUE,
      datingMethod: "lmp",
      endedAt: null,
      endedReason: null,
      version: 1,
      gestation: { weeks: 10, days: 0, totalDays: 70, trimester: 1, label: "10w0d" },
    });
    expect(await stageOf(ANNA)).toBe("pregnancy");
    // The Location names a readable resource, the same one E1's replay names.
    const located = await app.request(response.headers.get("location") ?? "", {
      headers: sessionHeaders(TOKENS.anna),
    });
    expect(located.status).toBe(200);
    expect(Pregnancy.parse(await located.json())).toMatchObject({ id: pregnancyId, dueDate: DUE });
  });

  it("replays the same create from the stored row without a second record", async () => {
    const response = await post("/pregnancies", { dating }, TOKENS.anna, START_KEY);
    expect(response.status).toBe(201);
    expect(response.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await response.json()).toEqual({ id: pregnancyId });
    const rows = await harness.db
      .select({ id: schema.pregnancies.id })
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.subjectId, ANNA));
    expect(rows).toHaveLength(1);
  });

  it("keeps one open pregnancy per subject", async () => {
    const response = await post("/pregnancies", { dating: { method: "manual", dueDate: DUE } });
    expect(response.status).toBe(409);
    expect((await problemOf(response)).detail).toBe(PREGNANCY_OPEN);
  });

  it("refuses a client-minted id that another subject already holds", async () => {
    const response = await post("/pregnancies", { id: pregnancyId, dating }, TOKENS.ben);
    expect(response.status).toBe(409);
    expect((await problemOf(response)).detail).toBe(ID_IN_USE);
    expect(await stageOf(BEN)).toBe("none");
  });
});

describe("the current pregnancy", () => {
  const OWNER_KEYS = [
    "createdAt",
    "datingMethod",
    "dueDate",
    "endedAt",
    "endedReason",
    "gestation",
    "id",
    "startedAt",
    "status",
    "subjectId",
    "updatedAt",
    "version",
  ];
  const OVERVIEW_KEYS = ["dueDate", "gestation", "id", "status", "subjectId", "version"];

  it("is hers whole", async () => {
    const response = await get("/pregnancies/current");
    expect(response.status).toBe(200);
    const body = PregnancyView.parse(await response.json());
    expect(sortedKeys(body)).toEqual(OWNER_KEYS);
    expect(body).toMatchObject({ id: pregnancyId, status: "active", endedReason: null });
  });

  it("carries only the overview for a summary grantee and audits the read once a day", async () => {
    const response = await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.ben);
    expect(response.status).toBe(200);
    const raw = await response.text();
    const body = PregnancyView.parse(JSON.parse(raw));
    expect(sortedKeys(body)).toEqual(OVERVIEW_KEYS);
    expect(body).toMatchObject({
      status: "active",
      id: pregnancyId,
      dueDate: DUE,
      gestation: { weeks: 10, days: 0 },
    });
    for (const word of ["endedReason", "datingMethod", "startedAt", "lmp"]) {
      expect(raw).not.toContain(word);
    }
    expect((await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.ben)).status).toBe(200);
    expect(await auditRows("partner.read")).toEqual([
      {
        actorId: BEN,
        category: "pregnancy.overview",
        dedupeKey: `${BEN}/${ANNA}/pregnancy.overview/${TODAY}`,
      },
    ]);
  });

  it("carries the same overview for a read grantee", async () => {
    await setLevel("read");
    const response = await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.ben);
    expect(response.status).toBe(200);
    expect(sortedKeys(await response.json())).toEqual(OVERVIEW_KEYS);
  });

  it("is 404 for a stranger, for a revoked grant and for a subject with none", async () => {
    expect((await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.cara)).status).toBe(404);
    await harness.db.insert(schema.grants).values({
      id: CARA_GRANT,
      ownerId: ANNA,
      granteeId: CARA,
      category: "pregnancy.overview",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    expect((await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.cara)).status).toBe(200);
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, CARA_GRANT));
    const revoked = await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.cara);
    expect(revoked.status).toBe(404);
    expect((await problemOf(revoked)).code).toBe("not_found");
    expect((await get(`/pregnancies/current?subject=${BEN}`)).status).toBe(404);
    expect((await get("/pregnancies/current", TOKENS.cara)).status).toBe(404);
  });

  it("answers one pregnancy by id under the same projection and the same 404", async () => {
    const hers = await get(`/pregnancies/${pregnancyId}`);
    expect(hers.status).toBe(200);
    expect(sortedKeys(await hers.json())).toEqual(OWNER_KEYS);
    for (const level of ["summary", "read"] as const) {
      await setLevel(level);
      const response = await get(`/pregnancies/${pregnancyId}`, TOKENS.ben);
      expect(response.status).toBe(200);
      const raw = await response.text();
      expect(sortedKeys(JSON.parse(raw) as object)).toEqual(OVERVIEW_KEYS);
      for (const word of ["endedReason", "datingMethod", "startedAt", "lmp"]) {
        expect(raw).not.toContain(word);
      }
    }
    // Cara's grant was revoked above; a foreign or absent id is the same 404.
    expect((await get(`/pregnancies/${pregnancyId}`, TOKENS.cara)).status).toBe(404);
    expect((await get(`/pregnancies/${randomUUID()}`)).status).toBe(404);
    expect((await get("/pregnancies/not-an-id")).status).toBe(422);
  });

  it("needs a session and a well-formed subject", async () => {
    expect((await app.request("/api/v1/pregnancies/current")).status).toBe(401);
    expect((await get("/pregnancies/current?subject=anna")).status).toBe(422);
  });
});

describe("dating", () => {
  // At 10w0d by the last period, a scan measuring 12w0d puts the due date 14
  // days earlier, past the 7 day band CO 700 sets from 9w0d to 15w6d.
  const scan = { method: "ultrasound", scanDate: TODAY, weeks: 12, days: 0 };
  const scanDue = addDays(TODAY, 280 - 84);

  it("keeps the date from the last period when a scan agrees within the CO 700 band", async () => {
    // 11w0d against 10w0d is a 7 day discrepancy: inside the band, so the date stands.
    const response = await put(
      `/pregnancies/${pregnancyId}/dating`,
      { method: "ultrasound", scanDate: TODAY, weeks: 11, days: 0 },
      1,
    );
    expect(response.status).toBe(200);
    expect(Pregnancy.parse(await response.json())).toMatchObject({
      dueDate: DUE,
      datingMethod: "lmp",
      version: 1,
    });
    const changes = await harness.db
      .select({ id: schema.dueDateChanges.id })
      .from(schema.dueDateChanges)
      .where(eq(schema.dueDateChanges.pregnancyId, pregnancyId));
    expect(changes).toHaveLength(0);
  });

  it("replaces the due date from a scan and appends the change to the history", async () => {
    const response = await put(`/pregnancies/${pregnancyId}/dating`, scan, 1);
    expect(response.status).toBe(200);
    const body = Pregnancy.parse(await response.json());
    expect(body).toMatchObject({ dueDate: scanDue, datingMethod: "ultrasound", version: 2 });
    expect(body.gestation).toMatchObject({ weeks: 12, days: 0 });
    const changes = await harness.db
      .select()
      .from(schema.dueDateChanges)
      .where(eq(schema.dueDateChanges.pregnancyId, pregnancyId));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      subjectId: ANNA,
      previousDueDate: DUE,
      nextDueDate: scanDue,
      method: "ultrasound",
    });
  });

  it("answers 409 for a stale version and 422 without If-Match", async () => {
    const stale = await put(`/pregnancies/${pregnancyId}/dating`, scan, 1);
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).detail).toBe(STALE_VERSION);
    const missing = await put(`/pregnancies/${pregnancyId}/dating`, scan, null);
    expect(missing.status).toBe(422);
    expect((await problemOf(missing)).errors?.[0]?.path).toBe("if-match");
  });

  it("changes nothing when the date and the method are the same", async () => {
    const response = await put(`/pregnancies/${pregnancyId}/dating`, scan, 2);
    expect(response.status).toBe(200);
    expect(Pregnancy.parse(await response.json()).version).toBe(2);
    const changes = await harness.db
      .select({ id: schema.dueDateChanges.id })
      .from(schema.dueDateChanges)
      .where(eq(schema.dueDateChanges.pregnancyId, pregnancyId));
    expect(changes).toHaveLength(1);
  });

  it("is 404 for a reader, and a contributor's change is audited and projected as the overview", async () => {
    await setLevel("read");
    expect(
      (
        await put(
          `/pregnancies/${pregnancyId}/dating`,
          { method: "manual", dueDate: DUE },
          2,
          TOKENS.ben,
        )
      ).status,
    ).toBe(404);
    await setLevel("contribute");
    const response = await put(
      `/pregnancies/${pregnancyId}/dating`,
      { method: "manual", dueDate: DUE },
      2,
      TOKENS.ben,
    );
    expect(response.status).toBe(200);
    const body = PregnancyView.parse(await response.json());
    expect(body).toStrictEqual({
      status: "active",
      id: pregnancyId,
      subjectId: ANNA,
      dueDate: DUE,
      gestation: { weeks: 10, days: 0, totalDays: 70, trimester: 1, label: "10w0d" },
      version: 3,
    });
    expect(await auditRows("partner.write")).toEqual([
      { actorId: BEN, category: "pregnancy.overview", dedupeKey: null },
    ]);
  });

  it("lists the history for her alone, oldest first, with a cursor", async () => {
    const all = await get(`/pregnancies/${pregnancyId}/dating-history`);
    expect(all.status).toBe(200);
    const page = (await all.json()) as {
      items: { method: string; id: string }[];
      nextCursor: null;
    };
    expect(page.items.map((item) => item.method)).toEqual(["ultrasound", "manual"]);
    expect(page.nextCursor).toBeNull();

    const first = await get(`/pregnancies/${pregnancyId}/dating-history?limit=1`);
    const firstPage = (await first.json()) as { items: { id: string }[]; nextCursor: string };
    expect(firstPage.items.map((item) => item.id)).toEqual([page.items[0]?.id]);
    expect(firstPage.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await get(
      `/pregnancies/${pregnancyId}/dating-history?limit=1&cursor=${firstPage.nextCursor}`,
    );
    const secondPage = (await second.json()) as { items: { id: string }[]; nextCursor: null };
    expect(secondPage.items.map((item) => item.id)).toEqual([page.items[1]?.id]);
    expect(secondPage.nextCursor).toBeNull();

    const bad = await get(`/pregnancies/${pregnancyId}/dating-history?cursor=not-a-cursor`);
    expect(bad.status).toBe(422);
    expect((await problemOf(bad)).errors?.[0]?.path).toBe("cursor");

    expect((await get(`/pregnancies/${pregnancyId}/dating-history`, TOKENS.ben)).status).toBe(404);
    expect((await get(`/pregnancies/${pregnancyId}/dating-history?limit=0`)).status).toBe(422);
  });

  it("takes the same date by another method as a method change with no history row", async () => {
    // The manual date above equals the one from her last period: she confirms it that way.
    const response = await put(
      `/pregnancies/${pregnancyId}/dating`,
      { method: "lmp", lastPeriodStart: LMP },
      3,
    );
    expect(response.status).toBe(200);
    expect(Pregnancy.parse(await response.json())).toMatchObject({
      dueDate: DUE,
      datingMethod: "lmp",
      version: 4,
    });
    const changes = await harness.db
      .select({ method: schema.dueDateChanges.method })
      .from(schema.dueDateChanges)
      .where(eq(schema.dueDateChanges.pregnancyId, pregnancyId));
    expect(changes.map((change) => change.method)).toEqual(["ultrasound", "manual"]);
  });
});

describe("events", () => {
  const DETAIL = "Midwife at the clinic";
  const FULL_KEYS = [
    "authorId",
    "createdAt",
    "date",
    "detail",
    "id",
    "kind",
    "pregnancyId",
    "subjectId",
    "updatedAt",
    "version",
  ];
  const SUMMARY_KEYS = [
    "createdAt",
    "date",
    "id",
    "kind",
    "pregnancyId",
    "subjectId",
    "updatedAt",
    "version",
  ];

  it("stores the detail sealed under her key and answers it in clear", async () => {
    const response = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "appointment",
      date: TODAY,
      detail: DETAIL,
    });
    expect(response.status).toBe(201);
    const body = PregnancyEvent.parse(await response.json());
    eventId = body.id;
    expect(response.headers.get("location")).toBe(
      `/api/v1/pregnancies/${pregnancyId}/events/${eventId}`,
    );
    const located = await app.request(response.headers.get("location") ?? "", {
      headers: sessionHeaders(TOKENS.anna),
    });
    expect(located.status).toBe(200);
    expect(PregnancyEvent.parse(await located.json())).toMatchObject({
      id: eventId,
      detail: DETAIL,
    });
    expect(body).toMatchObject({
      pregnancyId,
      subjectId: ANNA,
      authorId: ANNA,
      kind: "appointment",
      date: TODAY,
      detail: DETAIL,
      version: 1,
    });
    const [row] = await harness.db
      .select({
        label: schema.pregnancyEvents.label,
        kekVersion: schema.pregnancyEvents.kekVersion,
      })
      .from(schema.pregnancyEvents)
      .where(eq(schema.pregnancyEvents.id, eventId));
    expect(row?.kekVersion).toBe(new EnvKeyProvider().version);
    expect(row?.label).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(row?.label ?? new Uint8Array()).toString("utf8")).not.toContain("Midwife");
    expect(Buffer.from(row?.label ?? new Uint8Array()).toString("latin1")).not.toContain("Midwife");
  });

  it("takes an event without a detail and lists by date with filters and a cursor", async () => {
    const earlier = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "milestone",
      date: addDays(TODAY, -1),
    });
    expect(earlier.status).toBe(201);
    expect(PregnancyEvent.parse(await earlier.json()).detail).toBeNull();
    const later = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "appointment",
      date: addDays(TODAY, 1),
      detail: "Scan",
    });
    expect(later.status).toBe(201);

    const all = await get(`/pregnancies/${pregnancyId}/events`);
    expect(all.status).toBe(200);
    const page = (await all.json()) as {
      items: { date: string; detail: string | null }[];
      nextCursor: null;
    };
    expect(page.items.map((item) => item.date)).toEqual([
      addDays(TODAY, -1),
      TODAY,
      addDays(TODAY, 1),
    ]);
    expect(page.items.map((item) => item.detail)).toEqual([null, DETAIL, "Scan"]);
    expect(page.nextCursor).toBeNull();

    const ranged = await get(`/pregnancies/${pregnancyId}/events?from=${TODAY}&to=${TODAY}`);
    expect(((await ranged.json()) as { items: unknown[] }).items).toHaveLength(1);

    const first = await get(`/pregnancies/${pregnancyId}/events?limit=2`);
    const firstPage = (await first.json()) as { items: { date: string }[]; nextCursor: string };
    expect(firstPage.items).toHaveLength(2);
    const rest = await get(
      `/pregnancies/${pregnancyId}/events?limit=2&cursor=${firstPage.nextCursor}`,
    );
    const restPage = (await rest.json()) as { items: { date: string }[]; nextCursor: null };
    expect(restPage.items.map((item) => item.date)).toEqual([addDays(TODAY, 1)]);
    expect(restPage.nextCursor).toBeNull();
  });

  it("shows a summary grantee kinds and days only, and a reader the detail too", async () => {
    await setLevel("summary");
    const summary = await get(`/pregnancies/${pregnancyId}/events`, TOKENS.ben);
    expect(summary.status).toBe(200);
    const raw = await summary.text();
    const page = JSON.parse(raw) as { items: object[] };
    expect(page.items).toHaveLength(3);
    for (const item of page.items) expect(sortedKeys(item)).toEqual(SUMMARY_KEYS);
    expect(raw).not.toContain("Midwife");
    expect(raw).not.toContain("Scan");
    // Ben's read of the day already has its row: one per actor, subject, category and day.
    const reads = await auditRows("partner.read");
    expect(reads.filter((row) => row.actorId === BEN)).toHaveLength(1);

    await setLevel("read");
    const read = await get(`/pregnancies/${pregnancyId}/events`, TOKENS.ben);
    const readPage = (await read.json()) as { items: { detail: string | null }[] };
    for (const item of readPage.items) expect(sortedKeys(item)).toEqual(FULL_KEYS);
    expect(readPage.items.map((item) => item.detail)).toEqual([null, DETAIL, "Scan"]);
  });

  it("answers one event under the same projection as the list", async () => {
    await setLevel("summary");
    const summary = await get(`/pregnancies/${pregnancyId}/events/${eventId}`, TOKENS.ben);
    expect(summary.status).toBe(200);
    const raw = await summary.text();
    expect(sortedKeys(JSON.parse(raw) as object)).toEqual(SUMMARY_KEYS);
    expect(raw).not.toContain("Midwife");
    await setLevel("read");
    const read = await get(`/pregnancies/${pregnancyId}/events/${eventId}`, TOKENS.ben);
    const body = PregnancyEvent.parse(await read.json());
    expect(sortedKeys(body)).toEqual(FULL_KEYS);
    expect(body.detail).toBe(DETAIL);
    expect((await get(`/pregnancies/${pregnancyId}/events/${eventId}`, TOKENS.cara)).status).toBe(
      404,
    );
    expect((await get(`/pregnancies/${pregnancyId}/events/${randomUUID()}`)).status).toBe(404);
  });

  it("lets a contributor add an event that stays hers, and audits the write", async () => {
    await setLevel("read");
    expect(
      (
        await post(
          `/pregnancies/${pregnancyId}/events`,
          { kind: "milestone", date: TODAY },
          TOKENS.ben,
        )
      ).status,
    ).toBe(404);
    await setLevel("contribute");
    const response = await post(
      `/pregnancies/${pregnancyId}/events`,
      { kind: "milestone", date: TODAY, detail: "Felt a kick" },
      TOKENS.ben,
    );
    expect(response.status).toBe(201);
    const body = PregnancyEvent.parse(await response.json());
    partnerEventId = body.id;
    expect(body).toMatchObject({ subjectId: ANNA, authorId: BEN, detail: "Felt a kick" });
    expect(await auditRows("partner.write")).toHaveLength(2);
    const hers = await get(`/pregnancies/${pregnancyId}/events?from=${TODAY}&to=${TODAY}`);
    const page = (await hers.json()) as { items: { authorId: string; detail: string }[] };
    expect(page.items.map((item) => [item.authorId, item.detail])).toEqual([
      [ANNA, DETAIL],
      [BEN, "Felt a kick"],
    ]);
  });

  it("replaces an event behind If-Match and refuses a stale version", async () => {
    const response = await put(
      `/pregnancies/${pregnancyId}/events/${eventId}`,
      { kind: "appointment", date: TODAY, detail: "Midwife, moved to the afternoon" },
      1,
    );
    expect(response.status).toBe(200);
    expect(PregnancyEvent.parse(await response.json())).toMatchObject({
      detail: "Midwife, moved to the afternoon",
      version: 2,
    });
    const stale = await put(
      `/pregnancies/${pregnancyId}/events/${eventId}`,
      { kind: "appointment", date: TODAY },
      1,
    );
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).detail).toBe(STALE_VERSION);
    await setLevel("read");
    expect(
      (
        await put(
          `/pregnancies/${pregnancyId}/events/${eventId}`,
          { kind: "appointment", date: TODAY },
          2,
          TOKENS.ben,
        )
      ).status,
    ).toBe(404);
    await setLevel("contribute");
    const partner = await put(
      `/pregnancies/${pregnancyId}/events/${partnerEventId}`,
      { kind: "milestone", date: TODAY, detail: "Felt a kick, twice" },
      1,
      TOKENS.ben,
    );
    expect(partner.status).toBe(200);
    expect(PregnancyEvent.parse(await partner.json()).detail).toBe("Felt a kick, twice");
  });

  it("is 404 on every route once the grant is revoked, and writes nothing", async () => {
    await setLevel("contribute");
    const writes = (await auditRows("partner.write")).length;
    const authored = async () =>
      (
        await harness.db
          .select({ id: schema.pregnancyEvents.id })
          .from(schema.pregnancyEvents)
          .where(eq(schema.pregnancyEvents.authorId, BEN))
      ).length;
    const before = await authored();
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, GRANT));
    try {
      const answers = [
        await get(`/pregnancies/${pregnancyId}`, TOKENS.ben),
        await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.ben),
        await get(`/pregnancies/${pregnancyId}/events`, TOKENS.ben),
        await get(`/pregnancies/${pregnancyId}/events/${partnerEventId}`, TOKENS.ben),
        await post(
          `/pregnancies/${pregnancyId}/events`,
          { kind: "milestone", date: TODAY },
          TOKENS.ben,
        ),
        await put(
          `/pregnancies/${pregnancyId}/events/${partnerEventId}`,
          { kind: "milestone", date: TODAY },
          2,
          TOKENS.ben,
        ),
        await put(
          `/pregnancies/${pregnancyId}/dating`,
          { method: "manual", dueDate: DUE },
          4,
          TOKENS.ben,
        ),
        await get(`/pregnancies/${pregnancyId}/dating-history`, TOKENS.ben),
      ];
      for (const answer of answers) {
        expect(answer.status).toBe(404);
        expect((await problemOf(answer)).code).toBe("not_found");
      }
      expect(await auditRows("partner.write")).toHaveLength(writes);
      expect(await authored()).toBe(before);
    } finally {
      await harness.db
        .update(schema.grants)
        .set({ revokedAt: null })
        .where(eq(schema.grants.id, GRANT));
    }
  });

  it("is deleted by her alone, leaving a content-free tombstone for a sync", async () => {
    await setLevel("contribute");
    expect((await del(`/pregnancies/${pregnancyId}/events/${eventId}`, 2, TOKENS.ben)).status).toBe(
      404,
    );
    const stale = await del(`/pregnancies/${pregnancyId}/events/${eventId}`, 1);
    expect(stale.status).toBe(409);
    const response = await del(`/pregnancies/${pregnancyId}/events/${eventId}`, 2);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    const plain = await get(`/pregnancies/${pregnancyId}/events`);
    const plainPage = (await plain.json()) as { items: { id: string }[] };
    expect(plainPage.items.map((item) => item.id)).not.toContain(eventId);

    const sync = await get(
      `/pregnancies/${pregnancyId}/events?updatedSince=${encodeURIComponent(startedAt)}`,
    );
    const syncPage = (await sync.json()) as { items: Record<string, unknown>[] };
    const tombstone = syncPage.items.find((item) => item["id"] === eventId);
    expect(tombstone).toBeDefined();
    expect(sortedKeys(tombstone ?? {})).toEqual([
      "deletedAt",
      "id",
      "pregnancyId",
      "subjectId",
      "version",
    ]);
    expect(tombstone?.["version"]).toBe(3);

    const [row] = await harness.db
      .select({
        label: schema.pregnancyEvents.label,
        kekVersion: schema.pregnancyEvents.kekVersion,
        deletedAt: schema.pregnancyEvents.deletedAt,
      })
      .from(schema.pregnancyEvents)
      .where(eq(schema.pregnancyEvents.id, eventId));
    expect(row).toMatchObject({ label: null, kekVersion: null });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect((await del(`/pregnancies/${pregnancyId}/events/${eventId}`, 3)).status).toBe(404);
  });

  it("validates the kind, the detail length and the date filters", async () => {
    const kind = await post(`/pregnancies/${pregnancyId}/events`, { kind: "symptom", date: TODAY });
    expect(kind.status).toBe(422);
    expect((await problemOf(kind)).errors?.[0]?.path).toBe("kind");
    const long = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "milestone",
      date: TODAY,
      detail: "x".repeat(501),
    });
    expect(long.status).toBe(422);
    const filter = await get(`/pregnancies/${pregnancyId}/events?from=yesterday`);
    expect(filter.status).toBe(422);
    expect((await problemOf(filter)).errors?.[0]?.path).toBe("from");
    const since = await get(`/pregnancies/${pregnancyId}/events?updatedSince=${TODAY}`);
    expect(since.status).toBe(422);
  });

  it("refuses a day that is not on the calendar with 422 naming the field", async () => {
    const created = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "milestone",
      date: "2026-02-30",
    });
    expect(created.status).toBe(422);
    expect((await problemOf(created)).errors).toEqual([
      { path: "date", message: "Not a calendar day." },
    ]);
    const replaced = await put(
      `/pregnancies/${pregnancyId}/events/${partnerEventId}`,
      { kind: "milestone", date: "2026-02-30" },
      2,
    );
    expect(replaced.status).toBe(422);
    expect((await problemOf(replaced)).errors?.[0]?.path).toBe("date");
    for (const field of ["from", "to"]) {
      const listed = await get(`/pregnancies/${pregnancyId}/events?${field}=2026-02-30`);
      expect(listed.status).toBe(422);
      expect((await problemOf(listed)).errors).toEqual([
        { path: field, message: "Not a calendar day." },
      ]);
    }
  });

  it("is 404 for a stranger in every direction", async () => {
    expect((await get(`/pregnancies/${pregnancyId}/events`, TOKENS.cara)).status).toBe(404);
    expect(
      (
        await post(
          `/pregnancies/${pregnancyId}/events`,
          { kind: "milestone", date: TODAY },
          TOKENS.cara,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await put(
          `/pregnancies/${pregnancyId}/events/${partnerEventId}`,
          { kind: "milestone", date: TODAY },
          2,
          TOKENS.cara,
        )
      ).status,
    ).toBe(404);
    expect(
      (await del(`/pregnancies/${pregnancyId}/events/${partnerEventId}`, 2, TOKENS.cara)).status,
    ).toBe(404);
    expect((await get(`/pregnancies/${randomUUID()}/events`)).status).toBe(404);
    expect((await get(`/pregnancies/${pregnancyId}`, TOKENS.cara)).status).toBe(404);
    expect(
      (await get(`/pregnancies/${pregnancyId}/events/${partnerEventId}`, TOKENS.cara)).status,
    ).toBe(404);
  });
});

describe("ending a pregnancy", () => {
  const REMINDER = "018f5e7a-5000-7000-8000-000000000001";
  const OTHER_REMINDER = "018f5e7a-5000-7000-8000-000000000002";
  const MAIL = "018f5e7a-5000-7000-8000-000000000003";
  const PREDICTION = "018f5e7a-5000-7000-8000-000000000004";

  it("needs a fresh authentication", async () => {
    const response = await post(
      `/pregnancies/${pregnancyId}/end`,
      { endedAt: TODAY, reason: "birth" },
      STALE,
    );
    expect(response.status).toBe(401);
    expect((await problemOf(response)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
  });

  it("is hers alone, even for a contributor", async () => {
    await setLevel("contribute");
    const response = await post(
      `/pregnancies/${pregnancyId}/end`,
      { endedAt: TODAY, reason: "birth" },
      TOKENS.ben,
    );
    expect(response.status).toBe(404);
  });

  it("refuses a day before the pregnancy began and an unknown reason", async () => {
    const early = await post(`/pregnancies/${pregnancyId}/end`, {
      endedAt: addDays(LMP, -1),
      reason: "loss",
    });
    expect(early.status).toBe(422);
    expect((await problemOf(early)).errors).toEqual([
      { path: "endedAt", message: "Not a day after the pregnancy began." },
    ]);
    expect(
      (await post(`/pregnancies/${pregnancyId}/end`, { endedAt: TODAY, reason: "moved" })).status,
    ).toBe(422);
    expect(await stageOf(ANNA)).toBe("pregnancy");
  });

  it("records the ending, moves the stage, clears predictions and cancels the reminders", async () => {
    await harness.db.insert(schema.cyclePredictions).values({
      id: PREDICTION,
      subjectId: ANNA,
      basis: "first_guess",
      uncertaintyDays: 4,
      ovulationBandDays: 2,
    });
    await harness.db.insert(schema.jobs).values([
      { id: REMINDER, type: REMINDER_JOB_TYPE, payloadJson: { pregnancyId } },
      { id: OTHER_REMINDER, type: REMINDER_JOB_TYPE, payloadJson: { pregnancyId: randomUUID() } },
      { id: MAIL, type: "mail.invitation", payloadJson: { invitationId: randomUUID() } },
    ]);
    const response = await post(`/pregnancies/${pregnancyId}/end`, {
      endedAt: TODAY,
      reason: "birth",
    });
    expect(response.status).toBe(200);
    const body = Pregnancy.parse(await response.json());
    expect(body).toMatchObject({
      status: "ended",
      endedAt: TODAY,
      endedReason: "birth",
      gestation: null,
      version: 5,
    });
    expect(await stageOf(ANNA)).toBe("postpartum");
    const predictions = await harness.db
      .select({ id: schema.cyclePredictions.id })
      .from(schema.cyclePredictions)
      .where(eq(schema.cyclePredictions.subjectId, ANNA));
    expect(predictions).toEqual([]);
    const jobs = await harness.db.select({ id: schema.jobs.id }).from(schema.jobs);
    expect(jobs.map((job) => job.id).sort()).toEqual([OTHER_REMINDER, MAIL].sort());
  });

  it("freezes every grantee's view to the paused state and keeps the reason hers", async () => {
    for (const level of ["summary", "read", "contribute"] as const) {
      await setLevel(level);
      const current = await get(`/pregnancies/current?subject=${ANNA}`, TOKENS.ben);
      expect(current.status).toBe(200);
      const raw = await current.text();
      expect(JSON.parse(raw)).toStrictEqual({ status: "paused" });
      expect(raw).not.toContain("birth");
      expect(raw).not.toContain(DUE);
      const events = await get(`/pregnancies/${pregnancyId}/events`, TOKENS.ben);
      expect(await events.json()).toEqual({ items: [], nextCursor: null });
      const byId = await get(`/pregnancies/${pregnancyId}`, TOKENS.ben);
      expect(await byId.json()).toStrictEqual({ status: "paused" });
      const event = await get(`/pregnancies/${pregnancyId}/events/${partnerEventId}`, TOKENS.ben);
      expect(event.status).toBe(404);
    }
    // A contributor's writes are refused with the neutral paused state, never "ended".
    const writes = [
      await post(
        `/pregnancies/${pregnancyId}/events`,
        { kind: "milestone", date: TODAY },
        TOKENS.ben,
      ),
      await put(
        `/pregnancies/${pregnancyId}/events/${partnerEventId}`,
        { kind: "milestone", date: TODAY },
        2,
        TOKENS.ben,
      ),
      await put(
        `/pregnancies/${pregnancyId}/dating`,
        { method: "manual", dueDate: TODAY },
        5,
        TOKENS.ben,
      ),
    ];
    for (const write of writes) {
      expect(write.status).toBe(409);
      const raw = await write.text();
      expect(raw).not.toContain("ended");
      expect(Problem.parse(JSON.parse(raw)).detail).toBe(PREGNANCY_PAUSED);
    }

    const hers = await get("/pregnancies/current");
    expect(Pregnancy.parse(await hers.json())).toMatchObject({
      status: "ended",
      endedReason: "birth",
    });
    const herEvents = await get(`/pregnancies/${pregnancyId}/events`);
    expect(((await herEvents.json()) as { items: unknown[] }).items).toHaveLength(3);
    const postpartum = await post(`/pregnancies/${pregnancyId}/events`, {
      kind: "appointment",
      date: addDays(TODAY, 42),
      detail: "Six week check",
    });
    expect(postpartum.status).toBe(201);
  });

  it("ends once, and keeps its dates afterwards", async () => {
    const again = await post(`/pregnancies/${pregnancyId}/end`, {
      endedAt: TODAY,
      reason: "other",
    });
    expect(again.status).toBe(409);
    expect((await problemOf(again)).detail).toBe(PREGNANCY_ENDED);
    const redate = await put(
      `/pregnancies/${pregnancyId}/dating`,
      { method: "manual", dueDate: TODAY },
      5,
    );
    expect(redate.status).toBe(409);
    expect((await problemOf(redate)).detail).toBe(PREGNANCY_ENDED);
  });

  it("moves the stage to cycle after a loss", async () => {
    const started = await post(
      "/pregnancies",
      { dating: { method: "manual", dueDate: DUE } },
      TOKENS.ben,
    );
    expect(started.status).toBe(201);
    const { id } = Pregnancy.parse(await started.json());
    expect(await stageOf(BEN)).toBe("pregnancy");
    const ended = await post(
      `/pregnancies/${id}/end`,
      { endedAt: TODAY, reason: "loss" },
      TOKENS.ben,
    );
    expect(ended.status).toBe(200);
    expect(await stageOf(BEN)).toBe("cycle");
    expect((await get("/pregnancies/current", TOKENS.ben)).status).toBe(200);
    expect((await get(`/pregnancies/current?subject=${BEN}`)).status).toBe(404);
  });
});

describe("the contract", () => {
  it("lists every pregnancy route with named components", async () => {
    const response = await app.request("/api/v1/openapi.json");
    const document = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(Object.keys(document.paths["/api/v1/pregnancies"] ?? {})).toEqual(["post"]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/current"] ?? {})).toEqual(["get"]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/{id}"] ?? {})).toEqual(["get"]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/{id}/dating"] ?? {})).toEqual(["put"]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/{id}/dating-history"] ?? {})).toEqual([
      "get",
    ]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/{id}/events"] ?? {}).sort()).toEqual([
      "get",
      "post",
    ]);
    expect(
      Object.keys(document.paths["/api/v1/pregnancies/{id}/events/{eventId}"] ?? {}).sort(),
    ).toEqual(["delete", "get", "put"]);
    expect(Object.keys(document.paths["/api/v1/pregnancies/{id}/end"] ?? {})).toEqual(["post"]);
    for (const name of [
      "Pregnancy",
      "PregnancyView",
      "PregnancyOverview",
      "PregnancyPaused",
      "PregnancyStartInput",
      "PregnancyDatingInput",
      "PregnancyEndInput",
      "PregnancyEvent",
      "PregnancyEventInput",
      "PregnancyEventList",
      "DueDateChangeList",
    ]) {
      expect(document.components.schemas).toHaveProperty(name);
    }
  });
});
