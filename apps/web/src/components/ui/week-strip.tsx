import { addDays, type CalendarDate } from "@tidefern/core";
import {
  dayAccessibleName,
  dayFacts,
  startOfWeek,
  weekdayHeader,
  type DayMark,
  type DayWindow,
  type WeekStart,
} from "./calendar-dates";
import { DayCell, dayCellClassNames } from "./day-cell";
import styles from "./week-strip.module.css";

export interface WeekStripProps {
  today: CalendarDate;
  /** Any day of the week to show; today's week otherwise. */
  week?: CalendarDate | undefined;
  weekStart?: WeekStart | undefined;
  locale?: string | undefined;
  windows?: DayWindow[] | undefined;
  points?: DayMark[] | undefined;
  noted?: DayMark[] | undefined;
  /** The list's name; "This week" when the strip shows today's week. */
  label?: string | undefined;
}

/**
 * The seven days above the list view (DESIGN.md 6.3) with the same textures
 * as the month grid and today on the warmth surface. It is a reading, not a
 * control: the warmth surface never hosts a control (DESIGN.md section 8),
 * and the rows below open each day. Each day carries its full name for
 * screen readers; the two-letter header and the number are decorative.
 */
export function WeekStrip({
  today,
  week,
  weekStart = 1,
  locale = "en-US",
  windows,
  points,
  noted,
  label = "This week",
}: WeekStripProps) {
  const first = startOfWeek(week ?? today, weekStart);
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const facts = dayFacts({ windows, points, noted });
  return (
    <ol className={styles.root} aria-label={label}>
      {days.map((date) => {
        const day = facts.get(date);
        const isToday = date === today;
        return (
          <li
            key={date}
            className={`${styles.item} ${dayCellClassNames({ texture: day?.texture, edge: day?.edge, today: isToday })}`}
            aria-current={isToday ? "date" : undefined}
          >
            <span className="sr-only">
              {dayAccessibleName({ date, today, locale, words: day?.words })}
            </span>
            <span className={styles.content} aria-hidden="true">
              <span className={styles.weekday}>{weekdayHeader(date, locale)}</span>
              <DayCell number={Number(date.slice(8, 10))} point={day?.point} noted={day?.noted} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
