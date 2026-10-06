"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextInput } from "@/components/ui/text-input";
import { authClient, RESET_PATH } from "@/lib/auth-client";
import styles from "../auth.module.css";
import { authCopy, describeAuthFailure } from "../copy";

const copy = authCopy.reset;

type State =
  { kind: "idle" } | { kind: "pending" } | { kind: "sent" } | { kind: "failed"; message: string };

/**
 * The email field and the one button. The server answers the same way
 * whether the email has an account or not, so the success sentence says
 * "if"; it is the honest one.
 */
export function RequestResetForm({ expired }: { expired: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const pending = state.kind === "pending";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setState({ kind: "pending" });
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? "").trim(),
      redirectTo: RESET_PATH,
    });
    if (error) {
      setState({ kind: "failed", message: describeAuthFailure(error, "reset-request") });
      return;
    }
    setState({ kind: "sent" });
  }

  if (state.kind === "sent") {
    return (
      <InlineFeedback tone="success" cue className={styles.feedback}>
        {copy.sent}
      </InlineFeedback>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {expired && state.kind === "idle" ? (
        <InlineFeedback tone="error" className={styles.feedback}>
          {copy.expired}
        </InlineFeedback>
      ) : null}
      <FormField label={copy.email.label} required>
        <TextInput name="email" type="email" autoComplete="email" />
      </FormField>
      <div className={styles.actions}>
        <Button type="submit" loading={pending} loadingText={copy.pending}>
          {copy.submit}
        </Button>
      </div>
      {state.kind === "failed" ? (
        <InlineFeedback tone="error" cue className={styles.feedback}>
          {state.message}
        </InlineFeedback>
      ) : null}
    </form>
  );
}
