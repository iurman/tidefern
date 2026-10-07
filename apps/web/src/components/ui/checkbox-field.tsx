"use client";
import { useId, type MouseEvent, type ReactNode } from "react";
import styles from "./checkbox-field.module.css";

export interface CheckboxFieldProps {
  /**
   * Visible label beside the box, sentence case. It may hold a link (the
   * terms beside an agreement): a link is lifted above the box's target, so
   * following it never ticks the box.
   */
  label: ReactNode;
  /** One line under the label that says what ticking the box means; a link in it is lifted too. */
  help?: ReactNode;
  /** The inline error under the field. It names the next step, never only that something failed. */
  error?: string;
  /** Marked in the label as text, so it survives without color or a symbol font. */
  required?: boolean;
  disabled?: boolean;
  /**
   * While a change is being saved (a checklist item that saves on its own):
   * the line says "Saving", presses are ignored and the box keeps its place.
   */
  loading?: boolean;
  /** What is happening, in the voice table's words. */
  loadingText?: string;
  /** Controlled state; pair it with `onChange`. */
  checked?: boolean;
  /** Starting state when uncontrolled. */
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** The form name; neutral, never a health word. */
  name?: string;
  /** The value a form submits when the box is ticked. */
  value?: string;
  /** Control id; generated when absent. Neutral: never a health word. */
  id?: string;
  className?: string;
}

/**
 * One native checkbox with its label, optional help and inline error
 * (architecture 13.10's field anatomy), for an agreement such as the terms
 * and the age attestation, or a checklist item such as a milestone. The
 * native input covers the whole field, transparent, so a click or a tap
 * anywhere on the box, the label or the help lands on the input itself: the
 * sound provider's delegation gives it the press cue and the touch haptic
 * like every other control, the global focus ring draws around the field,
 * and Space toggles it. Help and error are tied to it with
 * `aria-describedby`; an error also sets `aria-invalid`.
 */
export function CheckboxField({
  label,
  help,
  error,
  required,
  disabled,
  loading = false,
  loadingText = "Saving",
  checked,
  defaultChecked,
  onChange,
  name,
  value,
  id,
  className,
}: CheckboxFieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-checkbox`;
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");
  const controlled = checked !== undefined;

  // A press while the last change is still saving is refused, so the box never runs ahead of the server.
  function refuseWhileLoading(event: MouseEvent<HTMLInputElement>) {
    if (loading) event.preventDefault();
  }

  return (
    <div
      className={[styles.field, className].filter(Boolean).join(" ")}
      data-disabled={disabled ? true : undefined}
      data-invalid={error ? true : undefined}
    >
      <div className={styles.row}>
        <input
          id={controlId}
          className={styles.input}
          type="checkbox"
          name={name}
          value={value}
          checked={controlled ? checked : undefined}
          defaultChecked={controlled ? undefined : defaultChecked}
          onChange={(event) => {
            if (!loading) onChange?.(event.currentTarget.checked);
          }}
          onClick={refuseWhileLoading}
          readOnly={controlled && !onChange ? true : undefined}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-busy={loading || undefined}
          aria-disabled={loading && !disabled ? true : undefined}
        />
        <span className={styles.box} aria-hidden="true">
          <svg className={styles.check} viewBox="0 0 20 20" focusable="false">
            <path
              d="M4.5 10.5l3.5 3.5 7.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <label className={styles.label} htmlFor={controlId}>
          {label}
          {required ? <span className={styles.required}> required</span> : null}
        </label>
        {loading ? (
          <span className={styles.status} role="status">
            {loadingText}
          </span>
        ) : null}
      </div>
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
