/**
 * Measurements are stored as SI integers (grams, millimetres, millilitres) and
 * converted only at the edge with the exact factors from NIST SP 811 and the
 * 1959 international yard and pound agreement. Rounding happens at display.
 */

export const GRAMS_PER_OUNCE = 28.349523125;
export const GRAMS_PER_POUND = 453.59237;
export const MILLIMETRES_PER_INCH = 25.4;
export const MILLILITRES_PER_US_FLUID_OUNCE = 29.5735295625;

export function gramsFromPoundsOunces(pounds: number, ounces: number): number {
  return Math.round(pounds * GRAMS_PER_POUND + ounces * GRAMS_PER_OUNCE);
}

/** Pounds and ounces for display, ounces rounded to one decimal. */
export function poundsOuncesFromGrams(grams: number): { pounds: number; ounces: number } {
  const totalOunces = grams / GRAMS_PER_OUNCE;
  let pounds = Math.floor(totalOunces / 16);
  let ounces = Math.round((totalOunces - pounds * 16) * 10) / 10;
  if (ounces >= 16) {
    pounds += 1;
    ounces = 0;
  }
  return { pounds, ounces };
}

export function millimetresFromInches(inches: number): number {
  return Math.round(inches * MILLIMETRES_PER_INCH);
}

/** Inches for display, rounded to one decimal. */
export function inchesFromMillimetres(millimetres: number): number {
  return Math.round((millimetres / MILLIMETRES_PER_INCH) * 10) / 10;
}

export function millilitresFromFluidOunces(fluidOunces: number): number {
  return Math.round(fluidOunces * MILLILITRES_PER_US_FLUID_OUNCE);
}

export function fluidOuncesFromMillilitres(millilitres: number): number {
  return Math.round((millilitres / MILLILITRES_PER_US_FLUID_OUNCE) * 10) / 10;
}
