import type { ApiClient, Me } from "@tidefern/api-client";
import { addDays, compareDates } from "@tidefern/core";
import { isPeriodFlow } from "@tidefern/schemas/constants";
import type {
  Child,
  CycleEntry,
  CyclePrediction,
  CycleStatus,
  DatingMethod,
  Pregnancy,
  PregnancyOverview,
  PregnancyPaused,
  SharingPerson,
  Stage,
} from "@tidefern/schemas";
import { startOfWeek, type WeekStart } from "@/components/ui/calendar-dates";
import { latestStartFrom } from "@/components/ui/cycle-ring";
import { formatChildAge } from "@/lib/child-age";
import { isLoggingStage, loadDay, type DayState, type LoggingStage } from "@/lib/day-log";

/**
 * Everything Today shows, read through the API (architecture 5.2) and
 * shaped per stage before anything renders, so the page is a function of
 * this view and the rules below are unit tested over a canned fetch.
 *
 * - Cycle: the API's prediction (GET /v1/cycle/predictions) and today's
 *   status (GET /v1/cycle/status) place the ring; the period days since the
 *   latest start and in this week come from GET /v1/cycle/entries. A basis
 *   of `none` is the empty state, or the quiet card when a pregnancy is on
 *   record (GET /v1/pregnancies/current), because the status counts through
 *   a pregnancy and would show a cycle day the prediction does not have.
 * - Postpartum: the quiet card and the child's age until a period is
 *   logged after the birth, then the cycle view again (architecture 8.4,
 *   rule 4), with the deviation nudge held back (RESEARCH.md decision 7).
 *   The child is the guarded child born on the pregnancy's end date, else
 *   the youngest guarded child (`pickChild`).
 * - Pregnancy: the week card from her own open pregnancy.
 * - None: what others share with this person (a status, a pregnancy
 *   overview, a child), never a body question and never a day to log.
 *
 * Each read answers on its own: a part that failed says so in its place and
 * the rest still renders. Today is the API's (`me.today`), never a clock.
 */

/** One read's answer: the value, or a failure the page says honestly in its place. */
export type Part<T> = { ok: true; value: T } | { ok: false };

const failed: Part<never> = { ok: false };

function ok<T>(value: T): Part<T> {
  return { ok: true, value };
}

export type MeProfile = NonNullable<Me["profile"]>;

/** A signed-in person with a profile, and today in its time zone from GET /v1/me. */
export interface TodaySession {
  me: Me;
  profile: MeProfile;
  today: string;
}

export interface DaySpan {
  start: string;
  end: string;
}

/** This week's period days in words: logged, the next period's band, the fertile days. */
export interface WeekLines {
  /** The logged period runs that touch the week, first day to last. */
  logged: DaySpan | null;
  /** The API's band for the next start, when it touches the week. */
  nextPeriod: DaySpan | null;
  /** The API's fertile window, when it touches the week. */
  fertile: DaySpan | null;
}

export interface ChildAge {
  id: string;
  name: string;
  /** `formatChildAge`, the one wording every screen uses. */
  age: string;
}

/** One person whose records this person sees a summary of. */
export interface SharedPerson {
  ownerId: string;
  /**
   * From GET /v1/sharing: the name, null when the person is not listed there
   * or has no name, or a failure when that read failed, which the card says.
   */
  name: Part<string | null>;
  /** Held through a `cycle.status` grant; null when there is no such grant. */
  status: Part<CycleStatus | null> | null;
  /** Held through a `pregnancy.overview` grant; null when there is no such grant. */
  pregnancy: Part<PregnancyOverview | PregnancyPaused | null> | null;
}

export type Hero =
  | {
      kind: "cycle";
      prediction: CyclePrediction;
      /** From the status; null when the API could place no cycle day. */
      cycleDay: number | null;
      latestStart: string | null;
      /** The logged period days since the latest start, for the ring's solid arc. */
      loggedDays: string[];
      week: WeekLines;
      /** The deviation nudge may show: the cycle stage only (RESEARCH.md decision 7). */
      nudge: boolean;
    }
  | { kind: "empty" }
  | { kind: "quiet"; feeding: boolean }
  | { kind: "pregnancy"; pregnancy: Part<{ dueDate: string; method: DatingMethod } | null> }
  | { kind: "shared"; people: SharedPerson[]; children: Part<ChildAge[]> }
  | { kind: "failed" };

/** What the read-only partner card draws: who sees what, from the actor's own grants. */
export interface PartnersData {
  /** People with at least one grant from her or a child they guard with her. */
  people: SharingPerson[];
  /** Child names by id, for child grants and shared guardianship. */
  childNames: Record<string, string>;
  /** Her own pregnancy ended, so an overview grantee sees the paused state (8.4 rule 2). */
  pregnancyPaused: boolean;
}

