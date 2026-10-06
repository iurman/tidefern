import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "./client";
import { QueryNotAllowedError, allowedQuery } from "./query";
import { forwardedRequest, readMe } from "./session";

const ORIGIN = "https://tidefern.example";

/** A fetch that records each request and answers with `answer`. */
function recorder(answer: () => Response | Promise<Response> = () => Response.json({})) {
  const seen: Request[] = [];
  const fetch = async (request: Request) => {
    seen.push(request.clone());
    return answer();
  };
  return { seen, fetch };
}

const me = {
  id: "018bcfe5-6800-7000-8000-000000000001",
  profile: null,
  guardianOf: [],
  grants: [],
  session: { expiresAt: "2026-10-07T00:00:00.000Z" },
};

describe("createApiClient", () => {
  it("sends a typed call to the base URL through the given fetch with the given headers", async () => {
    const { seen, fetch } = recorder(() => Response.json(me));
    const client = createApiClient({ baseUrl: ORIGIN, fetch, headers: { cookie: "a=b" } });

    const { data } = await client.GET("/api/v1/me");

    expect(data).toEqual(me);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${ORIGIN}/api/v1/me`);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.headers.get("cookie")).toBe("a=b");
  });

  it("gives a POST an Idempotency-Key from generateId and leaves other methods alone", async () => {
    const { seen, fetch } = recorder();
    const ids = ["018bcfe5-6800-7000-8000-00000000000a", "018bcfe5-6800-7000-8000-00000000000b"];
    const client = createApiClient({ baseUrl: ORIGIN, fetch, generateId: () => ids.shift()! });

    await client.POST("/api/v1/me/close/undo");
    await client.GET("/api/v1/me");

    expect(seen[0]?.headers.get("idempotency-key")).toBe("018bcfe5-6800-7000-8000-00000000000a");
    expect(seen[1]?.headers.has("idempotency-key")).toBe(false);
    // The second id was never spent on the GET.
    expect(ids).toEqual(["018bcfe5-6800-7000-8000-00000000000b"]);
  });

  it("keeps the caller's Idempotency-Key so a retried create replays", async () => {
    const { seen, fetch } = recorder();
    const client = createApiClient({ baseUrl: ORIGIN, fetch, generateId: () => "fresh" });

    await client.POST("/api/v1/me/close/undo", {
      headers: { "Idempotency-Key": "018bcfe5-6800-7000-8000-0000000000ff" },
    });

    expect(seen[0]?.headers.get("idempotency-key")).toBe("018bcfe5-6800-7000-8000-0000000000ff");
  });

  it("mints UUIDv7 ids by default, through newId and on a POST", async () => {
    const { seen, fetch } = recorder();
    const client = createApiClient({ baseUrl: ORIGIN, fetch });

    await client.POST("/api/v1/me/close/undo");

    const v7 = z.uuidv7();
    expect(v7.safeParse(client.newId()).success).toBe(true);
    expect(v7.safeParse(seen[0]?.headers.get("idempotency-key")).success).toBe(true);
  });

  it("exposes the configured generator as newId", () => {
    const client = createApiClient({ baseUrl: ORIGIN, generateId: () => "from-the-generator" });
    expect(client.newId()).toBe("from-the-generator");
  });

  it("sends the contract's dates, ids, cursors and limits in the query string", async () => {
    const { seen, fetch } = recorder(() => Response.json({ items: [], nextCursor: null }));
    const client = createApiClient({ baseUrl: ORIGIN, fetch });

    await client.GET("/api/v1/notes", {
      params: {
        query: {
          subject: "018bcfe5-6800-7000-8000-000000000001",
          from: "2026-09-01",
          to: "2026-09-30",
          updatedSince: "2026-09-01T08:00:00.000Z",
          cursor: "eyJpZCI6IjEifQ",
          limit: 50,
        },
      },
    });

    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/api/v1/notes");
    expect(url.searchParams.get("from")).toBe("2026-09-01");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("refuses a query parameter the contract does not carry before anything is sent", async () => {
    const { seen, fetch } = recorder();
    const client = createApiClient({ baseUrl: ORIGIN, fetch });

    // A caller that casts its way past the types still cannot put a word in the URL.
    const call = client.GET("/api/v1/notes", {
      params: { query: { symptom: "nausea" } as never },
    });

    await expect(call).rejects.toBeInstanceOf(QueryNotAllowedError);
    await expect(call).rejects.not.toThrow(/nausea/);
    expect(seen).toHaveLength(0);
  });

  it("refuses a known parameter whose value is not in its shape", async () => {
    const { seen, fetch } = recorder();
    const client = createApiClient({ baseUrl: ORIGIN, fetch });

    const call = client.GET("/api/v1/cycle/entries", {
      params: { query: { from: "heavy flow" } },
    });

    await expect(call).rejects.toThrow(QueryNotAllowedError);
    await expect(call).rejects.not.toThrow(/heavy/);
    expect(seen).toHaveLength(0);
  });
});

describe("the query allowlist", () => {
  it("covers every query parameter in openapi/v1.json, so a new one is reviewed first", () => {
    const document = JSON.parse(
      readFileSync(new URL("../../../openapi/v1.json", import.meta.url), "utf8"),
    ) as {
      paths: Record<string, Record<string, { parameters?: { in: string; name: string }[] }>>;
    };
    const names = new Set<string>();
    for (const item of Object.values(document.paths)) {
      for (const operation of Object.values(item)) {
        for (const parameter of operation.parameters ?? []) {
          if (parameter.in === "query") names.add(parameter.name);
        }
      }
    }
    expect(names.size).toBeGreaterThan(0);
    expect([...names].filter((name) => !Object.hasOwn(allowedQuery, name))).toEqual([]);
  });
});

describe("readMe", () => {
  it("reads the actor on a 200", async () => {
    const { fetch } = recorder(() => Response.json(me));
    const lookup = await readMe(createApiClient({ baseUrl: ORIGIN, fetch }));
    expect(lookup).toEqual({ kind: "ok", me });
  });

  it("treats a 401 as a visitor without a session", async () => {
    const { fetch } = recorder(() => Response.json({ code: "unauthenticated" }, { status: 401 }));
    const lookup = await readMe(createApiClient({ baseUrl: ORIGIN, fetch }));
    expect(lookup).toEqual({ kind: "anonymous" });
  });

  it("reports any other answer or a thrown fetch as a failure, not as signed out", async () => {
    const failing = recorder(() => Response.json({ code: "internal" }, { status: 500 }));
    expect(await readMe(createApiClient({ baseUrl: ORIGIN, fetch: failing.fetch }))).toEqual({
      kind: "failed",
    });
    const throwing = recorder(() => Promise.reject(new Error("no database")));
    expect(await readMe(createApiClient({ baseUrl: ORIGIN, fetch: throwing.fetch }))).toEqual({
      kind: "failed",
    });
  });
});

describe("forwardedRequest", () => {
  it("builds the origin from the forwarded host and scheme and copies only the session headers", () => {
    const incoming = new Headers({
      cookie: "tidefern.session=abc",
      host: "internal:3000",
      "x-forwarded-host": "tidefern.example",
      "x-forwarded-proto": "https",
      "user-agent": "Browser/1.0",
      "x-real-ip": "203.0.113.9",
    });

    const { baseUrl, headers } = forwardedRequest(incoming);

    expect(baseUrl).toBe("https://tidefern.example");
    expect([...headers.keys()].sort()).toEqual(["cookie", "x-forwarded-host", "x-forwarded-proto"]);
    expect(headers.get("cookie")).toBe("tidefern.session=abc");
  });

  it("falls back to the Host header and plain http", () => {
    const { baseUrl, headers } = forwardedRequest(new Headers({ host: "127.0.0.1:3191" }));
    expect(baseUrl).toBe("http://127.0.0.1:3191");
    expect([...headers.keys()]).toEqual([]);
  });
});
