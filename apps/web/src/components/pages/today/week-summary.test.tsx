import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { WeekSummary, weekSentences } from "./week-summary";

describe("weekSentences", () => {
  it("says the logged period, the fertile days with the contraception line, and the next period", () => {
    expect(
      weekSentences({
        logged: { start: "2026-10-03", end: "2026-10-05" },
        fertile: { start: "2026-10-12", end: "2026-10-17" },
        nextPeriod: { start: "2026-10-28", end: "2026-11-03" },
      }),
    ).toEqual([
      "Period logged Oct 3 to 5.",
      `Oct 12 to 17 are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`,
      "Your next period will likely start between Oct 28 and Nov 3.",
    ]);
  });

  it("says one day as one day, and nothing for a week with no period days", () => {
    expect(
      weekSentences({
        logged: { start: "2026-10-05", end: "2026-10-05" },
        fertile: null,
        nextPeriod: null,
      }),
    ).toEqual(["Period logged Oct 5."]);
    expect(weekSentences({ logged: null, fertile: null, nextPeriod: null })).toEqual([
      "No period days logged or estimated this week.",
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
      />,
    );
    const card = screen.getByRole("region", { name: "This week" });
    expect(card).toHaveClass("warmth");
    expect(card).toHaveTextContent("Period logged Oct 3 to 5.");
    expect(card.querySelector("button, a, input, select, textarea")).toBeNull();
  });
});
