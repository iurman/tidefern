import type { Point } from "./ring-geometry";

/**
 * Scales and paths for the measurement chart (DESIGN.md 6.5). Every number
 * here is plain geometry; the growth math itself (bands, percentiles) comes
 * from @tidefern/core and is never recomputed in the client.
 */

export type Domain = [number, number];

export interface LinearScale {
  (value: number): number;
  domain: Domain;
  range: Domain;
}

/** Maps a value from `domain` onto `range` linearly. A zero-width domain maps to the range's start. */
export function linearScale(domain: Domain, range: Domain): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) =>
    span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/**
 * Tick values at a round step (1, 2 or 5 times a power of ten) that cover
 * `domain` with about `count` ticks, like the axis of a printed chart. The
 * step choice follows the geometric thresholds d3-array's tickStep uses.
 */
export function niceTicks(domain: Domain, count = 5): number[] {
  const [min, max] = domain;
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor =
    residual >= Math.sqrt(50) ? 10 : residual >= Math.sqrt(10) ? 5 : residual >= Math.SQRT2 ? 2 : 1;
  const step = factor * magnitude;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick <= max + step / 1000; tick += step) {
    ticks.push(Number(tick.toFixed(10)));
  }
  return ticks;
}

/** Widens a domain by a fraction on each side so marks never touch the plot edge. */
export function padDomain(domain: Domain, fraction = 0.08): Domain {
  const [min, max] = domain;
  const pad = (max - min || Math.abs(max) || 1) * fraction;
  return [min - pad, max + pad];
}

export type ChartRange = "sinceBirth" | "lastThreeMonths" | "lastYear";

export const chartRanges: ReadonlyArray<{ value: ChartRange; label: string }> = [
  { value: "sinceBirth", label: "Since birth" },
  { value: "lastThreeMonths", label: "Last 3 months" },
  { value: "lastYear", label: "Last year" },
];

const DAYS_IN_THREE_MONTHS = 91;
const DAYS_IN_YEAR = 365;

/** The first age, in days, a range shows. Never before birth. */
export function rangeStartAgeDays(range: ChartRange, todayAgeDays: number): number {
  switch (range) {
    case "sinceBirth":
      return 0;
    case "lastThreeMonths":
      return Math.max(0, todayAgeDays - DAYS_IN_THREE_MONTHS);
    case "lastYear":
      return Math.max(0, todayAgeDays - DAYS_IN_YEAR);
  }
}

/** `count` evenly spaced ages from `start` to `end` inclusive, for sampling the band. */
export function sampleAges(start: number, end: number, count: number): number[] {
  if (count <= 1 || end <= start) return [start];
  const ages: number[] = [];
  for (let index = 0; index < count; index += 1) {
    ages.push(start + ((end - start) * index) / (count - 1));
  }
  return ages;
}

function fixed(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** A polyline through `points`, or an empty string for none. */
export function linePath(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${fixed(point.x)} ${fixed(point.y)}`)
    .join(" ");
}

/** A closed area between an upper and a lower edge that share x positions. */
export function areaPath(upper: Point[], lower: Point[]): string {
  if (upper.length === 0 || lower.length === 0) return "";
  const back = [...lower].reverse();
  return `${linePath(upper)} ${back.map((point) => `L ${fixed(point.x)} ${fixed(point.y)}`).join(" ")} Z`;
}
