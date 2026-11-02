import type { Me, components } from "@tidefern/api-client";
import { addDays, compareDates, diffDays, todayIn } from "@tidefern/core";
import { formatChildAge } from "@/lib/child-age";
import { journeyCopy as copy, kindName, type EventKind } from "./copy";
import { countedToday, pregnancyStart, weekByWeek, type WeekByWeek } from "./weeks";

/**
 * What /journey shows, decided from what the API answered and nothing
 * else (architecture 8.2 to 8.4). The page reads; this module chooses the
 * view and shapes the rows, so every rule below has a unit test and no
 * component guesses a grantee's rights: a grantee sees exactly the fields
 * the API returned at the level her grant holds, a paused pregnancy is the
 * neutral card with no week or dates, and the reason an ending happened is
 * never read here at all, even for her.
 */

type Schemas = components["schemas"];
export type Pregnancy = Schemas["Pregnancy"];
export type PregnancyOverview = Schemas["PregnancyOverview"];
export type PregnancyEvent = Schemas["PregnancyEvent"];
export type DueDateChange = Schemas["DueDateChange"];
export type Child = Schemas["Child"];
export type SharingPerson = Schemas["SharingPerson"];
export type DatingMethod = Schemas["DatingMethod"];
export type PredictionBasis = Schemas["CyclePrediction"]["basis"];
export type GrantLevel = Schemas["HeldGrant"]["level"];

/** One read: what it answered, or that it failed. */
export type Read<T> = { ok: true; value: T } | { ok: false };

/** Her own most recent pregnancy, and the reads that depend on what it is. */
export type OwnRead =
  | { kind: "failed" }
  | {
      kind: "none";
      /** Read only for the postpartum stage without a record. */
      children?: Read<Child[]>;
      basis?: Read<PredictionBasis>;
    }
  | {
      kind: "active";
      pregnancy: Pregnancy;
      events: Read<PregnancyEvent[]>;
      history: Read<DueDateChange[]>;
    }
  | {
      kind: "ended";
      pregnancy: Pregnancy;
      /** Read only for the postpartum stage. */
      children?: Read<Child[]>;
      basis: Read<PredictionBasis>;
    };

/** A pregnancy someone shares with her through a `pregnancy.overview` grant. */
export type SharedRead = { ownerId: string; level: GrantLevel } & (
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "paused" }
  | { kind: "active"; pregnancy: PregnancyOverview; events: Read<PregnancyEvent[]> }
);

export interface JourneyReads {
  own: OwnRead;
  shared: SharedRead[];
  /** The household and grant list (GET /v1/sharing), for names; null when it was not needed. */
  people: Read<SharingPerson[]> | null;
}

/** One appointment or milestone as a row of the week list. */
export interface EventRow {
  id: string;
  kind: EventKind;
  date: string;
  version: number;
  /** The decrypted text as the API sent it, for the edit form; null when absent or not sent. */
  detail: string | null;
  /** The row's title: the detail when there is one, else the kind's name. */
  title: string;
  /** The line under the title: the kind when the title is the detail, and who added it when that is someone else. */
  note: string | null;
  /** A day after today: drawn outlined and dashed with the word "Expected". */
  expected: boolean;
}

export interface ActivePregnancy {
  id: string;
  dueDate: string;
  /** Today in the subject's zone as the API counted it. */
  today: string;
  /** Day 0, the earliest day an ending may carry. */
  start: string;
  /** Hers only: a grantee is never sent the method. */
  method?: DatingMethod;
  /** Null when the events could not be read. */
  weeks: WeekByWeek<EventRow> | null;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface HistoryRow {
  id: string;
  /** The calendar day of the change in her zone. */
  changedOn: string;
  from: string;
  to: string;
  method: DatingMethod;
}

export interface ChildAge {
  name: string;
  age: string;
}

export type OwnView =
  | { kind: "failed" }
  | {
      kind: "active";
      pregnancy: ActivePregnancy;
      history: Read<HistoryRow[]>;
      /** Who sees her pregnancy overview, by name; null when someone's name is unknown. */
      sharedWith: string[] | null;
    }
  | {
      kind: "postpartum";
      child: ChildAge | null;
      childrenFailed: boolean;
      /** True only when the API says no prediction is offered yet; the paused card says so. */
      predictionsPaused: boolean;
    }
  | { kind: "after-ending"; predictionsPaused: boolean }
  | { kind: "empty" }
  | { kind: "nothing-shared" };

export type SharedView = { ownerId: string; name: string | null } & (
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "paused" }
  | { kind: "active"; pregnancy: ActivePregnancy; highlight: boolean }
);

