"use client";
import { useState } from "react";
import { TideLine } from "@/components/public/tide-line";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import type { ClosureView } from "./closure";
import { CLOSING_VIEW_PATH, settingsCopy, settingsPaths } from "./copy";
import { ExportControl } from "./export-control";
import { problemFrom, refusalStep } from "./fresh-auth";
import { goTo } from "./navigate";
import styles from "./closing.module.css";

const copy = settingsCopy.closing;

type Undo =
  { kind: "idle" } | { kind: "pending" } | { kind: "done" } | { kind: "failed"; text: string };

/**
 * The locked view's body (task H7 on G10's /closing): where the closure
 * stands, said from GET /v1/me/close on the server, the undo while its
 * window is open, and the export, which a closing account may still take.
 * Only days are shown, never a clock time, because the profile and its time
 * zone are refused while the account is closing. The undo answers which
 * revoked things stay revoked, and the page says so before sending her back
 * to Settings. Sign out is the flow frame's.
 */
export function ClosingView({ view }: { view: ClosureView }) {
  const [undo, setUndo] = useState<Undo>({ kind: "idle" });

  async function undoClosure() {
    if (undo.kind === "pending") return;
    setUndo({ kind: "pending" });
    const answer = await browserApiClient()
      .POST("/api/v1/me/close/undo")
      .catch(() => null);
    if (answer === null) {
      setUndo({ kind: "failed", text: settingsCopy.failure.network });
      return;
    }
    const { response, error } = answer;
    if (response.ok) {
      setUndo({ kind: "done" });
      return;
    }
    if (refusalStep(problemFrom(error, response.status)) === "sign-in") {
      goTo(SIGN_IN_PATH);
      return;
    }
    let text: string = copy.undo.failed;
    if (response.status === 409) text = copy.undo.windowClosed;
    else if (response.status === 404) text = copy.undo.nothing;
    else if (response.status === 429) text = settingsCopy.failure.rateLimited;
    else if (response.status >= 500) text = settingsCopy.failure.server;
    setUndo({ kind: "failed", text });
  }

  if (undo.kind === "done") {
    return (
      <section className={styles.view} aria-labelledby="closing-title">
        <h1 id="closing-title" className={styles.heading}>
          {copy.heading.undone}
        </h1>
        <InlineFeedback tone="success" cue>
          {copy.undo.done}
        </InlineFeedback>
        <p className={styles.lede}>{copy.undo.after}</p>
        <Button href={settingsPaths.index}>{copy.undo.back}</Button>
      </section>
    );
  }

  const heading =
    view.kind === "undo"
      ? copy.heading.closing
      : view.kind === "deleting"
        ? copy.heading.deleting
        : copy.heading.plain;

  return (
    <section className={styles.view} aria-labelledby="closing-title">
      <h1 id="closing-title" className={styles.heading}>
        {heading}
      </h1>
      {view.kind === "undo" ? (
        <>
          {view.daysLeft > 1 ? (
            <p className={styles.count}>
              <span className={styles.number}>{view.daysLeft}</span>
              <span className={styles.label}>{copy.daysLeft(view.daysLeft)}</span>
            </p>
          ) : (
            <p className={styles.lastDay}>{copy.lastDay}</p>
          )}
          <p className={styles.lede}>{copy.undoLede}</p>
          <div className={styles.undo}>
            <Button
              onClick={() => void undoClosure()}
              loading={undo.kind === "pending"}
              loadingText={copy.undo.pending}
            >
              {copy.undo.action}
            </Button>
            {undo.kind === "failed" ? (
              <InlineFeedback tone="error" cue>
                {undo.text}
              </InlineFeedback>
            ) : null}
          </div>
        </>
      ) : null}
      {view.kind === "deleting" ? (
        <p className={styles.lede}>{copy.deleting[deletingKey(view.reason)]}</p>
      ) : null}
      {view.kind === "none" ? <p className={styles.lede}>{copy.notClosing}</p> : null}
      {view.kind !== "none" ? (
        <>
          <TideLine className={styles.tide} />
          <section className={styles.data} aria-labelledby="closing-data">
            <h2 id="closing-data" className={styles.subheading}>
              {copy.exportHeading}
            </h2>
            <p className={styles.help}>{copy.exportLede}</p>
            <ExportControl returnTo={CLOSING_VIEW_PATH} freshForMs={null} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function deletingKey(
  reason: "now" | "window-ended" | "started",
): "now" | "windowEnded" | "started" {
  return reason === "window-ended" ? "windowEnded" : reason;
}
