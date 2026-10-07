import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CyclePrediction } from "@tidefern/schemas";
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

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

function renderCalendar(props: Partial<CalendarViewProps> = {}) {
  return render(
    <CalendarView
      today={today}
      month="2026-10-01"
      initialView="month"
      weekStart={1}
      stage="cycle"
      days={october}
      prediction={estimate}
      {...props}
    />,
  );
}

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
  push.mockClear();
  refresh.mockClear();
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
    expect(
      screen.getByRole("button", { name: /^Saturday, October 17, 2026, .*ovulation estimated$/ }),
    ).toBeInTheDocument();
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
    renderCalendar({ initialView: "list" });
    const row = screen.getByRole("link", { name: /^Sun, Oct 4/ });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "Sunday, Oct 4" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("moves by month with the view kept, and never past today's month", async () => {
    const user = userEvent.setup();
    renderCalendar({ initialView: "list" });
    expect(screen.getByRole("heading", { level: 2, name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(push).toHaveBeenLastCalledWith("/calendar?month=2026-09&view=list", { scroll: false });
  });

  it("shows the list's own empty state and no week strip for another month", () => {
    renderCalendar({ initialView: "list", month: "2026-07-01", days: [] });
    expect(screen.queryByRole("list", { name: "This week" })).toBeNull();
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    expect(
      screen.getByText("Days you log show up here as a list you can scan."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log today" })).toBeInTheDocument();
  });
});

describe("by stage", () => {
  it("asks the none stage no body question: the empty state without a log action, and no sheet", async () => {
    const user = userEvent.setup();
    renderCalendar({ stage: "none", days: [], prediction: null });
    expect(screen.getByRole("region", { name: "Nothing logged this month" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log today" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Thursday, October 1, 2026/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(PREDICTION_FOOTER)).toBeNull();
    expect(fetches).toEqual([]);
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

  // Escape and the return of focus are the browser's dialog behavior: calendar.spec.ts proves them.
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
