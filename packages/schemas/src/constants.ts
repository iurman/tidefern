/**
 * The Zod-free entry of the package, `@tidefern/schemas/constants`: the
 * vocabulary labels, the consent and sharing catalogs, their version lines
 * and the small checks client components need, with no runtime import of
 * Zod (task J2b). A client component that imported the root entry for a
 * label shipped Zod and every schema with it, about 100 KB compressed on
 * each signed-in route (docs/design/PERFORMANCE.md).
 *
 * This module imports only types, so it costs nothing at runtime beyond its
 * own values. The modules that build the schemas import these values from
 * here and re-export them, so the root entry's public surface is unchanged.
 * A web unit test fails if a client module imports the root entry for a
 * value; client code imports values from here.
 */
import type { FlowLevel, MoodCode, ShareCategory, ShareLevel, Stage, SymptomCode } from "./index";
import type { ConsentBasis, DataCategory } from "./profile";

export type { FlowLevel, MoodCode, ShareCategory, ShareLevel, Stage, SymptomCode };
export type { ConsentBasis, DataCategory };

/*
 * The cycle vocabulary's labels (task E3). The three maps are pinned to the
 * index enums by `satisfies`, so a value added to `FlowLevel`, `SymptomCode`
 * or `MoodCode` fails to compile here until it has a label, and the api's
 * cycle test proves the code lists match the enums at runtime.
 */

/** Sentence case, plain words, in picker order; the day sheet shows these. */
export const FLOW_LABELS = {
  none: "None",
  spotting: "Spotting",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
} as const satisfies Record<FlowLevel, string>;

export const SYMPTOM_LABELS = {
  cramps: "Cramps",
  headache: "Headache",
  bloating: "Bloating",
  fatigue: "Fatigue",
  tender_breasts: "Tender breasts",
  nausea: "Nausea",
  backache: "Backache",
  acne: "Acne",
  cravings: "Cravings",
  insomnia: "Trouble sleeping",
  spotting: "Spotting",
  discharge: "Discharge",
  hot_flashes: "Hot flashes",
  dizziness: "Dizziness",
  mood_swings: "Mood swings",
  anxiety: "Anxiety",
  low_energy: "Low energy",
  high_energy: "High energy",
  other: "Something else",
} as const satisfies Record<SymptomCode, string>;

export const MOOD_LABELS = {
  low: "Low",
  steady: "Steady",
  bright: "Bright",
} as const satisfies Record<MoodCode, string>;

function codesOf<Code extends string>(labels: Readonly<Record<Code, string>>): [Code, ...Code[]] {
  return Object.keys(labels) as [Code, ...Code[]];
}

export const FLOW_CODES = codesOf(FLOW_LABELS);
export const SYMPTOM_CODES = codesOf(SYMPTOM_LABELS);
export const MOOD_CODES = codesOf(MOOD_LABELS);

/**
 * The flow levels that make a day a period day. Spotting is not bleeding, so
 * a day of spotting neither starts a period nor extends one; `none` is an
 * explicit "no bleeding today".
 */
export const PERIOD_FLOWS = ["light", "medium", "heavy"] as const satisfies readonly FlowLevel[];

export function isPeriodFlow(flow: FlowLevel | null | undefined): boolean {
  return flow !== null && flow !== undefined && (PERIOD_FLOWS as readonly string[]).includes(flow);
}

/* The time zone check behind `TimeZone` (task E2). */

let supportedTimeZones: ReadonlySet<string> | null = null;

function supported(): ReadonlySet<string> {
  if (supportedTimeZones === null) {
    supportedTimeZones = new Set(Intl.supportedValuesOf("timeZone"));
  }
  return supportedTimeZones;
}

/**
 * Whether the name is an IANA time zone this runtime knows. The first test
 * is `Intl.supportedValuesOf("timeZone")`. That list holds one spelling per
 * zone and the spelling follows the runtime's ICU data, not current IANA:
 * Node 26 lists `Asia/Calcutta` and `Europe/Kiev` but not `Asia/Kolkata`,
 * `Europe/Kyiv` or `UTC`, while a browser may report either spelling. So a
 * name missing from the list is still accepted when `Intl.DateTimeFormat`
 * resolves it to a listed zone or to `UTC`, which admits current names and
 * IANA links and still refuses an unknown name or a bare UTC offset (an
 * offset resolves to itself). The name is stored as sent.
 */
export function isSupportedTimeZone(value: string): boolean {
  const zones = supported();
  if (zones.has(value)) return true;
  if (!/^[A-Za-z]/.test(value)) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  return resolved === "UTC" || zones.has(resolved);
}

/* The collection consent and the guardian's consent (task E2, E12). */

/** What a disclosure says about one category: its basis and its purpose sentence. */
export interface ConsentDisclosureItem {
  basis: ConsentBasis;
  purpose: string;
}

