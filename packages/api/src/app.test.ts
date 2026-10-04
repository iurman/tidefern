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
  it("honors a different mount path for a standalone deployment", async () => {
    const standalone = createApp({ basePath: "/v1" });
    expect((await standalone.request("/v1/health")).status).toBe(200);
  });
});
