import growthData from "./growth-data.json" with { type: "json" };

/**
 * Child growth: z-scores, percentiles and band edges from LMS reference
 * tables, computed the same way in the browser, React Native and Node. Under
 * 730 days the WHO Child Growth Standards apply and the CDC 2000 charts after,
 * which is what CDC recommends for the United States (Grummer-Strawn, Reinold
 * and Krebs, MMWR 2010;59(RR-9)). The tables are vendored under
 * packages/core/data, converted by scripts/growth-data.mjs, and documented
 * with their attribution in packages/core/data/SOURCES.md. A percentile here
 * is context for a parent and a conversation with a pediatrician, never a
 * diagnosis; the product copy must say so.
 */

export type Sex = "male" | "female";
export type GrowthReference = "who" | "cdc";
export type GrowthIndicator =
  "weightForAge" | "lengthForAge" | "weightForLength" | "headCircumferenceForAge" | "bmiForAge";

/** One reference row: the axis (age in months or length in centimetres), then L, M and S. */
export type LmsRow = [number, number, number, number];

export interface Lms {
  l: number;
  m: number;
  s: number;
}

interface WhoTables {
  weightForAge: LmsRow[];
  lengthForAge: LmsRow[];
  weightForLength: LmsRow[];
  headCircumferenceForAge: LmsRow[];
}

interface CdcTables {
  weightForAgeInfant: LmsRow[];
  lengthForAgeInfant: LmsRow[];
  headCircumferenceForAgeInfant: LmsRow[];
  weightForLengthInfant: LmsRow[];
  weightForAge: LmsRow[];
  statureForAge: LmsRow[];
  weightForStature: LmsRow[];
  bmiForAge: LmsRow[];
}

interface GrowthData {
  who: Record<Sex, WhoTables>;
  cdc: Record<Sex, CdcTables>;
}

const data = growthData as GrowthData;

/** 365.25 / 12: the month CDC's and WHO's own programs use to turn an age in days into table months. */
export const DAYS_PER_MONTH = 30.4375;

/** First day of age on which the CDC charts replace the WHO standards (24 months, MMWR 2010). */
export const WHO_UPPER_BOUND_DAYS = 730;

/**
 * Under this age a WHO percentile is approximate. CDC's hosting of the WHO
 * standards lists one row per month, and a straight line from the birth row
 * to the one month row misses the newborn weight dip and regain. Measured
 * against WHO's own daily tables (SOURCES.md), the percentile at the median is
 * off by up to 9.4 points in the first three weeks for weight, 5.8 for length
 * and 4.5 for head circumference; from eight weeks the gap stays under 1.6
 * points and from six months under 0.5. Weight-for-length is read by length
 * in half centimetres, where the rows are dense enough (under 0.1 point).
 */
export const WHO_APPROXIMATE_UNDER_DAYS = 56;

/** The CDC 2 to 20 year charts begin at this age; under it the CDC infant charts (birth to 36 months) apply. */
const CDC_CHILD_CHART_START_MONTHS = 24;

/** Measurements are stored as SI integers; the tables are in kilograms, centimetres and kg/m2. */
export const GRAMS_PER_KILOGRAM = 1000;
export const MILLIMETRES_PER_CENTIMETRE = 10;
const MILLIMETRES_PER_METRE = 1000;

/** The WHO screening cutoff: plus or minus 2 SD, the 2.3rd and 97.7th percentiles. */
const BAND_Z = 2;

const WEIGHT_BASED: ReadonlySet<GrowthIndicator> = new Set([
  "weightForAge",
  "weightForLength",
  "bmiForAge",
]);

/**
 * CDC's published z-score formula: Z = ((X/M)^L - 1) / (L S) when L is not 0,
 * else Z = ln(X/M) / S.
 */
export function zFromLms(x: number, l: number, m: number, s: number): number {
  return l === 0 ? Math.log(x / m) / s : ((x / m) ** l - 1) / (l * s);
}

/** CDC's inverse: X = M (1 + L S Z)^(1/L) when L is not 0, else X = M exp(S Z). */
export function valueFromZ(z: number, l: number, m: number, s: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l);
}

/**
 * Abramowitz and Stegun 7.1.26, with a largest absolute error of 1.5e-7,
 * which is far below the one decimal a percentile is ever shown with.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const polynomial =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - polynomial * Math.exp(-x * x));
}

/** The percentile (0 to 100) a z-score corresponds to on the standard normal distribution. */
export function percentileFromZ(z: number): number {
  return 100 * 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * WHO's restricted LMS for weight-based indicators (weight-for-age,
 * weight-for-length and BMI-for-age): the fitted distribution is trusted only
 * between -3 and 3, and beyond that the standard deviation is fixed to the
 * distance between the 2 SD and 3 SD curves, so an extreme weight never
 * reaches an absurd z. Length, height and head circumference use the plain z.
 */
