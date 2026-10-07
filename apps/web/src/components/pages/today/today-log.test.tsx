import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CycleEntry, Note } from "@tidefern/schemas";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QuickLogProvider } from "@/components/ui/quick-log";
import { dayStateFrom, emptyDay, type DayState } from "@/lib/day-log";
import { LogTodayAction, TodayLogCard, TodayLogProvider, loggedSummary } from "./today-log";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const today = "2026-10-05";
const subjectId = "018f5e7a-5eed-7000-8000-000000000001";

function entry(patch: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: "018f5e7a-5eed-7010-8000-000000000001",
    subjectId,
    date: today,
    flow: "medium",
    period: true,
    symptoms: ["cramps", "fatigue"],
    mood: "steady",
    version: 3,
    updatedAt: "2026-10-05T08:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

function privateNote(): Note {
  return {
    id: "018f5e7a-5eed-7040-8000-000000000001",
    subjectId,
    authorId: subjectId,
    category: "journal.private",
    date: today,
    body: "Slept badly.",
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
    version: 1,
  };
}

beforeAll(() => {
  // jsdom draws <dialog> but does not open it as a modal; the sheet only needs the attribute.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

/** jsdom lays nothing out; this says whether the open card's form is on screen, as the container query would. */
function formOnScreen(shown: boolean) {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function rects(
    this: HTMLElement,
  ) {
    const list = shown && this.querySelector("form") !== null ? [new DOMRect(0, 0, 400, 600)] : [];
    return Object.assign(list, {
      item: (index: number) => list[index] ?? null,
    }) as unknown as DOMRectList;
  });
}

/** The shell's quick-log button, fed by whatever Today registered (CurrentShell does the same). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <QuickLogProvider>
      {(opener) => (
        <>
          <button type="button" onClick={opener} disabled={opener === undefined}>
            Shell quick log
          </button>
          {children}
        </>
      )}
    </QuickLogProvider>
  );
}

function renderToday(initial: DayState | null, extra?: React.ReactNode) {
  return render(
    <Shell>
      <TodayLogProvider stage="cycle" today={today} initial={initial}>
        <TodayLogCard stage="cycle" today={today} initial={initial} />
        {extra}
      </TodayLogProvider>
    </Shell>,
  );
}

describe("loggedSummary", () => {
  it("says what is logged in the sheet's own labels, and the private note", () => {
    const day = dayStateFrom(today, [entry()], [privateNote()]);
    expect(loggedSummary(day)).toBe(
      "Logged for today: medium flow, cramps, fatigue, steady mood, a private note.",
    );
  });

  it("names spotting and an explicit none as what they are, never as a period", () => {
    const spotting = dayStateFrom(
      today,
      [entry({ flow: "spotting", symptoms: [], mood: null })],
      [],
    );
    expect(loggedSummary(spotting)).toBe("Logged for today: spotting.");
    const none = dayStateFrom(today, [entry({ flow: "none", symptoms: [], mood: "low" })], []);
    expect(loggedSummary(none)).toBe("Logged for today: no flow, low mood.");
  });

  it("says nothing is logged for an empty day, and nothing at all when the day was not read", () => {
    expect(loggedSummary(emptyDay(today))).toBe("Nothing logged for today yet.");
    expect(loggedSummary(null)).toBeNull();
  });
});

describe("Today's open card", () => {
  it("is headed Log today with the date, holds the form and a summary with its one button", () => {
    renderToday(dayStateFrom(today, [entry()], []));
    const card = screen.getByRole("region", { name: "Log today" });
    expect(within(card).getByText("Monday, Oct 5")).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: "Medium" })).toBeChecked();
    expect(
      within(card).getByText("Logged for today: medium flow, cramps, fatigue, steady mood."),
    ).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Log today" })).toBeInTheDocument();
    expect(card).toHaveAttribute("id", "log-today");
    // The card is a surface: warmth never hosts a form control (DESIGN.md 8).
    expect(card).not.toHaveClass("warmth");
  });

  it("gives the shell's quick log an action once Today is on screen", () => {
    renderToday(emptyDay(today));
    expect(screen.getByRole("button", { name: "Shell quick log" })).toBeEnabled();
  });

  it("opens the day sheet from the shell's quick log when the form is not on screen (a phone)", async () => {
    formOnScreen(false);
    const user = userEvent.setup();
    renderToday(emptyDay(today));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Shell quick log" }));
    const sheet = await screen.findByRole("dialog", { name: "Monday, Oct 5" });
    expect(sheet).toHaveAttribute("open");
    // The sheet opens on what the server read: no request is needed for today.
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeInTheDocument();
    // The sheet's close button beside the handle (the form's own Close says the same).
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    expect(sheet).not.toHaveAttribute("open");
  });

  it("moves focus to the open card instead when its form is on screen (from 1024 px)", async () => {
    formOnScreen(true);
    const user = userEvent.setup();
    renderToday(emptyDay(today));
    await user.click(screen.getByRole("button", { name: "Shell quick log" }));
    expect(screen.getByRole("region", { name: "Log today" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the sheet from the card's own button and from a quiet card's action", async () => {
    formOnScreen(false);
    const user = userEvent.setup();
    renderToday(emptyDay(today), <LogTodayAction>Log a period when it comes</LogTodayAction>);
    await user.click(screen.getByRole("button", { name: "Log a period when it comes" }));
    const sheet = await screen.findByRole("dialog", { name: "Monday, Oct 5" });
    expect(sheet).toHaveAttribute("open");
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    expect(sheet).not.toHaveAttribute("open");
    const card = screen.getByRole("region", { name: "Log today" });
    await user.click(within(card).getByRole("button", { name: "Log today" }));
    expect(screen.getByRole("dialog", { name: "Monday, Oct 5" })).toHaveAttribute("open");
  });

  it("loads today in the browser when the server could not read it", async () => {
    const fetches: string[] = [];
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      const url = new URL((input as Request).url);
      fetches.push(`${url.pathname}${url.search}`);
      return Response.json({ items: [], nextCursor: null });
    });
    renderToday(null);
    expect(await screen.findByRole("switch", { name: "Period" })).toBeInTheDocument();
    expect(fetches.sort()).toEqual([
      "/api/v1/cycle/entries?from=2026-10-05&to=2026-10-05",
      "/api/v1/notes?from=2026-10-05&to=2026-10-05",
    ]);
    // Without the server's read the card says nothing about what is logged.
    expect(screen.queryByText(/Logged for today|Nothing logged for today/)).not.toBeInTheDocument();
  });
});
