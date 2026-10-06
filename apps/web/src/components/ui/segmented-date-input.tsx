"use client";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { isCalendarDate } from "@tidefern/core";
import styles from "./segmented-date-input.module.css";

export type DateOrder = "dmy" | "mdy" | "ymd";
export type DatePart = "day" | "month" | "year";

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

export interface SegmentedDateInputProps {
  label: string;
  /** The profile's field order. */
  order: DateOrder;
  help?: string;
  error?: string;
  /** Controlled value as YYYY-MM-DD; pair it with `onChange`. */
  value?: string;
  defaultValue?: string;
  /** The composed YYYY-MM-DD when the three parts make a real date, otherwise null. */
  onChange?: (value: string | null) => void;
  /** The date the example line shows, YYYY-MM-DD. */
  example?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const partLabels: Record<DatePart, string> = { day: "Day", month: "Month", year: "Year" };
const partLength: Record<DatePart, number> = { day: 2, month: 2, year: 4 };

/** The parts in the order the profile reads them. */
export function segmentOrder(order: DateOrder): DatePart[] {
  switch (order) {
    case "dmy":
      return ["day", "month", "year"];
    case "mdy":
      return ["month", "day", "year"];
    case "ymd":
      return ["year", "month", "day"];
  }
}

/** YYYY-MM-DD into parts, or blanks for anything that is not a calendar date. */
export function splitCalendarDate(value: string | undefined): DateParts {
  if (!value || !isCalendarDate(value)) return { day: "", month: "", year: "" };
  const [year, month, day] = value.split("-") as [string, string, string];
  return { day, month, year };
}

/**
 * Three typed parts into YYYY-MM-DD, padded, when they make a real date
 * (checked by core's `isCalendarDate`, so 31 02 2027 is rejected); null while
 * a part is missing or the date does not exist.
 */
export function composeCalendarDate(parts: DateParts): string | null {
  const { day, month, year } = parts;
  if (!day || !month || year.length !== 4) return null;
  const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCalendarDate(candidate) ? candidate : null;
}

/** The example line in the profile's order: "For example, 03 04 2027". */
export function exampleLine(order: DateOrder, example: string): string {
  const parts = splitCalendarDate(example);
  return `For example, ${segmentOrder(order)
    .map((part) => parts[part])
    .join(" ")}`;
}

function isComplete(parts: DateParts): boolean {
  return Boolean(parts.day && parts.month && parts.year.length === 4);
}

/**
 * The date entry for a due date, a birth date or a period start (architecture
 * 13.6: a segmented text input, never a picker). Three numeric fields in the
 * profile's order with an example line, `inputMode="numeric"`, auto-advance
 * when a part is full, and a result reported as YYYY-MM-DD only when core
 * agrees the date exists.
 */
export function SegmentedDateInput({
  label,
  order,
  help,
  error,
  value,
  defaultValue,
  onChange,
  example = "2027-04-03",
  required,
  disabled,
  id,
  className,
}: SegmentedDateInputProps) {
  const generated = useId();
  const baseId = id ?? `${generated}-date`;
  const helpId = `${baseId}-help`;
  const exampleId = `${baseId}-example`;
  const errorId = `${baseId}-error`;
  const [internal, setInternal] = useState<DateParts>(() => splitCalendarDate(defaultValue));
  const [lastValue, setLastValue] = useState(value);
  if (value !== undefined && value !== lastValue) {
    setLastValue(value);
    setInternal(splitCalendarDate(value));
  }
  const parts = internal;
  const sequence = segmentOrder(order);
  const inputs = useRef<Partial<Record<DatePart, HTMLInputElement | null>>>({});

  const invalid = isComplete(parts) && composeCalendarDate(parts) === null;
  const message =
    error ?? (invalid ? "That date does not exist. Check the day and the month." : undefined);
  const describedBy = [help ? helpId : null, exampleId, message ? errorId : null]
    .filter(Boolean)
    .join(" ");

  function update(part: DatePart, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, partLength[part]);
    const next = { ...parts, [part]: digits };
    setInternal(next);
    onChange?.(composeCalendarDate(next));
    const position = sequence.indexOf(part);
    const following = sequence[position + 1];
    if (digits.length === partLength[part] && following && digits !== parts[part]) {
      inputs.current[following]?.focus();
      inputs.current[following]?.select();
    }
  }

  return (
    <fieldset
      className={[styles.group, className].filter(Boolean).join(" ")}
      disabled={disabled}
      aria-describedby={describedBy}
      data-invalid={message ? true : undefined}
    >
      <legend className={styles.legend}>
        {label}
        {required ? <span className={styles.required}> required</span> : null}
      </legend>
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      <div className={styles.parts}>
        {sequence.map((part) => (
          <label key={part} className={styles.part} data-part={part}>
            <span className={styles.partLabel}>{partLabels[part]}</span>
            <input
              ref={(node) => {
                inputs.current[part] = node;
              }}
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={partLength[part]}
              size={partLength[part]}
              value={parts[part]}
              onChange={(event) => update(part, event)}
              aria-invalid={message ? true : undefined}
              aria-required={required ? true : undefined}
              required={required}
            />
          </label>
        ))}
      </div>
      <p className={styles.example} id={exampleId}>
        {exampleLine(order, example)}
      </p>
      {message ? (
        <p className={styles.error} id={errorId}>
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