/** One version of the collection consent text as the onboarding page shows it. */
export interface ConsentDisclosure {
  /** Every category, so any subset a person is asked about has its sentence. */
  categories: Readonly<Record<DataCategory, ConsentDisclosureItem>>;
  /** The processors the page names, as architecture record 9.5 lists them. */
  processors: readonly string[];
}

/** The versions of the consent text, oldest first; the last is what the page shows now. */
export const consentTextVersions = ["2026-10"] as const;
export type ConsentTextVersion = (typeof consentTextVersions)[number];

/**
 * The version of the terms the onboarding page records beside the consent
 * (`ConsentInput.termsVersion`). A free label, not a catalog key: the terms
 * text is still awaiting the owner and the attorney (docs/design/CONTENT.md,
 * the `[OWNER]` line for it), and this value changes whenever that text does.
 */
export const TERMS_VERSION = "2026-10";

/**
 * The catalog of consent text, keyed by version. The page renders these
 * sentences and the server writes them into the consent rows, so the
 * plaintext `purpose` column only ever holds the product's own words and
 * never anything a client typed (AGENTS.md: free text only in encrypted
 * fields). A changed sentence is a new version; a version, once shipped, is
 * never edited. The 2026-10 wording is the seed's (packages/db seed) for
 * every category but `child`. The seed's child rows are guardian consents in
 * the words of `CHILD_CONSENT_DISCLOSURES` below; this catalog's `child`
 * sentence leaves out diapers, and changing it is a new version that waits
 * on the owner and the attorney. The owner confirms all of it with the
 * attorney before launch [OWNER].
 */
export const CONSENT_DISCLOSURES: Readonly<Record<ConsentTextVersion, ConsentDisclosure>> = {
  "2026-10": {
    categories: {
      "cycle.status": {
        basis: "consent",
        purpose: "Show a status card to the people you choose.",
      },
      "cycle.history": {
        basis: "necessary",
        purpose: "Keep the dates you log so the calendar and the estimates work.",
      },
      "cycle.symptoms": {
        basis: "necessary",
        purpose: "Keep what you log on a day so you can look back at it.",
      },
      "journal.private": {
        basis: "necessary",
        purpose: "Keep your private notes, readable by you alone.",
      },
      "pregnancy.overview": {
        basis: "necessary",
        purpose: "Keep your due date, appointments and milestones.",
      },
      "pregnancy.photos": {
        basis: "consent",
        purpose: "Keep the photos you add to your journey.",
      },
      child: {
        basis: "necessary",
        purpose: "Keep this child's feeds, sleep, growth and milestones.",
      },
    },
    processors: ["Vercel", "Neon (Databricks, Inc.)", "GitHub", "Resend", "Cloudflare"],
  },
};

/**
 * The guardian's consent on a child's behalf (architecture record 8.4,
 * "Children's records", and 7.4). A child's data is the child's consumer
 * health data, so `POST /v1/children` writes one `consents` row in the same
 * transaction as the child and its key: the child is the subject and the
 * guardian adding the child is recorded as the one who consented. It keeps a
 * version line of its own because it is a disclosure of its own, about
 * another subject, given by another person at another moment than the
 * collection consent. The add-a-child form shows the last version's `text`
 * in full before an unchecked box; the client sends only that version, and
 * the server writes the catalog's category, basis and purpose into the row
 * and hashes the whole disclosure. A changed sentence is a new version; a
 * version, once shipped, is never edited.
 *
 * The 2026-10 wording is a draft [OWNER]: the owner's attorney reviews it
 * with the other consent texts before anyone outside the household signs
 * up, a Phase 2 gate (docs/design/CONTENT.md). Withdrawing it is the child's
 * closure path, which is not built yet, so the text does not describe it.
 */
export const childConsentTextVersions = ["2026-10"] as const;
export type ChildConsentTextVersion = (typeof childConsentTextVersions)[number];

/** One version of the guardian's consent on a child's behalf. */
export interface ChildConsentDisclosure {
  /** What the row files under: the child's own category. */
  category: "child";
  basis: ConsentBasis;
  /** The sentence the row's `purpose` column holds, in the product's own words. */
  purpose: string;
  /** The disclosure the form shows in full before the box. */
  text: string;
}

export const CHILD_CONSENT_DISCLOSURES: Readonly<
  Record<ChildConsentTextVersion, ChildConsentDisclosure>
> = {
  "2026-10": {
    category: "child",
    basis: "necessary",
    purpose: "Keep this child's feeds, sleep, diapers, growth and milestones.",
    text: "You are adding this child as their parent or guardian. On the child's behalf, you agree that Tidefern keeps what is logged for them: feeds, sleep, diapers, growth, milestones and notes. Notes are stored encrypted. Every guardian of this child sees all of it, and anyone else only when a guardian shares this child with them.",
  },
};

