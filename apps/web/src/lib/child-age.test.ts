import { describe, expect, it } from "vitest";
import { formatChildAge } from "./child-age";

describe("formatChildAge", () => {
  it("says days for the first two weeks", () => {
    expect(formatChildAge("2026-10-05", "2026-10-05")).toBe("Born today");
    expect(formatChildAge("2026-10-04", "2026-10-05")).toBe("1 day");
    expect(formatChildAge("2026-09-28", "2026-10-05")).toBe("7 days");
    expect(formatChildAge("2026-09-22", "2026-10-05")).toBe("13 days");
  });

  it("says weeks and days until thirteen weeks", () => {
    expect(formatChildAge("2026-09-21", "2026-10-05")).toBe("2 weeks");
    expect(formatChildAge("2026-09-04", "2026-10-05")).toBe("4 weeks, 3 days");
    expect(formatChildAge("2026-08-24", "2026-10-05")).toBe("6 weeks");
    expect(formatChildAge("2026-07-07", "2026-10-05")).toBe("12 weeks, 6 days");
  });

  it("says whole months from thirteen weeks to two years, counting a month once its day comes", () => {
    expect(formatChildAge("2026-07-06", "2026-10-05")).toBe("2 months");
    expect(formatChildAge("2026-07-05", "2026-10-05")).toBe("3 months");
    expect(formatChildAge("2025-10-06", "2026-10-05")).toBe("11 months");
    expect(formatChildAge("2024-10-06", "2026-10-05")).toBe("23 months");
  });

  it("says years and months from two to five years, then years", () => {
    expect(formatChildAge("2024-10-05", "2026-10-05")).toBe("2 years");
    expect(formatChildAge("2024-04-05", "2026-10-05")).toBe("2 years, 6 months");
    expect(formatChildAge("2025-09-05", "2026-10-05")).toBe("13 months");
    expect(formatChildAge("2021-10-05", "2026-10-05")).toBe("5 years");
    expect(formatChildAge("2021-04-05", "2026-10-05")).toBe("5 years");
  });

  it("refuses a birth after today and anything that is not a calendar date", () => {
    expect(() => formatChildAge("2026-10-06", "2026-10-05")).toThrow(RangeError);
    expect(() => formatChildAge("2026-10-5", "2026-10-05")).toThrow(TypeError);
    expect(() => formatChildAge("2026-10-05T00:00:00Z", "2026-10-05")).toThrow(TypeError);
  });
});
