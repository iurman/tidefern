import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema } from "@tidefern/db";
import { Problem } from "@tidefern/schemas";

import { createApp } from "../app";
import { requireActor } from "../auth";
import { sessionHeaders } from "../test/auth-fake";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import type { ApiTestDatabase } from "../test/database";
import { MUTATION_RATE_LIMIT, RATE_LIMIT_KEY_PREFIX } from "./limits";
import { countMutation } from "./rate-limit";

const SMALL = { windowMs: 1_000, max: 3 };
const T0 = Date.parse("2026-10-05T10:00:00.000Z");

let harness: ApiTestDatabase;
let app: ReturnType<typeof createApp>;
let calls = 0;

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  app = createApp({ auth: fixture.auth, db: harness.db, log: { sink: () => undefined } });
  app.put("/v1/_probe", requireActor, (c) => {
    calls += 1;
    return c.json({ ok: true });
  });
  app.get("/v1/_probe", requireActor, (c) => c.json({ ok: true }));
});

afterAll(async () => {
  await harness.close();
});

async function counter(actorId: string) {
  const [row] = await harness.db
    .select({ count: schema.rateLimit.count, lastRequest: schema.rateLimit.lastRequest })
    .from(schema.rateLimit)
    .where(eq(schema.rateLimit.key, `${RATE_LIMIT_KEY_PREFIX}${actorId}`));
  return row;
}

describe("countMutation", () => {
  it("counts inside a fixed window and refuses past the limit with the seconds left", async () => {
    for (let n = 1; n <= SMALL.max; n += 1) {
      const decision = await countMutation(harness.db, CARA, SMALL, T0 + n * 10);
      expect(decision).toMatchObject({
        count: n,
        allowed: true,
        retryAfterSeconds: 0,
        windowStart: T0 + 10,
      });
    }
    const refused = await countMutation(harness.db, CARA, SMALL, T0 + 400);
    expect(refused).toMatchObject({ count: 4, allowed: false, windowStart: T0 + 10 });
    expect(refused.retryAfterSeconds).toBe(1);
  });

  it("opens a new window once the old one has passed, and the row says so", async () => {
    const reset = await countMutation(harness.db, CARA, SMALL, T0 + 10 + SMALL.windowMs);
    expect(reset).toMatchObject({ count: 1, allowed: true, windowStart: T0 + 10 + SMALL.windowMs });
    expect(await counter(CARA)).toEqual({
      count: 1,
      lastRequest: T0 + 10 + SMALL.windowMs,
    });
  });

  it("keeps one row per actor under its own prefix, apart from Better Auth's rows", async () => {
    await harness.db
      .insert(schema.rateLimit)
      .values({ key: "203.0.113.9/sign-in/email", count: 3, lastRequest: T0 });
    await countMutation(harness.db, BEN, SMALL, T0);
    await countMutation(harness.db, BEN, SMALL, T0 + 1);
    expect(await counter(BEN)).toEqual({ count: 2, lastRequest: T0 });
    expect(await counter(CARA)).toMatchObject({ count: 1 });
    const [foreign] = await harness.db
      .select({ count: schema.rateLimit.count })
      .from(schema.rateLimit)
      .where(eq(schema.rateLimit.key, "203.0.113.9/sign-in/email"));
    expect(foreign).toEqual({ count: 3 });
  });

  it("runs as the app role", async () => {
    // A superuser bypasses the grants; the upsert is proven through the
    // same role withActor drops to, which 0000 granted the table to.
    const [role] = (
      (await harness.db.execute(sql`
        select has_table_privilege('tidefern_app', 'rate_limit', 'INSERT, UPDATE, SELECT') as ok
      `)) as { rows: { ok: boolean }[] }
    ).rows;
    expect(role?.ok).toBe(true);
  });
});

describe("the rateLimit middleware on /v1", () => {
  const send = (method: string, token: string = TOKENS.anna) =>
    app.request("/api/v1/_probe", {
      method,
      headers: { ...sessionHeaders(token), origin: OWN_ORIGIN },
      body: method === "GET" ? null : "{}",
    });

  it("counts every mutation of the actor and leaves reads uncounted", async () => {
    expect((await send("PUT")).status).toBe(200);
    expect((await send("PUT")).status).toBe(200);
    expect((await send("GET")).status).toBe(200);
    expect(await counter(ANNA)).toMatchObject({ count: 2 });
  });

  it("answers the 429 problem with Retry-After once the window is full, then lets the next window through", async () => {
    const before = calls;
    const now = Date.now();
    await harness.db
      .update(schema.rateLimit)
      .set({ count: MUTATION_RATE_LIMIT.max, lastRequest: now - 1_000 })
      .where(eq(schema.rateLimit.key, `${RATE_LIMIT_KEY_PREFIX}${ANNA}`));
    const refused = await send("PUT");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("content-type")).toContain("application/problem+json");
    expect(Problem.parse(await refused.json()).code).toBe("rate_limited");
    const retryAfter = Number(refused.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(58);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(calls).toBe(before);

    await harness.db
      .update(schema.rateLimit)
      .set({ lastRequest: now - MUTATION_RATE_LIMIT.windowMs - 1 })
      .where(eq(schema.rateLimit.key, `${RATE_LIMIT_KEY_PREFIX}${ANNA}`));
    const allowed = await send("PUT");
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("retry-after")).toBeNull();
    expect(calls).toBe(before + 1);
    expect(await counter(ANNA)).toMatchObject({ count: 1 });
  });

  it("does not count an anonymous mutation; the route's 401 answers it", async () => {
    const response = await app.request("/api/v1/_probe", {
      method: "PUT",
      headers: { origin: OWN_ORIGIN },
      body: "{}",
    });
    expect(response.status).toBe(401);
    const rows = await harness.db
      .select({ key: schema.rateLimit.key })
      .from(schema.rateLimit)
      .where(sql`${schema.rateLimit.key} like ${`${RATE_LIMIT_KEY_PREFIX}%`}`);
    expect(rows.map((row) => row.key).sort()).toEqual(
      [ANNA, BEN, CARA].map((id) => `${RATE_LIMIT_KEY_PREFIX}${id}`).sort(),
    );
  });
});
