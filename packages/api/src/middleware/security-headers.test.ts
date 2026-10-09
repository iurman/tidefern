import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { API_CONTENT_SECURITY_POLICY } from "./security-headers";

/**
 * The API's own security headers (task J3f): on Vercel the function's
 * headers win over the project's header rules, so these are the values a
 * browser actually gets from production, on every kind of answer.
 */
describe("the API's security headers", () => {
  const app = createApp();

  for (const [what, path] of [
    ["a success", "/api/v1/health"],
    ["the contract", "/api/v1/openapi.json"],
    ["a refusal", "/api/v1/me"],
    ["an unknown route", "/api/v1/nope"],
  ] as const) {
    it(`match the site's on ${what}`, async () => {
      const response = await app.request(path);
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=63072000; includeSubDomains",
      );
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toBe(API_CONTENT_SECURITY_POLICY);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
  }
});
