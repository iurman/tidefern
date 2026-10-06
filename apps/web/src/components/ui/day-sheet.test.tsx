import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DaySheet, formatSheetDate } from "./day-sheet";

describe("formatSheetDate", () => {
  it("names the weekday and the month day from a calendar string, in UTC", () => {
    expect(formatSheetDate("2026-10-05")).toBe("Monday, Oct 5");
    expect(formatSheetDate("2026-12-31")).toBe("Thursday, Dec 31");
  });

  it("refuses anything that is not a calendar date", () => {
    expect(() => formatSheetDate("2026-10-05T00:00:00Z")).toThrow();
  });
});

describe("DaySheet", () => {
  it("shows the flow scale only while a period is logged", async () => {
    const user = userEvent.setup();
    render(<DaySheet inline open onClose={() => {}} date="2026-10-05" onSave={() => {}} />);
    expect(screen.queryByRole("group", { name: "Flow" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Period" }));
    expect(screen.getByRole("group", { name: "Flow" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Period" }));
    expect(screen.queryByRole("group", { name: "Flow" })).not.toBeInTheDocument();
  });

  it("hands the draft back on save and drops the flow when no period is logged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <DaySheet
        inline
        open
        onClose={() => {}}
        date="2026-10-05"
        initial={{ symptoms: ["cramps"], flow: "light" }}
        onSave={onSave}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Private note" }), "Slept badly.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      period: false,
      flow: undefined,
      symptoms: ["cramps"],
      mood: undefined,
      note: "Slept badly.",
    });
  });

  it("keeps the flow once a period is logged and saved", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<DaySheet inline open onClose={() => {}} date="2026-10-05" onSave={onSave} />);
    await user.click(screen.getByRole("switch", { name: "Period" }));
    await user.click(screen.getByRole("radio", { name: "Medium" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ period: true, flow: "medium" }));
  });

  it("cancels through the quiet action and ignores a save while one is in flight", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(
      <DaySheet inline open onClose={onClose} date="2026-10-05" onSave={onSave} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<DaySheet inline open saving onClose={onClose} date="2026-10-05" onSave={onSave} />);
    expect(screen.getByRole("button", { name: "Saving" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saving" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("never puts the note into the title or an accessible name", () => {
    render(
      <DaySheet
        inline
        open
        onClose={() => {}}
        date="2026-10-05"
        initial={{ note: "a very private sentence" }}
        onSave={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Monday, Oct 5" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /private sentence/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue(
      "a very private sentence",
    );
  });
});
