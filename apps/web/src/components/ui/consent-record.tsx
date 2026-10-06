"use client";
import { useId } from "react";
import { formatCalendarDate } from "./format-date";
import styles from "./consent-record.module.css";

export interface Processor {
  name: string;
  /** What this processor receives, in nouns (architecture 9.5). */
  receives: string;
}

export interface ConsentRecordProps {
  /** The categories of health data collected, in the person's words. */
  categories: string[];
  /** The specified purposes and uses. */
  purposes: string[];
  /** Every processor by name. */
  processors: Processor[];
  policyVersion: string;
  /** The one unchecked control. Nothing else on the step counts as consent. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Settings shows the record again without a control, with the date it was given. */
  readOnly?: boolean;
  /** The day consent was given, `YYYY-MM-DD`; shown in read-only mode. */
  agreedOn?: string;
  disabled?: boolean;
  /** The agreement is being saved. */
  loading?: boolean;
  /** Says what to do next ("Tick the box to continue."). */
  error?: string;
}

export const withdrawalSentence =
  "You can withdraw this at any time in Settings; withdrawing closes your account and deletes your data.";

/**
 * The collection consent as RCW 19.373 asks for it (architecture 9.6): the
 * categories, the purposes, the processors by name, the withdrawal sentence,
 * and one unchecked control that is separate from any terms acceptance.
 * Settings renders the same record read-only with the date it was given.
 */
export function ConsentRecord({
  categories,
  purposes,
  processors,
  policyVersion,
  checked = false,
  onChange,
  readOnly = false,
  agreedOn,
  disabled = false,
  loading = false,
  error,
}: ConsentRecordProps) {
  const headingId = useId();
  const controlId = useId();
  const errorId = useId();
  return (
    <section className={styles.record} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        What Tidefern collects, and why
      </h3>
      <dl className={styles.facts}>
        <dt>Collected</dt>
        <dd>
          <ul className={styles.list}>
            {categories.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        </dd>
        <dt>Used to</dt>
        <dd>
          <ul className={styles.list}>
            {purposes.map((purpose) => (
              <li key={purpose}>{purpose}</li>
            ))}
          </ul>
        </dd>
        <dt>Processed by</dt>
        <dd>
          <ul className={styles.list}>
            {processors.map((processor) => (
              <li key={processor.name}>
                <span className={styles.processor}>{processor.name}</span>: {processor.receives}
              </li>
            ))}
          </ul>
        </dd>
      </dl>
      <p className={styles.withdrawal}>{withdrawalSentence}</p>
      {readOnly ? (
        <p className={styles.given}>
          {agreedOn ? `You agreed on ${formatCalendarDate(agreedOn, "full")}. ` : ""}
          Policy version {policyVersion}.
        </p>
      ) : (
        <div className={styles.control}>
          <input
            id={controlId}
            type="checkbox"
            className={styles.checkbox}
            checked={checked}
            disabled={disabled || loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            onChange={(event) => onChange?.(event.target.checked)}
          />
          <label htmlFor={controlId} className={styles.label}>
            I agree to Tidefern collecting this health data for these purposes. Policy version{" "}
            {policyVersion}.
          </label>
          <p id={errorId} className={loading ? styles.status : styles.error} aria-live="polite">
            {loading ? "Saving" : error}
          </p>
        </div>
      )}
    </section>
  );
}
