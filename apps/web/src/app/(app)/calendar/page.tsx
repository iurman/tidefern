import { headers } from "next/headers";
import type { WeekStart } from "@/components/ui/calendar-dates";
import { Button } from "@/components/ui/button";
import {
  calendarHref,
  calendarHrefFromQuery,
  childAgeLine,
  monthFromParam,
  readRange,
  viewFromParam,
} from "@/components/pages/calendar/calendar-model";
import { CalendarView } from "@/components/pages/calendar/calendar-view";
import { calendarCopy as copy } from "@/components/pages/calendar/copy";
import styles from "@/components/pages/calendar/calendar.module.css";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { isLoggingStage } from "@/lib/day-log";
import { pageMetadata } from "@/lib/site";
import { loadCalendar } from "./load";

export const metadata = pageMetadata("/calendar", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The calendar (DESIGN.md 3.4): the month or the list of her own days, the
 * API's prediction drawn with its uncertainty, and the day sheet over it.
 * The session comes from the layout's read (`sessionMe`, one GET /v1/me per
 * request); `today`, the week start and the stage are the API's. A visitor
 * the layout redirects (no session, a closing account, no profile yet) gets
 * nothing from here. A read that failed says so and offers to try again.
 *
 * `?month=YYYY-MM` picks the month, a date and nothing more; `?view=list`
 * opens the list, and the view reads the address itself so it follows a
 * link, Back and Forward. The none stage is never asked a body question,
 * so its calendar reads nothing and shows the empty state without a log
 * action.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const lookup = await sessionMe();
  // Today is not known yet, so Try again keeps the month and the view as the address gave them.
  if (lookup.kind === "failed") return <CalendarFailure href={calendarHrefFromQuery(query)} />;
  if (lookup.kind !== "ok") return null;
  const { profile, today, guardianOf } = lookup.me;
  if (profile === null || today === null) return null;

  const month = monthFromParam(query.month, today);
  const weekStart = profile.weekStart as WeekStart;
  const stage = profile.stage;

  if (!isLoggingStage(stage)) {
    return (
      <CalendarView
        today={today}
        month={month}
        weekStart={weekStart}
        stage={stage}
        days={[]}
        prediction={null}
      />
    );
  }

  const load = await loadCalendar(serverApiClient(await headers()), readRange(month, weekStart), {
    children: stage === "postpartum",
  });
  if (!load.ok) {
    return (
      <CalendarFailure href={calendarHref({ month, view: viewFromParam(query.view), today })} />
    );
  }

  return (
    <CalendarView
      today={today}
      month={month}
      weekStart={weekStart}
      stage={stage}
      days={load.days}
      prediction={load.prediction}
      childLine={load.children === null ? null : childAgeLine(load.children, guardianOf, today)}
    />
  );
}

/** The failed read: the heading, what happened and the next step, which reads the page again. */
function CalendarFailure({ href }: { href: string }) {
  return (
    <div className={styles.calendar}>
      <div className={styles.top}>
        <h1 className={styles.title}>{copy.heading}</h1>
      </div>
      <div className={styles.failure}>
        <p className={styles.sentence}>{copy.loadFailed}</p>
        <div className={styles.todayRow}>
          <Button variant="secondary" href={href}>
            {copy.tryAgain}
          </Button>
        </div>
      </div>
    </div>
  );
}