export interface JourneyView {
  /** Today in her zone, from GET /v1/me. */
  today: string;
  /** Her own section; null when only what others share has a place here. */
  own: OwnView | null;
  shared: SharedView[];
}

const ok = <T>(value: T): Read<T> => ({ ok: true, value });

/** Each person's name by id, from the sharing list; empty when it failed or was not read. */
export function namesById(people: Read<SharingPerson[]> | null): Map<string, string | null> {
  const names = new Map<string, string | null>();
  if (people === null || !people.ok) return names;
  for (const person of people.value) names.set(person.id, person.displayName);
  return names;
}

/** The people she shares her pregnancy overview with, by name; null when a name is unknown. */
export function overviewGrantees(people: Read<SharingPerson[]> | null): string[] | null {
  if (people === null || !people.ok) return null;
  const holders = people.value.filter((person) =>
    person.grants.some((grant) => grant.category === "pregnancy.overview"),
  );
  const names = holders.map((person) => person.displayName);
  return names.every((name): name is string => typeof name === "string" && name.length > 0)
    ? names
    : null;
}

/**
 * One event as a row. The title is the detail she or a contributor wrote,
 * or the kind's name when there is none (and always for a summary grantee,
 * who is sent neither the detail nor the author). The note names the kind
 * under a detail, and who added it when that was someone other than the
 * pregnancy's subject.
 */
export function eventRow(
  event: PregnancyEvent,
  context: { viewerId: string; today: string; names: Map<string, string | null> },
): EventRow {
  const detail =
    typeof event.detail === "string" && event.detail.trim() !== "" ? event.detail : null;
  const kind = kindName(event.kind);
  let addedBy: string | null = null;
  const authorId = event.authorId;
  if (typeof authorId === "string" && authorId !== event.subjectId) {
    addedBy =
      authorId === context.viewerId ? copy.weeks.you : (context.names.get(authorId) ?? null);
  }
  return {
    id: event.id,
    kind: event.kind,
    date: event.date,
    version: event.version,
    detail,
    title: detail ?? kind,
    note: copy.weeks.note(detail === null ? null : kind, addedBy || null),
    expected: compareDates(event.date, context.today) > 0,
  };
}

function activePregnancy(
  pregnancy: { id: string; dueDate: string },
  today: string,
  events: Read<PregnancyEvent[]>,
  rights: { canAdd: boolean; canEdit: boolean; canDelete: boolean; method?: DatingMethod },
  context: { viewerId: string; names: Map<string, string | null> },
): ActivePregnancy {
  const rows = events.ok
    ? events.value.map((event) => eventRow(event, { ...context, today }))
    : null;
  return {
    id: pregnancy.id,
    dueDate: pregnancy.dueDate,
    today,
    start: pregnancyStart(pregnancy.dueDate),
    ...(rights.method === undefined ? {} : { method: rights.method }),
    weeks: rows === null ? null : weekByWeek(pregnancy.dueDate, today, rows),
    canAdd: rights.canAdd,
    canEdit: rights.canEdit,
    canDelete: rights.canDelete,
  };
}

/** The due date changes, oldest first, each dated by the day it happened in her zone. */
export function historyRows(changes: readonly DueDateChange[], timeZone: string): HistoryRow[] {
  return changes.map((change) => ({
    id: change.id,
    changedOn: todayIn(timeZone, new Date(change.changedAt)),
    from: change.previousDueDate,
    to: change.nextDueDate,
    method: change.method,
  }));
}

/**
 * How far a child's date of birth may sit from the recorded ending and still
 * be this birth's child: the ending is a calendar day in her zone and the
 * child's date of birth is typed separately, so a birth near midnight or
 * across a zone can land a day or two apart.
 */
export const BIRTH_SLACK_DAYS = 2;

/**
 * With no ending on record (the postpartum stage chosen without one), the
 * oldest a guarded child may be to stand as this birth's child. Postpartum
 * has no fixed length (it lasts until her first logged period), so this is
 * a bound against naming an older sibling, not a medical window.
 */
export const NEWBORN_MAX_DAYS = 365;

