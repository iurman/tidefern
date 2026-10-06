import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, can, todayIn } from "@tidefern/core";
import type { Actor, CalendarDate, Grant } from "@tidefern/core";
import { isActorId, schema, withSystem } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { assertSweepRole, enqueue } from "@tidefern/db/jobs";
import type { Job } from "@tidefern/db/jobs";
import { PERIOD_FLOWS } from "@tidefern/schemas";

import { PERIOD_GAP_DAYS, periodStartsFrom } from "../routes/cycle";
import { REMINDER_JOB_TYPE, REMINDER_PAYLOAD_KEY } from "../routes/pregnancy/index";
import type { JobContext } from "./index";
import type { Mailer } from "./notice";

/**
 * Reminders in Phase 1 (architecture 10.1 and 10.3): one generic email a
 * day per person, sent by the daily batch. The scheduled run calls
 * `enqueueReminders` before it drains, so the jobs it writes go out in the
 * same run. The run is the cron in `apps/web/vercel.json`, `0 6 * * *`:
 * 06:00 UTC, which Hobby delivers within plus or minus 59 minutes. That hour
 * is the owner's choice [OWNER]; the default puts the email in the inbox
 * before the day starts across the Americas (01:00 to 03:00 on the east
 * coast, the evening before on the west coast) and in the early morning
 * across Europe, and in every zone from UTC-12 to UTC+14 "tomorrow" is
 * still a day that has not begun. Changing it is the one `schedule` string.
 *
 * What a reminder is, decided from the record:
 *
 * - An appointment tomorrow. A `pregnancy_events` row of kind
 *   `appointment`, not tombstoned, on an open pregnancy, dated tomorrow in
 *   the subject's own time zone. She is the only recipient. Built.
 * - A partner notice when a period starts. A period start (the first
 *   bleeding day of a run, the same rule the cycle routes use) dated today
 *   or yesterday in her zone, told to each person she gave an active cycle
 *   grant with `notify` on (10.3: off by default, her switch, per person),
 *   when `can()` lets that person see the cycle status or history at
 *   summary level. Yesterday is included so a start logged after the
 *   day's run is still told once, the next day. Built.
 * - A predicted period start tomorrow, for a subject who opted in. Not
 *   built: the record has no opt-in for it (no column on `profiles`, no
 *   consent purpose, and `notification_detail` sets wording, not whether),
 *   and sending it to everyone with a prediction would be a reminder nobody
 *   asked for. It needs a migration and a control first; the step below
 *   has the place for it.
 *
 * A recipient gets at most one job per run whatever the number of
 * reasons, with ids only in the payload: `userId` (the recipient), and
 * `pregnancyId` with `eventIds` for appointments (`pregnancyId` is the key
 * the pregnancy end route matches to cancel queued reminders, 8.4), and
 * `entryIds` for period starts. A recipient whose email is not verified, or
 * whose account is closing, gets nothing. The email is the same at every
 * detail level: `notification_detail` changes only in-app text and the
 * lock-screen preview in Phase 1, so the handler never reads it.
 */

/** The job type, shared with the pregnancy routes that cancel it. */
export { REMINDER_JOB_TYPE };

/** The categories a period start is a fact of; a grant to anything else never hears of one. */
const PERIOD_NOTICE_CATEGORIES = ["cycle.status", "cycle.history"] as const;

/**
 * A reason already in a reminder job is not enqueued again. A period start
 * can be seen by the runs of two local days, at most two days apart; an
 * appointment is due on one local day only, so its window is shorter and
 * an appointment moved after its reminder is reminded again.
 */
const ENTRY_LOOKBACK_MS = 3 * 24 * 60 * 60_000;
const EVENT_LOOKBACK_MS = 36 * 60 * 60_000;

/** One reminder step at a time: two overlapping runs would both see the same reasons. */
const REMINDER_LOCK = sql`pg_advisory_xact_lock(hashtext('reminder.send'))`;

export interface ReminderPayload {
  userId: string;
  pregnancyId?: string;
  eventIds?: string[];
  entryIds?: string[];
}

export interface ReminderSweepCounts {
  /** Appointments due tomorrow that went into a job. */
  appointments: number;
  /** Period starts told to a partner, counted once per partner. */
  periodNotices: number;
  /** Jobs written, one per recipient. */
  jobs: number;
}

