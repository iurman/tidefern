"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { TextInput } from "@/components/ui/text-input";
import {
  authClient,
  passkeyAutofillAvailable,
  passkeysAvailable,
  SIGNED_IN_PATH,
} from "@/lib/auth-client";
import type { AuthClientError, PasskeyHost } from "@/lib/auth-client";
import styles from "../auth.module.css";
import { authCopy, describeAuthFailure, normaliseCode } from "../copy";

const copy = authCopy.signIn;

/** WebAuthn support never changes while a page is open, so there is nothing to subscribe to. */
function subscribeToNothing() {
  return () => {};
}

type Step = "password" | "totp" | "backup";

type Busy = "none" | "password" | "passkey" | "code";

interface Failure {
  message: string;
}

/** The server answers a sign-in on a two-factor account with this body instead of a session. */
function needsSecondFactor(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "twoFactorRedirect" in data &&
    (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
  );
}

function leave() {
  // A full navigation, so /today reads the fresh session cookie on the server.
  window.location.assign(SIGNED_IN_PATH);
}

/**
 * Email and password, a passkey where the browser has WebAuthn, and the
 * second step when the server asks for it. The heading lives here because
 * it changes with the step. Each step's form carries its own `key`, so a
 * step change mounts a fresh form instead of React rewriting the previous
 * step's fields in place (which would carry the email into the code field
 * and leave focus nowhere); the code field then takes focus on mount,
 * since the control the person submitted from has gone with the password
 * form. It mounts only after that action, never on page load. Nothing here
 * ever sends `trustDevice`.
 */
export function SignInForm() {
  const [step, setStep] = useState<Step>("password");
  const [busy, setBusy] = useState<Busy>("none");
  const [failure, setFailure] = useState<Failure | null>(null);
  // False on the server and during hydration, the browser's answer after it.
  const passkeys = useSyncExternalStore(
    subscribeToNothing,
    () => passkeysAvailable(window as unknown as PasskeyHost),
    () => false,
  );

  useEffect(() => {
    const host = window as unknown as PasskeyHost;
    if (!passkeysAvailable(host)) return;
    let cancelled = false;
    // Offer a passkey inside the email field's autofill where the browser can.
    // This call waits for the person to pick one; its failures are never shown
    // because it is an offer, not something the person asked for.
    passkeyAutofillAvailable(host).then(async (available) => {
      if (!available || cancelled) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (data && !cancelled) leave();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function fail(error: AuthClientError | null, context: "sign-in" | "passkey" | "two-factor") {
    setFailure({ message: describeAuthFailure(error, context) });
    setBusy("none");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== "none") return;
    const form = new FormData(event.currentTarget);
    setFailure(null);
    setBusy("password");
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error) return fail(error, "sign-in");
    if (needsSecondFactor(data)) {
      setBusy("none");
      setStep("totp");
      return;
    }
    leave();
  }

  async function usePasskey() {
    if (busy !== "none") return;
    setFailure(null);
    setBusy("passkey");
    const { data, error } = await authClient.signIn.passkey();
    if (error || !data) return fail(error, "passkey");
    leave();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== "none") return;
    const form = new FormData(event.currentTarget);
    const code = normaliseCode(String(form.get("code") ?? ""));
    setFailure(null);
    setBusy("code");
    const result =
      step === "backup"
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
    if (result.error) return fail(result.error, "two-factor");
    leave();
  }

  function switchStep(next: Step) {
    setFailure(null);
    setStep(next);
  }

  if (step === "password") {
    return (
      <>
        <h1 id="sign-in-title" className={styles.heading}>
          {copy.heading}
        </h1>
        <p className={styles.lede}>{copy.lede}</p>
        <form key="password" className={styles.form} onSubmit={submitPassword}>
          <FormField label={copy.email.label} required>
            <TextInput
              name="email"
              type="email"
              autoComplete={passkeys ? "email webauthn" : "email"}
            />
          </FormField>
          <FormField label={copy.password.label} required>
            <TextInput name="password" type="password" autoComplete="current-password" />
          </FormField>
          <div className={styles.actions}>
            <Button
              type="submit"
              loading={busy === "password"}
              loadingText={copy.pending}
              disabled={busy === "passkey"}
            >
              {copy.submit}
            </Button>
            {passkeys ? (
              <Button
                type="button"
                variant="secondary"
                loading={busy === "passkey"}
                loadingText={copy.passkeyPending}
                disabled={busy === "password"}
                onClick={usePasskey}
              >
                {copy.passkey}
              </Button>
            ) : null}
          </div>
          {failure ? (
            <InlineFeedback tone="error" cue className={styles.feedback}>
              {failure.message}
            </InlineFeedback>
          ) : null}
        </form>
      </>
    );
  }

  const backup = step === "backup";
  const two = copy.twoFactor;
  return (
    <>
      <h1 id="sign-in-title" className={styles.heading}>
        {two.heading}
      </h1>
      <p className={styles.lede}>{backup ? two.backupLede : two.lede}</p>
      <form key={step} className={styles.form} onSubmit={submitCode}>
        {backup ? (
          <FormField label={two.backupCode.label} required>
            <TextInput
              name="code"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
            />
          </FormField>
        ) : (
          <FormField label={two.code.label} help={two.code.help} required>
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
        )}
        <div className={styles.actions}>
          <Button type="submit" loading={busy === "code"} loadingText={two.pending}>
            {two.submit}
          </Button>
        </div>
        {failure ? (
          <InlineFeedback tone="error" cue className={styles.feedback}>
            {failure.message}
          </InlineFeedback>
        ) : null}
      </form>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="quiet"
          onClick={() => switchStep(backup ? "totp" : "backup")}
        >
          {backup ? two.useApp : two.useBackup}
        </Button>
      </div>
    </>
  );
}
