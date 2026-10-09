"use client";
import { TERMS_VERSION } from "@tidefern/schemas/constants";
import type { Stage } from "@tidefern/schemas";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { ConsentRecord } from "@/components/ui/consent-record";
import type { Processor } from "@/components/ui/consent-record";
import { TextLink } from "@/components/ui/text-link";
import { asksConsent, currentConsentVersion } from "./consent";
import { welcomeCopy } from "./copy";
import type { Draft, FieldErrors } from "./draft";
import { consentFacts } from "./steps";
import styles from "./welcome-flow.module.css";

const copy = welcomeCopy.consent;

export interface ConsentStepProps {
  stage: Stage;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: FieldErrors;
  processors: Processor[];
  /** The consent write is running: the record's own line says "Saving". */
  recording: boolean;
  /** The consent for this stage's categories is recorded: the box stays ticked. */
  recorded: boolean;
  /** The profile is saved, so the terms and the age are settled too. */
  settled: boolean;
  /** Any write is running: nothing changes under it. */
  writing: boolean;
}

/** A link that opens in a new tab, so the steps held in memory are not lost by following it. */
function NewTabLink({ href, children }: { href: string; children: string }) {
  return (
    <TextLink href={href} target="_blank">
      {children}
      <span className="sr-only"> {copy.newTab}</span>
    </TextLink>
  );
}

/**
 * Step 4 (DESIGN.md 3.2, architecture 7.4 and 12.1): the collection consent
 * as its own record with one unchecked control, listing the categories her
 * stage collects, their purposes and specific uses, the processors by name
 * with what each receives, and the withdrawal sentence. Beneath it, and
 * separate from it, the terms acceptance and the 18 or older attestation,
 * each its own unticked box: accepting terms is never consent (RCW
 * 19.373.010). A stage that asks nothing about her body records no consent
 * and says so.
 */
export function ConsentStep({
  stage,
  draft,
  update,
  errors,
  processors,
  recording,
  recorded,
  settled,
  writing,
}: ConsentStepProps) {
  const asks = asksConsent(stage);
  const facts = consentFacts(stage);
  return (
    <div className={styles.fields}>
      {asks ? (
        <ConsentRecord
          categories={facts.categories}
          purposes={facts.purposes}
          processors={processors}
          policyVersion={currentConsentVersion()}
          checked={draft.consent}
          onChange={(consent) => update({ consent })}
          disabled={recorded || writing}
          loading={recording}
          error={errors.consent}
        />
      ) : (
        <p className={styles.lede}>{copy.nothingCollected}</p>
      )}
      <p className={styles.note}>
        {copy.policyBefore} <NewTabLink href="/health-privacy">{copy.policyLink}</NewTabLink>{" "}
        {copy.policyAfter}
      </p>
      <div className={styles.agreements}>
        <CheckboxField
          label={
            <>
              {copy.termsBefore} <NewTabLink href="/terms">{copy.termsLink}</NewTabLink>
            </>
          }
          help={copy.termsHelp(TERMS_VERSION)}
          required
          checked={draft.terms}
          onChange={(terms) => update({ terms })}
          error={errors.terms}
          disabled={settled || writing}
        />
        <CheckboxField
          label={copy.adult}
          help={copy.adultHelp}
          required
          checked={draft.adult}
          onChange={(adult) => update({ adult })}
          error={errors.adult}
          disabled={settled || writing}
        />
      </div>
    </div>
  );
}
