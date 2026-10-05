import checklists from "../data/milestones/2022.json";

/**
 * CDC "Learn the Signs. Act Early." milestone checklists, 2022 revision, as
 * vendored data in `packages/core/data/milestones`. CDC places each milestone
 * at the age by which at least 75 percent of children are expected to show
 * it, and says the checklists are surveillance and conversation tools, not
 * screening or diagnosis. The product therefore never scores a child; it shows
 * the list for an age with the framing sentence and the permanent
 * not-a-screening line, and points to the pediatrician.
 */

export type MilestoneDomain = "social" | "language" | "cognitive" | "movement";

export interface MilestoneItem {
  /** Stable key for check-off records, `<months>m-<domain>-<n>`. */
  id: string;
  domain: MilestoneDomain;
  /** CDC's wording, unchanged. */
  text: string;
}

export interface MilestoneChecklist {
  /** The checklist age in months, 2 through 60. */
  months: number;
  /** CDC's own label for the age, "2 months", "1 year", "30 months" and so on. */
  label: string;
  items: MilestoneItem[];
}

export interface MilestoneData {
  version: string;
  source: { name: string; url: string; retrieved: string };
  attribution: string;
  notScreeningLine: string;
  ages: MilestoneChecklist[];
}

const data = checklists as MilestoneData;

export const MILESTONES_VERSION = data.version;

/** The attribution and non-endorsement sentence CDC's reuse terms require, shown wherever the checklists appear. */
export const CDC_MILESTONES_ATTRIBUTION = data.attribution;

/** The permanent line next to every checklist (architecture record, section 13.10). */
export const NOT_A_SCREENING_TOOL = data.notScreeningLine;

/** Every checklist, youngest first. */
export const milestoneChecklists: readonly MilestoneChecklist[] = data.ages;

/** The twelve checklist ages, youngest first. */
export const milestoneAges: readonly { months: number; label: string }[] = data.ages.map(
  ({ months, label }) => ({ months, label }),
);

/**
 * Days in a checklist month. CDC's growth chart conventions use 365.25 / 12
 * days per month, and a checklist age is "by" that age, so a child becomes
 * eligible for the 2 month list on day 61 of life.
 */
export const DAYS_PER_MONTH = 365.25 / 12;

export interface ChecklistOptions {
  /**
   * Age adjusted for prematurity, in days, when the family has chosen the
   * corrected-age view. When present it replaces the chronological age for
   * picking the list; the caller decides for how long correction applies.
   */
  correctedAgeDays?: number;
}

/**
 * The latest checklist at or below the chosen age, or null before two months.
 * A corrected age, when supplied, is the age that counts.
 */
export function checklistFor(
  ageDays: number,
  options: ChecklistOptions = {},
): MilestoneChecklist | null {
  const chosen = options.correctedAgeDays ?? ageDays;
  let match: MilestoneChecklist | null = null;
  for (const checklist of data.ages) {
    if (chosen >= checklist.months * DAYS_PER_MONTH) match = checklist;
  }
  return match;
}

/** The one sentence that frames every list: "Most children do this by <age label>." */
export function milestoneFraming(months: number): string {
  const age = data.ages.find((checklist) => checklist.months === months);
  if (!age) throw new RangeError(`No milestone checklist at ${months} months`);
  return `Most children do this by ${age.label}.`;
}
