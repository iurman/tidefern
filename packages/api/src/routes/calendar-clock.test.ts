import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { checklistFor, diffDays, gestationalAge, todayIn } from "@tidefern/core";
import { FixedKeyProvider } from "@tidefern/crypto";
import { schema, withActor } from "@tidefern/db";
import {
  CyclePrediction,
  CycleStatus,
  MilestoneCheck,
  MilestoneChecklist,
  Pregnancy,
  PregnancyView,
} from "@tidefern/schemas";

import { createApp } from "../app";
import { calendarClock, pinCalendar, realCalendarClock } from "../clock";
import { IDEMPOTENCY_KEY_HEADER } from "../middleware/index";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import { sessionHeaders } from "../test/auth-fake";
import type { ApiTestDatabase } from "../test/database";
import { configureChildren } from "./children";
import { configureCycle } from "./cycle";
import { Me } from "./me";

/**
 * Task E11: every route that decides which calendar day it is reads the
 * app's calendar clock. One PGlite serves two apps: one whose clock
 * `TIDEFERN_FAKE_NOW` froze far from the real date, and one on the real
 * clock. The frozen app's answers are pinned to the frozen day; the real
 * app's, to the real one, read on the same connection right after, which
 * also proves the frozen day never leaks into the next transaction.
 *
 * The cast: Anna cycles in Europe/Berlin and is the guardian of a child born
 * on 2025-12-05; her periods started on 2026-02-14 and 2026-03-14 and she
 * bled on 2026-03-15 too. Ben holds her status card and Cara's pregnancy
 * overview, and has no profile yet. Cara is pregnant in America/Vancouver,
 * ten weeks on 2026-03-14, with one appointment logged. Dana lives in
 * Asia/Tokyo and has no pregnancy until a test starts one.
 */
const FROZEN = "2026-03-14T23:30:00.000Z";
/** FROZEN is 00:30 on 15 March in Berlin (UTC+1 until 29 March)... */
const ANNA_FROZEN_TODAY = "2026-03-15";
/** ...and 16:30 on 14 March in Vancouver (UTC-7 since 8 March). */
const CARA_FROZEN_TODAY = "2026-03-14";
const ANNA_ZONE = "Europe/Berlin";
const CARA_ZONE = "America/Vancouver";
const CARA_DUE = "2026-10-10";
const CARA_PREGNANCY = "018f5e7a-2000-7000-8000-00000000e131";
const CARA_EVENT = "018f5e7a-2000-7000-8000-00000000e132";
/** Ten weeks to the day: Cara on her frozen today, and Dana when she starts. */
const TEN_WEEKS = { weeks: 10, days: 0, totalDays: 70, trimester: 1, label: "10w0d" };
const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
const DANA_TOKEN = "dana";
const DANA_ZONE = "Asia/Tokyo";
/**
 * FROZEN is 08:30 on 15 March in Tokyo (UTC+9), 30 weeks before the due
 * date Dana starts with and 29 before the one she re-dates to.
 */
const DANA_DUE = "2026-10-11";
const DANA_REDATED = "2026-10-04";
const CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const BORN = "2025-12-05";
const NEXT_PERIOD = "2026-04-11";

let harness: ApiTestDatabase;
let frozen: ReturnType<typeof createApp>;
let real: ReturnType<typeof createApp>;

const get = (app: ReturnType<typeof createApp>, path: string, token: string) =>
  app.request(`/api/v1${path}`, { headers: sessionHeaders(token) });

async function json(response: Response): Promise<unknown> {
  expect(response.status).toBe(200);
  return response.json();
}

const writeHeaders = (token: string, extra: Record<string, string>): Record<string, string> => ({
  ...(sessionHeaders(token) as Record<string, string>),
  origin: OWN_ORIGIN,
  "content-type": "application/json",
  ...extra,
});

