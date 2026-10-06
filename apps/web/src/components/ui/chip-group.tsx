"use client";
import { useId, useState } from "react";
import { SymptomCode } from "@tidefern/schemas";
import styles from "./chip-group.module.css";

export interface ChipOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string = string> {
  /** The group's name, shown as the legend. */
  label: string;
  options: readonly ChipOption<T>[];
  /** Controlled selection; pair it with `onChange`. */
  selected?: readonly T[];
  defaultSelected?: readonly T[];
  onChange?: (selected: T[]) => void;
  /** How many chips show before "More"; the rest reveal in place. */
  visible?: number;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** A label from a schema code: "tender_breasts" reads "Tender breasts". */
export function labelFromCode(code: string): string {
  const words = code.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The symptom vocabulary from the schema, labelled for the day sheet. */
export const symptomOptions: ChipOption<SymptomCode>[] = SymptomCode.options.map((value) => ({
  value,
  label: labelFromCode(value),
}));

/** Pure selection rule: a press adds the value, a second press removes it. Order is kept. */
export function toggleSelection<T extends string>(selected: readonly T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

/**
 * Multi-select chips: pressed buttons at 44 px on the action fill. The first
 * `visible` chips show at once; "More" reveals the rest in place and becomes
 * "Fewer". A chip carries only its visible text: no code lands in an id, a
 * name or a data attribute, because the vocabulary is health data.
 */
export function ChipGroup<T extends string = string>({
  label,
  options,
  selected,
  defaultSelected = [],
  onChange,
  visible = 8,
  error,
  disabled,
  className,
}: ChipGroupProps<T>) {
  const id = useId();
  const errorId = `${id}-error`;
  const moreId = `${id}-more`;
  const [internal, setInternal] = useState<readonly T[]>(defaultSelected);
  const current = selected ?? internal;
  const hidden = options.slice(visible);
  const [expanded, setExpanded] = useState(() =>
    hidden.some((option) => current.includes(option.value)),
  );

  function press(value: T) {
    const next = toggleSelection(current, value);
    if (selected === undefined) setInternal(next);
    onChange?.(next);
  }

  const chip = (option: ChipOption<T>) => (
    <li key={option.value}>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={current.includes(option.value)}
        disabled={disabled}
        onClick={() => press(option.value)}
      >
        {option.label}
      </button>
    </li>
  );

  return (
    <fieldset
      className={[styles.group, className].filter(Boolean).join(" ")}
      disabled={disabled}
      aria-describedby={error ? errorId : undefined}
      data-invalid={error ? true : undefined}
    >
      <legend className={styles.legend}>{label}</legend>
      <ul className={styles.chips}>
        {options.slice(0, visible).map(chip)}
        {hidden.length ? (
          <li>
            <button
              type="button"
              className={styles.more}
              aria-expanded={expanded}
              aria-controls={moreId}
              disabled={disabled}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "Fewer" : `More (${hidden.length})`}
            </button>
          </li>
        ) : null}
      </ul>
      {hidden.length ? (
        <ul className={styles.chips} id={moreId} hidden={!expanded}>
          {hidden.map(chip)}
        </ul>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
