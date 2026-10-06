import { describe, expect, it } from "vitest";
import {
  arcPath,
  clampDay,
  clockwiseTangent,
  consecutiveRuns,
  dayEndTurn,
  dayMidTurn,
  dayStartTurn,
  frondCurlPath,
  polarPoint,
  wavePath,
} from "./ring-geometry";

const center = { x: 100, y: 100 };

function numbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe("polarPoint", () => {
  it("puts turn 0 at the top and runs clockwise", () => {
    expect(polarPoint(center, 50, 0)).toEqual({ x: 100, y: 50 });
    const quarter = polarPoint(center, 50, 0.25);
    expect(quarter.x).toBeCloseTo(150);
    expect(quarter.y).toBeCloseTo(100);
    const half = polarPoint(center, 50, 0.5);
    expect(half.x).toBeCloseTo(100);
    expect(half.y).toBeCloseTo(150);
  });
});

describe("arcPath", () => {
  it("is empty for no span and uses the large-arc flag past half a turn", () => {
    expect(arcPath(center, 50, 0.2, 0.2)).toBe("");
    expect(arcPath(center, 50, 0, 0.25)).toBe("M 100 50 A 50 50 0 0 1 150 100");
    expect(arcPath(center, 50, 0, 0.75)).toContain(" 0 1 1 ");
  });

  it("draws a whole turn as two half circles that return to the start", () => {
    const path = arcPath(center, 50, 0, 1);
    expect(path.split("A")).toHaveLength(3);
    expect(numbers(path).slice(-2)).toEqual([100, 50]);
  });
});

describe("day positions", () => {
  it("places day 1 at the top and day 28 ending at the top again", () => {
    expect(dayStartTurn(1, 28)).toBe(0);
    expect(dayEndTurn(28, 28)).toBe(1);
    expect(dayMidTurn(15, 28)).toBeCloseTo(14.5 / 28);
  });

  it("clamps days outside the ring to its edges", () => {
    expect(clampDay(0, 28)).toBe(1);
    expect(clampDay(31, 28)).toBe(28);
    expect(dayEndTurn(40, 28)).toBe(1);
  });
});

describe("consecutiveRuns", () => {
  it("groups consecutive days, drops days outside the ring and ignores duplicates", () => {
    expect(consecutiveRuns([3, 1, 2, 5, 5, 6, 30, 0], 28)).toEqual([
      [1, 3],
      [5, 6],
    ]);
    expect(consecutiveRuns([], 28)).toEqual([]);
  });
});

describe("frondCurlPath", () => {
  it("starts at the arc's end, stays within the curl's size and leaves along the tangent", () => {
    const turn = 0.4;
    const end = polarPoint(center, 80, turn);
    const tangent = clockwiseTangent(turn);
    const inward = { x: center.x - end.x, y: center.y - end.y };
    const path = frondCurlPath(end, tangent, inward, 16);
    const values = numbers(path);
    expect(values[0]).toBeCloseTo(end.x, 2);
    expect(values[1]).toBeCloseTo(end.y, 2);
    const distances: number[] = [];
    for (let index = 2; index < values.length; index += 2) {
      const x = values[index] as number;
      const y = values[index + 1] as number;
      distances.push(Math.hypot(x - end.x, y - end.y));
    }
    expect(Math.max(...distances)).toBeLessThanOrEqual(16.01);
    const second = { x: values[2] as number, y: values[3] as number };
    const leaving = { x: second.x - end.x, y: second.y - end.y };
    expect(leaving.x * tangent.x + leaving.y * tangent.y).toBeGreaterThan(0);
    expect(leaving.x * inward.x + leaving.y * inward.y).toBeGreaterThan(0);
  });

  it("curls the other way when the arc runs the other way", () => {
    const end = { x: 100, y: 20 };
    const inward = { x: 0, y: 80 };
    const clockwise = frondCurlPath(end, { x: 1, y: 0 }, inward);
    const counter = frondCurlPath(end, { x: -1, y: 0 }, inward);
    expect(numbers(clockwise)[2]).toBeGreaterThan(100);
    expect(numbers(counter)[2]).toBeLessThan(100);
  });
});

describe("wavePath", () => {
  it("crosses the baseline twice per crest and ends at the far edge", () => {
    const path = wavePath(0, 5, 100, 4, 2);
    expect(path.startsWith("M 0 5")).toBe(true);
    expect(path.split("Q")).toHaveLength(9);
    expect(numbers(path).slice(-2)).toEqual([100, 5]);
  });
});
