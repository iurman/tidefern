import "server-only";

import type { ApiClient } from "@tidefern/api-client";
import type { CycleEntry, CyclePrediction, Note } from "@tidefern/schemas";
import {
  calendarDaysFrom,
  type CalendarDay,
  type ChildFacts,
} from "@/components/pages/calendar/calendar-model";

/**
 * The calendar's reads, on the server client (architecture 5.2): the day
 * entries and the notes over the dates the page reads (`readRange`: the
 * grid's and a day either side), the prediction, and for the postpartum
 * card the children. The queries carry dates, a cursor and a
 * page size only (architecture 9.1). Only the fact that a note sits on a
 * day leaves this module; note bodies never reach the page.
 */

/** The largest page the list routes serve. */
const PAGE = 200;
/** A broken cursor can never loop: past this many pages the read counts as failed. */
const MAX_PAGES = 10;

interface Answer<T> {
  data?: T;
  response: Response;
}

/** The body of a 200, or null for any other answer or none at all. */
async function settle<T>(request: Promise<Answer<T>>): Promise<T | null> {
  try {
    const { data, response } = await request;
    return response.status === 200 && data !== undefined ? data : null;
  } catch {
    return null;
  }
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Every item of a paged list, or null when any page failed. */
async function everyPage<T>(
  read: (cursor: string | undefined) => Promise<Answer<Page<T>>>,
): Promise<T[] | null> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const list = await settle(read(cursor));
    if (list === null) return null;
    items.push(...list.items);
    if (list.nextCursor === null) return items;
    cursor = list.nextCursor;
  }
  return null;
}

export interface DateSpan {
  from: string;
  to: string;
}

function entriesBetween(client: ApiClient, span: DateSpan): Promise<CycleEntry[] | null> {
  return everyPage((cursor) =>
    client.GET("/api/v1/cycle/entries", {
      params: {
        query: { from: span.from, to: span.to, limit: PAGE, ...(cursor ? { cursor } : {}) },
      },
    }),
  );
}

function notesBetween(client: ApiClient, span: DateSpan): Promise<Note[] | null> {
  return everyPage((cursor) =>
    client.GET("/api/v1/notes", {
      params: {
        query: { from: span.from, to: span.to, limit: PAGE, ...(cursor ? { cursor } : {}) },
      },
    }),
  );
}

async function childrenOf(client: ApiClient): Promise<ChildFacts[] | null> {
  const list = await everyPage((cursor) =>
    client.GET("/api/v1/children", {
      params: { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    }),
  );
  return (
    list?.map((child) => ({
      id: child.id,
      displayName: child.displayName,
      dateOfBirth: child.dateOfBirth,
    })) ?? null
  );
}

export type CalendarLoad =
  | {
      ok: true;
      days: CalendarDay[];
      prediction: CyclePrediction;
      /** Null when not asked for, or when the read failed: the card then shows no age. */
      children: ChildFacts[] | null;
    }
  | { ok: false };

/**
 * Everything one render of the calendar needs, read at once. The entries,
 * the notes and the prediction are the page: if any of them fails, so does
 * the load. The children only add the age line to the postpartum card.
 */
export async function loadCalendar(
  client: ApiClient,
  span: DateSpan,
  options: { children: boolean },
): Promise<CalendarLoad> {
  const [entries, notes, prediction, children] = await Promise.all([
    entriesBetween(client, span),
    notesBetween(client, span),
    settle(client.GET("/api/v1/cycle/predictions")),
    options.children ? childrenOf(client) : Promise.resolve(null),
  ]);
  if (entries === null || notes === null || prediction === null) return { ok: false };
  return { ok: true, days: calendarDaysFrom(entries, notes), prediction, children };
}
