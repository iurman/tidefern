"use client";
import { useRouter } from "next/navigation";
import { addDays, type CalendarDate } from "@tidefern/core";
import { dayLogCopy } from "@/components/day-log/copy";
import { DaySheet } from "@/components/ui/day-sheet";

export interface LogDayFailureProps {
  /** The day the address names, already checked as a calendar date. */
  date: CalendarDate;
  /** Where Close leads. */
  closeHref: string;
  /** The next day's page, only when today is known and that day has come. */
  nextHref?: string | undefined;
  /** The session ended between the reads: trying again cannot help, so the sentence says to sign in. */
  signedOut?: boolean;
}

/**
 * /log/[date] when a server read failed: the day page's own frame (the date
 * as the h1, Close and the days around it as links) with the day sheet's
 * own failure sentence, never "Loading" for a read that is already over.
 * Try again reads the page again. When the session read itself failed,
 * neither the stage nor today is known, so the next day is left out (only
 * the API knows whether it has come). When the day's own read answered 401,
 * the sentence is the sheet's signed-out one, without Try again, as the
 * sheet says it. No form renders in this state, so the stage and the save
 * handler the sheet's props require are never used.
 */
export function LogDayFailure({
  date,
  closeHref,
  nextHref,
  signedOut = false,
}: LogDayFailureProps) {
  const router = useRouter();
  return (
    <DaySheet
      page={{
        closeHref,
        previousHref: `/log/${addDays(date, -1)}`,
        ...(nextHref === undefined ? {} : { nextHref }),
      }}
      date={date}
      stage="cycle"
      onSave={() => {}}
      error={signedOut ? dayLogCopy.signedOut : dayLogCopy.loadFailed}
      {...(signedOut ? {} : { onRetry: () => router.refresh() })}
    />
  );
}
