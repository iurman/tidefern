import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TodayLoading from "./loading";

describe("Today while the server reads", () => {
  it("holds the places of what will arrive, busy, and says so once", () => {
    const { container } = render(<TodayLoading />);
    expect(screen.getAllByText("Loading today")).toHaveLength(1);
    expect(container.querySelectorAll("[aria-busy='true']").length).toBeGreaterThan(0);
    // Nothing interactive and no heading while the reads run: no value is guessed.
    expect(container.querySelector("button, a, input, h1, h2")).toBeNull();
  });
});
