import { diffDays, isCalendarDate, type CalendarDate } from "./dates";

/**
 * Published daily ranges a family screen can show beside a child's counts:
 * feeds and wet diapers for newborns from the American Academy of Pediatrics'
 * parent pages on HealthyChildren.org, and hours of sleep from four months
 * from the American Academy of Sleep Medicine's 2016 consensus statement.
 * `packages/core/data/SOURCES.md` quotes the sentence behind every range,
 * with the page and the day it was read; the tests fail if a figure here
 * stops matching its quote there.
 *
 * Architecture 8.4: counts are shown against these ranges as context, never
 * as alarms, and no sleep target is shown before four months. So the lookup
 * returns figures, an age band and sources, never a verdict, and returns
 * nothing for an age no source covers. It is named for the infant figures it
 * was built for; the sleep bands follow the AASM statement to 18 years.
 */

export type InfantContextKind = "feed" | "wetDiaper" | "sleep";

export type InfantContextSourceId =
  | "aap-breastfed-enough-milk"
  | "aap-how-often-and-how-much"
  | "aasm-2016-statement"
  | "aasm-2016-methodology";

export interface InfantContextSource {
  id: InfantContextSourceId;
  publisher: string;
  title: string;
  /** The publisher's own page, or for the AASM papers the AASM's free full text. */
  url: string;
  doi?: string;
  /** The date the source carries: the page's "Last Updated" date, or the article's publication date. */
  dated: CalendarDate;
  /** The day the quotes in SOURCES.md were checked against `url`. */
  read: CalendarDate;
}

export const INFANT_CONTEXT_SOURCES: Readonly<Record<InfantContextSourceId, InfantContextSource>> =
  {
    "aap-breastfed-enough-milk": {
      id: "aap-breastfed-enough-milk",
      publisher: "American Academy of Pediatrics",
      title: "How to Tell if Your Breastfed Baby is Getting Enough Milk",
      url: "https://www.healthychildren.org/English/ages-stages/baby/breastfeeding/Pages/How-to-Tell-if-Baby-is-Getting-Enough-Milk.aspx",
      dated: "2025-01-13",
      read: "2026-10-06",
    },
    "aap-how-often-and-how-much": {
      id: "aap-how-often-and-how-much",
      publisher: "American Academy of Pediatrics",
      title: "How Often and How Much Should Your Baby Eat?",
      url: "https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-Often-and-How-Much-Should-Your-Baby-Eat.aspx",
      dated: "2024-04-02",
      read: "2026-10-06",
    },
    "aasm-2016-statement": {
      id: "aasm-2016-statement",
      publisher: "American Academy of Sleep Medicine",
      title:
        "Recommended Amount of Sleep for Pediatric Populations: A Consensus Statement of the American Academy of Sleep Medicine",
      url: "https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf",
      doi: "10.5664/jcsm.5866",
      dated: "2016-06-15",
      read: "2026-10-06",
    },
    "aasm-2016-methodology": {
      id: "aasm-2016-methodology",
      publisher: "American Academy of Sleep Medicine",
      title:
        "Consensus Statement of the American Academy of Sleep Medicine on the Recommended Amount of Sleep for Healthy Children: Methodology and Discussion",
      url: "https://www.aasm.org/resources/pdf/pediatricsleepdurationmethods.pdf",
      doi: "10.5664/jcsm.6288",
      dated: "2016-11-15",
      read: "2026-10-06",
    },
  };

/**
 * An age at which a band begins or ends. Days count from the date of birth
 * (day 0). Months are completed calendar months, the rule the age label uses,
 * so a band that starts at 4 months starts on the day the label first says
 * "4 months", and a band that starts at 1 year starts on the first birthday.
 */
export type AgeEdge = { days: number } | { months: number };

export interface AgeBand {
  /** The band in the source's own words, for the line that states the range. */
  label: string;
  /** The first day of the band. */
  from: AgeEdge;
  /** The first day after the band. */
  until: AgeEdge;
}

export type InfantContextRangeId =
  | "feed-newborn"
  | "wet-diaper-first-days"
  | "wet-diaper-after-first-days"
  | "sleep-4-to-12-months"
  | "sleep-1-to-2-years"
  | "sleep-3-to-5-years"
  | "sleep-6-to-12-years"
  | "sleep-13-to-18-years";

export interface InfantContextRange {
  /** Stable key; `docs/design/CONTENT.md` keys the proposed copy by it. */
  id: InfantContextRangeId;
  kind: InfantContextKind;
  band: AgeBand;
  /**
   * Per 24 hours: feeds (breast and bottle; solids are not part of the AAP
   * figures), wet diapers (a mixed diaper is wet too) or hours of sleep
   * (AASM: sleep "on a regular basis", so usual sleep, not one day's).
   */
  low: number;
  high: number;
  /** The source says "at least", so the figure is a floor and no upper limit is stated. */
  atLeast: boolean;
  /** The source counts naps in the hours ("including naps"); only some sleep bands say so. */
  includesNaps: boolean;
  /** The first source states the figures; any after it set the band's edges or agree with it. */
  sources: readonly [InfantContextSourceId, ...InfantContextSourceId[]];
}