interface Reasons {
  pregnancyId?: string;
  eventIds: Set<string>;
  entryIds: Set<string>;
}

function reasonsFor(map: Map<string, Reasons>, userId: string): Reasons {
  let reasons = map.get(userId);
  if (!reasons) {
    reasons = { eventIds: new Set(), entryIds: new Set() };
    map.set(userId, reasons);
  }
  return reasons;
}

/** Today's date in UTC, the anchor for the coarse date filters below. */
function utcToday(now: Date): CalendarDate {
  return now.toISOString().slice(0, 10);
}

interface DueAppointment {
  id: string;
  subjectId: string;
  pregnancyId: string;
  updatedAt: Date;
}

/**
 * Appointments dated tomorrow in the subject's zone. Every zone's
 * tomorrow lies between UTC today and UTC today plus two, so the query
 * narrows to that and the zone decides the rest.
 */
async function dueAppointments(tx: Transaction, now: Date): Promise<DueAppointment[]> {
  const events = schema.pregnancyEvents;
  const pregnancies = schema.pregnancies;
  const profiles = schema.profiles;
  const anchor = utcToday(now);
  const rows = await tx
    .select({
      id: events.id,
      subjectId: events.subjectId,
      pregnancyId: events.pregnancyId,
      date: events.date,
      updatedAt: events.updatedAt,
      timeZone: profiles.timeZone,
    })
    .from(events)
    .innerJoin(pregnancies, eq(pregnancies.id, events.pregnancyId))
    .innerJoin(profiles, eq(profiles.userId, events.subjectId))
    .where(
      and(
        eq(events.kind, "appointment"),
        isNull(events.deletedAt),
        eq(pregnancies.subjectId, events.subjectId),
        isNull(pregnancies.endedAt),
        isNull(pregnancies.deletedAt),
        isNull(profiles.deletedAt),
        gte(events.date, anchor),
        lte(events.date, addDays(anchor, 2)),
      ),
    );
  return rows
    .filter((row) => row.date === addDays(todayIn(row.timeZone, now), 1))
    .map(({ id, subjectId, pregnancyId, updatedAt }) => ({
      id,
      subjectId,
      pregnancyId,
      updatedAt,
    }));
}

/** The core actor a grantee is, from the grants she holds from one owner. */
function granteeActor(granteeId: string, held: readonly Grant[]): Actor {
  return { id: granteeId, guardianOf: [], grants: [...held] };
}

/** Whether `can()` lets this grantee learn that the owner's period started. */
function mayBeTold(actor: Actor, ownerId: string): boolean {
  return PERIOD_NOTICE_CATEGORIES.some(
    (category) => can(actor, "summary", { subjectId: ownerId, category }).allowed,
  );
}

interface NotifyGrantRow {
  ownerId: string;
  granteeId: string;
  category: Grant["category"];
  level: Grant["level"];
}

/**
 * Active, untombstoned grants with `notify` on, optionally for one grantee.
 * Every category is read: whether a grant lets its holder hear of a period
 * start is `can()`'s decision, not this query's.
 */
async function notifyGrants(tx: Transaction, granteeId?: string): Promise<NotifyGrantRow[]> {
  const grants = schema.grants;
  return tx
    .select({
      ownerId: grants.ownerId,
      granteeId: grants.granteeId,
      category: grants.category,
      level: grants.level,
    })
    .from(grants)
    .where(
      and(
        eq(grants.notify, true),
        isNull(grants.revokedAt),
        isNull(grants.deletedAt),
        granteeId === undefined ? undefined : eq(grants.granteeId, granteeId),
      ),
    );
}

function asGrant(row: NotifyGrantRow): Grant {
  return {
    ownerId: row.ownerId,
    granteeId: row.granteeId,
    category: row.category,
    level: row.level,
    revokedAt: null,
  };
}

/** Owner id to the grantees `can()` lets hear of her period starts, with `notify` on. */
function toldBy(rows: readonly NotifyGrantRow[]): Map<string, string[]> {
  const held = new Map<string, Grant[]>();
  for (const row of rows) {
    const key = `${row.ownerId}:${row.granteeId}`;
    held.set(key, [...(held.get(key) ?? []), asGrant(row)]);
  }
  const told = new Map<string, string[]>();
  for (const [key, grants] of held) {
    const [ownerId, granteeId] = key.split(":") as [string, string];
    if (!mayBeTold(granteeActor(granteeId, grants), ownerId)) continue;
    told.set(ownerId, [...(told.get(ownerId) ?? []), granteeId]);
  }
  return told;
}

