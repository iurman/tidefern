"use client";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { InvitationInput, type InvitableRole } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextInput } from "@/components/ui/text-input";
import { browserApiClient } from "@/lib/api-browser";
import { inviteRoles, sharingCopy as copy } from "./copy";
import { FreshSignIn } from "./fresh-sign-in";
import { attempt, describeInviteFailure, goTo, leaveFor, needsFreshSignIn } from "./problems";
import styles from "./sharing.module.css";

/** The invite form's email field, which the empty state's action moves focus to. */
export const INVITE_EMAIL_ID = "invite-email";

/** Whether an address has the shape the API takes (`InvitationInput.inviteeEmail`). */
export function invitableEmail(address: string): boolean {
  return InvitationInput.shape.inviteeEmail.safeParse(address).success;
}

type Outcome =
  { kind: "sent"; email: string } | { kind: "failed"; text: string } | { kind: "fresh-auth" };

/**
 * Invite someone by email with the role they get in the household
 * (architecture 8.3): POST /api/v1/sharing/invitations, which needs a sign-in
 * from the last ten minutes and mails a link the invitee accepts after
 * signing in with that address. Nothing is shared by the invitation itself;
 * initial grants are not part of the contract, so the form offers none.
 */
export function InviteForm() {
  const router = useRouter();
  const headingId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("partner");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [, startRefresh] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    setOutcome(null);
    if (!invitableEmail(address)) {
      setFieldError(copy.invite.emailInvalid);
      document.getElementById(INVITE_EMAIL_ID)?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const result = await attempt(() =>
      browserApiClient().POST("/api/v1/sharing/invitations", {
        body: { inviteeEmail: address, role },
      }),
    );
    setBusy(false);
    if (result.ok) {
      setEmail("");
      setOutcome({ kind: "sent", email: result.data?.inviteeEmail ?? address.toLowerCase() });
      startRefresh(() => router.refresh());
      return;
    }
    const leave = leaveFor(result);
    if (leave !== null) {
      goTo(leave);
      return;
    }
    if (needsFreshSignIn(result)) {
      setOutcome({ kind: "fresh-auth" });
      return;
    }
    const text = describeInviteFailure(result);
    if (result.status === 422) {
      setFieldError(text);
      return;
    }
    setOutcome({ kind: "failed", text });
  }

  return (
    <section className={styles.invite} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.subheading}>
        {copy.invite.heading}
      </h3>
      <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        <FormField
          id={INVITE_EMAIL_ID}
          label={copy.invite.email.label}
          help={copy.invite.email.help}
          error={fieldError}
          required
        >
          <TextInput
            type="email"
            name="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <SegmentedControl
          label={copy.invite.role}
          name="invite-role"
          options={inviteRoles}
          value={role}
          onChange={setRole}
        />
        <div className={styles.actions}>
          <Button type="submit" loading={busy} loadingText={copy.invite.pending}>
            {copy.invite.submit}
          </Button>
        </div>
        {outcome?.kind === "sent" ? (
          <InlineFeedback tone="success" cue>
            {copy.invite.sent(outcome.email)}
          </InlineFeedback>
        ) : null}
        {outcome?.kind === "failed" ? (
          <InlineFeedback tone="error" cue>
            {outcome.text}
          </InlineFeedback>
        ) : null}
        {outcome?.kind === "fresh-auth" ? <FreshSignIn sentence={copy.freshAuth.invite} /> : null}
      </form>
    </section>
  );
}
