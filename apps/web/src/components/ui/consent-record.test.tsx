import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConsentRecord, withdrawalSentence } from "./consent-record";

const facts = {
  categories: ["Period dates and flow", "Symptoms and moods"],
  purposes: ["Estimate what comes next"],
  processors: [{ name: "Vercel", receives: "runs the app" }],
  policyVersion: "2026-10",
};

describe("ConsentRecord", () => {
  it("lists the facts, the withdrawal sentence and one unchecked control", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ConsentRecord {...facts} onChange={onChange} />);
    expect(screen.getByRole("region", { name: "What Tidefern collects, and why" })).toBeVisible();
    expect(screen.getByText("Period dates and flow")).toBeVisible();
    expect(screen.getByText("Estimate what comes next")).toBeVisible();
    expect(screen.getByText("Vercel")).toBeVisible();
    expect(screen.getByText(withdrawalSentence)).toBeVisible();
    const control = screen.getByRole("checkbox", { name: /I agree to Tidefern collecting/ });
    expect(control).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("marks the control invalid and says what to do next", () => {
    render(<ConsentRecord {...facts} error="Tick the box to continue." />);
    const control = screen.getByRole("checkbox");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription("Tick the box to continue.");
  });

  it("shows the record read-only with the date it was given and no control", () => {
    render(<ConsentRecord {...facts} readOnly agreedOn="2026-10-05" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/You agreed on Oct 5, 2026\./)).toBeVisible();
    expect(screen.getByText(withdrawalSentence)).toBeVisible();
  });
});
