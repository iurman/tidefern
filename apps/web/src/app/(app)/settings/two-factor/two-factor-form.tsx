"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CopyCode } from "@/components/ui/copy-code";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextInput } from "@/components/ui/text-input";
import { authClient, freshAuthRequired, sessionGone, SIGN_IN_PATH } from "@/lib/auth-client";
import type { SettingsCallError } from "@/lib/auth-client";
import { describeTwoFactorFailure, twoFactorCopy as copy } from "./copy";
import { QrCode } from "./qr-code";
import { readTotpUri } from "./totp-uri";
import styles from "./two-factor.module.css";

/** The issuer the authenticator app lists the account under; the server's own setting says the same. */
const ISSUER = "Tidefern";

type Status = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; enabled: boolean };

type Purpose = "enable" | "disable" | "regenerate";

type Step =
  | { kind: "idle" }
  | { kind: "password"; purpose: Purpose }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "backup"; purpose: "enable" | "regenerate"; codes: string[] };

type Outcome = { kind: "none" } | { kind: "done"; sentence: string } | { kind: "fresh-auth" };

function leaveForSignIn() {
  // A full navigation, so the sign-in page starts from a clean server render.
  window.location.assign(SIGN_IN_PATH);
}

/** Strips the spaces a person types or pastes between the digits. */
function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "");
}

/** What the session read on mount came back with; `gone` means the cookie names no session. */
type Loaded = { kind: "gone" } | { kind: "failed" } | { kind: "ready"; enabled: boolean };

async function readStatus(): Promise<Loaded> {
  const { data, error } = await authClient.getSession();
  if (sessionGone(error as SettingsCallError | null)) return { kind: "gone" };
  if (error) return { kind: "failed" };
  // No error and no session: the cookie names nothing, so the person signs in.
  if (data === null) return { kind: "gone" };
  const user = data.user as { twoFactorEnabled?: boolean | null | undefined };
  return { kind: "ready", enabled: user.twoFactorEnabled === true };
}

/**
 * Enrollment, disabling and new backup codes for TOTP (architecture 6.1).
 * Every step that asks for something is its own form with its own `key`,
 * so a step change mounts fresh fields and focus lands in the new step
 * instead of on the body; the backup codes step and the result sentence
 * take focus themselves because the control that led there has gone. The
 * secret never leaves the browser except as the code the app computes
 * from it, and the backup codes live in state only until "I have saved
 * them". Nothing here ever sends `trustDevice`.
 */
