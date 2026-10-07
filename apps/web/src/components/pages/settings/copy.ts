import type { NotificationDetail, Stage, Units } from "@tidefern/schemas";

/**
 * Every string the settings screens and the locked /closing view show, in
 * one module (architecture 13.10). The destructive line comes from
 * docs/design/CONTENT.md, corrected there by this task: the undo is an
 * explicit action after signing in, not the sign-in itself. Everything else
 * is written to that file's voice table (pending says what is happening,
 * failure says what to do next, empty says what would be here) and listed
 * for the owner's review in its `/settings` subsection. The lock-screen
 * wording for the gentle and detailed levels is the owner's to write, so it
 * shows as a marked placeholder. Nothing here names a health fact in a title
 * or a path.
 */

/** Where each settings screen lives. Neutral names only (architecture 9.1). */
export const settingsPaths = {
  index: "/settings",
  profile: "/settings/profile",
  timeZone: "/settings/time-zone",
  units: "/settings/units",
  theme: "/settings/theme",
  sound: "/settings/sound",
  notifications: "/settings/notifications",
  devices: "/settings/devices",
  twoFactor: "/settings/two-factor",
  export: "/settings/export",
  activity: "/activity",
  consent: "/settings/consent",
  close: "/settings/close-account",
} as const;

/** The locked view a closing account is sent to (the (app) layout's CLOSING_PATH). */
export const CLOSING_VIEW_PATH = "/closing";

/** Where the stage refusals point: the pregnancy record's own screen (task H4). */
export const JOURNEY_PATH = "/journey";

/** The file name the API sends the export under (`EXPORT_FILE_NAME` in packages/api); no health word. */
export const EXPORT_FILE_NAME = "tidefern-export.ndjson";

const freshAuthTail =
  "needs a sign-in from the last ten minutes. Sign in again, then come back here.";

