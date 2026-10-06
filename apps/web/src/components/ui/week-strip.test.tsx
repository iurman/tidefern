import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekStrip } from "./week-strip";

const today = "2026-10-05";

describe("WeekStrip", () => {
  it("shows the seven days of today's week from the week start with today marked", () => {
    render(<WeekStrip today={today} weekStart={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent("Today, Monday, October 5, 2026");
    expect(items[0]).toHaveAttribute("aria-current", "date");
    expect(items[6]).toHaveTextContent("Sunday, October 11, 2026");
    expect(screen.getByRole("list", { name: "This week" })).toBeInTheDocument();
  });

  it("starts on Sunday when the profile's week does", () => {
    render(<WeekStrip today={today} weekStart={7} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Sunday, October 4, 2026");
    expect(items[1]).toHaveAttribute("aria-current", "date");
  });

  it("carries the same textures and words as the grid without any control", () => {
    render(
      <WeekStrip
        today={today}
        weekStart={1}
        windows={[
          { start: "2026-10-03", end: "2026-10-06", texture: "logged", words: "period logged" },
        ]}
        noted={[{ date: "2026-10-07", words: "headache logged" }]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Today, Monday, October 5, 2026, period logged");
    expect(items[0]).toHaveClass("logged", "edgeMiddle");
    expect(items[1]).toHaveClass("logged", "edgeEnd");
    expect(items[2]).toHaveTextContent("Wednesday, October 7, 2026, headache logged");
    expect(items[2]?.querySelector(".noted")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
