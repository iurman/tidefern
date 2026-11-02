import { render, screen, within } from "@testing-library/react";
import type { CyclePrediction } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { weekLines, weekOf } from "@/app/(app)/today/load";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { WeekSummary, weekSentences } from "./week-summary";

function prediction(patch: Partial<CyclePrediction> = {}): CyclePrediction {
  return {
    subjectId: "018f5e7a-5eed-7000-8000-000000000001",
    computedAt: "2026-10-05T00:00:00.000Z",
    basis: "estimate",
    cycleLength: 28,
    sampleSize: 5,
    nextPeriod: { expected: "2026-10-31", start: "2026-10-29", end: "2026-11-02" },
    ovulation: { expected: "2026-10-17", start: "2026-10-15", end: "2026-10-19" },
    fertileWindow: { start: "2026-10-12", end: "2026-10-17" },
    uncertaintyDays: 2,
    ovulationBandDays: 2,
    irregular: false,
    periodsLogged: 6,
    cycleLengthRange: { min: 27, max: 29 },
    daysLate: 0,
    pointToCare: false,
    ...patch,
  };
}

/** One logged period on Sep 10: core's first guess puts the next start 28 days on, give or take 4. */
const firstGuess = prediction({
  basis: "first_guess",
  sampleSize: 0,
  periodsLogged: 1,
  cycleLengthRange: null,
  uncertaintyDays: 4,
  nextPeriod: { expected: "2026-10-08", start: "2026-10-04", end: "2026-10-12" },
  ovulation: { expected: "2026-09-24", start: "2026-09-22", end: "2026-09-26" },
  fertileWindow: { start: "2026-09-19", end: "2026-09-24" },
});

const FIRST_GUESS =
  "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 8, give or take 4 days.";

describe("weekSentences", () => {
  it("says the logged period, the fertile days with the contraception line, and the 13.10 estimate", () => {
    expect(
      weekSentences(
        {
          logged: { start: "2026-10-03", end: "2026-10-05" },
          fertile: { start: "2026-10-12", end: "2026-10-17" },
          nextPeriod: { start: "2026-10-29", end: "2026-11-02" },
        },
        prediction(),
      ),
    ).toEqual([
      { text: "Period logged Oct 3 to 5.", estimate: false },
      {
        text: `Oct 12 to 17 are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`,
        estimate: false,
      },
      {
        text: "Based on your last 5 cycles, your next period will likely start between Oct 29 and Nov 2.",
        estimate: true,
      },
    ]);
  });

  it("says a first guess touching the week as the first guess, never in the estimate's words", () => {
    // The review's case: a first guess for Oct 8 (Oct 4 to 12) on Monday, Oct 5, week Oct 5 to 11.
    const lines = weekLines(weekOf("2026-10-05", 1), ["2026-09-10"], firstGuess);
    expect(lines).toEqual({
      logged: null,
      nextPeriod: { start: "2026-10-04", end: "2026-10-12" },
      fertile: null,
    });
    const sentences = weekSentences(lines, firstGuess);
    expect(sentences).toEqual([{ text: FIRST_GUESS, estimate: true }]);
    expect(sentences.some((sentence) => sentence.text.includes("will likely start"))).toBe(false);
  });

  it("says one day as one day, and nothing for a week with no period days", () => {
    expect(
      weekSentences(
        { logged: { start: "2026-10-05", end: "2026-10-05" }, fertile: null, nextPeriod: null },
        prediction(),
      ),
    ).toEqual([{ text: "Period logged Oct 5.", estimate: false }]);
    expect(weekSentences({ logged: null, fertile: null, nextPeriod: null }, prediction())).toEqual([
      { text: "No period days logged or estimated this week.", estimate: false },
    ]);
  });
});

describe("WeekSummary", () => {
  it("is This week on warmth, holding no control", () => {
    render(
      <WeekSummary
        week={{
          logged: { start: "2026-10-03", end: "2026-10-05" },
          fertile: null,
          nextPeriod: null,
        }}
        prediction={prediction()}
      />,
    );
    const card = screen.getByRole("region", { name: "This week" });
    expect(card).toHaveClass("warmth");
    expect(card).toHaveTextContent("Period logged Oct 3 to 5.");
    expect(card.querySelector("button, a, input, select, textarea")).toBeNull();
  });

  it("sets the next period as an estimate sentence, in Newsreader italic (signature move 3)", () => {
    render(
      <WeekSummary
        week={{
          logged: null,
          fertile: null,
          nextPeriod: { start: "2026-10-04", end: "2026-10-12" },
        }}
        prediction={firstGuess}
      />,
    );
    const card = screen.getByRole("region", { name: "This week" });
    expect(within(card).getByText(FIRST_GUESS)).toHaveClass("estimate");
    expect(card).not.toHaveTextContent(/will likely start/);
  });
});