interface PeriodStartRow {
  entryId: string;
  ownerId: string;
}

/**
 * Period starts dated today or yesterday in each owner's zone. The days
 * read reach `PERIOD_GAP_DAYS` before yesterday, so a bleeding day that
 * continues an earlier run is never taken for a start.
 */
async function recentPeriodStarts(
  tx: Transaction,
  ownerIds: readonly string[],
  now: Date,
): Promise<PeriodStartRow[]> {
  if (ownerIds.length === 0) return [];
  const entries = schema.cycleEntries;
  const profiles = schema.profiles;
  const anchor = utcToday(now);
  const rows = await tx
    .select({
      id: entries.id,
      subjectId: entries.subjectId,
      date: entries.date,
      flow: entries.flow,
      timeZone: profiles.timeZone,
    })
    .from(entries)
    .innerJoin(profiles, eq(profiles.userId, entries.subjectId))
    .where(
      and(
        inArray(entries.subjectId, [...ownerIds]),
        isNull(entries.deletedAt),
        isNull(profiles.deletedAt),
        inArray(entries.flow, [...PERIOD_FLOWS]),
        gte(entries.date, addDays(anchor, -2 - PERIOD_GAP_DAYS)),
        lte(entries.date, addDays(anchor, 1)),
      ),
    );
  const byOwner = new Map<string, typeof rows>();
  for (const row of rows) byOwner.set(row.subjectId, [...(byOwner.get(row.subjectId) ?? []), row]);
  const starts: PeriodStartRow[] = [];
  for (const [ownerId, days] of byOwner) {
    const today = todayIn((days[0] as (typeof rows)[number]).timeZone, now);
    const yesterday = addDays(today, -1);
    const window = days.filter(
      (day) => day.date >= addDays(yesterday, -PERIOD_GAP_DAYS) && day.date <= today,
    );
    const idByDate = new Map(window.map((day) => [day.date, day.id]));
    for (const start of periodStartsFrom(window)) {
      const entryId = idByDate.get(start.date);
      if (start.date >= yesterday && entryId) starts.push({ entryId, ownerId });
    }
  }
  return starts;
}

/** The reasons already carried by a recent reminder job, so a run never repeats one. */
async function alreadyQueued(
  tx: Transaction,
  now: Date,
): Promise<{ events: Map<string, Date>; entries: Set<string> }> {
  const rows = await tx
    .select({ payload: schema.jobs.payloadJson, runAfter: schema.jobs.runAfter })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, REMINDER_JOB_TYPE),
        gte(schema.jobs.runAfter, new Date(now.getTime() - ENTRY_LOOKBACK_MS)),
      ),
    );
  const events = new Map<string, Date>();
  const entries = new Set<string>();
  for (const { payload, runAfter } of rows) {
    const parsed = payload as Partial<ReminderPayload>;
    for (const id of parsed.eventIds ?? []) {
      const seen = events.get(id);
      if (!seen || seen < runAfter) events.set(id, runAfter);
    }
    for (const id of parsed.entryIds ?? []) entries.add(id);
  }
  return { events, entries };
}

/**
 * Of these users, the ones a reminder may reach: an account with a
 * verified email and no closure in progress.
 */
async function reachable(tx: Transaction, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const verified = await tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(inArray(schema.user.id, [...userIds]), eq(schema.user.emailVerified, true)));
  const closing = await tx
    .select({ userId: schema.dataRequests.userId })
    .from(schema.dataRequests)
    .where(
      and(
        inArray(schema.dataRequests.userId, [...userIds]),
        eq(schema.dataRequests.kind, "closure"),
        inArray(schema.dataRequests.state, ["requested", "in_progress"]),
      ),
    );
  const blocked = new Set(closing.map((row) => row.userId));
  return new Set(verified.map((row) => row.id).filter((id) => !blocked.has(id)));
}

function payloadOf(userId: string, reasons: Reasons): ReminderPayload {
  const payload: ReminderPayload = { userId };
  if (reasons.eventIds.size > 0 && reasons.pregnancyId !== undefined) {
    payload[REMINDER_PAYLOAD_KEY] = reasons.pregnancyId;
    payload.eventIds = [...reasons.eventIds].sort();
  }
  if (reasons.entryIds.size > 0) payload.entryIds = [...reasons.entryIds].sort();
  return payload;
}

