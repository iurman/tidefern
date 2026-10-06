import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { addDays, diffDays, todayIn } from "@tidefern/core";
import { schema } from "@tidefern/db";
import {
  CycleEntry,
  CycleEntryList,
  CyclePrediction,
  CycleStatus,
  CycleVocabulary,
  Problem,
  cycleVocabulary,
} from "@tidefern/schemas";

import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../middleware/idempotency";
import type { ApiTestDatabase } from "../test/database";
import {
  ANNA,
  ANNA_TIME_ZONE,
  BEN,
  BEN_HISTORY_GRANT,
  CARA,
  CYCLE_TOKENS as T,
  DANA,
  EVE,
  GINA,
  HANA,
  createCycleFixture,
  cycleHeaders,
} from "../test/cycle";
import { PERIOD_GAP_DAYS, VERSION_MISMATCH, periodStartsFrom } from "./cycle";

let harness: ApiTestDatabase;
let app: Awaited<ReturnType<typeof createCycleFixture>>["app"];

beforeAll(async () => {
  ({ harness, app } = await createCycleFixture());
});

afterAll(async () => {
  await harness.close();
});

/* Requests ---------------------------------------------------------------- */

function put(
  token: string,
  date: string,
  body: unknown,
  options: { subject?: string; headers?: Record<string, string> } = {},
) {
  const query = options.subject === undefined ? "" : `?subject=${options.subject}`;
  return app.request(`/api/v1/cycle/entries/${date}${query}`, {
    method: "PUT",
    headers: cycleHeaders(token, options.headers),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function remove(
  token: string,
  date: string,
  options: { subject?: string; headers?: Record<string, string> } = {},
) {
  const query = options.subject === undefined ? "" : `?subject=${options.subject}`;
  return app.request(`/api/v1/cycle/entries/${date}${query}`, {
    method: "DELETE",
    headers: cycleHeaders(token, options.headers),
  });
}

function get(token: string, path: string) {
  return app.request(`/api/v1/cycle/${path}`, { headers: cycleHeaders(token) });
}

async function list(token: string, query: string): Promise<CycleEntryList> {
  const response = await get(token, `entries?${query}`);
  expect(response.status).toBe(200);
  return CycleEntryList.parse(await response.json());
}

async function prediction(token: string, subject?: string): Promise<Record<string, unknown>> {
  const response = await get(
    token,
    subject === undefined ? "predictions" : `predictions?subject=${subject}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  CyclePrediction.parse(body);
  return body;
}

async function expectProblem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body = Problem.parse(await response.json());
  expect(body.code).toBe(code);
  return body;
}

async function auditRows(actorId: string, subjectId: string) {
  return harness.db
    .select({
      action: schema.auditEvents.action,
      category: schema.auditEvents.category,
      dedupeKey: schema.auditEvents.dedupeKey,
    })
    .from(schema.auditEvents)
    .where(
      and(eq(schema.auditEvents.actorId, actorId), eq(schema.auditEvents.subjectId, subjectId)),
    )
    .orderBy(schema.auditEvents.id);
}

async function livePredictionRow(subjectId: string) {
  const [row] = await harness.db
    .select()
    .from(schema.cyclePredictions)
    .where(
      and(
        eq(schema.cyclePredictions.subjectId, subjectId),
        isNull(schema.cyclePredictions.deletedAt),
      ),
    );
  return row ?? null;
}

/** The fields a reader holding only the given categories may receive on an entry. */
const ENTRY_KEYS = ["id", "subjectId", "version", "updatedAt", "deletedAt"];
const HISTORY_FIELDS = ["date", "flow", "period"];
const SYMPTOM_FIELDS = ["symptoms", "mood"];
const SHARED_PREDICTION_FIELDS = [
  "subjectId",
  "computedAt",
  "basis",
  "cycleLength",
  "sampleSize",
  "nextPeriod",
  "ovulation",
  "fertileWindow",
  "uncertaintyDays",
  "ovulationBandDays",
];

// The regular vector of core's own tests: four starts 28 days apart.
const REGULAR = ["2026-05-01", "2026-05-29", "2026-06-26", "2026-07-24"];

/* Tests ------------------------------------------------------------------- */

describe("periodStartsFrom", () => {
  it("starts a period on the first bleeding day of each run and ignores spotting", () => {
    expect(PERIOD_GAP_DAYS).toBe(2);
    expect(
      periodStartsFrom([
        { date: "2026-05-04", flow: "light" },
        { date: "2026-05-01", flow: "heavy" },
        { date: "2026-05-02", flow: "medium" },
        { date: "2026-05-10", flow: "spotting" },
        { date: "2026-05-29", flow: "none" },
        { date: "2026-05-30", flow: "heavy" },
        { date: "2026-06-03", flow: "light" },
      ]),
    ).toEqual([{ date: "2026-05-01" }, { date: "2026-05-30" }, { date: "2026-06-03" }]);
  });
});

describe("GET /v1/cycle/vocabulary", () => {
  it("answers the pickers' lists to any signed-in actor and 401 to nobody", async () => {
    for (const token of [T.anna, T.cara]) {
      const response = await get(token, "vocabulary");
      expect(response.status).toBe(200);
      expect(CycleVocabulary.parse(await response.json())).toEqual(cycleVocabulary());
    }
    await expectProblem(await app.request("/api/v1/cycle/vocabulary"), 401, "unauthenticated");
  });
});

describe("the owner's day sheet", () => {
  it("creates a day, answers it whole with its ETag, and writes no audit row", async () => {
    const response = await put(T.anna, "2026-05-01", {
      flow: "heavy",
      symptoms: ["fatigue", "cramps"],
      mood: "low",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"1"');
    const entry = CycleEntry.parse(await response.json());
    expect(entry).toMatchObject({
      subjectId: ANNA,
      date: "2026-05-01",
      flow: "heavy",
      period: true,
      symptoms: ["cramps", "fatigue"],
      mood: "low",
      version: 1,
      deletedAt: null,
    });
    expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(await auditRows(ANNA, ANNA)).toEqual([]);
  });

  it("replaces the day on the next write and clears what was left out", async () => {
    const response = await put(
      T.anna,
      "2026-05-01",
      { flow: "medium" },
      { headers: { "if-match": '"1"' } },
    );
    expect(response.status).toBe(200);
    const entry = CycleEntry.parse(await response.json());
    expect(entry).toMatchObject({ flow: "medium", symptoms: [], mood: null, version: 2 });
    const symptoms = await harness.db
      .select()
      .from(schema.entrySymptoms)
      .where(eq(schema.entrySymptoms.entryId, entry.id));
    expect(symptoms).toEqual([]);
  });

  it("answers 409 to a stale If-Match and leaves the day alone", async () => {
    const body = await expectProblem(
      await put(T.anna, "2026-05-01", { flow: "light" }, { headers: { "if-match": "1" } }),
      409,
      "conflict",
    );
    expect(body.detail).toBe(VERSION_MISMATCH);
    const [row] = await harness.db
      .select()
      .from(schema.cycleEntries)
      .where(
        and(eq(schema.cycleEntries.subjectId, ANNA), eq(schema.cycleEntries.date, "2026-05-01")),
      );
    expect(row).toMatchObject({ flow: "medium", version: 2 });
  });

  it("refuses free text, unknown codes, impossible dates and malformed filters with 422", async () => {
    const note = await expectProblem(
      await put(T.anna, "2026-05-02", { flow: "light", note: "slept badly" }),
      422,
      "validation_failed",
    );
    expect(note.errors?.length).toBeGreaterThan(0);
    // The problem never echoes what was sent.
    expect(JSON.stringify(note)).not.toContain("slept badly");
    await expectProblem(
      await put(T.anna, "2026-05-02", { flow: "torrential" }),
      422,
      "validation_failed",
    );
    await expectProblem(
      await put(T.anna, "2026-05-02", { symptoms: ["cramps", "cramps"] }),
      422,
      "validation_failed",
    );
    await expectProblem(
      await put(T.anna, "2026-02-30", { flow: "light" }),
      422,
      "validation_failed",
    );
    const backwards = await expectProblem(
      await get(T.anna, "entries?from=2026-06-01&to=2026-05-01"),
      422,
      "validation_failed",
    );
    expect(backwards.errors).toEqual([{ path: "to", message: "Must not be before from." }]);
    await expectProblem(await get(T.anna, "entries?limit=0"), 422, "validation_failed");
    await expectProblem(await get(T.anna, "entries?limit=201"), 422, "validation_failed");
    await expectProblem(
      await get(T.anna, "entries?cursor=bm90LWEtY3Vyc29y"),
      422,
      "validation_failed",
    );
    await expectProblem(await get(T.anna, "entries?subject=someone"), 422, "validation_failed");
    expect(
      await harness.db
        .select()
        .from(schema.cycleEntries)
        .where(
          and(eq(schema.cycleEntries.subjectId, ANNA), eq(schema.cycleEntries.date, "2026-05-02")),
        ),
    ).toEqual([]);
  });

  it("replays a write sent twice with one Idempotency-Key instead of running it again", async () => {
    const key = "018f5e7a-3000-7000-8000-00000000e501";
    const first = await put(
      T.anna,
      "2026-05-29",
      { flow: "heavy", mood: "steady" },
      { headers: { [IDEMPOTENCY_KEY_HEADER]: key } },
    );
    expect(first.status).toBe(200);
    const created = CycleEntry.parse(await first.json());
    const again = await put(
      T.anna,
      "2026-05-29",
      { flow: "heavy", mood: "steady" },
      { headers: { [IDEMPOTENCY_KEY_HEADER]: key } },
    );
    expect(again.status).toBe(200);
    expect(again.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await again.json()).toEqual({ id: created.id });
    const rows = await harness.db
      .select()
      .from(schema.cycleEntries)
      .where(
        and(eq(schema.cycleEntries.subjectId, ANNA), eq(schema.cycleEntries.date, "2026-05-29")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
  });

  it("lists the days oldest first in pages with an opaque cursor", async () => {
    for (const date of REGULAR.slice(2)) {
      expect((await put(T.anna, date, { flow: "heavy" })).status).toBe(200);
    }
    const first = await list(T.anna, "from=2026-05-01&to=2026-07-31&limit=2");
    expect(first.items.map((item) => item.date)).toEqual(["2026-05-01", "2026-05-29"]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await list(
      T.anna,
      `from=2026-05-01&to=2026-07-31&limit=2&cursor=${first.nextCursor}`,
    );
    expect(second.items.map((item) => item.date)).toEqual(["2026-06-26", "2026-07-24"]);
    expect(second.nextCursor).toBeNull();
    const ranged = await list(T.anna, "from=2026-05-02&to=2026-06-30");
    expect(ranged.items.map((item) => item.date)).toEqual(["2026-05-29", "2026-06-26"]);
  });

  it("deletes a day to a content-free tombstone that a sync list still carries", async () => {
    expect((await put(T.anna, "2026-08-02", { flow: "spotting", symptoms: ["acne"] })).status).toBe(
      200,
    );
    const before = new Date(Date.now() - 1000).toISOString();
    await expectProblem(
      await remove(T.anna, "2026-08-02", { headers: { "if-match": "7" } }),
      409,
      "conflict",
    );
    const deleted = await remove(T.anna, "2026-08-02", { headers: { "if-match": "1" } });
    expect(deleted.status).toBe(204);
    await expectProblem(await remove(T.anna, "2026-08-02"), 404, "not_found");

    const live = await list(T.anna, "from=2026-08-01&to=2026-08-31");
    expect(live.items).toEqual([]);
    const synced = await list(T.anna, `updatedSince=${before}`);
    const tombstone = synced.items.find((item) => item.date === "2026-08-02");
    expect(tombstone?.deletedAt).not.toBeNull();
    expect(tombstone?.version).toBe(2);
    expect(Object.keys(tombstone ?? {}).sort()).toEqual([...ENTRY_KEYS, "date"].sort());
    const [row] = await harness.db
      .select()
      .from(schema.cycleEntries)
      .where(
        and(eq(schema.cycleEntries.subjectId, ANNA), eq(schema.cycleEntries.date, "2026-08-02")),
      );
    expect(row).toMatchObject({ flow: null, mood: null });
    expect(
      await harness.db
        .select()
        .from(schema.entrySymptoms)
        .where(eq(schema.entrySymptoms.subjectId, ANNA)),
    ).toEqual([]);
  });
});

describe("GET /v1/cycle/predictions for the owner", () => {
  it("predicts from the logged starts through core, with the counts the copy needs", async () => {
    // A bleeding run does not start a second period, and spotting starts none.
    expect((await put(T.anna, "2026-05-02", { flow: "medium" })).status).toBe(200);
    expect((await put(T.anna, "2026-06-05", { flow: "spotting" })).status).toBe(200);
    const body = await prediction(T.anna);
    const today = todayIn(ANNA_TIME_ZONE);
    expect(body).toMatchObject({
      subjectId: ANNA,
      basis: "estimate",
      cycleLength: 28,
      sampleSize: 3,
      nextPeriod: { expected: "2026-08-21", start: "2026-08-19", end: "2026-08-23" },
      ovulation: { expected: "2026-08-07", start: "2026-08-05", end: "2026-08-09" },
      fertileWindow: { start: "2026-08-02", end: "2026-08-07" },
      uncertaintyDays: 2,
      ovulationBandDays: 2,
      irregular: false,
      periodsLogged: 4,
      cycleLengthRange: { min: 28, max: 28 },
      daysLate: Math.max(0, diffDays("2026-08-21", today)),
      pointToCare: diffDays("2026-08-21", today) > 14,
    });
    const row = await livePredictionRow(ANNA);
    expect(row).toMatchObject({
      basis: "estimate",
      nextPeriodStart: "2026-08-21",
      ovulation: "2026-08-07",
      fertileWindowStart: "2026-08-02",
      fertileWindowEnd: "2026-08-07",
      sampleSize: 3,
    });
  });

  it("keeps one live cache row and changes it only when the facts change", async () => {
    const before = await livePredictionRow(ANNA);
    await prediction(T.anna);
    expect((await livePredictionRow(ANNA))?.version).toBe(before?.version);
    expect((await put(T.anna, "2026-07-24", { flow: "light" })).status).toBe(200);
    expect((await livePredictionRow(ANNA))?.version).toBe(before?.version);
  });

  it("offers no date during a pregnancy, and after one ends only from a later period", async () => {
    expect(await prediction(T.hana)).toMatchObject({ basis: "none", nextPeriod: null });
    for (const date of ["2026-04-01", "2026-04-29", "2026-07-01"]) {
      expect((await put(T.gina, date, { flow: "heavy" })).status).toBe(200);
    }
    const body = await prediction(T.gina);
    expect(body).toMatchObject({
      subjectId: GINA,
      basis: "first_guess",
      sampleSize: 0,
      periodsLogged: 1,
      nextPeriod: { expected: "2026-07-29" },
      uncertaintyDays: 5,
    });
    expect(await prediction(T.cara)).toMatchObject({
      basis: "none",
      nextPeriod: null,
      fertileWindow: null,
      periodsLogged: 0,
    });
  });
});

describe("what a grantee receives", () => {
  it("projects a read grant on history to dates and flow, and audits the read once a day", async () => {
    const page = await list(T.ben, `subject=${ANNA}&from=2026-05-01&to=2026-05-31`);
    expect(page.items.map((item) => item.date)).toEqual(["2026-05-01", "2026-05-02", "2026-05-29"]);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual([...ENTRY_KEYS, ...HISTORY_FIELDS].sort());
      for (const field of SYMPTOM_FIELDS) expect(item).not.toHaveProperty(field);
    }
    await list(T.ben, `subject=${ANNA}`);
    const rows = await auditRows(BEN, ANNA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "partner.read", category: "cycle.history" });
  });

  it("projects a read grant on symptoms to symptoms and mood, never a date", async () => {
    const page = await list(T.dana, `subject=${ANNA}`);
    expect(page.items.length).toBeGreaterThan(0);
    const mood = page.items.find((item) => item.mood === "steady");
    expect(mood).toBeDefined();
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual([...ENTRY_KEYS, ...SYMPTOM_FIELDS].sort());
      for (const field of HISTORY_FIELDS) expect(item).not.toHaveProperty(field);
    }
    const audited = await auditRows(DANA, ANNA);
    expect(audited.map((row) => row.category)).toEqual(["cycle.symptoms"]);
  });

  it("gives a summary or read grantee the shared prediction and never the owner's extras", async () => {
    for (const token of [T.ben, T.dana, T.ivy]) {
      const body = await prediction(token, ANNA);
      expect(Object.keys(body).sort()).toEqual([...SHARED_PREDICTION_FIELDS].sort());
      expect(body).toMatchObject({ basis: "estimate", nextPeriod: { expected: "2026-08-21" } });
    }
    expect((await auditRows(DANA, ANNA)).map((row) => row.category).sort()).toEqual([
      "cycle.history",
      "cycle.symptoms",
    ]);
  });

  it("answers 404 to a summary grantee asking for entries, and to the uninvited", async () => {
    await expectProblem(await get(T.ivy, `entries?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.cara, `entries?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.cara, `predictions?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.cara, `status?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.dana, `status?subject=${ANNA}`), 404, "not_found");
    await expectProblem(
      await put(T.cara, "2026-09-01", { flow: "heavy" }, { subject: ANNA }),
      404,
      "not_found",
    );
    await expectProblem(await remove(T.ben, "2026-05-01", { subject: ANNA }), 404, "not_found");
    expect(await auditRows(CARA, ANNA)).toEqual([]);
  });

  it("answers 404 on a revoked grant, whether revoked long ago or a moment ago", async () => {
    await expectProblem(await get(T.finn, `entries?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.finn, `predictions?subject=${ANNA}`), 404, "not_found");
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, BEN_HISTORY_GRANT));
    await expectProblem(await get(T.ben, `entries?subject=${ANNA}`), 404, "not_found");
    await expectProblem(await get(T.ben, `predictions?subject=${ANNA}`), 404, "not_found");
  });
});

