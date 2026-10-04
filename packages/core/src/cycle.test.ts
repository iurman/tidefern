import { describe, expect, it } from "vitest";
import { averageCycleLength, cycleDay, isIrregular, predictCycle } from "./cycle";

const regular = [
  { date: "2026-05-01" },
  { date: "2026-05-29" },
  { date: "2026-06-26" },
  { date: "2026-07-24" },
];

describe("cycle prediction", () => {
  it("averages recent plausible cycles", () => {
    expect(averageCycleLength(regular)).toEqual({ length: 28, sampleSize: 3 });
  });
  it("falls back to 28 days with a single period", () => {
    const prediction = predictCycle([{ date: "2026-09-10" }]);
    expect(prediction?.cycleLength).toBe(28);
    expect(prediction?.nextPeriodStart).toBe("2026-10-08");
    expect(prediction?.sampleSize).toBe(0);
    expect(prediction?.uncertaintyDays).toBe(4);
  });
  it("places ovulation 14 days before the next period and a six day fertile window", () => {
    const prediction = predictCycle(regular);
    expect(prediction?.nextPeriodStart).toBe("2026-08-21");
    expect(prediction?.ovulation).toBe("2026-08-07");
    expect(prediction?.fertileWindow).toEqual({ start: "2026-08-02", end: "2026-08-08" });
  });
  it("ignores implausible gaps such as a missed month of logging", () => {
    const withGap = [...regular, { date: "2026-11-20" }];
    expect(averageCycleLength(withGap).sampleSize).toBe(3);
  });
  it("flags irregular cycles when recent lengths vary by more than a week", () => {
    const irregular = [
      { date: "2026-01-01" },
      { date: "2026-01-24" },
      { date: "2026-02-28" },
      { date: "2026-03-22" },
    ];
    expect(isIrregular(irregular)).toBe(true);
    expect(predictCycle(irregular)?.uncertaintyDays).toBe(5);
  });
  it("counts cycle day from one", () => {
    expect(cycleDay("2026-07-24", "2026-07-24")).toBe(1);
    expect(cycleDay("2026-07-24", "2026-08-01")).toBe(9);
  });
});
