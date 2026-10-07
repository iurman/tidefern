import { z } from "zod";

/**
 * The profile, consent and data summary shapes of task E2 (architecture
 * record 5.1, 6.1, 7.4, 11 and 12.2). This module imports nothing from
 * ./index: the index re-exports it, and a value import back would be
 * evaluated before the index has initialised its own constants. The two
 * vocabularies it needs from there (the stage and the share categories) are
 * declared here as local constants and pinned to their twins by
 * profile.test.ts, so a value added to one list fails a test until it is
 * added to the other.
 */

const id = z.uuid().describe("Opaque resource identifier");
const instant = z.iso.datetime().describe("RFC 3339 instant in UTC");

/** Mirrors `Stage` in ./index; see the module comment. */
const stageValues = ["none", "cycle", "pregnancy", "postpartum"] as const;

/** Mirrors `ShareCategory` in ./index plus the private journal; see the module comment. */
const dataCategoryValues = [
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "journal.private",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
] as const;

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

/** An IANA time zone the runtime supports; every calendar fact is read in it. */
export const TimeZone = z
  .string()
  .min(1)
  .max(64)
  .refine(isSupportedTimeZone, "Expected an IANA time zone this runtime supports")
  .meta({ id: "TimeZone", description: "IANA time zone every calendar fact is read in" });
export type TimeZone = z.infer<typeof TimeZone>;

/** A display choice; measurements are stored as SI integers regardless. */
export const Units = z.enum(["metric", "imperial"]).meta({ id: "Units" });
export type Units = z.infer<typeof Units>;

/**
 * The three notification detail levels of architecture record 10.3. In
 * Phase 1 the level changes only in-app text and the lock-screen preview;
 * every email stays generic.
 */
export const NotificationDetail = z
  .enum(["generic", "gentle", "detailed"])
  .meta({ id: "NotificationDetail" });
export type NotificationDetail = z.infer<typeof NotificationDetail>;

/** First day of the week, Intl convention: 1 is Monday, 7 is Sunday. */
export const WeekStart = z.int().min(1).max(7).describe("1 is Monday, 7 is Sunday");

/**
 * The profile as its owner writes it with `PUT /v1/me/profile`, the whole
 * record each time. `ageAttested` is the sign-up attestation of being 18 or
 * older (architecture record 8.4): required when the profile is created,
 * recorded once as `ageAttestedAt`, and ignored afterwards. The display
 * name is the one plaintext text column a person writes; it is an identity
 * fact a related person may see, never a health fact, and it is capped.
 */
export const ProfileInput = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().default(null),
    timeZone: TimeZone,
    stage: z.enum(stageValues),
    weekStart: WeekStart.default(1),
    units: Units.default("metric"),
    notificationDetail: NotificationDetail.default("generic"),
    ageAttested: z
      .literal(true)
      .optional()
      .describe("The attestation of being 18 or older; required when the profile is created"),
  })
  .meta({ id: "ProfileInput" });
export type ProfileInput = z.infer<typeof ProfileInput>;

/** The owner's own profile; nothing here is ever served to another person. */
export const Profile = z
  .object({
    displayName: z.string().nullable(),
    timeZone: TimeZone,
    stage: z.enum(stageValues),
    weekStart: WeekStart,
    units: Units,
    notificationDetail: NotificationDetail,
    ageAttestedAt: instant.describe("When the person attested to being 18 or older"),
    version: z.int().min(1).describe("The value `If-Match` carries on the next update"),
    createdAt: instant,
    updatedAt: instant,
  })
  .meta({ id: "Profile" });
export type Profile = z.infer<typeof Profile>;

/**
 * Every category data can be filed under, the private journal included
 * (architecture record 8.2). Consents and the data summary speak in these.
 */
export const DataCategory = z.enum(dataCategoryValues).meta({ id: "DataCategory" });
export type DataCategory = z.infer<typeof DataCategory>;

/**
 * The legal basis of a consent (architecture record 7.4): `necessary` for
 * data the person asked the product to hold in order to work, `consent` for
 * anything collected for a specified purpose beyond that.
 */
export const ConsentBasis = z.enum(["necessary", "consent"]).meta({ id: "ConsentBasis" });
export type ConsentBasis = z.infer<typeof ConsentBasis>;

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

/**
 * The guardian's consent as the add-a-child form collected it: the box the
 * guardian checked (never pre-checked) and the version of the text the form
 * showed. As with the collection consent, the client sends no sentence.
 */
export const GuardianConsentInput = z
  .object({
    given: z
      .literal(true)
      .describe("Set only by the guardian's own check of the box; the form never pre-checks it"),
    textVersion: z
      .enum(childConsentTextVersions)
      .describe("The version of the guardian's consent text the form showed"),
  })
  .meta({
    id: "GuardianConsentInput",
    description:
      "The guardian's consent on the child's behalf; a child is never created without it",
  });
export type GuardianConsentInput = z.infer<typeof GuardianConsentInput>;

/** A version label such as `2026-10`: letters, digits, dots and hyphens only, never prose. */
const versionLabel = z
  .string()
  .regex(/^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/, "Expected a version label such as 2026-10");

/**
 * The collection consent as the onboarding page collected it (architecture
 * record 12.2): the categories she agreed to, the version of the consent
 * text the page showed and the version of the terms accepted beside it.
 * The client sends no sentence: the server takes each category's basis and
 * purpose and the processor names from `CONSENT_DISCLOSURES` for that
 * version and hashes the whole disclosure into every row it writes.
 */
