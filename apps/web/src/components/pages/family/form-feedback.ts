"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { play } from "@/lib/sound";

/**
 * The controls the shared fields mark when they carry an error: FormField,
 * MeasurementInput, SegmentedDateInput and CheckboxField set `aria-invalid`
 * on the input; SegmentedControl marks its fieldset.
 */
const INVALID = "[aria-invalid='true'], fieldset[data-invalid] input";

/**
 * A check that found field errors (DESIGN.md 7, validation failure): once
 * the errors render, the error cue plays beside them and focus moves to the
 * first field marked invalid, so its label and its error are read together
 * through `aria-describedby` (architecture 13.10). Without that, a press of
 * Save that found errors would say nothing to a screen reader. The cue never
 * plays without a marked field on screen. `form` is the form the errors sit
 * in; the returned function is called in the handler that set the errors.
 */
export function useInvalidFields(form: RefObject<HTMLFormElement | null>): () => void {
  const [flagged, setFlagged] = useState(0);

  useEffect(() => {
    if (flagged === 0) return;
    const first = form.current?.querySelector<HTMLElement>(INVALID);
    if (!first) return;
    play("error");
    first.focus();
  }, [flagged, form]);

  return () => setFlagged((count) => count + 1);
}

/**
 * Keeps a sheet's action row in view when a failure line lands above it.
 * The line pushes Save down, and on a phone the sheet's body is already
 * scrolled to the bottom, so Save would sit below the fold with the line
 * telling her to try again. `failure` is the line's id; null while none.
 */
export function useActionsInView(failure: number | null): RefObject<HTMLDivElement | null> {
  const actions = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failure === null) return;
    // jsdom has no scrollIntoView; every browser Tidefern supports does.
    actions.current?.scrollIntoView?.({ block: "nearest" });
  }, [failure]);

  return actions;
}
