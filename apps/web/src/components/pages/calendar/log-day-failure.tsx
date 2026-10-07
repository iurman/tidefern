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
}

/**
 * /log/[date] when the session read itself failed, so neither the stage nor
 * today is known: the day page's own frame (the date as the h1, Close and
 * the previous day as links) with the day sheet's failed-load sentence and
 * Try again, which reads the page again. The next day is left out because
 * only the API knows whether it has come. No form renders in this state, so
 * the stage and the save handler the sheet's props require are never used.
 */
export function LogDayFailure({ date, closeHref }: LogDayFailureProps) {
  const router = useRouter();
  return (
    <DaySheet
      page={{ closeHref, previousHref: `/log/${addDays(date, -1)}` }}
      date={date}
      stage="cycle"
      onSave={() => {}}
      error={dayLogCopy.loadFailed}
      onRetry={() => router.refresh()}
    />
  );
}