/** The dedupe keys of the reads `actorId` has been audited for about `subjectId`. */
async function readsFiled(actorId: string, subjectId: string): Promise<(string | null)[]> {
  const rows = await harness.db
    .select({ dedupeKey: schema.auditEvents.dedupeKey })
    .from(schema.auditEvents)
    .where(
      and(eq(schema.auditEvents.actorId, actorId), eq(schema.auditEvents.subjectId, subjectId)),
    );
  return rows.map((row) => row.dedupeKey);
}

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  const { db } = harness;
  const attested = new Date("2026-01-01T00:00:00.000Z");
  await db
    .insert(schema.user)
    .values({ id: DANA, name: "Dana", email: "dana@example.com", emailVerified: true });
  fixture.auth.signIn(DANA_TOKEN, DANA, "dana@example.com", 60);
  await db.insert(schema.profiles).values([
    { userId: ANNA, timeZone: ANNA_ZONE, stage: "cycle", ageAttestedAt: attested },
    { userId: CARA, timeZone: CARA_ZONE, stage: "pregnancy", ageAttestedAt: attested },
    { userId: DANA, timeZone: DANA_ZONE, stage: "cycle", ageAttestedAt: attested },
  ]);
  await db.insert(schema.grants).values({
    id: "018f5e7a-2000-7000-8000-00000000e111",
    ownerId: ANNA,
    granteeId: BEN,
    category: "cycle.status",
    level: "summary",
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
  });
  await db.insert(schema.cycleEntries).values([
    {
      id: "018f5e7a-2000-7000-8000-00000000e121",
      subjectId: ANNA,
      date: "2026-02-14",
      flow: "heavy",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000e122",
      subjectId: ANNA,
      date: "2026-02-16",
      flow: "light",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000e123",
      subjectId: ANNA,
      date: "2026-03-14",
      flow: "heavy",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000e124",
      subjectId: ANNA,
      date: "2026-03-15",
      flow: "medium",
    },
  ]);
  await db.insert(schema.pregnancies).values({
    id: CARA_PREGNANCY,
    subjectId: CARA,
    dueDate: CARA_DUE,
    datingMethod: "lmp",
  });
  await db.insert(schema.pregnancyEvents).values({
    id: CARA_EVENT,
    pregnancyId: CARA_PREGNANCY,
    subjectId: CARA,
    authorId: CARA,
    kind: "appointment",
    date: "2026-03-20",
  });
  await db.insert(schema.grants).values({
    id: "018f5e7a-2000-7000-8000-00000000e112",
    ownerId: CARA,
    granteeId: BEN,
    category: "pregnancy.overview",
    level: "summary",
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
  });
  await db.insert(schema.households).values({ id: HOUSEHOLD });
  await db.insert(schema.householdMembers).values({
    id: "018f5e7a-2000-7000-8000-00000000e141",
    householdId: HOUSEHOLD,
    userId: ANNA,
    role: "owner",
  });
  await db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Ida", dateOfBirth: BORN });
  await db
    .insert(schema.childGuardians)
    .values({ id: "018f5e7a-2000-7000-8000-00000000e151", childId: CHILD, userId: ANNA });

  configureCycle({ db });
  configureChildren({ db, keys: new FixedKeyProvider(randomBytes(32), "test") });
  const log = { sink: () => undefined };
  frozen = createApp({
    auth: fixture.auth,
    db,
    log,
    clock: calendarClock({ TIDEFERN_FAKE_NOW: FROZEN }),
  });
  real = createApp({ auth: fixture.auth, db, log, clock: realCalendarClock });
});

afterAll(async () => {
  await harness.close();
});

describe("GET /v1/me", () => {
  it("answers today in each person's own zone from the frozen instant", async () => {
    expect(Me.parse(await json(await get(frozen, "/me", TOKENS.anna))).today).toBe(
      ANNA_FROZEN_TODAY,
    );
    expect(Me.parse(await json(await get(frozen, "/me", TOKENS.cara))).today).toBe(
      CARA_FROZEN_TODAY,
    );
  });

  it("answers null before a profile holds a time zone", async () => {
    const body = Me.parse(await json(await get(frozen, "/me", TOKENS.ben)));
    expect(body.profile).toBeNull();
    expect(body.today).toBeNull();
  });

  it("answers the real today on the real clock", async () => {
    const today = todayIn(ANNA_ZONE, new Date());
    expect(Me.parse(await json(await get(real, "/me", TOKENS.anna))).today).toBe(today);
  });
});

