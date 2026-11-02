import {
  INFANT_CONTEXT_SOURCES,
  infantContext,
  isCalendarDate,
  type InfantContextKind,
  type InfantContextRangeId,
} from "@tidefern/core";
import { OWNER } from "./copy";

/**
 * The published ranges beside a child's counts on /family (architecture
 * 8.4; task F6's `infantContext` in packages/core): context, never an alarm,
 * and no sleep range before four months, because the function returns none
 * there. A line that states a range is a health claim, so until the owner
 * approves the proposed words (docs/design/CONTENT.md, "Context ranges on
 * `/family`"; docs/CLAIMS.md 1.4) each one renders as a plain placeholder
 * marked `[OWNER]` in the place the line goes, naming the range it stands
 * for and its source's publisher. Nothing about the card changes with where
 * a count falls.
 */

export interface RangeContext {
  id: InfantContextRangeId;
  /** The first source's publisher, for the source line the owner words. */
  publisher: string;
}

export type CardRanges = Partial<Record<InfantContextKind, RangeContext>>;

const kinds: readonly InfantContextKind[] = ["feed", "wetDiaper", "sleep"];

/** The ranges that apply to a child of this age today; none for a date of birth still ahead. */
export function rangesFor(dateOfBirth: string, today: string): CardRanges {
  if (!isCalendarDate(dateOfBirth) || !isCalendarDate(today) || dateOfBirth > today) return {};
  const ranges: CardRanges = {};
  for (const kind of kinds) {
    const range = infantContext(kind, dateOfBirth, today);
    if (range === null) continue;
    ranges[kind] = { id: range.id, publisher: INFANT_CONTEXT_SOURCES[range.sources[0]].publisher };
  }
  return ranges;
}

/** The placeholder where a range line goes, until the owner approves its words. */
export function rangePlaceholder(range: RangeContext): string {
  return `${OWNER} range line ${range.id}, with its source line (${range.publisher})`;
}

/** The placeholder for the attribution under the cards, shown once when any range line is. */
export const RANGES_ATTRIBUTION_PLACEHOLDER = `${OWNER} attribution under the cards for the published ranges`;