describe("a contributor's writes", () => {
  it("writes only the symptoms she may write, keeps the owner's flow, and audits the write", async () => {
    const response = await put(
      T.eve,
      "2026-05-29",
      { symptoms: ["headache"], mood: "bright" },
      { subject: ANNA },
    );
    expect(response.status).toBe(200);
    const entry = CycleEntry.parse(await response.json());
    expect(Object.keys(entry).sort()).toEqual([...ENTRY_KEYS, ...SYMPTOM_FIELDS].sort());
    expect(entry).toMatchObject({ symptoms: ["headache"], mood: "bright", version: 2 });
    const [row] = await harness.db
      .select()
      .from(schema.cycleEntries)
      .where(
        and(eq(schema.cycleEntries.subjectId, ANNA), eq(schema.cycleEntries.date, "2026-05-29")),
      );
    expect(row).toMatchObject({ flow: "heavy", mood: "bright" });
    const rows = await auditRows(EVE, ANNA);
    expect(rows).toEqual([
      { action: "partner.write", category: "cycle.symptoms", dedupeKey: null },
    ]);
  });

  it("answers 404 when she sends a field outside her grant, and to a delete", async () => {
    await expectProblem(
      await put(T.eve, "2026-05-29", { flow: "light" }, { subject: ANNA }),
      404,
      "not_found",
    );
    await expectProblem(await remove(T.eve, "2026-05-29", { subject: ANNA }), 404, "not_found");
  });

  it("never predicts through a pregnancy the contributor cannot see", async () => {
    const response = await put(T.eve, "2026-09-01", { flow: "heavy" }, { subject: HANA });
    expect(response.status).toBe(200);
    expect(await livePredictionRow(HANA)).toBeNull();
    expect(await prediction(T.hana)).toMatchObject({ basis: "none", nextPeriod: null });
    expect((await auditRows(EVE, HANA)).map((row) => row.category)).toEqual(["cycle.history"]);
  });
});

