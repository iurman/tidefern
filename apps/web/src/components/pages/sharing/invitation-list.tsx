"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { InvitationCard } from "@/components/ui/invitation-card";
import { browserApiClient } from "@/lib/api-browser";
import { sharingCopy as copy } from "./copy";
import type { InvitationView } from "./people";
import { attempt, describeWithdrawFailure, goTo, leaveFor } from "./problems";
import styles from "./sharing.module.css";

type Outcome =
  { kind: "done"; text: string } | { kind: "failed"; text: string; invitationId: string | null };

/**
 * The pending invitations (DESIGN.md 3.7): each an InvitationCard with the
 * invited address, the day it was sent in the actor's zone, and Withdraw in
 * one step. An invitation that is no longer open answers 404, which the
 * page says in CONTENT.md's words and then reads the list again.
 */
export function InvitationList({ invitations }: { invitations: readonly InvitationView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  function refresh(invitationId: string) {
    setSettled(invitationId);
    startRefresh(() => router.refresh());
  }

  async function withdraw(invitation: InvitationView) {
    if (busy !== null) return;
    setBusy(invitation.id);
    setOutcome(null);
    const result = await attempt(() =>
      browserApiClient().DELETE("/api/v1/sharing/invitations/{id}", {
        params: { path: { id: invitation.id } },
      }),
    );
    setBusy(null);
    if (result.ok) {
      setOutcome({ kind: "done", text: copy.withdraw.done(invitation.email) });
      refresh(invitation.id);
      return;
    }
    const leave = leaveFor(result);
    if (leave !== null) {
      goTo(leave);
      return;
    }
    const text = describeWithdrawFailure(result);
    if (result.status === 404) {
      // The card is about to go with the next read, so the sentence stays under the list.
      setOutcome({ kind: "failed", text, invitationId: null });
      refresh(invitation.id);
      return;
    }
    setOutcome({ kind: "failed", text, invitationId: invitation.id });
  }

  return (
    <>
      {invitations.length > 0 ? (
        <ul className={styles.invitations}>
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <InvitationCard
                name={invitation.email}
                sentOn={invitation.sentOn}
                onWithdraw={() => void withdraw(invitation)}
                loading={busy === invitation.id || (isRefreshing && settled === invitation.id)}
                error={
                  outcome?.kind === "failed" && outcome.invitationId === invitation.id
                    ? outcome.text
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      {outcome?.kind === "done" ? (
        <InlineFeedback tone="success" cue>
          {outcome.text}
        </InlineFeedback>
      ) : null}
      {outcome?.kind === "failed" && outcome.invitationId === null ? (
        <InlineFeedback tone="error" cue>
          {outcome.text}
        </InlineFeedback>
      ) : null}
    </>
  );
}
