"use client";
import { useEffect, useRef } from "react";

/** The fields a form marks invalid: a control with aria-invalid, or a radio in a group marked invalid. */
const INVALID = '[aria-invalid="true"], fieldset[data-invalid] input';

/**
 * Moves focus to the first field a form marked invalid each time its
 * errors change, so a refusal is heard where it is and the person lands on
 * what to fix. Attach the returned ref to the element holding the fields.
 */
export function useFocusFirstInvalid(errors: Readonly<Record<string, string | undefined>>) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (Object.values(errors).every((error) => error === undefined)) return;
    container.current?.querySelector<HTMLElement>(INVALID)?.focus();
  }, [errors]);
  return container;
}
