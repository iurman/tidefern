"use client";
import { useId } from "react";
import styles from "./option-cards.module.css";

export interface OptionCard<T extends string> {
  value: T;
  title: string;
  /** One line under the title; a compact list carries none. */
  line?: string;
}

export interface OptionCardsProps<T extends string> {
  /** A visible legend; or `labelledBy` when a heading above already names the group. */
  legend?: string;
  labelledBy?: string;
  options: readonly OptionCard<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Names the next step under the group, tied to it with `aria-describedby`. */
  error?: string | undefined;
  /** Rows of one line each, for a list such as the dating method. */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * A single choice drawn as cards stacked in one column, one native radio
 * per card (DESIGN.md 3.2, the stage cards and the dating method list). As
 * in the shared segmented control, the radio covers its card, transparent,
 * so a click or a tap anywhere on the card lands on the input itself: the
 * sound provider gives it the press cue and the touch haptic, the global
 * focus ring draws around the card, and the arrow keys move the choice
 * with one tab stop for the group.
 */
export function OptionCards<T extends string>({
  legend,
  labelledBy,
  options,
  value,
  onChange,
  error,
  compact = false,
  disabled,
}: OptionCardsProps<T>) {
  const id = useId();
  const name = `${id}-choice`;
  const errorId = `${id}-error`;
  return (
    <fieldset
      className={[styles.group, compact ? styles.compact : null].filter(Boolean).join(" ")}
      aria-labelledby={legend ? undefined : labelledBy}
      aria-describedby={error ? errorId : undefined}
      data-invalid={error ? true : undefined}
      disabled={disabled}
    >
      {legend ? <legend className={styles.legend}>{legend}</legend> : null}
      <div className={styles.options}>
        {options.map((option, index) => {
          const optionId = `${id}-option-${index}`;
          const titleId = `${optionId}-title`;
          const lineId = `${optionId}-line`;
          return (
            <span key={option.value} className={styles.option}>
              <input
                className={styles.radio}
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                aria-labelledby={titleId}
                aria-describedby={option.line ? lineId : undefined}
              />
              <label className={styles.face} htmlFor={optionId}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.text}>
                  <span id={titleId} className={styles.title}>
                    {option.title}
                  </span>
                  {option.line ? (
                    <span id={lineId} className={styles.line}>
                      {option.line}
                    </span>
                  ) : null}
                </span>
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
