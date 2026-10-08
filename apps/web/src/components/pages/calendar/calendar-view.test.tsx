import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CyclePrediction } from "@tidefern/schemas";
import { Suspense, use, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTRACEPTION_LINE,
  NOT_ENOUGH_REGULAR_CYCLES,
  PREDICTION_FOOTER,
} from "@/lib/prediction-copy";
import type { CalendarDay } from "./calendar-model";
import { CalendarView, type CalendarViewProps } from "./calendar-view";

const push = vi.fn();
const refresh = vi.fn();
/** The page's address as `useSearchParams` reads it; Next keeps it in step with replaceState. */
const address = { search: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(address.search),
}));

const today = "2026-10-05";
const subjectId = "018f5e7a-5eed-7000-8000-000000000001";

function day(date: string, patch: Partial<CalendarDay> = {}): CalendarDay {
  return { date, flow: null, symptoms: [], mood: null, note: false, ...patch };
}

/** Noor's October, as the server reads it for a grid that starts on Monday. */
const october: CalendarDay[] = [
  day("2026-10-01", { symptoms: ["tender_breasts", "mood_swings"], mood: "low" }),
  day("2026-10-03", { flow: "medium", symptoms: ["cramps"], mood: "low" }),
  day("2026-10-04", { flow: "heavy", symptoms: ["cramps", "fatigue"], note: true }),
  day("2026-10-05", { flow: "medium", mood: "steady", note: true }),
];

const estimate: CyclePrediction = {
  subjectId,
  computedAt: "2026-10-05T06:00:00.000Z",
  basis: "estimate",
  cycleLength: 28,
  sampleSize: 2,
  nextPeriod: { expected: "2026-10-31", start: "2026-10-28", end: "2026-11-03" },
  ovulation: { expected: "2026-10-17", start: "2026-10-15", end: "2026-10-19" },
  fertileWindow: { start: "2026-10-12", end: "2026-10-17" },
  uncertaintyDays: 3,
  ovulationBandDays: 2,
  irregular: false,
  periodsLogged: 3,
  cycleLengthRange: { min: 28, max: 28 },
  daysLate: 0,
  pointToCare: false,
};

const none: CyclePrediction = {
  ...estimate,
  basis: "none",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 0,
  periodsLogged: 0,
  cycleLengthRange: null,
  daysLate: null,
};

function calendar(props: Partial<CalendarViewProps> = {}) {
  return (
    <CalendarView
      today={today}
      month="2026-10-01"
      weekStart={1}
      stage="cycle"
      days={october}
      prediction={estimate}
      {...props}
    />
  );
}

/** The calendar on an address: "" is /calendar, "view=list" is /calendar?view=list. */
function renderCalendar(props: Partial<CalendarViewProps> = {}, search = "") {
  address.search = search;
  return render(calendar(props));
}

const todayButton = () => screen.getByRole("button", { name: /^Today, Monday, October 5, 2026/ });

