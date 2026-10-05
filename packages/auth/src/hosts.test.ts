import { describe, expect, test } from "vitest";

import {
  apexOf,
  hostFactsFromEnvironment,
  previewHostPattern,
  resolveHosts,
  teamSlugFromDeploymentHost,
} from "./hosts";

const PRODUCTION_HOST = "tidefern.example";
const TEAM = "fern-team";
const PREVIEW_HOST = "tidefern-abc123def-fern-team.vercel.app";

describe("resolveHosts on Vercel", () => {
  test("production answers on the fixed host and allows the narrow preview pattern", () => {
    const hosts = resolveHosts({
      productionHost: PRODUCTION_HOST,
      teamSlug: TEAM,
      vercelEnv: "production",
      vercelUrl: PREVIEW_HOST,
    });
    expect(hosts.baseURL).toEqual({
      allowedHosts: [PRODUCTION_HOST, "tidefern-*-fern-team.vercel.app"],
      fallback: "https://tidefern.example",
      protocol: "https",
    });
    expect(hosts.trustedOrigins).toEqual([
      "https://tidefern.example",
      "https://tidefern-*-fern-team.vercel.app",
    ]);
    expect(hosts.rpID).toBe(PRODUCTION_HOST);
    expect(hosts.passkeyOrigin).toBe("https://tidefern.example");
  });

  test("a preview keeps the same allow list but runs passkeys on its own origin", () => {
    const hosts = resolveHosts({
      productionHost: PRODUCTION_HOST,
      teamSlug: TEAM,
      vercelEnv: "preview",
      vercelUrl: PREVIEW_HOST,
    });
    expect(hosts.baseURL).toEqual({
      allowedHosts: [PRODUCTION_HOST, "tidefern-*-fern-team.vercel.app"],
      fallback: "https://tidefern.example",
      protocol: "https",
    });
    expect(hosts.trustedOrigins).toEqual([
      "https://tidefern.example",
      "https://tidefern-*-fern-team.vercel.app",
    ]);
    expect(hosts.rpID).toBe(PREVIEW_HOST);
    expect(hosts.passkeyOrigin).toBe(`https://${PREVIEW_HOST}`);
  });

  test("never widens to a bare vercel.app wildcard", () => {
    const hosts = resolveHosts({
      productionHost: PRODUCTION_HOST,
      teamSlug: TEAM,
      vercelEnv: "preview",
      vercelUrl: PREVIEW_HOST,
    });
    const patterns = [
      ...(hosts.baseURL as { allowedHosts: string[] }).allowedHosts,
      ...hosts.trustedOrigins,
    ];
    for (const pattern of patterns) {
      expect(pattern).not.toMatch(/^(https:\/\/)?\*\.vercel\.app$/);
      expect(pattern.startsWith("*")).toBe(false);
    }
  });

  test("without a team slug only the production host is allowed", () => {
    const hosts = resolveHosts({
      productionHost: PRODUCTION_HOST,
      vercelEnv: "production",
      vercelUrl: "tidefern-abc123def-fern-team.vercel.app",
    });
    expect(hosts.baseURL).toEqual({
      allowedHosts: [PRODUCTION_HOST],
      fallback: "https://tidefern.example",
      protocol: "https",
    });
    expect(hosts.trustedOrigins).toEqual(["https://tidefern.example"]);
  });

  test("the relying party is the apex, never www", () => {
    const hosts = resolveHosts({
      productionHost: "www.tidefern.example",
      teamSlug: TEAM,
      vercelEnv: "production",
    });
    expect(hosts.rpID).toBe("tidefern.example");
    expect((hosts.baseURL as { fallback: string }).fallback).toBe("https://www.tidefern.example");
    expect(apexOf("WWW.Tidefern.Example")).toBe("tidefern.example");
  });

  test("hosts are lower-cased and a scheme or path is refused", () => {
    expect(resolveHosts({ productionHost: "Tidefern.Example", vercelEnv: "production" }).rpID).toBe(
      "tidefern.example",
    );
    expect(() => resolveHosts({ productionHost: "https://tidefern.example" })).toThrow(TypeError);
    expect(() => resolveHosts({ productionHost: "tidefern.example/app" })).toThrow(TypeError);
    expect(() => resolveHosts({ productionHost: "" })).toThrow(TypeError);
    expect(() => previewHostPattern("bad/slug")).toThrow(TypeError);
  });
});

