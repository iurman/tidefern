import {
  LUTEAL_PHASE_DAYS,
  MAX_PLAUSIBLE,
  MIN_PLAUSIBLE,
  OVULATION_BAND_DAYS,
  uncertaintyFor,
} from "@tidefern/core";

/**
 * Today's words in one module (architecture 13.10). The empty and quiet
 * cards are CONTENT.md's rows, the prediction sentences come from
 * lib/prediction-copy word for word, and the headings are the DESIGN.md 3.3
 * sketch's. Every other line here is listed under `/today` (H2) in
 * CONTENT.md as an owner input; the two the owner must write (the estimate
 * explanation and the feeding line) show as `[OWNER]` placeholders instead
 * of invented wording. Nothing here goes into a URL, a title or a log.
 */
export const todayCopy = {
  title: "Today",
  description: "Your home screen.",
  /** Read before the date in the page's one heading; the date is the visible eyebrow. */
  headingPrefix: "Today,",
  /** Beside the cycle day numeral (DESIGN.md 3.3: "12 day of your cycle"). */
  cycleDayLabel: "day of your cycle",
  estimateSummary: "How this is estimated",
  deviationLink: "Review your cycles in the calendar",
  cycleFailed: "We could not load your cycle just now. Reload the page to try again.",
  empty: {
    heading: "Nothing logged yet",
    why: "Log your last period start and Tidefern can place you in your cycle.",
    action: "Log a period",
  },
  quiet: {
    heading: "When you are ready",
    why: "Predictions are paused until a period is logged.",
    action: "Log a period when it comes",
  },
  childFailed: "We could not load your children just now. Reload the page to try again.",
  weekFailed: "We could not load this week just now. Reload the page to try again.",
  log: {
    heading: "Log today",
    nothing: "Nothing logged for today yet.",
    logged: (parts: readonly string[]) => `Logged for today: ${parts.join(", ")}.`,
    note: "a private note",
    open: "Log today",
  },
  partners: {
    heading: (name: string | null) => `What ${name ?? "this person"} can see right now`,
    childLine: (child: string) =>
      `Everything logged for ${child}: feeds, sleep, growth, milestones and photos.`,
    guardianLine: (child: string) => `As a guardian of ${child}, everything logged for ${child}.`,
    paused: "Weekly updates are paused. No week, due date or dates show.",
    change: "Change sharing",
    failed: "We could not load who you share with just now. Reload the page to try again.",
    empty: {
      heading: "You are the only one who can see this",
      why: "Invite a partner and choose exactly what they see, category by category.",
      action: "Invite a partner",
    },
  },
  week: {
    heading: "This week",
    logged: (span: string) => `Period logged ${span}.`,
    nextPeriod: (start: string, end: string) =>
      `Your next period will likely start between ${start} and ${end}.`,
    fertile: (span: string) => `${span} are the days pregnancy is most likely.`,
    nothing: "No period days logged or estimated this week.",
  },
  shared: {
    cycleDay: (day: number) => `Cycle day ${day}`,
    periodDay: (day: number) => `Period day ${day}`,
    fertile: "In the estimated fertile window today.",
    nothingToday: "Nothing to show for today yet.",
    pregnancyWeek: (weeks: number, days: number) =>
      days === 0 ? `Week ${weeks}` : `Week ${weeks} and ${days} ${days === 1 ? "day" : "days"}`,
    due: (date: string) => `Due ${date}`,
    paused: "Weekly updates are paused.",
    someone: "Someone who shares with you",
    failed: (name: string) =>
      `We could not load what ${name} shares just now. Reload the page to try again.`,
    childrenFailed:
      "We could not load the children you see just now. Reload the page to try again.",
    openFamily: "Open Family",
    empty: {
      heading: "Nothing shared with you yet",
      why: "When someone shares a cycle, a pregnancy or a child with you, it shows here.",
    },
  },
} as const;

/**
 * What the `[OWNER]` placeholder in "How this is estimated" names: the
 * explanation the owner writes, with the numbers read from packages/core so
 * the placeholder itself cannot drift from the math (RESEARCH.md decision 6).
 */
export function estimateExplanationPlaceholder(): string {
  const few = uncertaintyFor(1, false);
  const two = uncertaintyFor(2, false);
  const many = uncertaintyFor(3, false);
  const irregular = uncertaintyFor(3, true);
  return (
    `the explanation of the estimate, written from packages/core: only cycles of ${MIN_PLAUSIBLE} to ${MAX_PLAUSIBLE} days count; ` +
    `ovulation is placed ${LUTEAL_PHASE_DAYS} days before the next period, as a band of plus or minus ${OVULATION_BAND_DAYS} days; ` +
    `the range is plus or minus ${few} days for a first guess or one cycle, ${two} after two cycles, ${many} after three or more, ` +
    `and ${irregular} when the cycles differ by more than a week`
  );
}

/** What the `[OWNER]` placeholder in the postpartum quiet card names (architecture 8.4). */
export const feedingLinePlaceholder =
  "a line that cycles often return later while feeding (architecture 8.4)";