let fetches: string[] = [];

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
  push.mockReset();
  refresh.mockClear();
  address.search = "";
  fetches = [];
  // The sheet loads the day it opens on: an empty day, answered for any date.
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const url = new URL((input as Request).url);
    fetches.push(`${url.pathname}${url.search}`);
    return Response.json({ items: [], nextCursor: null });
  });
  vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the month view", () => {
  it("names each day by what it holds: the logged period, the expected band, the fertile window with its contraception line", () => {
    renderCalendar();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();

    const logged = screen.getByRole("button", {
      name: "Sunday, October 4, 2026, period logged, heavy flow, cramps, fatigue, note",
    });
    expect(logged.closest("td")).toHaveClass("logged");
    const expected = screen.getByRole("button", {
      name: "Friday, October 30, 2026, period expected",
    });
    expect(expected.closest("td")).toHaveClass("predicted");
    const fertile = screen.getByRole("button", {
      name: `Monday, October 12, 2026, fertile window estimated. ${CONTRACEPTION_LINE}`,
    });
    expect(fertile.closest("td")).toHaveClass("estimated");
    // The ovulation day says so first; the contraception line still ends its name.
    const ovulation = screen.getByRole("button", {
      name: `Saturday, October 17, 2026, ovulation estimated, fertile window estimated. ${CONTRACEPTION_LINE}`,
    });
    expect(ovulation.closest("td")).toHaveClass("estimated");
    expect(
      screen.getByRole("button", {
        name: "Today, Monday, October 5, 2026, period logged, medium flow, steady mood, note",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("LoggedPredictedEstimated");
  });

  it("says the estimate, the ovulation band with the contraception line, and the footer", () => {
    renderCalendar();
    expect(
      screen.getByText(
        "Based on your last 2 cycles, your next period will likely start between Oct 28 and Nov 3.",
      ),
    ).toHaveClass("estimate");
    expect(
      screen.getByText(
        `Ovulation is estimated around Oct 17 (Oct 15 to 19). Oct 12 to 17 are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(PREDICTION_FOOTER)).toBeInTheDocument();
    expect(screen.queryByText("This is worth mentioning to your doctor or midwife.")).toBeNull();
  });

  it("says a first guess as a first guess, with the dashed and dotted days", () => {
    renderCalendar({
      days: [day("2026-09-25", { flow: "medium" })],
      prediction: {
        ...estimate,
        basis: "first_guess",
        sampleSize: 0,
        cycleLength: 28,
        nextPeriod: { expected: "2026-10-23", start: "2026-10-19", end: "2026-10-27" },
        ovulation: { expected: "2026-10-09", start: "2026-10-07", end: "2026-10-11" },
        fertileWindow: { start: "2026-10-04", end: "2026-10-09" },
        uncertaintyDays: 4,
        periodsLogged: 1,
        cycleLengthRange: null,
      },
    });
    expect(
      screen.getByText(
        "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 23, give or take 4 days.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Monday, October 19, 2026, period expected" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PREDICTION_FOOTER)).toBeInTheDocument();
  });

  it("says not enough regular cycles honestly and draws no dashed or dotted day", () => {
    const { container } = renderCalendar({
      days: [day("2026-09-11", { flow: "light" }), day("2026-09-23", { flow: "light" })],
      prediction: { ...none, basis: "not_enough_regular_cycles", periodsLogged: 2 },
    });
    expect(screen.getByText(NOT_ENOUGH_REGULAR_CYCLES)).toBeInTheDocument();
    expect(screen.queryByText(/Ovulation is estimated/)).toBeNull();
    expect(screen.getByText(PREDICTION_FOOTER)).toBeInTheDocument();
    expect(container.querySelector("td.predicted, td.estimated")).toBeNull();
  });

  it("puts Nothing logged this month outside the grid even when the month has predictions", async () => {
    const user = userEvent.setup();
    renderCalendar({ month: "2026-11-01" });
    expect(
      screen.getByRole("button", { name: "Sunday, November 1, 2026, period expected" }),
    ).toBeInTheDocument();
    const empty = screen.getByRole("region", { name: "Nothing logged this month" });
    expect(empty).toHaveTextContent("Days you log show here with their flow and symptoms.");
    expect(screen.getByRole("grid").contains(empty)).toBe(false);
    // Log today opens today's sheet, wherever the grid is.
    await user.click(within(empty).getByRole("button", { name: "Log today" }));
    expect(await screen.findByRole("heading", { name: "Monday, Oct 5" })).toBeInTheDocument();
  });

  it("opens the day's sheet over the calendar, loading that day by date only", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /^Sunday, October 4, 2026/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sunday, Oct 4" });
    expect(await within(sheet).findByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(fetches.sort()).toEqual([
      "/api/v1/cycle/entries?from=2026-10-04&to=2026-10-04",
      "/api/v1/notes?from=2026-10-04&to=2026-10-04",
    ]);
  });

  it("opens no sheet for a day that has not come, and says why", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /^Friday, October 30, 2026/ }));
    expect(screen.getByText("You can log a day once it has come.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetches).toEqual([]);
  });

  it("moves between months as addresses, and Today comes back only from another month", async () => {
    const user = userEvent.setup();
    const { unmount } = renderCalendar();
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(push).toHaveBeenLastCalledWith("/calendar?month=2026-11", { scroll: false });
    unmount();

    renderCalendar({ month: "2026-08-01" });
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(push).toHaveBeenLastCalledWith("/calendar", { scroll: false });
  });
});

describe("the list view", () => {
  it("swaps in place, keeps the view in the address, and lists the month's days newest first", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("radio", { name: "List" }));
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "/calendar?view=list");
    expect(push).not.toHaveBeenCalled();

    const strip = screen.getByRole("list", { name: "This week" });
    expect(within(strip).getAllByRole("listitem")).toHaveLength(7);
    expect(strip.querySelector('[aria-current="date"]')).toHaveTextContent(/5/);

    const rows = within(screen.getByRole("list", { name: "Days logged in October 2026" }))
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(rows).toEqual([
      [expect.stringMatching(/^Today.*Medium flow, steady mood, note$/), "/log/2026-10-05"],
      ["Sun, Oct 4Heavy flow, cramps, fatigue, note", "/log/2026-10-04"],
      ["Sat, Oct 3Medium flow, cramps, low mood", "/log/2026-10-03"],
      ["Thu, Oct 1Tender breasts, mood swings, low mood", "/log/2026-10-01"],
    ]);
  });

  it("opens a row's day in the sheet instead of leaving the calendar", async () => {
    const user = userEvent.setup();
    renderCalendar({}, "view=list");
    const row = screen.getByRole("link", { name: /^Sun, Oct 4/ });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "Sunday, Oct 4" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("says why a row for a day that has not come opens nothing, right above the rows", async () => {
    // A day after today can hold an entry once her time zone moves west (today moves back a day).
    const user = userEvent.setup();
    renderCalendar({ days: [...october, day("2026-10-07", { mood: "low" })] }, "view=list");
    await user.click(screen.getByRole("link", { name: /^Wed, Oct 7/ }));
    const notice = screen.getByText("You can log a day once it has come.");
    const list = screen.getByRole("list", { name: "Days logged in October 2026" });
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetches).toEqual([]);
  });

  it("moves by month with the view kept, and never past today's month", async () => {
    const user = userEvent.setup();
    renderCalendar({}, "view=list");
    expect(screen.getByRole("heading", { level: 2, name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(push).toHaveBeenLastCalledWith("/calendar?month=2026-09&view=list", { scroll: false });
  });

  it("shows the list's own empty state, with the tide line, and no week strip for another month", () => {
    renderCalendar({ month: "2026-07-01", days: [] }, "view=list");
    expect(screen.queryByRole("list", { name: "This week" })).toBeNull();
    const empty = screen.getByRole("region", { name: "Nothing logged yet" });
    expect(within(empty).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Nothing logged yet",
    );
    expect(empty).toHaveTextContent("Days you log show up here as a list you can scan.");
    expect(empty.querySelector("svg")).not.toBeNull();
    expect(within(empty).getByRole("button", { name: "Log today" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Days logged in July 2026" })).toBeNull();
  });
});

describe("the view follows the address", () => {
  it("goes back to the month when a link to /calendar lands while the list is showing", async () => {
    const user = userEvent.setup();
    const { rerender } = renderCalendar();
    await user.click(screen.getByRole("radio", { name: "List" }));
    // Next's replaceState updates useSearchParams, as a real switch does.
    address.search = "view=list";
    rerender(calendar());
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
    expect(screen.getByRole("list", { name: "This week" })).toBeInTheDocument();

    // The shell's Calendar link (or Back) lands on /calendar: the month view, as a reload would show.
    address.search = "";
    rerender(calendar());
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "This week" })).toBeNull();
  });

  it("opens on the list for an address that names it, and Forward to it brings it back", () => {
    const { rerender } = renderCalendar({}, "view=list");
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
    address.search = "month=2026-09";
    rerender(calendar({ month: "2026-09-01" }));
    expect(screen.getByRole("grid", { name: "September 2026" })).toBeInTheDocument();
    address.search = "view=list";
    rerender(calendar());
    expect(screen.getByRole("heading", { level: 2, name: "October 2026" })).toBeInTheDocument();
  });
});

describe("moving between months while one is still loading", () => {
  const never = new Promise<never>(() => {});

  /**
   * A navigation the server has not answered: push sets state inside the
   * calendar's transition and that state suspends, so the transition stays
   * pending and the server's month prop stays put, as it does while Next.js
   * waits for the next month's render.
   */
  function renderStalled(props: Partial<CalendarViewProps> = {}, search = "") {
    let stall: () => void = () => {};
    push.mockImplementation(() => stall());
    function Stall() {
      const [stalled, setStalled] = useState(false);
      stall = () => setStalled(true);
      if (stalled) use(never);
      return null;
    }
    address.search = search;
    render(
      <Suspense fallback={<p>fallback</p>}>
        {calendar(props)}
        <Stall />
      </Suspense>,
    );
  }

  const pushed = () => push.mock.calls.map((call) => call[0]);

  it("shows the month asked for at once with Loading, so Next twice lands two months on", async () => {
    const user = userEvent.setup();
    renderStalled();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    // Only part of November has been read, so it is not called empty yet.
    expect(screen.queryByRole("region", { name: "Nothing logged this month" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("grid", { name: "December 2026" })).toBeInTheDocument();
    expect(pushed()).toEqual(["/calendar?month=2026-11", "/calendar?month=2026-12"]);
    expect(screen.queryByText("fallback")).toBeNull();
  });

  it("comes back to October for Next then Previous, and Today returns at once", async () => {
    const user = userEvent.setup();
    renderStalled();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await screen.findByRole("grid", { name: "November 2026" });
    expect(screen.getByRole("button", { name: "Today" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(pushed()).toEqual(["/calendar?month=2026-11", "/calendar"]);
  });

  it("steps the list on from the month asked for, and stops at today's month", async () => {
    const user = userEvent.setup();
    renderStalled({ month: "2026-08-01", days: [] }, "view=list");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "September 2026" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "October 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(pushed()).toEqual(["/calendar?month=2026-09&view=list", "/calendar?view=list"]);
    // The list is loading, not empty.
    expect(screen.queryByRole("region", { name: "Nothing logged yet" })).toBeNull();
  });
});

describe("where focus goes when the sheet closes", () => {
  /** The browser's dialog gives focus back to whatever had it, but only while that is still in the page. */
  function dialogFocusAsBrowsersDo() {
    let before: Element | null = null;
    const showModal = HTMLDialogElement.prototype.showModal;
    const close = HTMLDialogElement.prototype.close;
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function open(
      this: HTMLDialogElement,
    ) {
      before = document.activeElement;
      showModal.call(this);
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function shut(
      this: HTMLDialogElement,
    ) {
      close.call(this);
      if (before instanceof HTMLElement && before.isConnected) before.focus();
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  }

  it("lands on the day when Log today went away with the save while the sheet was open", async () => {
    const user = userEvent.setup();
    dialogFocusAsBrowsersDo();
    const { rerender } = renderCalendar({ days: [] });
    const logToday = screen.getByRole("button", { name: "Log today" });
    await user.click(logToday);
    const sheet = await screen.findByRole("dialog", { name: "Monday, Oct 5" });
    // The save's refresh lands with the sheet still open: the month is no longer empty.
    rerender(calendar({ days: [day(today, { mood: "low" })] }));
    expect(logToday).not.toBeInTheDocument();
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(todayButton()).toHaveFocus());
  });

  it("lands on the day when the refresh takes Log today away after the sheet closed", async () => {
    const user = userEvent.setup();
    dialogFocusAsBrowsersDo();
    const { rerender } = renderCalendar({ days: [] });
    const logToday = screen.getByRole("button", { name: "Log today" });
    await user.click(logToday);
    const sheet = await screen.findByRole("dialog", { name: "Monday, Oct 5" });
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(logToday).toHaveFocus());
    rerender(calendar({ days: [day(today, { mood: "low" })] }));
    await waitFor(() => expect(todayButton()).toHaveFocus());
  });

  it("lands on the heading when the day is not in the view either", async () => {
    const user = userEvent.setup();
    dialogFocusAsBrowsersDo();
    // November's grid has no Oct 5; the first log of the month removes its empty state.
    const { rerender } = renderCalendar({ month: "2026-11-01", days: [] });
    await user.click(screen.getByRole("button", { name: "Log today" }));
    const sheet = await screen.findByRole("dialog", { name: "Monday, Oct 5" });
    rerender(calendar({ month: "2026-11-01", days: [day("2026-11-01", { mood: "low" })] }));
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toHaveFocus(),
    );
  });

  it("leaves focus on the day that opened the sheet when it is still there", async () => {
    const user = userEvent.setup();
    dialogFocusAsBrowsersDo();
    renderCalendar();
    const oct4 = screen.getByRole("button", { name: /^Sunday, October 4, 2026/ });
    await user.click(oct4);
    const sheet = await screen.findByRole("dialog", { name: "Sunday, Oct 4" });
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(oct4).toHaveFocus());
  });
});

describe("by stage", () => {
  it("asks the none stage no body question: an empty state without a log action, and nothing to press", async () => {
    const user = userEvent.setup();
    renderCalendar({ stage: "none", days: [], prediction: null });
    expect(screen.getByRole("region", { name: "Nothing logged this month" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log today" })).toBeNull();
    // The grid shows the dates without a control on any of them.
    const oct1 = screen.getByRole("button", { name: /^Thursday, October 1, 2026/ });
    expect(oct1).toBeDisabled();
    expect(todayButton()).toBeDisabled();
    await user.click(oct1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("You can log a day once it has come.")).toBeNull();
    expect(screen.queryByText(PREDICTION_FOOTER)).toBeNull();
    expect(fetches).toEqual([]);
  });

  it("gives the none stage's list nothing to press either", () => {
    renderCalendar({ stage: "none", days: [], prediction: null }, "view=list");
    expect(screen.getByRole("region", { name: "Nothing logged yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log today" })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("shows no prediction during a pregnancy", () => {
    renderCalendar({
      stage: "pregnancy",
      days: [day("2026-09-29", { note: true })],
      prediction: none,
    });
    expect(screen.queryByText(PREDICTION_FOOTER)).toBeNull();
    expect(screen.queryByText(/your next period/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Key" })).toBeNull();
  });

  it("shows the child's age and the quiet card after a birth, with no prediction", () => {
    renderCalendar({
      stage: "postpartum",
      today: "2026-10-04",
      weekStart: 7,
      days: [day("2026-10-02", { note: true })],
      prediction: none,
      childLine: "Ilo, 6 weeks",
    });
    expect(screen.getByText("Ilo, 6 weeks")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "When you are ready" });
    expect(card).toHaveTextContent("Predictions are paused until a period is logged.");
    expect(
      within(card).getByRole("button", { name: "Log a period when it comes" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(PREDICTION_FOOTER)).toBeNull();
    expect(screen.queryByText(/fertile/i)).toBeNull();
  });

  it("keeps the quiet card's button the one action when the month is empty too", () => {
    const quiet = {
      stage: "postpartum" as const,
      today: "2026-10-04",
      weekStart: 7 as const,
      month: "2026-11-01",
      days: [],
      prediction: none,
    };
    const { unmount } = renderCalendar(quiet);
    const empty = screen.getByRole("region", { name: "Nothing logged this month" });
    expect(within(empty).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Log/ }).map((b) => b.textContent)).toEqual([
      "Log a period when it comes",
    ]);
    unmount();

    renderCalendar(quiet, "month=2026-11&view=list");
    const listEmpty = screen.getByRole("region", { name: "Nothing logged yet" });
    expect(within(listEmpty).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Log a period when it comes" })).toBeInTheDocument();
  });

  // Escape and the browser's own return of focus are calendar.spec.ts's to prove.
  it("closes the sheet from its close button and keeps the calendar", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /^Sunday, October 4, 2026/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sunday, Oct 4" });
    await user.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(sheet).not.toHaveAttribute("open"));
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
  });
});
