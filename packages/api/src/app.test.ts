import { afterEach, describe, expect, it, vi } from "vitest";
import { Health, Problem } from "@tidefern/schemas";
import { createApp } from "./app";
import { ClockConfigurationError } from "./clock";

const app = createApp();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api", () => {
  it("answers health with a validated body and private caching", async () => {
    const response = await app.request("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Health.parse(await response.json()).status).toBe("ok");
  });
  it("publishes an OpenAPI 3.1 document", async () => {
    const response = await app.request("/api/v1/openapi.json");
    const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toContain("/api/v1/health");
  });
  it("returns RFC 9457 problem details for unknown routes", async () => {
    const response = await app.request("/api/v1/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(Problem.parse(await response.json()).code).toBe("not_found");
  });
  it("keeps the /api/v1 prefix permanent and runs deferred work the host hands in", async () => {
    const deferred: Array<() => Promise<void>> = [];
    const hosted = createApp({ defer: (task) => deferred.push(task) });
    expect((await hosted.request("/v1/health")).status).toBe(404);
    expect((await hosted.request("/api/v1/health")).status).toBe(200);
    const document = (await (await hosted.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths).every((path) => path.startsWith("/api/v1/"))).toBe(true);
    expect(deferred).toEqual([]);
  });
  it("emits problem types as stable URNs with a closed code list", async () => {
    const body = Problem.parse(await (await app.request("/api/v1/missing")).json());
    expect(body.type).toBe("urn:tidefern:problem:not_found");
  });
});

describe("the calendar clock a host does not pass (task E11)", () => {
  /** A probe route that answers what the request's clock says in one zone. */
  function probe(hosted: ReturnType<typeof createApp>) {
    hosted.get("/v1/probe", (c) =>
      c.json({ frozenAt: c.var.clock.frozenAt, today: c.var.clock.today("Europe/Berlin") }),
    );
    return hosted;
  }

  it("is read from the environment, so a server started with TIDEFERN_FAKE_NOW is frozen", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("TIDEFERN_FAKE_NOW", "2026-10-05");
    const hosted = probe(createApp());
    expect(await (await hosted.request("/api/v1/probe")).json()).toEqual({
      frozenAt: "2026-10-05T00:00:00.000Z",
      today: "2026-10-05",
    });
  });

  it("is the real clock when the environment does not freeze it", async () => {
    vi.stubEnv("TIDEFERN_FAKE_NOW", "");
    const hosted = probe(createApp());
    const body = (await (await hosted.request("/api/v1/probe")).json()) as { frozenAt: unknown };
    expect(body.frozenAt).toBeNull();
  });

  it("refuses on production before the app answers anything", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TIDEFERN_FAKE_NOW", "2026-10-05");
    expect(() => createApp()).toThrow(ClockConfigurationError);
    expect(() => createApp()).toThrow(
      /TIDEFERN_FAKE_NOW must not be set when VERCEL_ENV is production/,
    );
  });
});
