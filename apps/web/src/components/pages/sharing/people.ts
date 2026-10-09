import { todayIn } from "@tidefern/core";
import type { components, Me } from "@tidefern/api-client";
import {
  CURRENT_SHARING_DESCRIPTION_VERSION,
  SHARING_DESCRIPTIONS,
  type ShareCategory,
  type ShareLevel,
  type Stage,
} from "@tidefern/schemas/constants";
import type { InvitableRole } from "@tidefern/schemas";
import { relationText, sharingCopy as copy } from "./copy";

/**
 * The category names, from the catalog the switches read too (`grantCopy`
 * in grant-row.tsx is the same version). Read here rather than through
 * grant-row, a client module: this file runs in the server component.
 */
const categoryWords = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION].categories;

type SharingPerson = components["schemas"]["SharingPerson"];
type Invitation = components["schemas"]["Invitation"];

/** A child the actor can name: from GET /api/v1/children (a guardian's own, or one shared with her). */
export interface ChildName {
  id: string;
  displayName: string;
}

/** The categories about her own body a person can share, in the order the screen lists them. */
export const BODY_CATEGORIES = [
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "pregnancy.overview",
  "pregnancy.photos",
] as const satisfies readonly ShareCategory[];

/**
 * The categories a period start is a fact of. The reminder job tells a
 * grantee of one only through a grant in one of these that carries
 * `notify` (packages/api `reminders.ts`, `toldBy`).
 */
const PERIOD_CATEGORIES: readonly ShareCategory[] = ["cycle.status", "cycle.history"];

/**
 * The level turning a category on grants, the one the confirm step names.
 * Each CONTENT.md description says what the person would see, which is the
 * `read` level of the category; cycle status is a summary by nature (8.2:
 * "Period day 2", "fertile window"). Which levels a category offers, and
 * whether the confirm step offers a choice, is an owner input.
 */
export function offeredLevel(category: ShareCategory): ShareLevel {
  return category === "cycle.status" ? "summary" : "read";
}

/** One switch on a person's card. */
export interface GrantView {
  /** The category, or `child:<id>` for a child: unique on the card. */
  key: string;
  category: ShareCategory;
  childId?: string;
  childName?: string;
  on: boolean;
  /** The level the active grant holds, or null while it is off. */
  level: ShareLevel | null;
  /** The level turning it on grants. */
  offer: ShareLevel;
}

/** One thing a person shares with the actor, read-only on the actor's screen. */
export interface ReceivedView {
  key: string;
  label: string;
  level: ShareLevel;
}

/**
 * What removing a person does, by role (packages/api `endSharedMemberships`):
 * `member` when the actor owns the household the person is in (the person
 * leaves it), `owner` when the person owns it (the actor leaves), `grants`
 * otherwise (only the actor's grants end).
 */
export type Removal = "member" | "owner" | "grants";

/**
 * Whether the notify row shows, and whether it can be pressed: `hidden`;
 * `disabled`, off with no period category shared yet; `enabled`; or
 * `unsent`, on but carried by no period category, so nobody is told until
 * one is shared again. An `unsent` switch can still be turned off.
 */
export type NotifyMode = "hidden" | "disabled" | "enabled" | "unsent";

/**
 * Who can send an invitation from this page. `self`: the actor owns her
 * household, or belongs to none and her first invitation starts one.
 * `owner`: she is a member of a household someone else owns, which only
 * that owner can invite into (packages/api `ownedHousehold` refuses anyone
 * else with 409 `member_of_another_household`), so the page names the owner
 * instead of offering a form the API would refuse; `owner` is null while
 * she has no name yet.
 */
export type InviteRight = { by: "self" } | { by: "owner"; owner: string | null };

export interface PersonView {
  id: string;
  name: string;
  relation: string;
  /** The day the oldest grant still in force began, in the actor's zone; null before anything is shared. */
  since: string | null;
  /** The value `If-Match` sends (`SharingPerson.version`). */
  version: number;
  householdId: string | null;
  role: SharingPerson["role"];
  rows: GrantView[];
  notify: boolean;
  notifyMode: NotifyMode;
  removal: Removal;
  /** The children the actor guards that this person guards too, by name. */
  coGuardianOf: string[];
  received: ReceivedView[];
}

