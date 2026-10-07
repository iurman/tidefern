import type { CycleEntry, CyclePrediction, Note } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import {
  EXPECTED_PERIOD_WORDS,
  FERTILE_WORDS,
  LOGGED_PERIOD_WORDS,
  OVULATION_WORDS,
  calendarDaysFrom,
  calendarHref,
  calendarMarks,
  childAgeLine,
  dateFromLogHref,
  daySummary,
  dayWords,
  gridRange,
  hasLoggedDayIn,
  isLoggedDay,
  lastOfMonth,
  listItems,
  loggedWindows,
  monthFromParam,
  notedMarks,
  predictionMarks,
  shiftMonth,
  viewFromParam,
  type CalendarDay,
} from "./calendar-model";

const today = "2026-10-05";
const subjectId = "018f5e7a-5eed-7000-8000-000000000001";

function day(date: string, patch: Partial<CalendarDay> = {}): CalendarDay {
  return { date, flow: null, symptoms: [], mood: null, note: false, ...patch };
}

function entry(date: string, patch: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: `018f5e7a-5eed-7010-8000-${date.replaceAll("-", "").padStart(12, "0")}`,
    subjectId,
    date,
    flow: null,
    period: false,
    symptoms: [],
    mood: null,
    version: 1,
    updatedAt: `${date}T08:00:00.000Z`,
    deletedAt: null,
    ...patch,
  };
}

function note(date: string, patch: Partial<Note> = {}): Note {
  return {
    id: `018f5e7a-5eed-7040-8000-${date.replaceAll("-", "").padStart(12, "0")}`,
    subjectId,
    authorId: subjectId,
    category: "journal.private",
    date,
    body: "A line of text.",
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    version: 1,
    ...patch,
  };
}

/** Noor's seeded prediction: three starts 28 days apart, the third on Oct 3 (packages/db seed). */
const estimate: CyclePrediction = {
  subjectId,
  computedAt: "2026-10-05T06:00:00.000Z",
  basis: "estimate",
  cycleLength: 28,
  sampleSize: 2,
  nextPeriod: { expected: "2026-10-31", start: "2026-10-28", end: "2026-11-03" },
  ovulation: { expected: "2026-10-17", start: "2026-10-15", end: "2026-10-19" },
  fertileWindow: { start: "2026-10-12", end: "2026-10-17" },
  uncertaintyDays: 3,
  ovulationBandDays: 2,
  irregular: false,
  periodsLogged: 3,
  cycleLengthRange: { min: 28, max: 28 },
  daysLate: 0,
  pointToCare: false,
};

describe("the month the page shows", () => {
  it("reads ?month=YYYY-MM as that month's first day and falls back to today's month", () => {
    expect(monthFromParam("2026-09", today)).toBe("2026-09-01");
    expect(monthFromParam(["2025-12", "2026-01"], today)).toBe("2025-12-01");
    for (const bad of [undefined, "", "2026-13", "2026-9", "2026-09-01", "September", "0000-00"]) {
      expect(monthFromParam(bad, today), String(bad)).toBe("2026-10-01");
    }
  });

  it("opens the list only for ?view=list", () => {
    expect(viewFromParam("list")).toBe("list");
    expect(viewFromParam(["list"])).toBe("list");
    expect(viewFromParam("month")).toBe("month");
    expect(viewFromParam("grid")).toBe("month");
    expect(viewFromParam(undefined)).toBe("month");
  });

  it("moves by whole months across years and knows each month's last day", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-10-01", 13)).toBe("2027-11-01");
    expect(shiftMonth("2026-10-17", -24)).toBe("2024-10-01");
    expect(lastOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(lastOfMonth("2026-02-01")).toBe("2026-02-28");
    expect(lastOfMonth("2026-12-01")).toBe("2026-12-31");
  });

  it("covers whole weeks in her week start, neighbours included", () => {
    expect(gridRange("2026-10-01", 1)).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(gridRange("2026-10-01", 7)).toEqual({ from: "2026-09-27", to: "2026-10-31" });
    expect(gridRange("2026-02-01", 1)).toEqual({ from: "2026-01-26", to: "2026-03-01" });
  });

  it("keeps the address short: the month only when it is not today's, the view only for the list", () => {
    expect(calendarHref({ month: "2026-10-01", view: "month", today })).toBe("/calendar");
    expect(calendarHref({ month: "2026-10-20", view: "month", today })).toBe("/calendar");
    expect(calendarHref({ month: "2026-09-01", view: "month", today })).toBe(
      "/calendar?month=2026-09",
    );
    expect(calendarHref({ month: "2026-10-01", view: "list", today })).toBe("/calendar?view=list");
    expect(calendarHref({ month: "2027-01-01", view: "list", today })).toBe(
      "/calendar?month=2027-01&view=list",
    );
  });

  it("reads the date out of a day sheet link and nothing else", () => {
    expect(dateFromLogHref("/log/2026-10-04")).toBe("2026-10-04");
    expect(dateFromLogHref("/log/2026-02-30")).toBeNull();
    expect(dateFromLogHref("/log/2026-10-04?x=1")).toBeNull();
    expect(dateFromLogHref("/logs/2026-10-04")).toBeNull();
    expect(dateFromLogHref("https://example.test/log/2026-10-04")).toBeNull();
    expect(dateFromLogHref(null)).toBeNull();
  });
});

