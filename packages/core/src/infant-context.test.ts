import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { DAYS_PER_MONTH } from "./growth";
import {
  INFANT_CONTEXT_RANGES,
  INFANT_CONTEXT_SOURCES,
  completedMonths,
  infantContext,
  type AgeEdge,
  type InfantContextKind,
  type InfantContextRangeId,
  type InfantContextSourceId,
} from "./infant-context";

const KINDS: InfantContextKind[] = ["feed", "wetDiaper", "sleep"];

const idOn = (kind: InfantContextKind, dateOfBirth: string, today: string) =>
  infantContext(kind, dateOfBirth, today)?.id ?? null;

describe("completedMonths", () => {
  it("counts a month once its day comes, the same rule as the age label", () => {
    // The pairs formatChildAge's tests use for "2 months" through "2 years".
    expect(completedMonths("2026-07-06", "2026-10-05")).toBe(2);
    expect(completedMonths("2026-07-05", "2026-10-05")).toBe(3);
    expect(completedMonths("2025-10-06", "2026-10-05")).toBe(11);
    expect(completedMonths("2024-10-06", "2026-10-05")).toBe(23);
    expect(completedMonths("2024-10-05", "2026-10-05")).toBe(24);
    expect(completedMonths("2026-10-05", "2026-10-05")).toBe(0);
  });
  it("waits for the next month's first day when a month has no such day", () => {
    expect(completedMonths("2026-01-31", "2026-02-28")).toBe(0);
    expect(completedMonths("2026-01-31", "2026-03-01")).toBe(1);
    expect(completedMonths("2024-02-29", "2025-02-28")).toBe(11);
    expect(completedMonths("2024-02-29", "2025-03-01")).toBe(12);
  });
  it("refuses an end before the start and anything that is not a calendar date", () => {
    expect(() => completedMonths("2026-10-06", "2026-10-05")).toThrow(RangeError);
    expect(() => completedMonths("2026-10-5", "2026-10-05")).toThrow(TypeError);
    expect(() => completedMonths("2026-10-05", "2026-10-05T00:00:00Z")).toThrow(TypeError);
  });
});

describe("infantContext sleep bands", () => {
  it("gives no sleep range at 3 months 30 days and the 4 to 12 month range at 4 months", () => {
    // Born February 1: 3 months on May 1, 3 months 30 days on May 31, 4 months on June 1.
    expect(idOn("sleep", "2026-02-01", "2026-05-31")).toBeNull();
    const fourMonths = infantContext("sleep", "2026-02-01", "2026-06-01");
    expect(fourMonths).toMatchObject({
      id: "sleep-4-to-12-months",
      low: 12,
      high: 16,
      atLeast: false,
      includesNaps: true,
      sources: ["aasm-2016-statement", "aasm-2016-methodology"],
    });
    expect(fourMonths?.band.label).toBe("4 to 12 months");
  });
  it("starts the 4 month band on the label's day even when the fourth month is short", () => {
    // Born October 31: there is no February 31, so 4 months comes on March 1.
    expect(idOn("sleep", "2025-10-31", "2026-02-28")).toBeNull();
    expect(idOn("sleep", "2025-10-31", "2026-03-01")).toBe("sleep-4-to-12-months");
  });
  it("moves to the next band on the birthday that starts it", () => {
    const born = "2025-10-06";
    expect(idOn("sleep", born, "2026-10-05")).toBe("sleep-4-to-12-months");
    expect(idOn("sleep", born, "2026-10-06")).toBe("sleep-1-to-2-years");
    expect(idOn("sleep", born, "2028-10-05")).toBe("sleep-1-to-2-years");
    expect(idOn("sleep", born, "2028-10-06")).toBe("sleep-3-to-5-years");
    expect(idOn("sleep", born, "2031-10-05")).toBe("sleep-3-to-5-years");
    expect(idOn("sleep", born, "2031-10-06")).toBe("sleep-6-to-12-years");
    expect(idOn("sleep", born, "2038-10-05")).toBe("sleep-6-to-12-years");
    expect(idOn("sleep", born, "2038-10-06")).toBe("sleep-13-to-18-years");
    expect(idOn("sleep", born, "2044-10-05")).toBe("sleep-13-to-18-years");
    expect(idOn("sleep", born, "2044-10-06")).toBeNull();
  });
  it("turns a leap day baby one on March 1 in a common year", () => {
    expect(idOn("sleep", "2024-02-29", "2025-02-28")).toBe("sleep-4-to-12-months");
    expect(idOn("sleep", "2024-02-29", "2025-03-01")).toBe("sleep-1-to-2-years");
  });
  it("carries the AASM figures for every band, with naps counted only before 6 years", () => {
    const born = "2020-01-15";
    const at = (today: string) => infantContext("sleep", born, today);
    expect(at("2021-01-15")).toMatchObject({ low: 11, high: 14, includesNaps: true });
    expect(at("2023-01-15")).toMatchObject({ low: 10, high: 13, includesNaps: true });
    expect(at("2026-01-15")).toMatchObject({ low: 9, high: 12, includesNaps: false });
    expect(at("2033-01-15")).toMatchObject({ low: 8, high: 10, includesNaps: false });
  });
  it("never gives a sleep range on any day before 4 months", () => {
    const found: string[] = [];
    for (const born of ["2026-01-31", "2026-02-01", "2025-10-31", "2024-02-29"]) {
      let today = born;
      while (completedMonths(born, today) < 4) {
        const id = idOn("sleep", born, today);
        if (id) found.push(`${id} on ${today} from ${born}`);
        today = addDays(today, 1);
      }
      expect(idOn("sleep", born, today)).toBe("sleep-4-to-12-months");
    }
    expect(found).toEqual([]);
  });
});

