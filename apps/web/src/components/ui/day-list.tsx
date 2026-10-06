import Link from "next/link";
import type { ReactNode } from "react";
import { compareDates, type CalendarDate } from "@tidefern/core";
import { Icon } from "@/components/icons";
import { longDate, shortDate } from "./calendar-dates";
import styles from "./day-list.module.css";

export interface DayListItem {
  date: CalendarDate;
  /** What was logged that day, in the caller's words. */
  summary: string;
  /** The day sheet route for this day. */
  href: string;
}

export interface DayListEmptyState {
  heading: string;
  why: string;
  /** The one action that changes it, as a link or button. */
  action?: ReactNode;
}

export interface DayListProps {
  today: CalendarDate;
  items: DayListItem[];
  locale?: string | undefined;
  /** The list's accessible name. */
  label?: string | undefined;
  loading?: boolean | undefined;
  /** What went wrong and what to do next. */
  error?: string | undefined;
  /** Shown when there are no items; follows the formula in CONTENT.md. */
  empty?: DayListEmptyState | undefined;
}

/**
 * The list view rows (DESIGN.md 6.3): newest first, each row the date, what
 * was logged in words and a chevron to the day sheet. The row for today is a
 * plain row labelled "Today". Rows are links, so the sound provider's
 * delegation covers them and the list itself has no disabled state.
 */
export function DayList({
  today,
  items,
  locale = "en-US",
  label = "Days",
  loading = false,
  error,
  empty,
}: DayListProps) {
  const sorted = [...items].sort((a, b) => compareDates(b.date, a.date));
  const showEmpty = sorted.length === 0 && !loading && !error && empty;
  return (
    <div className={styles.root} aria-busy={loading || undefined}>
      {error ? (
        <p className={styles.error} role="status">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className={styles.status} role="status">
          Loading
        </p>
      ) : null}
      {showEmpty ? (
        <div className={styles.empty}>
          <p className={styles.emptyHeading}>{empty.heading}</p>
          <p className={styles.emptyWhy}>{empty.why}</p>
          {empty.action}
        </div>
      ) : null}
      {sorted.length > 0 ? (
        <ol className={styles.list} aria-label={label}>
          {sorted.map((item) => {
            const isToday = item.date === today;
            return (
              <li key={item.date}>
                <Link href={item.href} className={styles.row} prefetch={false}>
                  <span className={`${styles.date} tabular`}>
                    {isToday ? "Today" : shortDate(item.date, locale)}
                    {isToday ? (
                      <span className="sr-only">, {longDate(item.date, locale)}</span>
                    ) : null}
                  </span>
                  <span className={styles.summary}>{item.summary}</span>
                  <Icon name="chevron-right" className={styles.chevron} />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
