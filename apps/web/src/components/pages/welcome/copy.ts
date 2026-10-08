import type { DatingMethod, Stage } from "@tidefern/schemas";

/**
 * Every string /welcome shows, in one module (architecture 13.10). A line
 * the record already holds names its source in the comment beside it: the
 * title, Continue and Finish (docs/design/CONTENT.md), the step names,
 * "Where are you?", "Your calendar days follow this zone.", "Your dates",
 * "Due date" and "Not now" (docs/design/DESIGN.md 3.2), core's body
 * questions (packages/core stages.ts), the forms specimens' lines and the
 * auth pages' failure sentences. Every line marked [OWNER] is a draft in
 * the voice table's rules, listed in CONTENT.md's /welcome subsection, and
 * waits for the owner; none of them is legal or medical wording.
 */

/** Why a write did not land, as the page tells it: the next step, never only that it failed. */
export type FailureCause = "network" | "rate" | "server" | "session" | "refused";

/** The writes the consent step makes; each has its own pending and failure line. */
export type WriteId = "consent" | "profile" | "start" | "pregnancy" | "child" | "since";

export const welcomeCopy = {
  /** CONTENT.md: "Welcome | Tidefern", never a stage in the title. */
  title: "Welcome",
  /** [OWNER] G10's draft description, kept. */
  description: "Set up your Tidefern account.",
  /** G10's heading for the page, kept as its one H1. */
  heading: "Welcome to Tidefern",
  /** G10's failed-read sentence. */
  failedRead: "We could not load your account just now. Reload the page to try again.",
  /** [OWNER] The one line that says steps 1 to 3 live in memory only. */
  memory:
    "Nothing is saved until you agree to the terms. If you reload the page before then, you start again.",

  steps: {
    /** [OWNER] The list's accessible name. */
    label: "Steps",
    /** DESIGN.md 3.2: the indicator on phones. */
    count: (number: number, total: number) => `Step ${number} of ${total}`,
    /** DESIGN.md 3.2, except "Terms" [OWNER]: the step's name when no health data is asked. */
    names: {
      zone: "Time zone",
      stage: "Stage",
      dates: "Dates",
      consent: "Consent",
      terms: "Terms",
      passkey: "Passkey",
    },
  },

  actions: {
    /** CONTENT.md */
    continue: "Continue",
    /** CONTENT.md */
    finish: "Finish",
    /** DESIGN.md 3.2 */
    back: "Back",
    /** CONTENT.md voice table */
    tryAgain: "Try again",
    /** [OWNER] */
    skip: "Skip for now",
    /** CONTENT.md voice table: the button's own pending word, so it keeps its width. */
    saving: "Saving",
    /** [OWNER] */
    signInAgain: "Sign in again",
  },

  zone: {
    /** DESIGN.md 3.2 */
    heading: "Where are you?",
    /** [OWNER] */
    label: "Time zone",
    /** DESIGN.md 3.2 */
    help: "Your calendar days follow this zone.",
    /** [OWNER] The browser's zone, offered and never chosen for her. */
    suggestion: (zone: string) => `Your device is set to ${zone}.`,
    /** [OWNER] */
    useSuggestion: (zone: string) => `Use ${zone}`,
    /** Forms specimen (time zone combobox). */
    required: "Choose a zone from the list.",
  },

  stage: {
    /** [OWNER] */
    heading: "What brings you to Tidefern?",
    /** Titles are DESIGN.md 3.2's card names; every line is [OWNER]. */
    options: {
      cycle: {
        title: "Cycle",
        line: "Log periods, symptoms and moods. Tidefern estimates what comes next from your dates.",
      },
      pregnancy: {
        title: "Pregnancy",
        line: "Follow the weeks to your due date, with your appointments and milestones.",
      },
      postpartum: {
        title: "Postpartum",
        line: "Keep your baby's feeds, sleep and growth, and your cycle when it returns.",
      },
      none: {
        title: "Here for someone else",
        line: "See what a partner shares with you. Tidefern asks nothing about your own body.",
      },
    } satisfies Record<Stage, { title: string; line: string }>,
    /** [OWNER] */
    required: "Choose one to continue.",
  },

  dates: {
    /** DESIGN.md 3.2 */
    heading: "Your dates",
    /** [OWNER] */
    startHelp: "Leave it empty to log it later.",
    /** [OWNER] */
    flowLabel: "Flow that day",
    /** [OWNER] The wave's period ruling: Medium preselected, visible and changeable. */
    flowNote: "Medium is chosen for you. Change it if the flow was lighter or heavier.",
    /** [OWNER] */
    sinceHelp: "Leave it empty if no period has come yet.",
    /** [OWNER] */
    childName: "Your baby's name",
    /** [OWNER] */
    childNameHelp: "Everyone who can see your baby's records sees this name.",
    /** [OWNER] */
    childNameRequired: "Enter your baby's name.",
    /** [OWNER] */
    childConsentHeading: "Your consent for your baby",
    /** [OWNER] The box under E12's draft text, which shows in full above it. */
    childConsentLabel: "I agree on my baby's behalf",
    /** [OWNER] */
    childConsentRequired: "Tick the box to add your baby.",
    /** [OWNER] */
    required: "Enter a date to continue.",
    /** [OWNER] */
    partial: "Finish the date to continue.",
    /** [OWNER] */
    partialOptional: "Finish the date, or clear it to skip.",
    /** [OWNER] */
    future: "Choose a day up to today.",
    /** [OWNER] */
    beforeBirth: "Choose a day after the birth.",
    /** [OWNER] */
    tooLongAgo: "Enter a date within the last 42 weeks.",
    /** [OWNER] */
    dueWindow: (from: string, to: string) => `Enter a due date between ${from} and ${to}.`,
  },

  dating: {
    /** [OWNER] Core asks the date first; dating is method-first (the brief), so the question leads. */
    methodLabel: "How was your due date worked out?",
    /** [OWNER] The transfer wording waits on the clinician review too (architecture 21). */
    methods: {
      lmp: "From my last period",
      ultrasound: "From a scan",
      transfer: "From an embryo transfer",
      manual: "I was given a due date",
    } satisfies Record<DatingMethod, string>,
    /** [OWNER] */
    methodRequired: "Choose how your due date was worked out.",
    /** [OWNER] */
    lastPeriodStart: "First day of your last period",
    /** [OWNER] */
    scanDate: "Date of the scan",
    /** [OWNER] The legend over the two numbers a scan measures. */
    scanAge: "How far along the scan measured",
    /** [OWNER] */
    weeks: "Weeks",
    /** [OWNER] */
    days: "Days",
    /** [OWNER] */
    weeksRange: "Enter the weeks, from 0 to 42.",
    /** [OWNER] */
    daysRange: "Enter the days, from 0 to 6.",
    /** [OWNER] */
    transferDate: "Date of the transfer",
    /** [OWNER] */
    embryoAge: "Embryo's age at transfer, in days",
    /** [OWNER] */
    embryoAgeRange: "Enter the age in days, from 1 to 7.",
    /** DESIGN.md 3.2 */
    dueDate: "Due date",
  },

  consent: {
    /** [OWNER] */
    heading: "Your consent",
    /** [OWNER] The step's heading on the path that asks nothing about her body. */
    headingWithoutConsent: "Before you start",
    /** [OWNER] */
    nothingCollected:
      "Tidefern asks nothing about your own body on this path, so there is no health data to agree to.",
    /** Consent record specimen. */
    required: "Tick the box to continue.",
    /** [OWNER] The link text is the policy's exact name, as on every page. */
    policyBefore: "The",
    policyLink: "Consumer Health Data Privacy Policy",
    policyAfter: "explains this in full.",
    /** [OWNER] */
    newTab: "(opens in a new tab)",
    /** [OWNER] */
    termsBefore: "I accept the",
    termsLink: "terms of use",
    /** [OWNER] */
    termsHelp: (version: string) => `Separate from your consent. Terms version ${version}.`,
    /** [OWNER] */
    termsRequired: "Accept the terms to continue.",
    /** Forms specimen (checkbox field), architecture 8.4. */
    adult: "I am 18 or older",
    adultHelp: "Tidefern is for adults. No date of birth is stored.",
    adultRequired: "Confirm you are 18 or older to continue.",
  },

  writes: {
    /** [OWNER] What each write is doing while it runs. */
    pending: {
      consent: "Recording your consent",
      profile: "Saving your profile",
      start: "Saving your period start",
      pregnancy: "Saving your pregnancy",
      child: "Adding your baby",
      since: "Saving your period",
    } satisfies Record<WriteId, string>,
    /** [OWNER] What did not land. */
    failed: {
      consent: "We could not record your consent.",
      profile: "We could not save your profile.",
      start: "We could not save your period start.",
      pregnancy: "We could not save your pregnancy.",
      child: "We could not add your baby.",
      since: "We could not save the period since the birth.",
    } satisfies Record<WriteId, string>,
    /** What to do next. Network, rate and server are the auth pages' sentences; the rest [OWNER]. */
    next: {
      network: "Check your connection and try again.",
      rate: "Wait a minute and try again.",
      server: "Wait a moment and try again.",
      refused: "Check your answers and try again.",
      session: "Your session has ended. Sign in again to finish.",
    } satisfies Record<FailureCause, string>,
    /** [OWNER] Names in the saved-so-far line. */
    saved: {
      consent: "your consent",
      profile: "your profile",
      start: "your period start",
      pregnancy: "your pregnancy",
      child: "your baby",
      since: "the period since the birth",
    } satisfies Record<WriteId, string>,
    /** [OWNER] */
    savedSoFar: (items: string) => `Saved so far: ${items}.`,
    /** [OWNER] Where a skipped write can be added later. */
    later: {
      start: "You can log it later from Today.",
      pregnancy: "You can add it later from Journey.",
      child: "You can add your baby later from Family.",
      since: "You can log it later from Today.",
    } satisfies Partial<Record<WriteId, string>>,
  },

  passkey: {
    /** [OWNER] */
    heading: "Add a passkey",
    /** [OWNER] The outcome of the writes, shown as the step opens. */
    ready: "Your account is set up.",
    /** [OWNER] */
    lede: "A passkey lets you sign in with your fingerprint, your face or your device's screen lock instead of a password.",
    /** [OWNER] */
    add: "Add a passkey",
    /** CONTENT.md voice table. */
    pending: "Checking your passkey",
    /** DESIGN.md 3.2 */
    notNow: "Not now",
    /** [OWNER] */
    saved: "Your passkey is saved.",
    /** [OWNER] */
    already: "This device already has a passkey for your account.",
    /** [OWNER] Adapted from the sign-in page's line. */
    closed: "The passkey prompt was closed. Try again, or choose Not now.",
    /** [OWNER] */
    notFresh: "This sign-in is too old to add a passkey. Choose Not now to finish.",
    /** [OWNER] */
    failed: "We could not add the passkey. Try again, or choose Not now.",
  },
} as const;

/** "your consent", "your consent and your profile", "a, b and c". */
export function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
