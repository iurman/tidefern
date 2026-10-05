import { describe, expect, it } from "vitest";
import {
  DAYS_PER_MONTH,
  chooseReference,
  growthAssessment,
  interpolateLms,
  lmsFor,
  percentileFromZ,
  valueFromZ,
  whoAdjustedZ,
  zFromLms,
  type LmsRow,
} from "./growth";

// CDC's worked example on the data files page: 9-month-old male, WTAGEINF row 9.5.
const cdcExample = { l: -0.1600954, m: 9.476500305, s: 0.11218624 };
// WHO weight-for-age, boys, birth row as hosted by CDC, with its 2.3rd and 97.7th columns.
const whoBirthWeight = { l: 0.3487, m: 3.3464, s: 0.14602, p2: 2.459312, p98: 4.419354 };

describe("LMS formulas", () => {
  it("reproduces CDC's worked example: z -1.645 is 7.90 kg and 7.90 kg is the 5th percentile", () => {
    const { l, m, s } = cdcExample;
    expect(valueFromZ(-1.645, l, m, s)).toBeCloseTo(7.9, 2);
    expect(zFromLms(7.9, l, m, s)).toBeCloseTo(-1.645, 2);
    expect(percentileFromZ(zFromLms(7.9, l, m, s))).toBeCloseTo(5, 1);
    // The page's other example: 9.7 kg is z 0.207, the 58th percentile.
    expect(zFromLms(9.7, l, m, s)).toBeCloseTo(0.207, 3);
    expect(Math.round(percentileFromZ(zFromLms(9.7, l, m, s)))).toBe(58);
  });
  it("uses the logarithmic form when L is 0 and inverts it", () => {
    expect(zFromLms(Math.E, 0, 1, 1)).toBeCloseTo(1, 12);
    expect(valueFromZ(1, 0, 1, 1)).toBeCloseTo(Math.E, 12);
  });
  it("maps z to the standard normal percentile", () => {
    // Abramowitz and Stegun 7.1.26 carries an error below 1.5e-7, so the median is 50 to six places.
    expect(percentileFromZ(0)).toBeCloseTo(50, 6);
    expect(percentileFromZ(-1.645)).toBeCloseTo(5, 1);
    expect(percentileFromZ(1.96)).toBeCloseTo(97.5, 1);
    expect(percentileFromZ(2)).toBeCloseTo(97.7, 1);
    expect(percentileFromZ(-2)).toBeCloseTo(2.3, 1);
  });
});

describe("WHO tail adjustment", () => {
  const { l, m, s } = whoBirthWeight;
  it("leaves z alone between -3 and 3", () => {
    expect(whoAdjustedZ(m, l, m, s)).toBe(0);
    expect(whoAdjustedZ(valueFromZ(2.9, l, m, s), l, m, s)).toBeCloseTo(2.9, 9);
  });
  it("fixes the SD beyond 3 to the distance between the 2 SD and 3 SD curves", () => {
    const sd3 = valueFromZ(3, l, m, s);
    const sd2 = valueFromZ(2, l, m, s);
    expect(whoAdjustedZ(sd3 + (sd3 - sd2), l, m, s)).toBeCloseTo(4, 9);
    const sd3Low = valueFromZ(-3, l, m, s);
    const sd2Low = valueFromZ(-2, l, m, s);
    expect(whoAdjustedZ(sd3Low - (sd2Low - sd3Low), l, m, s)).toBeCloseTo(-4, 9);
    // The plain Box-Cox formula gives a different z for the same weight; the adjustment replaces it.
    expect(zFromLms(sd3 + (sd3 - sd2), l, m, s)).not.toBeCloseTo(4, 2);
  });
});

describe("reference selection", () => {
  it("chooses WHO under 730 days and CDC from 730 days", () => {
    expect(chooseReference(729)).toBe("who");
    expect(chooseReference(730)).toBe("cdc");
  });
  it("carries the choice into an assessment and accepts an explicit override", () => {
    const base = { sex: "female" as const, indicator: "weightForAge" as const, value: 12000 };
    expect(growthAssessment({ ...base, ageDays: 729 })?.reference).toBe("who");
    expect(growthAssessment({ ...base, ageDays: 730 })?.reference).toBe("cdc");
    expect(growthAssessment({ ...base, ageDays: 300, reference: "cdc" })?.reference).toBe("cdc");
  });
});

