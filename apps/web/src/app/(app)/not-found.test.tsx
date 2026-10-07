import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppNotFound from "./not-found";

describe("the (app) not-found page", () => {
  it("draws only the statement and the way back to Today, so the group's shell stays", () => {
    const { container } = render(<AppNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "That page is not here." })).toBeVisible();
    expect(screen.getByText("The address may have changed, or it never existed.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/today");
    // The layout owns main and the policy line; a header here would be the public chrome.
    expect(container.querySelector("header, footer, main")).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
  });
});
