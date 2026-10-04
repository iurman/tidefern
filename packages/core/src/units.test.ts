import { describe, expect, it } from "vitest";
import {
  fluidOuncesFromMillilitres,
  gramsFromPoundsOunces,
  inchesFromMillimetres,
  millilitresFromFluidOunces,
  millimetresFromInches,
  poundsOuncesFromGrams,
} from "./units";

describe("units", () => {
  it("converts with the exact NIST factors and rounds only at the edge", () => {
    expect(gramsFromPoundsOunces(7, 8)).toBe(3402);
    expect(poundsOuncesFromGrams(3402)).toEqual({ pounds: 7, ounces: 8 });
    expect(millimetresFromInches(20)).toBe(508);
    expect(inchesFromMillimetres(508)).toBe(20);
    expect(millilitresFromFluidOunces(4)).toBe(118);
    expect(fluidOuncesFromMillilitres(118)).toBe(4);
  });
  it("carries ounces that round to sixteen into the next pound", () => {
    expect(poundsOuncesFromGrams(Math.round(8 * 453.59237) - 1)).toEqual({ pounds: 8, ounces: 0 });
  });
});
