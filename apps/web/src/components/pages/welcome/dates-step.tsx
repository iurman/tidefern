"use client";
import { bodyQuestionsFor } from "@tidefern/core";
import type { BodyQuestionId } from "@tidefern/core";
import { CHILD_CONSENT_DISCLOSURES, FLOW_LABELS, PERIOD_FLOWS } from "@tidefern/schemas/constants";
import type { Stage } from "@tidefern/schemas";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormField } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { TextInput } from "@/components/ui/text-input";
import { welcomeCopy } from "./copy";
import { pastExample } from "./dates";
import type { DateOrder, DatingField } from "./dates";
import { DATE_KEYS } from "./draft";
import type { Draft, FieldErrors, PeriodFlow } from "./draft";
import { PregnancyDating } from "./pregnancy-dating";
import { currentChildConsentVersion } from "./writes";
import styles from "./welcome-flow.module.css";

const copy = welcomeCopy.dates;

const PERIOD_FLOW_OPTIONS = PERIOD_FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] }));

/** Core's own words for a question this stage asks (packages/core stages.ts). */
function prompt(stage: Stage, id: BodyQuestionId): string {
  const question = bodyQuestionsFor(stage).find((candidate) => candidate.id === id);
  if (question === undefined) throw new Error(`core asks no ${id} question for this stage`);
  return question.prompt;
}

interface PeriodStartProps {
  dateKey: string;
  label: string;
  help: string;
  date: string | null;
  flow: PeriodFlow;
  onDate: (date: string | null) => void;
  onFlow: (flow: PeriodFlow) => void;
  error?: string | undefined;
  order: DateOrder;
  today: string;
  disabled?: boolean;
}

/**
 * A period's first day and its flow (DESIGN.md 5.1): a period day is a day
 * whose flow is light, medium or heavy, so only those three are offered,
 * with Medium chosen and changeable. Optional: an empty date is skipped and
 * the flow then means nothing.
 */
function PeriodStart({
  dateKey,
  label,
  help,
  date,
  flow,
  onDate,
  onFlow,
  error,
  order,
  today,
  disabled,
}: PeriodStartProps) {
  return (
    <div className={styles.period}>
      <div data-date-key={dateKey}>
        <SegmentedDateInput
          label={label}
          help={help}
          order={order}
          example={pastExample(today)}
          defaultValue={date ?? undefined}
          onChange={onDate}
          error={error}
          disabled={disabled}
        />
      </div>
      <div className={styles.flowScale}>
        <SegmentedControl<PeriodFlow>
          label={copy.flowLabel}
          options={PERIOD_FLOW_OPTIONS}
          value={flow}
          onChange={onFlow}
          tone="period"
          disabled={disabled}
        />
        <p className={styles.note}>{copy.flowNote}</p>
      </div>
    </div>
  );
}

export interface DatesStepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: FieldErrors;
  /** Today in the zone she chose, YYYY-MM-DD. */
  today: string;
  order: DateOrder;
  disabled?: boolean;
}

/**
 * Step 3 (DESIGN.md 3.2): only the body questions core returns for her
 * stage, each date a segmented input with an example line. Cycle: the last
 * period's first day, optional, with its flow. Pregnancy: method-first
 * dating. Postpartum: the baby's name and birth date with the guardian's
 * consent on the baby's behalf (E12's draft text in full before the box),
 * then the first period since, optional. `none` never reaches this step.
 */
export function DatesStep({ draft, update, errors, today, order, disabled }: DatesStepProps) {
  switch (draft.stage) {
    case "cycle":
      return (
        <div className={styles.fields}>
          <PeriodStart
            dateKey={DATE_KEYS.start}
            label={prompt("cycle", "last_period_start")}
            help={copy.startHelp}
            date={draft.start}
            flow={draft.startFlow}
            onDate={(start) => update({ start })}
            onFlow={(startFlow) => update({ startFlow })}
            error={errors.start}
            order={order}
            today={today}
            disabled={disabled}
          />
        </div>
      );
    case "pregnancy": {
      const datingErrors: Partial<Record<DatingField, string>> = {};
      for (const [key, message] of Object.entries(errors)) {
        if (key.startsWith("dating.") && message !== undefined) {
          datingErrors[key.slice("dating.".length) as DatingField] = message;
        }
      }
      return (
        <PregnancyDating
          value={draft.dating}
          onChange={(dating) => update({ dating })}
          errors={datingErrors}
          order={order}
          today={today}
          disabled={disabled}
        />
      );
    }
    case "postpartum": {
      const disclosure = CHILD_CONSENT_DISCLOSURES[currentChildConsentVersion()];
      return (
        <div className={styles.fields}>
          <FormField
            label={copy.childName}
            help={copy.childNameHelp}
            error={errors.childName}
            required
            disabled={disabled}
          >
            <TextInput
              autoComplete="off"
              maxLength={80}
              value={draft.childName}
              onChange={(event) => update({ childName: event.target.value })}
            />
          </FormField>
          <div data-date-key={DATE_KEYS.birth}>
            <SegmentedDateInput
              label={prompt("postpartum", "birth_date")}
              order={order}
              example={pastExample(today)}
              required
              defaultValue={draft.birth ?? undefined}
              onChange={(birth) => update({ birth })}
              error={errors.birth}
              disabled={disabled}
            />
          </div>
          <section className={styles.childConsent} aria-labelledby="welcome-child-consent">
            <h3 id="welcome-child-consent" className={styles.subheading}>
              {copy.childConsentHeading}
            </h3>
            <p className={styles.disclosure}>{disclosure.text}</p>
            <CheckboxField
              label={copy.childConsentLabel}
              required
              checked={draft.childConsent}
              onChange={(childConsent) => update({ childConsent })}
              error={errors.childConsent}
              disabled={disabled}
            />
          </section>
          <PeriodStart
            dateKey={DATE_KEYS.since}
            label={prompt("postpartum", "last_period_start")}
            help={copy.sinceHelp}
            date={draft.since}
            flow={draft.sinceFlow}
            onDate={(since) => update({ since })}
            onFlow={(sinceFlow) => update({ sinceFlow })}
            error={errors.since}
            order={order}
            today={today}
            disabled={disabled}
          />
        </div>
      );
    }
    case "none":
    case null:
      return null;
  }
}
