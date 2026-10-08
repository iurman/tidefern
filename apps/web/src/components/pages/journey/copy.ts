import { formatDay } from "@/components/ui/marks-format";

/**
 * Every string /journey shows, in one module so a later locale is a
 * translation here (architecture 13.10). What CONTENT.md and DESIGN.md
 * already give is used word for word: the route title, the two empty
 * states, the postpartum and after-ending cards, the sketch's labels and
 * the fresh sign-in sentence of task C4. Everything else is a draft listed
 * under `/journey (H4)` in CONTENT.md for the owner to review, and the one
 * fact only the owner can give (the resources link) shows as `[OWNER]`.
 */

export type EventKind = "appointment" | "milestone";
export type EndReason = "birth" | "loss" | "other";
export type EndWord = "pregnancy" | "baby";

const kindNames: Record<EventKind, string> = {
  appointment: "Appointment",
  milestone: "Milestone",
};

/** Sentence-case names, the row's own words when it has no detail. */
export function kindName(kind: EventKind): string {
  return kindNames[kind];
}

/** "Mira", "Mira and Alex", "Mira, Alex, and Sam": a list of names in en-US. */
export function joinNames(names: readonly string[]): string {
  return new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(names);
}

export const journeyCopy = {
  title: "Journey",
  description: "What is coming and what has happened, week by week.",
  heading: "Journey",

  own: {
    /** The visually hidden heading of her own section, so the week card's h3 sits under an h2. */
    heading: "Your pregnancy",
    postpartumHeading: "After the birth",
    failed: "We could not load your pregnancy just now. Reload the page to try again.",
  },

  weeks: {
    heading: "Week by week",
    /** The label beside the tide line, the week marker (architecture 13.6, move 2). */
    thisWeek: "This week",
    week: (week: number) => `Week ${week}`,
    earlier: "Earlier weeks",
    /** Entries dated before day 0, kept apart from Week 0 so no range contradicts its rows. */
    before: "Before this pregnancy began",
    entries: (count: number) => (count === 1 ? "1 entry" : `${count} entries`),
    /** Nothing from this week on: what would be here and why not; the add buttons below are the action. */
    nothingAhead:
      "Nothing is added for the weeks ahead yet. Appointments and milestones show here under their week.",
    failed:
      "We could not load the appointments and milestones just now. Reload the page to try again.",
    /**
     * The line under a row's title: the kind when the title is the detail,
     * and who added it when that was not the pregnancy's subject.
     */
    note: (kind: string | null, addedBy: string | null): string | null => {
      if (kind !== null && addedBy !== null) return `${kind}, added by ${addedBy}`;
      if (addedBy !== null) return `Added by ${addedBy}`;
      return kind;
    },
    you: "you",
    /** The list's neutral name for assistive technology. */
    listLabel: (week: number) => `Week ${week}`,
  },

  add: {
    appointment: "Add an appointment",
    milestone: "Add a milestone",
  },

  history: {
    heading: "Due date history",
    lede: "Only you can see this list.",
    label: "Due date history",
    change: (from: string, to: string) => `From ${from} to ${to}`,
    empty:
      "The due date has not changed since it was set. If it changes, the earlier date stays listed here.",
    failed: "We could not load the due date history just now. Reload the page to try again.",
  },

  event: {
    addTitle: { appointment: "Add an appointment", milestone: "Add a milestone" },
    editTitle: { appointment: "Edit the appointment", milestone: "Edit the milestone" },
    kindLabel: "Kind",
    dateLabel: "Date",
    detailLabel: "Details",
    detailHelp: "Optional, up to 500 characters.",
    save: "Save",
    saving: "Saving",
    cancel: "Cancel",
    edit: "Edit",
    /** The Edit button's accessible name: every row's button reads "Edit", so it names its row. */
    editName: (title: string, date: string) => `Edit ${title}, ${formatDay(date)}`,
    remove: { appointment: "Delete this appointment", milestone: "Delete this milestone" },
    removeTitle: { appointment: "Delete this appointment?", milestone: "Delete this milestone?" },
    removeBody:
      "It is gone for you and for everyone who can see your pregnancy. This cannot be undone.",
    removeConfirm: "Delete",
    removing: "Deleting",
    keep: "Keep it",
    saved: (date: string) => `Saved for ${formatDay(date)}.`,
    removed: "Deleted.",
    errors: {
      dateMissing: "Enter the date as month, day and year.",
      dateInvalid: "That date does not exist. Check the day and the month.",
      /** The ending dialog's own sentence for a day before day 0, reused word for word. */
      dateBefore: "That day is before this pregnancy began. Check the date.",
      detailTooLong: "Keep the details to 500 characters or fewer.",
      kindMissing: "Choose appointment or milestone.",
      stale: "This changed since you opened it. Close it and open it again to see the latest.",
      paused: "Updates to this pregnancy are paused, so this was not saved.",
      gone: "This is no longer here. Reload the page to see the latest.",
      limited: "Too many changes in a row. Wait a minute and try again.",
      offline: "We could not reach Tidefern. Check your connection and try again.",
      failed: "We could not save this. Try again.",
      removeFailed: "We could not delete this. Try again.",
    },
  },

  end: {
    prompt: "Something changed?",
    trigger: "My pregnancy ended",
    title: "My pregnancy ended",
    dateLabel: "The day it ended",
    reasonLabel: "What happened",
    reasons: { birth: "Birth", loss: "Loss", other: "Other" } satisfies Record<EndReason, string>,
    reasonPrivate: "Only you can see this. Nobody you share with ever does.",
    wordLabel: "The word you want Tidefern to use",
    words: { pregnancy: "Pregnancy", baby: "Baby" } satisfies Record<EndWord, string>,
    /** Her partner's view pauses with no notification (architecture 8.4 rule 2, DESIGN.md 5.3). */
    pausedFor: (names: string) =>
      `${names} will see it as paused, with no week or dates. Tidefern does not notify anyone.`,
    /** When who she shares with is not known (a name missing, or the list could not be read). */
    pausedForAnyone:
      "Anyone you share it with will see it as paused, with no week or dates. Tidefern does not notify anyone.",
    notifyNobody: "Tidefern does not notify anyone.",
    /** The lead-in to the one resources link; after a loss it uses the word she chose. */
    support: (reason: EndReason | null, word: EndWord) => {
      if (reason === "loss") {
        return word === "baby" ? "Support after losing a baby" : "Support after a pregnancy loss";
      }
      return "Support, if you want it";
    },
    resourcesOwner: "one resources link: the organization, its address and the link text",
    confirm: "Record the ending",
    pending: "Saving",
    cancel: "Cancel",
    errors: {
      dateMissing: "Enter the day it ended as month, day and year.",
      dateFuture: "That day has not happened yet. Enter today or an earlier day.",
      dateBefore: "That day is before this pregnancy began. Check the date.",
      reasonMissing: "Choose what happened.",
      ended: "This pregnancy is already marked as ended. Reload the page to see it.",
      gone: "We could not find this pregnancy. Reload the page to see the latest.",
      limited: "Too many attempts in a row. Wait a minute and try again.",
      offline: "We could not reach Tidefern. Check your connection and try again.",
      failed: "We could not save this. Try again.",
    },
    /** Task C4's sentence and link (settings/two-factor copy.ts), word for word. */
    freshAuth: {
      sentence:
        "For safety, this needs a sign-in from the last ten minutes. Sign in again, then come back here.",
      action: "Sign in again",
    },
  },

  /** CONTENT.md, "/journey, postpartum", word for word. */
  postpartum: {
    heading: "Predictions are paused after birth",
    why: "When your first period comes, log it and Tidefern starts again from there.",
    action: "Log a period",
    childrenFailed: "We could not load your children just now. Reload the page to try again.",
  },

  /** CONTENT.md, "/today, after a pregnancy ended", word for word: the quiet card. */
  afterEnding: {
    heading: "When you are ready",
    why: "Predictions are paused until a period is logged.",
    action: "Log a period when it comes",
  },

  /** After an ending, once a period has been logged again: nothing week-shaped, nothing to start. */
  noneInProgress: {
    heading: "No pregnancy in progress",
    why: "Weeks, appointments and milestones show here while a pregnancy is in progress.",
  },

  /** CONTENT.md, "/journey, no pregnancy", without its action: the start flow is a follow-up. */
  empty: {
    heading: "No pregnancy recorded",
    why: "Start one with a due date or your last period and this becomes week by week.",
  },

  /** The none stage is never asked a body question, so its empty state invites nothing of the kind. */
  nothingShared: {
    heading: "Nothing shared with you yet",
    why: "When someone shares their pregnancy with you, it shows here week by week.",
  },

  shared: {
    heading: (name: string | null) =>
      name ? `${name}'s pregnancy` : "A pregnancy shared with you",
    none: "Nothing to show here right now.",
    failed: "We could not load this pregnancy just now. Reload the page to try again.",
  },
} as const;
