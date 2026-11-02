import type { ApiClient, Me } from "@tidefern/api-client";
import { childAccess, type ChildAccess } from "./roles";
import { summarizeDay, type DaySummary, isOngoingSleep } from "./summary";
import {
  isLiveEvent,
  type Child,
  type ChildEvent,
  type ChildMeasurement,
  type MilestoneChecklist,
  type SharingPerson,
} from "./types";

/**
 * The family screens' reads over the typed client (architecture 5.2): the
 * server passes `serverApiClient(...)`, which calls the API in process with
 * the visitor's cookie, and each result says plainly whether it arrived, so
 * a page shows exactly what the API returned and says so when it did not.
 * Every query is the contract's own shape (ids, dates, a kind, a direction);
 * nothing about a child travels in a query string.
 */

/** One request's status and body; a request that never got an answer is status 0. */
async function answer<T>(
  request: Promise<{ data?: T; response: Response }>,
): Promise<{ status: number; data: T | undefined }> {
  try {
    const { data, response } = await request;
    return { status: response.status, data };
  } catch {
    return { status: 0, data: undefined };
  }
}

/** Ids the API takes in a path; anything else would only earn a 422. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChildId(value: string): boolean {
  return UUID.test(value);
}

/** The names of a child's guardians: "you" first, then the others by name, null for one with no name. */
export function guardianNames(
  guardians: readonly string[],
  meId: string,
  people: readonly SharingPerson[],
): (string | null)[] {
  const names = new Map(people.map((person) => [person.id, person.displayName]));
  const others = guardians.filter((id) => id !== meId).map((id) => names.get(id) ?? null);
  return guardians.includes(meId) ? ["you", ...others] : others;
}

/** The newest event of a kind, from GET events with `order=desc&limit=1`; undefined when the read failed. */
async function lastOf(
  client: ApiClient,
  childId: string,
  kind: "feed" | "sleep" | "diaper",
): Promise<ChildEvent | null | undefined> {
  const read = await answer(
    client.GET("/api/v1/children/{id}/events", {
      params: { path: { id: childId }, query: { kind, order: "desc", limit: 1 } },
    }),
  );
  if (read.status !== 200 || read.data === undefined) return undefined;
  return read.data.items.find(isLiveEvent) ?? null;
}

/** Today's live events for a child; undefined when the read failed. */
async function eventsOn(
  client: ApiClient,
  childId: string,
  day: string,
): Promise<ChildEvent[] | undefined> {
  const read = await answer(
    client.GET("/api/v1/children/{id}/events", {
      params: { path: { id: childId }, query: { from: day, to: day, limit: 200 } },
    }),
  );
  if (read.status !== 200 || read.data === undefined) return undefined;
  return read.data.items.filter(isLiveEvent);
}

export interface ChildDay {
  summary: DaySummary;
  /** The sleep going on now, which the Sleep control ends instead of starting another. */
  ongoingSleep: ChildEvent | null;
}

export interface FamilyCard {
  child: Child;
  access: ChildAccess;
  /** Guardians by name (the actor as "you"), only on a guardian's answer; null for a grantee. */
  guardians: (string | null)[] | null;
  /** Null for a summary grantee, whose grant reaches no records; "failed" when a read failed. */
  day: ChildDay | "failed" | null;
}

export type FamilyLoad = { kind: "ok"; cards: FamilyCard[] } | { kind: "failed" };

async function loadDay(
  client: ApiClient,
  childId: string,
  context: { today: string; timeZone: string; now: Date },
): Promise<ChildDay | "failed"> {
  const [feed, sleep, diaper, todayEvents] = await Promise.all([
    lastOf(client, childId, "feed"),
    lastOf(client, childId, "sleep"),
    lastOf(client, childId, "diaper"),
    eventsOn(client, childId, context.today),
  ]);
  if (feed === undefined || sleep === undefined || diaper === undefined) return "failed";
  if (todayEvents === undefined) return "failed";
  return {
    summary: summarizeDay({ last: { feed, sleep, diaper }, todayEvents, ...context }),
    ongoingSleep: sleep !== null && isOngoingSleep(sleep) ? sleep : null,
  };
}

/** Every child she can reach, through as many pages as the list has. */
async function allChildren(client: ApiClient): Promise<Child[] | undefined> {
  const children: Child[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const read = await answer(
      client.GET("/api/v1/children", {
        params: { query: cursor === undefined ? { limit: 200 } : { limit: 200, cursor } },
      }),
    );
    if (read.status !== 200 || read.data === undefined) return undefined;
    children.push(...read.data.items);
    if (read.data.nextCursor === null) return children;
    cursor = read.data.nextCursor;
  }
  return children;
}

/** The people she shares with, for her co-guardians' names; empty when the read failed. */
async function people(client: ApiClient): Promise<SharingPerson[]> {
  const read = await answer(client.GET("/api/v1/sharing", { params: { query: { limit: 200 } } }));
  return read.status === 200 && read.data !== undefined ? read.data.items : [];
}