describe("GET /v1/cycle/status", () => {
  it("derives the day of the cycle and of the period for today in her zone", async () => {
    const today = todayIn(ANNA_TIME_ZONE);
    expect((await put(T.anna, addDays(today, -1), { flow: "heavy" })).status).toBe(200);
    expect((await put(T.anna, today, { flow: "medium", symptoms: ["cramps"] })).status).toBe(200);
    const own = await get(T.anna, "status");
    expect(own.status).toBe(200);
    expect(CycleStatus.parse(await own.json())).toEqual({
      subjectId: ANNA,
      date: today,
      cycleDay: 2,
      periodDay: 2,
      inFertileWindow: false,
    });
  });

  it("gives a status grantee the derived facts only and audits the read", async () => {
    const response = await get(T.ben, `status?subject=${ANNA}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["subjectId", "date", "cycleDay", "periodDay", "inFertileWindow"].sort(),
    );
    expect(body).toMatchObject({ cycleDay: 2, periodDay: 2 });
    const rows = await auditRows(BEN, ANNA);
    expect(rows.map((row) => row.category)).toContain("cycle.status");
  });

  it("answers null days when nothing is logged", async () => {
    const response = await get(T.cara, "status");
    expect(CycleStatus.parse(await response.json())).toMatchObject({
      subjectId: CARA,
      cycleDay: null,
      periodDay: null,
      inFertileWindow: false,
    });
  });
});
