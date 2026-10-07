"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { CLOSING_VIEW_PATH, settingsCopy as copy } from "./copy";
import { FreshAuthNotice, useFreshWindow } from "./fresh-auth-notice";
import { problemFrom, refusalStep } from "./fresh-auth";
import { goTo } from "./navigate";
import { Help } from "./settings-frame";
import styles from "./settings.module.css";

/**
 * Withdraw consent (architecture 11): withdrawing the collection consent
 * closes the account, because Tidefern cannot keep her records without it,
 * and the page says so before the confirm as well as in it. POST
 * /v1/me/consents/{id}/withdraw withdraws every consent of hers at once and
 * opens a closure with the 7-day undo window, so the page then goes to the
 * locked view. It needs a sign-in from the last ten minutes, and each
 * attempt carries an Idempotency-Key of its own, so an attempt refused for
 * an old sign-in is never replayed after a new one.
 */
export function WithdrawConsent({
  consentId,
  returnTo,
  freshForMs,
}: {
  consentId: string;
  returnTo: string;
  freshForMs: number | null;
}) {
  const [fresh, markStale] = useFreshWindow(freshForMs);
  const [refused, setRefused] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function close() {
    setOpen(false);
    setError(undefined);
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const client = browserApiClient();
    const answer = await client
      .POST("/api/v1/me/consents/{id}/withdraw", {
        params: { path: { id: consentId }, header: { "idempotency-key": client.newId() } },
      })
      .catch(() => null);
    if (answer === null) {
      setBusy(false);
      setError(copy.failure.network);
      return;
    }
    const { response, error: problem } = answer;
    if (response.ok) {
      goTo(CLOSING_VIEW_PATH);
      return;
    }
    setBusy(false);
    const step = refusalStep(problemFrom(problem, response.status));
    if (step === "fresh-auth") {
      close();
      setRefused(true);
      markStale();
    } else if (step === "sign-in") {
      goTo(SIGN_IN_PATH);
    } else if (step === "closing") {
      goTo(CLOSING_VIEW_PATH);
    } else if (response.status === 409) {
      setError(copy.consent.withdraw.already);
    } else if (response.status === 404) {
      setError(copy.consent.withdraw.missing);
    } else if (response.status === 429) {
      setError(copy.failure.rateLimited);
    } else {
      setError(response.status >= 500 ? copy.failure.server : copy.consent.withdraw.failed);
    }
  }

  return (
    <div className={styles.withdraw}>
      <Help>{copy.consent.withdraw.lead}</Help>
      {fresh ? (
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {copy.consent.withdraw.action}
        </Button>
      ) : (
        <FreshAuthNotice text={copy.freshAuth.withdraw} returnTo={returnTo} refused={refused} />
      )}
      <Dialog
        open={open}
        onClose={close}
        title={copy.consent.withdraw.title}
        variant="destructive"
        confirmLabel={copy.consent.withdraw.confirm}
        cancelLabel={copy.cancel}
        onConfirm={() => void confirm()}
        loading={busy}
        pendingLabel={copy.consent.withdraw.pending}
        error={error}
      >
        <p className={styles.dialogText}>{copy.consent.withdraw.body}</p>
        <p className={styles.dialogText}>{copy.revokes}</p>
      </Dialog>
    </div>
  );
}
