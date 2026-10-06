import type { InputHTMLAttributes } from "react";
import styles from "./text-input.module.css";

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "autoComplete"
> {
  /**
   * Required on purpose: every field decides what a password manager or the
   * browser may fill ("email", "name", "off"), so no field forgets it.
   */
  autoComplete: string;
  /** The keyboard a phone shows. Defaults from `type`; set it for numbers in a text field. */
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  /** Marks the control invalid; FormField sets it through `aria-invalid` when it has an error. */
  invalid?: boolean;
}

const inputModeByType: Record<string, InputHTMLAttributes<HTMLInputElement>["inputMode"]> = {
  email: "email",
  tel: "tel",
  url: "url",
  search: "search",
  number: "decimal",
};

/**
 * A native text input with the project's control geometry (44 px, the control
 * radius, the surface fill) and the two attributes every field must set:
 * `inputMode` and `autocomplete`. It carries no label of its own; it sits in a
 * FormField, which owns the label, help and error.
 */
export function TextInput({
  autoComplete,
  inputMode,
  invalid,
  type = "text",
  className,
  ...rest
}: TextInputProps) {
  return (
    <input
      {...rest}
      type={type}
      autoComplete={autoComplete}
      inputMode={inputMode ?? inputModeByType[type]}
      aria-invalid={invalid || rest["aria-invalid"] ? true : undefined}
      className={[styles.input, className].filter(Boolean).join(" ")}
    />
  );
}
