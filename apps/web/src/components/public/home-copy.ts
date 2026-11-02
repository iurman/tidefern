/**
 * Every string the home page shows, in one module (architecture 13.10).
 * The composition is DESIGN.md 1.1 and 3.1 (A with B's chapter list); the
 * promises trace to architecture 9 to 11 so each claim can be checked at
 * the Phase 2 copy audit (FTC Act section 5 in 9.6).
 */
export const homeCopy = {
  hero: {
    eyebrow: "Tidefern",
    lede: "Cycles, pregnancy and the first years, in one calm place.",
    statement: "Shared only when you say so.",
    promise:
      "Your partner sees what you choose, category by category, and you can take it back. Nothing watches you.",
    action: "Create an account",
    status: "In development, used daily by its first household.",
  },
  chapters: {
    heading: "Every chapter, one quiet place",
    items: [
      {
        name: "Cycles",
        text: "Log a day in a few taps, see where you are, and keep notes that stay yours.",
      },
      {
        name: "Pregnancy",
        text: "Week by week, with appointments, milestones and the people you bring along.",
      },
      {
        name: "Childhood",
        text: "Feeds, sleep, growth and firsts, seen by every guardian and by no one else until you share them.",
      },
    ],
  },
  promises: {
    heading: "Built to be trusted",
    items: [
      {
        title: "Yours by default",
        text: "Nothing is shared until you share it, category by category, and you can take it back.",
      },
      {
        title: "Nothing watching",
        text: "No third-party analytics, advertising or session recording. We keep daily counts of how the product is used, never a record of who.",
      },
      {
        title: "Private notes stay private",
        text: "Notes are encrypted on our servers with a key made for you, and private notes are never shared with anyone.",
      },
      {
        title: "Delete means delete",
        text: "Closing your account deletes your data within 14 days, including from our database history. You can undo for 7 days.",
      },
    ],
  },
} as const;
