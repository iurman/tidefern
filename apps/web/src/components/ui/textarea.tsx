import type { TextareaHTMLAttributes } from "react";
import styles from "./textarea.module.css";

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "autoComplete"
> {
  /** Required on purpose, as on TextInput: "off" for a private note, a token where filling helps. */
  autoComplete: string;
  inputMode?: TextareaHTMLAttributes<HTMLTextAreaElement>["inputMode"];
  invalid?: boolean;
}

/**
 * A native textarea with the same geometry and attributes as TextInput. Three
 * rows by default, resizable only vertically so the column never widens.
 */
export function Textarea({
  autoComplete,
  inputMode,
  invalid,
  rows = 3,
  className,
  ...rest
}: TextareaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      autoComplete={autoComplete}
      inputMode={inputMode}
      aria-invalid={invalid || rest["aria-invalid"] ? true : undefined}
      className={[styles.textarea, className].filter(Boolean).join(" ")}
    />
  );
}
