import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/components/ui/timeline";
import { ILO_ID } from "./fixtures";
import { TimelinePanel } from "./timeline-panel";

function panel(items: TimelineItem[], canWrite: boolean) {
  return render(
    <TimelinePanel
      childId={ILO_ID}
      childName="Ilo"
      items={items}
      nextCursor={null}
      timeZone="America/Vancouver"
      units="metric"
      canWrite={canWrite}
    />,
  );
}

describe("TimelinePanel", () => {
  it("draws nothing logged as the same empty-state card as the tabs beside it", () => {
    panel([], true);
    const empty = screen.getByRole("region", { name: "Nothing logged yet" });
    expect(
      within(empty).getByRole("heading", { level: 3, name: "Nothing logged yet" }),
    ).toBeVisible();
    expect(
      within(empty).getByText(
        "Feeds, sleep, diapers and milestones logged for Ilo appear here, newest first.",
      ),
    ).toBeInTheDocument();
    expect(within(empty).getByRole("link", { name: "Log on the Family page" })).toHaveAttribute(
      "href",
      "/family",
    );
    expect(screen.queryByRole("list", { name: "Timeline" })).toBeNull();
  });

  it("offers the way to log only to someone who can log", () => {
    panel([], false);
    const empty = screen.getByRole("region", { name: "Nothing logged yet" });
    expect(within(empty).queryByRole("link")).toBeNull();
    expect(within(empty).queryByRole("button")).toBeNull();
  });

  it("lists what was logged, with no empty state and nothing older to offer", () => {
    panel(
      [{ key: "e-1", date: "2026-10-04", title: "Diaper, wet and dirty", detail: "3:00 PM" }],
      true,
    );
    expect(screen.getByRole("list", { name: "Timeline" })).toHaveTextContent(
      "Diaper, wet and dirty",
    );
    expect(screen.queryByRole("region", { name: "Nothing logged yet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show older entries" })).toBeNull();
  });
});
