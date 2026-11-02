import { bodyQuestionsFor } from "@tidefern/core";
import { CONSENT_DISCLOSURES } from "@tidefern/schemas/constants";
import type { DataCategory, Stage } from "@tidefern/schemas";
import { grantCopy } from "@/components/ui/grant-row";
import { CONSENT_CATEGORIES, asksConsent, currentConsentVersion } from "./consent";
import { welcomeCopy } from "./copy";

/**
 * The shape of onboarding (DESIGN.md 3.2) as plain functions: which steps a
 * stage has, what the indicator calls them, and the words the collection
 * consent shows for a stage. Nothing here touches the DOM, the network or
 * React. The client flow imports it; the server page does not, because the
 * category names come from a client module.
 */

export type StepId = "zone" | "stage" | "dates" | "consent" | "passkey";

/**
 * Whether core asks anything about her body for this stage. Before a stage
 * is chosen the dates step counts, because three of the four stages have
 * it; choosing "here for someone else" then takes it out of the count.
 */
export function hasDatesStep(stage: Stage | null): boolean {
  return stage === null || bodyQuestionsFor(stage).length > 0;
}

/** The steps her stage has: no dates step for `none`, no passkey step without WebAuthn. */
export function stepsFor(stage: Stage | null, passkeys: boolean): StepId[] {
  const steps: StepId[] = ["zone", "stage"];
  if (hasDatesStep(stage)) steps.push("dates");
  steps.push("consent");
  if (passkeys) steps.push("passkey");
  return steps;
}

/** The step after `current`, or null on the last one. */
export function stepAfter(steps: readonly StepId[], current: StepId): StepId | null {
  const index = steps.indexOf(current);
  return index >= 0 && index < steps.length - 1 ? (steps[index + 1] ?? null) : null;
}

/** The step before `current`, or null on the first one. */
export function stepBefore(steps: readonly StepId[], current: StepId): StepId | null {
  const index = steps.indexOf(current);
  return index > 0 ? (steps[index - 1] ?? null) : null;
}

/** The indicator's name for a step; the agreement step is "Terms" when no health data is asked. */
export function stepName(step: StepId, stage: Stage | null): string {
  const names = welcomeCopy.steps.names;
  if (step === "consent" && stage !== null && !asksConsent(stage)) return names.terms;
  return names[step];
}

/**
 * The category names the record lists: the sharing descriptions' names
 * (CONTENT.md), with "Private notes" for the journal, which is never shared
 * and so has no grant row of its own.
 */
export const CATEGORY_LABELS: Readonly<Record<DataCategory, string>> = {
  "cycle.status": grantCopy["cycle.status"].label,
  "cycle.history": grantCopy["cycle.history"].label,
  "cycle.symptoms": grantCopy["cycle.symptoms"].label,
  "journal.private": "Private notes",
  "pregnancy.overview": grantCopy["pregnancy.overview"].label,
  "pregnancy.photos": grantCopy["pregnancy.photos"].label,
  child: grantCopy.child.label,
};

/** What the consent record shows for a stage: the category names and the catalog's purposes. */
export function consentFacts(stage: Stage): { categories: string[]; purposes: string[] } {
  const disclosure = CONSENT_DISCLOSURES[currentConsentVersion()];
  const categories = CONSENT_CATEGORIES[stage];
  return {
    categories: categories.map((category) => CATEGORY_LABELS[category]),
    purposes: categories.map((category) => disclosure.categories[category].purpose),
  };
}