export interface InvitationView {
  id: string;
  email: string;
  role: InvitableRole;
  /** The day it was sent, in the actor's zone. */
  sentOn: string;
}

export interface SharingView {
  /** Today in the actor's zone, from GET /api/v1/me (never the server's or the browser's clock). */
  today: string | null;
  stage: Stage;
  people: PersonView[];
  invitations: InvitationView[];
  /** Whether the invite form is offered, or who alone can invite. */
  invite: InviteRight;
  /** Grants held from someone the people list does not name (outside every household the actor shares). */
  sharedWithYou: ReceivedView[];
  /** The owner's name for each household listed, so an acceptance can say whose household was joined. */
  householdOwners: Record<string, string>;
}

export interface SharingInput {
  me: Me;
  people: readonly SharingPerson[];
  invitations: readonly Invitation[];
  children: readonly ChildName[];
}

function personName(displayName: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : copy.unnamed;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "en-US");
}

/** A held or given grant's label: the category's own, or the child's name. */
function grantLabel(
  category: ShareCategory,
  childId: string | undefined,
  names: ReadonlyMap<string, string>,
): string {
  if (category === "child") return (childId && names.get(childId)) || categoryWords.child.label;
  return categoryWords[category].label;
}

function ordered<T extends { category: ShareCategory; label: string }>(items: T[]): T[] {
  const rank = (category: ShareCategory) => {
    const index = (BODY_CATEGORIES as readonly ShareCategory[]).indexOf(category);
    return index === -1 ? BODY_CATEGORIES.length : index;
  };
  return items.sort(
    (a, b) => rank(a.category) - rank(b.category) || a.label.localeCompare(b.label, "en-US"),
  );
}

/**
 * The switches on one person's card. A person with a body stage is offered
 * every category about her own body (DESIGN.md 3.7); a person whose stage is
 * `none` tracks nothing about herself, so she is offered none (architecture
 * 8.2, the `none` stage), but any grant still in force stays listed so it
 * can be turned off. Each child the actor guards gets one switch, except
 * for a person who already guards that child too: a co-guardian has full
 * rights, not a grant.
 */
function rowsFor(
  person: SharingPerson,
  stage: Stage,
  guardianOf: readonly string[],
  names: ReadonlyMap<string, string>,
): GrantView[] {
  const active = new Map(
    person.grants.map((grant) => [
      grant.category === "child" ? `child:${grant.childId ?? ""}` : grant.category,
      grant,
    ]),
  );
  const rows: (GrantView & { label: string })[] = [];
  const offered = new Set<string>();
  if (stage !== "none") for (const category of BODY_CATEGORIES) offered.add(category);
  for (const childId of guardianOf) {
    if (!person.guardianOf.includes(childId)) offered.add(`child:${childId}`);
  }
  for (const key of active.keys()) offered.add(key);
  for (const key of offered) {
    const grant = active.get(key);
    const category = (key.startsWith("child:") ? "child" : key) as ShareCategory;
    const childId = category === "child" ? key.slice("child:".length) : undefined;
    const label = grantLabel(category, childId, names);
    rows.push({
      key,
      category,
      ...(childId === undefined ? {} : { childId, childName: label }),
      on: grant !== undefined,
      level: grant?.level ?? null,
      offer: offeredLevel(category),
      label,
    });
  }
  return ordered(rows).map((row): GrantView => ({
    key: row.key,
    category: row.category,
    ...(row.childId === undefined ? {} : { childId: row.childId, childName: row.label }),
    on: row.on,
    level: row.level,
    offer: row.offer,
  }));
}

function notifyModeFor(person: SharingPerson, stage: Stage): NotifyMode {
  const period = person.grants.filter((grant) => PERIOD_CATEGORIES.includes(grant.category));
  // A switch that is on can always be turned off. It tells someone only through a period
  // category that carries it (the reminder job's rule); with none, the row says nothing goes out.
  if (person.notify) return period.some((grant) => grant.notify) ? "enabled" : "unsent";
  // "When my period starts" means nothing to someone who tracks no cycle right now.
  if (stage === "none" || stage === "pregnancy") return "hidden";
  // The API refuses the switch with nothing shared, and a notice needs a period category to mean anything.
  return period.length > 0 ? "enabled" : "disabled";
}

