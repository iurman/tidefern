import { describe, expect, it } from "vitest";
import { createApiClient, type Me } from "@tidefern/api-client";
import { ILO_ID, LENA_ID, MIRA_ID, SOL_ID, checklist, child, event, measurement } from "./fixtures";
import { byYoungest, guardianNames, isChildId, loadChildPage, loadFamily } from "./load";

/** A fake API: each handler answers one path and query, everything else is a 404 problem. */
type Handler = (url: URL) => Response | undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(...handlers: Handler[]) {
  const seen: string[] = [];
  const api = createApiClient({
    baseUrl: "http://api.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      seen.push(`${url.pathname}${url.search}`);
      for (const handler of handlers) {
        const response = handler(url);
        if (response) return response;
      }
      return json({ code: "not_found" }, 404);
    },
  });
  return { api, seen };
}

const on =
  (path: string, body: unknown, status = 200, match?: (url: URL) => boolean): Handler =>
  (url) =>
    url.pathname === path && (match?.(url) ?? true) ? json(body, status) : undefined;

const page = (items: unknown[]) => ({ items, nextCursor: null });

function me(overrides: Partial<Me> = {}): Me {
  return {
    id: MIRA_ID,
    profile: {
      displayName: "Mira",
      timeZone: "America/Vancouver",
      stage: "postpartum",
      weekStart: 7,
      units: "metric",
      notificationDetail: "gentle",
    },
    today: "2026-10-04",
    guardianOf: [ILO_ID, SOL_ID],
    grants: [],
    session: {
      expiresAt: "2026-10-12T00:00:00.000Z",
      authenticatedAt: "2026-10-05T00:00:00.000Z",
    },
    ...overrides,
  };
}

const context = {
  today: "2026-10-04",
  timeZone: "America/Vancouver",
  now: new Date("2026-10-05T00:00:00.000Z"),
};

const sol = child({ id: SOL_ID, displayName: "Sol", dateOfBirth: "2024-04-04", sex: "male" });
const ilo = child();

describe("loadFamily", () => {
  it("lists every child youngest first, names the guardians and reads each day", async () => {
    const diaper = event({
      kind: "diaper",
      diaperContents: "mixed",
      startedAt: "2026-10-04T22:00:00.000Z",
    });
    const { api, seen } = client(
      on("/api/v1/children", page([sol, ilo])),
      on("/api/v1/sharing", page([{ id: LENA_ID, displayName: "Lena", guardianOf: [ILO_ID] }])),
      (url) =>
        url.pathname.endsWith("/events") && url.searchParams.get("kind") === "diaper"
          ? json(page(url.pathname.includes(ILO_ID) ? [diaper] : []))
          : undefined,
      (url) => (url.pathname.endsWith("/events") ? json(page([])) : undefined),
    );
    const family = await loadFamily(api, me(), context);
    if (family.kind !== "ok") throw new Error("expected the family");
    expect(family.cards.map((card) => card.child.displayName)).toEqual(["Ilo", "Sol"]);
    const [first, second] = family.cards;
    expect(first?.guardians).toEqual(["you", "Lena"]);
    expect(first?.access.role).toBe("guardian");
    if (first?.day === null || first?.day === "failed" || first === undefined) {
      throw new Error("expected Ilo's day");
    }
    expect(first.day.summary.diaper.today).toBe(0);
    expect(first.day.summary.diaper.lastSince?.replace(/\u00a0/g, " ")).toBe("2 h ago");
    expect(second?.guardians).toEqual(["you", "Lena"]);
    // The last of each kind newest first, then today's events from and to the API's today.
    expect(seen).toContain(`/api/v1/children/${ILO_ID}/events?kind=feed&order=desc&limit=1`);
    expect(seen).toContain(
      `/api/v1/children/${ILO_ID}/events?from=2026-10-04&to=2026-10-04&limit=200`,
    );
  });

  it("gives a read grantee the day but no guardians, and never asks for the sharing list", async () => {
    const grantee = me({
      id: "018f5e7a-5eed-7000-8000-000000000005",
      guardianOf: [],
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000005",
          ownerId: MIRA_ID,
          category: "child",
          level: "read",
          childId: SOL_ID,
          createdAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });
    const { householdId, guardians, ...projected } = sol;
    void householdId;
    void guardians;
    const { api, seen } = client(on("/api/v1/children", page([projected])), (url) =>
      url.pathname.endsWith("/events") ? json(page([])) : undefined,
    );
    const family = await loadFamily(api, grantee, context);
    if (family.kind !== "ok") throw new Error("expected the family");
    expect(family.cards).toHaveLength(1);
    expect(family.cards[0]?.guardians).toBeNull();
    expect(family.cards[0]?.access).toMatchObject({ role: "read", canWrite: false });
    expect(seen.some((path) => path.startsWith("/api/v1/sharing"))).toBe(false);
  });

  it("reads no records for a summary grantee, whose grant reaches the card alone", async () => {
    const grantee = me({
      id: "018f5e7a-5eed-7000-8000-000000000006",
      guardianOf: [],
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000006",
          ownerId: MIRA_ID,
          category: "child",
          level: "summary",
          childId: SOL_ID,
          createdAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });
    const { api, seen } = client(on("/api/v1/children", page([{ ...sol, guardians: undefined }])));
    const family = await loadFamily(api, grantee, context);
    expect(family).toMatchObject({ kind: "ok", cards: [{ day: null }] });
    expect(seen.filter((path) => path.includes("/events"))).toEqual([]);
  });

  it("says a failed list as failed, and a failed day read on its own card", async () => {
    const down = client(on("/api/v1/children", { code: "internal" }, 500));
    expect(await loadFamily(down.api, me(), context)).toEqual({ kind: "failed" });
    const partial = client(
      on("/api/v1/children", page([ilo])),
      on("/api/v1/sharing", page([])),
      (url) => (url.pathname.endsWith("/events") ? json({ code: "internal" }, 500) : undefined),
    );
    const family = await loadFamily(partial.api, me(), context);
    expect(family).toMatchObject({
      kind: "ok",
      cards: [{ day: "failed", guardians: ["you", null] }],
    });
  });
});

