import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWATCH_UNSET, TokenSwatch } from "./token-swatch";

const original = window.getComputedStyle;

/** jsdom does not resolve custom properties, so the lookup is stubbed per token. */
function stubComputedStyle(values: Record<string, string>) {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const declaration = original(element);
    return new Proxy(declaration, {
      get(target, property, receiver) {
        if (property === "getPropertyValue") {
          return (name: string) => values[name] ?? "";
        }
        return Reflect.get(target, property, receiver);
      },
    });
  });
}

describe("TokenSwatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("paints the token and prints the measured value beside its name", () => {
    stubComputedStyle({ "--accent": " #35645D " });
    render(<TokenSwatch token="accent" label="Accent" />);
    expect(screen.getByText("--accent")).toBeInTheDocument();
    expect(screen.getByText("Accent")).toBeInTheDocument();
    expect(screen.getByText("#35645D")).toBeInTheDocument();
    const chip = document.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(chip.style.getPropertyValue("--swatch-fill")).toBe("var(--accent)");
  });

  it("says when a token is not set", () => {
    stubComputedStyle({});
    render(<TokenSwatch token="not-a-token" />);
    expect(screen.getByText(SWATCH_UNSET)).toBeInTheDocument();
    expect(screen.getByText("--not-a-token").closest("[data-unset]")).not.toBeNull();
  });

  it("measures again when the theme attribute on the root changes", async () => {
    const values: Record<string, string> = { "--accent": "#35645D" };
    stubComputedStyle(values);
    render(<TokenSwatch token="accent" />);
    expect(screen.getByText("#35645D")).toBeInTheDocument();
    values["--accent"] = "#8FC1B9";
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      await Promise.resolve();
    });
    expect(screen.getByText("#8FC1B9")).toBeInTheDocument();
    delete document.documentElement.dataset.theme;
  });
});
