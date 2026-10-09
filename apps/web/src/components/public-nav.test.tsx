import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

const { PublicNav } = await import("./public-nav");

beforeEach(() => {
  route.pathname = "/";
});

function toggle() {
  return screen.getByRole("button", { name: "Menu" });
}

describe("PublicNav", () => {
  it("names the primary navigation and links the design system and Sign in", () => {
    render(<PublicNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Design system" })).toHaveAttribute("href", "/design");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("is a real disclosure button that controls the link list", async () => {
    const user = userEvent.setup();
    render(<PublicNav />);
    const button = toggle();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    const list = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(list?.tagName).toBe("UL");
    expect(list).toContainElement(screen.getByRole("link", { name: "Sign in" }));
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation")).toHaveAttribute("data-open", "true");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("navigation")).not.toHaveAttribute("data-open");
  });

  it("closes on Escape and puts focus back on the button", async () => {
    const user = userEvent.setup();
    render(<PublicNav />);
    await user.click(toggle());
    screen.getByRole("link", { name: "Sign in" }).focus();
    await user.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
  });

  it("closes on a press outside it but not on one inside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PublicNav />
        <p>Outside</p>
      </>,
    );
    await user.click(toggle());
    fireEvent.pointerDown(screen.getByRole("list"));
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when a link is followed or the route changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PublicNav />);
    await user.click(toggle());
    fireEvent.click(screen.getByRole("link", { name: "Design system" }));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle());
    route.pathname = "/privacy";
    rerender(<PublicNav />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the page the visitor is on", () => {
    route.pathname = "/design/components";
    const { rerender } = render(<PublicNav />);
    expect(screen.getByRole("link", { name: "Design system" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).not.toHaveAttribute("aria-current");
    route.pathname = "/sign-in";
    rerender(<PublicNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("aria-current", "page");
  });
});
