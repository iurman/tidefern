import { afterEach, describe, expect, it, vi } from "vitest";
import { browserApiClient } from "./api-browser";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browserApiClient", () => {
  it("calls the page's own origin with the browser's session cookie", async () => {
    const seen: Request[] = [];
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      seen.push(input as Request);
      return Response.json({ code: "unauthenticated" }, { status: 401 });
    });

    const { response } = await browserApiClient().GET("/api/v1/me");

    expect(response.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${window.location.origin}/api/v1/me`);
    expect(seen[0]?.credentials).toBe("include");
  });

  it("hands out one client per page", () => {
    expect(browserApiClient()).toBe(browserApiClient());
  });
});
