import { render, screen } from "@testing-library/react";
import { createApiClient, type Me, type MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => {
  /** What `notFound()` throws here; the real one throws Next's own error the same way. */
  class NotFound extends Error {}
  return {
    lookup: { kind: "anonymous" } as unknown,
    answer: (() => new Response(null, { status: 500 })) as (url: URL) => Response,
    requests: [] as string[],
    NotFound,
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new session.NotFound("not found");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
  serverApiClient: () =>
    createApiClient({
      baseUrl: "http://api.test",
      fetch: async (request) => {
        const url = new URL(request.url);
        session.requests.push(url.pathname);
        return session.answer(url);
      },
    }),
}));

const { default: FamilyPage, metadata } = await import("./page");
const { default: ChildPage, metadata: childMetadata } = await import("./[childId]/page");
const { default: FamilyLoading } = await import("./loading");
const { default: ChildLoading } = await import("./[childId]/loading");

const ILO = "018f5e7a-5eed-7006-8000-000000000001";

const me: Me = {
  id: "018f5e7a-5eed-7000-8000-000000000003",
  profile: {
    displayName: "Mira",
    timeZone: "America/Vancouver",
    stage: "postpartum",
    weekStart: 7,
    units: "metric",
    notificationDetail: "gentle",
  },
  today: "2026-10-04",
  guardianOf: [],
  grants: [],
  session: { expiresAt: "2026-10-12T00:00:00.000Z", authenticatedAt: "2026-10-05T00:00:00.000Z" },
};

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  given({ kind: "anonymous" });
  session.requests = [];
  session.answer = () => new Response(null, { status: 500 });
});

describe("the family routes", () => {
  it("are titled from CONTENT.md and keep the child's id out of the page head", () => {
    expect(metadata.title).toEqual({ absolute: "Family | Tidefern" });
    expect(childMetadata.title).toEqual({ absolute: "Family | Tidefern" });
    expect(new URL(String(childMetadata.alternates?.canonical)).pathname).toBe("/family");
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("render nothing and read nothing until the shared session read has a profile", async () => {
    for (const lookup of [
      { kind: "anonymous" },
      { kind: "closing" },
      { kind: "failed" },
      { kind: "ok", me: { ...me, profile: null, today: null } },
    ] as MeLookup[]) {
      given(lookup);
      expect(await FamilyPage()).toBeNull();
      expect(await ChildPage({ params: Promise.resolve({ childId: ILO }) })).toBeNull();
    }
    expect(session.requests).toEqual([]);
  });

  it("say a failed list on /family once, under the heading", async () => {
    given({ kind: "ok", me });
    render(await FamilyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeInTheDocument();
    expect(
      screen.getByText("We could not load your family just now. Reload the page to try again."),
    ).toBeInTheDocument();
  });

  it("show the empty state with its one action when no child is listed", async () => {
    given({ kind: "ok", me });
    session.answer = (url) =>
      url.pathname === "/api/v1/children" ? json({ items: [], nextCursor: null }) : json({}, 404);
    render(await FamilyPage());
    expect(screen.getByRole("region", { name: "No child added yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add a child" })).toHaveLength(1);
  });

  it("call notFound() for a malformed id without asking, and for a child the API will not show", async () => {
    given({ kind: "ok", me });
    await expect(
      ChildPage({ params: Promise.resolve({ childId: "child" }) }),
    ).rejects.toBeInstanceOf(session.NotFound);
    expect(session.requests).toEqual([]);
    session.answer = () => json({ code: "not_found" }, 404);
    await expect(ChildPage({ params: Promise.resolve({ childId: ILO }) })).rejects.toBeInstanceOf(
      session.NotFound,
    );
  });

  it("say a failed read of the child under the page's heading", async () => {
    given({ kind: "ok", me });
    render(await ChildPage({ params: Promise.resolve({ childId: ILO }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeInTheDocument();
    expect(
      screen.getByText("We could not load this child just now. Reload the page to try again."),
    ).toBeInTheDocument();
  });

  it("hold the known parts while they read: the heading, the way back, and busy placeholders", () => {
    const { unmount } = render(<FamilyLoading />);
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeInTheDocument();
    expect(screen.getByText("Loading your family")).toBeInTheDocument();
    unmount();
    render(<ChildLoading />);
    expect(screen.getByRole("link", { name: "Back to Family" })).toHaveAttribute("href", "/family");
    expect(screen.getByText("Loading this child")).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-busy='true']")).toHaveLength(2);
  });
});
