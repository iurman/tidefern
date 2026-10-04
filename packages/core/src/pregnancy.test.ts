import { describe, expect, it } from "vitest";
import { dueDateFromLmp, gestationalAge } from "./pregnancy";

describe("pregnancy dating", () => {
  it("applies Naegele's rule from the last period", () => {
    expect(dueDateFromLmp("2026-01-10")).toBe("2026-10-17");
  });
  it("reports weeks, days and trimester from a due date", () => {
    const due = "2026-10-17";
    expect(gestationalAge(due, "2026-01-10")).toEqual({
      weeks: 0,
      days: 0,
      totalDays: 0,
      trimester: 1,
    });
    expect(gestationalAge(due, "2026-04-18")).toEqual({
      weeks: 14,
      days: 0,
      totalDays: 98,
      trimester: 2,
    });
    expect(gestationalAge(due, "2026-07-25")).toEqual({
      weeks: 28,
      days: 0,
      totalDays: 196,
      trimester: 3,
    });
    expect(gestationalAge(due, "2026-07-28")).toMatchObject({ weeks: 28, days: 3 });
  });
});
