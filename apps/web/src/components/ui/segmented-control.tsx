"use client";
import { useId, type CSSProperties, type ReactNode } from "react";
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
  /**
   * Controlled value; pair it with `onChange`. `null` is controlled with
   * nothing chosen yet: no radio is checked until she picks one.
   */
  value?: T | null;
  /** Starting value when uncontrolled. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Group error, named under the control and announced through `aria-describedby`. */
  error?: string;
  disabled?: boolean;
  /** Selected fill: the action color, or the period data color for the flow scale. */
  tone?: "action" | "period";
  /**
   * How the segments share the width. `pill` (the default) is the round
   * pill at the options' own widths. `columns` is that pill wherever the
   * group is at least 26rem wide; narrower, the options become equal columns
   * with the control radius and the caption size that shrink together; and
   * below the option count times 3.625rem, one option per row, so the pill
   * never folds into uneven rows. That 3.625rem column is fixed, not
   * measured: it holds "Spotting" at the caption size, the longest label the
   * flow and mood scales use. A longer label needs the column widened in
   * the stylesheet first; otherwise its column grows past the others instead
   * of the options stacking, and the row can overflow its track. The group
   * measures its own width for this, so it fills the width it is given and
   * never sizes itself to its content.
   */
  layout?: "pill" | "columns";
  /**
   * A quiet control that belongs to the group, such as a Clear: beside the
   * pill when they fit on one row, under the options otherwise.
   */
  action?: ReactNode;
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
  layout = "pill",
  action,
  name,
  className,
}: SegmentedControlProps<T>) {
  const id = useId();
  const groupName = name ?? `${id}-segment`;
  const errorId = `${id}-error`;
  const controlled = value !== undefined;
  const columns = layout === "columns";

  return (
    <fieldset
      className={[
        styles.group,
        columns ? styles.columns : null,
        tone === "period" ? styles.periodTone : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      // The number of options sets the width below which the columns stack.
      style={columns ? ({ "--segment-count": options.length } as CSSProperties) : undefined}
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
      {/* After the options, never around them, so the radios keep their focus when it comes and goes. */}
      {action ? <div className={styles.action}>{action}</div> : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
