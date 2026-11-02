"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
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
  logHref,
  shiftMonth,
  viewFromParam,
  type CalendarDay,
  type CalendarViewName,
} from "./calendar-model";
import { calendarCopy as copy } from "./copy";
import styles from "./calendar.module.css";

export interface CalendarViewProps {
  /** Today in her time zone, from the API (GET /v1/me). */
  today: CalendarDate;
  /** The first day of the month the server read. */
  month: CalendarDate;
  weekStart: WeekStart;
  stage: Stage;
  /** The days the server read (the grid's and one either side): entries and the dates notes sit on. */
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

/** The control that opened the sheet and the day the sheet showed last. */
interface ReturnTarget {
  opener: HTMLElement | null;
  date: CalendarDate;
}

/**
 * The calendar (DESIGN.md 3.4, 6.2 and 6.3): Month and List as a segmented
 * control that swaps the view in place, the month grid with the legend and
 * "Nothing logged this month" outside it, the list with this week's strip
 * over the month's logged days, and the prediction sentences of
 * architecture 13.10 beside them. A day opens G9's day sheet over the
 * calendar (a dialog from 1024 px, a bottom sheet below), which loads the
 * day itself; a save there refreshes this page from the server.
 *
 * Months are addresses (`?month=YYYY-MM`), read on the server. A move shows
 * the month asked for at once, drawn with what has been read so far while
 * the grid and the list say "Loading", so a second press steps on from it.
 * The view is part of the address too (`?view=list`): the switch writes it
 * with `replaceState`, and the view follows the address when a link, Back
 * or Forward changes it. No browser storage holds either.
 */
export function CalendarView({
  today,
  month,
  weekStart,
  stage,
  days,
  prediction,
  childLine = null,
}: CalendarViewProps) {
  const router = useRouter();
  const search = useSearchParams();
  const addressView = viewFromParam(search.get("view") ?? undefined);
  const [view, setView] = useState<CalendarViewName>(addressView);
  const [followedView, setFollowedView] = useState<CalendarViewName>(addressView);
  const [openDate, setOpenDate] = useState<CalendarDate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requested, setRequested] = useState<CalendarDate | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<ReturnTarget | null>(null);

  if (followedView !== addressView) {
    // The address changed without the switch (a link to the calendar, Back, Forward): follow it.
    setFollowedView(addressView);
    setView(addressView);
    setNotice(null);
  }

  const logging = isLoggingStage(stage) ? stage : null;
  const todayMonth = firstOfMonth(today);
  // The month on its way while a move is pending, the server's month once it lands.
  const shown = pending && requested !== null ? requested : month;
  const showingToday = inMonth(today, shown);

  const marks = useMemo(() => calendarMarks(days, prediction), [days, prediction]);
  const range = gridRange(shown, weekStart);
  const drawsTexture = marks.windows.some(
    (window) =>
      compareDates(window.end, range.from) >= 0 && compareDates(window.start, range.to) <= 0,
  );
  const sentences = prediction === null ? null : predictionCopy(prediction);
  const quiet = stage === "postpartum" && prediction !== null && prediction.basis === "none";
  const items = listItems(days, shown);

  /** That day's cell in the grid or its row in the list, else the heading. */
  function landingFor(date: CalendarDate): HTMLElement | null {
    const body = bodyRef.current;
    return (
      body?.querySelector<HTMLElement>(`td[data-day="${date}"] button:not(:disabled)`) ??
      body?.querySelector<HTMLElement>(`a[href="${logHref(date)}"]`) ??
      titleRef.current
    );
  }

  useEffect(() => {
    // The dialog gives focus back to the control that opened it, which a save can take away
    // (a first log removes the empty state and its Log today, before or after the sheet closes).
    // Focus then lands on the day in the view, or on the heading, never on the page's body.
    const target = returnTo.current;
    if (openDate !== null || target === null) return;
    if (target.opener?.isConnected) {
      // Still there; a refresh that lands later can still remove it, so watch while focus stays.
      if (document.activeElement !== target.opener) returnTo.current = null;
      return;
    }
    returnTo.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    landingFor(target.date)?.focus();
  });

