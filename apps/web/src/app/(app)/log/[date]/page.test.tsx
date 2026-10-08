import { render, screen } from "@testing-library/react";
import type { Me, MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DayLoad } from "@/lib/day-log";

const state = vi.hoisted(() => {
  /** What `notFound()` throws here; the real one throws Next's own not-found error the same way. */
  class NotFound extends Error {}
  return {
    lookup: { kind: "anonymous" } as unknown,
    load: { ok: false, status: 500 } as unknown,
    loads: [] as string[],
    reads: 0,
    NotFound,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new state.NotFound("not found");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=1" }) }));
vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => {
    state.reads += 1;
    return state.lookup;
  },
  serverApiClient: () => "the server client",
}));
vi.mock("@/lib/day-log", async (original) => ({
  ...(await original<typeof import("@/lib/day-log")>()),
  loadDay: async (_client: unknown, date: string) => {
    state.loads.push(date);
    return state.load;
  },
}));

const { dayStateFrom } = await import("@/lib/day-log");
const { default: LogDayPage } = await import("./page");

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
  session: {
    expiresAt: "2026-10-12T00:00:00.000Z",
    authenticatedAt: "2026-10-05T00:00:00.000Z",
  },
};

function given(lookup: MeLookup, load: DayLoad = { ok: false, status: 500 }) {
  state.lookup = lookup;
  state.load = load;
}

/** The page for a date: its element, or "not found" when it called notFound(). */
async function pageFor(date: string) {
  try {
    return await LogDayPage({ params: Promise.resolve({ date }) });
  } catch (error) {
    if (error instanceof state.NotFound) return "not found" as const;
    throw error;
  }
}

beforeEach(() => {
  state.loads = [];
  state.reads = 0;
  given({ kind: "anonymous" });
});

describe("the day page", () => {
  it("is not a page for a path that is not a calendar date, decided before any read", async () => {
    given({ kind: "ok", me });
    for (const date of ["not-a-date", "2026-02-30", "2026-10-5", "20261005"]) {
      expect(await pageFor(date), date).toBe("not found");
    }
    expect(state.reads).toBe(0);
    expect(state.loads).toEqual([]);
  });

  it("is not a page for a day that has not come, or for the none stage", async () => {
    given({ kind: "ok", me });
    expect(await pageFor("2026-10-06")).toBe("not found");
    given({ kind: "ok", me: { ...me, profile: { ...me.profile!, stage: "none" } } });
    expect(await pageFor("2026-10-04")).toBe("not found");
    expect(state.loads).toEqual([]);
  });

  it("renders nothing for a visitor the layout sends away", async () => {
    for (const lookup of [
      { kind: "anonymous" },
      { kind: "closing" },
      { kind: "ok", me: { ...me, profile: null, today: null } },
    ] as MeLookup[]) {
      given(lookup);
      expect(await pageFor("2026-10-04"), lookup.kind).toBeNull();
    }
  });

  it("keeps the page's frame and says the day could not be loaded when the session read failed", async () => {
    given({ kind: "failed" });
    const page = await pageFor("2026-10-04");
    if (page === "not found" || page === null) throw new Error("expected the failed page");
    render(page);
    expect(screen.getByRole("heading", { level: 1, name: "Sunday, Oct 4" })).toBeInTheDocument();
    expect(screen.getByText("We could not load this day. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous day" })).toHaveAttribute(
      "href",
      "/log/2026-10-03",
    );
    expect(screen.queryByRole("link", { name: "Next day" })).toBeNull();
  });

  it("says the day could not be loaded, never Loading, when the server's day read failed", async () => {
    given({ kind: "ok", me }, { ok: false, status: 500 });
    const page = await pageFor("2026-09-04");
    if (page === "not found" || page === null) throw new Error("expected the failed page");
    render(page);
    expect(state.loads).toEqual(["2026-09-04"]);
    expect(screen.getByRole("heading", { level: 1, name: "Friday, Sep 4" })).toBeInTheDocument();
    expect(screen.getByText("We could not load this day. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    // Today is known here, so both neighbours that have come are links.
    expect(screen.getByRole("link", { name: "Previous day" })).toHaveAttribute(
      "href",
      "/log/2026-09-03",
    );
    expect(screen.getByRole("link", { name: "Next day" })).toHaveAttribute(
      "href",
      "/log/2026-09-05",
    );
    for (const close of screen.getAllByRole("link", { name: "Close" })) {
      expect(close).toHaveAttribute("href", "/calendar?month=2026-09");
    }
  });

  it("says to sign in again, without Try again, when the day read answered 401", async () => {
    given({ kind: "ok", me }, { ok: false, status: 401 });
    const page = await pageFor("2026-10-05");
    if (page === "not found" || page === null) throw new Error("expected the failed page");
    render(page);
    expect(
      screen.getByText("Your session has ended. Sign in again, then come back to this day."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.queryByRole("link", { name: "Next day" })).toBeNull();
  });

  it("renders the day the server read, with the days around it and Close as links", async () => {
    given(
      { kind: "ok", me },
      {
        ok: true,
        day: dayStateFrom(
          "2026-09-04",
          [
            {
              id: "018f5e7a-5eed-7010-8000-000000000001",
              subjectId: me.id,
              date: "2026-09-04",
              flow: "heavy",
              period: true,
              symptoms: ["cramps"],
              mood: "low",
              version: 2,
              updatedAt: "2026-09-04T08:00:00.000Z",
              deletedAt: null,
            },
          ],
          [],
        ),
      },
    );
    const page = await pageFor("2026-09-04");
    if (page === "not found" || page === null) throw new Error("expected the day page");
    render(page);
    expect(state.loads).toEqual(["2026-09-04"]);
    expect(screen.getByRole("heading", { level: 1, name: "Friday, Sep 4" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Heavy" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Previous day" })).toHaveAttribute(
      "href",
      "/log/2026-09-03",
    );
    expect(screen.getByRole("link", { name: "Next day" })).toHaveAttribute(
      "href",
      "/log/2026-09-05",
    );
    // Close leads back to the calendar on the day's own month.
    for (const close of screen.getAllByRole("link", { name: "Close" })) {
      expect(close).toHaveAttribute("href", "/calendar?month=2026-09");
    }
  });

  it("offers no next day on today", async () => {
    given({ kind: "ok", me }, { ok: true, day: dayStateFrom("2026-10-05", [], []) });
    const page = await pageFor("2026-10-05");
    if (page === "not found" || page === null) throw new Error("expected the day page");
    render(page);
    expect(screen.queryByRole("link", { name: "Next day" })).toBeNull();
    for (const close of screen.getAllByRole("link", { name: "Close" })) {
      expect(close).toHaveAttribute("href", "/calendar");
    }
  });
});
