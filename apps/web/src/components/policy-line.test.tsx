import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PolicyLine } from "./policy-line";

describe("PolicyLine", () => {
  it("is a footer holding the two policy links under their exact names", () => {
    render(<PolicyLine />);
    const footer = screen.getByRole("contentinfo");
    const nav = within(footer).getByRole("navigation", { name: "Policies" });
    expect(within(nav).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(
      within(nav).getByRole("link", { name: "Consumer Health Data Privacy Policy" }),
    ).toHaveAttribute("href", "/health-privacy");
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  it("puts what the frame adds on the same line, ahead of the links", () => {
    render(
      <PolicyLine>
        <button type="submit">Sign out</button>
      </PolicyLine>,
    );
    const footer = screen.getByRole("contentinfo");
    const button = within(footer).getByRole("button", { name: "Sign out" });
    const nav = within(footer).getByRole("navigation", { name: "Policies" });
    expect(button.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
