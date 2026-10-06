import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  composeCalendarDate,
  exampleLine,
  SegmentedDateInput,
  segmentOrder,
  splitCalendarDate,
} from "./segmented-date-input";

describe("segmented date rules", () => {
  it("orders the parts the way the profile reads them", () => {
    expect(segmentOrder("dmy")).toEqual(["day", "month", "year"]);
    expect(segmentOrder("mdy")).toEqual(["month", "day", "year"]);
    expect(segmentOrder("ymd")).toEqual(["year", "month", "day"]);
  });

  it("composes a padded calendar date only when core agrees it exists", () => {
    expect(composeCalendarDate({ day: "3", month: "4", year: "2027" })).toBe("2027-04-03");
    expect(composeCalendarDate({ day: "31", month: "02", year: "2027" })).toBeNull();
    expect(composeCalendarDate({ day: "29", month: "02", year: "2028" })).toBe("2028-02-29");
    expect(composeCalendarDate({ day: "29", month: "02", year: "2027" })).toBeNull();
    expect(composeCalendarDate({ day: "", month: "04", year: "2027" })).toBeNull();
    expect(composeCalendarDate({ day: "03", month: "04", year: "27" })).toBeNull();
  });

  it("splits a date into parts and blanks anything else", () => {
    expect(splitCalendarDate("2027-04-03")).toEqual({ day: "03", month: "04", year: "2027" });
    expect(splitCalendarDate("2027-02-30")).toEqual({ day: "", month: "", year: "" });
    expect(splitCalendarDate(undefined)).toEqual({ day: "", month: "", year: "" });
  });

  it("writes the example line in the same order as the fields", () => {
    expect(exampleLine("dmy", "2027-04-03")).toBe("For example, 03 04 2027");
    expect(exampleLine("mdy", "2027-04-03")).toBe("For example, 04 03 2027");
    expect(exampleLine("ymd", "2027-04-03")).toBe("For example, 2027 04 03");
  });
});

describe("SegmentedDateInput", () => {
  it("advances to the next part when one is full and reports the composed date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedDateInput label="Date" order="dmy" onChange={onChange} />);
    const day = screen.getByRole("textbox", { name: "Day" });
    const month = screen.getByRole("textbox", { name: "Month" });
    const year = screen.getByRole("textbox", { name: "Year" });
    expect(day).toHaveAttribute("inputmode", "numeric");
    await user.click(day);
    await user.keyboard("03");
    expect(month).toHaveFocus();
    await user.keyboard("04");
    expect(year).toHaveFocus();
    await user.keyboard("2027");
    expect(onChange).toHaveBeenLastCalledWith("2027-04-03");
    expect(screen.getByText("For example, 03 04 2027")).toBeInTheDocument();
  });

  it("keeps the fields in the mdy order and ignores letters", async () => {
    const user = userEvent.setup();
    render(<SegmentedDateInput label="Date" order="mdy" />);
    const boxes = screen.getAllByRole("textbox");
    expect(
      boxes.map((box) => box.getAttribute("aria-label") ?? box.closest("label")?.textContent),
    ).toEqual(["Month", "Day", "Year"]);
    await user.click(boxes[0] as HTMLElement);
    await user.keyboard("1a2");
    expect(boxes[0]).toHaveValue("12");
  });

  it("names a date that does not exist and reports null for it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedDateInput label="Date" order="dmy" onChange={onChange} />);
    await user.click(screen.getByRole("textbox", { name: "Day" }));
    await user.keyboard("31022027");
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByText("That date does not exist. Check the day and the month."),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Day" })).toHaveAttribute("aria-invalid", "true");
  });

  it("starts from a default value and follows a controlled one", () => {
    const { rerender } = render(
      <SegmentedDateInput label="Date" order="ymd" defaultValue="2026-10-05" />,
    );
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveValue("2026");
    rerender(<SegmentedDateInput label="Date" order="ymd" value="2027-01-02" />);
    expect(screen.getByRole("textbox", { name: "Day" })).toHaveValue("02");
  });
});
