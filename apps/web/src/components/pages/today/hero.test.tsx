import { render, screen, within } from "@testing-library/react";
import { MAX_PLAUSIBLE, MIN_PLAUSIBLE } from "@tidefern/core";
import type { CyclePrediction } from "@tidefern/schemas";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyDay } from "@/lib/day-log";
import { CARE_SENTENCE, CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { CycleHero, EmptyHero, PregnancyHero, QuietHero, numeralParts } from "./hero";
import { TodayLogProvider } from "./today-log";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const today = "2026-10-05";

function prediction(patch: Partial<CyclePrediction> = {}): CyclePrediction {
  return {
    subjectId: "018f5e7a-5eed-7000-8000-000000000001",
    computedAt: "2026-10-05T00:00:00.000Z",
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
    ...patch,
  };
}

function cycle(patch: Partial<CyclePrediction> = {}, nudge = true) {
  return render(
    <CycleHero
      today={today}
      prediction={prediction(patch)}
      cycleDay={3}
      latestStart="2026-10-03"
      loggedDays={["2026-10-03", "2026-10-04", "2026-10-05"]}
      nudge={nudge}
      child={null}
    />,
  );
}

/**
 * The column beside the ring. In a browser Today's stylesheet hides the
 * ring's own caption and dial numeral (the column says them once); jsdom
 * applies no stylesheet, so the sentences are looked for in the column.
 */
function column(): HTMLElement {
  return screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
}

function withLog(children: ReactNode) {
  return render(
    <TodayLogProvider stage="cycle" today={today} initial={emptyDay(today)}>
      {children}
    </TodayLogProvider>,
  );
}

describe("CycleHero", () => {
  it("heads the page with today and sets the cycle day beside its label", () => {
    cycle();
    expect(screen.getByRole("heading", { level: 1, name: "Today, Monday, Oct 5" })).toBeVisible();
    expect(within(column()).getByText("3")).toHaveClass("numeral");
    expect(within(column()).getByText("day of your cycle")).toHaveClass("numeralLabel");
    expect(screen.getByRole("img", { name: "Cycle day 3 of about 28" })).toBeInTheDocument();
  });

  it("keeps the ring's markup that Today's stylesheet hides where the stylesheet expects it", () => {
    // today.module.css hides `.ringCell > .ring > figcaption` and `.ringCell > .ring > div > p`;
    // if CycleRing's markup moves, this fails before a browser shows the sentences twice.
    cycle();
    const figure = screen.getByRole("img", { name: "Cycle day 3 of about 28" }).closest("figure");
    expect(figure).toHaveClass("ring");
    expect(figure?.parentElement).toHaveClass("ringCell");
    expect(figure?.querySelector(":scope > figcaption")).not.toBeNull();
    expect(figure?.querySelector(":scope > div > p")).toHaveTextContent("3day");
  });

  it("says the estimate and the ovulation band with the 13.10 templates, word for word", () => {
    cycle();
    expect(
      within(column()).getByText(
        "Based on your last 2 cycles, your next period will likely start between Oct 28 and Nov 3.",
      ),
    ).toHaveClass("estimate");
    const ovulation = within(column()).getByText(/^Ovulation is estimated around/);
    expect(ovulation).toHaveTextContent(
      `Ovulation is estimated around Oct 17 (Oct 15 to 19). Oct 12 to 17 are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`,
    );
    // The contraception tail is set quieter, as the composition shows it.
    expect(within(ovulation).getByText(CONTRACEPTION_LINE)).toHaveClass("muted");
  });

  it("says a first guess as a rough guess with its ovulation band", () => {
    cycle({
      basis: "first_guess",
      sampleSize: 0,
      uncertaintyDays: 4,
      nextPeriod: { expected: "2026-10-31", start: "2026-10-27", end: "2026-11-04" },
    });
    expect(
      within(column()).getByText(
        "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 31, give or take 4 days.",
      ),
    ).toBeVisible();
    expect(within(column()).getByText(/^Ovulation is estimated around Oct 17/)).toBeVisible();
  });

  it("offers no date and no fertile days when the cycles are too different", () => {
    cycle({
      basis: "not_enough_regular_cycles",
      cycleLength: null,
      sampleSize: 0,
      nextPeriod: null,
      ovulation: null,
      fertileWindow: null,
    });
    expect(
      within(column()).getByText(
        "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Ovulation is estimated/)).not.toBeInTheDocument();
    expect(screen.queryByText(CONTRACEPTION_LINE)).not.toBeInTheDocument();
  });

  it("adds the deviation nudge with its way to the calendar in the cycle stage only", () => {
    const irregular = {
      irregular: true,
      sampleSize: 6,
      cycleLengthRange: { min: 24, max: 39 },
      uncertaintyDays: 5,
    };
    const { unmount } = cycle(irregular);
    const nudge = screen.getByText(/^Your last 6 cycles ranged from 24 to 39 days\./);
    expect(nudge).toHaveTextContent(
      "Your last 6 cycles ranged from 24 to 39 days. Variation like this is common, and it is worth mentioning to your doctor or midwife.",
    );
    expect(
      within(nudge).getByRole("link", { name: "Review your cycles in the calendar" }),
    ).toHaveAttribute("href", "/calendar");
    unmount();
    cycle(irregular, false);
    expect(screen.queryByText(/cycles ranged from/)).not.toBeInTheDocument();
  });

  it("points to care only when the API flags it", () => {
    const { unmount } = cycle();
    expect(screen.queryByText(CARE_SENTENCE)).not.toBeInTheDocument();
    unmount();
    cycle({ pointToCare: true, daysLate: 16 });
    expect(screen.getByText(CARE_SENTENCE)).toBeVisible();
  });

  it("explains the estimate in a native disclosure, its wording left to the owner", () => {
    cycle();
    const summary = screen.getByText("How this is estimated");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent("[OWNER]");
    expect(details).toHaveTextContent(`${MIN_PLAUSIBLE} to ${MAX_PLAUSIBLE} days`);
  });
});

describe("EmptyHero", () => {
  it("draws the bare track and says CONTENT.md's empty state with its one action", () => {
    withLog(<EmptyHero today={today} />);
    expect(screen.getByRole("heading", { level: 2, name: "Nothing logged yet" })).toBeVisible();
    expect(
      within(column()).getByText(
        "Log your last period start and Tidefern can place you in your cycle.",
      ),
    ).toBeVisible();
    // The column's action opens the quick log; the ring's own link (to /log) is hidden with its caption.
    expect(within(column()).getByRole("button", { name: "Log a period" })).toBeVisible();
    const ring = screen.getByRole("img", { name: "Nothing logged yet" });
    expect(ring.querySelectorAll("path")).toHaveLength(0);
    expect(screen.queryByText(/next period/)).not.toBeInTheDocument();
  });
});

describe("QuietHero", () => {
  it("is CONTENT.md's quiet card after an ending: no prediction, no fertile window", () => {
    withLog(<QuietHero today={today} feeding={false} child={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "When you are ready" })).toBeVisible();
    expect(screen.getByText("Predictions are paused until a period is logged.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Log a period when it comes" })).toBeVisible();
    expect(screen.queryByText(/OWNER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fertile|Ovulation/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("adds the child's age and the owner's feeding line after a birth", () => {
    withLog(
      <QuietHero
        today={today}
        feeding
        child={{
          ok: true,
          value: { id: "018f5e7a-5eed-7006-8000-000000000001", name: "Ilo", age: "6 weeks, 1 day" },
        }}
      />,
    );
    const age = screen.getByText("Ilo").closest("p");
    expect(age).toHaveTextContent("Ilo 6 weeks, 1 day");
    expect(
      screen.getByText(/\[OWNER\] a line that cycles often return later while feeding/),
    ).toBeVisible();
  });

  it("says what to do when the children could not be read", () => {
    withLog(<QuietHero today={today} feeding child={{ ok: false }} />);
    expect(
      screen.getByText("We could not load your children just now. Reload the page to try again."),
    ).toBeVisible();
  });
});

describe("PregnancyHero", () => {
  it("puts the week card in the ring's place, on warmth", () => {
    render(
      <PregnancyHero
        today={today}
        pregnancy={{ ok: true, value: { dueDate: "2027-02-07", method: "ultrasound" } }}
      />,
    );
    const card = screen.getByRole("region", { name: "This week" });
    expect(card).toHaveTextContent(/Week\s*22/);
    expect(card).toHaveTextContent("Feb 7, 2027");
    expect(card).toHaveTextContent("Dated from an ultrasound.");
    expect(within(card).getByRole("link", { name: "History" })).toHaveAttribute("href", "/journey");
  });

  it("says what to do when the pregnancy could not be read", () => {
    render(<PregnancyHero today={today} pregnancy={{ ok: false }} />);
    expect(
      screen.getByText("We could not load this week just now. Reload the page to try again."),
    ).toBeVisible();
  });
});

describe("numeralParts", () => {
  it("finds each number and its words in an age", () => {
    expect(numeralParts("4 weeks, 3 days")).toEqual([
      { numeral: "4", label: "weeks," },
      { numeral: "3", label: "days" },
    ]);
    expect(numeralParts("2 years, 6 months")).toEqual([
      { numeral: "2", label: "years," },
      { numeral: "6", label: "months" },
    ]);
    expect(numeralParts("Born today")).toBeNull();
  });
});
