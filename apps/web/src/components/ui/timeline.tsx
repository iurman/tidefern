import type { ReactNode } from "react";
import { compareDates, type CalendarDate } from "@tidefern/core";
import { formatDay } from "./marks-format";
import styles from "./timeline.module.css";

/**
 * A vertical, date-led timeline (DESIGN.md section 4): one row per dated
 * item, a logged item with a filled dot and a solid connector, an expected
 * item (an appointment, a milestone window) with an outlined dot, a dashed
 * connector and the word "Expected", so the distinction never rests on color.
 * `highlightNewest` puts the newest logged row on warmth; it is on only
 * where the screen has no other warmth (/family/[childId]), never on
 * /journey, where the week card is the warmth.
 */

export interface TimelineItem {
  key: string;
  date: CalendarDate;
  title: string;
  detail?: string;
  /** A dated expectation rather than a logged fact. */
  expected?: boolean;
  /** Where the row's title leads, when it opens something. */
  href?: string;
  /**
   * One control for the row, such as an Edit button, drawn under the row's
   * text. It names its row in its accessible name, since every row's
   * control reads the same.
   */
  action?: ReactNode;
}

export interface TimelineProps {
  /** The rows, in the order the screen wants them; the component never sorts. */
  items: TimelineItem[];
  /** A neutral name for the list: "Timeline", "Milestones". Never a health word. */
  label: string;
  /** The newest logged row sits on warmth. */
  highlightNewest?: boolean;
  loading?: boolean;
  error?: string;
  /** The empty state per CONTENT.md: what would be here, why it is not, the one action. */
  empty?: { heading: string; why: string; action?: { label: string; href: string } };
  className?: string;
}

/** The key of the newest logged item, or null when nothing is logged. */
export function newestLoggedKey(items: TimelineItem[]): string | null {
  let newest: TimelineItem | null = null;
  for (const item of items) {
    if (item.expected) continue;
    if (!newest || compareDates(item.date, newest.date) > 0) newest = item;
  }
  return newest ? newest.key : null;
}

export function Timeline(props: TimelineProps) {
  const { items, label, highlightNewest = false, loading = false, error, empty, className } = props;
  const rootClass = [styles.timeline, className].filter(Boolean).join(" ");

  if (loading) {
    return (
      <div className={rootClass} aria-busy="true">
        <p className={styles.text}>Loading</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className={rootClass}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className={rootClass}>
        <p className={styles.emptyHeading}>{empty?.heading ?? "Nothing here yet"}</p>
        <p className={styles.text}>
          {empty?.why ?? "Dated entries appear here as they are added."}
        </p>
        {empty?.action ? (
          <a className={styles.action} href={empty.action.href}>
            {empty.action.label}
          </a>
        ) : null}
      </div>
    );
  }

  const newest = highlightNewest ? newestLoggedKey(items) : null;

  return (
    <ol className={rootClass} aria-label={label}>
      {items.map((item) => {
        const rowClass = [
          styles.row,
          item.expected ? styles.expected : "",
          item.key === newest ? styles.newest : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={item.key} className={rowClass}>
            <time className={styles.date} dateTime={item.date}>
              {formatDay(item.date)}
            </time>
            <span className={styles.marker} aria-hidden="true" />
            <div className={styles.body}>
              <p className={styles.title}>
                {item.href ? (
                  <a className={styles.link} href={item.href}>
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </p>
              {item.detail ? <p className={styles.detail}>{item.detail}</p> : null}
              {item.expected ? <p className={styles.note}>Expected</p> : null}
              {item.action ? <div>{item.action}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
