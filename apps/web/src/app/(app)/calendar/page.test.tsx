import { render, screen } from "@testing-library/react";
import type { Me, MeLookup } from "@tidefern/api-client";
import type { CyclePrediction } from "@tidefern/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarLoad } from "./load";

const state = vi.hoisted(() => ({
  lookup: { kind: "anonymous" } as unknown,
  load: { ok: false } as unknown,
  loads: [] as unknown[][],
  /** The browser's address for the same request, which the view reads with useSearchParams. */
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=1" }) }));
vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => state.lookup,
  serverApiClient: () => "the server client",
}));
vi.mock("./load", () => ({
  loadCalendar: async (...args: unknown[]) => {
    state.loads.push(args);
    return state.load;
  },
}));

const { default: CalendarPage } = await import("./page");

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

const estimate: CyclePrediction = {
  subjectId: me.id,
  computedAt: "2026-10-05T06:00:00.000Z",
  basis: "estimate",
  cycleLength: 28,
  sampleSize: 2,
  nextPeriod: { expected: "2026-10-31", start: "2026-10-28", end: "2026-11-03" },
  ovulation: { expected: "2026-10-17", start: "2026-10-15", end: "2026-10-19" },
  fertileWindow: { start: "2026-10-12", end: "2026-10-17" },
  uncertaintyDays: 3,
  ovulationBandDays: 2,
};

function given(lookup: MeLookup, load: CalendarLoad = { ok: false }) {
  state.lookup = lookup;
  state.load = load;
}

async function renderPage(query: Record<string, string> = {}) {
  state.search = new URLSearchParams(query).toString();
  const page = await CalendarPage({ searchParams: Promise.resolve(query) });
  return page === null ? null : render(page);
}

beforeEach(() => {
  state.loads = [];
  state.search = "";
  given({ kind: "anonymous" });
});

describe("the calendar page", () => {
  it("renders nothing for a visitor the layout sends away", async () => {
    for (const lookup of [
      { kind: "anonymous" },
      { kind: "closing" },
      { kind: "ok", me: { ...me, profile: null, today: null } },
    ] as MeLookup[]) {
      given(lookup);
      expect(await renderPage(), lookup.kind).toBeNull();
    }
    expect(state.loads).toEqual([]);
  });

  it("says a failed session read and offers to read the page again", async () => {
    given({ kind: "failed" });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("We could not load your calendar. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/calendar");
    expect(state.loads).toEqual([]);
  });

  it("keeps the month and the view in Try again when the session read fails", async () => {
    given({ kind: "failed" });
    await renderPage({ month: "2026-09", view: "list" });
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/calendar?month=2026-09&view=list",
    );
    expect(state.loads).toEqual([]);
  });

  it("reads the month the address names over the whole grid and a day either side, in her week start", async () => {
    given({ kind: "ok", me }, { ok: true, days: [], prediction: estimate, children: null });
    await renderPage({ month: "2026-09", view: "list" });
    // The grid runs Aug 31 to Oct 4; the day past each edge tells whether a period runs on there.
    expect(state.loads).toEqual([
      ["the server client", { from: "2026-08-30", to: "2026-10-05" }, { children: false }],
    ]);
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
    expect(screen.getByRole("heading", { level: 2, name: "September 2026" })).toBeInTheDocument();
  });

  it("keeps the month and the view in Try again when the calendar's own reads fail", async () => {
    given({ kind: "ok", me }, { ok: false });
    await renderPage({ month: "2026-09", view: "list" });
    expect(screen.getByText("We could not load your calendar. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/calendar?month=2026-09&view=list",
    );
  });

  it("reads nothing for the none stage and offers no log action", async () => {
    given({ kind: "ok", me: { ...me, profile: { ...me.profile!, stage: "none" } } });
    await renderPage();
    expect(state.loads).toEqual([]);
    expect(screen.getByRole("region", { name: "Nothing logged this month" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log today" })).toBeNull();
  });

  it("asks for the children after a birth and shows the youngest one's age on the quiet card", async () => {
    const mira: Me = {
      ...me,
      profile: { ...me.profile!, stage: "postpartum", weekStart: 7 },
      today: "2026-10-04",
      guardianOf: ["child-ilo", "child-sol"],
    };
    given(
      { kind: "ok", me: mira },
      {
        ok: true,
        days: [],
        prediction: {
          ...estimate,
          basis: "none",
          nextPeriod: null,
          ovulation: null,
          fertileWindow: null,
        },
        children: [
          { id: "child-sol", displayName: "Sol", dateOfBirth: "2024-04-04" },
          { id: "child-ilo", displayName: "Ilo", dateOfBirth: "2026-08-23" },
        ],
      },
    );
    await renderPage();
    expect(state.loads[0]?.[2]).toEqual({ children: true });
    expect(screen.getByText("Ilo, 6 weeks")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "When you are ready" })).toBeInTheDocument();
  });

  it("draws today's month by default with the API's prediction", async () => {
    given({ kind: "ok", me }, { ok: true, days: [], prediction: estimate, children: null });
    await renderPage();
    // October's grid (Sep 28 to Nov 1) and a day either side.
    expect(state.loads[0]?.[1]).toEqual({ from: "2026-09-27", to: "2026-11-02" });
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Based on your last 2 cycles, your next period will likely start between Oct 28 and Nov 3.",
      ),
    ).toBeInTheDocument();
  });
});
