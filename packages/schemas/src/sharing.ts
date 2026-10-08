import { z } from "zod";

/**
 * The sharing contract (architecture 8.1 to 8.4 and 11): who the actor
 * shares with, which category at which level, the invitations that bring a
 * person into her household, and the switches on a grant. Reusable shapes
 * carry `.meta({ id })`, which the OpenAPI emitter turns into named
 * components (architecture 5.1).
 *
 * index.ts re-exports this module, so this module cannot import from it: an
 * ESM cycle would evaluate this file before index.ts initialised `Id`,
 * `ShareCategory` and `ShareLevel`. The three are repeated here, and the api
 * package's sharing test pins each repeat to the index export.
 */
const Id = z.uuid().describe("Opaque resource identifier");

const GrantCategory = z.enum([
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
]);

const GrantLevel = z.enum(["summary", "read", "contribute"]);

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
  categories: Readonly<Record<z.infer<typeof GrantCategory>, SharingDescription>>;
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

/** A catalog sentence with its `[child]` or `[name]` placeholder filled in. */
export function fillSharingWords(template: string, value: string): string {
  return template.replace(/\[(?:child|name)\]/g, value);
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

/** The roles an invitation can hand out; the owner role is never invited into. */
export const InvitableRole = z.enum(["partner", "guardian"]);
export type InvitableRole = z.infer<typeof InvitableRole>;

/** A person's role in the household the actor shares with her, or null outside one. */
export const HouseholdRole = z.enum(["owner", "partner", "guardian"]);
export type HouseholdRole = z.infer<typeof HouseholdRole>;

/** One active grant the actor has given: a category at a level, for one child when the category is `child`. */
export const SharingGrant = z
  .object({
    id: Id,
    category: GrantCategory,
    level: GrantLevel,
    childId: Id.optional().describe("The one child a child grant reaches"),
    notify: z.boolean().describe("Whether this person is told when a period starts"),
    version: z.int().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "SharingGrant", description: "A category the actor shares with one person" });
export type SharingGrant = z.infer<typeof SharingGrant>;

/**
 * A person the actor shares with or could share with: a member of a
 * household she belongs to, a co-guardian of a child she guards, or
 * someone holding a grant from her. Only her display name is shown; the
 * rest of a profile never enters another person's view.
 */
export const SharingPerson = z
  .object({
    id: Id,
    displayName: z.string().nullable(),
    role: HouseholdRole.nullable().describe("Her role in the household shared with the actor"),
    householdId: Id.nullable().describe("The household shared with the actor, if any"),
    guardianOf: z.array(Id).describe("Children of the actor's that this person also guards"),
    grants: z.array(SharingGrant).describe("Active grants from the actor to this person"),
    notify: z.boolean().describe("The per-person notification switch; true when any grant has it"),
    version: z
      .int()
      .min(0)
      .describe("Changes with every grant change for this person; the value If-Match compares"),
  })
  .meta({ id: "SharingPerson", description: "One person and what the actor shares with her" });
export type SharingPerson = z.infer<typeof SharingPerson>;

export const SharingPeople = z
  .object({
    items: z.array(SharingPerson),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "SharingPeople" });
export type SharingPeople = z.infer<typeof SharingPeople>;

export const InvitationInput = z
  .object({
    id: z.uuidv7().optional().describe("Optional client-minted UUIDv7 for offline-first clients"),
    inviteeEmail: z
      .email()
      .max(254)
      .describe("The address the invitation is bound to; acceptance needs a sign-in with it"),
    role: InvitableRole,
  })
  .meta({ id: "InvitationInput" });
export type InvitationInput = z.infer<typeof InvitationInput>;

/** A pending invitation as the inviter sees it; the token itself is in the mail and nowhere else. */
export const Invitation = z
  .object({
    id: Id,
    householdId: Id,
    inviteeEmail: z.string(),
    role: InvitableRole,
    createdAt: z.iso.datetime().describe("When it was sent"),
    expiresAt: z.iso.datetime().describe("72 hours after it was sent"),
  })
  .meta({ id: "Invitation" });
export type Invitation = z.infer<typeof Invitation>;

export const Invitations = z
  .object({
    items: z.array(Invitation),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "Invitations" });
export type Invitations = z.infer<typeof Invitations>;

/** The choice an invitee who already belongs to another household makes on her second call. */
export const HouseholdChoice = z.enum(["move", "stay"]);
export type HouseholdChoice = z.infer<typeof HouseholdChoice>;

export const InvitationAcceptInput = z
  .object({
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,128}$/, "Expected the token from the invitation link"),
    household: HouseholdChoice.optional().describe(
      "Required on the second call when the invitee already belongs to another household: move leaves it, stay keeps it and declines to join",
    ),
  })
  .meta({ id: "InvitationAcceptInput" });
export type InvitationAcceptInput = z.infer<typeof InvitationAcceptInput>;

export const InvitationAcceptance = z
  .object({
    invitationId: Id,
    joined: z.boolean().describe("False when the invitee chose to stay in her current household"),
    householdId: Id.nullable().describe("The household joined, or null when not joined"),
  })
  .meta({ id: "InvitationAcceptance" });
export type InvitationAcceptance = z.infer<typeof InvitationAcceptance>;

/** One category to set for a person; a null level revokes it. `journal.private` is not a value here and never will be. */
export const GrantSetting = z
  .object({
    category: GrantCategory,
    level: GrantLevel.nullable().describe("The level to hold, or null to revoke"),
    childId: Id.optional().describe("Required exactly when the category is child"),
  })
  .refine((setting) => (setting.category === "child") === (setting.childId !== undefined), {
    message: "A child grant names its child, and no other grant does",
    path: ["childId"],
  })
  .meta({ id: "GrantSetting" });
export type GrantSetting = z.infer<typeof GrantSetting>;

export const GrantSetInput = z
  .object({
    grants: z
      .array(GrantSetting)
      .min(1)
      .max(20)
      .refine(
        (grants) =>
          new Set(grants.map((grant) => `${grant.category}/${grant.childId ?? ""}`)).size ===
          grants.length,
        { message: "Each category, and each child, appears once" },
      ),
    policyVersion: z
      .string()
      .min(1)
      .max(32)
      .describe("The version of the sharing policy the owner saw when she chose these"),
    descriptionVersion: z
      .enum(sharingDescriptionVersions)
      .describe(
        "The version of the plain-words category descriptions she saw, a key of the sharing descriptions catalog",
      ),
  })
  .meta({ id: "GrantSetInput" });
export type GrantSetInput = z.infer<typeof GrantSetInput>;

export const NotifyInput = z
  .object({
    personId: Id,
    notify: z.boolean(),
  })
  .meta({ id: "NotifyInput" });
export type NotifyInput = z.infer<typeof NotifyInput>;
