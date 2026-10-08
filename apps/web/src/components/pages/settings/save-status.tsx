"use client";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextLink } from "@/components/ui/text-link";
import { JOURNEY_PATH, settingsCopy as copy } from "./copy";
import { describeOutcome, pointsToJourney, type SaveOutcome } from "./profile-input";
import styles from "./settings.module.css";

/** Where one group's last save stands. */
export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; text: string }
  | { kind: "failed"; text: string; journey: boolean };

export const IDLE: SaveState = { kind: "idle" };
export const SAVING: SaveState = { kind: "saving" };

/** The state a save that did not land leaves behind: the next step, and Journey when it decides. */
export function failedState(outcome: SaveOutcome): SaveState {
  return {
    kind: "failed",
    text: describeOutcome(outcome) ?? copy.failure.invalid,
    journey: pointsToJourney(outcome),
  };
}

/**
 * The line under a group: "Saving" while the request runs, then the short
 * success or the next step (CONTENT.md voice table). The cue plays only
 * with the visible text, which is why it rides on InlineFeedback.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return (
      <p className={styles.pending} role="status">
        {copy.saving}
      </p>
    );
  }
  if (state.kind === "saved") {
    return (
      <InlineFeedback tone="success" cue>
        {state.text}
      </InlineFeedback>
    );
  }
  if (state.kind === "failed") {
    return (
      <div className={styles.feedback}>
        <InlineFeedback tone="error" cue>
          {state.text}
        </InlineFeedback>
        {state.journey ? <TextLink href={JOURNEY_PATH}>{copy.profile.journey}</TextLink> : null}
      </div>
    );
  }
  return null;
}
