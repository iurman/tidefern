"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { authClient } from "@/lib/auth-client";
import type { SettingsCallError } from "@/lib/auth-client";
import { welcomeCopy } from "./copy";
import { passkeyOutcome, passkeySentence } from "./passkey";
import type { PasskeyOutcome } from "./passkey";
import styles from "./welcome-flow.module.css";

const copy = welcomeCopy.passkey;
const actions = welcomeCopy.actions;

type State =
  | { kind: "offered" }
  | { kind: "checking"; attempt: number }
  | { kind: "saved" }
  /** `attempt` keys the message, so a second refusal is announced and cued again. */
  | { kind: "refused"; outcome: PasskeyOutcome; attempt: number };

export interface PasskeyStepProps {
  /** Leaves onboarding: Today, or the sharing screen with the invitation she arrived with. */
  onFinish: () => void;
}

/**
 * Step 5 (DESIGN.md 3.2): an optional passkey through the passkey client,
 * with "Not now". It is only in the steps when the browser has WebAuthn.
 * `addPasskey()` gets no name and no context, because both would travel in
 * the options request's query string. The step opens on the outcome of the
 * writes before it, and every press shows its own: saved, closed, too old a
 * sign-in, or a failure, each with the next step.
 */
export function PasskeyStep({ onFinish }: PasskeyStepProps) {
  const [state, setState] = useState<State>({ kind: "offered" });

  async function add() {
    if (state.kind === "checking") return;
    const attempt = state.kind === "refused" ? state.attempt + 1 : 1;
    setState({ kind: "checking", attempt });
    let error: SettingsCallError | null = null;
    try {
      const result = await authClient.passkey.addPasskey();
      if (result.data) {
        setState({ kind: "saved" });
        return;
      }
      error = result.error as SettingsCallError | null;
    } catch {
      error = null;
    }
    setState({ kind: "refused", outcome: passkeyOutcome(error), attempt });
  }

  const done = state.kind === "saved" || (state.kind === "refused" && state.outcome === "already");

  return (
    <div className={styles.fields}>
      {state.kind === "offered" || state.kind === "checking" ? (
        <InlineFeedback tone="success" cue>
          {copy.ready}
        </InlineFeedback>
      ) : null}
      <p className={styles.lede}>{copy.lede}</p>
      <div className={styles.actions}>
        {done ? (
          <Button type="button" onClick={onFinish}>
            {actions.finish}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="quiet"
              onClick={onFinish}
              disabled={state.kind === "checking"}
            >
              {copy.notNow}
            </Button>
            <Button
              type="button"
              loading={state.kind === "checking"}
              loadingText={copy.pending}
              onClick={add}
            >
              {copy.add}
            </Button>
          </>
        )}
      </div>
      {state.kind === "saved" ? (
        <InlineFeedback tone="success" cue>
          {copy.saved}
        </InlineFeedback>
      ) : null}
      {state.kind === "refused" ? (
        <InlineFeedback
          key={state.attempt}
          tone={state.outcome === "already" ? "info" : "error"}
          cue
        >
          {passkeySentence(state.outcome)}
        </InlineFeedback>
      ) : null}
    </div>
  );
}