describe("interpolation", () => {
  const rows: LmsRow[] = [
    [8.5, -0.1334091, 9.081119817, 0.113217163],
    [9.5, -0.1600954, 9.476500305, 0.11218624],
  ];
  it("returns a row exactly and the linear midpoint between rows", () => {
    expect(interpolateLms(rows, 9.5)).toEqual(cdcExample);
    expect(interpolateLms(rows, 9)).toEqual({
      l: (-0.1334091 + -0.1600954) / 2,
      m: (9.081119817 + 9.476500305) / 2,
      s: (0.113217163 + 0.11218624) / 2,
    });
  });
  it("returns null outside the table", () => {
    expect(interpolateLms(rows, 8.4)).toBeNull();
    expect(interpolateLms(rows, 9.6)).toBeNull();
    expect(interpolateLms([], 9)).toBeNull();
  });
  it("finds CDC's half-month rows and WHO's month rows in the vendored data", () => {
    expect(
      lmsFor({ reference: "cdc", sex: "male", indicator: "weightForAge", ageMonths: 9.5 }),
    ).toEqual(cdcExample);
    expect(
      lmsFor({ reference: "who", sex: "male", indicator: "weightForAge", ageMonths: 0 }),
    ).toEqual({ l: whoBirthWeight.l, m: whoBirthWeight.m, s: whoBirthWeight.s });
    expect(
      lmsFor({
        reference: "cdc",
        sex: "male",
        indicator: "weightForLength",
        ageMonths: 30,
        lengthCm: 77,
      }),
    ).toEqual({ l: -0.999294215, m: 10.27440527, s: 0.077115837 });
  });
  it("reports no table for BMI on WHO or under 24 months, and past the head circumference rows", () => {
    expect(
      lmsFor({ reference: "who", sex: "male", indicator: "bmiForAge", ageMonths: 12 }),
    ).toBeNull();
    expect(
      lmsFor({ reference: "cdc", sex: "male", indicator: "bmiForAge", ageMonths: 12 }),
    ).toBeNull();
    expect(
      lmsFor({
        reference: "cdc",
        sex: "male",
        indicator: "headCircumferenceForAge",
        ageMonths: 48,
      }),
    ).toBeNull();
    expect(
      lmsFor({ reference: "cdc", sex: "male", indicator: "weightForLength", ageMonths: 30 }),
    ).toBeNull();
  });
});

