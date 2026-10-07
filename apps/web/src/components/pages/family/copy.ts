import type { Failure } from "./mutations";

/**
 * Every string the family screens show, in one module (architecture 13.10).
 * The empty states, the care sentence, the milestone template and the chart
 * caption come from docs/design/CONTENT.md, architecture 13.10 and the API;
 * the growth attribution is packages/core/data/SOURCES.md's, word for word.
 * The interface lines CONTENT.md does not carry follow its voice table
 * (pending says what is happening, failure says what to do next, success is
 * short with the undo) and are listed for the owner under "/family (H5)" in
 * CONTENT.md. Lines that would state a health fact, a range or what a grant
 * shows, which only the owner may word, render as `[OWNER]` placeholders.
 * No string names a child's health in a title, a URL or a log.
 */

/** Prefix of a line the owner has not supplied (CONTENT.md marks them the same way). */
export const OWNER = "[OWNER]";

export const familyCopy = {
  title: "Family",
  description: "The children you keep in Tidefern.",
  heading: "Family",
  loadFailed: "We could not load your family just now. Reload the page to try again.",
  empty: {
    heading: "No child added yet",
    why: "Add a child to keep feeds, sleep, growth and milestones in one place.",
    action: "Add a child",
  },
  card: {
    lastFeed: "Last feed",
    lastSleep: "Last sleep",
    sleep: "Sleep",
    lastDiaper: "Last diaper",
    none: "None logged yet",
    today: (count: string) => `Today: ${count}`,
    sleepEnded: (since: string) => `Ended ${since}`,
    asleepSince: (clock: string) => `Asleep since ${clock}`,
    diapers: (total: number, wet: number, dirty: number) => `${total} (${wet} wet, ${dirty} dirty)`,
    open: "Timeline, growth and milestones",
    dayFailed: "We could not load today for this child. Reload the page to try again.",
    summaryOnly: `${OWNER} line for a person whose grant shows this child's name and age only`,
    guardians: (names: readonly (string | null)[]) => {
      const named = names.map((name) => name ?? "another guardian");
      const label = named.length === 1 ? "Guardian" : "Guardians";
      if (named.length <= 1) return `${label}: ${named[0] ?? ""}`;
      return `${label}: ${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""}`;
    },
  },
  log: {
    feed: "Feed",
    sleep: "Sleep",
    endSleep: "End sleep",
    diaper: "Diaper",
    forChild: (name: string) => ` for ${name}`,
    feedTitle: (name: string) => `Log a feed for ${name}`,
    sleepTitle: (name: string) => `Log a sleep for ${name}`,
    endSleepTitle: (name: string) => `End ${name}'s sleep`,
    diaperTitle: (name: string) => `Log a diaper for ${name}`,
    method: "Feed",
    methods: { breast: "Breast", bottle: "Bottle", solids: "Solids" },
    side: "Side",
    sides: { left: "Left", right: "Right", both: "Both" },
    timer: "Timer",
    timerHelp: "Start it when the feed starts; stopping it saves the feed with both times.",
    timerRunning: "Feed timer running:",
    timerStopped: "Feed timer stopped at",
    startTimer: "Start timer",
    stopTimer: "Stop and save",
    cancelTimer: "Cancel timer",
    amount: "Amount",
    amountHelp: "Optional.",
    amountTooMuch: "Enter up to 2000 ml.",
    amountTooMuchImperial: "Enter up to 67 fl oz.",
    contents: "Contents",
    contentsHelp: "Optional.",
    contentOptions: { wet: "Wet", dirty: "Dirty", mixed: "Wet and dirty" },
    sleepStarts: (name: string) => `The sleep starts now. End it here when ${name} wakes.`,
    asleepSince: (clock: string) => `Asleep since ${clock}.`,
    startSleep: "Start sleep",
    starting: "Starting",
    endSleepAction: "End sleep",
    ending: "Ending",
    save: "Save",
    saving: "Saving",
    chooseMethod: "Choose breast, bottle or solids.",
    saved: { feed: "Feed saved.", diaper: "Diaper saved.", sleep: "Sleep started." },
    sleepEnded: "Sleep ended.",
    undo: "Undo",
    undoing: "Undoing",
    undone: "That entry was removed.",
    undoFailed: "We could not undo this. Try again.",
    failed: {
      feed: "We could not save this feed. Try again.",
      diaper: "We could not save this diaper. Try again.",
      sleep: "We could not start the sleep. Try again.",
      endSleep: "We could not end the sleep. Try again.",
    },
    sleepConflict: "This sleep changed somewhere else. Reload the page to see it.",
  },
  addChild: {
    action: "Add a child",
    title: "Add a child",
    name: "Name",
    nameHelp: "What the family calls the child.",
    dateOfBirth: "Date of birth",
    sex: "Sex",
    sexHelp: "Optional. The growth chart's percentile band needs it.",
    sexes: { unset: "Not set", female: "Female", male: "Male" },
    consentHeading: "Consent on the child's behalf",
    consentLabel: "I agree to this on the child's behalf.",
    consentVersion: (version: string) => `Consent text version ${version}.`,
    submit: "Add the child",
    pending: "Adding the child",
    nameMissing: "Enter the child's name.",
    nameTooLong: "Use 80 characters or fewer.",
    dateMissing: "Enter the date of birth.",
    dateAhead: "That date is after today. Check the date.",
    consentMissing: "Tick the box to add the child.",
    failed: "We could not add the child. Try again.",
    added: (name: string) => `${name} was added.`,
  },
  child: {
    back: "Family",
    view: "View",
    tabs: { timeline: "Timeline", growth: "Growth", milestones: "Milestones" },
    summaryOnly: `${OWNER} line for a person whose grant shows this child's name and age only`,
    loadFailed: "We could not load this child just now. Reload the page to try again.",
    timelineFailed: "We could not load the timeline. Reload the page to try again.",
    growthFailed: "We could not load the measurements. Reload the page to try again.",
    milestonesFailed: "We could not load the milestones. Reload the page to try again.",
  },
  timeline: {
    label: "Timeline",
    empty: (name: string) => ({
      heading: "Nothing logged yet",
      why: `Feeds, sleep, diapers and milestones logged for ${name} appear here, newest first.`,
    }),
    emptyAction: "Log on the Family page",
    more: "Show older entries",
    loadingMore: "Loading older entries",
    moreFailed: "We could not load older entries. Try again.",
  },
  growth: {
    measure: "Measure",
    indicators: {
      weightForAge: "Weight",
      lengthForAge: "Length",
      headCircumferenceForAge: "Head circumference",
    },
    units: "Units",
    unitLabels: {
      weight: { metric: "kg", imperial: "lb" },
      length: { metric: "cm", imperial: "in" },
      form: { metric: "kg and cm", imperial: "lb and in" },
    },
    empty: {
      heading: "No measurements yet",
      why: "Add a weight or length and the chart draws the percentile band around it.",
      action: "Add a measurement",
    },
    noSex: `${OWNER} line that the percentile band needs the child's sex, and where to set it`,
    readingsLabel: "Readings",
    add: "Add a measurement",
    addTitle: (name: string) => `Add a measurement for ${name}`,
    date: "Date",
    weight: "Weight",
    length: "Length",
    head: "Head circumference",
    help: "Fill in what you measured; one is enough.",
    save: "Save",
    saving: "Saving",
    nothing: "Enter at least one measurement.",
    dateMissing: "Enter the date of the measurement.",
    dateAhead: "That date is after today. Check the date.",
    beforeBirth: (name: string) => `That date is before ${name} was born. Check the date.`,
    checkValue: "Check this value, then try again.",
    failed: "We could not save this measurement. Try again.",
    added: "Measurement added.",
    // packages/core/data/SOURCES.md, "Attribution". The CDC sentence is word for word; the WHO
    // one swaps the repository's "the files under who/" for "the tables Tidefern uses" and
    // keeps the rest, the source URL WHO's terms ask for included (CONTENT.md, /family (H5)).
    cdcAttribution:
      "Source: CDC. Reference to CDC materials does not imply endorsement by CDC, ATSDR, HHS or the United States Government of Tidefern, its company, products or services.",
    whoAttribution:
      "WHO Child Growth Standards, World Health Organization, 2006, are the author of the birth to 24 month standard; the tables Tidefern uses are the National Center for Health Statistics copies of those standards as published on",
    whoUrl: "https://www.cdc.gov/growthcharts/who-data-files.htm",
    whoAcknowledgment:
      "Used with acknowledgment of WHO as the source; WHO does not endorse Tidefern.",
  },
  milestones: {
    heading: (label: string) => `Checklist for ${label}`,
    empty: {
      heading: "Nothing marked yet",
      why: "Most children do these by the ages shown. This is not a screening tool; your pediatrician is.",
      action: "Mark a milestone",
    },
    domains: {
      social: "Social and emotional",
      language: "Language and communication",
      cognitive: "Cognitive",
      movement: "Movement and physical development",
    },
    markedOn: (day: string) => `Marked on ${day}`,
    saving: "Saving",
    failed: "We could not save this. Try again.",
  },
  failure: {
    offline: "You are offline. Connect, then try again.",
    signedOut: "Your session has ended. Sign in again, then come back.",
    notFound: "This child is no longer here for you. Reload the page.",
    invalid: "Check the fields above, then try again.",
  },
} as const;

/**
 * What a failed write says: the shared lines for being offline, signed out
 * or refused a field, and the action's own "Try again" line otherwise.
 */
export function failureLine(failure: Failure, fallback: string): string {
  switch (failure.kind) {
    case "offline":
      return familyCopy.failure.offline;
    case "signedOut":
      return familyCopy.failure.signedOut;
    case "notFound":
      return familyCopy.failure.notFound;
    case "invalid":
      return familyCopy.failure.invalid;
    case "conflict":
    case "failed":
      return fallback;
  }
}