describe("days from the API", () => {
  it("merges the entries and the notes by date, drops tombstones and keeps no note text", () => {
    const days = calendarDaysFrom(
      [
        entry("2026-10-04", { flow: "heavy", symptoms: ["fatigue", "cramps"] }),
        entry("2026-10-03", { flow: "medium", mood: "low" }),
        entry("2026-10-02", { deletedAt: "2026-10-02T09:00:00.000Z", flow: undefined }),
      ],
      [
        note("2026-10-04"),
        note("2026-10-01", { category: "cycle.symptoms" }),
        note("2026-09-30", { deletedAt: "2026-09-30T09:00:00.000Z", body: undefined }),
      ],
    );
    expect(days).toEqual([
      day("2026-10-01", { note: true }),
      day("2026-10-03", { flow: "medium", mood: "low" }),
      day("2026-10-04", { flow: "heavy", symptoms: ["cramps", "fatigue"], note: true }),
    ]);
    expect(JSON.stringify(days)).not.toContain("A line of text.");
  });

  it("counts a saved note as a logged day, as the sheet's footnote promises", () => {
    expect(isLoggedDay(day("2026-10-01", { note: true }))).toBe(true);
    expect(isLoggedDay(day("2026-10-01", { flow: "none" }))).toBe(true);
    expect(isLoggedDay(day("2026-10-01"))).toBe(false);
  });
});

describe("words", () => {
  it("says what was logged in the API's labels, flow first and the note last", () => {
    const logged = day("2026-10-04", {
      flow: "heavy",
      symptoms: ["cramps", "fatigue", "insomnia"],
      mood: "low",
      note: true,
    });
    expect(dayWords(logged)).toBe("heavy flow, cramps, fatigue, trouble sleeping, low mood, note");
    expect(daySummary(logged)).toBe(
      "Heavy flow, cramps, fatigue, trouble sleeping, low mood, note",
    );
    expect(daySummary(day("2026-10-01", { flow: "none" }))).toBe("No flow");
    expect(daySummary(day("2026-10-01", { mood: "bright" }))).toBe("Bright mood");
    expect(daySummary(day("2026-10-01", { note: true }))).toBe("Note");
  });

  it("says spotting once when both the flow and the symptom name it", () => {
    expect(daySummary(day("2026-08-12", { flow: "spotting", symptoms: ["spotting"] }))).toBe(
      "Spotting",
    );
  });
});

