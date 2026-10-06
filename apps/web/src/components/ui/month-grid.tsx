"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  DayPicker,
  type ChevronProps,
  type ClassNames,
  type DayButtonProps,
  type DayProps,
  type MonthGridProps as PickerGridProps,
} from "react-day-picker";
import { compareDates, type CalendarDate } from "@tidefern/core";
import { Icon } from "@/components/icons";
import { prefersReducedMotion } from "@/lib/motion-tokens";
import {
  dayAccessibleName,
  dayFacts,
  firstOfMonth,
  fromUtcDate,
  monthCaption,
  toUtcDate,
  weekdayHeader,
  weekdayName,
  weekStartIndex,
  type DayMark,
  type DayWindow,
  type WeekStart,
} from "./calendar-dates";
import {
  DayCell,
  dayHostClassName,
  dayOutsideClassName,
  dayTodayClassName,
  edgeClassNames,
  textureClassNames,
} from "./day-cell";
import styles from "./month-grid.module.css";

/** A selected day or an inclusive range; `end` is open while a range is being chosen. */
export interface DaySelection {
  start: CalendarDate;
  end?: CalendarDate | undefined;
}

export interface MonthGridProps {
  /** Today's calendar date for the profile's time zone; never read from the machine. */
  today: CalendarDate;
  /** Any day of the month to show; controlled when given with `onMonthChange`. */
  month?: CalendarDate | undefined;
  /** The month shown first when `month` is not controlled; today's month otherwise. */
  defaultMonth?: CalendarDate | undefined;
  /** Called with the first day of the month the person moved to. */
  onMonthChange?: ((month: CalendarDate) => void) | undefined;
  /** Monday 1 through Sunday 7, the profile's week start. */
  weekStart?: WeekStart | undefined;
  /** BCP 47 tag for the month caption, the headers and the day names. */
  locale?: string | undefined;
  /** Windows drawn as pills behind consecutive days. */
  windows?: DayWindow[] | undefined;
  /** Days that get the small outlined dot under the number. */
  points?: DayMark[] | undefined;
  /** Days that get the 4 px text-colored dot. */
  noted?: DayMark[] | undefined;
  /** The selected day or range; cells in it are named "selected". */
  selected?: DaySelection | undefined;
  /** A range previewed under the pointer while the second day is being chosen. */
  preview?: DaySelection | undefined;
  /** Marks the grid as multi-selectable; the range selection sets it. */
  multiselectable?: boolean | undefined;
  onDaySelect?: ((date: CalendarDate) => void) | undefined;
  /** The day under the pointer, or null when it leaves the grid. */
  onDayHover?: ((date: CalendarDate | null) => void) | undefined;
  /** Prints the key for the three textures under the grid. */
  showLegend?: boolean | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  /** What went wrong and what to do next, shown under the grid. */
  error?: string | undefined;
  /** Shown under the grid when no window, point or noted day is given. */
  emptyMessage?: ReactNode;
  /** Id of the element that names the grid, when the surrounding page has one. */
  "aria-labelledby"?: string | undefined;
}

const legendTextures = [
  { texture: "logged", label: "Logged" },
  { texture: "predicted", label: "Predicted" },
  { texture: "estimated", label: "Estimated" },
] as const;

/** The picker's `day` and `modifiers` props are not DOM attributes; the rest are. */
function domProps<T extends { day: unknown; modifiers: unknown }>(
  props: T,
): Omit<T, "day" | "modifiers"> {
  const rest: Record<string, unknown> = { ...props };
  delete rest.day;
  delete rest.modifiers;
  return rest as Omit<T, "day" | "modifiers">;
}

function Day(props: DayProps) {
  const { modifiers } = props;
  return (
    <td
      {...domProps(props)}
      aria-current={modifiers.today ? "date" : undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-preview={modifiers.preview || undefined}
    />
  );
}

/**
 * The picker moves its roving focus by marking a day `focused` and expecting
 * the button to take focus itself (its own DayButton does the same), so the
 * arrow keys, Home, End and Page Up and Down land where the person expects.
 */
function DayButton(props: DayButtonProps) {
  const { modifiers } = props;
  const { children, ...rest } = domProps(props);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <button ref={ref} {...rest}>
      <DayCell number={children} point={modifiers.point} noted={modifiers.noted} />
    </button>
  );
}

