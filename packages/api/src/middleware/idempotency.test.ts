import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@tidefern/db";
import { Problem } from "@tidefern/schemas";

import { createApp } from "../app";
import { requireActor } from "../auth";
import { problem } from "../problem";
import { sessionHeaders } from "../test/auth-fake";
import { ANNA, BEN, OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import type { ApiTestDatabase } from "../test/database";
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_INVALID,
  IDEMPOTENCY_KEY_IN_FLIGHT,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_REPLAYED_HEADER,
  requestFingerprint,
} from "./idempotency";
import { IDEMPOTENCY_TTL_MS } from "./limits";

const KEYS = {
  create: "018f5e7a-3000-7000-8000-000000000001",
  reused: "018f5e7a-3000-7000-8000-000000000002",
  inFlight: "018f5e7a-3000-7000-8000-000000000003",
  failed: "018f5e7a-3000-7000-8000-000000000004",
  thrown: "018f5e7a-3000-7000-8000-000000000005",
  expired: "018f5e7a-3000-7000-8000-000000000006",
  remove: "018f5e7a-3000-7000-8000-000000000007",
  upsert: "018f5e7a-3000-7000-8000-000000000008",
  anonymous: "018f5e7a-3000-7000-8000-000000000009",
  noResource: "018f5e7a-3000-7000-8000-00000000000a",
};

// A health word on purpose: the test proves it never reaches the row.
const BODY = JSON.stringify({ note: "nausea after breakfast" });
const OTHER_BODY = JSON.stringify({ note: "slept well" });

let harness: ApiTestDatabase;
let app: ReturnType<typeof createApp>;
const created: string[] = [];
let holds: { release: () => void } | null = null;
let boomCount = 0;

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  app = createApp({ auth: fixture.auth, db: harness.db, log: { sink: () => undefined } });
  app.post("/v1/_items", requireActor, async (c) => {
    const body = (await c.req.json()) as { note: string };
    const id = `018f5e7a-4000-7000-8000-${String(created.length + 1).padStart(12, "0")}`;
    created.push(id);
    if (holds !== null) {
      await new Promise<void>((resolve) => {
        holds = { release: resolve };
      });
    }
    return c.json({ id, note: body.note }, 201);
  });
  app.post("/v1/_refused", requireActor, (c) =>
    problem(c, 422, "validation_failed", { errors: [{ path: "note", message: "Too long." }] }),
  );
  app.post("/v1/_boom", requireActor, (c) => {
    boomCount += 1;
    if (boomCount === 1) throw new Error("first attempt fails");
    return c.json({ id: "018f5e7a-4000-7000-8000-00000000fff1" }, 201);
  });
  app.post("/v1/_count", requireActor, (c) => c.json({ count: 1 }, 200));
  app.put("/v1/_days/:date", requireActor, (c) => c.json({ date: c.req.param("date") }));
  app.delete("/v1/_items/:id", requireActor, (c) => c.body(null, 204));
});

afterAll(async () => {
  await harness.close();
});

const headers = (key?: string, token: string = TOKENS.anna): Record<string, string> => ({
  ...(sessionHeaders(token) as Record<string, string>),
  origin: OWN_ORIGIN,
  "content-type": "application/json",
  ...(key === undefined ? {} : { [IDEMPOTENCY_KEY_HEADER]: key }),
});

const post = (path: string, key: string | undefined, body: string = BODY, token?: string) =>
  app.request(`/api/v1${path}`, { method: "POST", headers: headers(key, token), body });

async function row(actorId: string, key: string) {
  const [found] = await harness.db
    .select()
    .from(schema.idempotencyKeys)
    .where(and(eq(schema.idempotencyKeys.actorId, actorId), eq(schema.idempotencyKeys.key, key)));
  return found;
}

