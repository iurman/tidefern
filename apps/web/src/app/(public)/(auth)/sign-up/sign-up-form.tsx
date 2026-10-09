"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextInput } from "@/components/ui/text-input";
import { authClient, VERIFY_PATH } from "@/lib/auth-client";
import styles from "../auth.module.css";
import { authCopy, describeAuthFailure } from "../copy";

const copy = authCopy.signUp;

type State =
  { kind: "idle" } | { kind: "pending" } | { kind: "sent" } | { kind: "failed"; message: string };

/**
 * Name, email and password. The server requires a verified email before a
 * sign-in, so success here is the sentence about the inbox, not a session;
 * the link in the mail lands on /verify. The sentence takes focus when it
 * replaces the form, because the button the person pressed has gone.
 */
export function SignUpForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const pending = state.kind === "pending";
  const sentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.kind === "sent") sentRef.current?.focus();
  }, [state.kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setState({ kind: "pending" });
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      callbackURL: VERIFY_PATH,
    });
    if (error) {
      setState({ kind: "failed", message: describeAuthFailure(error, "sign-up") });
      return;
    }
    setState({ kind: "sent" });
  }

  if (state.kind === "sent") {
    return (
      <div ref={sentRef} tabIndex={-1}>
        <InlineFeedback tone="success" cue className={styles.feedback}>
          {copy.sent}
        </InlineFeedback>
      </div>
    );
  }

  return (
    <form method="post" className={styles.form} onSubmit={submit} noValidate={false}>
      <FormField label={copy.name.label} help={copy.name.help} required>
        <TextInput name="name" type="text" autoComplete="name" maxLength={100} />
      </FormField>
      <FormField label={copy.email.label} help={copy.email.help} required>
        <TextInput name="email" type="email" autoComplete="email" />
      </FormField>
      <FormField label={copy.password.label} help={copy.password.help} required>
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
        />
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