function Chevron({ orientation }: ChevronProps) {
  return <Icon name={orientation === "left" ? "chevron-left" : "chevron-right"} />;
}

function SingleGrid(props: PickerGridProps) {
  return <table {...props} aria-multiselectable={undefined} />;
}

function MultiGrid(props: PickerGridProps) {
  return <table {...props} aria-multiselectable={true} />;
}

const singleComponents = { Day, DayButton, Chevron, MonthGrid: SingleGrid };
const multiComponents = { Day, DayButton, Chevron, MonthGrid: MultiGrid };

const classNames: Partial<ClassNames> = {
  root: styles.picker,
  months: styles.months,
  month: styles.month,
  nav: styles.nav,
  button_previous: styles.navButton,
  button_next: styles.navButton,
  chevron: styles.chevron,
  month_caption: styles.caption,
  caption_label: styles.captionLabel,
  month_grid: styles.grid,
  weekdays: styles.weekdays,
  weekday: styles.weekday,
  weeks: styles.weeks,
  week: styles.week,
  day: `${styles.day} ${dayHostClassName}`,
  day_button: styles.dayButton,
  today: dayTodayClassName,
  outside: dayOutsideClassName,
  focused: styles.focused,
  disabled: styles.disabled,
  hidden: styles.hidden,
  selected: styles.selected,
  range_start: styles.rangeStart,
  range_middle: styles.rangeMiddle,
  range_end: styles.rangeEnd,
  footer: styles.footer,
  weeks_before_enter: styles.enter,
  weeks_after_enter: styles.enter,
  weeks_before_exit: styles.exit,
  weeks_after_exit: styles.exit,
  caption_before_enter: styles.enter,
  caption_after_enter: styles.enter,
  caption_before_exit: styles.exit,
  caption_after_exit: styles.exit,
};

const modifiersClassNames = {
  logged: textureClassNames.logged,
  predicted: textureClassNames.predicted,
  estimated: textureClassNames.estimated,
  edge_start: edgeClassNames.start,
  edge_middle: edgeClassNames.middle,
  edge_end: edgeClassNames.end,
  edge_single: edgeClassNames.single,
  preview: styles.preview ?? "",
};

function inSelection(date: CalendarDate, selection: DaySelection | undefined): boolean {
  if (!selection) return false;
  const end = selection.end ?? selection.start;
  return compareDates(date, selection.start) >= 0 && compareDates(date, end) <= 0;
}

function subscribeToMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The calendar month (DESIGN.md 6.2, 3.4) over react-day-picker 10.0.2: seven
 * columns with two-letter headers, greyed neighbours, a per-day accessible
 * name, the window pills, the outlined dot, the noted dot and the tide line
 * under today's row. Every date in and out is a `YYYY-MM-DD` string; the
 * picker runs in UTC so the machine's zone never shifts a day. The keyboard
 * model is the APG date picker grid: arrows move by day and week, Home and
 * End to the week's bounds, Page Up and Page Down by month, Enter or Space
 * selects.
 */
