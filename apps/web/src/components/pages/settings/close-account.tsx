"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { ChoiceList } from "./choice-list";
import { CLOSING_VIEW_PATH, settingsCopy as copy } from "./copy";
import { FreshAuthNotice, useFreshWindow } from "./fresh-auth-notice";
import { problemFrom, refusalStep } from "./fresh-auth";
import { goTo } from "./navigate";
import { Help } from "./settings-frame";
import styles from "./settings.module.css";

type CloseMode = "undo-window" | "now";

/**
 * Close account (architecture 11, task E8): a destructive dialog that names
 * the consequence and offers the two modes, the 7-day undo window or delete
 * now, in its body. Confirming calls POST /v1/me/close; the account is
 * locked from that moment, so the page goes to the locked view, which reads
 * the closure back and offers the undo. Closing needs a sign-in from the
 * last ten minutes.
 */
export function CloseAccount({
  returnTo,
  freshForMs,
}: {
  returnTo: string;
  freshForMs: number | null;
}) {
  const [fresh, markStale] = useFreshWindow(freshForMs);
  const [refused, setRefused] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CloseMode>("undo-window");
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
    const answer = await browserApiClient()
      .POST("/api/v1/me/close", { body: { mode } })
      .catch(() => null);
    if (answer === null) {
      setBusy(false);
      setError(copy.failure.network);
      return;
    }
    const { response, error: problem } = answer;
    // Closed now, or already closing from elsewhere: the locked view reads the closure back.
    if (response.ok || response.status === 409) {
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
    } else if (response.status === 429) {
      setError(copy.failure.rateLimited);
    } else {
      setError(response.status >= 500 ? copy.failure.server : copy.close.failed);
    }
  }

  return (
    <div className={styles.control}>
      <Help>{copy.close.help}</Help>
      {fresh ? (
        <div className={styles.actions}>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {copy.close.action}
          </Button>
        </div>
      ) : (
        <FreshAuthNotice text={copy.freshAuth.close} returnTo={returnTo} refused={refused} />
      )}
      <Dialog
        open={open}
        onClose={close}
        title={copy.close.title}
        variant="destructive"
        confirmLabel={copy.close.confirm[mode]}
        cancelLabel={copy.cancel}
        onConfirm={() => void confirm()}
        loading={busy}
        pendingLabel={copy.close.pending}
        error={error}
      >
        <p className={styles.dialogText}>{copy.close.consequence[mode]}</p>
        <p className={styles.dialogText}>{copy.revokes}</p>
        <ChoiceList
          legend={copy.close.modeLegend}
          options={copy.close.modes}
          value={mode}
          onChange={setMode}
          disabled={busy}
        />
      </Dialog>
    </div>
  );
}