describe("GET /v1/cycle/status", () => {
  it("derives the subject's status for the frozen day", async () => {
    expect(CycleStatus.parse(await json(await get(frozen, "/cycle/status", TOKENS.anna)))).toEqual({
      subjectId: ANNA,
      date: ANNA_FROZEN_TODAY,
      cycleDay: 2,
      periodDay: 2,
      inFertileWindow: false,
    });
  });

  it("gives a status grantee the same frozen day, and audits her read on the real day", async () => {
    const status = CycleStatus.parse(
      await json(await get(frozen, `/cycle/status?subject=${ANNA}`, TOKENS.ben)),
    );
    expect(status).toEqual({
      subjectId: ANNA,
      date: ANNA_FROZEN_TODAY,
      cycleDay: 2,
      periodDay: 2,
      inFertileWindow: false,
    });
    const reads = await harness.db
      .select({ dedupeKey: schema.auditEvents.dedupeKey })
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.actorId, BEN), eq(schema.auditEvents.subjectId, ANNA)));
    expect(reads).toEqual([
      { dedupeKey: `${BEN}/${ANNA}/cycle.status/${todayIn(ANNA_ZONE, new Date())}` },
    ]);
  });

  it("reads the real day on the real clock, on the same connection straight after", async () => {
    const today = todayIn(ANNA_ZONE, new Date());
    expect(CycleStatus.parse(await json(await get(real, "/cycle/status", TOKENS.anna)))).toEqual({
      subjectId: ANNA,
      date: today,
      cycleDay: diffDays("2026-03-14", today) + 1,
      periodDay: null,
      inFertileWindow: false,
    });
  });
});

