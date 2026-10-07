import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { compareDates, isCalendarDate } from "@tidefern/core";
import { DayLogPage } from "@/components/day-log/day-log-sheet";
import { calendarHref } from "@/components/pages/calendar/calendar-model";
import { logDayCopy as copy } from "@/components/pages/calendar/copy";
import { LogDayFailure } from "@/components/pages/calendar/log-day-failure";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { isLoggingStage, loadDay } from "@/lib/day-log";
import { pageMetadata } from "@/lib/site";

// One title and one canonical address for every day: the date stays in the path and nowhere else.
export const metadata = pageMetadata("/log", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The day sheet as a page (DESIGN.md 3.4 and section 4): G9's page mode,
 * server-rendered from the day's entry and notes (`loadDay` on the server
 * client), so it reads without JavaScript, with the previous and next day
 * and Close as real links. A path that is not a calendar date is no page,
 * decided before any read. The none stage is never asked a body question,
 * and a day that has not come yet has nothing to log, so both get the
 * not-found page inside the shell. A visitor the layout redirects gets
 * nothing from here; a failed session read keeps the page's frame and says
 * the day could not be loaded.
 */
export default async function LogDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isCalendarDate(date)) notFound();

  const lookup = await sessionMe();
  if (lookup.kind === "failed") return <LogDayFailure date={date} closeHref="/calendar" />;
  if (lookup.kind !== "ok") return null;
  const { profile, today } = lookup.me;
  if (profile === null || today === null) return null;
  if (!isLoggingStage(profile.stage) || compareDates(date, today) > 0) notFound();

  const load = await loadDay(serverApiClient(await headers()), date);
  return (
    <DayLogPage
      stage={profile.stage}
      today={today}
      date={date}
      initial={load.ok ? load.day : null}
      closeHref={calendarHref({ month: date, view: "month", today })}
    />
  );
}
