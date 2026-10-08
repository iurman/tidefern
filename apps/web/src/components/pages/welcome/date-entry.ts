import type { DateEntry } from "./dates";

/**
 * The attribute a wrapper around a SegmentedDateInput carries, so a step can
 * read what was typed when she presses Continue. The input reports a date
 * only once its three parts make a real one, and null for both "nothing
 * typed" and "half typed"; the words she needs differ (an optional date may
 * be left empty, never half done), so the step looks at the parts instead.
 */
export const DATE_KEY_ATTRIBUTE = "data-date-key";

/** What the date field marked with `key` holds: nothing, some parts, or all three with a 4-digit year. */
export function dateEntryIn(container: ParentNode | null | undefined, key: string): DateEntry {
  const field = container?.querySelector(`[${DATE_KEY_ATTRIBUTE}="${key}"]`);
  if (!field) return "empty";
  const values = Array.from(field.querySelectorAll("input")).map((input) => input.value.trim());
  if (values.every((value) => value === "")) return "empty";
  const year =
    field.querySelector<HTMLInputElement>('[data-part="year"] input')?.value.trim() ?? "";
  if (values.some((value) => value === "") || year.length !== 4) return "partial";
  return "complete";
}