describe("GET /v1/cycle/predictions", () => {
  it("counts the days late to the frozen today, and stamps the stored row with the real time", async () => {
    const before = Date.now();
    const body = CyclePrediction.parse(
      await json(await get(frozen, "/cycle/predictions", TOKENS.anna)),
    );
    expect(body.nextPeriod?.expected).toBe(NEXT_PERIOD);
    expect(body).toMatchObject({ daysLate: 0, pointToCare: false });
    expect(new Date(body.computedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(body.computedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("counts them to the real today on the real clock", async () => {
    const daysLate = Math.max(0, diffDays(NEXT_PERIOD, todayIn(ANNA_ZONE, new Date())));
    const body = CyclePrediction.parse(
      await json(await get(real, "/cycle/predictions", TOKENS.anna)),
    );
    expect(body).toMatchObject({ daysLate, pointToCare: daysLate > 14 });
  });
});

describe("GET /v1/pregnancies/current", () => {
  it("counts the gestation to the frozen today in her zone", async () => {
    const body = Pregnancy.parse(
      await json(await get(frozen, "/pregnancies/current", TOKENS.cara)),
    );
    expect(body.gestation).toEqual({
      weeks: 10,
      days: 0,
      totalDays: 70,
      trimester: 1,
      label: "10w0d",
    });
  });

  it("counts it to the real today on the real clock", async () => {
    const expected = gestationalAge(CARA_DUE, todayIn(CARA_ZONE, new Date()));
    const body = Pregnancy.parse(await json(await get(real, "/pregnancies/current", TOKENS.cara)));
    expect(body.gestation).toEqual(expected);
  });
});

describe("GET /v1/pregnancies/{id}", () => {
  it("counts the gestation to the frozen today in her zone", async () => {
    const path = `/pregnancies/${CARA_PREGNANCY}`;
    const body = Pregnancy.parse(await json(await get(frozen, path, TOKENS.cara)));
    expect(body.gestation).toEqual(TEN_WEEKS);
  });

  it("counts it to the real today on the real clock", async () => {
    const expected = gestationalAge(CARA_DUE, todayIn(CARA_ZONE, new Date()));
    const path = `/pregnancies/${CARA_PREGNANCY}`;
    const body = Pregnancy.parse(await json(await get(real, path, TOKENS.cara)));
    expect(body.gestation).toEqual(expected);
  });
});

describe("a pregnancy overview grantee's reads", () => {
  it("count her week to the frozen today, and each one is audited on the real day", async () => {
    // One row per actor, subject, category and day: a read filed under the
    // frozen day would add a second key, so the list is checked after each.
    const filed = [`${BEN}/${CARA}/pregnancy.overview/${todayIn(CARA_ZONE, new Date())}`];
    for (const path of [`/pregnancies/current?subject=${CARA}`, `/pregnancies/${CARA_PREGNANCY}`]) {
      const view = PregnancyView.parse(await json(await get(frozen, path, TOKENS.ben)));
      expect(view).toMatchObject({ status: "active", gestation: TEN_WEEKS });
      expect(await readsFiled(BEN, CARA)).toEqual(filed);
    }
    for (const path of [
      `/pregnancies/${CARA_PREGNANCY}/events`,
      `/pregnancies/${CARA_PREGNANCY}/events/${CARA_EVENT}`,
    ]) {
      await json(await get(frozen, path, TOKENS.ben));
      expect(await readsFiled(BEN, CARA)).toEqual(filed);
    }
  });
});

describe("starting and re-dating a pregnancy", () => {
  it("counts the week each answer shows to the frozen today in her zone", async () => {
    const started = await frozen.request("/api/v1/pregnancies", {
      method: "POST",
      headers: writeHeaders(DANA_TOKEN, { [IDEMPOTENCY_KEY_HEADER]: randomUUID() }),
      body: JSON.stringify({ dating: { method: "manual", dueDate: DANA_DUE } }),
    });
    expect(started.status).toBe(201);
    const view = Pregnancy.parse(await started.json());
    expect(view.gestation).toEqual(TEN_WEEKS);
    const redated = await frozen.request(`/api/v1/pregnancies/${view.id}/dating`, {
      method: "PUT",
      headers: writeHeaders(DANA_TOKEN, { "if-match": String(view.version) }),
      body: JSON.stringify({ method: "manual", dueDate: DANA_REDATED }),
    });
    expect(Pregnancy.parse(await json(redated))).toMatchObject({
      dueDate: DANA_REDATED,
      gestation: { weeks: 11, days: 0, totalDays: 77, trimester: 1, label: "11w0d" },
    });
  });
});

describe("the milestones of a child", () => {
  it("picks the checklist for the child's age on the frozen today", async () => {
    const atFrozen = checklistFor(diffDays(BORN, ANNA_FROZEN_TODAY));
    const atReal = checklistFor(diffDays(BORN, todayIn(ANNA_ZONE, new Date())));
    expect(atFrozen?.months).toBe(2);
    expect(atReal?.months).not.toBe(2);
    const onFrozen = MilestoneChecklist.parse(
      await json(await get(frozen, `/children/${CHILD}/milestones`, TOKENS.anna)),
    );
    const onReal = MilestoneChecklist.parse(
      await json(await get(real, `/children/${CHILD}/milestones`, TOKENS.anna)),
    );
    expect(onFrozen.months).toBe(atFrozen?.months);
    expect(onReal.months).toBe(atReal?.months);
  });

  it("dates an undated check-off on the frozen today, while the row's own times stay real", async () => {
    const item = checklistFor(diffDays(BORN, ANNA_FROZEN_TODAY))?.items[0];
    expect(item).toBeDefined();
    const before = Date.now();
    const response = await frozen.request(`/api/v1/children/${CHILD}/milestones`, {
      method: "PUT",
      headers: {
        ...(sessionHeaders(TOKENS.anna) as Record<string, string>),
        origin: OWN_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ itemId: item?.id, checked: true }),
    });
    const check = MilestoneCheck.parse(await json(response));
    expect(check).toMatchObject({ id: item?.id, checked: true, checkedOn: ANNA_FROZEN_TODAY });
    const [event] = await harness.db
      .select({ date: schema.childEvents.date, createdAt: schema.childEvents.createdAt })
      .from(schema.childEvents)
      .where(eq(schema.childEvents.childId, CHILD));
    expect(event?.date).toBe(ANNA_FROZEN_TODAY);
    expect(event?.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("pinCalendar", () => {
  async function settingAfter(clock: Parameters<typeof pinCalendar>[1]): Promise<unknown> {
    return withActor(
      ANNA,
      async (tx) => {
        await pinCalendar(tx, clock);
        const result = (await tx.execute(
          sql`select current_setting('app.calendar_now', true) as value`,
        )) as { rows: { value: string | null }[] };
        return result.rows[0]?.value ?? "";
      },
      harness.db,
    );
  }

  it("hands a frozen instant to the transaction and nothing on the real clock", async () => {
    expect(await settingAfter(calendarClock({ TIDEFERN_FAKE_NOW: FROZEN }))).toBe(FROZEN);
    expect(await settingAfter(realCalendarClock)).toBe("");
  });
});
