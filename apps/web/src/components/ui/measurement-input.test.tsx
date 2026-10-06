import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeasurementInput, toDisplay, toSi } from "./measurement-input";

describe("measurement conversion", () => {
  it("shows the stored SI value in either system", () => {
    expect(toDisplay("weight", "metric", 3402)).toEqual({ primary: "3.402" });
    expect(toDisplay("weight", "imperial", 3402)).toEqual({ primary: "7", secondary: "8" });
    expect(toDisplay("length", "metric", 505)).toEqual({ primary: "50.5" });
    expect(toDisplay("length", "imperial", 508)).toEqual({ primary: "20" });
    expect(toDisplay("volume", "metric", 120)).toEqual({ primary: "120" });
    expect(toDisplay("volume", "imperial", 118)).toEqual({ primary: "4" });
    expect(toDisplay("weight", "imperial", null)).toEqual({ primary: "", secondary: "" });
    expect(toDisplay("length", "metric", null)).toEqual({ primary: "" });
  });

  it("stores what was typed as the SI integer with core's factors", () => {
    expect(toSi("weight", "metric", { primary: "3.4" })).toBe(3400);
    expect(toSi("weight", "imperial", { primary: "7", secondary: "8" })).toBe(3402);
    expect(toSi("weight", "imperial", { primary: "", secondary: "8" })).toBe(227);
    expect(toSi("length", "metric", { primary: "50,5" })).toBe(505);
    expect(toSi("length", "imperial", { primary: "20" })).toBe(508);
    expect(toSi("volume", "imperial", { primary: "4" })).toBe(118);
    expect(toSi("volume", "metric", { primary: "" })).toBeNull();
    expect(toSi("weight", "metric", { primary: "abc" })).toBeNull();
    expect(toSi("weight", "metric", { primary: "-1" })).toBeNull();
  });
});

describe("MeasurementInput", () => {
  it("reports grams while typing kilograms and redraws them when the unit flips", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MeasurementInput label="Weight" kind="weight" onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Weight" });
    expect(field).toHaveAttribute("inputmode", "decimal");
    await user.type(field, "3.402");
    expect(onChange).toHaveBeenLastCalledWith(3402);
    await user.click(screen.getByRole("radio", { name: "Pounds and ounces" }));
    expect(screen.getByRole("textbox", { name: "Weight" })).toHaveValue("7");
    expect(screen.getByRole("textbox", { name: "Weight, ounces" })).toHaveValue("8");
    await user.clear(screen.getByRole("textbox", { name: "Weight, ounces" }));
    await user.type(screen.getByRole("textbox", { name: "Weight, ounces" }), "9");
    expect(onChange).toHaveBeenLastCalledWith(3430);
  });

  it("keeps a controlled value in the chosen unit", () => {
    const { rerender } = render(
      <MeasurementInput label="Length" kind="length" value={505} unit="imperial" />,
    );
    expect(screen.getByRole("textbox", { name: "Length" })).toHaveValue("19.9");
    rerender(<MeasurementInput label="Length" kind="length" value={505} unit="metric" />);
    expect(screen.getByRole("textbox", { name: "Length" })).toHaveValue("50.5");
  });
});
