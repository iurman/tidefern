// @vitest-environment node
import { createApiClient, type Me } from "@tidefern/api-client";
import { describe, expect, it } from "vitest";
import { loadJourney } from "./load";

const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const PREGNANCY = "018f5e7a-5eed-7300-8000-000000000001";
const MIRA_PREGNANCY = "018f5e7a-5eed-7300-8000-000000000002";

type Handler = (url: URL) => Response;

/** A client whose requests answer from `routes`, keyed by method and path, and are recorded. */
function clientWith(routes: Record<string, Handler | Handler[]>) {
  const calls: string[] = [];
  const client = createApiClient({
    baseUrl: "http://journey.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.pathname}${url.search}`);
      const route = routes[`${request.method} ${url.pathname}`];
      const handler = Array.isArray(route) ? route.shift() : route;
      if (handler === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
      return handler(url);
    },
  });
  return { client, calls };
}

const json =
  (body: unknown, status = 200): Handler =>
  () =>
    Response.json(body, { status });
const problem =
  (status: number): Handler =>
  () =>
    Response.json({ type: "urn:x", title: "x", status, code: "not_found" }, { status });

function me(stage: "none" | "cycle" | "pregnancy" | "postpartum", grants: Me["grants"] = []): Me {
  return {
    id: LENA,
    profile: {
      displayName: "Lena",
      timeZone: "America/Vancouver",
      stage,
      weekStart: 7,
      units: "metric",
      notificationDetail: "generic",
    },
    today: "2026-10-04",
    guardianOf: [],
    grants,
    session: { expiresAt: "2026-10-12T00:00:00.000Z", authenticatedAt: "2026-10-04T08:00:00.000Z" },
  };
}