export function whoAdjustedZ(x: number, l: number, m: number, s: number): number {
  const z = zFromLms(x, l, m, s);
  if (z > 3) {
    const sd3 = valueFromZ(3, l, m, s);
    const sd2 = valueFromZ(2, l, m, s);
    return 3 + (x - sd3) / (sd3 - sd2);
  }
  if (z < -3) {
    const sd3 = valueFromZ(-3, l, m, s);
    const sd2 = valueFromZ(-2, l, m, s);
    return -3 + (x - sd3) / (sd2 - sd3);
  }
  return z;
}

/** WHO under 730 days, CDC from the second birthday on, as CDC recommends (MMWR 2010). */
export function chooseReference(ageDays: number): GrowthReference {
  return ageDays < WHO_UPPER_BOUND_DAYS ? "who" : "cdc";
}

/**
 * L, M and S at a point on the axis, interpolated linearly between the two
 * nearest rows, which is how CDC's own program handles ages between its
 * half-month rows. Null when the point lies outside the table.
 */
export function interpolateLms(rows: readonly LmsRow[], at: number): Lms | null {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last || at < first[0] || at > last[0]) return null;
  let low = 0;
  let high = rows.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((rows[middle] as LmsRow)[0] <= at) low = middle;
    else high = middle;
  }
  const [a0, l0, m0, s0] = rows[low] as LmsRow;
  const [a1, l1, m1, s1] = rows[high] as LmsRow;
  if (at === a0 || a0 === a1) return { l: l0, m: m0, s: s0 };
  if (at === a1) return { l: l1, m: m1, s: s1 };
  const t = (at - a0) / (a1 - a0);
  return { l: l0 + t * (l1 - l0), m: m0 + t * (m1 - m0), s: s0 + t * (s1 - s0) };
}

export interface LmsQuery {
  reference: GrowthReference;
  sex: Sex;
  indicator: GrowthIndicator;
  /** Exact age in months (days divided by DAYS_PER_MONTH); picks the table and, for age-based indicators, the row. */
  ageMonths: number;
  /** Recumbent length or stature in centimetres; the axis for weight-for-length. */
  lengthCm?: number;
}

function whoTable(sex: Sex, indicator: GrowthIndicator): LmsRow[] | null {
  // CDC's hosting of the WHO files has no BMI-for-age table, and BMI is not reported under age 2.
  return indicator === "bmiForAge" ? null : data.who[sex][indicator];
}

function cdcTable(sex: Sex, indicator: GrowthIndicator, ageMonths: number): LmsRow[] | null {
  const tables = data.cdc[sex];
  const infant = ageMonths < CDC_CHILD_CHART_START_MONTHS;
  switch (indicator) {
    case "weightForAge":
      return infant ? tables.weightForAgeInfant : tables.weightForAge;
    case "lengthForAge":
      return infant ? tables.lengthForAgeInfant : tables.statureForAge;
    case "weightForLength":
      return infant ? tables.weightForLengthInfant : tables.weightForStature;
    case "headCircumferenceForAge":
      return tables.headCircumferenceForAgeInfant;
    case "bmiForAge":
      return infant ? null : tables.bmiForAge;
  }
}

/** The reference parameters for a query, or null when no vendored table covers it. */
export function lmsFor(query: LmsQuery): Lms | null {
  const { reference, sex, indicator, ageMonths, lengthCm } = query;
  const rows = reference === "who" ? whoTable(sex, indicator) : cdcTable(sex, indicator, ageMonths);
  if (!rows) return null;
  const at = indicator === "weightForLength" ? lengthCm : ageMonths;
  return at === undefined ? null : interpolateLms(rows, at);
}

export interface GrowthMeasurement {
  sex: Sex;
  /** Whole days since birth. */
  ageDays: number;
  indicator: GrowthIndicator;
  /**
   * Grams for weight-for-age, weight-for-length and BMI-for-age (the weight);
   * millimetres for length-for-age and head circumference-for-age.
   */
  value: number;
  /** Recumbent length or stature in millimetres; required for weight-for-length and BMI-for-age. */
  lengthMm?: number;
  /** Overrides the age rule, for the CDC alternative under 24 months. */
  reference?: GrowthReference;
}