export interface TodayView {
  today: string;
  stage: Stage;
  hero: Hero;
  /** Postpartum only: the child whose age heads the page; null when she guards none. */
  child: Part<ChildAge | null> | null;
  /** The open card; null for the `none` stage, which is never asked a body question. */
  log: { stage: LoggingStage; initial: DayState | null } | null;
  /**
   * The partner card; null where it does not show (a `none` stage person
   * whose sharing read answered that they share nothing).
   */
  partners: Part<PartnersData> | null;
}

/** Pages through a cursor list; more than `pages` pages is a failure rather than a silent cut. */
const MAX_PAGES = 10;
const PAGE = 200;

interface ListAnswer<T> {
  data?: { items: T[]; nextCursor: string | null };
  response: Response;
}

async function everyPage<T>(read: (cursor?: string) => Promise<ListAnswer<T>>): Promise<Part<T[]>> {
  const items: T[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data, response } = await read(cursor);
      if (!response.ok || data === undefined) return failed;
      items.push(...data.items);
      if (data.nextCursor === null) return ok(items);
      cursor = data.nextCursor;
    }
  } catch {
    return failed;
  }
  return failed;
}

async function single<T>(read: () => Promise<{ data?: T; response: Response }>): Promise<Part<T>> {
  try {
    const { data, response } = await read();
    return response.ok && data !== undefined ? ok(data) : failed;
  } catch {
    return failed;
  }
}

/** A read where 404 means "nothing there" rather than a failure. */
async function maybe<T>(
  read: () => Promise<{ data?: T; response: Response }>,
): Promise<Part<T | null>> {
  try {
    const { data, response } = await read();
    if (response.status === 404) return ok(null);
    return response.ok && data !== undefined ? ok(data) : failed;
  } catch {
    return failed;
  }
}

function ownPrediction(client: ApiClient): Promise<Part<CyclePrediction>> {
  return single(() => client.GET("/api/v1/cycle/predictions"));
}

function ownStatus(client: ApiClient): Promise<Part<CycleStatus>> {
  return single(() => client.GET("/api/v1/cycle/status"));
}

/** Her latest pregnancy, an ended one included; null when there is none (a 404). */
async function ownPregnancy(client: ApiClient): Promise<Part<Pregnancy | null>> {
  const answer = await maybe(() => client.GET("/api/v1/pregnancies/current"));
  if (!answer.ok || answer.value === null) return answer as Part<null>;
  // Her own read is the whole record; anything else is not an answer to this question.
  return "datingMethod" in answer.value ? ok(answer.value) : failed;
}

function sharingPeople(client: ApiClient): Promise<Part<SharingPerson[]>> {
  return everyPage((cursor) =>
    client.GET("/api/v1/sharing", {
      params: { query: cursor === undefined ? { limit: PAGE } : { limit: PAGE, cursor } },
    }),
  );
}

function visibleChildren(client: ApiClient): Promise<Part<Child[]>> {
  return everyPage((cursor) =>
    client.GET("/api/v1/children", {
      params: { query: cursor === undefined ? { limit: PAGE } : { limit: PAGE, cursor } },
    }),
  );
}

function entriesBetween(client: ApiClient, from: string, to: string): Promise<Part<CycleEntry[]>> {
  return everyPage((cursor) =>
    client.GET("/api/v1/cycle/entries", {
      params: {
        query: cursor === undefined ? { from, to, limit: PAGE } : { from, to, limit: PAGE, cursor },
      },
    }),
  );
}

async function todaysDay(client: ApiClient, today: string): Promise<DayState | null> {
  try {
    const answer = await loadDay(client, today);
    // A day the server could not read loads again in the browser, with its own failure state.
    return answer.ok ? answer.day : null;
  } catch {
    return null;
  }
}

/** The period days among live entries, oldest first: light, medium or heavy (the API has no period flag). */
export function periodDays(entries: readonly CycleEntry[]): string[] {
  return entries
    .filter(
      (entry): entry is CycleEntry & { date: string } =>
        entry.deletedAt === null && entry.date !== undefined && isPeriodFlow(entry.flow),
    )
    .map((entry) => entry.date)
    .sort(compareDates);
}

/** Consecutive days grouped into runs, first and last day each. */
function runsOf(days: readonly string[]): DaySpan[] {
  const runs: DaySpan[] = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last !== undefined && addDays(last.end, 1) === day) last.end = day;
    else if (last === undefined || compareDates(day, last.end) > 0)
      runs.push({ start: day, end: day });
  }
  return runs;
}

