import { formatClock, formatTimeSince, minutesBetween } from "./format";
import type { ChildEvent } from "./types";

/**
 * The child card's numbers (DESIGN.md 3.6): the last feed, sleep and diaper
 * with the time since, and today's counts. Pure, so a test can feed it the
 * API's answers; the page passes the server's "now" and the API's today.
 */

/** When an event happened: its start, or when it was logged; the API's newest-first order reads the same. */
export function eventMoment(event: ChildEvent): string {
  return event.startedAt ?? event.createdAt;
}

/** A sleep with a start and no end is going on now (a sleep always has a start). */
export function isOngoingSleep(event: ChildEvent | null | undefined): boolean {
  return event?.kind === "sleep" && event.startedAt !== null && event.endedAt === null;
}

export interface FeedSummary {
  /** "2 h ago", or null when no feed was ever logged. */
  lastSince: string | null;
  today: number;
}

export interface SleepSummary {
  /** How long ago the last finished sleep ended, or null. */
  lastSince: string | null;
  /** The sleep going on now: its start as a time of day in the profile's zone. */
  ongoingSince: string | null;
  /** Minutes of the sleeps dated today that have ended. */
  todayMinutes: number;
  /** How many sleeps dated today have ended. */
  todayCount: number;
}

export interface DiaperSummary {
  lastSince: string | null;
  today: number;
  /** Wet and mixed diapers today: a mixed one is wet too. */
  wet: number;
  /** Dirty and mixed diapers today. */
  dirty: number;
  /** Whether any diaper today says what it held; without it the split is not shown. */
  known: boolean;
}

export interface DaySummary {
  feed: FeedSummary;
  sleep: SleepSummary;
  diaper: DiaperSummary;
}

export interface SummaryInput {
  /** The newest event of each kind (GET events, kind, order=desc, limit=1). */
  last: { feed: ChildEvent | null; sleep: ChildEvent | null; diaper: ChildEvent | null };
  /** Today's live events (GET events with from and to set to the API's today). */
  todayEvents: readonly ChildEvent[];
  today: string;
  timeZone: string;
  now: Date;
}

export function summarizeDay({
  last,
  todayEvents,
  today,
  timeZone,
  now,
}: SummaryInput): DaySummary {
  const todays = todayEvents.filter((event) => event.date === today);
  const feeds = todays.filter((event) => event.kind === "feed");
  const sleeps = todays.filter(
    (event) => event.kind === "sleep" && event.startedAt !== null && event.endedAt !== null,
  );
  const diapers = todays.filter((event) => event.kind === "diaper");
  const contents = diapers.map((event) => event.diaperContents);

  const ongoing = last.sleep !== null && isOngoingSleep(last.sleep) ? last.sleep : null;
  const lastEnd = last.sleep?.endedAt ?? null;

  return {
    feed: {
      lastSince: last.feed === null ? null : formatTimeSince(eventMoment(last.feed), now),
      today: feeds.length,
    },
    sleep: {
      lastSince: ongoing === null && lastEnd !== null ? formatTimeSince(lastEnd, now) : null,
      ongoingSince:
        ongoing === null || ongoing.startedAt === null
          ? null
          : formatClock(ongoing.startedAt, timeZone),
      todayMinutes: sleeps.reduce(
        (sum, event) => sum + minutesBetween(event.startedAt as string, event.endedAt as string),
        0,
      ),
      todayCount: sleeps.length,
    },
    diaper: {
      lastSince: last.diaper === null ? null : formatTimeSince(eventMoment(last.diaper), now),
      today: diapers.length,
      wet: contents.filter((held) => held === "wet" || held === "mixed").length,
      dirty: contents.filter((held) => held === "dirty" || held === "mixed").length,
      known: contents.some((held) => held !== null),
    },
  };
}