export interface GrowthBand {
  percentile: 2.3 | 50 | 97.7;
  label: "2.3rd" | "50th" | "97.7th";
  /** In the measurement's unit: grams or millimetres rounded to the integer, kg/m2 to two decimals for BMI. */
  value: number;
}

export interface GrowthAssessment {
  reference: GrowthReference;
  indicator: GrowthIndicator;
  z: number;
  percentile: number;
  /** The measurement in the table's unit (kilograms, centimetres or kg/m2), for display beside the bands. */
  measure: number;
  /** The reference parameters the assessment used, after interpolation. */
  lms: Lms;
  /** The band edges at -2 SD, the median and +2 SD. */
  bands: { low: GrowthBand; median: GrowthBand; high: GrowthBand };
  /** Beyond plus or minus 2 SD; the UI pairs it with the pointing-to-care sentence, never an alarm. */
  farOutsideBand: boolean;
  /**
   * True under WHO_APPROXIMATE_UNDER_DAYS on the WHO reference for the
   * age-based indicators. The UI shows such a percentile as approximate, or
   * shows the band alone, never as an exact rank. Always false on the CDC
   * reference, whose half-month rows are the ones CDC's own program
   * interpolates.
   */
  approximate: boolean;
}

/** The monthly WHO rows are too coarse for the first weeks of the age-based indicators. */
function isApproximate(reference: GrowthReference, indicator: GrowthIndicator, ageDays: number) {
  return (
    reference === "who" && indicator !== "weightForLength" && ageDays < WHO_APPROXIMATE_UNDER_DAYS
  );
}

function assertPositive(name: string, value: number | undefined): asserts value is number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number`);
  }
}

/**
 * Converts the SI integer measurement to the table's unit and back. BMI is
 * derived from the weight and length because the product never stores BMI.
 */
function measureFor(input: GrowthMeasurement): { x: number; toUnit: (value: number) => number } {
  const { indicator, value, lengthMm } = input;
  assertPositive("value", value);
  if (indicator === "lengthForAge" || indicator === "headCircumferenceForAge") {
    return {
      x: value / MILLIMETRES_PER_CENTIMETRE,
      toUnit: (cm) => Math.round(cm * MILLIMETRES_PER_CENTIMETRE),
    };
  }
  if (indicator === "bmiForAge") {
    assertPositive("lengthMm", lengthMm);
    const metres = lengthMm / MILLIMETRES_PER_METRE;
    return {
      x: value / GRAMS_PER_KILOGRAM / (metres * metres),
      toUnit: (bmi) => Math.round(bmi * 100) / 100,
    };
  }
  if (indicator === "weightForLength") assertPositive("lengthMm", lengthMm);
  return { x: value / GRAMS_PER_KILOGRAM, toUnit: (kg) => Math.round(kg * GRAMS_PER_KILOGRAM) };
}

/**
 * Places one measurement on its reference. Returns null when no vendored
 * table covers the age or length (head circumference past 36 months, BMI under
 * 24 months, a length outside the weight-for-length range), so the UI can say
 * so instead of guessing.
 */
export function growthAssessment(input: GrowthMeasurement): GrowthAssessment | null {
  const { sex, ageDays, indicator } = input;
  if (!Number.isFinite(ageDays) || ageDays < 0) throw new RangeError("ageDays must be 0 or more");
  const reference = input.reference ?? chooseReference(ageDays);
  const { x, toUnit } = measureFor(input);
  const ageMonths = ageDays / DAYS_PER_MONTH;
  const query: LmsQuery = { reference, sex, indicator, ageMonths };
  if (input.lengthMm !== undefined) query.lengthCm = input.lengthMm / MILLIMETRES_PER_CENTIMETRE;
  const lms = lmsFor(query);
  if (!lms) return null;
  const { l, m, s } = lms;
  const z =
    reference === "who" && WEIGHT_BASED.has(indicator)
      ? whoAdjustedZ(x, l, m, s)
      : zFromLms(x, l, m, s);
  return {
    reference,
    indicator,
    z,
    percentile: percentileFromZ(z),
    measure: x,
    lms,
    bands: {
      low: { percentile: 2.3, label: "2.3rd", value: toUnit(valueFromZ(-BAND_Z, l, m, s)) },
      median: { percentile: 50, label: "50th", value: toUnit(m) },
      high: { percentile: 97.7, label: "97.7th", value: toUnit(valueFromZ(BAND_Z, l, m, s)) },
    },
    farOutsideBand: Math.abs(z) > BAND_Z,
    approximate: isApproximate(reference, indicator, ageDays),
  };
}