describe("loadChildPage", () => {
  it("treats a malformed id and an unreachable child alike, as not found", async () => {
    const { api, seen } = client();
    expect(await loadChildPage(api, me(), "child")).toEqual({ kind: "notFound" });
    expect(seen).toEqual([]);
    expect(await loadChildPage(api, me(), "018f5e7a-5eed-7006-8000-0000000000ff")).toEqual({
      kind: "notFound",
    });
    const refused = client(on(`/api/v1/children/${ILO_ID}`, { code: "validation_failed" }, 422));
    expect(await loadChildPage(refused.api, me(), ILO_ID)).toEqual({ kind: "notFound" });
    const down = client(on(`/api/v1/children/${ILO_ID}`, { code: "internal" }, 500));
    expect(await loadChildPage(down.api, me(), ILO_ID)).toEqual({ kind: "failed" });
  });

  it("reads the timeline newest first, every measurement and the checklist", async () => {
    const newest = event({ kind: "diaper" });
    const { api, seen } = client(
      on(`/api/v1/children/${ILO_ID}`, ilo),
      on(`/api/v1/children/${ILO_ID}/events`, page([newest])),
      on(`/api/v1/children/${ILO_ID}/measurements`, page([measurement()])),
      on(`/api/v1/children/${ILO_ID}/milestones`, checklist()),
    );
    const loaded = await loadChildPage(api, me(), ILO_ID);
    if (loaded.kind !== "ok" || loaded.records === null) throw new Error("expected records");
    expect(loaded.records.events).toEqual({ items: [newest], nextCursor: null });
    expect(loaded.records.measurements).toHaveLength(1);
    expect(loaded.records.checklist).toMatchObject({ months: 2 });
    expect(seen).toContain(`/api/v1/children/${ILO_ID}/events?order=desc&limit=50`);
  });

  it("keeps each part's failure to its own part", async () => {
    const { api } = client(
      on(`/api/v1/children/${ILO_ID}`, ilo),
      on(`/api/v1/children/${ILO_ID}/events`, page([])),
      on(`/api/v1/children/${ILO_ID}/measurements`, { code: "internal" }, 500),
      on(`/api/v1/children/${ILO_ID}/milestones`, checklist()),
    );
    const loaded = await loadChildPage(api, me(), ILO_ID);
    expect(loaded).toMatchObject({
      kind: "ok",
      records: { measurements: "failed", events: { items: [] } },
    });
  });

  it("asks a summary grantee's page for no records", async () => {
    const grantee = me({
      id: "018f5e7a-5eed-7000-8000-000000000006",
      guardianOf: [],
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000006",
          ownerId: MIRA_ID,
          category: "child",
          level: "summary",
          childId: SOL_ID,
          createdAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });
    const { api, seen } = client(on(`/api/v1/children/${SOL_ID}`, sol));
    expect(await loadChildPage(api, grantee, SOL_ID)).toMatchObject({ kind: "ok", records: null });
    expect(seen).toEqual([`/api/v1/children/${SOL_ID}`]);
  });
});

describe("helpers", () => {
  it("names the actor you and an unnamed guardian null", () => {
    const people = [{ id: LENA_ID, displayName: "Lena" }] as never[];
    expect(guardianNames([MIRA_ID, LENA_ID], MIRA_ID, people)).toEqual(["you", "Lena"]);
    expect(
      guardianNames([LENA_ID, "018f5e7a-5eed-7000-8000-00000000000f"], MIRA_ID, people),
    ).toEqual(["Lena", null]);
  });

  it("orders the youngest child first and checks the id shape before any request", () => {
    expect([sol, ilo].sort(byYoungest).map((each) => each.displayName)).toEqual(["Ilo", "Sol"]);
    expect(isChildId(ILO_ID)).toBe(true);
    expect(isChildId("../me")).toBe(false);
  });
});