function touches(span: DaySpan, start: string, end: string): boolean {
  return compareDates(span.start, end) <= 0 && compareDates(span.end, start) >= 0;
}

/** The first and last day of the week holding `today`, by the profile's week start. */
export function weekOf(today: string, weekStart: number): DaySpan {
  const start = startOfWeek(today, weekStart as WeekStart);
  return { start, end: addDays(start, 6) };
}

/**
 * This week in words (DESIGN.md 1.2: the strip's day texture on Today):
 * the logged period runs that touch the week, and the API's next period
 * band and fertile window when they touch it. A prediction that offers no
 * date (not enough regular cycles) contributes nothing but the logged days.
 */
export function weekLines(
  week: DaySpan,
  days: readonly string[],
  prediction: CyclePrediction,
): WeekLines {
  const touching = runsOf(days).filter((run) => touches(run, week.start, week.end));
  const first = touching[0];
  const last = touching.at(-1);
  const offered = prediction.basis === "estimate" || prediction.basis === "first_guess";
  const next = prediction.nextPeriod;
  const fertile = prediction.fertileWindow;
  return {
    logged: first && last ? { start: first.start, end: last.end } : null,
    nextPeriod:
      offered && next && touches(next, week.start, week.end)
        ? { start: next.start, end: next.end }
        : null,
    fertile:
      offered && fertile && touches(fertile, week.start, week.end)
        ? { start: fertile.start, end: fertile.end }
        : null,
  };
}

/**
 * The child whose age heads a postpartum Today: among the children she
 * guards, the one born on the day her latest pregnancy ended, else the
 * youngest. Children she reaches only through a grant never count.
 */
export function pickChild(
  children: readonly Child[],
  guardianOf: readonly string[],
  pregnancy: Pregnancy | null,
): Child | null {
  const guarded = children.filter((child) => guardianOf.includes(child.id));
  if (guarded.length === 0) return null;
  const endedAt = pregnancy?.status === "ended" ? pregnancy.endedAt : null;
  const born =
    endedAt === null ? undefined : guarded.find((child) => child.dateOfBirth === endedAt);
  if (born !== undefined) return born;
  return guarded.reduce((youngest, child) =>
    compareDates(child.dateOfBirth, youngest.dateOfBirth) > 0 ? child : youngest,
  );
}

/** The age in words, or null for a date of birth the API holds as later than today. */
export function childAge(child: Child, today: string): ChildAge | null {
  try {
    return { id: child.id, name: child.displayName, age: formatChildAge(child.dateOfBirth, today) };
  } catch {
    return null;
  }
}

/** Who the read-only card lists: people with a grant from her or a child they guard with her. */
export function partnersFrom(
  sharing: Part<SharingPerson[]>,
  children: Part<Child[]>,
  pregnancy: Part<Pregnancy | null> | null,
): Part<PartnersData> {
  if (!sharing.ok) return failed;
  const people = sharing.value.filter(
    (person) => person.grants.length > 0 || person.guardianOf.length > 0,
  );
  const childNames: Record<string, string> = {};
  if (children.ok) for (const child of children.value) childNames[child.id] = child.displayName;
  const pregnancyPaused = pregnancy !== null && pregnancy.ok && pregnancy.value?.status === "ended";
  return ok({ people, childNames, pregnancyPaused });
}

async function cycleHero(
  client: ApiClient,
  session: TodaySession,
  reads: {
    prediction: Part<CyclePrediction>;
    status: Part<CycleStatus>;
    pregnancy: Part<Pregnancy | null>;
  },
): Promise<Hero> {
  const { today, profile } = session;
  const { prediction, status, pregnancy } = reads;
  if (!prediction.ok) return { kind: "failed" };
  if (prediction.value.basis === "none") {
    if (profile.stage === "postpartum") return { kind: "quiet", feeding: true };
    if (!pregnancy.ok) return { kind: "failed" };
    return pregnancy.value === null ? { kind: "empty" } : { kind: "quiet", feeding: false };
  }
  if (!status.ok) return { kind: "failed" };
  const latestStart = latestStartFrom(status.value);
  const week = weekOf(today, profile.weekStart);
  const from =
    latestStart !== null && compareDates(latestStart, week.start) < 0 ? latestStart : week.start;
  const entries = await entriesBetween(client, from, today);
  if (!entries.ok) return { kind: "failed" };
  const days = periodDays(entries.value);
  return {
    kind: "cycle",
    prediction: prediction.value,
    cycleDay: status.value.cycleDay,
    latestStart,
    loggedDays:
      latestStart === null
        ? []
        : days.filter(
            (day) => compareDates(day, latestStart) >= 0 && compareDates(day, today) <= 0,
          ),
    week: weekLines(week, days, prediction.value),
    nudge: profile.stage === "cycle",
  };
}

