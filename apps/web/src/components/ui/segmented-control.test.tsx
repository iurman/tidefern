import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

const options = [
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
  { value: "week", label: "Week" },
];

const checked = () =>
  screen
    .queryAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked)
    .map((radio) => radio.getAttribute("value"));

describe("SegmentedControl", () => {
  it("is one radio group named by its legend, with one neutral name for its radios", () => {
    render(<SegmentedControl label="View" options={options} defaultValue="list" />);
    const radios = within(screen.getByRole("group", { name: "View" })).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
    const names = new Set(radios.map((radio) => radio.getAttribute("name")));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toMatch(/month|list|week/);
  });

  it("moves the choice with the arrow keys, one tab stop for the group", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="View" options={options} defaultValue="month" onChange={onChange} />,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "Month" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "List" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("list");
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("shows nothing chosen for a null value and stays controlled as a value comes and goes", async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <SegmentedControl label="View" options={options} value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue(null)}>
            Back to nothing
          </button>
        </>
      );
    }
    render(<Harness />);
    expect(checked()).toEqual([]);
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(checked()).toEqual(["week"]);
    await user.click(screen.getByRole("button", { name: "Back to nothing" }));
    expect(checked()).toEqual([]);
    // React warns when an input switches between controlled and uncontrolled; null never does.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("keeps the pill unless asked for columns, which carry the option count for their stacking width", () => {
    const { rerender } = render(<SegmentedControl label="View" options={options} />);
    const group = screen.getByRole("group", { name: "View" });
    expect(group).not.toHaveClass("columns");
    expect(group.style.getPropertyValue("--segment-count")).toBe("");
    rerender(<SegmentedControl label="View" options={options} layout="columns" />);
    expect(group).toHaveClass("columns");
    expect(group.style.getPropertyValue("--segment-count")).toBe("3");
  });

  it("puts its action inside the group after the options, and never remounts the radios for it", () => {
    const props = { label: "Mood", options, value: "list", onChange: () => {} };
    const { rerender } = render(<SegmentedControl {...props} />);
    const radio = screen.getByRole("radio", { name: "List" });
    radio.focus();
    rerender(
      <SegmentedControl
        {...props}
        action={
          <button type="button" aria-label="Clear mood">
            Clear
          </button>
        }
      />,
    );
    expect(screen.getByRole("radio", { name: "List" })).toBe(radio);
    expect(radio).toHaveFocus();
    const clear = within(screen.getByRole("group", { name: "Mood" })).getByRole("button", {
      name: "Clear mood",
    });
    expect(radio.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<SegmentedControl {...props} action={null} />);
    expect(screen.getByRole("radio", { name: "List" })).toBe(radio);
    expect(radio).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear mood" })).not.toBeInTheDocument();
  });

  it("names its error through aria-describedby and disables every radio with the group", () => {
    render(
      <SegmentedControl
        label="View"
        options={options}
        defaultValue="month"
        error="Choose a view to continue."
        disabled
      />,
    );
    const group = screen.getByRole("group", { name: "View" });
    expect(group).toHaveAccessibleDescription("Choose a view to continue.");
    expect(group).toHaveAttribute("data-invalid", "true");
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
