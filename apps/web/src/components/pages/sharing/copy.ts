import type { HouseholdRole, InvitableRole, ShareCategory } from "@tidefern/schemas";

/**
 * Every string /sharing shows, in one module (architecture 13.10), except
 * the plain words on a person's card (each category's, a child's own row
 * and the notify switch's), which come from the versioned catalog in
 * packages/schemas through grant-row's `sharingWords` and are never
 * retyped here.
 *
 * A "Sourced" comment names where the strings right under it come from
 * (CONTENT.md, DESIGN.md 3.7, the component library's specimens or the
 * devices route), and covers only those strings. Every run marked
 * `[OWNER]` is written to CONTENT.md's voice table (pending says what is
 * happening, failure says what to do next) and is a draft: the /sharing
 * subsection of CONTENT.md lists each one, a test holds the two together,
 * and the owner replaces them here in one place. Nothing here names a
 * health fact; a category name in a sentence is not one (a lead ruling).
 */

/** Names in running text: "Ilo", "Ilo and Sol", "Ilo, Sol and Nora" (CONTENT.md writes no serial comma). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A category as the object of a sentence ("Alex can now see your cycle status."). */
const categoryPhrases: Readonly<Record<Exclude<ShareCategory, "child">, string>> = {
  "cycle.status": "your cycle status",
  "cycle.history": "your cycle history",
  "cycle.symptoms": "your symptoms",
  "pregnancy.overview": "your pregnancy overview",
  "pregnancy.photos": "your pregnancy photos",
};

/** What a grant reveals, as the object of a sentence; a child grant names the child. */
export function grantPhrase(category: ShareCategory, childName?: string): string {
  if (category === "child") return `everything logged for ${childName ?? "this child"}`;
  return categoryPhrases[category];
}

// [OWNER] drafts: who a person is.
const relations: Readonly<Record<HouseholdRole, string>> = {
  owner: "household owner",
  partner: "partner",
  guardian: "household guardian",
};

/** Who a person is to the actor, from her household role and the children both guard. */
export function relationText(role: HouseholdRole | null, coGuarded: readonly string[]): string {
  const base = role === null ? "outside your household" : relations[role];
  return coGuarded.length > 0 ? `${base}, co-guardian of ${joinNames(coGuarded)}` : base;
}

/** The roles an invitation offers, in the order the control shows them ([OWNER] drafts). */
export const inviteRoles: readonly { value: InvitableRole; label: string }[] = [
  { value: "partner", label: "Partner" },
  { value: "guardian", label: "Guardian" },
];

/** Who alone can invite into the actor's household, and what to do about it. */
function ownerOnly(name: string | null): string {
  return name === null
    ? "Only the person who started your household can invite people into it. Ask them to send the invitation."
    : `Only ${name} can invite people into your household. Ask ${name} to send the invitation.`;
}