export const settingsCopy = {
  title: "Settings",
  description: "Your profile, how Tidefern looks and sounds on this device, and your account.",
  heading: "Settings",
  sectionsLabel: "Settings sections",
  back: "Settings",
  readFailed: "We could not load this just now. Reload the page to try again.",

  profile: {
    label: "Profile",
    description: "Your name and your stage in Tidefern.",
    name: {
      label: "Name",
      help: "How the people you share with see you.",
      tooLong: "Use 80 characters or fewer.",
    },
    stage: {
      legend: "Stage",
      help: "Tidefern shows what fits your stage. A pregnancy starts in Journey, and while one is recorded Journey sets your stage.",
      options: [
        { value: "cycle", label: "Tracking my cycle" },
        { value: "pregnancy", label: "Pregnant" },
        { value: "postpartum", label: "After a birth" },
        { value: "none", label: "Here for someone else" },
      ] as const satisfies readonly { value: Stage; label: string }[],
    },
    save: "Save profile",
    journey: "Open Journey",
  },

  timeZone: {
    label: "Time zone",
    description: "The time zone your calendar days follow.",
    field: "Your time zone",
    help: "Your calendar days follow this zone.",
    save: "Save time zone",
    saved: (zone: string) => `Saved. Your days now follow ${zone}.`,
  },

  units: {
    label: "Units",
    description: "Metric or imperial for weights and lengths.",
    options: [
      { value: "metric", label: "Metric" },
      { value: "imperial", label: "Imperial" },
    ] as const satisfies readonly { value: Units; label: string }[],
    help: "Metric shows kilograms and centimeters, imperial shows pounds and inches. What you log stays the same either way.",
  },

  theme: {
    label: "Theme",
    description: "Light, dark, or the same as your device.",
    options: [
      { value: "system", label: "Follow system" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ] as const,
    help: "Follow system matches your device and stores nothing. Light or Dark is remembered on this device.",
  },

  sound: {
    label: "Sound",
    help: "Interface sound level and quiet hours, remembered on this device.",
    link: "Sound and quiet hours",
  },

  notifications: {
    label: "Notifications",
    description: "How much a reminder says, with a preview.",
    legend: "Reminder detail",
    options: [
      { value: "generic", label: "Generic" },
      { value: "gentle", label: "Gentle" },
      { value: "detailed", label: "Detailed" },
    ] as const satisfies readonly { value: NotificationDetail; label: string }[],
    help: "How much a reminder says where someone else might see it, such as on a lock screen. For now this changes only the preview below.",
    email: "Emails always stay generic.",
    preview: {
      caption: "Lock screen preview, with sample text rather than anything of yours.",
      clock: "9:41",
      app: "Tidefern",
      when: "now",
      body: {
        generic: "You have a reminder in Tidefern.",
        gentle: "[OWNER] The gentle reminder wording",
        detailed: "[OWNER] The detailed reminder wording",
      } satisfies Record<NotificationDetail, string>,
    },
  },

  devices: {
    label: "Devices",
    help: "The browsers and phones signed in to your account. Sign out any you do not recognize.",
    link: "See your devices",
  },

  twoFactor: {
    label: "Two-step sign-in",
    help: "A code from an app on your phone, asked for after your password.",
    link: "Set up two-step sign-in",
  },

  export: {
    label: "Export",
    description: "Download everything you keep in Tidefern.",
    help: "Everything you keep in Tidefern, in one file for you to save. Downloading it needs a sign-in from the last ten minutes.",
    action: "Download my data",
    pending: "Preparing your file",
    ready: (records: number) =>
      `Your file is ready, with ${records} ${records === 1 ? "record" : "records"}. Check your downloads for ${EXPORT_FILE_NAME}.`,
    saveAgain: "Save the file again",
    cutOff: "The download stopped partway, so the file is incomplete. Download it again.",
    failed: "We could not prepare your file just now. Try again.",
  },

  activity: {
    label: "Activity",
    help: "Sign-ins, devices, sharing changes and exports on your account.",
    link: "See activity",
  },

  consent: {
    label: "Consent record",
    description: "What you agreed Tidefern may collect.",
    help: "What you agreed Tidefern may collect, as you agreed to it.",
    empty: {
      heading: "No consent recorded",
      why: "The consent you give when you set up your account shows here.",
    },
    withdrawnHeading: "Withdrawn",
    withdrawn: (day: string, categories: string) =>
      `You withdrew your consent to ${categories} on ${day}.`,
    children: {
      heading: "Given for a child",
      help: "Each covers one child's own records, so it is not withdrawn here.",
      unnamed: "A child",
      byYou: (day: string) => `Given by you on ${day}.`,
      byOther: (day: string) => `Given by another guardian on ${day}.`,
    },
    withdraw: {
      lead: "Tidefern cannot keep your records without this consent, so withdrawing it also closes your account.",
      action: "Withdraw consent",
      title: "Withdraw your consent?",
      body: "Tidefern cannot keep your records without it, so withdrawing also closes your account. It locks now and is deleted in 7 days. Until then, you can sign in and undo the closure.",
      confirm: "Withdraw and close my account",
      pending: "Withdrawing",
      already:
        "Your consent is already withdrawn. Reload the page to see where your account stands.",
      missing: "We could not find that consent. Reload the page and try again.",
      failed: "We could not withdraw your consent just now. Try again.",
    },
  },

  close: {
    label: "Close account",
    description: "Close your account, with 7 days to undo or at once.",
    help: "Closing locks your account at once and deletes it after 7 days, or now if you choose.",
    action: "Close my account",
    title: "Close your account?",
    consequence: {
      // docs/design/CONTENT.md, voice table, the destructive line.
      "undo-window":
        "Closing your account locks it now and deletes it in 7 days. Until then, you can sign in and undo it.",
      now: "Deleting your account now locks it and deletes it as soon as the deletion runs. There is no undo.",
    },
    modeLegend: "When to delete it",
    modes: [
      { value: "undo-window", label: "In 7 days, with time to undo" },
      { value: "now", label: "Now, with no undo" },
    ] as const,
    confirm: {
      "undo-window": "Close my account",
      now: "Delete my account now",
    },
    pending: "Closing your account",
    failed: "We could not close your account just now. Try again.",
  },

  /** What closing and withdrawing take away at once; an undo brings none of it back (CloseUndone). */
  revokes:
    "Every other device is signed out and everyone you share with loses access at once. Undoing does not bring those back.",

  freshAuth: {
    export: `For safety, downloading your data ${freshAuthTail}`,
    close: `For safety, closing your account ${freshAuthTail}`,
    withdraw: `For safety, withdrawing your consent ${freshAuthTail}`,
    action: "Sign in again",
  },

  signOut: {
    label: "Sign out",
    help: "Signs this browser out. Your other devices stay signed in.",
    action: "Sign out",
  },

  cancel: "Cancel",
  saving: "Saving",
  saved: "Saved.",

  failure: {
    network: "We could not reach Tidefern. Check your connection and try again.",
    server: "Tidefern had a problem on our side. Wait a moment and try again.",
    rateLimited: "Too many attempts in a row. Wait a minute and try again.",
    stale:
      "Your profile changed somewhere else, so we loaded the latest. Check your change and save again.",
    stageNeedsRecord:
      "A pregnancy starts in Journey, with a due date or your last period. Start it there and your stage follows.",
    stageLockedByRecord: "While a pregnancy is recorded, Journey sets your stage. Change it there.",
    invalid: "Check what you entered and try again.",
  },

  closing: {
    title: "Your account",
    description: "What happens next with your Tidefern account.",
    heading: {
      closing: "Your account is closing",
      deleting: "Your account is being deleted",
      undone: "Your account is open again",
      plain: "Your account",
    },
    daysLeft: (days: number) => (days === 1 ? "day left to undo" : "days left to undo"),
    lastDay: "Less than a day left to undo.",
    undoLede:
      "After that your account is deleted, with your records, your notes and the key that encrypted them. Until then you can undo this and keep it.",
    deleting: {
      windowEnded: "The 7 days to undo have passed, so the deletion goes ahead.",
      now: "You chose to delete it now, so there is no undo.",
      started: "The deletion has started and cannot be undone.",
    },
    exportHeading: "Your data",
    exportLede: "Download what Tidefern holds for you, in one file to keep, before it is deleted.",
    undo: {
      action: "Undo and keep my account",
      pending: "Undoing",
      done: "Your account is open again.",
      after:
        "Devices that were signed out stay signed out, and sharing stays off until you share again.",
      back: "Back to Settings",
      windowClosed: "The 7 days to undo have passed, so the deletion goes ahead.",
      nothing: "Nothing is closing now. Reload the page to see where your account stands.",
      failed: "We could not undo this just now. Try again.",
    },
    readFailed: "We could not load your account just now. Reload the page to try again.",
    notClosing: "Your account is not closing now. Reload the page to see where it stands.",
  },
} as const;

/** The plain words for each data category (CONTENT.md, sharing descriptions), private notes included. */
export const categoryLabels = {
  "cycle.status": "Cycle status",
  "cycle.history": "Cycle history",
  "cycle.symptoms": "Symptoms",
  "journal.private": "Private notes",
  "pregnancy.overview": "Pregnancy overview",
  "pregnancy.photos": "Pregnancy photos",
  child: "A child",
} as const;

export type DataCategory = keyof typeof categoryLabels;

/** The categories in the vocabulary's own order, so a record always lists them the same way. */
export const categoryOrder = Object.keys(categoryLabels) as DataCategory[];

/** "a, b and c": category labels inside a sentence, so lower case. */
export function joinLabels(labels: readonly string[]): string {
  const lowered = labels.map((label) => label.toLowerCase());
  if (lowered.length <= 1) return lowered.join("");
  return `${lowered.slice(0, -1).join(", ")} and ${lowered.at(-1)}`;
}

/** The link to sign in again that returns to `returnTo` afterwards (a path, never a query of facts). */
export function signInAgainHref(returnTo: string): string {
  return `/sign-in?${new URLSearchParams({ next: returnTo }).toString()}`;
}
