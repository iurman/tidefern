import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "@/lib/site";
import { ThemeControl } from "./theme-control";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.dataset.themeSource = "system";
});

describe("the theme control", () => {
  it("offers follow system, light and dark, and applies a choice at once", async () => {
    const user = userEvent.setup();
    render(<ThemeControl />);
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("stores nothing once follow system is chosen again", async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_KEY, "dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeSource = "user";
    render(<ThemeControl />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Follow system" }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.themeSource).toBe("system");
    expect(screen.getByText(/Follow system matches your device and stores nothing/)).toBeVisible();
  });
});
