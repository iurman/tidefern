"use client";
import { useId } from "react";
import styles from "./segmented-control.module.css";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  /** The group's name, shown as the legend. Pass `hideLabel` to keep it for assistive tech only. */
  label: string;
  hideLabel?: boolean;
  options: readonly SegmentedOption<T>[];
  /** Controlled value; pair it with `onChange`. */
  value?: T;
  /** Starting value when uncontrolled. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Group error, named under the control and announced through `aria-describedby`. */
  error?: string;
  disabled?: boolean;
  /** Selected fill: the action color, or the period data color for the flow scale. */
  tone?: "action" | "period";
  /** The form name the radios share; generated and neutral when absent. */
  name?: string;
  className?: string;
}

/**
 * A radio group drawn as segments. Native radios carry the semantics
 * (arrow keys move, Space selects, one tab stop), and each radio sits over
 * its own label so the global focus ring draws around the segment. Choosing a
 * segment swaps content in place by the caller's hand; it never navigates.
 */
export function SegmentedControl<T extends string = string>({
  label,
  hideLabel,
  options,
  value,
  defaultValue,
  onChange,
  error,
  disabled,
  tone = "action",
  name,
  className,
}: SegmentedControlProps<T>) {
  const id = useId();
  const groupName = name ?? `${id}-segment`;
  const errorId = `${id}-error`;
  const controlled = value !== undefined;

  return (
    <fieldset
      className={[styles.group, className].filter(Boolean).join(" ")}
      data-tone={tone}
      disabled={disabled}
      aria-describedby={error ? errorId : undefined}
      data-invalid={error ? true : undefined}
    >
      <legend className={hideLabel ? "sr-only" : styles.legend}>{label}</legend>
      <div className={styles.segments}>
        {options.map((option, index) => {
          const optionId = `${id}-option-${index}`;
          return (
            <span key={option.value} className={styles.segment}>
              <input
                className={styles.radio}
                type="radio"
                id={optionId}
                name={groupName}
                value={option.value}
                checked={controlled ? value === option.value : undefined}
                defaultChecked={controlled ? undefined : defaultValue === option.value}
                onChange={onChange ? () => onChange(option.value) : undefined}
                readOnly={controlled && !onChange ? true : undefined}
              />
              <label className={styles.text} htmlFor={optionId}>
                {option.label}
              </label>
            </span>
          );
        })}
      </div>
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
