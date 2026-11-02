import { sql } from "drizzle-orm";
import { todayIn } from "@tidefern/core";
import type { CalendarDate } from "@tidefern/core";
import type { Transaction } from "@tidefern/db";

/**
 * The calendar clock (architecture 15 and 17.1, task E11). Every decision
 * the API makes about which calendar day it is reads this clock: today, a
 * cycle day, a gestation week, a child's age, a prediction's days late, the
 * reminders' "tomorrow in each person's zone", and the `today` of
 * `GET /v1/me`. Outside production `TIDEFERN_FAKE_NOW` freezes it, so the
 * seed, the server and the browser assertions agree on one today and seeded
 * facts stop drifting a day per day.
 *
 * It never decides an instant that must stay real: a session's age and the
 * fresh-authentication window, `created_at`, `updated_at` and every other
 * stored time, an audit row and the day a partner read collapses onto
 * (`auditDay` in middleware/audit.ts), idempotency, rate limits, retention,
 * and a job's `run_after`. Those keep reading the real clock.
 */

/** The facts the clock is resolved from: `process.env` in the hosts, plain facts in tests. */
export interface ClockEnvironment {
  [key: string]: string | undefined;
  TIDEFERN_FAKE_NOW?: string | undefined;
  VERCEL_ENV?: string | undefined;
}

/** `TIDEFERN_FAKE_NOW` is set where it is refused, or names no instant. */
export class ClockConfigurationError extends Error {
  override readonly name = "ClockConfigurationError";
}

/**
 * The instant `TIDEFERN_FAKE_NOW` freezes the calendar at, or null when it
 * is unset or blank. Parsed exactly as the seed parses it (`resolveSeedNow`
 * in packages/db): trimmed, then read by `Date`, so a bare `2026-10-05` is
 * midnight UTC on that day and the seed and the server agree on every
 * persona's today in her own zone. On production the variable is refused
 * outright, as the seed refuses it and the mailer refuses
 * `E2E_MAIL_CAPTURE`.
 */
export function frozenInstant(env: ClockEnvironment): Date | null {
  const value = env.TIDEFERN_FAKE_NOW?.trim();
  if (!value) return null;
  if (env.VERCEL_ENV === "production") {
    throw new ClockConfigurationError(
      "TIDEFERN_FAKE_NOW must not be set when VERCEL_ENV is production",
    );
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new ClockConfigurationError("TIDEFERN_FAKE_NOW is not an ISO 8601 instant");
  }
  return instant;
}

export interface CalendarClock {
  /** The frozen instant as an ISO 8601 string, or null when the clock is the real one. */
  readonly frozenAt: string | null;
  /**
   * The instant a calendar decision reads for something happening at
   * `real` (the request's or the drain's own instant; the real clock when
   * omitted): the frozen instant when the calendar is frozen, else `real`
   * itself. Never stored, and never compared with a stored time.
   */
  now(real?: Date): Date;
  /** Today's calendar date in `timeZone` on this clock, for something happening at `real`. */
  today(timeZone: string, real?: Date): CalendarDate;
}

/**
 * The clock for an environment. `createApp()` resolves it from
 * `process.env` when the host passes none, and `pnpm jobs:run` does the
 * same before it connects, so a production deployment with the variable
 * set fails to start its API instead of answering on a frozen calendar,
 * and the manual drain stops before it claims a job; tests pass facts.
 */
export function calendarClock(env: ClockEnvironment): CalendarClock {
  const frozen = frozenInstant(env);
  const now = (real: Date = new Date()): Date =>
    frozen === null ? real : new Date(frozen.getTime());
  return Object.freeze({
    frozenAt: frozen === null ? null : frozen.toISOString(),
    now,
    today: (timeZone: string, real?: Date): CalendarDate => todayIn(timeZone, now(real)),
  });
}

/**
 * The real calendar, whatever the environment says: what a drain or the
 * reminder step uses when its caller passes no clock (their tests). Every
 * host passes the clock it resolved instead.
 */
export const realCalendarClock: CalendarClock = calendarClock({});

/**
 * Hands a frozen calendar to the SQL that decides which day it is
 * (`cycle_status_for()`, migration 0011) through the transaction-local
 * setting `app.calendar_now`, inside the actor's `withActor` transaction and
 * before the call. On the real clock nothing is set and the function reads
 * `now()`, as it always has. `set_config(..., true)` ends with the
 * transaction, so a pooled connection never carries the value into another
 * request, and the value only ever comes from this clock, never from a
 * request.
 */
export async function pinCalendar(tx: Transaction, clock: CalendarClock): Promise<void> {
  if (clock.frozenAt === null) return;
  await tx.execute(sql`select set_config('app.calendar_now', ${clock.frozenAt}, true)`);
}
