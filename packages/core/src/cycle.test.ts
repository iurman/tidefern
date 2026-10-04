import { describe, expect, it } from "vitest";
import { averageCycleLength, cycleDay, isIrregular, predictCycle, uncertaintyFor } from "./cycle";

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
  it("offers a first guess of 28 days from a single period and says so", () => {
    const prediction = predictCycle([{ date: "2026-09-10" }]);
    expect(prediction?.basis).toBe("first_guess");
    expect(prediction?.cycleLength).toBe(28);
    expect(prediction?.nextPeriodStart).toBe("2026-10-08");
    expect(prediction?.sampleSize).toBe(0);
    expect(prediction?.uncertaintyDays).toBe(4);
  });
  it("places ovulation 14 days before the next period and a six day window ending on it", () => {
    const prediction = predictCycle(regular);
    expect(prediction?.basis).toBe("estimate");
    expect(prediction?.nextPeriodStart).toBe("2026-08-21");
    expect(prediction?.ovulation).toBe("2026-08-07");
    expect(prediction?.fertileWindow).toEqual({ start: "2026-08-02", end: "2026-08-07" });
    expect(prediction?.uncertaintyDays).toBe(2);
    expect(prediction?.ovulationBandDays).toBe(2);
  });
  it("ignores implausible gaps such as a missed month of logging", () => {
    const withGap = [...regular, { date: "2026-11-20" }];
    expect(averageCycleLength(withGap).sampleSize).toBe(3);
    expect(isIrregular(withGap)).toBe(false);
    expect(predictCycle(withGap)?.uncertaintyDays).toBe(2);
  });
  it("offers no date when periods exist but no cycle is in the plausible range", () => {
    const long = [{ date: "2026-01-01" }, { date: "2026-02-25" }, { date: "2026-04-20" }];
    const prediction = predictCycle(long);
    expect(prediction?.basis).toBe("not_enough_regular_cycles");
    expect(prediction?.nextPeriodStart).toBeNull();
    expect(prediction?.fertileWindow).toBeNull();
    expect(prediction?.cycleLength).toBeNull();
  });
  it("flags irregular cycles when recent plausible lengths vary by more than a week", () => {
    const irregular = [
      { date: "2026-01-01" },
      { date: "2026-01-24" },
      { date: "2026-02-28" },
      { date: "2026-03-22" },
    ];
    expect(isIrregular(irregular)).toBe(true);
    expect(predictCycle(irregular)?.uncertaintyDays).toBe(5);
  });
  it("scales uncertainty with the sample", () => {
    expect(uncertaintyFor(0, false)).toBe(4);
    expect(uncertaintyFor(1, false)).toBe(4);
    expect(uncertaintyFor(2, false)).toBe(3);
    expect(uncertaintyFor(6, false)).toBe(2);
    expect(uncertaintyFor(6, true)).toBe(5);
    expect(predictCycle(regular.slice(0, 3))?.uncertaintyDays).toBe(3);
  });
  it("predicts nothing after a pregnancy ends until a new period is logged, then widens the window", () => {
    const ended = "2026-09-01";
    expect(predictCycle(regular, { since: ended })).toBeNull();
    const afterwards = predictCycle([...regular, { date: "2026-10-15" }], { since: ended });
    expect(afterwards?.basis).toBe("first_guess");
    expect(afterwards?.nextPeriodStart).toBe("2026-11-12");
    expect(afterwards?.uncertaintyDays).toBe(5);
  });
  it("counts cycle day from one", () => {
    expect(cycleDay("2026-07-24", "2026-07-24")).toBe(1);
    expect(cycleDay("2026-07-24", "2026-08-01")).toBe(9);
  });
});
