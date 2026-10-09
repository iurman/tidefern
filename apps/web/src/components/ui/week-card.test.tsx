import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekCard, daysToGoSentence } from "./week-card";

const today = "2026-10-05";

describe("daysToGoSentence", () => {
  it("counts down, says due today, and counts past the due date", () => {
    expect(daysToGoSentence(170)).toBe("110 days to go");
    expect(daysToGoSentence(279)).toBe("1 day to go");
    expect(daysToGoSentence(280)).toBe("Due today");
    expect(daysToGoSentence(283)).toBe("3 days past the due date");
  });
});

describe("WeekCard", () => {
  it("shows the week and days as numerals, the range, the trimester bar and the facts", () => {
    render(<WeekCard today={today} dueDate="2027-01-23" method="ultrasound" historyHref="/h" />);
    const week = document.querySelector(".week") as HTMLElement;
    expect(week).toHaveTextContent("Week24and2days");
    expect(week.querySelectorAll(".numeral")).toHaveLength(2);
    expect(screen.getByText("Oct 3 to 9")).toBeInTheDocument();
    expect(screen.getByText("Second trimester")).toBeInTheDocument();
    expect(document.querySelectorAll(".segment")).toHaveLength(2);
    expect(document.querySelectorAll(".segmentCurrent")).toHaveLength(1);
    expect(screen.getByText("Jan 23, 2027")).toBeInTheDocument();
    expect(screen.getByText(/Dated from an ultrasound\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/h");
    expect(screen.getByText("110 days to go")).toBeInTheDocument();
  });

  it("drops the days when the week is exact", () => {
    render(<WeekCard today="2026-10-03" dueDate="2027-01-23" />);
    const week = document.querySelector(".week") as HTMLElement;
    expect(week).toHaveTextContent("Week24");
    expect(week.querySelectorAll(".numeral")).toHaveLength(1);
  });

  it("draws no Dating row on a grantee's card, which is never sent the method", () => {
    render(<WeekCard today={today} dueDate="2027-01-23" historyHref={null} />);
    expect(screen.getByText("Jan 23, 2027")).toBeInTheDocument();
    expect(screen.getByText("110 days to go")).toBeInTheDocument();
    expect(screen.queryByText("Dating")).not.toBeInTheDocument();
    expect(screen.queryByText(/Dated from|entered by hand/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("names the method without a History link when there is no history to open", () => {
    render(<WeekCard today={today} dueDate="2027-01-23" method="lmp" historyHref={null} />);
    expect(screen.getByText("Dated from your last period.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
  });

  it("keeps the active card off warmth when another card on the screen holds it", () => {
    const { rerender } = render(<WeekCard today={today} dueDate="2027-01-23" />);
    expect(document.querySelector("section")).toHaveClass("active");
    rerender(<WeekCard today={today} dueDate="2027-01-23" highlight={false} />);
    expect(document.querySelector("section")).not.toHaveClass("active");
    expect(document.querySelector(".numeral")).not.toBeNull();
  });

  it("says only that updates are paused on the partner's card", () => {
    render(<WeekCard today={today} dueDate="2027-01-23" paused />);
    expect(screen.getByRole("heading", { name: "Paused" })).toBeInTheDocument();
    expect(screen.getByText("Weekly updates are paused.")).toBeInTheDocument();
    expect(screen.queryByText(/2027/)).not.toBeInTheDocument();
    expect(document.querySelector(".numeral")).toBeNull();
  });

  it("leads its links to the journey screen when no address is given", () => {
    const { rerender } = render(<WeekCard today={today} />);
    expect(screen.getByRole("link", { name: "Start a pregnancy" })).toHaveAttribute(
      "href",
      "/journey",
    );
    rerender(<WeekCard today={today} dueDate="2027-01-23" method="ultrasound" />);
    for (const link of screen.getAllByRole("link"))
      expect(link).toHaveAttribute("href", "/journey");
  });

  it("follows the empty state formula and keeps width while loading", () => {
    const { rerender } = render(<WeekCard today={today} startHref="/start" />);
    expect(screen.getByRole("heading", { name: "No pregnancy recorded" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a pregnancy" })).toHaveAttribute(
      "href",
      "/start",
    );
    rerender(<WeekCard today={today} dueDate="2027-01-23" loading />);
    expect(document.querySelector("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading this week")).toBeInTheDocument();
    rerender(<WeekCard today={today} dueDate="2027-01-23" error="Try again." />);
    expect(screen.getByText("Try again.")).toBeInTheDocument();
  });
});
