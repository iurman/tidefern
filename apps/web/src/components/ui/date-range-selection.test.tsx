import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DateRangeSelection,
  describeRange,
  previewRange,
  selectRange,
} from "./date-range-selection";

describe("selectRange", () => {
  it("starts the range on the first tap", () => {
    expect(selectRange(undefined, "2026-10-09")).toEqual({ start: "2026-10-09" });
  });

  it("ends the range on the second tap", () => {
    expect(selectRange({ start: "2026-10-07" }, "2026-10-09")).toEqual({
      start: "2026-10-07",
      end: "2026-10-09",
    });
  });

  it("swaps the two when the second tap is earlier", () => {
    expect(selectRange({ start: "2026-10-09" }, "2026-10-07")).toEqual({
      start: "2026-10-07",
      end: "2026-10-09",
    });
  });

  it("makes a one-day range when the first day is tapped again", () => {
    expect(selectRange({ start: "2026-10-07" }, "2026-10-07")).toEqual({
      start: "2026-10-07",
      end: "2026-10-07",
    });
  });

  it("starts over after a complete range", () => {
    expect(selectRange({ start: "2026-10-07", end: "2026-10-09" }, "2026-10-20")).toEqual({
      start: "2026-10-20",
    });
  });
});

describe("previewRange", () => {
  it("previews nothing before a start, after an end, or on the start itself", () => {
    expect(previewRange(undefined, "2026-10-09")).toBeUndefined();
    expect(previewRange({ start: "2026-10-07", end: "2026-10-09" }, "2026-10-20")).toBeUndefined();
    expect(previewRange({ start: "2026-10-07" }, null)).toBeUndefined();
    expect(previewRange({ start: "2026-10-07" }, "2026-10-07")).toBeUndefined();
  });

  it("previews the range the pointer would complete, swapped when earlier", () => {
    expect(previewRange({ start: "2026-10-07" }, "2026-10-09")).toEqual({
      start: "2026-10-07",
      end: "2026-10-09",
    });
    expect(previewRange({ start: "2026-10-09" }, "2026-10-07")).toEqual({
      start: "2026-10-07",
      end: "2026-10-09",
    });
  });
});

describe("describeRange", () => {
  it("reads the value as a sentence that also says what to do next", () => {
    expect(describeRange(undefined, "en-US")).toBe("No days chosen yet. Choose the first day.");
    expect(describeRange({ start: "2026-10-07" }, "en-US")).toBe(
      "From Wed, Oct 7. Choose the last day.",
    );
    expect(describeRange({ start: "2026-10-07", end: "2026-10-09" }, "en-US")).toBe(
      "Wed, Oct 7 to Fri, Oct 9, 3 days.",
    );
    expect(describeRange({ start: "2026-10-07", end: "2026-10-07" }, "en-US")).toBe(
      "Wed, Oct 7 to Wed, Oct 7, 1 day.",
    );
  });
});

describe("DateRangeSelection", () => {
  it("selects with two taps, names the cells and marks the ends and the middle", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangeSelection label="Days to share" today="2026-10-05" onChange={onChange} />);
    const group = screen.getByRole("group", { name: /^Days to share/ });
    expect(group).toHaveAccessibleName("Days to share No days chosen yet. Choose the first day.");
    expect(within(group).getByRole("grid")).toHaveAttribute("aria-multiselectable", "true");

    await user.click(within(group).getByRole("button", { name: /^Friday, October 9, 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-09" });
    expect(within(group).getByText("From Fri, Oct 9. Choose the last day.")).toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: /^Wednesday, October 7, 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-07", end: "2026-10-09" });
    expect(within(group).getByText("Wed, Oct 7 to Fri, Oct 9, 3 days.")).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "Thursday, October 8, 2026, selected" }),
    ).toBeInTheDocument();
    expect(group.querySelector("[data-range-start]")).toHaveAttribute("data-day", "2026-10-07");
    expect(group.querySelector("[data-range-middle]")).toHaveAttribute("data-day", "2026-10-08");
    expect(group.querySelector("[data-range-end]")).toHaveAttribute("data-day", "2026-10-09");
    expect(group.querySelectorAll("[aria-selected='true']")).toHaveLength(3);
  });

  it("previews the range under the pointer before the second tap", async () => {
    const user = userEvent.setup();
    render(<DateRangeSelection label="Days to share" today="2026-10-05" />);
    const group = screen.getByRole("group", { name: /^Days to share/ });
    await user.click(within(group).getByRole("button", { name: /^Wednesday, October 7, 2026/ }));
    await user.hover(within(group).getByRole("button", { name: /^Friday, October 9, 2026/ }));
    expect(group.querySelectorAll("[data-preview]")).toHaveLength(3);
    await user.unhover(within(group).getByRole("button", { name: /^Friday, October 9, 2026/ }));
    expect(group.querySelectorAll("[data-preview]")).toHaveLength(0);
  });

  it("ignores taps while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateRangeSelection label="Days to share" today="2026-10-05" onChange={onChange} disabled />,
    );
    const group = screen.getByRole("group", { name: /^Days to share/ });
    const day = within(group).getByRole("button", { name: /^Friday, October 9, 2026/ });
    expect(day).toBeDisabled();
    await user.click(day);
    expect(onChange).not.toHaveBeenCalled();
  });
});
