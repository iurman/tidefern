import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthGrid } from "./month-grid";

const today = "2026-10-05";

describe("MonthGrid", () => {
  it("draws seven two-letter columns from the week start and names the month", () => {
    const { container } = render(<MonthGrid today={today} weekStart={1} />);
    // The picker hides the header row from assistive technology; every day
    // button carries its weekday in its own name instead.
    const headers = Array.from(container.querySelectorAll("th"));
    expect(headers.map((header) => header.textContent)).toEqual([
      "Mo",
      "Tu",
      "We",
      "Th",
      "Fr",
      "Sa",
      "Su",
    ]);
    expect(headers[0]).toHaveAttribute("aria-label", "Monday");
    expect(headers[0]?.closest("thead")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("starts the week on Sunday when asked", () => {
    const { container } = render(<MonthGrid today={today} weekStart={7} />);
    expect(container.querySelector("th")).toHaveTextContent("Su");
    expect(screen.getByRole("button", { name: "Sunday, September 27, 2026" })).toBeInTheDocument();
  });

  it("marks today from the prop, greys the neighbours and names every day", () => {
    render(<MonthGrid today={today} weekStart={1} />);
    const todayButton = screen.getByRole("button", { name: "Today, Monday, October 5, 2026" });
    expect(todayButton).toHaveAttribute("tabindex", "0");
    expect(todayButton.closest("td")).toHaveAttribute("aria-current", "date");
    expect(todayButton.closest("td")).toHaveAttribute("data-today", "true");
    const outside = screen.getByRole("button", { name: "Monday, September 28, 2026" });
    expect(outside.closest("td")).toHaveAttribute("data-outside", "true");
    expect(outside.closest("td")).toHaveClass("outside");
    expect(screen.getByRole("button", { name: "Sunday, November 1, 2026" })).toBeInTheDocument();
  });

  it("gives the windows their textures and edges and appends the caller's words", () => {
    render(
      <MonthGrid
        today={today}
        weekStart={1}
        windows={[
          { start: "2026-10-01", end: "2026-10-04", texture: "logged", words: "period logged" },
          {
            start: "2026-10-30",
            end: "2026-11-03",
            texture: "predicted",
            words: "period expected",
          },
          {
            start: "2026-10-11",
            end: "2026-10-16",
            texture: "estimated",
            words: "fertile window estimated",
          },
        ]}
        points={[{ date: "2026-10-16", words: "ovulation estimated" }]}
        noted={[{ date: today, words: "cramps logged" }]}
        showLegend
      />,
    );
    const first = screen.getByRole("button", { name: "Thursday, October 1, 2026, period logged" });
    expect(first.closest("td")).toHaveClass("logged", "edgeStart");
    const last = screen.getByRole("button", { name: "Sunday, October 4, 2026, period logged" });
    expect(last.closest("td")).toHaveClass("logged", "edgeEnd");
    const predicted = screen.getByRole("button", {
      name: "Saturday, October 31, 2026, period expected",
    });
    expect(predicted.closest("td")).toHaveClass("predicted", "edgeMiddle");
    const ovulation = screen.getByRole("button", {
      name: "Friday, October 16, 2026, fertile window estimated, ovulation estimated",
    });
    expect(ovulation.closest("td")).toHaveClass("estimated", "edgeEnd");
    expect(ovulation.querySelector(".point")).not.toBeNull();
    const noted = screen.getByRole("button", {
      name: "Today, Monday, October 5, 2026, cramps logged",
    });
    expect(noted.querySelector(".noted")).not.toBeNull();
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("LoggedPredictedEstimated");
  });

  it("reports a tapped day as a calendar date and moves months by the first day", async () => {
    const user = userEvent.setup();
    const onDaySelect = vi.fn();
    const onMonthChange = vi.fn();
    render(
      <MonthGrid
        today={today}
        weekStart={1}
        onDaySelect={onDaySelect}
        onMonthChange={onMonthChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Friday, October 9, 2026" }));
    expect(onDaySelect).toHaveBeenCalledWith("2026-10-09");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-11-01");
    expect(screen.getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
  });

  it("shows the empty message only when nothing is drawn, and the error otherwise", () => {
    const { rerender } = render(
      <MonthGrid today={today} emptyMessage="Nothing logged this month" />,
    );
    // The caption is a status region of its own, so the footer is found by its text.
    expect(screen.getByText("Nothing logged this month").closest("[role='status']")).not.toBeNull();
    rerender(
      <MonthGrid
        today={today}
        emptyMessage="Nothing logged this month"
        noted={[{ date: today }]}
      />,
    );
    expect(screen.queryByText("Nothing logged this month")).toBeNull();
    rerender(<MonthGrid today={today} error="We could not load this month. Try again." />);
    expect(
      screen.getByText("We could not load this month. Try again.").closest("[role='status']"),
    ).not.toBeNull();
    rerender(<MonthGrid today={today} loading />);
    expect(screen.getByText("Loading").closest("[aria-busy='true']")).not.toBeNull();
  });

  it("disables every day and the month navigation together", () => {
    render(<MonthGrid today={today} disabled />);
    expect(screen.getByRole("button", { name: "Today, Monday, October 5, 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