export const sharingCopy = {
  // Sourced: CONTENT.md, the /sharing row's title ("Sharing | Tidefern"), also the page heading.
  title: "Sharing",
  heading: "Sharing",
  // [OWNER] draft: the metadata description.
  description: "Choose who sees what in Tidefern, one category at a time.",
  // Sourced: DESIGN.md 3.7.
  people: "People",
  invitations: "Invitations",
  /**
   * DESIGN.md 3.7's closing line, once per page; the same words as the
   * per-card line in grant-row.tsx, which this module cannot import: the
   * server page reads it, and grant-row is a client module.
   */
  privateNotes: "Private notes are never shared.",
  // [OWNER] drafts: what someone outside the list shares, a failed read, a person with no name.
  sharedWithYou: "Shared with you",
  sharedWithYouNote: "Only the person who shares it with you can change it.",
  loadFailed: "We could not load who you share with just now. Reload the page to try again.",
  /** The failed read while the acceptance panel holds a token, which a reload would lose. */
  loadFailedHolding:
    "We could not load who you share with just now. Accept the invitation above first, then reload the page.",
  unnamed: "Someone",
  // Sourced: CONTENT.md (empty states).
  empty: {
    heading: "You are the only one who can see this",
    why: "Invite a partner and choose exactly what they see, category by category.",
    action: "Invite a partner",
  },
  // [OWNER] drafts: what a person shares with the actor.
  received: {
    heading: (name: string) => `${name} shares with you`,
    note: (name: string) => `Only ${name} can change this.`,
  },
  grant: {
    // [OWNER] drafts: the confirm step's title and action.
    title: (phrase: string, name: string) => `Share ${phrase} with ${name}?`,
    confirm: (name: string) => `Share with ${name}`,
    // Sourced: CONTENT.md's pending example and the dialog's own cancel.
    pending: "Saving",
    cancel: "Cancel",
    // Sourced: CONTENT.md's success example, "Alex can now see your cycle status."
    on: (name: string, phrase: string) => `${name} can now see ${phrase}.`,
    // [OWNER] draft: the outcome of turning one off.
    off: (name: string, phrase: string) => `${name} can no longer see ${phrase}.`,
  },
  // [OWNER] drafts: the notify switch held back, on with nothing to tell of, and its outcomes.
  notify: {
    needsCycle: (name: string) => `Share your cycle status or cycle history with ${name} first.`,
    unsent: (name: string) =>
      `No message goes out until you share your cycle status or cycle history with ${name}.`,
    on: (name: string) => `Tidefern will tell ${name} when your period starts.`,
    off: (name: string) => `Tidefern will no longer tell ${name} when your period starts.`,
  },
  remove: {
    // [OWNER] drafts: the consequence by role, the outcomes and the co-guardian refusal.
    member: (name: string) =>
      `${name} leaves your household and loses access to everything you share, right now. What ${name} added to your record stays with you.`,
    owner: (name: string) =>
      `You leave ${name}'s household, and ${name} loses access to everything you share, right now. What ${name} shares with you stays until ${name} turns it off.`,
    grants: (name: string) =>
      `${name} loses access to everything you share, right now. What ${name} added to your record stays with you.`,
    removed: (name: string) => `${name} no longer sees anything you share.`,
    left: (name: string) =>
      `You left ${name}'s household. ${name} no longer sees anything you share.`,
    // The API names no blocking child, only that one would be left without a second
    // guardian, so the refusal for several children says "at least one of them".
    coGuardianOne: (name: string, child: string) =>
      `${name} also guards ${child}, and removing ${name} would leave ${child} without a second guardian. Change who guards ${child} in Family first, then remove ${name}.`,
    coGuardianSeveral: (name: string, children: string) =>
      `${name} also guards ${children}, and removing ${name} would leave at least one of them without a second guardian. Change who guards them in Family first, then remove ${name}.`,
    familyLink: "Go to Family",
    // Sourced: the component library's destructive dialog specimen.
    failed: (name: string) => `We could not remove ${name}. Try again.`,
  },
  failure: {
    // Sourced: the grant row specimen.
    save: "We could not save this change. Try again.",
    // [OWNER] drafts: a stale page and the rate limit.
    changedElsewhere: "This changed somewhere else, and the page now shows the latest. Try again.",
    tooMany: "Too many changes in a row. Wait a minute and try again.",
    // Sourced: the devices route, the same two failures.
    server: "Tidefern had a problem on our side. Wait a moment and try again.",
    offline: "We could not reach Tidefern. Check your connection and try again.",
  },
  freshAuth: {
    // [OWNER] drafts: the ten-minute rule for each action.
    grant:
      "For safety, turning on a category needs a sign-in from the last ten minutes. Sign in again, then come back here.",
    invite:
      "For safety, sending an invitation needs a sign-in from the last ten minutes. Sign in again, then come back here.",
    // Sourced: the devices route.
    action: "Sign in again",
  },
  invite: {
    // Sourced: DESIGN.md 3.7 ("Invite a partner"), CONTENT.md's empty-state action.
    heading: "Invite a partner",
    // [OWNER] drafts: the field, its help and the role control.
    email: {
      label: "Their email",
      help: "They get an email asking them to sign in to Tidefern. Nothing is shared until you turn a category on.",
    },
    role: "Invite them as",
    // Sourced: the dialog specimen and CONTENT.md's pending example.
    submit: "Send the invitation",
    pending: "Sending the invitation",
    // [OWNER] drafts: the outcome, the refusals and who alone can invite.
    sent: (email: string) => `Invitation sent to ${email}.`,
    emailInvalid: "Enter their email address, like name@example.com.",
    pendingAlready:
      "An invitation to this address is already waiting. Withdraw it to send a new one.",
    /** Shown instead of the form to a member of a household someone else owns. */
    ownerOnly,
    /** The API's refusal for the same rule, when the page could not tell (no owner listed). */
    memberElsewhere: ownerOnly(null),
    mailUnavailable: "Tidefern cannot send email right now, so nothing was sent. Try again later.",
    // Sourced: the dialog specimen.
    failed: "We could not send the invitation. Try again.",
  },
  // [OWNER] drafts: withdrawing, and an invitation that closed before the press.
  withdraw: {
    done: (email: string) => `The invitation to ${email} is withdrawn.`,
    closed:
      "This invitation was already closed, so there is nothing to withdraw. The page now shows the latest.",
    failed: "We could not withdraw the invitation. Try again.",
  },
  // [OWNER] drafts: the acceptance panel.
  accept: {
    heading: "An invitation for you",
    lede: "Someone you know invited you to share with them on Tidefern. Accepting adds you to their household. Nothing is shared either way until someone turns a category on.",
    action: "Accept the invitation",
    pending: "Accepting the invitation",
    joined: (name: string | null) =>
      name === null ? "You joined the household." : `You joined ${name}'s household.`,
    choice:
      "You already belong to a household. Accepting moves you into the new one and out of the one you are in now.",
    move: "Move to the new household",
    stay: "Stay where I am",
    stayed:
      "You stayed in your household. The invitation stays open until it expires, if you change your mind.",
    handOver:
      "You own a household that other people still belong to, so you cannot move out of it yet. You can stay where you are.",
    notOpen:
      "This invitation cannot be used. It may have expired or been withdrawn, or it was sent to another email address. Ask for a new one, and sign in with the address it was sent to.",
    incomplete: "This invitation link is not complete. Open the link in the email again.",
    failed: "We could not accept the invitation. Try again.",
  },
} as const;
