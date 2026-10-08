"use client";
import type { Stage } from "@tidefern/schemas";
import { welcomeCopy } from "./copy";
import { OptionCards } from "./option-cards";

const copy = welcomeCopy.stage;

/** The four cards in DESIGN.md 3.2's order; `none` is "here for someone else". */
export const STAGE_ORDER: readonly Stage[] = ["cycle", "pregnancy", "postpartum", "none"];

export interface StageStepProps {
  value: Stage | null;
  onChange: (stage: Stage) => void;
  error?: string | undefined;
  /** The step heading's id: the cards are the answer to it, so it names the group. */
  labelledBy: string;
  disabled?: boolean;
}

/**
 * Step 2 (DESIGN.md 3.2): four option cards on native radios, each a title
 * and one line. Choosing "here for someone else" takes the dates step out
 * of the count, because core asks nothing about her own body then.
 */
export function StageStep({ value, onChange, error, labelledBy, disabled }: StageStepProps) {
  return (
    <OptionCards<Stage>
      labelledBy={labelledBy}
      options={STAGE_ORDER.map((stage) => ({ value: stage, ...copy.options[stage] }))}
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
    />
  );
}