describe("drawing", () => {
  it("draws each run of period days as one solid pill, and spotting or none as no pill", () => {
    const august = [
      day("2026-08-08", { flow: "heavy" }),
      day("2026-08-09", { flow: "heavy" }),
      day("2026-08-10", { flow: "medium" }),
      day("2026-08-11", { flow: "light" }),
      day("2026-08-12", { flow: "spotting" }),
      day("2026-08-14", { flow: "light" }),
      day("2026-08-15", { flow: "none" }),
      day("2026-08-22", { mood: "bright" }),
    ];
    expect(loggedWindows(august)).toEqual([
      { start: "2026-08-08", end: "2026-08-11", texture: "logged", words: LOGGED_PERIOD_WORDS },
      { start: "2026-08-14", end: "2026-08-14", texture: "logged", words: LOGGED_PERIOD_WORDS },
    ]);
  });

  it("draws the next period's whole band dashed, the fertile window dotted and ovulation as a point", () => {
    expect(predictionMarks(estimate)).toEqual({
      windows: [
        {
          start: "2026-10-28",
          end: "2026-11-03",
          texture: "predicted",
          words: EXPECTED_PERIOD_WORDS,
        },
        { start: "2026-10-12", end: "2026-10-17", texture: "estimated", words: FERTILE_WORDS },
      ],
      points: [{ date: "2026-10-17", words: OVULATION_WORDS }],
    });
  });

  it("puts the contraception line, word for word, in every fertile day's name", () => {
    expect(FERTILE_WORDS).toBe(
      "fertile window estimated. An estimate from your logged dates. Not a form of contraception.",
    );
    expect(FERTILE_WORDS.endsWith(CONTRACEPTION_LINE)).toBe(true);
  });

  it("draws a first guess the same way, with its wider band", () => {
    const firstGuess: CyclePrediction = {
      ...estimate,
      basis: "first_guess",
      sampleSize: 0,
      nextPeriod: { expected: "2026-10-23", start: "2026-10-19", end: "2026-10-27" },
      ovulation: { expected: "2026-10-09", start: "2026-10-07", end: "2026-10-11" },
      fertileWindow: { start: "2026-10-04", end: "2026-10-09" },
      uncertaintyDays: 4,
    };
    const marks = predictionMarks(firstGuess);
    expect(marks.windows.map((window) => [window.texture, window.start, window.end])).toEqual([
      ["predicted", "2026-10-19", "2026-10-27"],
      ["estimated", "2026-10-04", "2026-10-09"],
    ]);
    expect(marks.points).toEqual([{ date: "2026-10-09", words: OVULATION_WORDS }]);
  });

  it("draws nothing for not enough regular cycles or basis none, whatever else the answer holds", () => {
    expect(predictionMarks({ ...estimate, basis: "not_enough_regular_cycles" })).toEqual({
      windows: [],
      points: [],
    });
    expect(predictionMarks({ ...estimate, basis: "none" })).toEqual({ windows: [], points: [] });
    expect(predictionMarks(null)).toEqual({ windows: [], points: [] });
  });

  it("dots every logged day with its words and lists logged pills before the prediction", () => {
    const days = [day("2026-10-03", { flow: "medium" }), day("2026-10-04", { note: true })];
    expect(notedMarks(days)).toEqual([
      { date: "2026-10-03", words: "medium flow" },
      { date: "2026-10-04", words: "note" },
    ]);
    const marks = calendarMarks(days, estimate);
    expect(marks.windows.map((window) => window.texture)).toEqual([
      "logged",
      "predicted",
      "estimated",
    ]);
    expect(marks.noted).toHaveLength(2);
  });
});

describe("the month's own days", () => {
  const days = [
    day("2026-09-28", { mood: "low" }),
    day("2026-10-01", { symptoms: ["tender_breasts"] }),
    day("2026-10-04", { flow: "heavy", note: true }),
    day("2026-11-01"),
  ];

  it("asks whether the month itself has a logged day, never its neighbours in the grid", () => {
    expect(hasLoggedDayIn(days, "2026-10-01")).toBe(true);
    expect(hasLoggedDayIn([day("2026-09-28", { mood: "low" })], "2026-10-01")).toBe(false);
    expect(hasLoggedDayIn([], "2026-10-01")).toBe(false);
  });

  it("lists the month's logged days with their words and their sheet", () => {
    expect(listItems(days, "2026-10-01")).toEqual([
      { date: "2026-10-01", summary: "Tender breasts", href: "/log/2026-10-01" },
      { date: "2026-10-04", summary: "Heavy flow, note", href: "/log/2026-10-04" },
    ]);
  });
});

describe("the postpartum card's age line", () => {
  const ilo = { id: "child-ilo", displayName: "Ilo", dateOfBirth: "2026-08-23" };
  const sol = { id: "child-sol", displayName: "Sol", dateOfBirth: "2024-04-04" };

  it("names the youngest child she is a guardian of, in formatChildAge's words", () => {
    expect(childAgeLine([sol, ilo], ["child-ilo", "child-sol"], "2026-10-04")).toBe("Ilo, 6 weeks");
    expect(childAgeLine([sol, ilo], ["child-sol"], "2026-10-04")).toBe("Sol, 2 years, 6 months");
  });

  it("skips a child she only holds a grant for and a date of birth after today", () => {
    const later = { id: "child-later", displayName: "Later", dateOfBirth: "2026-12-01" };
    expect(childAgeLine([ilo, later], ["child-later"], "2026-10-04")).toBeNull();
    expect(childAgeLine([ilo], [], "2026-10-04")).toBeNull();
    expect(childAgeLine([], ["child-ilo"], "2026-10-04")).toBeNull();
  });

  it("reads a birth today in lower case after the name", () => {
    const born = { id: "child-new", displayName: "Ren", dateOfBirth: "2026-10-04" };
    expect(childAgeLine([born], ["child-new"], "2026-10-04")).toBe("Ren, born today");
  });
});