describe("requestFingerprint", () => {
  it("changes with the method, the path and the body, and is a bare hash", () => {
    const body = new TextEncoder().encode(BODY).buffer as ArrayBuffer;
    const base = requestFingerprint("POST", "/api/v1/_items", body);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(requestFingerprint("post", "/api/v1/_items", body)).toBe(base);
    expect(requestFingerprint("PUT", "/api/v1/_items", body)).not.toBe(base);
    expect(requestFingerprint("POST", "/api/v1/_other", body)).not.toBe(base);
    expect(
      requestFingerprint(
        "POST",
        "/api/v1/_items",
        new TextEncoder().encode(OTHER_BODY).buffer as ArrayBuffer,
      ),
    ).not.toBe(base);
    expect(base).not.toContain("nausea");
  });
});

describe("the Idempotency-Key header", () => {
  it("is required on a POST, as a UUID", async () => {
    const missing = await post("/_items", undefined);
    expect(missing.status).toBe(400);
    const body = Problem.parse(await missing.json());
    expect(body.code).toBe("validation_failed");
    expect(body.detail).toBe(IDEMPOTENCY_KEY_REQUIRED);
    expect(body.errors?.[0]?.path).toBe(IDEMPOTENCY_KEY_HEADER);

    const malformed = await post("/_items", "not-a-uuid");
    expect(malformed.status).toBe(400);
    expect(Problem.parse(await malformed.json()).detail).toBe(IDEMPOTENCY_KEY_INVALID);
    expect(created).toEqual([]);
  });

  it("is optional on the other mutations", async () => {
    const response = await app.request("/api/v1/_days/2026-10-05", {
      method: "PUT",
      headers: headers(),
      body: BODY,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
  });

  it("is ignored for an anonymous mutation, which the route's 401 answers", async () => {
    const response = await app.request("/api/v1/_items", {
      method: "POST",
      headers: { origin: OWN_ORIGIN, [IDEMPOTENCY_KEY_HEADER]: KEYS.anonymous },
      body: BODY,
    });
    expect(response.status).toBe(401);
    const rows = await harness.db
      .select({ key: schema.idempotencyKeys.key })
      .from(schema.idempotencyKeys)
      .where(eq(schema.idempotencyKeys.key, KEYS.anonymous));
    expect(rows).toEqual([]);
  });
});

describe("a create with a key", () => {
  it("runs once, stores hashes and the resource id, never a body", async () => {
    const first = await post("/_items", KEYS.create);
    expect(first.status).toBe(201);
    const body = (await first.json()) as { id: string; note: string };
    expect(created).toEqual([body.id]);
    expect(first.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();

    const stored = await row(ANNA, KEYS.create);
    expect(stored).toMatchObject({
      actorId: ANNA,
      key: KEYS.create,
      route: "POST /api/v1/_items",
      state: "done",
      responseStatus: 201,
      resourceId: body.id,
    });
    expect(stored?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.responseHash).toMatch(/^[0-9a-f]{64}$/);
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain("nausea");
    expect(serialized).not.toContain("breakfast");
  });

  it("replays the same key and body from the row with the status, the id and the location", async () => {
    const replay = await post("/_items", KEYS.create);
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(replay.headers.get("location")).toBe(`/api/v1/_items/${created[0]}`);
    expect(await replay.json()).toEqual({ id: created[0] });
    expect(created).toHaveLength(1);
  });

  it("answers 409 for the same key with another body or another path", async () => {
    const otherBody = await post("/_items", KEYS.create, OTHER_BODY);
    expect(otherBody.status).toBe(409);
    const problemBody = Problem.parse(await otherBody.json());
    expect(problemBody.code).toBe("conflict");
    expect(problemBody.detail).toBe(IDEMPOTENCY_KEY_REUSED);

    const otherPath = await post("/_count", KEYS.create);
    expect(otherPath.status).toBe(409);
    expect(Problem.parse(await otherPath.json()).detail).toBe(IDEMPOTENCY_KEY_REUSED);
    expect(created).toHaveLength(1);
  });

  it("keeps keys per actor, so Ben's use of Anna's key is his own request", async () => {
    const response = await post("/_items", KEYS.create, BODY, TOKENS.ben);
    expect(response.status).toBe(201);
    expect(response.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(created).toHaveLength(2);
    expect((await row(BEN, KEYS.create))?.resourceId).toBe(created[1]);
  });

  it("answers 409 while the first request with the key is still in flight", async () => {
    holds = { release: () => undefined };
    const firstDone = post("/_items", KEYS.inFlight);
    // Let the first request claim its row and reach the handler.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await row(ANNA, KEYS.inFlight))?.state).toBe("in_flight");

    const second = await post("/_items", KEYS.inFlight);
    expect(second.status).toBe(409);
    expect(Problem.parse(await second.json()).detail).toBe(IDEMPOTENCY_KEY_IN_FLIGHT);

    holds.release();
    holds = null;
    const first = await firstDone;
    expect(first.status).toBe(201);
    expect((await row(ANNA, KEYS.inFlight))?.state).toBe("done");

    const replay = await post("/_items", KEYS.inFlight);
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
  });

  it("stores a 2xx without a resource id and replays it as an empty body with the status", async () => {
    const first = await post("/_count", KEYS.noResource);
    expect(first.status).toBe(200);
    expect((await row(ANNA, KEYS.noResource))?.resourceId).toBeNull();
    const replay = await post("/_count", KEYS.noResource);
    expect(replay.status).toBe(200);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await replay.text()).toBe("");
  });
});

describe("a refused or failed first attempt", () => {
  it("replays a problem with its status and code", async () => {
    const first = await post("/_refused", KEYS.failed);
    expect(first.status).toBe(422);
    expect(await row(ANNA, KEYS.failed)).toMatchObject({ state: "done", responseStatus: 422 });

    const replay = await post("/_refused", KEYS.failed);
    expect(replay.status).toBe(422);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(replay.headers.get("content-type")).toContain("application/problem+json");
    expect(Problem.parse(await replay.json()).code).toBe("validation_failed");
  });

  it("releases the key when the handler fails, so a retry runs the handler again", async () => {
    const first = await post("/_boom", KEYS.thrown);
    expect(first.status).toBe(500);
    expect(await row(ANNA, KEYS.thrown)).toBeUndefined();

    const retry = await post("/_boom", KEYS.thrown);
    expect(retry.status).toBe(201);
    expect(retry.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(boomCount).toBe(2);
    expect((await row(ANNA, KEYS.thrown))?.state).toBe("done");
  });
});

describe("an old row", () => {
  it("is dropped after the window and the request runs again", async () => {
    const stale = new Date(Date.now() - IDEMPOTENCY_TTL_MS - 60_000);
    await harness.db.insert(schema.idempotencyKeys).values({
      id: "018f5e7a-5000-7000-8000-000000000001",
      actorId: ANNA,
      key: KEYS.expired,
      route: "POST /api/v1/_items",
      requestHash: "stale",
      state: "done",
      responseStatus: 201,
      responseHash: "stale",
      resourceId: "018f5e7a-5000-7000-8000-0000000000ff",
      createdAt: stale,
      updatedAt: stale,
    });
    const before = created.length;
    const response = await post("/_items", KEYS.expired);
    expect(response.status).toBe(201);
    expect(response.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(created).toHaveLength(before + 1);
    const fresh = await row(ANNA, KEYS.expired);
    expect(fresh?.id).not.toBe("018f5e7a-5000-7000-8000-000000000001");
    expect(fresh?.resourceId).toBe(created[before]);
    expect(fresh?.createdAt.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe("a delete with a key", () => {
  it("stores the 204 and replays it", async () => {
    const send = () =>
      app.request(`/api/v1/_items/${created[0]}`, {
        method: "DELETE",
        headers: headers(KEYS.remove),
      });
    const first = await send();
    expect(first.status).toBe(204);
    expect(await row(ANNA, KEYS.remove)).toMatchObject({
      route: "DELETE /api/v1/_items/:id",
      responseStatus: 204,
    });
    const replay = await send();
    expect(replay.status).toBe(204);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
  });
});
