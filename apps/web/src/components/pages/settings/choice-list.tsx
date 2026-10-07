"use client";
import { useId } from "react";
import styles from "./settings.module.css";

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/**
 * A short list of choices on native radios, one per row, for a choice whose
 * labels are too long for segments (the stage, the closing mode). Arrow keys
 * move between them and Space selects, as on any radio group; the help line
 * beneath is named through `aria-describedby`.
 */
export function ChoiceList<T extends string>({
  legend,
  options,
  value,
  onChange,
  describedBy,
  disabled,
}: {
  legend: string;
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  describedBy?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={styles.choices} aria-describedby={describedBy} disabled={disabled}>
      <legend className={styles.choicesLegend}>{legend}</legend>
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <label key={option.value} className={styles.choice} htmlFor={optionId}>
            <input
              id={optionId}
              type="radio"
              name={`${id}-choice`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