/**
 * Whether the actor can invite. Everyone in the household she belongs to is
 * listed with her role there (GET /api/v1/sharing), and a person belongs to
 * one household at most (architecture 8.3), so a listed owner means the
 * actor is a member who does not own it. A household left without an owner
 * (her account closed) lists none, so the form shows and the API's refusal
 * says the rest.
 */
function inviteRight(people: readonly SharingPerson[]): InviteRight {
  const owner = people.find((person) => person.householdId !== null && person.role === "owner");
  if (owner === undefined) return { by: "self" };
  const name = owner.displayName?.trim();
  return { by: "owner", owner: name ? name : null };
}

function removalFor(person: SharingPerson, people: readonly SharingPerson[]): Removal {
  if (person.householdId === null) return "grants";
  if (person.role === "owner") return "owner";
  // Everyone in a household the actor belongs to is listed, so when no one listed owns
  // the person's household, the actor does.
  const ownedByAnother = people.some(
    (other) => other.householdId === person.householdId && other.role === "owner",
  );
  return ownedByAnother ? "grants" : "member";
}

/** The day an instant falls on in the actor's zone (architecture 13.10: instants shown as days). */
function dayOf(instant: string, timeZone: string): string {
  return todayIn(timeZone, new Date(instant));
}

/**
 * Everything /sharing shows, built on the server from the API's answers:
 * GET /api/v1/me, /api/v1/sharing, /api/v1/sharing/invitations and
 * /api/v1/children. Only fields the API returned are used; nothing about a
 * person's rights is guessed. Dates are calendar days in the actor's zone.
 */
export function buildSharingView(input: SharingInput): SharingView {
  const { me } = input;
  const profile = me.profile;
  if (profile === null) throw new Error("buildSharingView needs a profile");
  const timeZone = profile.timeZone;
  const stage = profile.stage;
  const names = new Map(input.children.map((child) => [child.id, child.displayName]));
  const listed = new Set(input.people.map((person) => person.id));

  const receivedFrom = (ownerId: string): ReceivedView[] =>
    ordered(
      me.grants
        .filter((grant) => grant.ownerId === ownerId)
        .map((grant) => ({
          key: grant.id,
          category: grant.category,
          label: grantLabel(grant.category, grant.childId, names),
          level: grant.level,
        })),
    ).map(({ key, label, level }) => ({ key, label, level }));

  const people = input.people
    .map((person): PersonView => {
      const coGuardianOf = person.guardianOf
        .map((childId) => names.get(childId))
        .filter((name): name is string => name !== undefined)
        .sort((a, b) => a.localeCompare(b, "en-US"));
      const oldest = person.grants.map((grant) => grant.createdAt).sort()[0];
      return {
        id: person.id,
        name: personName(person.displayName),
        relation: relationText(person.role, coGuardianOf),
        since: oldest === undefined ? null : dayOf(oldest, timeZone),
        version: person.version,
        householdId: person.householdId,
        role: person.role,
        rows: rowsFor(person, stage, me.guardianOf, names),
        notify: person.notify,
        notifyMode: notifyModeFor(person, stage),
        removal: removalFor(person, input.people),
        coGuardianOf,
        received: receivedFrom(person.id),
      };
    })
    // Household members first, then everyone else, each by name.
    .sort(
      (a, b) => Number(a.householdId === null) - Number(b.householdId === null) || byName(a, b),
    );

  const sharedWithYou = ordered(
    me.grants
      .filter((grant) => !listed.has(grant.ownerId))
      .map((grant) => ({
        key: grant.id,
        category: grant.category,
        label: grantLabel(grant.category, grant.childId, names),
        level: grant.level,
      })),
  ).map(({ key, label, level }) => ({ key, label, level }));

  const householdOwners: Record<string, string> = {};
  for (const person of people) {
    if (person.householdId !== null && person.role === "owner") {
      householdOwners[person.householdId] = person.name;
    }
  }

  const invitations = [...input.invitations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((invitation) => ({
      id: invitation.id,
      email: invitation.inviteeEmail,
      role: invitation.role,
      sentOn: dayOf(invitation.createdAt, timeZone),
    }));

  return {
    today: me.today,
    stage,
    people,
    invitations,
    invite: inviteRight(input.people),
    sharedWithYou,
    householdOwners,
  };
}
