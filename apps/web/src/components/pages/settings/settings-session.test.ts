import type { Me } from "@tidefern/api-client";
import { describe, expect, it } from "vitest";
import { settingsSession } from "./settings-session";

const me: Me = {
  id: "018f5e7a-5eed-7000-8000-000000000001",
  profile: {
    displayName: "Noor",
    timeZone: "Europe/Berlin",
    stage: "cycle",
    weekStart: 1,
    units: "metric",
    notificationDetail: "generic",
  },
  today: "2026-10-05",
  guardianOf: [],
  grants: [],
  session: { expiresAt: "2026-10-12T00:00:00.000Z", authenticatedAt: "2026-10-05T00:00:00.000Z" },
};

describe("what a settings screen does with the shared session read", () => {
  it("renders for a person with a profile", () => {
    expect(settingsSession({ kind: "ok", me })).toEqual({ kind: "ok", me });
  });

  it("renders its failure lines when the read failed, since the layout keeps the person", () => {
    expect(settingsSession({ kind: "failed" })).toEqual({ kind: "failed" });
  });

  it("renders nothing where the layout redirects: no session, a closing account, no profile", () => {
    expect(settingsSession({ kind: "anonymous" })).toEqual({ kind: "leave" });
    expect(settingsSession({ kind: "closing" })).toEqual({ kind: "leave" });
    expect(settingsSession({ kind: "ok", me: { ...me, profile: null } })).toEqual({
      kind: "leave",
    });
  });
});