describe("resolveHosts locally", () => {
  test("uses one fixed origin when VERCEL_ENV is unset", () => {
    const hosts = resolveHosts({ productionHost: "localhost" });
    expect(hosts.baseURL).toBe("http://localhost:3000");
    expect(hosts.trustedOrigins).toEqual(["http://localhost:3000"]);
    expect(hosts.rpID).toBe("localhost");
    expect(hosts.passkeyOrigin).toBe("http://localhost:3000");
  });

  test("honours a configured local origin and ignores a team slug", () => {
    const hosts = resolveHosts({
      productionHost: "localhost",
      teamSlug: TEAM,
      localOrigin: "http://127.0.0.1:3107/",
    });
    expect(hosts.baseURL).toBe("http://127.0.0.1:3107");
    expect(hosts.trustedOrigins).toEqual(["http://127.0.0.1:3107"]);
    expect(hosts.rpID).toBe("127.0.0.1");
  });
});

describe("teamSlugFromDeploymentHost", () => {
  test("reads the slug off this project's deployment host, hyphens included", () => {
    expect(teamSlugFromDeploymentHost(PREVIEW_HOST)).toBe("fern-team");
    expect(teamSlugFromDeploymentHost("tidefern-9zq1w2e3r-solo.vercel.app")).toBe("solo");
    expect(teamSlugFromDeploymentHost("Tidefern-ABC123DEF-Fern-Team.vercel.app")).toBe("fern-team");
  });

  test("returns nothing for any other host", () => {
    expect(teamSlugFromDeploymentHost(undefined)).toBeUndefined();
    expect(teamSlugFromDeploymentHost("")).toBeUndefined();
    expect(teamSlugFromDeploymentHost("tidefern.example")).toBeUndefined();
    expect(teamSlugFromDeploymentHost("other-abc123def-fern-team.vercel.app")).toBeUndefined();
    expect(
      teamSlugFromDeploymentHost("tidefern-abc123def-fern-team.vercel.app.evil.example"),
    ).toBeUndefined();
    expect(teamSlugFromDeploymentHost("tidefern.vercel.app")).toBeUndefined();
  });
});

describe("hostFactsFromEnvironment", () => {
  test("production takes the host from BETTER_AUTH_URL and the slug from VERCEL_URL", () => {
    expect(
      hostFactsFromEnvironment({
        BETTER_AUTH_URL: "https://tidefern.example",
        VERCEL_ENV: "production",
        VERCEL_URL: PREVIEW_HOST,
        VERCEL_PROJECT_PRODUCTION_URL: "tidefern.vercel.app",
      }),
    ).toEqual({
      productionHost: PRODUCTION_HOST,
      teamSlug: TEAM,
      vercelEnv: "production",
      vercelUrl: PREVIEW_HOST,
      localOrigin: undefined,
    });
  });

  test("a preview has no BETTER_AUTH_URL and uses the project production URL", () => {
    expect(
      hostFactsFromEnvironment({
        VERCEL_ENV: "preview",
        VERCEL_URL: PREVIEW_HOST,
        VERCEL_PROJECT_PRODUCTION_URL: PRODUCTION_HOST,
      }),
    ).toEqual({
      productionHost: PRODUCTION_HOST,
      teamSlug: TEAM,
      vercelEnv: "preview",
      vercelUrl: PREVIEW_HOST,
      localOrigin: undefined,
    });
  });

  test("locally the configured URL is the origin and nothing on Vercel is trusted", () => {
    expect(hostFactsFromEnvironment({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual({
      productionHost: "localhost",
      teamSlug: undefined,
      vercelEnv: undefined,
      vercelUrl: undefined,
      localOrigin: "http://localhost:3000",
    });
    expect(hostFactsFromEnvironment({})).toEqual({
      productionHost: "localhost",
      teamSlug: undefined,
      vercelEnv: undefined,
      vercelUrl: undefined,
      localOrigin: undefined,
    });
  });
});
