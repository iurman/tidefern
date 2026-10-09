import { render, screen } from "@testing-library/react";
import { createApiClient, type Me, type MeLookup } from "@tidefern/api-client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  lookup: { kind: "anonymous" } as unknown,
  reads: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=1" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
  // The in-process client over canned answers: Noor's first period is not logged yet.
  serverApiClient: () =>
    createApiClient({
      baseUrl: "http://tidefern.test",
      fetch: async (request) => {
        const url = new URL(request.url);
        session.reads.push(url.pathname);
        if (url.pathname === "/api/v1/pregnancies/current") {
          return Response.json({ title: "Not found", status: 404 }, { status: 404 });
        }
        if (url.pathname === "/api/v1/cycle/predictions") {
          return Response.json({
            subjectId: "018f5e7a-5eed-7000-8000-000000000001",
            computedAt: "2026-10-05T00:00:00.000Z",
            basis: "none",
            cycleLength: null,
            sampleSize: 0,
            nextPeriod: null,
            ovulation: null,
            fertileWindow: null,
            uncertaintyDays: 0,
            ovulationBandDays: 2,
          });
        }
        if (url.pathname === "/api/v1/cycle/status") {
          return Response.json({
            subjectId: "018f5e7a-5eed-7000-8000-000000000001",
            date: "2026-10-05",
            cycleDay: null,
            periodDay: null,
            inFertileWindow: false,
          });
        }
        return Response.json({ items: [], nextCursor: null });
      },
    }),
}));

const { default: TodayPage, metadata } = await import("./page");

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

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

beforeEach(() => {
  given({ kind: "anonymous" });
  session.reads = [];
});

describe("the /today route", () => {
  it("is titled from CONTENT.md, with no stage, date or health word in the title", () => {
    expect(metadata.title).toEqual({ absolute: "Today | Tidefern" });
    expect(metadata.description).toBe("Your home screen.");
  });

  it("renders nothing and reads nothing where the layout redirects", async () => {
    for (const lookup of [
      { kind: "anonymous" },
      { kind: "closing" },
      { kind: "ok", me: { ...me, profile: null, today: null } },
    ] satisfies MeLookup[]) {
      given(lookup);
      expect(await TodayPage()).toBeNull();
    }
    expect(session.reads).toEqual([]);
  });

  it("keeps only its heading under the layout's notice when the session read failed", async () => {
    given({ kind: "failed" });
    render(await TodayPage());
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    expect(session.reads).toEqual([]);
  });

  it("renders the stage's view from the API, here the empty state before the first log", async () => {
    given({ kind: "ok", me });
    render(await TodayPage());
    expect(screen.getByRole("heading", { level: 1, name: "Today, Monday, Oct 5" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Nothing logged yet" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Log today" })).toBeInTheDocument();
    // No sign-out form here any more: it lives in Settings (task H7).
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(session.reads).toContain("/api/v1/cycle/predictions");
  });
});
