import { monthCaption } from "@/components/ui/calendar-dates";

/**
 * Every string the calendar and the day page show, in one module
 * (architecture 13.10). The titles, the empty states and the quiet card are
 * docs/design/CONTENT.md's own words; the prediction sentences come from
 * lib/prediction-copy.ts and the day sheet's from components/day-log. The
 * rest is written to CONTENT.md's voice table and listed in its `/calendar`
 * and `/log/[date]` subsection for the owner. No string names anything
 * logged, and neither title carries a date.
 */
export const calendarCopy = {
  title: "Calendar",
  // [OWNER] A neutral description; CONTENT.md gives the title only.
  description: "Your days, month by month.",
  heading: "Calendar",
  viewLabel: "Calendar view",
  views: { month: "Month", list: "List" },
  today: "Today",
  thisWeek: "This week",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  loading: "Loading",
  monthEmpty: {
    heading: "Nothing logged this month",
    why: "Days you log show here with their flow and symptoms.",
    action: "Log today",
  },
  listEmpty: {
    heading: "Nothing logged yet",
    why: "Days you log show up here as a list you can scan.",
    action: "Log today",
  },
  quiet: {
    heading: "When you are ready",
    why: "Predictions are paused until a period is logged.",
    action: "Log a period when it comes",
    // [OWNER] Architecture 8.4 asks for a line that cycles often return later while feeding; the wording is the owner's.
    feeding: "[OWNER] The line that cycles often return later while feeding.",
  },
  // [OWNER] Proposed: a day after today has nothing to log yet (the G9 ruling on dayNeighbours).
  futureDay: "You can log a day once it has come.",
  // [OWNER] Proposed, after the voice table and the day sheet's own "We could not load this day. Try again."
  loadFailed: "We could not load your calendar. Try again.",
  tryAgain: "Try again",
  /** The list's accessible name: "Days logged in October 2026". */
  listLabel: (month: string) => `Days logged in ${monthCaption(month, "en-US")}`,
} as const;

export const logDayCopy = {
  title: "Log a day",
  // [OWNER] A neutral description; CONTENT.md gives the title only. Never the date.
  description: "One day in your calendar.",
} as const;
