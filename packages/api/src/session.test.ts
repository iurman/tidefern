import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { can } from "@tidefern/core";
import { schema } from "@tidefern/db";
import { Problem } from "@tidefern/schemas";
import type { Auth } from "@tidefern/auth";

import { loadActor } from "./actor";
import { createApp } from "./app";
import { FRESH_AUTHENTICATION_REQUIRED, requireFreshAuth } from "./auth";
import type { SessionAuth } from "./auth";
import { Me } from "./routes/me";
import { FakeAuth, sessionHeaders } from "./test/auth-fake";
import { createApiTestDatabase, installInterimActorReadPolicies } from "./test/database";
import type { ApiTestDatabase } from "./test/database";

// Synthetic ids only; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const BEN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
const ANNAS_HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const BENS_HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fb0";
const ANNAS_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const BENS_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f12";
const BENS_OTHER_CHILD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f13";
const STATUS_GRANT = "018f5e7a-2000-7000-8000-000000000001";
const REVOKED_GRANT = "018f5e7a-2000-7000-8000-000000000002";
const CHILD_GRANT = "018f5e7a-2000-7000-8000-000000000003";
const TOMBSTONED_GRANT = "018f5e7a-2000-7000-8000-000000000004";

let harness: ApiTestDatabase;
let auth: FakeAuth;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  harness = await createApiTestDatabase();
  await installInterimActorReadPolicies(harness.db);
  const { db } = harness;
  await db.insert(schema.user).values([
    { id: ANNA, name: "Anna", email: "anna@example.com" },
    { id: BEN, name: "Ben", email: "ben@example.com" },
  ]);
  await db.insert(schema.profiles).values({
    userId: ANNA,
    displayName: "Anna",
    timeZone: "Europe/Berlin",
    stage: "cycle",
    ageAttestedAt: new Date("2026-10-04T18:30:00Z"),
  });
  await db.insert(schema.households).values([{ id: ANNAS_HOUSEHOLD }, { id: BENS_HOUSEHOLD }]);
  await db.insert(schema.children).values([
    { id: ANNAS_CHILD, householdId: ANNAS_HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" },
    { id: BENS_CHILD, householdId: BENS_HOUSEHOLD, displayName: "Lu", dateOfBirth: "2024-08-15" },
    {
      id: BENS_OTHER_CHILD,
      householdId: BENS_HOUSEHOLD,
      displayName: "Ida",
      dateOfBirth: "2022-01-20",
    },
  ]);
  await db.insert(schema.childGuardians).values([
    { id: "018f5e7a-2000-7000-8000-00000000a001", childId: ANNAS_CHILD, userId: ANNA },
    { id: "018f5e7a-2000-7000-8000-00000000a002", childId: BENS_CHILD, userId: BEN },
    { id: "018f5e7a-2000-7000-8000-00000000a003", childId: BENS_OTHER_CHILD, userId: BEN },
  ]);
  await db.insert(schema.grants).values([
    {
      id: STATUS_GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.status",
      level: "summary",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
      createdAt: new Date("2026-10-01T08:00:00Z"),
    },
    {
      id: REVOKED_GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.history",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
      revokedAt: new Date("2026-10-03T08:00:00Z"),
    },
    {
      id: CHILD_GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "child",
      level: "read",
      childId: BENS_CHILD,
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
      createdAt: new Date("2026-10-02T08:00:00Z"),
    },
    {
      id: TOMBSTONED_GRANT,
      ownerId: BEN,
      granteeId: ANNA,
      category: "pregnancy.overview",
      level: "read",
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
      deletedAt: new Date("2026-10-03T09:00:00Z"),
    },
  ]);

  auth = new FakeAuth();
  auth.signIn("anna", ANNA, "anna@example.com", 60);
  auth.signIn("ben", BEN, "ben@example.com", 60);
  auth.signIn("anna-stale", ANNA, "anna@example.com", 11 * 60);
  app = createApp({ auth, db: harness.db });
  app.get("/v1/_sensitive", requireFreshAuth(600), (c) => c.text("ok"));
});

afterAll(async () => {
  await harness.close();
});

describe("the Better Auth mount", () => {
  it("fits the real Auth instance without the API importing the server", () => {
    expectTypeOf<Auth>().toExtend<SessionAuth>();
  });

  it("forwards everything under /api/auth to the handler and keeps the API's headers", async () => {
    const response = await app.request("/api/auth/get-session", { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      handledBy: "better-auth",
      path: "/api/auth/get-session",
    });
    expect(auth.handled).toContain("/api/auth/get-session");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is absent from the OpenAPI document, which lists only /api/v1 paths", async () => {
    const document = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    const paths = Object.keys(document.paths);
    expect(paths).toContain("/api/v1/me");
    expect(paths.every((path) => path.startsWith("/api/v1/"))).toBe(true);
    expect(paths.some((path) => path.includes("/auth"))).toBe(false);
  });

  it("answers 404 under /api/auth when no auth instance is injected", async () => {
    const bare = createApp();
    const response = await bare.request("/api/auth/get-session");
    expect(response.status).toBe(404);
    expect(Problem.parse(await response.json()).code).toBe("not_found");
  });
});

