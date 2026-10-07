import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline, newestLoggedKey, type TimelineItem } from "./timeline";

const items: TimelineItem[] = [
  { key: "checkup", date: "2026-11-02", title: "9 month check-up", expected: true },
  { key: "rolled", date: "2026-10-02", title: "Rolled over", href: "/m" },
  { key: "smile", date: "2026-05-14", title: "First smile" },
];

describe("newestLoggedKey", () => {
  it("ignores expected rows and finds the latest date whatever the order", () => {
    expect(newestLoggedKey(items)).toBe("rolled");
    expect(newestLoggedKey([...items].reverse())).toBe("rolled");
    expect(newestLoggedKey([items[0] as TimelineItem])).toBeNull();
    expect(newestLoggedKey([])).toBeNull();
  });
});

describe("Timeline", () => {
  it("leads with the date, marks expected rows in words and puts only the newest logged row on warmth", () => {
    render(<Timeline label="Milestones" items={items} highlightNewest />);
    const list = screen.getByRole("list", { name: "Milestones" });
    const rows = list.querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector("time")).toHaveAttribute("datetime", "2026-11-02");
    expect(rows[0]).toHaveTextContent("Nov 2");
    expect(rows[0]).toHaveClass("expected");
    expect(rows[0]).toHaveTextContent("Expected");
    expect(rows[1]).toHaveClass("newest");
    expect(rows[2]).not.toHaveClass("newest");
    expect(screen.getByRole("link", { name: "Rolled over" })).toHaveAttribute("href", "/m");
  });

  it("draws a row's own control after its text and leaves the other rows without one", () => {
    const withAction: TimelineItem[] = [
      {
        ...(items[0] as TimelineItem),
        action: <button type="button">Edit 9 month check-up</button>,
      },
      items[1] as TimelineItem,
    ];
    render(<Timeline label="Appointments" items={withAction} />);
    const rows = screen.getByRole("list", { name: "Appointments" }).querySelectorAll("li");
    const button = screen.getByRole("button", { name: "Edit 9 month check-up" });
    expect(rows[0]).toContainElement(button);
    expect(rows[0]?.textContent).toBe("Nov 29 month check-upExpectedEdit 9 month check-up");
    expect(rows[1]?.querySelector("button")).toBeNull();
  });

  it("puts nothing on warmth unless asked", () => {
    render(<Timeline label="Appointments" items={items} />);
    expect(document.querySelectorAll(".newest")).toHaveLength(0);
  });

  it("follows the empty state formula and the loading and error voice", () => {
    const { rerender } = render(
      <Timeline
        label="Milestones"
        items={[]}
        empty={{
          heading: "Nothing marked yet",
          why: "Why.",
          action: { label: "Mark", href: "/m" },
        }}
      />,
    );
    expect(screen.getByText("Nothing marked yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mark" })).toHaveAttribute("href", "/m");
    rerender(<Timeline label="Milestones" items={items} loading />);
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    rerender(<Timeline label="Milestones" items={items} error="Try again." />);
    expect(screen.getByText("Try again.")).toBeInTheDocument();
  });
});