const active = {
  id: PREGNANCY,
  subjectId: LENA,
  status: "active",
  dueDate: "2027-02-07",
  datingMethod: "ultrasound",
  startedAt: "2026-06-28T00:00:00.000Z",
  endedAt: null,
  endedReason: null,
  gestation: { weeks: 22, days: 0, totalDays: 154, trimester: 2, label: "22w0d" },
  version: 2,
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

const event = {
  id: "018f5e7a-5eed-7400-8000-000000000001",
  pregnancyId: PREGNANCY,
  subjectId: LENA,
  authorId: LENA,
  kind: "appointment",
  date: "2026-09-20",
  detail: "Anatomy scan",
  version: 1,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

const overviewGrant = (level: "summary" | "read" | "contribute") => ({
  id: "018f5e7a-5eed-7200-8000-000000000006",
  ownerId: MIRA,
  category: "pregnancy.overview" as const,
  level,
  createdAt: "2026-01-01T00:00:00.000Z",
});

/** Only ids, dates, cursors and limits ever travel in a query (architecture 9.1). */
function queryKeys(calls: string[]): string[] {
  return [
    ...new Set(
      calls.flatMap((call) => [
        ...new URL(call.split(" ")[1] ?? "", "http://x").searchParams.keys(),
      ]),
    ),
  ].sort();
}

describe("loadJourney", () => {
  it("reads an active pregnancy's events, her history and the names, following cursors", async () => {
    const { client, calls } = clientWith({
      "GET /api/v1/pregnancies/current": json(active),
      [`GET /api/v1/pregnancies/${PREGNANCY}/events`]: [
        json({ items: [event], nextCursor: "page-2" }),
        json({
          items: [
            { ...event, id: "018f5e7a-5eed-7400-8000-000000000002", date: "2026-11-01" },
            // A tombstone only comes with updatedSince; one that slipped in is still not a row.
            {
              id: "018f5e7a-5eed-7400-8000-000000000003",
              pregnancyId: PREGNANCY,
              subjectId: LENA,
              deletedAt: "2026-10-01T00:00:00.000Z",
              version: 3,
            },
          ],
          nextCursor: null,
        }),
      ],
      [`GET /api/v1/pregnancies/${PREGNANCY}/dating-history`]: json({
        items: [],
        nextCursor: null,
      }),
      "GET /api/v1/sharing": json({ items: [], nextCursor: null }),
    });
    const reads = await loadJourney(client, me("pregnancy"));
    expect(reads.own.kind).toBe("active");
    if (reads.own.kind !== "active") return;
    expect(reads.own.events).toEqual({
      ok: true,
      value: [event, expect.objectContaining({ date: "2026-11-01" })],
    });
    expect(reads.own.history).toEqual({ ok: true, value: [] });
    expect(reads.people).toEqual({ ok: true, value: [] });
    expect(calls).toContain(`GET /api/v1/pregnancies/${PREGNANCY}/events?limit=200&cursor=page-2`);
    expect(queryKeys(calls)).toEqual(["cursor", "limit"]);
  });

  it("reads nothing more for a person without a pregnancy, and never the names", async () => {
    const { client, calls } = clientWith({ "GET /api/v1/pregnancies/current": problem(404) });
    expect(await loadJourney(client, me("cycle"))).toEqual({
      own: { kind: "none" },
      shared: [],
      people: null,
    });
    expect(calls).toEqual(["GET /api/v1/pregnancies/current"]);
  });

  it("reads the children and the prediction for a postpartum profile, with or without a record", async () => {
    const children = json({ items: [], nextCursor: null });
    const predictions = json({ basis: "none" });
    const without = clientWith({
      "GET /api/v1/pregnancies/current": problem(404),
      "GET /api/v1/children": children,
      "GET /api/v1/cycle/predictions": predictions,
    });
    expect((await loadJourney(without.client, me("postpartum"))).own).toEqual({
      kind: "none",
      children: { ok: true, value: [] },
      basis: { ok: true, value: "none" },
    });
    const ended = {
      ...active,
      status: "ended",
      endedAt: "2026-08-23",
      endedReason: "birth",
      gestation: null,
    };
    const withRecord = clientWith({
      "GET /api/v1/pregnancies/current": json(ended),
      "GET /api/v1/children": json({ items: [], nextCursor: null }),
      "GET /api/v1/cycle/predictions": json({ basis: "first_guess" }),
    });
    expect((await loadJourney(withRecord.client, me("postpartum"))).own).toMatchObject({
      kind: "ended",
      children: { ok: true },
      basis: { ok: true, value: "first_guess" },
    });
  });

  it("reads only whether predictions are paused after another ending", async () => {
    const ended = {
      ...active,
      status: "ended",
      endedAt: "2026-09-30",
      endedReason: "loss",
      gestation: null,
    };
    const { client, calls } = clientWith({
      "GET /api/v1/pregnancies/current": json(ended),
      "GET /api/v1/cycle/predictions": json({ basis: "none" }),
    });
    const reads = await loadJourney(client, me("cycle"));
    expect(reads.own).toMatchObject({ kind: "ended", basis: { ok: true, value: "none" } });
    expect(calls).toEqual(["GET /api/v1/pregnancies/current", "GET /api/v1/cycle/predictions"]);
  });

  it("reads each shared pregnancy by its owner's id, at the level the grant holds", async () => {
    const paused = clientWith({
      "GET /api/v1/pregnancies/current": [problem(404), json({ status: "paused" })],
      "GET /api/v1/sharing": json({ items: [], nextCursor: null }),
    });
    const reads = await loadJourney(paused.client, me("none", [overviewGrant("summary")]));
    expect(reads.shared).toEqual([{ ownerId: MIRA, level: "summary", kind: "paused" }]);
    expect(paused.calls).toContain(`GET /api/v1/pregnancies/current?subject=${MIRA}`);
    expect(queryKeys(paused.calls)).toEqual(["limit", "subject"]);

    const overview = {
      status: "active",
      id: MIRA_PREGNANCY,
      subjectId: MIRA,
      dueDate: "2027-02-07",
      gestation: active.gestation,
      version: 1,
    };
    const shared = clientWith({
      "GET /api/v1/pregnancies/current": [problem(404), json(overview)],
      [`GET /api/v1/pregnancies/${MIRA_PREGNANCY}/events`]: json({ items: [], nextCursor: null }),
      "GET /api/v1/sharing": json({ items: [], nextCursor: null }),
    });
    expect((await loadJourney(shared.client, me("none", [overviewGrant("read")]))).shared).toEqual([
      {
        ownerId: MIRA,
        level: "read",
        kind: "active",
        pregnancy: overview,
        events: { ok: true, value: [] },
      },
    ]);
  });

  it("reports each failed read on its own and never throws", async () => {
    const { client } = clientWith({
      "GET /api/v1/pregnancies/current": [
        json(active),
        () => {
          throw new TypeError("Failed to fetch");
        },
      ],
      [`GET /api/v1/pregnancies/${PREGNANCY}/events`]: problem(500),
      [`GET /api/v1/pregnancies/${PREGNANCY}/dating-history`]: json({
        items: [],
        nextCursor: null,
      }),
      "GET /api/v1/sharing": problem(500),
    });
    const reads = await loadJourney(client, me("pregnancy", [overviewGrant("contribute")]));
    expect(reads.own).toMatchObject({
      kind: "active",
      events: { ok: false },
      history: { ok: true },
    });
    expect(reads.shared).toEqual([{ ownerId: MIRA, level: "contribute", kind: "failed" }]);
    expect(reads.people).toEqual({ ok: false });
  });

  it("is a failure when her own read answers something that is not her record", async () => {
    const { client } = clientWith({ "GET /api/v1/pregnancies/current": problem(500) });
    expect((await loadJourney(client, me("pregnancy"))).own).toEqual({ kind: "failed" });
  });
});
