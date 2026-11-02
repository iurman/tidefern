import { render, screen, within } from "@testing-library/react";
import { createApiClient, type Me, type MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  lookup: { kind: "anonymous" } as unknown,
  answers: new Map<string, () => Response>(),
  requests: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
  serverApiClient: () =>
    createApiClient({
      baseUrl: "http://127.0.0.1:3248",
      fetch: async (request) => {
        const url = new URL(request.url);
        session.requests.push(url.pathname);
        const answer = session.answers.get(url.pathname);
        if (answer === undefined) throw new Error(`unexpected request to ${url.pathname}`);
        return answer();
      },
    }),
}));

const { default: ActivityPage, metadata } = await import("./page");
const { default: ActivityLoading } = await import("./loading");

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";

const me: Me = {
  id: NOOR,
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

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

beforeEach(() => {
  given({ kind: "anonymous" });
  session.answers = new Map();
  session.requests = [];
});

async function renderPage() {
  const page = await ActivityPage();
  if (page !== null) render(page);
  return page;
}

describe("the /activity page", () => {
  it("has a neutral title and stays out of search", () => {
    expect(metadata.title).toEqual({ absolute: "Activity | Tidefern" });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("renders nothing where the layout redirects: no session, a closing account, no profile", async () => {
    expect(await renderPage()).toBeNull();
    given({ kind: "closing" });
    expect(await renderPage()).toBeNull();
    given({ kind: "ok", me: { ...me, profile: null, today: null } });
    expect(await renderPage()).toBeNull();
    expect(session.requests).toEqual([]);
  });

  it("keeps the title and the way back when the session read failed, and claims nothing about the rows", async () => {
    given({ kind: "failed" });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("No activity yet")).toBeNull();
    // The layout's notice already says the read failed and how to retry.
    expect(screen.queryByText(/could not load/)).toBeNull();
    expect(session.requests).toEqual([]);
  });

  it("renders the first page on the server with the names it read", async () => {
    given({ kind: "ok", me });
    session.answers.set("/api/v1/me/activity", () =>
      Response.json({
        items: [
          {
            id: "018f5e7a-5eed-7050-8000-000000000012",
            action: "partner.read",
            actorId: THEO,
            subjectId: NOOR,
            category: "cycle.symptoms",
            occurredAt: "2026-10-05T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    );
    session.answers.set("/api/v1/sharing", () =>
      Response.json({
        items: [
          {
            id: THEO,
            displayName: "Theo",
            role: "partner",
            householdId: null,
            guardianOf: [],
            grants: [],
            notify: false,
            version: 0,
          },
        ],
        nextCursor: null,
      }),
    );
    await renderPage();
    const section = screen.getByRole("region", { name: "Activity" });
    expect(within(section).getByRole("link", { name: "Back to Settings" })).toBeVisible();
    expect(within(section).getByRole("listitem")).toHaveTextContent(
      "Oct 5Viewed your symptomsby Theo",
    );
    expect(session.requests.sort()).toEqual(["/api/v1/me/activity", "/api/v1/sharing"]);
  });

  it("says what to do when the rows could not be read", async () => {
    given({ kind: "ok", me });
    session.answers.set("/api/v1/me/activity", () =>
      Response.json({ title: "Internal error" }, { status: 500 }),
    );
    session.answers.set("/api/v1/sharing", () => Response.json({ items: [], nextCursor: null }));
    await renderPage();
    expect(
      screen.getByText("We could not load your activity just now. Reload the page to try again."),
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("No activity yet")).toBeNull();
  });

  it("shows the title and the way back while the rows load, with lines standing in for them", () => {
    render(<ActivityLoading />);
    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    const skeleton = screen.getByText("Loading your activity").parentElement;
    expect(skeleton).toHaveAttribute("aria-busy", "true");
  });
});
