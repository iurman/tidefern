"use client";
import { useId, useState } from "react";
import { compareDates, diffDays, type CalendarDate } from "@tidefern/core";
import { shortDate, type DayMark, type DayWindow, type WeekStart } from "./calendar-dates";
import { MonthGrid, type DaySelection } from "./month-grid";
import styles from "./date-range-selection.module.css";

/**
 * Tidefern's range rules (architecture 13.6, DESIGN.md section 4): the first
 * tap starts the range, the second ends it, the two are swapped when the
 * second is earlier, and a tap after a complete range starts over. Tapping
 * the first day again makes a one-day range.
 */
export function selectRange(current: DaySelection | undefined, tapped: CalendarDate): DaySelection {
  if (!current || current.end) return { start: tapped };
  if (compareDates(tapped, current.start) < 0) return { start: tapped, end: current.start };
  return { start: current.start, end: tapped };
}

/** The range the pointer would complete, swapped the same way; nothing until a start exists. */
export function previewRange(
  current: DaySelection | undefined,
  hovered: CalendarDate | null,
): DaySelection | undefined {
  if (!current || current.end || !hovered || hovered === current.start) return undefined;
  return compareDates(hovered, current.start) < 0
    ? { start: hovered, end: current.start }
    : { start: current.start, end: hovered };
}

/** The sentence the control reads as its value, which is also part of its name (RESEARCH.md decision 5). */
export function describeRange(range: DaySelection | undefined, locale: string): string {
  if (!range) return "No days chosen yet. Choose the first day.";
  if (!range.end) return `From ${shortDate(range.start, locale)}. Choose the last day.`;
  const days = diffDays(range.start, range.end) + 1;
  const count = days === 1 ? "1 day" : `${days} days`;
  return `${shortDate(range.start, locale)} to ${shortDate(range.end, locale)}, ${count}.`;
}

export interface DateRangeSelectionProps {
  /** What the range is for, in sentence case: "Days to share". */
  label: string;
  today: CalendarDate;
  value?: DaySelection | undefined;
  defaultValue?: DaySelection | undefined;
  onChange?: ((range: DaySelection) => void) | undefined;
  month?: CalendarDate | undefined;
  defaultMonth?: CalendarDate | undefined;
  onMonthChange?: ((month: CalendarDate) => void) | undefined;
  weekStart?: WeekStart | undefined;
  locale?: string | undefined;
  windows?: DayWindow[] | undefined;
  points?: DayMark[] | undefined;
  noted?: DayMark[] | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  error?: string | undefined;
}

/**
 * A range chosen on the month grid. The grid keeps the APG date picker
 * keyboard model; Enter or Space on a day is the tap. The sentence above the
 * grid reads the value and is announced as it changes. Cells in the range are
 * named "selected" and carry `data-range-start`, `-middle` and `-end`.
 */
export function DateRangeSelection({
  label,
  today,
  value,
  defaultValue,
  onChange,
  month,
  defaultMonth,
  onMonthChange,
  weekStart,
  locale = "en-US",
  windows,
  points,
  noted,
  disabled,
  loading,
  error,
}: DateRangeSelectionProps) {
  const [internal, setInternal] = useState<DaySelection | undefined>(defaultValue);
  const [hovered, setHovered] = useState<CalendarDate | null>(null);
  const range = value ?? internal;
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;

  return (
    <div className={styles.root} role="group" aria-labelledby={`${labelId} ${valueId}`}>
      <p className={styles.label} id={labelId}>
        {label}
      </p>
      <p className={styles.value} id={valueId} aria-live="polite">
        {describeRange(range, locale)}
      </p>
      <MonthGrid
        today={today}
        month={month}
        defaultMonth={defaultMonth ?? range?.start}
        onMonthChange={onMonthChange}
        weekStart={weekStart}
        locale={locale}
        windows={windows}
        points={points}
        noted={noted}
        selected={range}
        preview={previewRange(range, hovered)}
        multiselectable
        onDaySelect={(date) => {
          const next = selectRange(range, date);
          setInternal(next);
          onChange?.(next);
        }}
        onDayHover={setHovered}
        disabled={disabled}
        loading={loading}
        error={error}
        aria-labelledby={`${labelId} ${valueId}`}
      />
    </div>
  );
}
