import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayList } from "./day-list";

const today = "2026-10-05";

const items = [
  { date: "2026-10-01", summary: "Period started", href: "/log/2026-10-01" },
  { date: today, summary: "Light flow, cramps", href: "/log/2026-10-05" },
  { date: "2026-10-03", summary: "Headache", href: "/log/2026-10-03" },
];

describe("DayList", () => {
  it("lists the days newest first with today labelled and the sheet link on each row", () => {
    render(<DayList today={today} items={items} />);
    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Today");
    expect(rows[0]).toHaveAccessibleName(/^Today, Monday, October 5, 2026\s*Light flow, cramps$/);
    expect(rows[0]).toHaveAttribute("href", "/log/2026-10-05");
    expect(rows[1]).toHaveTextContent("Sat, Oct 3");
    expect(rows[2]).toHaveTextContent("Thu, Oct 1");
  });

  it("shows the empty state formula when there is nothing to list", () => {
    render(
      <DayList
        today={today}
        items={[]}
        empty={{
          heading: "Nothing logged yet",
          why: "Days you log show up here as a list you can scan.",
          action: <button type="button">Log today</button>,
        }}
      />,
    );
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log today" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("announces loading and the error instead of the empty state", () => {
    const { rerender } = render(
      <DayList
        today={today}
        items={[]}
        loading
        empty={{ heading: "Nothing logged yet", why: "" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("Nothing logged yet")).toBeNull();
    rerender(
      <DayList
        today={today}
        items={[]}
        error="We could not load these days. Try again."
        empty={{ heading: "Nothing logged yet", why: "" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "We could not load these days. Try again.",
    );
    expect(screen.queryByText("Nothing logged yet")).toBeNull();
  });
});
