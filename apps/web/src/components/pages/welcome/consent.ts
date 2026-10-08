import { CONSENT_DISCLOSURES, consentTextVersions } from "@tidefern/schemas";
import type { ConsentTextVersion, DataCategory, Stage } from "@tidefern/schemas";
import type { Processor } from "@/components/ui/consent-record";

/**
 * The collection consent's facts, safe for the server page to import: it
 * pulls in no client module, so the page can check the processors before
 * it renders the flow.
 */

/**
 * What the collection consent lists for each stage: the categories she is
 * asked to let Tidefern keep, in the order the record shows them. Each is
 * what that stage logs (architecture 8.2): the cycle's dates and flows, the
 * day sheet's symptoms and moods in every stage that has one, the pregnancy
 * record, and her private notes. Status cards and photos are consents for
 * a purpose beyond keeping her data, so they are asked when she turns
 * sharing on or adds a photo, not here. A child gets its own guardian
 * consent when the child is created. `none` is never asked about her body,
 * so nothing is collected and no consent is recorded; she still accepts the
 * terms and attests her age. [OWNER] H1's ruling, listed in CONTENT.md.
 */
export const CONSENT_CATEGORIES: Readonly<Record<Stage, readonly DataCategory[]>> = {
  cycle: ["cycle.history", "cycle.symptoms", "journal.private"],
  pregnancy: ["pregnancy.overview", "cycle.symptoms", "journal.private"],
  postpartum: ["cycle.history", "cycle.symptoms", "journal.private"],
  none: [],
};

/** Whether this stage records a collection consent at all. */
export function asksConsent(stage: Stage): boolean {
  return CONSENT_CATEGORIES[stage].length > 0;
}

/** The newest consent text version: the one the page shows and the consent records. */
export function currentConsentVersion(): ConsentTextVersion {
  const version = consentTextVersions[consentTextVersions.length - 1];
  if (version === undefined) throw new Error("the consent catalog has no version");
  return version;
}

/**
 * The processors the consent text names, in the catalog's order, each with
 * what it receives from the data summary (`GET /v1/me/data-summary`, the
 * one source of that sentence). Null when the summary leaves one out: the
 * record must name every processor the server hashes into the consent.
 */
export function processorsFor(
  summary: ReadonlyArray<{ name: string; receives: string }>,
): Processor[] | null {
  const named = CONSENT_DISCLOSURES[currentConsentVersion()].processors;
  const listed: Processor[] = [];
  for (const name of named) {
    const found = summary.find((processor) => processor.name === name);
    if (found === undefined) return null;
    listed.push({ name, receives: found.receives });
  }
  return listed;
}
