import type { components } from "@tidefern/api-client";
import { todayIn, type CalendarDate } from "@tidefern/core";
import { grantCopy } from "@/components/ui/grant-row";
import { formatDay } from "@/components/ui/marks-format";
import { activityCopy as copy } from "./copy";

export type ActivityEvent = components["schemas"]["ActivityEvent"];
export type ActivityPage = components["schemas"]["ActivityPage"];
type Category = NonNullable<ActivityEvent["category"]>;

/**
 * The audit vocabulary the rows have words for: the names the API and the
 * session hooks write (`auditActions`, architecture 8.3 step 6). The
 * contract types `action` as an open dotted string, so a name added later
 * reads as the neutral line until it gets its own words here; a unit test
 * compares this list with the vocabulary's source.
 */
export const ACTIVITY_ACTIONS = [
  "session.sign_in",
  "session.revoke",
  "grant.create",
  "grant.update",
  "grant.revoke",
  "partner.read",
  "partner.write",
  "note.share",
  "invitation.create",
  "invitation.withdraw",
  "invitation.accept",
  "export.create",
  "account.close",
  "account.close.undo",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** What the rows are read against: who is looking, and what the page could learn without leaving a trace. */
export interface ActivityContext {
  /** The viewer: her own rows read "by you" and her records "your". */
  me: string;
  /**
   * Display names by id, read without writing an audit row: the people
   * GET /v1/sharing lists and the children she guards. Anyone else is
   * named by the neutral fallback.
   */
  names: Readonly<Record<string, string>>;
  /** The children she guards (GET /v1/me): only these are ever named, and their sharing is hers. */
  guardianOf: readonly string[];
  /** Her profile's IANA zone, in which every row's day is read. */
  timeZone: string;
  /** Today on the API's calendar clock (GET /v1/me), so an older row can carry its year. */
  today: CalendarDate;
}

/** What happened and who did it, in plain words. */
export interface ActivityLine {
  what: string;
  who: string;
}

/** One row as the list draws it. */
export interface ActivityRow extends ActivityLine {
  id: string;
  /** The day it happened in her zone, YYYY-MM-DD. */
  day: CalendarDate;
  /** "Oct 4" */
  dayLabel: string;
  /** The year, when the day falls in another year than today; otherwise null. */
  year: string | null;
}

function known(action: string): action is ActivityAction {
  return (ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

/** A category by its label in the sharing descriptions, in lower case: a label, never a fact. */
function categoryLabel(category: Category | undefined): string {
  if (category === "journal.private") return copy.privateNotes;
  if (category === undefined || category === "child") return copy.otherRecords;
  const entry = (grantCopy as Partial<Record<string, { label: string }>>)[category];
  return entry === undefined ? copy.otherRecords : entry.label.toLowerCase();
}

/** The child a row is about, when it is about a child. */
function childOf(event: ActivityEvent): string | undefined {
  if (event.childId !== undefined) return event.childId;
  return event.category === "child" ? event.subjectId : undefined;
}

/**
 * Whose records the row is about. A child is named only when she guards
 * the child; a grantee could learn the name only from a read that is
 * itself audited, so the page never asks and the row says "a child's".
 */
function placeOf(event: ActivityEvent, context: ActivityContext): string {
  const child = childOf(event);
  if (child !== undefined) {
    const name = context.guardianOf.includes(child) ? context.names[child] : undefined;
    return name === undefined ? copy.place.someChild : copy.place.child(name);
  }
  const label = categoryLabel(event.category);
  if (event.subjectId === context.me) return copy.place.yours(label);
  const owner = context.names[event.subjectId];
  return owner === undefined ? copy.place.someone(label) : copy.place.named(owner, label);
}

/**
 * Whether the sharing in a grant row was the viewer's own to give: her
 * records, or a child she guards. Otherwise the row is access ending for
 * the person who held it, which a grantee's account closure or consent
 * withdrawal writes in her own name.
 */
function sharingIsHers(event: ActivityEvent, context: ActivityContext): boolean {
  if (event.actorId !== context.me) return false;
  const child = childOf(event);
  return child === undefined ? event.subjectId === context.me : context.guardianOf.includes(child);
}

function whatHappened(event: ActivityEvent, context: ActivityContext): string {
  if (!known(event.action)) return copy.what.other;
  switch (event.action) {
    case "session.sign_in":
      return copy.what.signedIn;
    case "session.revoke":
      return copy.what.signedOutElsewhere;
    case "grant.create":
      return copy.what.startedSharing(placeOf(event, context));
    case "grant.update":
      return copy.what.changedSharing(placeOf(event, context));
    case "grant.revoke":
      return sharingIsHers(event, context)
        ? copy.what.stoppedSharing(placeOf(event, context))
        : copy.what.endedAccess(placeOf(event, context));
    case "partner.read":
      return copy.what.viewed(placeOf(event, context));
    case "partner.write":
      return copy.what.contributed(placeOf(event, context));
    case "note.share":
      // A note is shared into a category others can be granted; the private journal never is.
      return event.category === undefined || event.category === "journal.private"
        ? copy.what.other
        : copy.what.sharedNote(placeOf(event, context));
    case "invitation.create":
      return copy.what.invitationSent;
    case "invitation.withdraw":
      return copy.what.invitationWithdrawn;
    case "invitation.accept":
      return copy.what.invitationAccepted;
    case "export.create":
      return copy.what.exported;
    case "account.close":
      return copy.what.closeRequested;
    case "account.close.undo":
      return copy.what.closeCancelled;
  }
}

function whoDidIt(event: ActivityEvent, context: ActivityContext): string {
  if (event.actorId === context.me) return copy.who.you;
  const name = context.names[event.actorId];
  return name === undefined ? copy.who.someone : copy.who.named(name);
}

/**
 * The sentence map over the audit vocabulary: what happened and who did
 * it. The viewer is "you"; another person goes by the display name the
 * page read, or by the neutral fallback when she is no longer listed (a
 * removed partner) or has no name; an unknown action reads as a neutral
 * line and never as its code.
 */
export function describeActivity(event: ActivityEvent, context: ActivityContext): ActivityLine {
  return { what: whatHappened(event, context), who: whoDidIt(event, context) };
}

/** The calendar day an instant falls on in the profile's zone, never the device's. */
export function activityDay(occurredAt: string, timeZone: string): CalendarDate {
  return todayIn(timeZone, new Date(occurredAt));
}

/** One row: the day in her zone, its year when that is not this year, and the sentence. */
export function activityRow(event: ActivityEvent, context: ActivityContext): ActivityRow {
  const day = activityDay(event.occurredAt, context.timeZone);
  const year = day.slice(0, 4);
  return {
    id: event.id,
    day,
    dayLabel: formatDay(day),
    year: year === context.today.slice(0, 4) ? null : year,
    ...describeActivity(event, context),
  };
}