/**
 * The newborn band ends at 1 month: the "How Often" page and AAP's formula
 * page change the pattern "by the end of the first month"; the breastfeeding
 * page speaks only of newborns.
 */
const NEWBORN_UNTIL: AgeEdge = { months: 1 };

/** Every range, by kind and then by age. */
export const INFANT_CONTEXT_RANGES: readonly InfantContextRange[] = [
  {
    id: "feed-newborn",
    kind: "feed",
    band: { label: "Newborns", from: { days: 0 }, until: NEWBORN_UNTIL },
    low: 8,
    high: 12,
    atLeast: true,
    includesNaps: false,
    sources: ["aap-breastfed-enough-milk", "aap-how-often-and-how-much"],
  },
  {
    id: "wet-diaper-first-days",
    kind: "wetDiaper",
    // "After the first 4 to 5 days" leaves day 4 to either side; the band
    // changes at the later edge so the higher figure never shows early.
    band: { label: "In the first few days after birth", from: { days: 0 }, until: { days: 5 } },
    low: 2,
    high: 3,
    atLeast: false,
    includesNaps: false,
    sources: ["aap-how-often-and-how-much"],
  },
  {
    id: "wet-diaper-after-first-days",
    kind: "wetDiaper",
    band: { label: "After the first 4 to 5 days", from: { days: 5 }, until: NEWBORN_UNTIL },
    low: 5,
    high: 6,
    atLeast: true,
    includesNaps: false,
    sources: ["aap-how-often-and-how-much"],
  },
  // The AASM panel grouped ages as under 12 months, 12 months to under 3
  // years, 3 to under 6 years, 6 to under 13 years, and 13 to 18 years
  // (methodology paper, section 2.3), then cut the infant group to 4 to 12
  // months for lack of evidence under 4 months.
  {
    id: "sleep-4-to-12-months",
    kind: "sleep",
    band: { label: "4 to 12 months", from: { months: 4 }, until: { months: 12 } },
    low: 12,
    high: 16,
    atLeast: false,
    includesNaps: true,
    sources: ["aasm-2016-statement", "aasm-2016-methodology"],
  },
  {
    id: "sleep-1-to-2-years",
    kind: "sleep",
    band: { label: "1 to 2 years", from: { months: 12 }, until: { months: 36 } },
    low: 11,
    high: 14,
    atLeast: false,
    includesNaps: true,
    sources: ["aasm-2016-statement", "aasm-2016-methodology"],
  },
  {
    id: "sleep-3-to-5-years",
    kind: "sleep",
    band: { label: "3 to 5 years", from: { months: 36 }, until: { months: 72 } },
    low: 10,
    high: 13,
    atLeast: false,
    includesNaps: true,
    sources: ["aasm-2016-statement", "aasm-2016-methodology"],
  },
  {
    id: "sleep-6-to-12-years",
    kind: "sleep",
    band: { label: "6 to 12 years", from: { months: 72 }, until: { months: 156 } },
    low: 9,
    high: 12,
    atLeast: false,
    includesNaps: false,
    sources: ["aasm-2016-statement", "aasm-2016-methodology"],
  },
  {
    id: "sleep-13-to-18-years",
    kind: "sleep",
    band: { label: "13 to 18 years", from: { months: 156 }, until: { months: 228 } },
    low: 8,
    high: 10,
    atLeast: false,
    includesNaps: false,
    sources: ["aasm-2016-statement", "aasm-2016-methodology"],
  },
];

function assertDates(from: string, to: string, name: string): void {
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw new TypeError(`${name} takes two YYYY-MM-DD dates`);
  }
}

/**
 * Whole calendar months from `from` to `to`, both YYYY-MM-DD: a month counts
 * once its day of the month comes, so a child born on January 31 is one
 * month old on March 1. This is the rule of the age label (`formatChildAge`
 * in apps/web), kept identical so a band edge and the label agree.
 */
export function completedMonths(from: CalendarDate, to: CalendarDate): number {
  assertDates(from, to, "completedMonths");
  if (diffDays(from, to) < 0) throw new RangeError("The end date is before the start date");
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

interface Age {
  days: number;
  months: number;
}

function reached(edge: AgeEdge, age: Age): boolean {
  return "days" in edge ? age.days >= edge.days : age.months >= edge.months;
}

/**
 * The published range for a child of this age, or null where no source gives
 * one: no sleep range under 4 months, no feed or wet diaper range after the
 * first month, nothing before the date of birth. Both dates are calendar facts
 * in the profile's time zone, and `today` comes from the API.
 */
export function infantContext(
  kind: InfantContextKind,
  dateOfBirth: CalendarDate,
  today: CalendarDate,
): InfantContextRange | null {
  assertDates(dateOfBirth, today, "infantContext");
  const days = diffDays(dateOfBirth, today);
  if (days < 0) return null;
  const age: Age = { days, months: completedMonths(dateOfBirth, today) };
  return (
    INFANT_CONTEXT_RANGES.find(
      (range) =>
        range.kind === kind && reached(range.band.from, age) && !reached(range.band.until, age),
    ) ?? null
  );
}