/**
 * The reminder step of the daily run: finds tomorrow's reminders and the
 * period starts to tell, and enqueues one `reminder.send` job per
 * recipient with ids only, due now. It reads every person's rows, so it
 * runs under `withSystem` on the job runner's owner connection and refuses
 * the app role, where the system flag reads nothing.
 */
export async function enqueueReminders(
  db: ActorDatabase,
  now: Date = new Date(),
): Promise<ReminderSweepCounts> {
  await assertSweepRole(db);
  return withSystem(async (tx) => {
    await tx.execute(sql`select ${REMINDER_LOCK}`);
    const queued = await alreadyQueued(tx, now);
    const byRecipient = new Map<string, Reasons>();

    for (const appointment of await dueAppointments(tx, now)) {
      const seen = queued.events.get(appointment.id);
      const eventSince = Math.max(
        appointment.updatedAt.getTime(),
        now.getTime() - EVENT_LOOKBACK_MS,
      );
      if (seen && seen.getTime() >= eventSince) continue;
      const reasons = reasonsFor(byRecipient, appointment.subjectId);
      reasons.pregnancyId = appointment.pregnancyId;
      reasons.eventIds.add(appointment.id);
    }

    const told = toldBy(await notifyGrants(tx));
    for (const start of await recentPeriodStarts(tx, [...told.keys()], now)) {
      if (queued.entries.has(start.entryId)) continue;
      for (const granteeId of told.get(start.ownerId) ?? []) {
        reasonsFor(byRecipient, granteeId).entryIds.add(start.entryId);
      }
    }

    const allowed = await reachable(tx, [...byRecipient.keys()]);
    const counts: ReminderSweepCounts = { appointments: 0, periodNotices: 0, jobs: 0 };
    for (const [userId, reasons] of byRecipient) {
      if (!allowed.has(userId)) continue;
      await enqueue(tx, REMINDER_JOB_TYPE, { ...payloadOf(userId, reasons) }, { runAfter: now });
      counts.appointments += reasons.eventIds.size;
      counts.periodNotices += reasons.entryIds.size;
      counts.jobs += 1;
    }
    return counts;
  }, db);
}

/** The rendered generic email: `reminderEmail` from `@tidefern/auth` in the hosts. */
export type ReminderTemplate = (
  url: string,
  firstName?: string,
) => { subject: string; text: string; html?: string | undefined };

/**
 * What the handler takes from the host: the mail transport, the https
 * origin the link is built on (`SITE_URL`), and the template. The API
 * never depends on `@tidefern/auth` at runtime, so the host passes its
 * `reminderEmail` here, the same way it passes the mailer.
 */
export interface ReminderDependencies {
  mailer: Mailer;
  siteUrl: string;
  template: ReminderTemplate;
}

let configured: ReminderDependencies | undefined;

/** Set by the host next to `configureSharing`; `undefined` turns sending off again (tests). */
export function configureReminders(dependencies: ReminderDependencies | undefined): void {
  if (dependencies) {
    const origin = new URL(dependencies.siteUrl);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") {
      throw new TypeError("the reminder link needs an http or https origin");
    }
  }
  configured = dependencies;
}

/** Where every reminder points: the app's home screen, where the reminder itself is shown. */
export const REMINDER_PATH = "/today";

/** No mail transport configured: the job fails, retries, and dies into the owner notice. */
export class ReminderMailUnavailableError extends Error {
  override readonly name = "ReminderMailUnavailableError";

  constructor() {
    super("no mail transport is configured for reminders");
  }
}

/** A payload that is not a reminder's ids. */
export class ReminderPayloadError extends TypeError {
  override readonly name = "ReminderPayloadError";
}

function idList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && isActorId(id))) {
    throw new ReminderPayloadError("a reminder names its reasons by id");
  }
  return value as string[];
}

