import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsentSection } from "./consent-section";
import { GroupScreen, SettingsSections } from "./settings-frame";

describe("the settings frames", () => {
  it("lists every group as a row that opens its own screen, then sign out as a POST", () => {
    render(<SettingsSections />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const rows = within(nav).getAllByRole("link");
    expect(rows.map((row) => [row.textContent, row.getAttribute("href")])).toEqual([
      ["Profile", "/settings/profile"],
      ["Time zone", "/settings/time-zone"],
      ["Units", "/settings/units"],
      ["Theme", "/settings/theme"],
      ["Sound", "/settings/sound"],
      ["Notifications", "/settings/notifications"],
      ["Devices", "/settings/devices"],
      ["Two-step sign-in", "/settings/two-factor"],
      ["Export", "/settings/export"],
      ["Activity", "/activity"],
      ["Consent record", "/settings/consent"],
      ["Close account", "/settings/close-account"],
    ]);
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const form = signOut.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/sign-out");
  });

  it("puts a group's own screen under its name with the way back to Settings", () => {
    render(
      <GroupScreen id="units" title="Units">
        <p>Body</p>
      </GroupScreen>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Units" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

describe("the consent record group", () => {
  const processors = [
    { name: "Vercel", receives: "Runs the application", contact: "https://example.test" },
  ];

  it("says what would be here when nothing was recorded", () => {
    render(
      <ConsentSection
        view={{ active: [], withdrawn: [], children: [], withdrawId: null }}
        processors={processors}
        returnTo="/settings"
        freshForMs={300_000}
        headingLevel={2}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "No consent recorded" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw consent" })).toBeNull();
  });

  it("says its read failed rather than showing an empty record", () => {
    render(
      <ConsentSection
        view={null}
        processors={processors}
        returnTo="/settings"
        freshForMs={null}
        headingLevel={3}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("We could not load this just now.");
  });

  it("shows her record read-only with the day agreed, a child's consent without any action, and one withdraw", () => {
    render(
      <ConsentSection
        view={{
          active: [
            {
              key: "a",
              agreedOn: "2025-09-01",
              textVersion: "2026-10",
              categories: ["Cycle history"],
              purposes: ["Keep the dates you log."],
              withdrawnOn: null,
            },
          ],
          withdrawn: [],
          children: [
            {
              key: "c",
              child: "Ilo",
              purpose: "Keep this child's records.",
              agreedOn: "2026-08-23",
              byYou: false,
            },
          ],
          withdrawId: "c1",
        }}
        processors={processors}
        returnTo="/settings"
        freshForMs={300_000}
        headingLevel={3}
      />,
    );
    expect(screen.getByText(/You agreed on Sep 1, 2025\. Policy version 2026-10\./)).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Given for a child" })).toBeVisible();
    expect(screen.getByText("Given by another guardian on Aug 23, 2026.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Withdraw consent" })).toHaveLength(1);
  });
});
