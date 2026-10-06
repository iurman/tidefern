import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { addDays, diffDays, todayIn } from "@tidefern/core";
import { schema, withActor } from "@tidefern/db";
import {
  CycleEntry,
  CycleEntryList,
  CycleEntryWrite,
  CyclePrediction,
  CycleStatus,
  CycleVocabulary,
  FLOW_CODES,
  FLOW_LABELS,
  FlowLevel,
  MOOD_CODES,
  MOOD_LABELS,
  MoodCode,
  PERIOD_FLOWS,
  Problem,
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  SymptomCode,
  cycleVocabulary,
  isPeriodFlow,
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
  IVY,
  createCycleFixture,
  cycleHeaders,
} from "../test/cycle";
import {
  PERIOD_GAP_DAYS,
  VERSION_MISMATCH,
  computePrediction,
  factsOf,
  periodStartsFrom,
} from "./cycle";
import type { PredictionFacts } from "./cycle";

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

/** Ben's status card on Anna, as the cycle fixture files it. */
const BEN_STATUS_GRANT = "018f5e7a-2000-7000-8000-00000000e302";

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

  it("never lets a symptoms reader recover a date through her cursor or a date filter", async () => {
    const all = await list(T.dana, `subject=${ANNA}`);
    const ids = all.items.map((item) => item.id);
    // Her list is in id order, so its order says nothing about the days.
    expect(ids).toEqual([...ids].sort());
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? "limit=1" : `limit=1&cursor=${cursor}`;
      const page = await list(T.dana, `subject=${ANNA}&${query}`);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (cursor !== null) {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as object;
        expect(Object.keys(decoded)).toEqual(["i"]);
        expect(JSON.stringify(decoded)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      }
    } while (cursor !== null);
    expect(seen).toEqual(ids);

    const oneDay = await expectProblem(
      await get(T.dana, `entries?subject=${ANNA}&from=2026-05-29&to=2026-05-29`),
      422,
      "validation_failed",
    );
    expect(oneDay.errors).toEqual([
      { path: "from", message: "Date filters need the cycle history." },
    ]);
    await expectProblem(
      await get(T.dana, `entries?subject=${ANNA}&to=2026-05-29`),
      422,
      "validation_failed",
    );
    // A dated cursor crafted by hand is refused, so it cannot probe days either.
    const crafted = Buffer.from(
      JSON.stringify({ d: "2026-05-28", i: "00000000-0000-7000-8000-000000000000" }),
      "utf8",
    ).toString("base64url");
    await expectProblem(
      await get(T.dana, `entries?subject=${ANNA}&cursor=${crafted}`),
      422,
      "validation_failed",
    );
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
    // Her own read serves the stored row and computes nothing: there is none.
    const shared = await prediction(T.eve, HANA);
    expect(Object.keys(shared).sort()).toEqual([...SHARED_PREDICTION_FIELDS].sort());
    expect(shared).toMatchObject({ basis: "none", nextPeriod: null, fertileWindow: null });
    expect(await livePredictionRow(HANA)).toBeNull();
    expect(await prediction(T.hana)).toMatchObject({ basis: "none", nextPeriod: null });
    expect((await auditRows(EVE, HANA)).map((row) => row.category)).toEqual([
      "cycle.history",
      "cycle.history",
    ]);
    expect((await auditRows(EVE, HANA)).map((row) => row.action)).toEqual([
      "partner.write",
      "partner.read",
    ]);
  });

  it("refreshes the stored prediction on a contributor's period write, through a pregnancy she cannot see", async () => {
    // Cara contributes to Gina's history and holds nothing on her pregnancy,
    // which ended on GINA_ENDED_AT: only the periods after it count, and the
    // first estimate after it carries five days of uncertainty.
    await harness.db.insert(schema.grants).values({
      id: "018f5e7a-2000-7000-8000-00000000e309",
      ownerId: GINA,
      granteeId: CARA,
      category: "cycle.history",
      level: "contribute",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    const before = await livePredictionRow(GINA);
    expect(before).toMatchObject({ basis: "first_guess", nextPeriodStart: "2026-07-29" });
    const response = await put(T.cara, "2026-07-30", { flow: "heavy" }, { subject: GINA });
    expect(response.status).toBe(200);
    const after = await livePredictionRow(GINA);
    expect(after).toMatchObject({
      id: before?.id,
      basis: "estimate",
      cycleLength: 29,
      sampleSize: 1,
      nextPeriodStart: "2026-08-28",
      uncertaintyDays: 5,
      version: (before?.version ?? 0) + 1,
    });
    // Her own read recomputes through core and finds nothing to change: the
    // database refresh and core agree on the facts.
    await prediction(T.gina);
    expect(await livePredictionRow(GINA)).toEqual(after);
    expect((await auditRows(CARA, GINA)).map((row) => row.action)).toEqual(["partner.write"]);
  });

  it("answers 404 and keeps nothing when the contribute grant is revoked during the write", async () => {
    // Eve's grant on Hana's history is active when the route checks it, and
    // a trigger revokes it once her entry and her audit row are written,
    // before the database re-checks it in refresh_cycle_prediction().
    const grantId = "018f5e7a-2000-7000-8000-00000000e308";
    const date = "2026-09-20";
    await harness.db.execute(
      sql.raw(`create function b14_revoke_during_write() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
        begin
          update grants set revoked_at = now() where id = '${grantId}';
          return new;
        end
      $$`),
    );
    await harness.db.execute(
      sql.raw(`create trigger b14_revoke_during_write after insert on audit_events
        for each row when (new.actor_id = '${EVE}' and new.subject_id = '${HANA}' and new.action = 'partner.write')
        execute function b14_revoke_during_write()`),
    );
    try {
      const audits = await auditRows(EVE, HANA);
      const prediction = await livePredictionRow(HANA);
      await expectProblem(
        await put(T.eve, date, { flow: "heavy" }, { subject: HANA }),
        404,
        "not_found",
      );
      const written = await harness.db
        .select()
        .from(schema.cycleEntries)
        .where(and(eq(schema.cycleEntries.subjectId, HANA), eq(schema.cycleEntries.date, date)));
      expect(written).toEqual([]);
      expect(await auditRows(EVE, HANA)).toEqual(audits);
      expect(await livePredictionRow(HANA)).toEqual(prediction);
      // The revocation rolled back with the write; the grant is still live.
      const [grant] = await harness.db
        .select({ revokedAt: schema.grants.revokedAt })
        .from(schema.grants)
        .where(eq(schema.grants.id, grantId));
      expect(grant?.revokedAt).toBeNull();
    } finally {
      await harness.db.execute(sql`drop trigger b14_revoke_during_write on audit_events`);
      await harness.db.execute(sql`drop function b14_revoke_during_write()`);
    }
  });

  it("never touches the stored prediction on a symptoms contributor's write or a grantee's read", async () => {
    const before = await livePredictionRow(ANNA);
    expect(before).not.toBeNull();
    // Eve writes symptoms only; nothing she may write moves the prediction,
    // and a grantee's read never touches the stored row.
    expect(
      (await put(T.eve, "2026-07-24", { symptoms: ["bloating"] }, { subject: ANNA })).status,
    ).toBe(200);
    await prediction(T.ivy, ANNA);
    expect(await livePredictionRow(ANNA)).toEqual(before);
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
    // Ben's history grant was revoked above; he still holds the status card,
    // and his own transaction reaches none of the rows the status rests on.
    const own = CycleStatus.parse(await (await get(T.anna, "status")).json());
    const before = await auditRows(BEN, ANNA);
    const response = await get(T.ben, `status?subject=${ANNA}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["subjectId", "date", "cycleDay", "periodDay", "inFertileWindow"].sort(),
    );
    expect(body).toEqual(own);
    expect(own).toMatchObject({ cycleDay: 2, periodDay: 2 });
    const rows = await auditRows(BEN, ANNA);
    expect(rows.slice(before.length)).toEqual([
      expect.objectContaining({ action: "partner.read", category: "cycle.status" }),
    ]);
    // A second read the same day is collapsed into the same audit row.
    expect((await get(T.ben, `status?subject=${ANNA}`)).status).toBe(200);
    expect(await auditRows(BEN, ANNA)).toEqual(rows);
    // His own transaction still reads none of her rows.
    const reached = await withActor(
      BEN,
      async (tx) => ({
        entries: await tx
          .select()
          .from(schema.cycleEntries)
          .where(eq(schema.cycleEntries.subjectId, ANNA)),
        predictions: await tx
          .select()
          .from(schema.cyclePredictions)
          .where(eq(schema.cyclePredictions.subjectId, ANNA)),
      }),
      harness.db,
    );
    expect(reached).toEqual({ entries: [], predictions: [] });
  });

  it("answers 404 to a revoked status grant and to a history reader without one, auditing nothing", async () => {
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, BEN_STATUS_GRANT));
    const before = await auditRows(BEN, ANNA);
    await expectProblem(await get(T.ben, `status?subject=${ANNA}`), 404, "not_found");
    expect(await auditRows(BEN, ANNA)).toEqual(before);
    const ivy = await auditRows(IVY, ANNA);
    await expectProblem(await get(T.ivy, `status?subject=${ANNA}`), 404, "not_found");
    expect(await auditRows(IVY, ANNA)).toEqual(ivy);
  });

  it("gives a status grantee no day count while a pregnancy continues, and the subject hers", async () => {
    // Hana is pregnant, filed under pregnancy.overview, which Dana does not
    // hold: a cycle day counted through the pregnancy would tell her.
    await harness.db.insert(schema.grants).values({
      id: "018f5e7a-2000-7000-8000-00000000e310",
      ownerId: HANA,
      granteeId: DANA,
      category: "cycle.status",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    expect((await put(T.hana, addDays(todayIn("UTC"), -5), { flow: "heavy" })).status).toBe(200);
    const own = CycleStatus.parse(await (await get(T.hana, "status")).json());
    expect(own.cycleDay).not.toBeNull();
    const before = await auditRows(DANA, HANA);
    const response = await get(T.dana, `status?subject=${HANA}`);
    expect(response.status).toBe(200);
    expect(CycleStatus.parse(await response.json())).toEqual({
      subjectId: HANA,
      date: own.date,
      cycleDay: null,
      periodDay: null,
      inFertileWindow: false,
    });
    expect((await auditRows(DANA, HANA)).slice(before.length)).toEqual([
      expect.objectContaining({ action: "partner.read", category: "cycle.status" }),
    ]);
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

/*
 * Task B14: the prediction in migration 0010 (`cycle_prediction_facts()`,
 * which the contributor refresh and the status use) is a second
 * implementation of core's predictCycle and of periodStartsFrom. This sweep
 * gives both the same rows for many synthetic subjects, with runs that
 * touch PERIOD_GAP_DAYS from both sides, implausible gaps, spotting, ended
 * and continuing pregnancies, and asserts the same facts, so neither side
 * can change alone.
 */

/** A small deterministic generator, so a failure names a reproducible case. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const FLOWS_FOR_SWEEP: FlowLevel[] = ["spotting", "light", "medium", "heavy", "none"];

interface SweepCase {
  subjectId: string;
  days: { date: string; flow: FlowLevel }[];
  pregnancy: { endedAt: string | null } | null;
}

function sweepCases(count: number): SweepCase[] {
  const cases: SweepCase[] = [];
  for (let n = 0; n < count; n += 1) {
    const next = generator(n + 1);
    const pick = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
    const days: { date: string; flow: FlowLevel }[] = [];
    let start = addDays("2025-01-01", pick(0, 30));
    const periods = pick(0, 9);
    for (let p = 0; p < periods; p += 1) {
      // Bleeding days with gaps of one to four days, so runs split and
      // join on both sides of PERIOD_GAP_DAYS.
      let day = start;
      const length = pick(1, 6);
      for (let d = 0; d < length; d += 1) {
        days.push({ date: day, flow: FLOWS_FOR_SWEEP[pick(0, 3)] ?? "heavy" });
        day = addDays(day, pick(1, 4));
      }
      if (next() < 0.3) days.push({ date: addDays(day, pick(3, 8)), flow: "spotting" });
      // Mostly plausible cycles, some too short or too long to count.
      start = addDays(start, next() < 0.8 ? pick(21, 45) : pick(8, 70));
    }
    const unique = new Map(days.map((day) => [day.date, day]));
    const roll = next();
    const sorted = [...unique.keys()].sort();
    const middle = sorted[Math.floor(sorted.length / 2)] ?? "2025-03-01";
    const pregnancy =
      roll < 0.2
        ? { endedAt: null }
        : roll < 0.5
          ? { endedAt: addDays(middle, pick(-3, 3)) }
          : null;
    cases.push({
      subjectId: `018f5e7a-3000-7000-8000-${(n + 1).toString(16).padStart(12, "0")}`,
      days: [...unique.values()],
      pregnancy,
    });
  }
  return cases;
}

async function databaseFacts(subjectId: string): Promise<PredictionFacts> {
  const result = (await harness.db.execute(
    sql`select f.basis::text as basis, f.cycle_length, f.sample_size, to_char(f.next_period_start, 'YYYY-MM-DD') as next_period_start, to_char(f.ovulation, 'YYYY-MM-DD') as ovulation, to_char(f.fertile_window_start, 'YYYY-MM-DD') as fertile_window_start, to_char(f.fertile_window_end, 'YYYY-MM-DD') as fertile_window_end, f.uncertainty_days, f.ovulation_band_days from cycle_prediction_facts(${subjectId}::uuid) f`,
  )) as { rows: Record<string, unknown>[] };
  const [row] = result.rows;
  if (row === undefined) return factsOf(null);
  return {
    basis: row["basis"] as PredictionFacts["basis"],
    cycleLength: row["cycle_length"] as number | null,
    sampleSize: row["sample_size"] as number,
    nextPeriodStart: row["next_period_start"] as string | null,
    ovulation: row["ovulation"] as string | null,
    fertileWindowStart: row["fertile_window_start"] as string | null,
    fertileWindowEnd: row["fertile_window_end"] as string | null,
    uncertaintyDays: row["uncertainty_days"] as number,
    ovulationBandDays: row["ovulation_band_days"] as number,
  };
}

describe("the database prediction (migration 0010) against core", () => {
  const cases = sweepCases(60);

  beforeAll(async () => {
    await harness.db.insert(schema.user).values(
      cases.map((item, index) => ({
        id: item.subjectId,
        name: "sweep",
        email: `sweep-${index}@example.com`,
        emailVerified: true,
      })),
    );
    for (const [caseIndex, item] of cases.entries()) {
      if (item.days.length > 0) {
        await harness.db.insert(schema.cycleEntries).values(
          item.days.map((day, index) => ({
            id: `018f5e7a-3001-7000-8000-${(caseIndex * 100 + index + 1).toString(16).padStart(12, "0")}`,
            subjectId: item.subjectId,
            date: day.date,
            flow: day.flow,
          })),
        );
      }
      if (item.pregnancy !== null) {
        await harness.db.insert(schema.pregnancies).values({
          id: item.subjectId.replace("-3000-", "-3002-"),
          subjectId: item.subjectId,
          dueDate: "2026-12-01",
          datingMethod: "lmp",
          endedAt: item.pregnancy.endedAt,
          endedReason: item.pregnancy.endedAt === null ? null : "other",
        });
      }
    }
  });

  it("covers every basis, both sides of the gap tolerance and both pregnancy rules", () => {
    const gaps = new Set<number>();
    for (const item of cases) {
      const dates = item.days.map((day) => day.date).sort();
      for (let i = 1; i < dates.length; i += 1) {
        gaps.add(diffDays(dates[i - 1] ?? "", dates[i] ?? ""));
      }
    }
    expect(gaps.has(PERIOD_GAP_DAYS)).toBe(true);
    expect(gaps.has(PERIOD_GAP_DAYS + 1)).toBe(true);
    expect(cases.some((item) => item.pregnancy?.endedAt === null)).toBe(true);
    expect(cases.some((item) => typeof item.pregnancy?.endedAt === "string")).toBe(true);
  });

  it("gives the same facts as core for every subject", async () => {
    const bases = new Set<string>();
    for (const item of cases) {
      const computed = await withActor(
        item.subjectId,
        (tx) => computePrediction(tx, item.subjectId),
        harness.db,
      );
      const expected = factsOf(computed.prediction);
      bases.add(expected.basis);
      expect({ subject: item.subjectId, ...(await databaseFacts(item.subjectId)) }).toEqual({
        subject: item.subjectId,
        ...expected,
      });
    }
    expect([...bases].sort()).toEqual(
      ["estimate", "first_guess", "none", "not_enough_regular_cycles"].sort(),
    );
  });
});

/*
 * The schemas in packages/schemas/src/cycle.ts. They run here because the
 * schemas package has no test runner on main; the lead request in the E3
 * report asks for one, after which these move next to the schemas.
 */

describe("the cycle vocabulary", () => {
  it("lists exactly the index enums, in their order, each with a label", () => {
    expect(FLOW_CODES).toEqual(FlowLevel.options);
    expect(SYMPTOM_CODES).toEqual(SymptomCode.options);
    expect(MOOD_CODES).toEqual(MoodCode.options);
    for (const code of FlowLevel.options) expect(FLOW_LABELS[code]).toMatch(/^[A-Z]/);
    for (const code of SymptomCode.options) expect(SYMPTOM_LABELS[code]).toMatch(/^[A-Z]/);
    for (const code of MoodCode.options) expect(MOOD_LABELS[code]).toMatch(/^[A-Z]/);
  });

  it("answers the pickers' lists with codes and labels", () => {
    const vocabulary = cycleVocabulary();
    expect(vocabulary.flow.map((item) => item.code)).toEqual(FlowLevel.options);
    expect(vocabulary.symptoms.map((item) => item.code)).toEqual(SymptomCode.options);
    expect(vocabulary.moods.map((item) => item.code)).toEqual(MoodCode.options);
    expect(vocabulary.symptoms.find((item) => item.code === "tender_breasts")?.label).toBe(
      "Tender breasts",
    );
    const labels = [...vocabulary.flow, ...vocabulary.symptoms, ...vocabulary.moods];
    for (const item of labels) expect(item.label).not.toContain("\u2014");
  });

  it("counts light, medium and heavy as period days and nothing else", () => {
    expect(PERIOD_FLOWS).toEqual(["light", "medium", "heavy"]);
    expect(isPeriodFlow("medium")).toBe(true);
    expect(isPeriodFlow("spotting")).toBe(false);
    expect(isPeriodFlow("none")).toBe(false);
    expect(isPeriodFlow(null)).toBe(false);
    expect(isPeriodFlow(undefined)).toBe(false);
  });
});

describe("CycleEntryWrite", () => {
  it("accepts vocabulary values and an empty body", () => {
    expect(CycleEntryWrite.parse({})).toEqual({});
    expect(
      CycleEntryWrite.parse({ flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" }),
    ).toEqual({ flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" });
    expect(CycleEntryWrite.parse({ flow: null, mood: null })).toEqual({ flow: null, mood: null });
  });

  it("refuses free text, unknown keys, unknown codes and a repeated symptom", () => {
    expect(CycleEntryWrite.safeParse({ note: "slept badly" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ flow: "torrential" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ symptoms: ["cramps", "cramps"] }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ mood: "happy" }).success).toBe(false);
    expect(CycleEntryWrite.safeParse({ symptoms: "cramps" }).success).toBe(false);
  });
});

describe("the cycle response shapes", () => {
  const instant = "2026-10-05T12:00:00.000Z";
  const id = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";

  it("allow a projected entry with only the keys and the sync facts", () => {
    expect(
      CycleEntry.safeParse({ id, subjectId: id, version: 2, updatedAt: instant, deletedAt: null })
        .success,
    ).toBe(true);
    expect(
      CycleEntry.safeParse({
        id,
        subjectId: id,
        date: "2026-02-30",
        version: 1,
        updatedAt: instant,
        deletedAt: null,
      }).success,
    ).toBe(false);
  });

  it("allow a prediction without the owner only fields", () => {
    const shared = {
      subjectId: id,
      computedAt: instant,
      basis: "estimate",
      cycleLength: 28,
      sampleSize: 3,
      nextPeriod: { expected: "2026-08-21", start: "2026-08-19", end: "2026-08-23" },
      ovulation: { expected: "2026-08-07", start: "2026-08-05", end: "2026-08-09" },
      fertileWindow: { start: "2026-08-02", end: "2026-08-07" },
      uncertaintyDays: 2,
      ovulationBandDays: 2,
    };
    expect(CyclePrediction.safeParse(shared).success).toBe(true);
    expect(CyclePrediction.safeParse({ ...shared, basis: "guess" }).success).toBe(false);
  });

  it("keep the status to the derived facts", () => {
    expect(
      CycleStatus.parse({
        subjectId: id,
        date: "2026-10-05",
        cycleDay: 3,
        periodDay: 3,
        inFertileWindow: false,
      }).cycleDay,
    ).toBe(3);
    expect(CycleStatus.safeParse({ subjectId: id, date: "2026-10-05" }).success).toBe(false);
  });
});