export function parseReminderPayload(payload: unknown): ReminderPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const userId = raw.userId;
  if (typeof userId !== "string" || !isActorId(userId)) {
    throw new ReminderPayloadError("a reminder names its recipient by id");
  }
  const parsed: ReminderPayload = { userId };
  const pregnancyId = raw[REMINDER_PAYLOAD_KEY];
  if (pregnancyId !== undefined) {
    if (typeof pregnancyId !== "string" || !isActorId(pregnancyId)) {
      throw new ReminderPayloadError("a reminder names its pregnancy by id");
    }
    parsed.pregnancyId = pregnancyId;
  }
  const eventIds = idList(raw.eventIds);
  const entryIds = idList(raw.entryIds);
  if (eventIds.length > 0) parsed.eventIds = eventIds;
  if (entryIds.length > 0) parsed.entryIds = entryIds;
  return parsed;
}

/** Of the appointments named, whether one is still hers, still on an open pregnancy and not past. */
async function appointmentStillDue(
  tx: Transaction,
  userId: string,
  eventIds: readonly string[],
  now: Date,
): Promise<boolean> {
  if (eventIds.length === 0) return false;
  const events = schema.pregnancyEvents;
  const pregnancies = schema.pregnancies;
  const rows = await tx
    .select({ date: events.date, timeZone: schema.profiles.timeZone })
    .from(events)
    .innerJoin(pregnancies, eq(pregnancies.id, events.pregnancyId))
    .innerJoin(schema.profiles, eq(schema.profiles.userId, events.subjectId))
    .where(
      and(
        inArray(events.id, [...eventIds]),
        eq(events.subjectId, userId),
        eq(events.kind, "appointment"),
        isNull(events.deletedAt),
        isNull(pregnancies.endedAt),
        isNull(pregnancies.deletedAt),
      ),
    );
  return rows.some((row) => row.date >= todayIn(row.timeZone, now));
}

/**
 * Of the period starts named, whether one may still be told to this
 * person: the day still logged with bleeding, and a grant from its owner
 * that is active, has `notify` on and passes `can()`. A grant revoked or
 * switched off after the run sends nothing.
 */
async function periodNoticeStillAllowed(
  tx: Transaction,
  userId: string,
  entryIds: readonly string[],
): Promise<boolean> {
  if (entryIds.length === 0) return false;
  const rows = await tx
    .select({ ownerId: schema.cycleEntries.subjectId })
    .from(schema.cycleEntries)
    .where(
      and(
        inArray(schema.cycleEntries.id, [...entryIds]),
        isNull(schema.cycleEntries.deletedAt),
        inArray(schema.cycleEntries.flow, [...PERIOD_FLOWS]),
      ),
    );
  if (rows.length === 0) return false;
  const told = toldBy(await notifyGrants(tx, userId));
  return rows.some((row) => (told.get(row.ownerId) ?? []).includes(userId));
}

interface Recipient {
  email: string;
  firstName: string | undefined;
}

async function recipientOf(tx: Transaction, payload: ReminderPayload, now: Date) {
  const allowed = await reachable(tx, [payload.userId]);
  if (!allowed.has(payload.userId)) return null;
  const due =
    (await appointmentStillDue(tx, payload.userId, payload.eventIds ?? [], now)) ||
    (await periodNoticeStillAllowed(tx, payload.userId, payload.entryIds ?? []));
  if (!due) return null;
  const [row] = await tx
    .select({ email: schema.user.email, displayName: schema.profiles.displayName })
    .from(schema.user)
    .leftJoin(
      schema.profiles,
      and(eq(schema.profiles.userId, schema.user.id), isNull(schema.profiles.deletedAt)),
    )
    .where(eq(schema.user.id, payload.userId))
    .limit(1);
  if (!row) return null;
  return { email: row.email, firstName: row.displayName ?? undefined } satisfies Recipient;
}

/**
 * The `reminder.send` handler. It re-reads the reasons as the system,
 * because a grant can be revoked or an appointment deleted between the run
 * that queued the job and this one; when none still holds, the job
 * completes and nothing is sent. Otherwise one email goes to the
 * recipient: the generic subject and body with the link to the app, the
 * same at every detail level and for a partner as for her.
 */
export async function sendReminder(job: Job, context: JobContext): Promise<void> {
  const payload = parseReminderPayload(job.payloadJson);
  const dependencies = configured;
  if (!dependencies) throw new ReminderMailUnavailableError();
  const recipient = await withSystem((tx) => recipientOf(tx, payload, context.now), context.db);
  if (!recipient) return;
  const link = new URL(REMINDER_PATH, dependencies.siteUrl).toString();
  const content = dependencies.template(link, recipient.firstName);
  await dependencies.mailer.send({
    to: recipient.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
