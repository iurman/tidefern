import { createApiClient } from "@tidefern/api-client";
import type { CycleEntry, CyclePrediction, Note } from "@tidefern/schemas";
import { describe, expect, it, vi } from "vitest";

// The loader is server-only; under Vitest the guard module has nothing to guard.
vi.mock("server-only", () => ({}));

const { loadCalendar } = await import("./load");

const subjectId = "018f5e7a-5eed-7000-8000-000000000001";
const span = { from: "2026-09-28", to: "2026-11-01" };

const entry: CycleEntry = {
  id: "018f5e7a-5eed-7010-8000-000000000001",
  subjectId,
  date: "2026-10-04",
  flow: "heavy",
  period: true,
  symptoms: ["cramps"],
  mood: null,
  version: 2,
  updatedAt: "2026-10-04T08:00:00.000Z",
  deletedAt: null,
};

function note(date: string, body: string): Note {
  return {
    id: `018f5e7a-5eed-7040-8000-${date.replaceAll("-", "").padStart(12, "0")}`,
    subjectId,
    authorId: subjectId,
    category: "journal.private",
    date,
    body,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    version: 1,
  };
}

const prediction: CyclePrediction = {
  subjectId,
  computedAt: "2026-10-05T06:00:00.000Z",
  basis: "none",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 0,
  ovulationBandDays: 2,
};

type Answer = Response | "network-error";

/** Routes "METHOD /path" to answers served in order, and records every request's query. */
function fakeApi(routes: Record<string, Answer[]>) {
  const calls: string[] = [];
  const queues = new Map(Object.entries(routes).map(([key, answers]) => [key, [...answers]]));
  const client = createApiClient({
    baseUrl: "http://tidefern.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.pathname}${url.search}`);
      const next = queues.get(`${request.method} ${url.pathname}`)?.shift();
      if (next === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
      if (next === "network-error") throw new TypeError("Failed to fetch");
      return next;
    },
  });
  return { client, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const page = <T>(items: T[], nextCursor: string | null = null) => json({ items, nextCursor });

describe("loadCalendar", () => {
  it("reads the span's entries and notes by date, and the prediction, with nothing else in the queries", async () => {
    const { client, calls } = fakeApi({
      "GET /api/v1/cycle/entries": [page([entry])],
      "GET /api/v1/notes": [page([note("2026-10-04", "Slept badly.")])],
      "GET /api/v1/cycle/predictions": [json(prediction)],
    });
    const load = await loadCalendar(client, span, { children: false });
    expect(load).toEqual({
      ok: true,
      days: [{ date: "2026-10-04", flow: "heavy", symptoms: ["cramps"], mood: null, note: true }],
      prediction,
      children: null,
    });
    expect(calls.sort()).toEqual([
      "GET /api/v1/cycle/entries?from=2026-09-28&to=2026-11-01&limit=200",
      "GET /api/v1/cycle/predictions",
      "GET /api/v1/notes?from=2026-09-28&to=2026-11-01&limit=200",
    ]);
  });

  it("keeps only the fact that a note sits on a day, never its text", async () => {
    const { client } = fakeApi({
      "GET /api/v1/cycle/entries": [page([])],
      "GET /api/v1/notes": [page([note("2026-10-02", "Something private.")])],
      "GET /api/v1/cycle/predictions": [json(prediction)],
    });
    const load = await loadCalendar(client, span, { children: false });
    expect(JSON.stringify(load)).not.toContain("Something private.");
  });

  it("follows the cursor to the last page", async () => {
    const { client, calls } = fakeApi({
      "GET /api/v1/cycle/entries": [page([entry])],
      "GET /api/v1/notes": [
        page([note("2026-10-01", "One.")], "cursor-1"),
        page([note("2026-10-02", "Two.")]),
      ],
      "GET /api/v1/cycle/predictions": [json(prediction)],
    });
    const load = await loadCalendar(client, span, { children: false });
    expect(load.ok && load.days.filter((day) => day.note).map((day) => day.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(calls).toContain(
      "GET /api/v1/notes?from=2026-09-28&to=2026-11-01&limit=200&cursor=cursor-1",
    );
  });

  it("fails when the entries, the notes or the prediction could not be read", async () => {
    const failing: Record<string, Answer> = {
      "GET /api/v1/cycle/entries": json({ title: "Down" }, 500),
      "GET /api/v1/notes": "network-error",
      "GET /api/v1/cycle/predictions": json({ title: "No session" }, 401),
    };
    for (const [key, answer] of Object.entries(failing)) {
      const routes: Record<string, Answer[]> = {
        "GET /api/v1/cycle/entries": [page([entry])],
        "GET /api/v1/notes": [page([])],
        "GET /api/v1/cycle/predictions": [json(prediction)],
      };
      routes[key] = [answer];
      const { client } = fakeApi(routes);
      expect(await loadCalendar(client, span, { children: false }), key).toEqual({ ok: false });
    }
  });

  it("gives up on a cursor that never ends instead of reading forever", async () => {
    const endless = Array.from({ length: 12 }, (_, index) => page([], `cursor-${index}`));
    const { client, calls } = fakeApi({
      "GET /api/v1/cycle/entries": [page([])],
      "GET /api/v1/notes": endless,
      "GET /api/v1/cycle/predictions": [json(prediction)],
    });
    expect(await loadCalendar(client, span, { children: false })).toEqual({ ok: false });
    expect(calls.filter((call) => call.startsWith("GET /api/v1/notes"))).toHaveLength(10);
  });

  it("reads the children only when asked, and a failed read of them costs only the age line", async () => {
    const child = {
      id: "018f5e7a-5eed-7006-8000-000000000001",
      displayName: "Ilo",
      dateOfBirth: "2026-08-23",
      sex: "female",
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      version: 1,
    };
    const answered = fakeApi({
      "GET /api/v1/cycle/entries": [page([])],
      "GET /api/v1/notes": [page([])],
      "GET /api/v1/cycle/predictions": [json(prediction)],
      "GET /api/v1/children": [page([child])],
    });
    const load = await loadCalendar(answered.client, span, { children: true });
    expect(load.ok && load.children).toEqual([
      { id: child.id, displayName: "Ilo", dateOfBirth: "2026-08-23" },
    ]);
    expect(answered.calls).toContain("GET /api/v1/children?limit=200");

    const refused = fakeApi({
      "GET /api/v1/cycle/entries": [page([])],
      "GET /api/v1/notes": [page([])],
      "GET /api/v1/cycle/predictions": [json(prediction)],
      "GET /api/v1/children": [json({ title: "Down" }, 500)],
    });
    expect(await loadCalendar(refused.client, span, { children: true })).toMatchObject({
      ok: true,
      children: null,
    });
  });
});