/* The sharing screen's plain words (task E5). */

/**
 * The versions of the plain words the sharing screen shows before a
 * category can be turned on, oldest first; the last is what the screen
 * shows now. A grant records the version it was made under
 * (`GrantSetInput.descriptionVersion`, the `grants.description_version`
 * column), so a version names exactly the text the owner read: every row's
 * words, a child's own row included, and the notify switch's. A changed
 * sentence is a new version; a version, once shipped, is never edited.
 */
export const sharingDescriptionVersions = ["2026-10"] as const;
export type SharingDescriptionVersion = (typeof sharingDescriptionVersions)[number];

/** The version the sharing screen shows now. */
export const CURRENT_SHARING_DESCRIPTION_VERSION: SharingDescriptionVersion = "2026-10";

/** A category's name on the screen and what turning it on reveals. */
export interface SharingDescription {
  label: string;
  description: string;
}

/** One version of the sharing screen's plain words. */
export interface SharingDescriptions {
  categories: Readonly<Record<ShareCategory, SharingDescription>>;
  /**
   * The words on one child's own row, `[child]` standing for her name: the
   * `child` category's sentence with the name in it. The screen gives each
   * child one switch, so the row leaves that sentence out.
   */
  childRow: string;
  /** The notify switch: its label, `[name]` standing for the person told, and its one sentence. */
  notify: SharingDescription;
  /** The private journal, which has no switch and never will. */
  privateNotes: SharingDescription;
}

/**
 * A catalog sentence with its `[child]` or `[name]` placeholder filled in.
 * The value is a name someone typed, so it goes in through a function:
 * a replacement string would read `$&`, `$'` and `` $` `` in it as patterns.
 */
export function fillSharingWords(template: string, value: string): string {
  return template.replace(/\[(?:child|name)\]/g, () => value);
}

/**
 * The catalog of the plain words, keyed by version. The 2026-10 sentences
 * are docs/design/CONTENT.md's sharing descriptions word for word (the
 * table, the notify switch under it and the child's row in the `/sharing`
 * subsection); a web test compares the two, so neither can change without
 * the other.
 */
export const SHARING_DESCRIPTIONS: Readonly<
  Record<SharingDescriptionVersion, SharingDescriptions>
> = {
  "2026-10": {
    categories: {
      "cycle.status": {
        label: "Cycle status",
        description:
          "Which day of your cycle it is and whether Tidefern estimates a fertile window today. Not your symptoms, not your notes.",
      },
      "cycle.history": {
        label: "Cycle history",
        description: "Your past periods, cycle lengths and the next period estimate.",
      },
      "cycle.symptoms": {
        label: "Symptoms",
        description: "The symptoms and moods you log on any day, in any stage.",
      },
      "pregnancy.overview": {
        label: "Pregnancy overview",
        description:
          "The week, the due date, appointments and milestones. Never why a pregnancy ended, never your notes.",
      },
      "pregnancy.photos": {
        label: "Pregnancy photos",
        description: "Photos you add to the journey (Phase 2).",
      },
      child: {
        label: "A child",
        description:
          "Everything logged for that child: feeds, sleep, growth, milestones and photos. One switch per child.",
      },
    },
    childRow: "Everything logged for [child]: feeds, sleep, growth, milestones and photos.",
    notify: {
      label: "Tell [name] when my period starts",
      description: "The message says only that there is something new in Tidefern.",
    },
    privateNotes: { label: "Private notes", description: "Never shared. There is no switch." },
  },
};

/* The invitation checks a client runs before it sends (task E5). */

/** The shape of the token in an invitation link; `InvitationAcceptInput.token` uses it. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** Whether a token has the shape `InvitationAcceptInput.token` takes. */
export function isInvitationToken(token: string): boolean {
  return INVITATION_TOKEN_PATTERN.test(token);
}

/** The longest address `InvitationInput.inviteeEmail` takes. */
export const INVITEE_EMAIL_MAX_LENGTH = 254;

/**
 * The address pattern `z.email()` applies by default, copied from the
 * installed Zod's `z.regexes.email` so a client can check an address without
 * shipping Zod. constants.test.ts compares the two, so a Zod upgrade that
 * changes the pattern fails the test until this copy follows it.
 */
export const INVITEE_EMAIL_PATTERN =
  // eslint-disable-next-line no-useless-escape -- copied character for character, so the test can compare sources
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

/** Whether an address has the shape `InvitationInput.inviteeEmail` takes. */
export function isInviteeEmail(address: string): boolean {
  return address.length <= INVITEE_EMAIL_MAX_LENGTH && INVITEE_EMAIL_PATTERN.test(address);
}
