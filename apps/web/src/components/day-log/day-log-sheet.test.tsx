import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CycleEntry, Note } from "@tidefern/schemas";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dayStateFrom, type DayState } from "@/lib/day-log";
import { DayLogInline, DayLogPage, DayLogSheet } from "./day-log-sheet";
import { UNDO_WINDOW_MS } from "./use-day-log";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const today = "2026-10-05";
const subjectId = "018f5e7a-5eed-7000-8000-000000000001";
const noteId = "018f5e7a-5eed-7040-8000-000000000001";

function entry(patch: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: "018f5e7a-5eed-7010-8000-000000000001",
    subjectId,
    date: today,
    flow: "medium",
    period: true,
    symptoms: ["cramps"],
    mood: "steady",
    version: 3,
    updatedAt: "2026-10-05T08:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

function note(patch: Partial<Note> = {}): Note {
  return {
    id: noteId,
    subjectId,
    authorId: subjectId,
    category: "journal.private",
    date: today,
    body: "Slept badly.",
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
    version: 1,
    ...patch,
  };
}

interface Call {
  method: string;
  path: string;
  query: string;
  ifMatch: string | null;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let routes: Map<string, Array<() => Response | Promise<Response>>>;

function route(key: string, ...answers: Array<() => Response | Promise<Response>>) {
  routes.set(key, [...(routes.get(key) ?? []), ...answers]);
}

const json =
  (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  () =>
    Response.json(body, { status, headers });
const empty = (status: number) => () => new Response(null, { status });
/** A request that never gets an answer, as when the connection drops. */
const dropped = () => {
  throw new TypeError("Failed to fetch");
};

beforeAll(() => {
  // jsdom draws <dialog> but does not open it as a modal; the sheet only needs the attribute.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  calls = [];
  routes = new Map();
  refresh.mockClear();
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      ifMatch: request.headers.get("if-match"),
      key: request.headers.get("idempotency-key"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    const next = routes.get(`${request.method} ${url.pathname}`)?.shift();
    if (next === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
    return next();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function loadsTheDay(entries: CycleEntry[] = [entry()], notes: Note[] = [note()]) {
  route("GET /api/v1/cycle/entries", json({ items: entries, nextCursor: null }));
  route("GET /api/v1/notes", json({ items: notes, nextCursor: null }));
}

describe("DayLogSheet", () => {
  it("loads the day with dates only in the query and opens on what is logged", async () => {
    loadsTheDay();
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    expect(await screen.findByRole("radio", { name: "Medium" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Monday, Oct 5" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("Slept badly.");
    expect(calls.map((call) => `${call.method} ${call.path}${call.query}`).sort()).toEqual([
      "GET /api/v1/cycle/entries?from=2026-10-05&to=2026-10-05",
      "GET /api/v1/notes?from=2026-10-05&to=2026-10-05",
    ]);
  });

  it("saves, says so with Undo for ten seconds, and refreshes the page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    loadsTheDay();
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "low", version: 4 })));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved for Monday, Oct 5.")).toBeVisible();
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.ifMatch).toBe("3");
    expect(put?.body).toEqual({ flow: "medium", symptoms: ["cramps"], mood: "low" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved for Monday, Oct 5.")).toBeVisible();
  });

  it("undoes a save with the compensating write and puts the old values back in the form", async () => {
    const user = userEvent.setup();
    loadsTheDay();
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "low", version: 4 })));
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "steady", version: 5 })));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Changes undone for Monday, Oct 5.")).toBeVisible();
    const undo = calls.filter((call) => call.method === "PUT")[1];
    expect(undo?.ifMatch).toBe("4");
    expect(undo?.body).toEqual({ flow: "medium", symptoms: ["cramps"], mood: "steady" });
    expect(screen.getByRole("radio", { name: "Steady" })).toBeChecked();
    expect(refresh).toHaveBeenCalledTimes(2);
    // The Undo button went away with the undo, so focus is on the line that says what happened.
    expect(
      screen.getByText("Changes undone for Monday, Oct 5.").closest("[tabindex]"),
    ).toHaveFocus();
  });

  it("deletes a day the save created when it is undone", async () => {
    const user = userEvent.setup();
    loadsTheDay([], []);
    route(
      "PUT /api/v1/cycle/entries/2026-10-05",
      json(entry({ flow: "medium", symptoms: [], mood: null, version: 1 })),
    );
    route("DELETE /api/v1/cycle/entries/2026-10-05", empty(204));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("switch", { name: "Period" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await screen.findByText("Changes undone for Monday, Oct 5.");
    const removal = calls.find((call) => call.method === "DELETE");
    expect(removal?.ifMatch).toBe("1");
    expect(screen.getByRole("switch", { name: "Period" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the sheet open on failure, with the error under the part that failed", async () => {
    const user = userEvent.setup();
    loadsTheDay();
    route("PUT /api/v1/cycle/entries/2026-10-05", json({ code: "internal" }, 500));
    route("PUT /api/v1/notes/" + noteId, json(note({ body: "Better now.", version: 2 })));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    const field = screen.getByRole("textbox", { name: "Private note" });
    await user.clear(field);
    await user.type(field, "Better now.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("We could not save this day. Try again.")).toBeVisible();
    expect(screen.queryByText("We could not save your note. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved for Monday, Oct 5.")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    // Try again sends only the part that is still unsaved.
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "low", version: 4 })));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Saved for Monday, Oct 5.")).toBeVisible();
    expect(calls.filter((call) => call.path === `/api/v1/notes/${noteId}`)).toHaveLength(1);
  });

  it("shares the saved note after the confirm step and lists it as shared", async () => {
    const user = userEvent.setup();
    loadsTheDay();
    route(
      `POST /api/v1/notes/${noteId}/share`,
      json(note({ category: "cycle.symptoms", version: 2 })),
    );
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    expect(await screen.findByText("Note shared.")).toBeVisible();
    const share = calls.find((call) => call.path.endsWith("/share"));
    expect(share?.ifMatch).toBe("1");
    expect(share?.body).toEqual({ category: "cycle.symptoms" });
    const shared = screen.getByRole("list", { name: "Notes on this day" });
    expect(within(shared).getByText("Shared with people who can see your symptoms")).toBeVisible();
    expect(within(shared).getByText("Slept badly.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("files a pregnancy note under the pregnancy overview", async () => {
    const user = userEvent.setup();
    loadsTheDay([], [note()]);
    route(
      `POST /api/v1/notes/${noteId}/share`,
      json(note({ category: "pregnancy.overview", version: 2 })),
    );
    render(<DayLogSheet stage="pregnancy" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    await screen.findByText("Note shared.");
    expect(calls.find((call) => call.path.endsWith("/share"))?.body).toEqual({
      category: "pregnancy.overview",
    });
  });

  it("shows the note as it is now after a share conflict, and shares only after a fresh confirm", async () => {
    const user = userEvent.setup();
    loadsTheDay([entry()], [note({ body: "Text A" })]);
    route(`POST /api/v1/notes/${noteId}/share`, json({ code: "conflict" }, 409));
    route(`GET /api/v1/notes/${noteId}`, json(note({ body: "Text B from laptop", version: 2 })));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    const conflict = await screen.findByText(
      "This note changed somewhere else. Check it, then share it again.",
    );
    // The field shows the text a share would now send, and the step about the old text is gone.
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("Text B from laptop");
    expect(screen.queryByRole("group", { name: "Share this note?" })).not.toBeInTheDocument();
    expect(conflict.closest("[tabindex]")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(calls.filter((call) => call.path.endsWith("/share"))).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();

    route(
      `POST /api/v1/notes/${noteId}/share`,
      json(note({ body: "Text B from laptop", category: "cycle.symptoms", version: 3 })),
    );
    await user.click(screen.getByRole("button", { name: "Share this note with..." }));
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    // The line about the last attempt stays behind when she opens the step again.
    expect(
      within(confirm).queryByText(
        "This note changed somewhere else. Check it, then share it again.",
      ),
    ).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Share note" }));
    expect(await screen.findByText("Note shared.")).toBeVisible();
    const shares = calls.filter((call) => call.path.endsWith("/share"));
    expect(shares.map((call) => call.ifMatch)).toEqual(["1", "2"]);
    expect(shares[1]?.key).not.toBe(shares[0]?.key);
  });

  it("retries a share whose answer was lost with the same key, so the stored answer completes it", async () => {
    const user = userEvent.setup();
    loadsTheDay([entry()], [note({ body: "Text A" })]);
    route(
      `POST /api/v1/notes/${noteId}/share`,
      dropped,
      json({ id: noteId }, 200, { "Idempotency-Replayed": "true" }),
    );
    route(
      `GET /api/v1/notes/${noteId}`,
      json(note({ body: "Text A", category: "cycle.symptoms", version: 2 })),
    );
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    expect(
      await within(confirm).findByText("We could not share this note. Try again."),
    ).toBeVisible();
    await user.click(within(confirm).getByRole("button", { name: "Share note" }));
    expect(await screen.findByText("Note shared.")).toBeVisible();
    const shares = calls.filter((call) => call.path.endsWith("/share"));
    expect(shares).toHaveLength(2);
    expect(shares[0]?.key).toEqual(expect.any(String));
    expect(shares[1]?.key).toBe(shares[0]?.key);
    const shared = screen.getByRole("list", { name: "Notes on this day" });
    expect(within(shared).getByText("Text A")).toBeVisible();
    // Nothing of the shared note stays behind as an unsaved private copy.
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("counts a share that already landed as shared when the retry meets a moved version", async () => {
    const user = userEvent.setup();
    loadsTheDay([entry()], [note({ body: "Text A" })]);
    route(`POST /api/v1/notes/${noteId}/share`, json({ code: "conflict" }, 409));
    route(
      `GET /api/v1/notes/${noteId}`,
      json(note({ body: "Text A", category: "cycle.symptoms", version: 2 })),
    );
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    expect(await screen.findByText("Note shared.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says a note deleted somewhere else is gone, and empties the field", async () => {
    const user = userEvent.setup();
    loadsTheDay([entry()], [note({ body: "Text A" })]);
    route(`POST /api/v1/notes/${noteId}/share`, json({ code: "not_found" }, 404));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    const gone = await screen.findByText("This note was deleted somewhere else.");
    expect(gone.closest("[tabindex]")).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: /Share this note/ })).not.toBeInTheDocument();
  });

  it("keeps Note shared on screen while the day has changes of its own", async () => {
    const user = userEvent.setup();
    loadsTheDay();
    route(
      `POST /api/v1/notes/${noteId}/share`,
      json(note({ category: "cycle.symptoms", version: 2 })),
    );
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Share this note with..." }));
    await user.click(screen.getByRole("button", { name: "Share note" }));
    const shared = await screen.findByText("Note shared.");
    expect(shared).toBeVisible();
    expect(shared.closest("[tabindex]")).toHaveFocus();
    // The unsaved mood is still hers to save.
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("keeps Undoing on screen until the undo answers, even past the ten seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let answer: (() => void) | null = null;
    loadsTheDay();
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "low", version: 4 })));
    route(
      "PUT /api/v1/cycle/entries/2026-10-05",
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(Response.json(entry({ mood: "steady", version: 5 })));
        }),
    );
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved for Monday, Oct 5.");
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS - 300);
    });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const pending = screen.getByRole("button", { name: "Undoing" });
    expect(pending).toHaveFocus();
    await act(async () => {
      answer?.();
    });
    expect(await screen.findByText("Changes undone for Monday, Oct 5.")).toBeVisible();
  });

  it("says an ended session once, under the day's fields, without Try again", async () => {
    const user = userEvent.setup();
    loadsTheDay();
    route("PUT /api/v1/cycle/entries/2026-10-05", json({ code: "unauthenticated" }, 401));
    route(`PUT /api/v1/notes/${noteId}`, json({ code: "unauthenticated" }, 401));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    await user.click(await screen.findByRole("radio", { name: "Low" }));
    await user.type(screen.getByRole("textbox", { name: "Private note" }), " Better now.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findAllByText(
        "Your session has ended. Sign in again, then come back to this day.",
      ),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers no Try again when the day could not be loaded because the session ended", async () => {
    route("GET /api/v1/cycle/entries", json({ code: "unauthenticated" }, 401));
    route("GET /api/v1/notes", json({ code: "unauthenticated" }, 401));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    expect(
      await screen.findByText("Your session has ended. Sign in again, then come back to this day."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("says what to do when the day could not be loaded, and loads again", async () => {
    const user = userEvent.setup();
    route("GET /api/v1/cycle/entries", json({ code: "internal" }, 500));
    route("GET /api/v1/notes", json({ items: [], nextCursor: null }));
    render(<DayLogSheet stage="cycle" today={today} date={today} onClose={() => {}} />);
    expect(await screen.findByText("We could not load this day. Try again.")).toBeVisible();
    loadsTheDay();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: "Medium" })).toBeChecked();
  });

  it("moves by a day, never past today, and loads the day it moves to", async () => {
    const user = userEvent.setup();
    const onDateChange = vi.fn();
    loadsTheDay();
    const { rerender } = render(
      <DayLogSheet
        stage="cycle"
        today={today}
        date={today}
        onClose={() => {}}
        onDateChange={onDateChange}
      />,
    );
    await screen.findByRole("radio", { name: "Medium" });
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onDateChange).toHaveBeenCalledWith("2026-10-04");
    loadsTheDay([entry({ date: "2026-10-04", flow: "heavy" })], []);
    rerender(
      <DayLogSheet
        stage="cycle"
        today={today}
        date="2026-10-04"
        onClose={() => {}}
        onDateChange={onDateChange}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Sunday, Oct 4" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Heavy" })).toBeChecked());
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
  });

  it("renders nothing for the none stage, which is never asked a body question", () => {
    const { container } = render(
      <DayLogSheet stage="none" today={today} date={today} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(calls).toHaveLength(0);
  });
});

