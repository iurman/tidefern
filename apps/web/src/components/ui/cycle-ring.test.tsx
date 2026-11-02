import { render, screen } from "@testing-library/react";
import type { CyclePrediction } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { CycleRing, cycleDaySentence, latestStartFrom } from "./cycle-ring";

const today = "2026-10-05";

/**
 * The ring now draws the API's answer (GET /v1/cycle/predictions) instead of
 * running core's predictor over period starts the API never returns, so the
 * fixtures are API answers. They are the same cycles as before: four
 * completed cycles of 28 days with the latest start on Sep 24, so today is
 * day 12 and every sentence below is unchanged.
 */
const base: CyclePrediction = {
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  computedAt: "2026-10-05T08:00:00.000Z",
  basis: "estimate",
  cycleLength: 28,
  sampleSize: 4,
  nextPeriod: { expected: "2026-10-22", start: "2026-10-20", end: "2026-10-24" },
  ovulation: { expected: "2026-10-08", start: "2026-10-06", end: "2026-10-10" },
  fertileWindow: { start: "2026-10-03", end: "2026-10-08" },
  uncertaintyDays: 2,
  ovulationBandDays: 2,
};

const firstGuess: CyclePrediction = {
  ...base,
  basis: "first_guess",
  sampleSize: 0,
  nextPeriod: { expected: "2026-10-22", start: "2026-10-18", end: "2026-10-26" },
  uncertaintyDays: 4,
};

const notEnough: CyclePrediction = {
  ...base,
  basis: "not_enough_regular_cycles",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 4,
};

const latestStart = "2026-09-24";

const loggedDays = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];

describe("CycleRing", () => {
  it("names itself by the cycle day and draws every texture for an estimate", () => {
    render(
      <CycleRing
        today={today}
        prediction={base}
        latestStart={latestStart}
        loggedDays={loggedDays}
      />,
    );
    expect(screen.getByRole("img", { name: "Cycle day 12 of about 28" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Based on your last 4 cycles, your next period will likely start between Oct 20 and Oct 24.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ovulation is estimated around Oct 8 (Oct 6 to 10). Oct 3 to 8 are the days pregnancy is most likely. An estimate from your logged dates. Not a form of contraception.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Period logged Sep 24 to 28\./)).toBeInTheDocument();
    expect(document.querySelectorAll(".logged")).toHaveLength(1);
    expect(document.querySelectorAll(".predicted")).toHaveLength(1);
    expect(document.querySelectorAll(".fertile")).toHaveLength(1);
    expect(document.querySelectorAll(".ovulation")).toHaveLength(1);
    expect(document.querySelectorAll(".today")).toHaveLength(1);
    expect(document.querySelectorAll(".progress")).toHaveLength(2);
    expect(document.querySelector(".numeral")).toHaveTextContent("12");
  });

  it("draws only the dashed and dotted arcs for a first guess", () => {
    render(
      <CycleRing
        today={today}
        prediction={firstGuess}
        latestStart={latestStart}
        loggedDays={loggedDays}
      />,
    );
    expect(screen.getByRole("img", { name: "Cycle day 12 of about 28" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 22, give or take 4 days.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".logged")).toHaveLength(0);
    expect(document.querySelectorAll(".predicted")).toHaveLength(1);
    expect(document.querySelectorAll(".fertile")).toHaveLength(1);
  });

  it("draws the track and the logged arc only when cycles are too different", () => {
    render(
      <CycleRing
        today={today}
        prediction={notEnough}
        latestStart={latestStart}
        loggedDays={loggedDays}
      />,
    );
    expect(screen.getByRole("img", { name: "Cycle day 12" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".logged")).toHaveLength(1);
    expect(document.querySelectorAll(".predicted")).toHaveLength(0);
    expect(document.querySelectorAll(".fertile")).toHaveLength(0);
    expect(document.querySelectorAll(".ovulation")).toHaveLength(0);
  });

  it("follows the empty state formula with one action", () => {
    render(<CycleRing today={today} prediction={null} latestStart={null} logHref="/log" />);
    expect(screen.getByRole("img", { name: "Nothing logged yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Log your last period start and Tidefern can place you in your cycle."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log a period" })).toHaveAttribute("href", "/log");
    expect(document.querySelectorAll(".today")).toHaveLength(0);
  });

  it("sends the empty state's action to today's day page when no address is given", () => {
    // Today's empty hero gives none; a bare /log is no route and answered 404.
    render(<CycleRing today={today} prediction={null} latestStart={null} />);
    expect(screen.getByRole("link", { name: "Log a period" })).toHaveAttribute(
      "href",
      "/log/2026-10-05",
    );
  });

  it("draws nothing predicted for basis none, which offers no date", () => {
    const none: CyclePrediction = {
      ...notEnough,
      basis: "none",
      uncertaintyDays: 0,
    };
    render(<CycleRing today={today} prediction={none} latestStart={null} />);
    expect(screen.getByRole("img", { name: "Nothing logged yet" })).toBeInTheDocument();
    expect(document.querySelectorAll(".predicted")).toHaveLength(0);
    expect(document.querySelectorAll(".progress")).toHaveLength(0);
  });

  it("keeps its size and says so while loading, and names the next step on error", () => {
    const { rerender } = render(
      <CycleRing today={today} prediction={base} latestStart={latestStart} loading />,
    );
    expect(document.querySelector("figure")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("img", { name: "Loading your cycle" })).toBeInTheDocument();
    rerender(
      <CycleRing
        today={today}
        prediction={base}
        latestStart={latestStart}
        error="We could not load your cycle. Try again."
      />,
    );
    expect(screen.getByText("We could not load your cycle. Try again.")).toBeInTheDocument();
    expect(document.querySelectorAll(".progress")).toHaveLength(0);
  });

  /*
   * The ring used to take a `since` date and drop older period starts itself.
   * The pregnancy boundary is now applied by the API (architecture 8.4), so
   * the ring draws what the API answered after a reset: the five days of
   * uncertainty core puts on the first prediction after a pregnancy, as sent.
   */
  it("draws the API's answer after a pregnancy as it is, without filtering anything itself", () => {
    const afterReset: CyclePrediction = {
      ...firstGuess,
      nextPeriod: { expected: "2026-10-22", start: "2026-10-17", end: "2026-10-27" },
      uncertaintyDays: 5,
    };
    render(<CycleRing today={today} prediction={afterReset} latestStart={latestStart} />);
    expect(screen.getByRole("img", { name: "Cycle day 12 of about 28" })).toBeInTheDocument();
    expect(screen.getByText(/give or take 5 days\./)).toBeInTheDocument();
  });
});

describe("cycleDaySentence", () => {
  it("drops the length when no estimate is offered", () => {
    expect(cycleDaySentence(12, 28)).toBe("Cycle day 12 of about 28");
    expect(cycleDaySentence(12, null)).toBe("Cycle day 12");
  });
});

describe("latestStartFrom", () => {
  it("counts back from the status date by the cycle day", () => {
    expect(latestStartFrom({ date: "2026-10-05", cycleDay: 12 })).toBe("2026-09-24");
    expect(latestStartFrom({ date: "2026-10-05", cycleDay: 1 })).toBe("2026-10-05");
    expect(latestStartFrom({ date: "2026-03-01", cycleDay: 2 })).toBe("2026-02-28");
  });

  it("has no start while no period is logged", () => {
    expect(latestStartFrom({ date: "2026-10-05", cycleDay: null })).toBeNull();
  });
});
