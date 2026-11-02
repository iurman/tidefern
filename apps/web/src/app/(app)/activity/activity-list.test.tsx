import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityList } from "./activity-list";
import type { ActivityContext, ActivityEvent, ActivityPage } from "./sentences";

const { refresh, play } = vi.hoisted(() => ({ refresh: vi.fn(), play: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/sound", () => ({ play }));

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";

const context: ActivityContext = {
  me: NOOR,
  names: { [THEO]: "Theo" },
  guardianOf: [],
  timeZone: "Europe/Berlin",
  today: "2026-10-05",
};

function event(n: number, patch: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `018f5e7a-5eed-7050-8000-${String(n).padStart(12, "0")}`,
    action: "session.sign_in",
    actorId: NOOR,
    subjectId: NOOR,
    occurredAt: "2026-10-04T21:00:00.000Z",
    ...patch,
  };
}

const firstPage: ActivityPage = {
  items: [
    event(1, { action: "partner.read", actorId: THEO, category: "cycle.symptoms" }),
    event(2, { occurredAt: "2026-10-04T08:00:00.000Z" }),
  ],
  nextCursor: "MjAyNi0xMC0wNA",
};

interface Call {
  path: string;
  query: string;
}

let calls: Call[] = [];
let answers: Array<() => Response | Promise<Response>> = [];

beforeEach(() => {
  calls = [];
  answers = [];
  refresh.mockClear();
  play.mockClear();
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const url = new URL((input as Request).url);
    calls.push({ path: url.pathname, query: url.search });
    const next = answers.shift();
    if (next === undefined) throw new Error(`unexpected request to ${url.pathname}`);
    return next();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function rows() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("ActivityList", () => {
  it("draws each row as the day in her zone, what happened and who did it, in the API's order", () => {
    render(<ActivityList initial={firstPage} context={context} pageSize={25} />);
    const [first, second] = rows();
    expect(first).toHaveTextContent("Oct 4Viewed your symptomsby Theo");
    expect(second).toHaveTextContent("Oct 4Signed inby you");
    // 21:00 UTC on Oct 4 is 23:00 in Berlin: still Oct 4 there.
    expect(within(first as HTMLElement).getByText("Oct 4")).toHaveAttribute(
      "datetime",
      "2026-10-04",
    );
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("puts an older row's year under its day and keeps it in the date's words", () => {
    const old = event(3, {
      action: "grant.create",
      category: "cycle.status",
      occurredAt: "2025-12-28T12:00:00.000Z",
    });
    render(
      <ActivityList initial={{ items: [old], nextCursor: null }} context={context} pageSize={25} />,
    );
    const time = within(rows()[0] as HTMLElement).getByText("Dec 28", { exact: false });
    expect(time).toHaveAttribute("datetime", "2025-12-28");
    expect(time).toHaveTextContent("Dec 28, 2025");
  });

  it("shows the empty state and no Load more when she has no activity", () => {
    render(
      <ActivityList initial={{ items: [], nextCursor: null }} context={context} pageSize={25} />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "No activity yet" })).toBeVisible();
    expect(screen.getByText("Sign-ins, devices and sharing changes appear here.")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no Load more on the last page", () => {
    render(
      <ActivityList
        initial={{ items: firstPage.items, nextCursor: null }}
        context={context}
        pageSize={25}
      />,
    );
    expect(rows()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("asks for the next page by cursor and size alone, says it is loading, appends it and moves focus to its first row", async () => {
    const user = userEvent.setup();
    let answer: (response: Response) => void = () => {};
    answers.push(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(<ActivityList initial={firstPage} context={context} pageSize={25} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    const busy = screen.getByRole("button", { name: "Loading" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    // The request leaves after the client's own middleware, a few ticks after the press.
    await vi.waitFor(() =>
      expect(calls).toEqual([
        { path: "/api/v1/me/activity", query: "?cursor=MjAyNi0xMC0wNA&limit=25" },
      ]),
    );

    answer(
      Response.json({
        items: [event(4, { action: "export.create", occurredAt: "2026-10-01T09:00:00.000Z" })],
        nextCursor: null,
      }),
    );
    expect(await screen.findByText("Requested a copy of your data")).toBeVisible();
    expect(rows()).toHaveLength(3);
    // Focus moves in an effect after the rows are drawn.
    await vi.waitFor(() => expect(rows()[2]).toHaveFocus());
    expect(screen.queryByRole("button")).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it("keeps the button and says what to do when a page fails, with the error cue each time", async () => {
    const user = userEvent.setup();
    answers.push(
      () => Response.json({ title: "Internal error" }, { status: 500 }),
      () => Response.json({ title: "Internal error" }, { status: 503 }),
      () =>
        Response.json({ items: [event(5, { action: "invitation.create" })], nextCursor: "next" }),
    );
    render(<ActivityList initial={firstPage} context={context} pageSize={25} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("We could not load more activity. Try again.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Error:");
    // The cue plays in the line's own effect, once it is on screen.
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(play).toHaveBeenLastCalledWith("error");
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("We could not load more activity. Try again.")).toBeVisible();
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Sent an invitation")).toBeVisible();
    expect(screen.queryByText("We could not load more activity. Try again.")).toBeNull();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
    expect(calls.map((call) => call.query)).toEqual([
      "?cursor=MjAyNi0xMC0wNA&limit=25",
      "?cursor=MjAyNi0xMC0wNA&limit=25",
      "?cursor=MjAyNi0xMC0wNA&limit=25",
    ]);
  });

  it("asks her to check the connection when no answer comes", async () => {
    const user = userEvent.setup();
    answers.push(() => {
      throw new TypeError("Failed to fetch");
    });
    render(<ActivityList initial={firstPage} context={context} pageSize={25} />);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByText("We could not reach Tidefern. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("sends the page back through the server when the session has ended", async () => {
    const user = userEvent.setup();
    answers.push(() => Response.json({ title: "Unauthorized" }, { status: 401 }));
    render(<ActivityList initial={firstPage} context={context} pageSize={25} />);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
    expect(rows()).toHaveLength(2);
  });
});