export const ConsentInput = z
  .object({
    categories: z
      .array(DataCategory)
      .min(1)
      .max(dataCategoryValues.length)
      .refine((items) => new Set(items).size === items.length, "Each category appears once"),
    textVersion: z
      .enum(consentTextVersions)
      .describe("The version of the consent text shown, a key of the catalog"),
    termsVersion: versionLabel.describe("The version of the terms accepted beside the consent"),
  })
  .meta({ id: "ConsentInput" });
export type ConsentInput = z.infer<typeof ConsentInput>;

/** One consent row: a category, its basis and purpose, and when it was granted or withdrawn. */
export const Consent = z
  .object({
    id,
    subjectId: id.describe("The person, or the child a guardian consented for"),
    consentingGuardianId: id
      .nullable()
      .describe("Set when a guardian consented on a child's behalf"),
    category: DataCategory,
    basis: ConsentBasis,
    purpose: z.string(),
    textVersion: z.string().describe("The version of the disclosure text shown"),
    textHash: z.string().describe("SHA-256 of the exact disclosure shown, hex"),
    grantedAt: instant,
    withdrawnAt: instant.nullable(),
  })
  .meta({ id: "Consent" });
export type Consent = z.infer<typeof Consent>;

/** What `POST /v1/me/consents` answers: the rows written under one disclosure hash. */
export const ConsentRecord = z
  .object({
    id: id.describe(
      "The id of the record's first row, which the consent list carries too; an idempotent replay answers it alone",
    ),
    textHash: z.string(),
    textVersion: z.string(),
    termsVersion: z.string(),
    processors: z.array(z.string()),
    items: z.array(Consent),
  })
  .meta({ id: "ConsentRecord" });
export type ConsentRecord = z.infer<typeof ConsentRecord>;

export const ConsentList = z
  .object({
    items: z.array(Consent),
    nextCursor: z.string().nullable().describe("Opaque; pass back as `cursor` for the next page"),
  })
  .meta({ id: "ConsentList" });
export type ConsentList = z.infer<typeof ConsentList>;

/**
 * What withdrawing the collection consent answers (architecture record
 * 11): every active consent of the person is withdrawn at one instant and
 * the account closure that follows is named, with the end of its undo
 * window.
 */
export const ConsentWithdrawal = z
  .object({
    id,
    withdrawnAt: instant,
    closure: z.object({
      requestId: id.describe("The closure request the deletion job advances"),
      state: z.enum(["requested", "in_progress"]),
      undoUntil: instant.describe("Signing in and cancelling before this keeps the account"),
    }),
  })
  .meta({ id: "ConsentWithdrawal" });
export type ConsentWithdrawal = z.infer<typeof ConsentWithdrawal>;

/** A processor from architecture record 9.5 with what it receives and an online contact. */
export const Processor = z
  .object({
    name: z.string(),
    receives: z.string(),
    contact: z
      .url()
      .describe(
        "Where the processor publishes its data processing terms; the owner replaces each with a privacy contact address before launch",
      ),
  })
  .meta({ id: "Processor" });
export type Processor = z.infer<typeof Processor>;

/** One active grant a person holds, as the data summary lists it. */
export const DataSummaryGrant = z
  .object({
    id,
    category: DataCategory.describe("A share category; the private journal is never granted"),
    level: z.enum(["summary", "read", "contribute"]),
    childId: id.optional().describe("The one child a child grant reaches"),
    createdAt: instant,
  })
  .meta({ id: "DataSummaryGrant" });
export type DataSummaryGrant = z.infer<typeof DataSummaryGrant>;

/**
 * One entry of the disclosure ledger (architecture record 7.4): a third
 * party or affiliate data was shared with, with a contact mechanism. The
 * ledger is empty in v1, because a grant to a partner is a disclosure to a
 * consumer and not sharing; the access right returns it all the same.
 */
export const DataSummaryDisclosure = z
  .object({
    id,
    recipient: z.string(),
    contact: z.string(),
    purpose: z.string(),
    createdAt: instant,
  })
  .meta({ id: "DataSummaryDisclosure" });
export type DataSummaryDisclosure = z.infer<typeof DataSummaryDisclosure>;

/**
 * The confirm and access answer of architecture record 11: the categories
 * held with row counts only, every processor with its contact, every
 * person holding an active grant and the disclosure ledger of 7.4. The data
 * itself comes with the export.
 */
export const DataSummary = z
  .object({
    categories: z.array(
      z.object({
        category: DataCategory,
        count: z
          .int()
          .min(0)
          .describe("Rows held under this category, across every table that files there"),
      }),
    ),
    processors: z.array(Processor),
    people: z.array(
      z.object({
        personId: id,
        displayName: z.string().nullable(),
        grants: z.array(DataSummaryGrant),
      }),
    ),
    disclosures: z
      .array(DataSummaryDisclosure)
      .describe("Every third party or affiliate data was shared with; empty in v1"),
  })
  .meta({ id: "DataSummary" });
export type DataSummary = z.infer<typeof DataSummary>;

/**
 * What an idempotent replay answers (architecture record 5.3 as E1 built
 * it): the stored status with the created or changed resource's id only,
 * marked by the `Idempotency-Replayed: true` header. A client that needs
 * the full body re-reads the resource.
 */
export const IdempotentReplay = z.object({ id }).meta({
  id: "IdempotentReplay",
  description: "A replayed answer: the resource id only, with Idempotency-Replayed: true",
});
export type IdempotentReplay = z.infer<typeof IdempotentReplay>;