describe("DayLogInline", () => {
  const initial: DayState = dayStateFrom(today, [entry()], [note()]);

  it("starts from the server's read without a request, and saves from the page", async () => {
    const user = userEvent.setup();
    route("PUT /api/v1/cycle/entries/2026-10-05", json(entry({ mood: "bright", version: 4 })));
    render(<DayLogInline stage="cycle" today={today} initial={initial} />);
    expect(screen.getByRole("radio", { name: "Steady" })).toBeChecked();
    expect(calls).toHaveLength(0);
    await user.click(screen.getByRole("radio", { name: "Bright" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved for Monday, Oct 5.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("takes a newer read of the day from the server, never an older one", () => {
    const { rerender } = render(<DayLogInline stage="cycle" today={today} initial={initial} />);
    const newer = dayStateFrom(today, [entry({ mood: "low", version: 5 })], [note()]);
    rerender(<DayLogInline stage="cycle" today={today} initial={newer} />);
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    rerender(<DayLogInline stage="cycle" today={today} initial={initial} />);
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
  });
});

describe("DayLogPage", () => {
  it("is the page at /log/[date]: an h1 and the neighbouring days as links", () => {
    const initial = dayStateFrom(today, [entry()], []);
    render(<DayLogPage stage="cycle" today={today} date={today} initial={initial} />);
    expect(screen.getByRole("heading", { level: 1, name: "Monday, Oct 5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous day" })).toHaveAttribute(
      "href",
      "/log/2026-10-04",
    );
    expect(screen.queryByRole("link", { name: "Next day" })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Close" })) {
      expect(link).toHaveAttribute("href", "/calendar");
    }
    expect(calls).toHaveLength(0);
  });
});
