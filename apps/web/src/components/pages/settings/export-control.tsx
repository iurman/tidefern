"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { CLOSING_VIEW_PATH, EXPORT_FILE_NAME, settingsCopy as copy } from "./copy";
import { checkExportFile } from "./export-file";
import { FreshAuthNotice, useFreshWindow } from "./fresh-auth-notice";
import { problemFrom, refusalStep } from "./fresh-auth";
import { goTo } from "./navigate";
import styles from "./settings.module.css";

type ExportState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ready"; records: number; file: Blob }
  | { kind: "failed"; text: string }
  | { kind: "refused" };

/** How long a saved file's object URL lives: long enough for the browser to start the download. */
const OBJECT_URL_LIFETIME_MS = 60_000;

/** Hands the file to the browser's downloads under the API's own neutral file name. */
function saveFile(file: Blob) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

/**
 * Download my data (architecture 11, task E8): GET /v1/me/export read as
 * text through the browser client, because the body is newline-delimited
 * JSON and a plain link would show a 401's problem document instead of the
 * fresh sign-in step. The file is offered only when its last line is the
 * end line (export-file.ts); a file cut off partway says so instead.
 * Exporting needs a sign-in from the last ten minutes, which the page knows
 * before the press when it has the session (`freshForMs`).
 */
export function ExportControl({
  returnTo,
  freshForMs,
}: {
  returnTo: string;
  freshForMs: number | null;
}) {
  const [fresh, markStale] = useFreshWindow(freshForMs);
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  async function download() {
    if (state.kind === "pending") return;
    setState({ kind: "pending" });
    // A network failure, or a stream that broke partway, rejects the read.
    const answer = await browserApiClient()
      .GET("/api/v1/me/export", { parseAs: "text" })
      .catch(() => null);
    if (answer === null) {
      setState({ kind: "failed", text: copy.failure.network });
      return;
    }
    const { data, error, response } = answer;
    if (!response.ok) {
      const step = refusalStep(problemFrom(error, response.status));
      if (step === "fresh-auth") {
        markStale();
        setState({ kind: "refused" });
      } else if (step === "sign-in") {
        goTo(SIGN_IN_PATH);
      } else if (step === "closing") {
        goTo(CLOSING_VIEW_PATH);
      } else if (response.status === 429) {
        setState({ kind: "failed", text: copy.failure.rateLimited });
      } else {
        setState({
          kind: "failed",
          text: response.status >= 500 ? copy.failure.server : copy.export.failed,
        });
      }
      return;
    }
    const text = typeof data === "string" ? data : "";
    const check = checkExportFile(text);
    if (!check.complete) {
      setState({ kind: "failed", text: copy.export.cutOff });
      return;
    }
    const file = new Blob([text], { type: "application/octet-stream" });
    saveFile(file);
    setState({ kind: "ready", records: check.records, file });
  }

  if (!fresh) {
    return (
      <FreshAuthNotice
        text={copy.freshAuth.export}
        returnTo={returnTo}
        refused={state.kind === "refused"}
      />
    );
  }

  return (
    <div className={styles.control}>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => void download()}
          loading={state.kind === "pending"}
          loadingText={copy.export.pending}
        >
          {copy.export.action}
        </Button>
      </div>
      {state.kind === "pending" ? (
        <p className="sr-only" role="status">
          {copy.export.pending}
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <div className={styles.feedback}>
          <InlineFeedback tone="success" cue>
            {copy.export.ready(state.records)}
          </InlineFeedback>
          <Button variant="quiet" onClick={() => saveFile(state.file)}>
            {copy.export.saveAgain}
          </Button>
        </div>
      ) : null}
      {state.kind === "failed" ? (
        <InlineFeedback tone="error" cue>
          {state.text}
        </InlineFeedback>
      ) : null}
    </div>
  );
}