describe("growthAssessment", () => {
  it("places CDC's 9-month example through the vendored table, in grams", () => {
    const result = growthAssessment({
      sex: "male",
      ageDays: Math.round(9.5 * DAYS_PER_MONTH),
      indicator: "weightForAge",
      value: 7900,
      reference: "cdc",
    });
    expect(result?.reference).toBe("cdc");
    expect(result?.z).toBeCloseTo(-1.645, 1);
    expect(Math.abs((result?.percentile ?? 0) - 5)).toBeLessThan(0.2);
    // 289 whole days falls just under the 9.5 month row, so the median interpolates a few grams below M.
    expect(Math.abs((result?.bands.median.value ?? 0) - 9476)).toBeLessThanOrEqual(5);
    expect(result?.farOutsideBand).toBe(false);
  });
  it("round trips a WHO row: the hosted 2.3rd and 97.7th columns are the band edges", () => {
    const result = growthAssessment({
      sex: "male",
      ageDays: 0,
      indicator: "weightForAge",
      value: 3346,
    });
    expect(result?.reference).toBe("who");
    expect(result?.z).toBeCloseTo(0, 2);
    expect(result?.percentile).toBeCloseTo(50, 0);
    expect(result?.bands).toEqual({
      low: { percentile: 2.3, label: "2.3rd", value: Math.round(whoBirthWeight.p2 * 1000) },
      median: { percentile: 50, label: "50th", value: 3346 },
      high: { percentile: 97.7, label: "97.7th", value: Math.round(whoBirthWeight.p98 * 1000) },
    });
    expect(
      zFromLms(whoBirthWeight.p2, whoBirthWeight.l, whoBirthWeight.m, whoBirthWeight.s),
    ).toBeCloseTo(-2, 4);
    expect(
      zFromLms(whoBirthWeight.p98, whoBirthWeight.l, whoBirthWeight.m, whoBirthWeight.s),
    ).toBeCloseTo(2, 4);
  });
  it("adjusts the tail for weight on WHO but not for length", () => {
    const { l, m, s } = whoBirthWeight;
    const heavy = Math.round(valueFromZ(3.5, l, m, s) * 1000 + 1000);
    const weight = growthAssessment({
      sex: "male",
      ageDays: 0,
      indicator: "weightForAge",
      value: heavy,
    });
    expect(weight?.z).toBeCloseTo(whoAdjustedZ(heavy / 1000, l, m, s), 9);
    expect(weight?.z).not.toBeCloseTo(zFromLms(heavy / 1000, l, m, s), 2);
    expect(weight?.farOutsideBand).toBe(true);
    // Length-for-age at birth has L = 1 in the WHO table, so z is linear and unadjusted.
    const length = growthAssessment({
      sex: "male",
      ageDays: 0,
      indicator: "lengthForAge",
      value: 560,
    });
    expect(length?.z).toBeCloseTo(zFromLms(56, 1, 49.8842, 0.03795), 9);
    expect(length?.z).toBeGreaterThan(3);
  });
  it("converts millimetres and derives BMI from weight and length", () => {
    const head = growthAssessment({
      sex: "male",
      ageDays: 0,
      indicator: "headCircumferenceForAge",
      value: 345,
    });
    // WHO head circumference, boys, birth row: L 1, M 34.4618 cm, S 0.03686; 345 mm is 34.5 cm.
    expect(head?.z).toBeCloseTo(zFromLms(34.5, 1, 34.4618, 0.03686), 9);
    expect(head?.bands.median.value).toBe(345);
    // CDC BMI-for-age, boys, row 24: M 16.57502768 kg/m2; 870 mm and 12544 g give that BMI.
    // The 2 to 20 year tables begin at 24.0 months (730.5 days), so day 731 is their first whole day.
    const bmi = growthAssessment({
      sex: "male",
      ageDays: 731,
      indicator: "bmiForAge",
      value: 12544,
      lengthMm: 870,
    });
    expect(bmi?.reference).toBe("cdc");
    expect(bmi?.measure).toBeCloseTo(16.575, 2);
    expect(Math.abs((bmi?.z ?? 1) - 0)).toBeLessThan(0.05);
    expect(Math.abs((bmi?.bands.median.value ?? 0) - 16.58)).toBeLessThan(0.05);
  });
  it("flags only measurements beyond plus or minus 2 SD", () => {
    const { l, m, s } = whoBirthWeight;
    const inside = Math.round(valueFromZ(1.9, l, m, s) * 1000);
    const outside = Math.round(valueFromZ(-2.1, l, m, s) * 1000);
    const base = { sex: "male" as const, ageDays: 0, indicator: "weightForAge" as const };
    expect(growthAssessment({ ...base, value: inside })?.farOutsideBand).toBe(false);
    expect(growthAssessment({ ...base, value: outside })?.farOutsideBand).toBe(true);
  });
  it("returns null when no table covers the measurement and throws on bad input", () => {
    expect(
      growthAssessment({
        sex: "female",
        ageDays: 1500,
        indicator: "headCircumferenceForAge",
        value: 500,
      }),
    ).toBeNull();
    expect(
      growthAssessment({
        sex: "female",
        ageDays: 100,
        indicator: "bmiForAge",
        value: 5000,
        lengthMm: 600,
      }),
    ).toBeNull();
    expect(() =>
      growthAssessment({ sex: "female", ageDays: 100, indicator: "weightForLength", value: 5000 }),
    ).toThrow(RangeError);
    expect(() =>
      growthAssessment({ sex: "female", ageDays: -1, indicator: "weightForAge", value: 5000 }),
    ).toThrow(RangeError);
    expect(() =>
      growthAssessment({ sex: "female", ageDays: 100, indicator: "weightForAge", value: 0 }),
    ).toThrow(RangeError);
  });
});
