import { describe, expect, it } from "vitest";
import {
  areaPath,
  linePath,
  linearScale,
  niceTicks,
  padDomain,
  rangeStartAgeDays,
  sampleAges,
} from "./chart-scale";

describe("linearScale", () => {
  it("maps the domain ends onto the range ends and interpolates between", () => {
    const scale = linearScale([0, 100], [20, 220]);
    expect(scale(0)).toBe(20);
    expect(scale(100)).toBe(220);
    expect(scale(50)).toBe(120);
    expect(scale.domain).toEqual([0, 100]);
  });

  it("flips a y range so larger values sit higher on the chart", () => {
    const scale = linearScale([2, 10], [200, 0]);
    expect(scale(2)).toBe(200);
    expect(scale(10)).toBe(0);
  });

  it("maps a zero-width domain to the range start instead of dividing by zero", () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(0);
  });
});

describe("niceTicks", () => {
  it("picks a round step that covers the domain", () => {
    expect(niceTicks([0, 9.3], 5)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks([2.4, 11.8], 5)).toEqual([4, 6, 8, 10]);
    expect(niceTicks([0, 24], 5)).toEqual([0, 5, 10, 15, 20]);
  });

  it("returns the single value for an empty domain", () => {
    expect(niceTicks([3, 3])).toEqual([3]);
  });
});

describe("padDomain", () => {
  it("widens by the fraction of the span on each side", () => {
    expect(padDomain([0, 10], 0.1)).toEqual([-1, 11]);
  });

  it("still widens a flat domain", () => {
    const [min, max] = padDomain([4, 4], 0.1);
    expect(min).toBeLessThan(4);
    expect(max).toBeGreaterThan(4);
  });
});

describe("rangeStartAgeDays", () => {
  it("starts at birth and never before it", () => {
    expect(rangeStartAgeDays("sinceBirth", 400)).toBe(0);
    expect(rangeStartAgeDays("lastThreeMonths", 400)).toBe(309);
    expect(rangeStartAgeDays("lastYear", 400)).toBe(35);
    expect(rangeStartAgeDays("lastThreeMonths", 40)).toBe(0);
    expect(rangeStartAgeDays("lastYear", 100)).toBe(0);
  });
});

describe("sampleAges", () => {
  it("spaces the ages evenly from start to end", () => {
    expect(sampleAges(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
    expect(sampleAges(10, 10, 5)).toEqual([10]);
    expect(sampleAges(0, 100, 1)).toEqual([0]);
  });
});

describe("paths", () => {
  it("draws a polyline and a closed area", () => {
    const upper = [
      { x: 0, y: 10 },
      { x: 10, y: 8 },
    ];
    const lower = [
      { x: 0, y: 30 },
      { x: 10, y: 32 },
    ];
    expect(linePath(upper)).toBe("M 0 10 L 10 8");
    expect(areaPath(upper, lower)).toBe("M 0 10 L 10 8 L 10 32 L 0 30 Z");
    expect(linePath([])).toBe("");
    expect(areaPath([], [])).toBe("");
  });
});
