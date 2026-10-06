import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CycleRing, cycleDaySentence } from "./cycle-ring";

const today = "2026-10-05";

const regularStarts = [
  { date: "2026-06-04" },
  { date: "2026-07-02" },
  { date: "2026-07-30" },
  { date: "2026-08-27" },
  { date: "2026-09-24" },
];

const loggedDays = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];

describe("CycleRing", () => {
  it("names itself by the cycle day and draws every texture for an estimate", () => {
    render(<CycleRing today={today} periodStarts={regularStarts} loggedDays={loggedDays} />);
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
      <CycleRing today={today} periodStarts={[{ date: "2026-09-24" }]} loggedDays={loggedDays} />,
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
        periodStarts={[{ date: "2026-06-04" }, { date: "2026-09-24" }]}
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
    render(<CycleRing today={today} periodStarts={[]} logHref="/log" />);
    expect(screen.getByRole("img", { name: "Nothing logged yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Log your last period start and Tidefern can place you in your cycle."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log a period" })).toHaveAttribute("href", "/log");
    expect(document.querySelectorAll(".today")).toHaveLength(0);
  });

  it("keeps its size and says so while loading, and names the next step on error", () => {
    const { rerender } = render(<CycleRing today={today} periodStarts={regularStarts} loading />);
    expect(document.querySelector("figure")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("img", { name: "Loading your cycle" })).toBeInTheDocument();
    rerender(
      <CycleRing
        today={today}
        periodStarts={regularStarts}
        error="We could not load your cycle. Try again."
      />,
    );
    expect(screen.getByText("We could not load your cycle. Try again.")).toBeInTheDocument();
    expect(document.querySelectorAll(".progress")).toHaveLength(0);
  });

  it("ignores period starts before the reset date", () => {
    render(
      <CycleRing
        today={today}
        periodStarts={[{ date: "2026-03-01" }, { date: "2026-09-24" }]}
        since="2026-08-01"
      />,
    );
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