  function switchView(next: CalendarViewName) {
    setView(next);
    setNotice(null);
    // The address follows the view so a reload keeps it; this is not a navigation.
    window.history.replaceState(null, "", calendarHref({ month, view: next, today }));
  }

  function goToMonth(target: CalendarDate) {
    setNotice(null);
    setRequested(target);
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
    const active = document.activeElement;
    returnTo.current = {
      opener: active instanceof HTMLElement && active !== document.body ? active : null,
      date,
    };
    setOpenDate(date);
  }

  function moveSheet(date: CalendarDate) {
    if (returnTo.current !== null) returnTo.current.date = date;
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

  // The empty states' one action. The none stage is never asked a body question, and while the
  // postpartum card shows, its own button is the page's one way to log.
  const logToday =
    logging === null || quiet ? undefined : (
      <Button variant="primary" onClick={() => openDay(today)}>
        {copy.monthEmpty.action}
      </Button>
    );

  /** What a press said, in whichever view took it. */
  const noticeLine = (className: string | undefined) => (
    <p className={className} aria-live="polite">
      {notice}
    </p>
  );

  const monthView = (
    <div className={styles.view}>
      <div className={styles.grid}>
        {/* The none stage's grid shows the dates and nothing to press. */}
        <MonthGrid
          today={today}
          month={shown}
          onMonthChange={goToMonth}
          weekStart={weekStart}
          windows={marks.windows}
          points={marks.points}
          noted={marks.noted}
          onDaySelect={logging === null ? undefined : openDay}
          showLegend={drawsTexture}
          loading={pending}
          disabled={logging === null}
        />
      </div>
      {noticeLine(styles.notice)}
    </div>
  );

  // Outside the grid, after what the prediction says: a month can be empty and still hold
  // predictions. Not while a month is on its way, when only part of it has been read.
  const monthEmpty =
    pending || hasLoggedDayIn(days, shown) ? null : (
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
        <h2 className={styles.listMonth}>{monthCaption(shown, "en-US")}</h2>
        <div className={styles.listNav}>
          <Button
            variant="quiet"
            icon="chevron-left"
            onClick={() => goToMonth(shiftMonth(shown, -1))}
            disabled={logging === null}
          >
            {copy.previousMonth}
          </Button>
          <Button
            variant="quiet"
            icon="chevron-right"
            onClick={() => goToMonth(shiftMonth(shown, 1))}
            disabled={logging === null || compareDates(shown, todayMonth) >= 0}
          >
            {copy.nextMonth}
          </Button>
        </div>
      </div>
      {items.length === 0 && !pending ? (
        <EmptyState
          heading={copy.listEmpty.heading}
          why={copy.listEmpty.why}
          action={logToday}
          level={3}
        />
      ) : (
        <div onClickCapture={openFromRow}>
          {/* Right above the rows a press can reach, so a row that cannot open says why there. */}
          {noticeLine(`${styles.notice} ${styles.listNotice}`)}
          <DayList today={today} items={items} label={copy.listLabel(shown)} loading={pending} />
        </div>
      )}
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
        {/* Focus can land here when the control that opened the sheet is gone and so is the day. */}
        <h1 ref={titleRef} className={styles.title} tabIndex={-1}>
          {copy.heading}
        </h1>
        <SegmentedControl<CalendarViewName>
          label={copy.viewLabel}
          hideLabel
          options={viewOptions}
          value={view}
          onChange={switchView}
        />
      </div>
      {/* The sentences sit beside the view on a wide page and straight under it on a narrow one. */}
      <div
        ref={bodyRef}
        className={aside === null ? styles.body : `${styles.body} ${styles.withAside}`}
      >
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
          onDateChange={moveSheet}
        />
      )}
    </div>
  );
}
