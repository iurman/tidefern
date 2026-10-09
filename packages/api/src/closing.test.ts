import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@tidefern/db";
import { Problem } from "@tidefern/schemas";

import { createApp } from "./app";
import { ACCOUNT_CLOSING, mayReachWhileClosing } from "./auth";
import { IDEMPOTENCY_KEY_HEADER } from "./middleware/idempotency";
import { ANNA, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "./test/actors";
import { sessionHeaders } from "./test/auth-fake";
import type { FakeAuth } from "./test/auth-fake";
import { KEK } from "./test/account";
import type { ApiTestDatabase } from "./test/database";

/**
 * The closure lock in the session middleware (architecture 11, task I2, E8's
 * request): an actor with an open closure gets the 401 problem with the
 * detail `account_closing` everywhere but her data rights routes, so the
 * undo still answers; another person, and the same person once the closure
 * is cancelled, are untouched.
 */
let harness: ApiTestDatabase;
let auth: FakeAuth;
let app: ReturnType<typeof createApp>;

const ANNAS_CLOSURE = "018f5e7a-4000-7000-8000-000000000001";
const CARAS_CLOSURE = "018f5e7a-4000-7000-8000-000000000002";
const DAY = 24 * 60 * 60_000;

beforeAll(async () => {
  ({ harness, auth } = await createActorFixture());
  app = createApp({ auth, db: harness.db, keys: KEK, log: { sink: () => undefined } });
  const now = Date.now();
  await harness.db.insert(schema.dataRequests).values([
    {
      id: ANNAS_CLOSURE,
      userId: ANNA,
      kind: "closure",
      state: "requested",
      undoUntil: new Date(now + 7 * DAY),
      deadlineAt: new Date(now + 45 * DAY),
    },
    {
      id: CARAS_CLOSURE,
      userId: CARA,
      kind: "closure",
      state: "in_progress",
      deadlineAt: new Date(now + 45 * DAY),
    },
  ]);
});

afterAll(async () => {
  await harness.close();
});

let keys = 0;
function request(method: "GET" | "POST", path: string, token?: string): Promise<Response> {
  keys += 1;
  return Promise.resolve(
    app.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(token === undefined ? {} : (sessionHeaders(token) as Record<string, string>)),
        ...(method === "POST"
          ? {
              origin: OWN_ORIGIN,
              "content-type": "application/json",
              [IDEMPOTENCY_KEY_HEADER]: `018f5e7a-4100-7000-8000-${keys.toString(16).padStart(12, "0")}`,
            }
          : {}),
      },
    }),
  );
}

async function closingProblem(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body = Problem.parse(await response.json());
  expect(body).toMatchObject({ status: 401, code: "unauthenticated", detail: ACCOUNT_CLOSING });
  return body;
}

describe("the closure lock", () => {
  it("refuses a closing actor on the routes that read or write her records", async () => {
    for (const path of ["/me", "/notes", "/children", "/sharing", "/me/profile", "/me/activity"]) {
      await closingProblem(await request("GET", path, TOKENS.anna));
    }
    await closingProblem(await request("POST", "/notes", TOKENS.anna));
  });

  it("refuses while the deletion is in progress too", async () => {
    await closingProblem(await request("GET", "/me", TOKENS.cara));
    // The undo still reaches its route, which says the window is over.
    const undo = await request("POST", "/me/close/undo", TOKENS.cara);
    expect(undo.status).toBe(409);
  });

  it("lets the closure state through", async () => {
    const state = await request("GET", "/me/close", TOKENS.anna);
    expect(state.status).toBe(200);
    const body = (await state.json()) as { request: { id: string } | null };
    expect(body.request?.id).toBe(ANNAS_CLOSURE);
  });

  it("leaves another person and an anonymous request as they were", async () => {
    expect((await request("GET", "/me", TOKENS.ben)).status).toBe(200);
    const anonymous = await request("GET", "/me");
    expect(anonymous.status).toBe(401);
    expect(Problem.parse(await anonymous.json()).detail).toBeUndefined();
  });

  it("lets the undo through, and the account answers again once it is cancelled", async () => {
    const undo = await request("POST", "/me/close/undo", TOKENS.anna);
    expect(undo.status).toBe(200);
    const [row] = await harness.db
      .select({ state: schema.dataRequests.state })
      .from(schema.dataRequests)
      .where(eq(schema.dataRequests.id, ANNAS_CLOSURE));
    expect(row?.state).toBe("cancelled");
    expect((await request("GET", "/me", TOKENS.anna)).status).toBe(200);
  });

  it("names exactly the data rights routes as reachable while closing", () => {
    const reachable = [
      ["GET", "/api/v1/me/close"],
      ["POST", "/api/v1/me/close"],
      ["POST", "/api/v1/me/close/undo"],
      ["GET", "/api/v1/me/export"],
      ["GET", "/api/v1/me/data-summary"],
      ["GET", "/api/v1/me/consents"],
      ["POST", "/api/v1/me/consents"],
      ["POST", "/api/v1/me/consents/018f5e7a-4000-7000-8000-000000000009/withdraw"],
    ] as const;
    for (const [method, path] of reachable) expect(mayReachWhileClosing(method, path)).toBe(true);
    const refused = [
      ["GET", "/api/v1/me"],
      ["DELETE", "/api/v1/me/close"],
      ["GET", "/api/v1/me/close/undo"],
      ["PUT", "/api/v1/me/profile"],
      ["GET", "/api/v1/me/activity"],
      ["POST", "/api/v1/me/close/undo/extra"],
      ["POST", "/api/v1/me/consents/a/b/withdraw"],
      ["GET", "/api/v1/notes"],
      ["POST", "/api/v1/sharing/invitations"],
      ["GET", "/api/v1/me/closed"],
    ] as const;
    for (const [method, path] of refused) expect(mayReachWhileClosing(method, path)).toBe(false);
  });
});
