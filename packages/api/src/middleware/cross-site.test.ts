import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveHosts } from "@tidefern/auth";
import { Problem } from "@tidefern/schemas";

import { createApp } from "../app";
import { requireActor } from "../auth";
import { sessionHeaders } from "../test/auth-fake";
import { OWN_ORIGIN, TOKENS, createActorFixture } from "../test/actors";
import type { ApiTestDatabase } from "../test/database";
import { CROSS_SITE_REQUEST, crossSiteVerdict, originAllowed } from "./cross-site";
import { IDEMPOTENCY_KEY_HEADER } from "./idempotency";

const PRODUCTION = "https://tidefern.example";
const PREVIEW_PATTERN = "https://tidefern-*-acme.vercel.app";

describe("originAllowed", () => {
  it("accepts the request's own origin, whatever its case", () => {
    expect(originAllowed("http://localhost", OWN_ORIGIN)).toBe(true);
    expect(originAllowed("HTTP://LOCALHOST", OWN_ORIGIN)).toBe(true);
  });

  it("accepts an exact trusted origin and a preview host under the team pattern", () => {
    const trusted = [PRODUCTION, PREVIEW_PATTERN];
    expect(originAllowed(PRODUCTION, OWN_ORIGIN, trusted)).toBe(true);
    expect(originAllowed("https://tidefern-a1b2c3-acme.vercel.app", OWN_ORIGIN, trusted)).toBe(
      true,
    );
    expect(
      originAllowed("https://tidefern-git-feature-x-acme.vercel.app", OWN_ORIGIN, trusted),
    ).toBe(true);
  });

  it("refuses another site, another team, a dotted label, a scheme change and the null origin", () => {
    const trusted = [PRODUCTION, PREVIEW_PATTERN];
    expect(originAllowed("https://evil.example", OWN_ORIGIN, trusted)).toBe(false);
    expect(originAllowed("https://tidefern-a1b2c3-other.vercel.app", OWN_ORIGIN, trusted)).toBe(
      false,
    );
    expect(
      originAllowed("https://tidefern-a.evil.example-acme.vercel.app", OWN_ORIGIN, trusted),
    ).toBe(false);
    expect(originAllowed("http://tidefern.example", OWN_ORIGIN, trusted)).toBe(false);
    expect(originAllowed("https://tidefern.example.evil", OWN_ORIGIN, trusted)).toBe(false);
    expect(originAllowed("null", OWN_ORIGIN, trusted)).toBe(false);
    expect(originAllowed("", OWN_ORIGIN, trusted)).toBe(false);
  });

  it("takes the trusted origins in the form packages/auth resolves for Better Auth", () => {
    const hosts = resolveHosts({
      productionHost: "tidefern.example",
      teamSlug: "acme",
      vercelEnv: "preview",
      vercelUrl: "tidefern-a1b2c3-acme.vercel.app",
    });
    expect(
      originAllowed("https://tidefern-a1b2c3-acme.vercel.app", OWN_ORIGIN, hosts.trustedOrigins),
    ).toBe(true);
    expect(originAllowed(PRODUCTION, OWN_ORIGIN, hosts.trustedOrigins)).toBe(true);
    expect(
      originAllowed("https://tidefern-a1b2c3-other.vercel.app", OWN_ORIGIN, hosts.trustedOrigins),
    ).toBe(false);
  });
});

describe("crossSiteVerdict", () => {
  it("decides by Origin when it is present, whatever Sec-Fetch-Site says", () => {
    expect(crossSiteVerdict(new Headers({ origin: OWN_ORIGIN }), OWN_ORIGIN)).toBe("allowed");
    expect(
      crossSiteVerdict(
        new Headers({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }),
        OWN_ORIGIN,
      ),
    ).toBe("refused");
  });

  it("falls back to Sec-Fetch-Site: same-origin and none pass, same-site and cross-site do not", () => {
    for (const value of ["same-origin", "none", "Same-Origin"]) {
      expect(crossSiteVerdict(new Headers({ "sec-fetch-site": value }), OWN_ORIGIN)).toBe(
        "allowed",
      );
    }
    for (const value of ["same-site", "cross-site", "anything"]) {
      expect(crossSiteVerdict(new Headers({ "sec-fetch-site": value }), OWN_ORIGIN)).toBe(
        "refused",
      );
    }
  });

  it("refuses a request with neither header, unless its only credential is a bearer", () => {
    expect(crossSiteVerdict(new Headers(), OWN_ORIGIN)).toBe("refused");
    expect(crossSiteVerdict(new Headers({ cookie: "a=b" }), OWN_ORIGIN)).toBe("refused");
    expect(crossSiteVerdict(new Headers({ authorization: "Bearer t" }), OWN_ORIGIN)).toBe(
      "allowed",
    );
    expect(
      crossSiteVerdict(new Headers({ authorization: "Bearer t", cookie: "a=b" }), OWN_ORIGIN),
    ).toBe("refused");
  });
});

describe("the crossSite middleware on /v1", () => {
  let harness: ApiTestDatabase;
  let app: ReturnType<typeof createApp>;
  let calls = 0;

  beforeAll(async () => {
    const fixture = await createActorFixture();
    harness = fixture.harness;
    app = createApp({
      auth: fixture.auth,
      db: harness.db,
      crossSite: { trustedOrigins: [PRODUCTION, PREVIEW_PATTERN] },
      log: { sink: () => undefined },
    });
    app.put("/v1/_probe", requireActor, (c) => {
      calls += 1;
      return c.json({ ok: true });
    });
    app.post("/v1/_probe", requireActor, (c) => {
      calls += 1;
      return c.json({ ok: true }, 201);
    });
    app.get("/v1/_probe", (c) => c.json({ ok: true }));
  });

  afterAll(async () => {
    await harness.close();
  });

  const send = (method: string, headers: Record<string, string>) =>
    app.request("/api/v1/_probe", {
      method,
      headers: { ...sessionHeaders(TOKENS.anna), ...headers },
      body: method === "GET" ? null : "{}",
    });

  it("passes a mutation from the app's own origin, a trusted origin and a preview host", async () => {
    const before = calls;
    expect((await send("PUT", { origin: OWN_ORIGIN })).status).toBe(200);
    expect((await send("PUT", { origin: PRODUCTION })).status).toBe(200);
    expect((await send("PUT", { origin: "https://tidefern-a1b2c3-acme.vercel.app" })).status).toBe(
      200,
    );
    expect((await send("PUT", { "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect(calls).toBe(before + 4);
  });

  it("answers the 403 problem for another origin, a cross-site fetch and a request with neither header", async () => {
    const before = calls;
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      {},
    ]) {
      const response = await send("PUT", headers);
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      const body = Problem.parse(await response.json());
      expect(body.code).toBe("forbidden");
      expect(body.detail).toBe(CROSS_SITE_REQUEST);
    }
    expect(calls).toBe(before);
  });

  it("refuses a POST before the idempotency rule looks for its key", async () => {
    const response = await send("POST", { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    const withKey = await send("POST", {
      origin: OWN_ORIGIN,
      [IDEMPOTENCY_KEY_HEADER]: "018f5e7a-3000-7000-8000-000000000001",
    });
    expect(withKey.status).toBe(201);
  });

  it("refuses an anonymous cross-site mutation too, ahead of the route's 401", async () => {
    const response = await app.request("/api/v1/_probe", {
      method: "PUT",
      headers: { origin: "https://evil.example" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });

  it("leaves reads alone", async () => {
    expect((await send("GET", { origin: "https://evil.example" })).status).toBe(200);
    expect((await send("GET", {})).status).toBe(200);
  });
});
