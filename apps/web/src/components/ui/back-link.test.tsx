import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackLink } from "./back-link";

describe("BackLink", () => {
  it("links to the parent by its address and reads as the way back", () => {
    render(<BackLink href="/settings">Settings</BackLink>);
    const link = screen.getByRole("link", { name: "Back to Settings" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveTextContent("Back to Settings");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