export function TwoFactorForm() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const focusRef = useRef<HTMLDivElement>(null);

  // The read is a plain promise and the state lands in its callback, so the
  // mount effect sets nothing itself and a read that outlives the page is dropped.
  const apply = useCallback((loaded: Loaded) => {
    if (loaded.kind === "gone") return leaveForSignIn();
    setStatus(loaded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readStatus().then((loaded) => {
      if (!cancelled) apply(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  function reload() {
    setStatus({ kind: "loading" });
    readStatus().then(apply);
  }

  useEffect(() => {
    // The backup codes and the result sentence replace the control that was pressed.
    if (step.kind === "backup" || (step.kind === "idle" && outcome.kind !== "none")) {
      focusRef.current?.focus();
    }
  }, [step.kind, outcome.kind]);

  function begin(purpose: Purpose) {
    setFailure(null);
    setOutcome({ kind: "none" });
    setStep({ kind: "password", purpose });
  }

  function cancel() {
    if (busy) return;
    setFailure(null);
    setStep({ kind: "idle" });
  }

  /** True when the error ended the step; false when the step stays and shows the sentence. */
  function refuse(error: SettingsCallError | null, context: "password" | "code"): boolean {
    setBusy(false);
    if (sessionGone(error)) {
      leaveForSignIn();
      return true;
    }
    if (freshAuthRequired(error)) {
      setStep({ kind: "idle" });
      setOutcome({ kind: "fresh-auth" });
      return true;
    }
    setFailure(describeTwoFactorFailure(error, context));
    return false;
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || step.kind !== "password") return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setFailure(null);
    setBusy(true);
    if (step.purpose === "enable") {
      const { data, error } = await authClient.twoFactor.enable({
        password,
        issuer: ISSUER,
        method: "totp",
      });
      // The server answers the TOTP shape for this method; anything else is treated as a failure.
      if (error || !data || data.method !== "totp") {
        return void refuse(error as SettingsCallError | null, "password");
      }
      setBusy(false);
      setStep({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes });
      return;
    }
    if (step.purpose === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return void refuse(error as SettingsCallError | null, "password");
      setBusy(false);
      setStatus({ kind: "ready", enabled: false });
      setStep({ kind: "idle" });
      setOutcome({ kind: "done", sentence: copy.results.disabled });
      return;
    }
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    if (error || !data) return void refuse(error as SettingsCallError | null, "password");
    setBusy(false);
    setStep({ kind: "backup", purpose: "regenerate", codes: data.backupCodes });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || step.kind !== "scan") return;
    const code = normalizeCode(String(new FormData(event.currentTarget).get("code") ?? ""));
    setFailure(null);
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) return void refuse(error as SettingsCallError | null, "code");
    setBusy(false);
    setStatus({ kind: "ready", enabled: true });
    setStep({ kind: "backup", purpose: "enable", codes: step.backupCodes });
  }

  function finishBackup() {
    if (step.kind !== "backup") return;
    const sentence = step.purpose === "enable" ? copy.results.enabled : copy.results.regenerated;
    // The codes leave state here; nothing keeps them after this.
    setStep({ kind: "idle" });
    setOutcome({ kind: "done", sentence });
  }

  const feedback =
    failure !== null ? (
      <InlineFeedback tone="error" cue>
        {failure}
      </InlineFeedback>
    ) : null;

  return (
    <>
      {outcome.kind === "fresh-auth" ? (
        <div className={styles.feedback} ref={focusRef} tabIndex={-1}>
          <InlineFeedback tone="error" cue>
            {copy.freshAuth.sentence}
          </InlineFeedback>
          <div className={styles.feedbackAction}>
            <Button href={SIGN_IN_PATH} variant="secondary">
              {copy.freshAuth.action}
            </Button>
          </div>
        </div>
      ) : null}
      {outcome.kind === "done" ? (
        <div className={styles.feedback} ref={focusRef} tabIndex={-1}>
          <InlineFeedback tone="success" cue>
            {outcome.sentence}
          </InlineFeedback>
        </div>
      ) : null}

      {status.kind === "loading" ? (
        <p className={styles.pending} role="status" aria-live="polite" aria-busy="true">
          {copy.loading}
        </p>
      ) : null}

      {status.kind === "failed" ? (
        <div className={styles.feedback}>
          <InlineFeedback tone="error">{copy.loadFailed}</InlineFeedback>
          <div className={styles.feedbackAction}>
            <Button variant="secondary" onClick={reload}>
              {copy.reload}
            </Button>
          </div>
        </div>
      ) : null}

      {status.kind === "ready" && !status.enabled && step.kind === "idle" ? (
        <EmptyState
          heading={copy.off.heading}
          why={copy.off.why}
          action={<Button onClick={() => begin("enable")}>{copy.off.action}</Button>}
        />
      ) : null}

      {status.kind === "ready" && status.enabled && step.kind === "idle" ? (
        <div className={styles.status}>
          <p className={styles.statusLine}>{copy.on.status}</p>
          <p className={styles.statusDetail}>{copy.on.detail}</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => begin("regenerate")}>
              {copy.on.regenerate}
            </Button>
            <Button variant="destructive" onClick={() => begin("disable")}>
              {copy.on.disable}
            </Button>
          </div>
        </div>
      ) : null}

      {step.kind === "password" ? (
        <div className={styles.step}>
          <h2 className={styles.stepHeading}>
            {step.purpose === "enable"
              ? copy.password.enableHeading
              : step.purpose === "disable"
                ? copy.password.disableHeading
                : copy.password.regenerateHeading}
          </h2>
          <p className={styles.manualText}>
            {step.purpose === "enable"
              ? copy.password.enableLede
              : step.purpose === "disable"
                ? copy.password.disableLede
                : copy.password.regenerateLede}
          </p>
          <form
            method="post"
            key={`password-${step.purpose}`}
            className={styles.form}
            onSubmit={submitPassword}
          >
            <FormField label={copy.password.label} help={copy.password.help} required>
              <TextInput
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
              />
            </FormField>
            <div className={styles.actions}>
              <Button
                type="submit"
                variant={step.purpose === "disable" ? "destructive" : "primary"}
                loading={busy}
                loadingText={
                  step.purpose === "enable"
                    ? copy.password.pending
                    : step.purpose === "disable"
                      ? copy.password.disablePending
                      : copy.password.regeneratePending
                }
              >
                {step.purpose === "enable"
                  ? copy.password.continueLabel
                  : step.purpose === "disable"
                    ? copy.password.disableLabel
                    : copy.password.regenerateLabel}
              </Button>
              <Button type="button" variant="quiet" onClick={cancel} disabled={busy}>
                {copy.cancel}
              </Button>
            </div>
            {feedback}
          </form>
        </div>
      ) : null}

      {step.kind === "scan" ? (
        <div className={styles.step}>
          <h2 className={styles.stepHeading}>{copy.scan.heading}</h2>
          <p className={styles.manualText}>{copy.scan.lede}</p>
          <QrCode value={step.totpURI} label={copy.scan.qrLabel} />
          <Disclosure summary={copy.scan.manual}>
            <div className={styles.manual}>
              <p className={styles.manualText}>{copy.scan.manualLede}</p>
              {(() => {
                const facts = readTotpUri(step.totpURI);
                return facts ? (
                  <CopyCode code={facts.secret} label={copy.scan.secretLabel} />
                ) : null;
              })()}
              <CopyCode code={step.totpURI} label={copy.scan.uriLabel} />
            </div>
          </Disclosure>
          <form method="post" key="code" className={styles.form} onSubmit={submitCode}>
            <FormField label={copy.scan.code.label} help={copy.scan.code.help} required>
              <TextInput
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,8}"
                maxLength={8}
                autoFocus
              />
            </FormField>
            <div className={styles.actions}>
              <Button type="submit" loading={busy} loadingText={copy.scan.pending}>
                {copy.scan.submit}
              </Button>
              <Button type="button" variant="quiet" onClick={cancel} disabled={busy}>
                {copy.cancel}
              </Button>
            </div>
            {feedback}
          </form>
        </div>
      ) : null}

      {step.kind === "backup" ? (
        <div className={`${styles.step} ${styles.codes}`} ref={focusRef} tabIndex={-1}>
          <h2 className={styles.stepHeading}>
            {step.purpose === "enable"
              ? copy.backup.enabledHeading
              : copy.backup.regeneratedHeading}
          </h2>
          <p className={styles.manualText}>{copy.backup.shownOnce}</p>
          <CopyCode code={step.codes.join("\n")} label={copy.backup.codesLabel} />
          <div className={styles.actions}>
            <Button onClick={finishBackup}>{copy.backup.done}</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
