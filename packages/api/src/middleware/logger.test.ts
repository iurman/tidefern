import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { requireActor } from "../auth";
import { SESSION_COOKIE, sessionHeaders } from "../test/auth-fake";
import { ANNA, OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import type { ApiTestDatabase } from "../test/database";
import type { FakeAuth } from "../test/auth-fake";
import { LOG_FIELDS, REQUEST_ID_HEADER, hashId } from "./logger";
import type { LogLine } from "./logger";

const SECRET = "test-only-log-secret";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let harness: ApiTestDatabase;
let auth: FakeAuth;
let app: ReturnType<typeof createApp>;
const lines: string[] = [];

function last(): LogLine {
  const line = lines.at(-1);
  if (line === undefined) throw new Error("no line was logged");
  return JSON.parse(line) as LogLine;
}

function probes(target: ReturnType<typeof createApp>) {
  target.put("/v1/_probe", requireActor, async (c) => {
    const body = (await c.req.json()) as { note: string };
    return c.json({ echoed: body.note, query: c.req.query("symptom") });
  });
  target.get("/v1/_things/:id", (c) => c.json({ id: c.req.param("id") }));
}

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  auth = fixture.auth;
  app = createApp({
    auth,
    db: harness.db,
    log: { secret: SECRET, sink: (line) => lines.push(line) },
  });
  probes(app);
});

afterAll(async () => {
  await harness.close();
});

describe("the allowlist logger", () => {
  it("logs the allowlisted fields and nothing from the path, the query, the headers or the body", async () => {
    const response = await app.request("/api/v1/_probe?symptom=nausea", {
      method: "PUT",
      headers: {
        ...sessionHeaders(TOKENS.anna),
        origin: OWN_ORIGIN,
        "content-type": "application/json",
        "x-tidefern-client": "ios/1.2.3",
        "x-request-id": "req-abc-123",
      },
      body: JSON.stringify({ note: "nausea after breakfast" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echoed: "nausea after breakfast", query: "nausea" });

    const raw = lines.at(-1) ?? "";
    const line = last();
    expect(Object.keys(line).every((key) => (LOG_FIELDS as readonly string[]).includes(key))).toBe(
      true,
    );
    expect(line).toMatchObject({
      requestId: "req-abc-123",
      method: "PUT",
      route: "/api/v1/_probe",
      status: 200,
      client: "ios/1.2.3",
    });
    expect(line.latencyMs).toBeGreaterThanOrEqual(0);
    expect(line.actor).toBe(hashId(ANNA, SECRET));
    expect(line.actor).not.toBe(ANNA);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req-abc-123");

    for (const forbidden of [
      "nausea",
      "breakfast",
      "symptom",
      "?",
      ANNA,
      TOKENS.anna,
      SESSION_COOKIE,
      "cookie",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("logs the route template, never the concrete id in the path", async () => {
    const response = await app.request("/api/v1/_things/018f5e7a-9999-7000-8000-000000000001");
    expect(response.status).toBe(200);
    const raw = lines.at(-1) ?? "";
    expect(last()).toMatchObject({ method: "GET", route: "/api/v1/_things/:id", status: 200 });
    expect(raw).not.toContain("018f5e7a-9999");
    expect(last().actor).toBeUndefined();
  });

  it("keys the actor hash on the secret, so two environments never share a hash", () => {
    expect(hashId(ANNA, "one")).not.toBe(hashId(ANNA, "two"));
    expect(hashId(ANNA, "one")).toBe(hashId(ANNA, "one"));
    expect(hashId(ANNA, "one")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("mints a request id when the given one is not a plain token, and echoes it", async () => {
    const response = await app.request("/api/v1/_things/x", {
      headers: { "x-request-id": 'bad id "with spaces"' },
    });
    const id = last().requestId;
    expect(id).toMatch(UUID);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(id);
    expect(lines.at(-1)).not.toContain("spaces");

    await app.request("/api/v1/_things/x", {
      headers: { "x-vercel-id": "iad1::abc12-1700000000000-0123456789ab" },
    });
    expect(last().requestId).toBe("iad1::abc12-1700000000000-0123456789ab");
  });

  it("drops a client header that is not platform/semver", async () => {
    await app.request("/api/v1/_things/x", { headers: { "x-tidefern-client": "nausea tracker" } });
    expect(last().client).toBeUndefined();
    expect(lines.at(-1)).not.toContain("nausea");
    await app.request("/api/v1/_things/x", {
      headers: { "x-tidefern-client": "android/2.0.0-beta.1" },
    });
    expect(last().client).toBe("android/2.0.0-beta.1");
  });

  it("logs a 404 under the middleware's own pattern, not the unknown path", async () => {
    const response = await app.request("/api/v1/no-such-route/with-a-word");
    expect(response.status).toBe(404);
    expect(last()).toMatchObject({ status: 404, route: "/api/v1/*" });
    expect(lines.at(-1)).not.toContain("no-such-route");
  });

  it("carries no actor field without a secret, rather than a bare hash", async () => {
    const bare: string[] = [];
    const quiet = createApp({ auth, db: harness.db, log: { sink: (line) => bare.push(line) } });
    probes(quiet);
    const response = await quiet.request("/api/v1/_probe", {
      method: "PUT",
      headers: {
        ...sessionHeaders(TOKENS.anna),
        origin: OWN_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "x" }),
    });
    expect(response.status).toBe(200);
    const line = JSON.parse(bare.at(-1) ?? "{}") as LogLine;
    expect(line.status).toBe(200);
    expect(line.actor).toBeUndefined();
    expect(bare.at(-1)).not.toContain(ANNA);
  });
});
