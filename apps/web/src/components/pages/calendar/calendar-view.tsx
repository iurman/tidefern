"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { compareDates, type CalendarDate } from "@tidefern/core";
import type { CyclePrediction, Stage } from "@tidefern/schemas";
import { DayLogSheet } from "@/components/day-log/day-log-sheet";
import { Button } from "@/components/ui/button";
import { firstOfMonth, monthCaption, type WeekStart } from "@/components/ui/calendar-dates";
import { DayList } from "@/components/ui/day-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthGrid } from "@/components/ui/month-grid";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WeekStrip } from "@/components/ui/week-strip";
import { isLoggingStage } from "@/lib/day-log";
import { predictionCopy } from "@/lib/prediction-copy";
import {
  calendarHref,
  calendarMarks,
  dateFromLogHref,
  gridRange,
  hasLoggedDayIn,
  inMonth,
  listItems,
  shiftMonth,
  type CalendarDay,
  type CalendarViewName,
} from "./calendar-model";
import { calendarCopy as copy } from "./copy";
import styles from "./calendar.module.css";

export interface CalendarViewProps {
  /** Today in her time zone, from the API (GET /v1/me). */
  today: CalendarDate;
  /** The first day of the month shown. */
  month: CalendarDate;
  /** The view the address asked for; the switch changes it in place afterwards. */
  initialView: CalendarViewName;
  weekStart: WeekStart;
  stage: Stage;
  /** The grid's days from the server's reads: entries and the dates notes sit on. */
  days: CalendarDay[];
  /** The API's prediction, or null when nothing was read (the none stage). */
  prediction: CyclePrediction | null;
  /** "Ilo, 6 weeks": the postpartum card's age line, or null. */
  childLine?: string | null;
}

const viewOptions = [
  { value: "month", label: copy.views.month },
  { value: "list", label: copy.views.list },
] as const;

/**
 * The calendar (DESIGN.md 3.4, 6.2 and 6.3): Month and List as a segmented
 * control that swaps the view in place, the month grid with the legend and
 * "Nothing logged this month" outside it, the list with this week's strip
 * over the month's logged days, and the prediction sentences of
 * architecture 13.10 beside them. A day opens G9's day sheet over the
 * calendar (a dialog from 1024 px, a bottom sheet below), which loads the
 * day itself; a save there refreshes this page from the server.
 *
 * Months are addresses (`?month=YYYY-MM`), read on the server; moving
 * between them is a navigation whose wait the grid and the list show. The
 * view rides along in the address (`?view=list`) so a reload keeps it; no
 * browser storage holds it.
 */
