import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { shellDestinations } from "./shell-destinations";

describe("shellDestinations", () => {
  it("always lists Today, Calendar, Sharing and Settings", () => {
    expect(shellDestinations({ stage: "cycle", hasChild: false }).map((d) => d.label)).toEqual([
      "Today",
      "Calendar",
      "Sharing",
      "Settings",
    ]);
  });

  it("adds Journey for a pregnancy or the postpartum stage", () => {
    for (const stage of ["pregnancy", "postpartum"] as const) {
      const labels = shellDestinations({ stage, hasChild: false }).map((d) => d.label);
      expect(labels).toContain("Journey");
      expect(labels).not.toContain("Family");
    }
  });

  it("adds Journey for someone a pregnancy is shared with, whatever their own stage", () => {
    expect(
      shellDestinations({ stage: "none", hasChild: false, sharedPregnancy: true }).map(
        (d) => d.label,
      ),
    ).toEqual(["Today", "Calendar", "Journey", "Sharing", "Settings"]);
  });

  it("adds Family when a child exists, and both when both apply", () => {
    expect(shellDestinations({ stage: "none", hasChild: true }).map((d) => d.label)).toEqual([
      "Today",
      "Calendar",
      "Family",
      "Sharing",
      "Settings",
    ]);
    expect(shellDestinations({ stage: "postpartum", hasChild: true }).map((d) => d.label)).toEqual([
      "Today",
      "Calendar",
      "Journey",
      "Family",
      "Sharing",
      "Settings",
    ]);
  });
});

describe("AppShell", () => {
  it("marks the current destination in both navigations and renders the content", () => {
    render(
      <AppShell stage="cycle" hasChild={false} current="sharing">
        <p>Route content</p>
      </AppShell>,
    );
    const navigations = screen.getAllByRole("navigation", { name: "Main" });
    expect(navigations).toHaveLength(2);
    for (const navigation of navigations) {
      const current = within(navigation).getByRole("link", { current: "page" });
      expect(current).toHaveTextContent("Sharing");
      expect(current).toHaveAttribute("href", "/sharing");
    }
    expect(screen.getByText("Route content")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log today" })).not.toBeInTheDocument();
  });

  it("shows the quick-log button on Today only and hands the press to onQuickLog", async () => {
    const user = userEvent.setup();
    const onQuickLog = vi.fn();
    render(
      <AppShell stage="cycle" hasChild={false} current="today" onQuickLog={onQuickLog}>
        <p>Today</p>
      </AppShell>,
    );
    const buttons = screen.getAllByRole("button", { name: "Log today" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0] as HTMLElement);
    expect(onQuickLog).toHaveBeenCalledTimes(1);
  });

  it("leaves the quick-log button out for the none stage, which is never asked a body question", () => {
    render(
      <AppShell stage="none" hasChild current="today" onQuickLog={vi.fn()}>
        <p>Today</p>
      </AppShell>,
    );
    expect(screen.queryByRole("button", { name: "Log today" })).not.toBeInTheDocument();
  });

  it("never puts a health word in an attribute", () => {
    const { container } = render(
      <AppShell stage="pregnancy" hasChild current="journey">
        <p>Journey</p>
      </AppShell>,
    );
    const attributes = Array.from(container.querySelectorAll("*")).flatMap((element) =>
      Array.from(element.attributes)
        .filter((attribute) => attribute.name !== "href")
        .map((attribute) => `${attribute.name}=${attribute.value}`),
    );
    expect(attributes.filter((entry) => /pregnan|period|symptom/i.test(entry))).toEqual([]);
  });
});
