import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import styles from "./form-field.module.css";

/**
 * The attributes a control needs to belong to its field: the id the label
 * points at, the help and error ids it is described by, and the required and
 * invalid flags. The render prop receives them; a single element child gets
 * them merged in where it does not set its own.
 */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  required?: boolean;
  disabled?: boolean;
}

export interface FormFieldProps {
  /** Visible label, sentence case. Never a placeholder. */
  label: string;
  /** One line under the label that says what the field is for or what format it takes. */
  help?: string;
  /** The inline error under the control. It names the next step, never only that something failed. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Control id; generated when absent. Neutral: never a health word. */
  id?: string;
  className?: string;
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
}

/**
 * One field anatomy for every form (architecture 13.10): label above, optional
 * help, the control, inline error below, wired with `aria-describedby`. The
 * required marker is text in the label, so it survives without color or a
 * symbol font. No hooks beyond `useId`, so a server component can render it
 * and call the render prop in place.
 */
export function FormField({
  label,
  help,
  error,
  required,
  disabled,
  id,
  className,
  children,
}: FormFieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");

  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(required ? { "aria-required": true as const, required: true } : {}),
    ...(disabled ? { disabled: true } : {}),
  };

  let rendered: ReactNode;
  if (typeof children === "function") {
    rendered = children(control);
  } else if (isValidElement(children)) {
    const element = children as ReactElement<Record<string, unknown>>;
    rendered = cloneElement(element, { ...control, ...element.props });
  } else {
    rendered = children;
  }

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")} data-disabled={disabled}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {required ? <span className={styles.required}> required</span> : null}
      </label>
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      <div className={styles.control}>{rendered}</div>
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
