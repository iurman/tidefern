import { describe, expect, it } from "vitest";
import { Health, Problem } from "@tidefern/schemas";
import { createApp } from "./app";

const app = createApp();

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