describe("the session middleware", () => {
  it("answers 401 on /v1/me without a session", async () => {
    const response = await app.request("/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const body = Problem.parse(await response.json());
    expect(body.code).toBe("unauthenticated");
    expect(body.detail).toBeUndefined();
  });

  it("answers 401 for a cookie that names no session", async () => {
    const response = await app.request("/api/v1/me", { headers: sessionHeaders("nobody") });
    expect(response.status).toBe(401);
    expect(Problem.parse(await response.json()).code).toBe("unauthenticated");
  });

  it("never consults auth for a request without a credential", async () => {
    const before = auth.lookups;
    expect((await app.request("/api/v1/health")).status).toBe(200);
    expect((await app.request("/api/v1/me")).status).toBe(401);
    expect(auth.lookups).toBe(before);
  });

  it("loads the actor with her profile, guardianships and active grants", async () => {
    const actor = await loadActor(ANNA, harness.db);
    expect(actor.id).toBe(ANNA);
    expect(actor.profile).toEqual({
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
    });
    expect(actor.guardianOf).toEqual([ANNAS_CHILD]);
    expect(actor.grants.map((grant) => grant.id)).toEqual([STATUS_GRANT, CHILD_GRANT]);
    expect(actor.grants[0]).toMatchObject({
      ownerId: BEN,
      granteeId: ANNA,
      category: "cycle.status",
      level: "summary",
      revokedAt: null,
    });
    expect(actor.grants[0]).not.toHaveProperty("childId");
    expect(actor.grants[1]).toMatchObject({
      category: "child",
      childId: BENS_CHILD,
      level: "read",
    });
  });

  it("hands can() exactly what it needs", async () => {
    const actor = await loadActor(ANNA, harness.db);
    expect(can(actor, "write", { subjectId: ANNA, category: "journal.private" }).reason).toBe(
      "owner",
    );
    expect(
      can(actor, "write", { subjectId: ANNAS_CHILD, category: "child", childId: ANNAS_CHILD })
        .reason,
    ).toBe("guardian");
    expect(can(actor, "summary", { subjectId: BEN, category: "cycle.status" }).allowed).toBe(true);
    expect(can(actor, "read", { subjectId: BEN, category: "cycle.status" }).allowed).toBe(false);
    expect(can(actor, "read", { subjectId: BEN, category: "cycle.history" }).allowed).toBe(false);
    expect(can(actor, "read", { subjectId: BEN, category: "pregnancy.overview" }).allowed).toBe(
      false,
    );
    expect(
      can(actor, "read", { subjectId: BEN, category: "child", childId: BENS_CHILD }).allowed,
    ).toBe(true);
    expect(
      can(actor, "read", { subjectId: BEN, category: "child", childId: BENS_OTHER_CHILD }).allowed,
    ).toBe(false);
  });

  it("yields an actor with no profile and no relationships for a fresh account", async () => {
    const actor = await loadActor(BEN, harness.db);
    expect(actor.profile).toBeNull();
    expect(actor.guardianOf).toEqual([BENS_CHILD, BENS_OTHER_CHILD]);
    expect(actor.grants).toEqual([]);
  });
});

describe("GET /v1/me", () => {
  it("projects the actor, the grants held and the session for a signed-in user", async () => {
    const response = await app.request("/api/v1/me", { headers: sessionHeaders("anna") });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = Me.parse(await response.json());
    expect(body.id).toBe(ANNA);
    expect(body.profile).toEqual({
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
    });
    expect(body.guardianOf).toEqual([ANNAS_CHILD]);
    expect(body.grants).toEqual([
      {
        id: STATUS_GRANT,
        ownerId: BEN,
        category: "cycle.status",
        level: "summary",
        createdAt: "2026-10-01T08:00:00.000Z",
      },
      {
        id: CHILD_GRANT,
        ownerId: BEN,
        category: "child",
        level: "read",
        childId: BENS_CHILD,
        createdAt: "2026-10-02T08:00:00.000Z",
      },
    ]);
    const session = auth.sessions.get("anna");
    expect(body.session.expiresAt).toBe(session?.session.expiresAt.toISOString());
    expect(body.session.authenticatedAt).toBe(session?.session.createdAt.toISOString());
  });

  it("carries no owner-only grant columns and nothing beyond the stage", async () => {
    const body = (await (
      await app.request("/api/v1/me", { headers: sessionHeaders("anna") })
    ).json()) as Record<string, unknown>;
    const text = JSON.stringify(body);
    expect(text).not.toContain("policyVersion");
    expect(text).not.toContain("notify");
    expect(text).not.toContain("ageAttestedAt");
    expect(text).not.toContain("deletedAt");
    expect(Object.keys(body).sort()).toEqual(["grants", "guardianOf", "id", "profile", "session"]);
  });

  it("answers with a null profile for a user onboarding has not reached", async () => {
    const body = Me.parse(
      await (await app.request("/api/v1/me", { headers: sessionHeaders("ben") })).json(),
    );
    expect(body.profile).toBeNull();
    expect(body.grants).toEqual([]);
  });
});

describe("requireFreshAuth", () => {
  it("passes a session authenticated inside the window", async () => {
    const response = await app.request("/api/v1/_sensitive", { headers: sessionHeaders("anna") });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("answers the fresh-authentication problem outside the window", async () => {
    const response = await app.request("/api/v1/_sensitive", {
      headers: sessionHeaders("anna-stale"),
    });
    expect(response.status).toBe(401);
    const body = Problem.parse(await response.json());
    expect(body.code).toBe("unauthenticated");
    expect(body.detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
  });

  it("treats the window boundary by the configured age", async () => {
    const wide = createApp({ auth, db: harness.db });
    wide.get("/v1/_sensitive", requireFreshAuth(12 * 60), (c) => c.text("ok"));
    const response = await wide.request("/api/v1/_sensitive", {
      headers: sessionHeaders("anna-stale"),
    });
    expect(response.status).toBe(200);
  });

  it("answers the plain 401 without a session", async () => {
    const response = await app.request("/api/v1/_sensitive");
    expect(response.status).toBe(401);
    expect(Problem.parse(await response.json()).detail).toBeUndefined();
  });
});
