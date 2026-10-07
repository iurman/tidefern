import { describe, expect, it } from "vitest";
import { destinationFor } from "./current-shell";

describe("destinationFor", () => {
  it("names a destination by the first segment of its path", () => {
    expect(destinationFor("/today")).toBe("today");
    expect(destinationFor("/settings/sound")).toBe("settings");
    expect(destinationFor("/family/018f5e7a-5eed-7000-8000-000000000001")).toBe("family");
  });

  it("names the destination a route is reached from when it is not one itself", () => {
    expect(destinationFor("/log/2026-10-05")).toBe("calendar");
    expect(destinationFor("/activity")).toBe("settings");
  });

  it("falls back to Today for anything else, inherited object keys included", () => {
    expect(destinationFor("/")).toBe("today");
    expect(destinationFor("/welcome")).toBe("today");
    expect(destinationFor("/constructor")).toBe("today");
    expect(destinationFor("/__proto__")).toBe("today");
  });
});
