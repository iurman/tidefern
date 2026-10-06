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

/** One category the consent page showed, with its basis and the purpose text as shown. */
export const ConsentCategoryInput = z
  .object({
    category: DataCategory,
    basis: ConsentBasis,
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("The purpose sentence the page showed for this category, verbatim"),
  })
  .meta({ id: "ConsentCategoryInput" });
export type ConsentCategoryInput = z.infer<typeof ConsentCategoryInput>;

/**
 * The collection consent as the onboarding page collected it (architecture
 * record 12.2): the categories with their purposes, the processors named,
 * the version of the disclosure text and the version of the terms accepted
 * beside it. The server hashes the whole disclosure into every row it
 * writes, so the exact text shown is bound to the consent.
 */
export const ConsentInput = z
  .object({
    categories: z
      .array(ConsentCategoryInput)
      .min(1)
      .max(dataCategoryValues.length)
      .refine(
        (items) => new Set(items.map((item) => item.category)).size === items.length,
        "Each category appears once",
      ),
    processors: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(20)
      .describe("The processor names the page showed, as shown"),
    textVersion: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe("The version of the disclosure text shown"),
    termsVersion: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe("The version of the terms accepted beside the consent"),
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
    contact: z.url().describe("The processor's privacy or data processing contact page"),
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
 * The confirm and access answer of architecture record 11: the categories
 * held with row counts only, every processor with its contact, and every
 * person holding an active grant. The data itself comes with the export.
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
  })
  .meta({ id: "DataSummary" });
export type DataSummary = z.infer<typeof DataSummary>;