/** Youngest first: the newest arrival is the one most logged for, and the card on warmth. */
export function byYoungest(a: Child, b: Child): number {
  if (a.dateOfBirth !== b.dateOfBirth) return a.dateOfBirth < b.dateOfBirth ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}

/**
 * /family: every child she can reach (GET /v1/children: guarded children and
 * child grants at any level), each with what her access lets the page show.
 * `today` is the API's (GET /v1/me) and `now` the server's clock, read once
 * per render for the times since.
 */
export async function loadFamily(
  client: ApiClient,
  me: Me,
  context: { today: string; timeZone: string; now: Date },
): Promise<FamilyLoad> {
  const children = await allChildren(client);
  if (children === undefined) return { kind: "failed" };
  const guarded = children.some((child) => child.guardians !== undefined);
  const known = guarded ? await people(client) : [];
  const cards: FamilyCard[] = [];
  for (const child of [...children].sort(byYoungest)) {
    // The API listed it, so it is reachable; a missing scope can only mean the session read is older.
    const access = childAccess(me, child.id) ?? {
      role: "summary" as const,
      canRead: false,
      canWrite: false,
      canDelete: false,
    };
    cards.push({
      child,
      access,
      guardians:
        child.guardians === undefined ? null : guardianNames(child.guardians, me.id, known),
      day: access.canRead ? await loadDay(client, child.id, context) : null,
    });
  }
  return { kind: "ok", cards };
}

export interface ChildRecords {
  /** Newest first, as the timeline shows them. */
  events: { items: ChildEvent[]; nextCursor: string | null } | "failed";
  /** Oldest first, as the chart reads them. */
  measurements: ChildMeasurement[] | "failed";
  checklist: MilestoneChecklist | "failed";
}

export type ChildPageLoad =
  | {
      kind: "ok";
      child: Child;
      access: ChildAccess;
      /** Null for a summary grantee: events, measurements and milestones answer her 404. */
      records: ChildRecords | null;
    }
  | { kind: "notFound" }
  | { kind: "failed" };

/** How many events the timeline reads at a time. */
export const TIMELINE_PAGE = 50;

/** One page of events, newest first, from a cursor or the start. */
export async function timelinePage(
  client: ApiClient,
  childId: string,
  cursor?: string,
): Promise<{ items: ChildEvent[]; nextCursor: string | null } | "failed"> {
  const query =
    cursor === undefined
      ? { order: "desc" as const, limit: TIMELINE_PAGE }
      : { order: "desc" as const, limit: TIMELINE_PAGE, cursor };
  const read = await answer(
    client.GET("/api/v1/children/{id}/events", { params: { path: { id: childId }, query } }),
  );
  if (read.status !== 200 || read.data === undefined) return "failed";
  return { items: read.data.items.filter(isLiveEvent), nextCursor: read.data.nextCursor };
}

async function allMeasurements(
  client: ApiClient,
  childId: string,
): Promise<ChildMeasurement[] | "failed"> {
  const items: ChildMeasurement[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const read = await answer(
      client.GET("/api/v1/children/{id}/measurements", {
        params: {
          path: { id: childId },
          query: cursor === undefined ? { limit: 200 } : { limit: 200, cursor },
        },
      }),
    );
    if (read.status !== 200 || read.data === undefined) return "failed";
    items.push(...read.data.items);
    if (read.data.nextCursor === null) return items;
    cursor = read.data.nextCursor;
  }
  return items;
}

async function checklistFor(
  client: ApiClient,
  childId: string,
): Promise<MilestoneChecklist | "failed"> {
  const read = await answer(
    client.GET("/api/v1/children/{id}/milestones", { params: { path: { id: childId } } }),
  );
  return read.status === 200 && read.data !== undefined ? read.data : "failed";
}

/**
 * /family/[childId]: the child, then her records when her access reaches
 * them. An id that is not one, or a child she cannot reach, is not found: the
 * API answers 422 or 404, and the page calls `notFound()` for both, so the
 * answer never says whether such a child exists.
 */
export async function loadChildPage(
  client: ApiClient,
  me: Me,
  childId: string,
): Promise<ChildPageLoad> {
  if (!isChildId(childId)) return { kind: "notFound" };
  const read = await answer(
    client.GET("/api/v1/children/{id}", { params: { path: { id: childId } } }),
  );
  if (read.status === 404 || read.status === 422) return { kind: "notFound" };
  if (read.status !== 200 || read.data === undefined) return { kind: "failed" };
  const access = childAccess(me, childId) ?? {
    role: "summary" as const,
    canRead: false,
    canWrite: false,
    canDelete: false,
  };
  if (!access.canRead) return { kind: "ok", child: read.data, access, records: null };
  const [events, measurements, checklist] = await Promise.all([
    timelinePage(client, childId),
    allMeasurements(client, childId),
    checklistFor(client, childId),
  ]);
  return { kind: "ok", child: read.data, access, records: { events, measurements, checklist } };
}
