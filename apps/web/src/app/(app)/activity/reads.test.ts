// @vitest-environment node
import { createApiClient } from "@tidefern/api-client";
import { beforeEach, describe, expect, it } from "vitest";
import { ACTIVITY_PAGE_SIZE, readFirstPage, readNames } from "./reads";

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";
const KIM = "018f5e7a-5eed-7000-8000-000000000006";
const ILO = "018f5e7a-5eed-7020-8000-000000000001";
const SOL = "018f5e7a-5eed-7020-8000-000000000002";

type Answer = () => Response | Promise<Response>;

let requests: string[] = [];
let routes: Map<string, Answer[]>;

function route(path: string, ...answers: Answer[]) {
  routes.set(path, [...(routes.get(path) ?? []), ...answers]);
}

/** The typed client over a fake transport, the way the page's in-process client is built. */
function client() {
  return createApiClient({
    baseUrl: "http://127.0.0.1:3248",
    fetch: async (request) => {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}${url.search}`);
      const next = routes.get(url.pathname)?.shift();
      if (next === undefined) throw new Error(`unexpected request to ${url.pathname}`);
      return next();
    },
  });
}

function person(id: string, displayName: string | null) {
  return {
    id,
    displayName,
    role: "partner",
    householdId: null,
    guardianOf: [],
    grants: [],
    notify: false,
    version: 0,
  };
}

function child(id: string, displayName: string) {
  return {
    id,
    displayName,
    dateOfBirth: "2024-04-01",
    sex: null,
    createdAt: "2024-04-02T00:00:00.000Z",
    updatedAt: "2024-04-02T00:00:00.000Z",
    version: 1,
  };
}

beforeEach(() => {
  requests = [];
  routes = new Map();
});

describe("readFirstPage", () => {
  it("asks for one page of the page size and hands it back", async () => {
    const page = { items: [], nextCursor: null };
    route("/api/v1/me/activity", () => Response.json(page));
    expect(await readFirstPage(client())).toEqual(page);
    expect(requests).toEqual([`GET /api/v1/me/activity?limit=${ACTIVITY_PAGE_SIZE}`]);
  });

  it("says the read failed when the API refuses or the call throws", async () => {
    route(
      "/api/v1/me/activity",
      () => Response.json({ title: "Internal error" }, { status: 500 }),
      () => {
        throw new Error("no database");
      },
    );
    expect(await readFirstPage(client())).toBeNull();
    expect(await readFirstPage(client())).toBeNull();
  });
});

describe("readNames", () => {
  it("names everyone the sharing list holds with a name, page by page, and each child she guards by its own read", async () => {
    route(
      "/api/v1/sharing",
      () => Response.json({ items: [person(THEO, "Theo"), person(NOOR, null)], nextCursor: "c2" }),
      () => Response.json({ items: [person(KIM, "Kim")], nextCursor: null }),
    );
    route(`/api/v1/children/${ILO}`, () => Response.json(child(ILO, "Ilo")));
    route(`/api/v1/children/${SOL}`, () => Response.json(child(SOL, "Sol")));

    expect(await readNames(client(), { guardianOf: [ILO, SOL] })).toEqual({
      [THEO]: "Theo",
      [KIM]: "Kim",
      [ILO]: "Ilo",
      [SOL]: "Sol",
    });
    expect(requests.sort()).toEqual(
      [
        "GET /api/v1/sharing?limit=200",
        "GET /api/v1/sharing?limit=200&cursor=c2",
        `GET /api/v1/children/${ILO}`,
        `GET /api/v1/children/${SOL}`,
      ].sort(),
    );
    // The children list would audit a read of a child reached by a grant; it is never called.
    expect(requests).not.toContain("GET /api/v1/children");
  });

  it("asks for no child when she guards none", async () => {
    route("/api/v1/sharing", () =>
      Response.json({ items: [person(THEO, "Theo")], nextCursor: null }),
    );
    expect(await readNames(client(), { guardianOf: [] })).toEqual({ [THEO]: "Theo" });
    expect(requests).toEqual(["GET /api/v1/sharing?limit=200"]);
  });

  it("leaves out the names a failed read would have given, and keeps the rest", async () => {
    route(
      "/api/v1/sharing",
      () => Response.json({ items: [person(THEO, "Theo")], nextCursor: "c2" }),
      () => {
        throw new TypeError("Failed to fetch");
      },
    );
    route(`/api/v1/children/${ILO}`, () => Response.json({ title: "Not found" }, { status: 404 }));
    route(`/api/v1/children/${SOL}`, () => Response.json(child(SOL, "Sol")));
    expect(await readNames(client(), { guardianOf: [ILO, SOL] })).toEqual({
      [THEO]: "Theo",
      [SOL]: "Sol",
    });
  });
});
