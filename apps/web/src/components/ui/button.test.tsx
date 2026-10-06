import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders a native button of type button with the variant on the root", () => {
    render(<Button variant="secondary">Add a measurement</Button>);
    const button = screen.getByRole("button", { name: "Add a measurement" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-variant", "secondary");
  });

  it("keeps the label in the tree while loading, shows the loading text and ignores clicks", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Creating your account" onClick={onClick}>
        Create an account
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Creating your account" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent("Create an account");
    expect(screen.getByText("Create an account")).toHaveAttribute("aria-hidden", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when it is not loading and never when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a link with the same classes when given an href", () => {
    render(
      <Button href="/welcome" variant="primary">
        Create an account
      </Button>,
    );
    render(<Button variant="primary">Create an account</Button>);
    const link = screen.getByRole("link", { name: "Create an account" });
    const button = screen.getByRole("button", { name: "Create an account" });
    expect(link).toHaveAttribute("href", "/welcome");
    expect(link).toHaveAttribute("data-variant", "primary");
    expect(link.className).toBe(button.className);
    expect(link.className).toContain("button");
  });

  it("pairs an icon with the text and hides the icon from the tree", () => {
    render(<Button icon="plus">Add a child</Button>);
    const button = screen.getByRole("button", { name: "Add a child" });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
