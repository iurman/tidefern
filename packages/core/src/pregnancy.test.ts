import { describe, expect, it } from "vitest";
import {
  dueDateFromLmp,
  dueDateFromTransfer,
  dueDateFromUltrasound,
  gestationalAge,
  redatingThresholdDays,
  shouldRedate,
} from "./pregnancy";

describe("pregnancy dating", () => {
  it("applies Naegele's rule from the last period", () => {
    expect(dueDateFromLmp("2026-01-10")).toBe("2026-10-17");
  });
  it("dates from a scan by the days left of 280", () => {
    // A scan on 2026-03-07 measuring 8w0d (56 days) puts day 0 at 2026-01-10.
    expect(dueDateFromUltrasound("2026-03-07", 56)).toBe("2026-10-17");
  });
  it("dates a day-5 transfer at transfer plus 261 days, as ACOG describes", () => {
    expect(dueDateFromTransfer("2026-02-01", 5)).toBe("2026-10-20");
    expect(dueDateFromTransfer("2026-02-01", 3)).toBe("2026-10-22");
  });
  it("reports weeks, days, trimester and a label from a due date", () => {
    const due = "2026-10-17";
    expect(gestationalAge(due, "2026-01-10")).toMatchObject({
      weeks: 0,
      days: 0,
      totalDays: 0,
      trimester: 1,
      label: "0w0d",
    });
    expect(gestationalAge(due, "2026-04-17")).toMatchObject({ weeks: 13, days: 6, trimester: 1 });
    expect(gestationalAge(due, "2026-04-18")).toMatchObject({
      weeks: 14,
      days: 0,
      totalDays: 98,
      trimester: 2,
    });
    expect(gestationalAge(due, "2026-07-25")).toMatchObject({ totalDays: 196, trimester: 3 });
    expect(gestationalAge(due, "2026-07-28")).toMatchObject({ weeks: 28, days: 3, label: "28w3d" });
  });
  it("uses ACOG's redating bands by gestational age at the scan", () => {
    expect(redatingThresholdDays(8 * 7)).toBe(5);
    expect(redatingThresholdDays(9 * 7)).toBe(7);
    expect(redatingThresholdDays(15 * 7 + 6)).toBe(7);
    expect(redatingThresholdDays(16 * 7)).toBe(10);
    expect(redatingThresholdDays(22 * 7)).toBe(14);
    expect(redatingThresholdDays(28 * 7)).toBe(21);
  });
  it("redates only when the scan disagrees by more than the band", () => {
    const fromLmp = dueDateFromLmp("2026-01-10");
    const close = shouldRedate(fromLmp, "2026-03-07", 60);
    expect(close).toEqual({ redate: false, discrepancyDays: 4, thresholdDays: 5 });
    const far = shouldRedate(fromLmp, "2026-03-07", 62);
    expect(far).toEqual({ redate: true, discrepancyDays: 6, thresholdDays: 5 });
    // At 9w0d the band widens to 7 days, so the same 7 day gap no longer redates.
    expect(shouldRedate(fromLmp, "2026-03-07", 63).redate).toBe(false);
  });
});