/**
 * The child whose age the postpartum view shows: one she guards born on
 * the day the pregnancy ended, else the youngest she guards born within
 * `BIRTH_SLACK_DAYS` of it (or, with no ending on record, younger than
 * `NEWBORN_MAX_DAYS`). An older sibling is never this birth's child: with
 * none found the view leaves the child line out.
 */
export function birthChild(
  children: readonly Child[],
  guardianOf: readonly string[],
  endedAt: string | null,
  today: string,
): Child | null {
  const guarded = children.filter(
    (child) => guardianOf.includes(child.id) && compareDates(child.dateOfBirth, today) <= 0,
  );
  const exact =
    endedAt === null ? undefined : guarded.find((child) => child.dateOfBirth === endedAt);
  if (exact !== undefined) return exact;
  const near = guarded.filter((child) =>
    endedAt === null
      ? compareDates(child.dateOfBirth, addDays(today, -NEWBORN_MAX_DAYS)) > 0
      : Math.abs(diffDays(endedAt, child.dateOfBirth)) <= BIRTH_SLACK_DAYS,
  );
  const youngest = [...near].sort((a, b) => compareDates(b.dateOfBirth, a.dateOfBirth))[0];
  return youngest ?? null;
}

function postpartumView(
  me: Me,
  today: string,
  endedAt: string | null,
  children: Read<Child[]> | undefined,
  basis: Read<PredictionBasis> | undefined,
): OwnView {
  const found =
    children !== undefined && children.ok
      ? birthChild(children.value, me.guardianOf, endedAt, today)
      : null;
  return {
    kind: "postpartum",
    child:
      found === null
        ? null
        : { name: found.displayName, age: formatChildAge(found.dateOfBirth, today) },
    childrenFailed: children !== undefined && !children.ok,
    predictionsPaused: basis !== undefined && basis.ok && basis.value === "none",
  };
}

function ownView(me: Me, today: string, reads: JourneyReads): OwnView | null {
  const stage = me.profile?.stage ?? "none";
  const own = reads.own;
  switch (own.kind) {
    case "failed":
      return { kind: "failed" };
    case "active": {
      const names = namesById(reads.people);
      // Her own today from GET /v1/me: the zone and the calendar clock the API counted her week with.
      const pregnancy = activePregnancy(
        own.pregnancy,
        today,
        own.events,
        {
          canAdd: true,
          canEdit: true,
          canDelete: true,
          method: own.pregnancy.datingMethod,
        },
        { viewerId: me.id, names },
      );
      return {
        kind: "active",
        pregnancy,
        history: own.history.ok
          ? ok(historyRows(own.history.value, me.profile?.timeZone ?? "UTC"))
          : { ok: false },
        sharedWith: overviewGrantees(reads.people),
      };
    }
    case "ended":
      if (stage === "postpartum") {
        return postpartumView(me, today, own.pregnancy.endedAt, own.children, own.basis);
      }
      return {
        kind: "after-ending",
        predictionsPaused: own.basis.ok && own.basis.value === "none",
      };
    case "none":
      if (stage === "postpartum") return postpartumView(me, today, null, own.children, own.basis);
      // What others share is the page then; an empty state above it would only be noise.
      if (reads.shared.length > 0) return null;
      return stage === "none" ? { kind: "nothing-shared" } : { kind: "empty" };
  }
}

/**
 * The page's view: her own section, then each pregnancy shared with her.
 * Warmth stays on one card per screen (architecture 13.6, move 5): her own
 * current week when she has one, else the first shared one.
 */
export function journeyView(me: Me, today: string, reads: JourneyReads): JourneyView {
  const own = ownView(me, today, reads);
  const names = namesById(reads.people);
  let warmthTaken = own?.kind === "active";
  const shared = reads.shared.map((read): SharedView => {
    const name = names.get(read.ownerId) ?? null;
    const base = { ownerId: read.ownerId, name };
    if (read.kind !== "active") return { ...base, kind: read.kind };
    const contribute = read.level === "contribute";
    // The subject's zone can differ from hers: count from the gestation the API sent.
    const pregnancy = activePregnancy(
      read.pregnancy,
      countedToday(read.pregnancy.dueDate, read.pregnancy.gestation.totalDays),
      read.events,
      { canAdd: contribute, canEdit: contribute, canDelete: false },
      { viewerId: me.id, names },
    );
    const highlight = !warmthTaken;
    warmthTaken = true;
    return { ...base, kind: "active", pregnancy, highlight };
  });
  return { today, own, shared };
}