describe("infantContext newborn bands", () => {
  it("gives the newborn feed range from the day of birth to the day before 1 month", () => {
    const newborn = infantContext("feed", "2026-09-06", "2026-09-06");
    expect(newborn).toMatchObject({
      id: "feed-newborn",
      low: 8,
      high: 12,
      atLeast: true,
      includesNaps: false,
      sources: ["aap-breastfed-enough-milk", "aap-how-often-and-how-much"],
    });
    expect(newborn?.band.label).toBe("Newborns");
    expect(idOn("feed", "2026-09-06", "2026-10-05")).toBe("feed-newborn");
    expect(idOn("feed", "2026-09-06", "2026-10-06")).toBeNull();
  });
  it("ends the newborn band on March 1 for a baby born January 31", () => {
    expect(idOn("feed", "2026-01-31", "2026-02-28")).toBe("feed-newborn");
    expect(idOn("wetDiaper", "2026-01-31", "2026-02-28")).toBe("wet-diaper-after-first-days");
    expect(idOn("feed", "2026-01-31", "2026-03-01")).toBeNull();
    expect(idOn("wetDiaper", "2026-01-31", "2026-03-01")).toBeNull();
  });
  it("switches wet diapers from 2 to 3 to at least 5 to 6 on day 5, the later edge of 4 to 5 days", () => {
    const born = "2026-09-06";
    expect(infantContext("wetDiaper", born, born)).toMatchObject({
      id: "wet-diaper-first-days",
      low: 2,
      high: 3,
      atLeast: false,
    });
    expect(idOn("wetDiaper", born, addDays(born, 4))).toBe("wet-diaper-first-days");
    expect(infantContext("wetDiaper", born, addDays(born, 5))).toMatchObject({
      id: "wet-diaper-after-first-days",
      low: 5,
      high: 6,
      atLeast: true,
    });
    expect(idOn("wetDiaper", born, "2026-10-05")).toBe("wet-diaper-after-first-days");
    expect(idOn("wetDiaper", born, "2026-10-06")).toBeNull();
  });
  it("never gives a feed or wet diaper range after the first month", () => {
    const born = "2026-03-15";
    const found: string[] = [];
    for (let today = "2026-04-15"; today < "2032-03-15"; today = addDays(today, 1)) {
      for (const kind of ["feed", "wetDiaper"] as const) {
        const id = idOn(kind, born, today);
        if (id) found.push(`${id} on ${today}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe("infantContext at the edges of its input", () => {
  it("matches a six-week-old and a thirty-month-old, the ages of the seeded children", () => {
    // Ilo and Sol, 42 and 913 days old on the seed's day, 2026-10-04.
    for (const kind of KINDS) expect(infantContext(kind, "2026-08-23", "2026-10-04")).toBeNull();
    expect(idOn("sleep", "2024-04-04", "2026-10-04")).toBe("sleep-1-to-2-years");
    expect(idOn("feed", "2024-04-04", "2026-10-04")).toBeNull();
  });
  it("gives nothing before the date of birth, as when a guardian's zone is a day ahead", () => {
    for (const kind of KINDS) expect(infantContext(kind, "2026-10-06", "2026-10-05")).toBeNull();
  });
  it("refuses anything that is not a calendar date", () => {
    expect(() => infantContext("feed", "2026-9-6", "2026-10-05")).toThrow(TypeError);
    expect(() => infantContext("sleep", "2026-09-06", "2026-10-05T08:00:00Z")).toThrow(TypeError);
  });
});

describe("infant context data", () => {
  it("has unique range ids, low below high and known sources, and uses every source", () => {
    const ids = INFANT_CONTEXT_RANGES.map((range) => range.id);
    expect(new Set(ids).size).toBe(ids.length);
    const used = new Set<InfantContextSourceId>();
    for (const range of INFANT_CONTEXT_RANGES) {
      expect(range.low).toBeLessThan(range.high);
      for (const source of range.sources) {
        expect(INFANT_CONTEXT_SOURCES[source].id).toBe(source);
        used.add(source);
      }
      if (range.kind !== "sleep") expect(range.includesNaps).toBe(false);
    }
    expect([...used].sort()).toEqual(Object.keys(INFANT_CONTEXT_SOURCES).sort());
  });
  it("starts no sleep band before 4 months", () => {
    for (const range of INFANT_CONTEXT_RANGES.filter((each) => each.kind === "sleep")) {
      expect(range.band.from).toHaveProperty("months");
      expect((range.band.from as { months: number }).months).toBeGreaterThanOrEqual(4);
    }
  });
  it("keeps each kind's bands in order, none empty, each ending where the next begins", () => {
    for (const kind of KINDS) {
      const bands = INFANT_CONTEXT_RANGES.filter((range) => range.kind === kind).map(
        (range) => range.band,
      );
      bands.forEach(({ from, until }, index) => {
        if ("days" in from && "days" in until) expect(from.days).toBeLessThan(until.days);
        else if ("months" in from && "months" in until)
          expect(from.months).toBeLessThan(until.months);
        // A day edge before a month edge: no month is shorter than 28 days.
        else
          expect("days" in from && "months" in until && from.days < 28 * until.months).toBe(true);
        if (index > 0) expect(from).toEqual(bands[index - 1]?.until);
      });
    }
  });
  it("agrees with an oracle on real calendars around every edge", () => {
    // An oracle written apart from the module: a band holds the days from its
    // `from` edge up to, not including, its `until` edge. It is checked on
    // every day of the first 15 months (the day, 1 month, 4 month and 1 year
    // edges) and on the days around the 3, 6, 13 and 19 year birthdays.
    const reachedOn = (edge: AgeEdge, days: number, months: number) =>
      "days" in edge ? days >= edge.days : months >= edge.months;
    const problems: string[] = [];
    for (const born of ["2024-02-29", "2025-10-31", "2026-01-31", "2026-02-01"]) {
      const days = new Set<number>();
      for (let day = 0; day < 460; day += 1) days.add(day);
      for (const months of [36, 72, 156, 228]) {
        const centre = Math.round(months * DAYS_PER_MONTH);
        const before = completedMonths(born, addDays(born, centre - 5));
        const after = completedMonths(born, addDays(born, centre + 5));
        if (before >= months || after < months)
          problems.push(`no ${months} month edge near day ${centre}`);
        for (let day = centre - 5; day <= centre + 5; day += 1) days.add(day);
      }
      for (const day of days) {
        const today = addDays(born, day);
        const months = completedMonths(born, today);
        for (const kind of KINDS) {
          const holding = INFANT_CONTEXT_RANGES.filter(
            (range) =>
              range.kind === kind &&
              reachedOn(range.band.from, day, months) &&
              !reachedOn(range.band.until, day, months),
          ).map((range) => range.id);
          const found = idOn(kind, born, today);
          if (holding.length > 1 || found !== (holding[0] ?? null)) {
            problems.push(
              `${kind} on ${today} from ${born}: oracle ${holding.join(" and ")}, got ${found}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
  it("labels bands in plain words with no verdict in them", () => {
    // "too" covers "too few" and "too many"; AAP's "the first few days" is a time, not a verdict.
    for (const range of INFANT_CONTEXT_RANGES) {
      expect(range.band.label).not.toMatch(
        /\b(too|low|high|normal|abnormal|enough|should|alarm|concern|worry)\b/i,
      );
    }
  });
});

/**
 * The sentence each range relies on, as SOURCES.md quotes it. `states` holds
 * the figures; `supports` sets the band's edges or agrees with the figure.
 */
const QUOTES: Record<InfantContextRangeId, { states: string; supports: string[] }> = {
  "feed-newborn": {
    states: "Nurse at least 8 to 12 times every 24 hours.",
    supports: [
      "If bottle-fed, most newborns eat every 2 to 3 hours; 8 times is generally recommended as the minimum every 24 hours.",
      "Breastfed newborns usually nurse every 2 hours from the start of the feeding to the next feeding so 10-12 sessions in 24 hours is the norm.",
      "By the end of the first month, most babies consume at least 3 or 4 ounces per feeding, about every 3 to 4 hours.",
    ],
  },
  "wet-diaper-first-days": {
    states: "In the first few days after birth, a baby should have 2 to 3 wet diapers each day.",
    supports: [],
  },
  "wet-diaper-after-first-days": {
    states: "After the first 4 to 5 days, a baby should have at least 5 to 6 wet diapers a day.",
    supports: ["A newborn's diaper is a good indicator of whether they are getting enough to eat."],
  },
  "sleep-4-to-12-months": {
    states:
      "Infants* 4 months to 12 months should sleep 12 to 16 hours per 24 hours (including naps) on a regular basis to promote optimal health.",
    supports: [
      "*Recommendations for infants younger than 4 months are not included due to the wide range of normal variation in duration and patterns of sleep, and insufficient evidence for associations with health outcomes.",
      "Thus, no recommendations were made for children under 4 months of age for any of the categories.",
    ],
  },
  "sleep-1-to-2-years": {
    states:
      "Children 1 to 2 years of age should sleep 11 to 14 hours per 24 hours (including naps) on a regular basis to promote optimal health.",
    supports: [],
  },
  "sleep-3-to-5-years": {
    states:
      "Children 3 to 5 years of age should sleep 10 to 13 hours per 24 hours (including naps) on a regular basis to promote optimal health.",
    supports: [],
  },
  "sleep-6-to-12-years": {
    states:
      "Children 6 to 12 years of age should sleep 9 to 12 hours per 24 hours on a regular basis to promote optimal health.",
    supports: [],
  },
  "sleep-13-to-18-years": {
    states:
      "Teenagers 13 to 18 years of age should sleep 8 to 10 hours per 24 hours on a regular basis to promote optimal health.",
    supports: [],
  },
};

/** The methodology sentence that fixes every sleep band's edges. */
const AASM_AGE_GROUPS =
  "the following age groups were created: < 12 months, 12 months to < 3 years, 3 years to < 6 years, 6 years to < 13 years, and";

const normalize = (text: string) => text.replace(/\\\*/g, "*").replace(/\s+/g, " ").trim();

/** The quotes under each source id in SOURCES.md's "The sentences each range relies on". */
function quotesBySource(): Map<InfantContextSourceId, string[]> {
  const markdown = readFileSync(new URL("../data/SOURCES.md", import.meta.url), "utf8");
  const section = markdown.split("### The sentences each range relies on")[1]?.split("\n### ")[0];
  if (!section) throw new Error("SOURCES.md has no section for the infant context quotes");
  const sourceIds = Object.keys(INFANT_CONTEXT_SOURCES) as InfantContextSourceId[];
  const quotes = new Map<InfantContextSourceId, string[]>();
  let source: InfantContextSourceId | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (source && lines.length > 0)
      quotes.set(source, [...(quotes.get(source) ?? []), normalize(lines.join(" "))]);
    lines = [];
  };
  for (const line of section.split("\n")) {
    if (line.startsWith(">")) {
      lines.push(line.slice(1));
      continue;
    }
    flush();
    const named = sourceIds.find((id) => line.startsWith(`\`${id}\``));
    if (named) source = named;
  }
  flush();
  return quotes;
}

describe("the vendored quotes in packages/core/data/SOURCES.md", () => {
  const quotes = quotesBySource();
  const quotedBy = (source: InfantContextSourceId, sentence: string) =>
    (quotes.get(source) ?? []).some((quote) => quote.includes(normalize(sentence)));

  it("quote each range's figures under its first source, word for word", () => {
    for (const range of INFANT_CONTEXT_RANGES) {
      const { states } = QUOTES[range.id];
      expect(quotedBy(range.sources[0], states), `${range.id} under ${range.sources[0]}`).toBe(
        true,
      );
      expect(states).toContain(`${range.low} to ${range.high}`);
      expect(states.includes("at least"), `${range.id} at least`).toBe(range.atLeast);
      expect(states.includes("(including naps)"), `${range.id} naps`).toBe(range.includesNaps);
      for (const number of range.band.label.match(/\d+/g) ?? []) expect(states).toContain(number);
    }
  });
  it("quote every supporting sentence under one of the range's sources", () => {
    for (const range of INFANT_CONTEXT_RANGES) {
      for (const sentence of QUOTES[range.id].supports) {
        expect(
          range.sources.some((source) => quotedBy(source, sentence)),
          `${range.id}: ${sentence}`,
        ).toBe(true);
      }
      if (range.kind === "sleep")
        expect(quotedBy("aasm-2016-methodology", AASM_AGE_GROUPS)).toBe(true);
    }
  });
  it("list every source with its URL", () => {
    const markdown = readFileSync(new URL("../data/SOURCES.md", import.meta.url), "utf8");
    for (const source of Object.values(INFANT_CONTEXT_SOURCES)) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(markdown).toContain(`\`${source.id}\``);
      expect(markdown).toContain(source.url);
    }
  });
});
