import { PregnancyDatingInput } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import {
  DUE_DATE_AHEAD_DAYS,
  DUE_DATE_PAST_DAYS,
  EMPTY_DATING,
  PREGNANCY_SPAN_DAYS,
  checkDueDate,
  checkPast,
  checkPregnancyDay,
  checkSince,
  dateFieldOf,
  dateOrderFor,
  datingFrom,
  futureExample,
  pastExample,
  readDate,
  wholeNumber,
  type DateEntry,
  type DatingDraft,
} from "./dates";

const today = "2026-10-05";
const complete = (): DateEntry => "complete";

describe("reading a typed date", () => {
  it("takes a real date from three full parts", () => {
    expect(readDate("2026-09-20", "complete", true)).toEqual({ date: "2026-09-20", problem: null });
  });

  it("lets an optional date be left empty, and asks for a needed one", () => {
    expect(readDate(null, "empty", false)).toEqual({ date: null, problem: null });
    expect(readDate(null, "empty", true).problem).toEqual({ kind: "required" });
  });

  it("never takes half a date, and says whether it may be cleared instead", () => {
    expect(readDate(null, "partial", false).problem).toEqual({ kind: "partial", optional: true });
    expect(readDate(null, "partial", true).problem).toEqual({ kind: "partial", optional: false });
  });

  it("stops three parts that make no date, which the input itself words", () => {
    expect(readDate(null, "complete", true).problem).toEqual({ kind: "invalid" });
  });
});

describe("the windows a date must fall in", () => {
  it("keeps something that already happened up to today", () => {
    expect(checkPast(today, today)).toBeNull();
    expect(checkPast("2026-10-06", today)).toEqual({ kind: "future" });
  });

  it("dates a pregnancy from no further back than 42 weeks", () => {
    expect(PREGNANCY_SPAN_DAYS).toBe(294);
    expect(checkPregnancyDay("2025-12-15", today)).toBeNull();
    expect(checkPregnancyDay("2025-12-14", today)).toEqual({ kind: "tooLongAgo" });
    expect(checkPregnancyDay("2026-10-06", today)).toEqual({ kind: "future" });
  });

  it("takes a due date from 2 weeks ago to 40 weeks ahead, and names the window when not", () => {
    expect([DUE_DATE_PAST_DAYS, DUE_DATE_AHEAD_DAYS]).toEqual([14, 280]);
    expect(checkDueDate("2026-09-21", today)).toBeNull();
    expect(checkDueDate("2027-07-12", today)).toBeNull();
    const window = { kind: "dueWindow", from: "2026-09-21", to: "2027-07-12" };
    expect(checkDueDate("2026-09-20", today)).toEqual(window);
    expect(checkDueDate("2027-07-13", today)).toEqual(window);
  });

  it("puts the first period since a birth after the birth day and not after today", () => {
    expect(checkSince("2026-09-30", "2026-08-01", today)).toBeNull();
    expect(checkSince("2026-08-01", "2026-08-01", today)).toEqual({ kind: "beforeBirth" });
    expect(checkSince("2026-07-30", "2026-08-01", today)).toEqual({ kind: "beforeBirth" });
    expect(checkSince("2026-10-07", "2026-08-01", today)).toEqual({ kind: "future" });
    // A birth date that did not pass its own check leaves the order unchecked.
    expect(checkSince("2026-09-30", null, today)).toBeNull();
  });

  it("reads whole numbers only, inside the range", () => {
    expect(wholeNumber("12", 0, 42)).toBe(12);
    expect(wholeNumber(" 0 ", 0, 6)).toBe(0);
    expect(wholeNumber("", 0, 6)).toBeNull();
    expect(wholeNumber("7", 0, 6)).toBeNull();
    expect(wholeNumber("1.5", 0, 6)).toBeNull();
    expect(wholeNumber("-1", 0, 6)).toBeNull();
  });
});