export function MonthGrid({
  today,
  month,
  defaultMonth,
  onMonthChange,
  weekStart = 1,
  locale = "en-US",
  windows,
  points,
  noted,
  selected,
  preview,
  multiselectable = false,
  onDaySelect,
  onDayHover,
  showLegend = false,
  disabled = false,
  loading = false,
  error,
  emptyMessage,
  "aria-labelledby": labelledBy,
}: MonthGridProps) {
  const [internalMonth, setInternalMonth] = useState(() =>
    firstOfMonth(defaultMonth ?? month ?? today),
  );
  const shownMonth = firstOfMonth(month ?? internalMonth);
  const facts = useMemo(() => dayFacts({ windows, points, noted }), [windows, points, noted]);
  const reduced = useSyncExternalStore(
    subscribeToMotion,
    () => prefersReducedMotion(),
    () => true,
  );

  const modifiers = useMemo(() => {
    const has = (key: "texture" | "point" | "noted", value?: string) => (date: Date) => {
      const day = facts.get(fromUtcDate(date));
      if (!day) return false;
      return value ? day[key] === value : Boolean(day[key]);
    };
    const edge = (value: string) => (date: Date) => facts.get(fromUtcDate(date))?.edge === value;
    const range = (which: "start" | "middle" | "end") => (date: Date) => {
      if (!selected?.end) return false;
      const iso = fromUtcDate(date);
      if (which === "start") return iso === selected.start;
      if (which === "end") return iso === selected.end;
      return inSelection(iso, selected) && iso !== selected.start && iso !== selected.end;
    };
    return {
      logged: has("texture", "logged"),
      predicted: has("texture", "predicted"),
      estimated: has("texture", "estimated"),
      edge_start: edge("start"),
      edge_middle: edge("middle"),
      edge_end: edge("end"),
      edge_single: edge("single"),
      point: has("point"),
      noted: has("noted"),
      selected: (date: Date) => inSelection(fromUtcDate(date), selected),
      range_start: range("start"),
      range_middle: range("middle"),
      range_end: range("end"),
      preview: (date: Date) => inSelection(fromUtcDate(date), preview),
    };
  }, [facts, selected, preview]);

  const labels = useMemo(
    () => ({
      labelDayButton: (date: Date, dayModifiers: Record<string, boolean>) =>
        dayAccessibleName({
          date: fromUtcDate(date),
          today,
          locale,
          selected: dayModifiers.selected,
          words: facts.get(fromUtcDate(date))?.words,
        }),
      labelGridcell: (date: Date) =>
        dayAccessibleName({
          date: fromUtcDate(date),
          today,
          locale,
          words: facts.get(fromUtcDate(date))?.words,
        }),
      labelGrid: (date: Date) => monthCaption(fromUtcDate(date), locale),
      labelWeekday: (date: Date) => weekdayName(fromUtcDate(date), locale),
      labelNav: () => "Months",
      labelPrevious: () => "Previous month",
      labelNext: () => "Next month",
    }),
    [facts, today, locale],
  );

  const formatters = useMemo(
    () => ({
      formatCaption: (date: Date) => monthCaption(fromUtcDate(date), locale),
      formatWeekdayName: (date: Date) => weekdayHeader(fromUtcDate(date), locale),
      formatDay: (date: Date) => String(date.getUTCDate()),
    }),
    [locale],
  );

  const hasFacts = facts.size > 0;
  const footer = error ? (
    <span className={styles.error}>{error}</span>
  ) : loading ? (
    <span>Loading</span>
  ) : !hasFacts && emptyMessage ? (
    <span className={styles.empty}>{emptyMessage}</span>
  ) : undefined;

  return (
    <div
      className={styles.monthGrid}
      aria-busy={loading || undefined}
      data-disabled={disabled || undefined}
    >
      <DayPicker
        timeZone="UTC"
        today={toUtcDate(today)}
        month={toUtcDate(shownMonth)}
        onMonthChange={(next) => {
          const first = firstOfMonth(fromUtcDate(next));
          setInternalMonth(first);
          onMonthChange?.(first);
        }}
        weekStartsOn={weekStartIndex(weekStart)}
        showOutsideDays
        animate={!reduced}
        disabled={disabled || undefined}
        disableNavigation={disabled}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        classNames={classNames}
        components={multiselectable ? multiComponents : singleComponents}
        labels={labels}
        formatters={formatters}
        footer={footer}
        aria-labelledby={labelledBy}
        onDayClick={(date) => {
          if (!disabled) onDaySelect?.(fromUtcDate(date));
        }}
        onDayMouseEnter={(date) => onDayHover?.(fromUtcDate(date))}
        onDayMouseLeave={() => onDayHover?.(null)}
      />
      {showLegend ? (
        <ul className={styles.legend} aria-label="Key">
          {legendTextures.map((entry) => (
            <li key={entry.texture} className={styles.legendItem}>
              <span
                className={`${styles.key} ${textureClassNames[entry.texture]}`}
                aria-hidden="true"
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
