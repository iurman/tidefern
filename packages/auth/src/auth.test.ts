import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "@tidefern/db/schema";

import { createAuth } from "./auth";
import type { Auth } from "./auth";
import type { HostFacts } from "./hosts";
import { CaptureMailer } from "./mailer";
import { createAuthTestDatabase } from "./test/database";

const SECRET = "a-fixed-test-secret-that-is-long-enough";
const PRODUCTION_HOST = "tidefern.example";
const PREVIEW_HOST = "tidefern-abc123def-fern-team.vercel.app";
const FOREIGN_HOST = "tidefern-abc123def-other-team.vercel.app";

const FACTS: HostFacts = {
  productionHost: PRODUCTION_HOST,
  teamSlug: "fern-team",
  vercelEnv: "production",
  vercelUrl: PREVIEW_HOST,
};

const USER = {
  id: "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f01",
  email: "someone@example.com",
  name: "Someone",
  emailVerified: false,
  createdAt: new Date("2026-10-05T00:00:00Z"),
  updatedAt: new Date("2026-10-05T00:00:00Z"),
};

let harness: Awaited<ReturnType<typeof createAuthTestDatabase>>;
let mailer: CaptureMailer;
let auth: Auth;

// Rate limiting is on in every environment (enabled: true), keyed by client IP
// and path, so each request gets its own address. A browser `fetch` sends the
// Origin header and the Fetch Metadata headers Better Auth's CSRF check reads
// on a first sign-in (no cookie yet), so the helper sends both.
let nextAddress = 10;
function request(
  url: string,
  init: RequestInit & { origin?: string; site?: "same-origin" | "cross-site" } = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `203.0.113.${nextAddress++}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.site) {
    headers.set("sec-fetch-site", init.site);
    headers.set("sec-fetch-mode", "cors");
    headers.set("sec-fetch-dest", "empty");
  }
  if (init.body) headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}

async function count(table: string): Promise<number> {
  const result = await harness.db.execute(sql.raw(`select count(*)::int as n from "${table}"`));
  return (result as unknown as { rows: { n: number }[] }).rows[0]?.n ?? -1;
}

beforeAll(async () => {
  harness = await createAuthTestDatabase();
  mailer = new CaptureMailer();
  auth = createAuth({ database: harness.db, schema, mailer, hosts: FACTS, secret: SECRET });
});

afterAll(async () => {
  await harness.close();
});

describe("the configuration", () => {
  test("matches architecture 6.1 option by option", () => {
    const options = auth.options;
    expect(options.appName).toBe("Tidefern");
    expect(options.basePath).toBe("/api/auth");
    expect(options.secret).toBe(SECRET);
    expect(options.baseURL).toEqual({
      allowedHosts: [PRODUCTION_HOST, "tidefern-*-fern-team.vercel.app"],
      fallback: "https://tidefern.example",
      protocol: "https",
    });
    expect(options.trustedOrigins).toEqual([
      "https://tidefern.example",
      "https://tidefern-*-fern-team.vercel.app",
    ]);
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
    });
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.session).toMatchObject({
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    });
    expect(options.rateLimit).toEqual({ enabled: true, storage: "database" });
    expect(options.telemetry).toEqual({ enabled: false });
    expect(options.advanced?.database?.generateId).toBe("uuid");
    expect(options.advanced?.disableOriginCheck).toBe(false);
    expect("socialProviders" in options).toBe(false);
  });

  test("enables exactly the two-factor and passkey plugins, then the session audit", async () => {
    // Task C7 added the session audit on purpose, last, so its after-hook runs
    // once two-factor's has dropped a sign-in that still owes the second factor.
    expect(auth.options.plugins?.map((plugin) => plugin.id)).toEqual([
      "two-factor",
      "passkey",
      "session-audit",
    ]);
    // The passkey plugin keeps its relying party and origin in a closure, so
    // the endpoint list is the observable evidence it is mounted.
    const context = await auth.$context;
    const endpoints = Object.keys(auth.api);
    expect(endpoints).toContain("generatePasskeyRegistrationOptions");
    expect(endpoints).toContain("enableTwoFactor");
    expect(endpoints).toContain("verifyBackupCode");
    expect(endpoints).not.toContain("createOrganization");
    expect(endpoints).not.toContain("signInAnonymous");
    expect(context.rateLimit).toMatchObject({ enabled: true, storage: "database" });
  });

  test("keeps the base URL dynamic and the trusted origins narrow in the context", async () => {
    const context = await auth.$context;
    // The dynamic form resolves per request, so the context holds no fixed
    // origin; the fallback is applied when a request carries no allowed host.
    expect(context.options.baseURL).toEqual({
      allowedHosts: [PRODUCTION_HOST, "tidefern-*-fern-team.vercel.app"],
      fallback: "https://tidefern.example",
      protocol: "https",
    });
    expect(context.trustedOrigins).toContain("https://tidefern.example");
    expect(context.trustedOrigins).toContain("https://tidefern-*-fern-team.vercel.app");
    expect(context.trustedOrigins).not.toContain("https://*.vercel.app");
    expect(context.trustedOrigins.some((origin) => origin.startsWith("https://*"))).toBe(false);
  });
});

describe("mail", () => {
  test("the reset callback sends the generic reset mail through the mailer", async () => {
    const url = "https://tidefern.example/api/auth/reset-password/tok?callbackURL=%2F";
    await auth.options.emailAndPassword?.sendResetPassword?.({ user: USER, url, token: "tok" });
    const message = mailer.last(USER.email);
    expect(message?.subject).toBe("Reset your Tidefern password");
    expect(message?.text).toContain(url);
    expect(message?.text).not.toContain("tok?callbackURL=%2F ");
  });

  test("the verification callback sends the generic confirmation mail", async () => {
    const url = "https://tidefern.example/api/auth/verify-email?token=tok&callbackURL=%2F";
    await auth.options.emailVerification?.sendVerificationEmail?.({
      user: USER,
      url,
      token: "tok",
    });
    const message = mailer.last(USER.email);
    expect(message?.subject).toBe("Confirm your email");
    expect(message?.text).toContain(url);
    expect(message?.to).toBe(USER.email);
  });
});

describe("the handler", () => {
  test("answers an unknown auth path with 404 after consulting only the rate limit table", async () => {
    const response = await auth.handler(
      request("https://tidefern.example/api/auth/does-not-exist"),
    );
    expect(response.status).toBe(404);
    expect(await count("rate_limit")).toBe(1);
    expect(await count("user")).toBe(0);
    expect(await count("session")).toBe(0);
  });

  test("refuses a sign-in whose origin is another team's vercel.app host", async () => {
    const response = await auth.handler(
      request("https://tidefern.example/api/auth/sign-in/email", {
        method: "POST",
        origin: `https://${FOREIGN_HOST}`,
        site: "cross-site",
        body: JSON.stringify({ email: USER.email, password: "correct horse battery" }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()) as { message?: string }).toMatchObject({
      message: expect.stringMatching(/origin/i),
    });
    expect(await count("user")).toBe(0);
  });

  test("accepts this team's preview origin on its own host and reaches the endpoint", async () => {
    const response = await auth.handler(
      request(`https://${PREVIEW_HOST}/api/auth/sign-in/email`, {
        method: "POST",
        origin: `https://${PREVIEW_HOST}`,
        site: "same-origin",
        body: JSON.stringify({ email: USER.email, password: "correct horse battery" }),
      }),
    );
    // Past the origin check, into the endpoint, which finds no such user.
    expect(response.status).toBe(401);
    expect(await count("user")).toBe(0);
  });

  test("ignores a request outside the base path", async () => {
    const response = await auth.handler(request("https://tidefern.example/api/v1/health"));
    expect(response.status).toBe(404);
  });
});