export function CalendarView({
  today,
  month,
  initialView,
  weekStart,
  stage,
  days,
  prediction,
  childLine = null,
}: CalendarViewProps) {
  const router = useRouter();
  const [view, setView] = useState<CalendarViewName>(initialView);
  const [openDate, setOpenDate] = useState<CalendarDate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const logging = isLoggingStage(stage) ? stage : null;
  const todayMonth = firstOfMonth(today);
  const showingToday = inMonth(today, month);

  const marks = useMemo(() => calendarMarks(days, prediction), [days, prediction]);
  const range = gridRange(month, weekStart);
  const drawsTexture = marks.windows.some(
    (window) =>
      compareDates(window.end, range.from) >= 0 && compareDates(window.start, range.to) <= 0,
  );
  const sentences = prediction === null ? null : predictionCopy(prediction);
  const quiet = stage === "postpartum" && prediction !== null && prediction.basis === "none";

  function switchView(next: CalendarViewName) {
    setView(next);
    setNotice(null);
    // The address follows the view so a reload keeps it; this is not a navigation.
    window.history.replaceState(null, "", calendarHref({ month, view: next, today }));
  }

  function goToMonth(target: CalendarDate) {
    setNotice(null);
    startTransition(() => {
      router.push(calendarHref({ month: target, view, today }), { scroll: false });
    });
  }

  /** Opens the day's sheet; a day that has not come yet has nothing to log. */
  function openDay(date: CalendarDate) {
    if (logging === null) return;
    if (compareDates(date, today) > 0) {
      setNotice(copy.futureDay);
      return;
    }
    setNotice(null);
    setOpenDate(date);
  }

  /**
   * The list rows are links to the day's page, which is where they lead
   * without scripts or with a modifier key; a plain press opens the same day
   * in the sheet over the calendar instead.
   */
  function openFromRow(event: MouseEvent<HTMLDivElement>) {
    if (logging === null || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const date = dateFromLogHref(target?.closest("a[href]")?.getAttribute("href") ?? null);
    if (date === null) return;
    event.preventDefault();
    openDay(date);
  }

  // The empty states' one action; the none stage is never asked a body question, so it has none.
  const logToday =
    logging === null ? undefined : (
      <Button variant="primary" onClick={() => openDay(today)}>
        {copy.monthEmpty.action}
      </Button>
    );

  const monthView = (
    <div className={styles.view}>
      <div className={styles.grid}>
        <MonthGrid
          today={today}
          month={month}
          onMonthChange={goToMonth}
          weekStart={weekStart}
          windows={marks.windows}
          points={marks.points}
          noted={marks.noted}
          onDaySelect={openDay}
          showLegend={drawsTexture}
          loading={pending}
        />
      </div>
      <p className={styles.notice} aria-live="polite">
        {notice}
      </p>
    </div>
  );

  // Outside the grid, after what the prediction says: a month can be empty and still hold predictions.
  const monthEmpty = hasLoggedDayIn(days, month) ? null : (
    <EmptyState heading={copy.monthEmpty.heading} why={copy.monthEmpty.why} action={logToday} />
  );

  const listView = (
    <div className={styles.view}>
      {showingToday ? (
        <WeekStrip
          today={today}
          weekStart={weekStart}
          windows={marks.windows}
          points={marks.points}
          noted={marks.noted}
          label={copy.thisWeek}
        />
      ) : null}
      <div className={styles.listHead}>
        <h2 className={styles.listMonth}>{monthCaption(month, "en-US")}</h2>
        <div className={styles.listNav}>
          <Button
            variant="quiet"
            icon="chevron-left"
            onClick={() => goToMonth(shiftMonth(month, -1))}
          >
            {copy.previousMonth}
          </Button>
          <Button
            variant="quiet"
            icon="chevron-right"
            onClick={() => goToMonth(shiftMonth(month, 1))}
            disabled={compareDates(month, todayMonth) >= 0}
          >
            {copy.nextMonth}
          </Button>
        </div>
      </div>
      <div onClickCapture={openFromRow}>
        <DayList
          today={today}
          items={listItems(days, month)}
          label={copy.listLabel(month)}
          loading={pending}
          empty={{
            heading: copy.listEmpty.heading,
            why: copy.listEmpty.why,
            action: logToday,
          }}
        />
      </div>
    </div>
  );

  let aside = null;
  if (quiet) {
    aside = (
      <div className={styles.aside}>
        {childLine ? <p className={styles.child}>{childLine}</p> : null}
        <EmptyState
          heading={copy.quiet.heading}
          why={copy.quiet.why}
          action={
            logging === null ? undefined : (
              <Button variant="primary" onClick={() => openDay(today)}>
                {copy.quiet.action}
              </Button>
            )
          }
        />
        <p className={styles.sentence}>{copy.quiet.feeding}</p>
      </div>
    );
  } else if (sentences?.offered) {
    aside = (
      <div className={styles.aside}>
        {sentences.estimate ? (
          <p className={`estimate ${styles.sentence}`}>{sentences.estimate}</p>
        ) : null}
        {sentences.fertile ? <p className={styles.sentence}>{sentences.fertile}</p> : null}
        {sentences.deviation ? <p className={styles.sentence}>{sentences.deviation}</p> : null}
        {sentences.care ? <p className={styles.sentence}>{sentences.care}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.top}>
        <h1 className={styles.title}>{copy.heading}</h1>
        <SegmentedControl<CalendarViewName>
          label={copy.viewLabel}
          hideLabel
          options={viewOptions}
          value={view}
          onChange={switchView}
        />
      </div>
      {/* The sentences sit beside the view on a wide page and straight under it on a narrow one. */}
      <div className={aside === null ? styles.body : `${styles.body} ${styles.withAside}`}>
        {view === "month" ? monthView : listView}
        {aside}
        <div className={styles.extras}>
          {view === "month" ? monthEmpty : null}
          <div className={styles.todayRow}>
            <Button
              variant="secondary"
              onClick={() => goToMonth(todayMonth)}
              disabled={showingToday}
            >
              {copy.today}
            </Button>
          </div>
        </div>
      </div>
      {sentences?.offered && !quiet ? <p className={styles.footer}>{sentences.footer}</p> : null}
      {logging === null ? null : (
        <DayLogSheet
          stage={logging}
          today={today}
          date={openDate}
          onClose={() => setOpenDate(null)}
          onDateChange={setOpenDate}
        />
      )}
    </div>
  );
}
