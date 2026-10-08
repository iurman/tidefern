"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OwnerInput } from "@/components/public/policy-document";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { browserApiClient } from "@/lib/api-browser";
import { SIGNED_IN_PATH } from "@/lib/auth-client";
import { journeyCopy as copy, joinNames, type EndReason, type EndWord } from "./copy";
import { SIGN_IN_AGAIN_PATH, endFailure, keyMemory, validateEnd, type EndField } from "./forms";
import styles from "./journey.module.css";
import { useFocusFirstInvalid } from "./use-first-invalid";

const reasons: readonly { value: EndReason | ""; label: string }[] = [
  { value: "birth", label: copy.end.reasons.birth },
  { value: "loss", label: copy.end.reasons.loss },
  { value: "other", label: copy.end.reasons.other },
];

const words: readonly { value: EndWord; label: string }[] = [
  { value: "pregnancy", label: copy.end.words.pregnancy },
  { value: "baby", label: copy.end.words.baby },
];

export interface EndPregnancyProps {
  pregnancyId: string;
  /** Today in her zone: the latest day an ending can carry. */
  today: string;
  /** Day 0 of the pregnancy: the earliest. */
  start: string;
  /** Who sees her pregnancy overview, by name, or null when that is unknown. */
  sharedWith: string[] | null;
  /** A full navigation, so the next page reads the new stage; a test passes its own. */
  navigate?: (path: string) => void;
}

function assign(path: string) {
  window.location.assign(path);
}

/**
 * "Something changed? My pregnancy ended" and its dialog (DESIGN.md 5.3,
 * architecture 8.4): the day, capped at today; the reason, which nobody
 * but her ever sees; after a loss, the word she wants used, which the
 * dialog's own copy then uses (it is not stored this wave); the sentence
 * that a partner's view pauses with no notification; the one resources
 * link; and a single confirm. The API wants a sign-in from the last ten
 * minutes for this, so a refusal for that is shown as the next step, with
 * the way to sign in again, and never as a failure to retry. On success the
 * person lands on a quiet Today in a full navigation, so the shell and the
 * page both read her new stage.
 */
export function EndPregnancy({
  pregnancyId,
  today,
  start,
  sharedWith,
  navigate = assign,
}: EndPregnancyProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState<EndReason | null>(null);
  const [word, setWord] = useState<EndWord>("pregnancy");
  const [errors, setErrors] = useState<Partial<Record<EndField, string>>>({});
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [freshAuth, setFreshAuth] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const keys = useRef(keyMemory(() => browserApiClient().newId()));
  const dialogOpen = useRef(false);
  const fields = useFocusFirstInvalid(errors);

  function openDialog() {
    keys.current = keyMemory(() => browserApiClient().newId());
    setDate(null);
    setReason(null);
    setWord("pregnancy");
    setErrors({});
    setDialogError(undefined);
    setFreshAuth(false);
    setPageError(null);
    setGeneration((value) => value + 1);
    dialogOpen.current = true;
    setOpen(true);
  }

  function close() {
    dialogOpen.current = false;
    setOpen(false);
    setErrors({});
    setDialogError(undefined);
  }

  async function confirm() {
    if (busy) return;
    const invalid = validateEnd({ date, reason }, { today, start });
    if (invalid !== null || date === null || reason === null) {
      setErrors(invalid ?? {});
      return;
    }
    const body = { endedAt: date, reason };
    setBusy(true);
    setErrors({});
    setDialogError(undefined);
    let status = 0;
    let problem: unknown;
    try {
      const result = await browserApiClient().POST("/api/v1/pregnancies/{id}/end", {
        params: { path: { id: pregnancyId } },
        body,
        headers: { "Idempotency-Key": keys.current(body) },
      });
      status = result.response.status;
      problem = result.error;
    } catch {
      status = 0;
    }
    if (status === 200) {
      // The button keeps saying "Saving" until Today replaces this page.
      navigate(SIGNED_IN_PATH);
      return;
    }
    setBusy(false);
    const failure = endFailure(status, problem);
    if (failure.kind === "signed-out") return navigate(SIGN_IN_AGAIN_PATH);
    if (failure.kind === "fresh-auth") {
      // Not something a retry fixes: close the dialog and show the next step in place.
      close();
      setFreshAuth(true);
      return;
    }
    if (failure.kind === "fields") {
      if (dialogOpen.current) setErrors(failure.errors);
      else setPageError(copy.end.errors.failed);
      return;
    }
    if (dialogOpen.current) setDialogError(failure.text);
    else setPageError(failure.text);
    if (failure.refresh) router.refresh();
  }

  let paused: string = copy.end.pausedForAnyone;
  if (sharedWith !== null) {
    paused =
      sharedWith.length > 0 ? copy.end.pausedFor(joinNames(sharedWith)) : copy.end.notifyNobody;
  }

  return (
    <div className={styles.end}>
      <p className={styles.endPrompt}>
        <span>{copy.end.prompt}</span>{" "}
        <Button variant="quiet" className={styles.endTrigger} onClick={openDialog}>
          {copy.end.trigger}
        </Button>
      </p>
      {freshAuth ? (
        <div className={styles.feedback}>
          <InlineFeedback tone="error" cue>
            {copy.end.freshAuth.sentence}
          </InlineFeedback>
          <div>
            <Button href={SIGN_IN_AGAIN_PATH} variant="secondary">
              {copy.end.freshAuth.action}
            </Button>
          </div>
        </div>
      ) : null}
      {pageError !== null ? (
        <InlineFeedback tone="error" cue className={styles.feedback}>
          {pageError}
        </InlineFeedback>
      ) : null}
      <Dialog
        open={open}
        onClose={close}
        title={copy.end.title}
        confirmLabel={copy.end.confirm}
        cancelLabel={copy.end.cancel}
        onConfirm={() => void confirm()}
        loading={busy}
        pendingLabel={copy.end.pending}
        error={dialogError}
      >
        <div ref={fields} key={generation} className={styles.fields}>
          <SegmentedDateInput
            label={copy.end.dateLabel}
            order="mdy"
            required
            example={today}
            onChange={setDate}
            error={errors.endedAt}
          />
          <div className={styles.reason}>
            <SegmentedControl<EndReason | "">
              label={copy.end.reasonLabel}
              options={reasons}
              value={reason ?? ""}
              onChange={(value) => setReason(value || null)}
              error={errors.reason}
            />
            <p className={styles.help}>{copy.end.reasonPrivate}</p>
          </div>
          {reason === "loss" ? (
            <SegmentedControl<EndWord>
              label={copy.end.wordLabel}
              options={words}
              value={word}
              onChange={setWord}
            />
          ) : null}
          <p className={styles.help}>{paused}</p>
          <p className={styles.support}>
            {copy.end.support(reason, word)}: <OwnerInput>{copy.end.resourcesOwner}</OwnerInput>
          </p>
        </div>
      </Dialog>
    </div>
  );
}
