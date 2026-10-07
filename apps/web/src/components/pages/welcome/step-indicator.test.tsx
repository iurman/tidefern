import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepIndicator } from "./step-indicator";

const steps = [
  { id: "zone", name: "Time zone" },
  { id: "stage", name: "Stage" },
  { id: "dates", name: "Dates" },
  { id: "consent", name: "Consent" },
  { id: "passkey", name: "Passkey" },
];

describe("the step indicator", () => {
  it("numbers every step her stage has and marks the current one", () => {
    render(<StepIndicator steps={steps} current="dates" />);
    const list = screen.getByRole("list", { name: "Steps" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "1Time zone",
      "2Stage",
      "3Dates",
      "4Consent",
      "5Passkey",
    ]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveAttribute("data-state", "done");
    expect(items[3]).toHaveAttribute("data-state", "next");
    expect(items.filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("says where she is in one line for phones, counting only her steps", () => {
    render(<StepIndicator steps={steps.filter((step) => step.id !== "dates")} current="consent" />);
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });
});
