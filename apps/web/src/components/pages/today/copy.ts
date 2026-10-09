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
  /** CycleRing's own caption sentence, said beside the ring and in This week. */
  periodLogged: (span: string) => `Period logged ${span}.`,
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
    privateNotes: (count: number) => (count === 1 ? "a private note" : `${count} private notes`),
    sharedNotes: (count: number) => (count === 1 ? "a shared note" : `${count} shared notes`),
    notesFromOthers: (count: number) =>
      count === 1
        ? "a note from someone you share with"
        : `${count} notes from people you share with`,
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
    nameFailed: "We could not load this person's name just now. Reload the page to try again.",
    failed: (name: string | null) =>
      `We could not load what ${name ?? "this person"} shares just now. Reload the page to try again.`,
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
 * What the `[OWNER]` placeholder in "How this is estimated" names
 * (RESEARCH.md decision 6). It is a customer page, so the placeholder names
 * what is missing and nothing of how it is built; the numbers the owner's
 * text must state are listed in CONTENT.md, and copy.test.ts ties them to
 * packages/core so the list cannot drift from the math.
 */
export const estimatePlaceholder = "the explanation of the estimate";

/** What the `[OWNER]` placeholder in the postpartum quiet card names (CONTENT.md, `/today` (H2)). */
export const feedingLinePlaceholder = "the line about cycles while feeding";