async function sharedHero(
  client: ApiClient,
  session: TodaySession,
  sharing: Part<SharingPerson[]>,
  children: Part<Child[]>,
): Promise<Hero> {
  const owners = new Map<string, { status: boolean; pregnancy: boolean }>();
  for (const grant of session.me.grants) {
    if (grant.category !== "cycle.status" && grant.category !== "pregnancy.overview") continue;
    const held = owners.get(grant.ownerId) ?? { status: false, pregnancy: false };
    if (grant.category === "cycle.status") held.status = true;
    else held.pregnancy = true;
    owners.set(grant.ownerId, held);
  }
  const names = new Map<string, string | null>(
    sharing.ok ? sharing.value.map((person) => [person.id, person.displayName]) : [],
  );
  const people = await Promise.all(
    [...owners].map(async ([ownerId, held]): Promise<SharedPerson> => {
      const query = { params: { query: { subject: ownerId } } };
      const [status, pregnancy] = await Promise.all([
        held.status ? maybe(() => client.GET("/api/v1/cycle/status", query)) : null,
        held.pregnancy
          ? maybe(() => client.GET("/api/v1/pregnancies/current", query)).then(
              (answer): Part<PregnancyOverview | PregnancyPaused | null> =>
                !answer.ok || answer.value === null || !("datingMethod" in answer.value)
                  ? (answer as Part<PregnancyOverview | PregnancyPaused | null>)
                  : // A grantee never receives the whole record; if one arrives, show nothing of it.
                    failed,
            )
          : null,
      ]);
      return {
        ownerId,
        name: sharing.ok ? ok(names.get(ownerId) ?? null) : failed,
        status,
        pregnancy,
      };
    }),
  );
  const ages: Part<ChildAge[]> = children.ok
    ? ok(
        children.value
          .map((child) => childAge(child, session.today))
          .filter((age): age is ChildAge => age !== null),
      )
    : failed;
  return { kind: "shared", people, children: ages };
}

/** Reads and shapes Today for the signed-in person; never throws for a read that failed. */
export async function loadToday(client: ApiClient, session: TodaySession): Promise<TodayView> {
  const { profile, today, me } = session;
  const stage = profile.stage;

  if (stage === "none") {
    const [sharing, children] = await Promise.all([sharingPeople(client), visibleChildren(client)]);
    const hero = await sharedHero(client, session, sharing, children);
    const partners = partnersFrom(sharing, children, null);
    return {
      today,
      stage,
      hero,
      child: null,
      log: null,
      // Someone who logs nothing of their own sees the card only when they share a child. A
      // failed read keeps the card, so its failure line says so: then nobody knows whether they do.
      partners: !partners.ok || partners.value.people.length > 0 ? partners : null,
    };
  }

  const logging: LoggingStage = isLoggingStage(stage) ? stage : "cycle";
  if (stage === "pregnancy") {
    const [pregnancy, initial, sharing, children] = await Promise.all([
      ownPregnancy(client),
      todaysDay(client, today),
      sharingPeople(client),
      visibleChildren(client),
    ]);
    const open = pregnancy.ok && pregnancy.value?.status === "active" ? pregnancy.value : null;
    return {
      today,
      stage,
      hero: {
        kind: "pregnancy",
        pregnancy: pregnancy.ok
          ? ok(open === null ? null : { dueDate: open.dueDate, method: open.datingMethod })
          : failed,
      },
      child: null,
      log: { stage: logging, initial },
      partners: partnersFrom(sharing, children, pregnancy),
    };
  }

  const [prediction, status, pregnancy, initial, sharing, children] = await Promise.all([
    ownPrediction(client),
    ownStatus(client),
    ownPregnancy(client),
    todaysDay(client, today),
    sharingPeople(client),
    visibleChildren(client),
  ]);
  const hero = await cycleHero(client, session, { prediction, status, pregnancy });
  let child: Part<ChildAge | null> | null = null;
  if (stage === "postpartum") {
    if (!children.ok) child = failed;
    else {
      // Without the pregnancy's end date the rule falls back to the youngest guarded child.
      const ended = pregnancy.ok ? pregnancy.value : null;
      const picked = pickChild(children.value, me.guardianOf, ended);
      child = ok(picked === null ? null : childAge(picked, today));
    }
  }
  return {
    today,
    stage,
    hero,
    child,
    log: { stage: logging, initial },
    partners: partnersFrom(sharing, children, pregnancy),
  };
}
