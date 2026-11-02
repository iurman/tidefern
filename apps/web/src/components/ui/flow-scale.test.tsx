import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlowLevel } from "@tidefern/schemas";
import { describe, expect, it, vi } from "vitest";
import { FlowScale, flowOptions } from "./flow-scale";

const checked = () =>
  screen
    .queryAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked)
    .map((radio) => radio.getAttribute("value"));

describe("FlowScale", () => {
  it("offers the five schema values in order, none first, in sentence case", () => {
    expect(flowOptions.map((option) => option.value)).toEqual(FlowLevel.options);
    expect(flowOptions.map((option) => option.label)).toEqual([
      "None",
      "Spotting",
      "Light",
      "Medium",
      "Heavy",
    ]);
  });

  it("shows nothing chosen for a day with no flow logged, then reports the value she picks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FlowScale label="Flow" value={null} onChange={onChange} />);
    expect(checked()).toEqual([]);
    await user.click(screen.getByRole("radio", { name: "Spotting" }));
    expect(onChange).toHaveBeenCalledWith("spotting");
  });

  it("shows nothing chosen when uncontrolled without a starting value", () => {
    render(<FlowScale label="Flow" />);
    expect(checked()).toEqual([]);
  });

  it("draws the chosen value on the period color and lays out as five columns", () => {
    render(<FlowScale label="Flow" value="medium" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Flow" });
    expect(checked()).toEqual(["medium"]);
    expect(group).toHaveClass("periodTone");
    expect(group).toHaveClass("columns");
    expect(group.style.getPropertyValue("--segment-count")).toBe("5");
  });

  it("puts no flow code into an id, a name or a data attribute", () => {
    render(<FlowScale label="Flow" defaultValue="heavy" />);
    const html = document.body.innerHTML;
    for (const option of flowOptions) {
      expect(html).not.toMatch(new RegExp(`(id|name|data-[a-z-]+)="[^"]*${option.value}`));
    }
  });
});
