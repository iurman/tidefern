"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextInput } from "@/components/ui/text-input";
import { TextLink } from "@/components/ui/text-link";
import { authClient } from "@/lib/auth-client";
import styles from "../../auth.module.css";
import { authCopy, describeAuthFailure } from "../../copy";

const copy = authCopy.newPassword;

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done" }
  | { kind: "mismatch" }
  | { kind: "failed"; message: string; expired: boolean };

/**
 * New password twice, then the token goes with it. A mismatch is caught
 * here before any request; an expired token is the server's answer and
 * gets the link back to a fresh request.
 */
export function NewPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const pending = state.kind === "pending";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setState({ kind: "mismatch" });
      return;
    }
    setState({ kind: "pending" });
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setState({
        kind: "failed",
        message: describeAuthFailure(error, "new-password"),
        expired: error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED",
      });
      return;
    }
    setState({ kind: "done" });
  }

  if (state.kind === "done") {
    return (
      <>
        <InlineFeedback tone="success" cue className={styles.feedback}>
          {copy.done}
        </InlineFeedback>
        <div className={styles.actions}>
          <Button href="/sign-in">{copy.signIn}</Button>
        </div>
      </>
    );
  }

  const mismatch = state.kind === "mismatch" ? copy.mismatch : undefined;

  return (
    <form className={styles.form} onSubmit={submit}>
      <FormField label={copy.password.label} help={copy.password.help} required>
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
        />
      </FormField>
      <FormField label={copy.confirm.label} required error={mismatch}>
        <TextInput name="confirm" type="password" autoComplete="new-password" maxLength={128} />
      </FormField>
      <div className={styles.actions}>
        <Button type="submit" loading={pending} loadingText={copy.pending}>
          {copy.submit}
        </Button>
      </div>
      {state.kind === "failed" ? (
        <>
          <InlineFeedback tone="error" cue className={styles.feedback}>
            {state.message}
          </InlineFeedback>
          {state.expired ? (
            <ul className={styles.links}>
              <li>
                <TextLink href="/reset">{copy.requestAgain}</TextLink>
              </li>
            </ul>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