describe("method-first pregnancy dating", () => {
  const draft = (patch: Partial<DatingDraft>): DatingDraft => ({ ...EMPTY_DATING, ...patch });

  it("asks for the method first", () => {
    expect(datingFrom(EMPTY_DATING, today, complete)).toEqual({
      errors: { method: { kind: "method" } },
    });
  });

  it("turns each method into the input POST /v1/pregnancies takes, and no due date of its own", () => {
    const cases: Array<[DatingDraft, PregnancyDatingInput]> = [
      [
        draft({ method: "lmp", lastPeriodStart: "2026-07-27" }),
        { method: "lmp", lastPeriodStart: "2026-07-27" },
      ],
      [
        draft({ method: "ultrasound", scanDate: "2026-09-21", weeks: "12", days: "3" }),
        { method: "ultrasound", scanDate: "2026-09-21", weeks: 12, days: 3 },
      ],
      [
        draft({ method: "transfer", transferDate: "2026-09-05", embryoAgeDays: "5" }),
        { method: "transfer", transferDate: "2026-09-05", embryoAgeDays: 5 },
      ],
      [
        draft({ method: "manual", dueDate: "2027-04-23" }),
        { method: "manual", dueDate: "2027-04-23" },
      ],
    ];
    for (const [input, expected] of cases) {
      const result = datingFrom(input, today, complete);
      expect(result).toEqual({ dating: expected });
      // The schema the API validates with accepts it as it is.
      expect(PregnancyDatingInput.parse(expected)).toEqual(expected);
    }
  });

  it("sends only the chosen method's fields, so a switch back and forth loses nothing and leaks nothing", () => {
    const result = datingFrom(
      draft({ method: "manual", dueDate: "2027-04-23", lastPeriodStart: "2026-07-27", weeks: "9" }),
      today,
      complete,
    );
    expect(result).toEqual({ dating: { method: "manual", dueDate: "2027-04-23" } });
  });

  it("names each field that stops it", () => {
    const scan = datingFrom(
      draft({ method: "ultrasound", scanDate: null, weeks: "43", days: "x" }),
      today,
      (field) => (field === "scanDate" ? "partial" : "complete"),
    );
    expect(scan).toEqual({
      errors: {
        scanDate: { kind: "partial", optional: false },
        weeks: { kind: "range", field: "weeks" },
        days: { kind: "range", field: "days" },
      },
    });
    const transfer = datingFrom(
      draft({ method: "transfer", transferDate: "2026-10-06", embryoAgeDays: "0" }),
      today,
      complete,
    );
    expect(transfer).toEqual({
      errors: {
        transferDate: { kind: "future" },
        embryoAgeDays: { kind: "range", field: "embryoAgeDays" },
      },
    });
    expect(datingFrom(draft({ method: "lmp" }), today, () => "empty")).toEqual({
      errors: { lastPeriodStart: { kind: "required" } },
    });
    expect(datingFrom(draft({ method: "manual", dueDate: "2028-01-01" }), today, complete)).toEqual(
      {
        errors: { dueDate: { kind: "dueWindow", from: "2026-09-21", to: "2027-07-12" } },
      },
    );
  });

  it("knows the date field each method asks for", () => {
    expect((["lmp", "ultrasound", "transfer", "manual"] as const).map(dateFieldOf)).toEqual([
      "lastPeriodStart",
      "scanDate",
      "transferDate",
      "dueDate",
    ]);
  });
});

describe("example lines", () => {
  it("use a day past the twelfth, so no field order can misread them", () => {
    for (const day of ["2026-10-05", "2026-10-20", "2026-03-01", "2026-12-31", "2027-02-28"]) {
      for (const example of [pastExample(day), futureExample(day)]) {
        expect(Number(example.slice(8, 10))).toBeGreaterThanOrEqual(13);
      }
      expect(pastExample(day) < day).toBe(true);
      expect(futureExample(day) > day).toBe(true);
    }
    expect(pastExample("2026-10-05")).toBe("2026-08-31");
    expect(futureExample("2026-10-05")).toBe("2027-03-13");
  });
});

describe("the order she types a date in", () => {
  it("follows the browser's locale, month first when it says nothing usable", () => {
    expect(dateOrderFor("en-US")).toBe("mdy");
    expect(dateOrderFor("en-GB")).toBe("dmy");
    expect(dateOrderFor("de-DE")).toBe("dmy");
    expect(dateOrderFor("ja-JP")).toBe("ymd");
    expect(dateOrderFor("not a locale")).toBe("mdy");
  });
});
