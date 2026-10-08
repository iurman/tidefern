import { render, screen } from "@testing-library/react";
import type { Me, MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  lookup: { kind: "anonymous" } as unknown,
  loads: 0,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "x=1" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
  serverApiClient: () => ({}),
}));
vi.mock("./load", () => ({
  loadJourney: async () => {
    session.loads += 1;
    return { own: { kind: "none" }, shared: [], people: null };
  },
}));

const { default: JourneyPage } = await import("./page");

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

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

beforeEach(() => {
  session.loads = 0;
});

describe("the /journey page", () => {
  it("renders nothing for a visitor the layout sends elsewhere, and reads nothing", async () => {
    for (const lookup of [
      { kind: "anonymous" },
      { kind: "closing" },
      { kind: "ok", me: { ...me, profile: null, today: null } },
    ] as MeLookup[]) {
      given(lookup);
      expect(await JourneyPage()).toBeNull();
    }
    expect(session.loads).toBe(0);
  });

  it("shows only its heading when the session read failed, since the layout says so", async () => {
    given({ kind: "failed" });
    render(await JourneyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Journey" })).toBeInTheDocument();
    expect(screen.queryByText(/could not load/)).toBeNull();
    expect(session.loads).toBe(0);
  });

  it("reads and renders the view for a person with a profile", async () => {
    given({ kind: "ok", me });
    render(await JourneyPage());
    expect(screen.getByRole("heading", { name: "No pregnancy recorded" })).toBeInTheDocument();
    expect(session.loads).toBe(1);
  });
});
