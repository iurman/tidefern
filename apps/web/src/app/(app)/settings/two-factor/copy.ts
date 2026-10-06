import type { SettingsCallError } from "@/lib/auth-client";
import { freshAuthRequired } from "@/lib/auth-client";

/**
 * Every string the two-step sign-in route shows, in one module (architecture
 * 13.10). `docs/design/CONTENT.md` has no rows for this route yet, so the
 * lines are written to its voice table (pending says what is happening,
 * failure says what to do next, empty says what would be here and the one
 * action) and are an owner input, listed in the C4 report. The product
 * words are "two-step sign-in"; "TOTP" and "two-factor" stay in code.
 */
export const twoFactorCopy = {
  title: "Two-step sign-in",
  description: "Add a code from an authenticator app to your sign-in.",
  heading: "Two-step sign-in",
  lede: "A code from an authenticator app alongside your password. Passkeys are the easier path, and this one works everywhere.",
  loading: "Checking your account",
  loadFailed: "We could not check your account. Reload the page to try again.",
  reload: "Reload",
  off: {
    heading: "Two-step sign-in is off",
    why: "Turn it on and every sign-in with your password also asks for a code from an authenticator app on your phone.",
    action: "Turn on two-step sign-in",
  },
  on: {
    status: "Two-step sign-in is on.",
    detail:
      "Signing in with your password also asks for a code from your authenticator app. A backup code works once if your phone is not at hand.",
    regenerate: "Make new backup codes",
    disable: "Turn off two-step sign-in",
  },
  password: {
    label: "Your password",
    help: "To confirm it is you.",
    enableHeading: "Confirm your password",
    enableLede: "Then scan a code with your authenticator app.",
    disableHeading: "Turn off two-step sign-in?",
    disableLede:
      "Signing in will ask for your password alone. You can turn it back on at any time.",
    regenerateHeading: "New backup codes",
    regenerateLede: "The codes you saved before stop working once the new ones are made.",
    continueLabel: "Continue",
    disableLabel: "Turn it off",
    regenerateLabel: "Make new codes",
    pending: "Checking your password",
    disablePending: "Turning it off",
    regeneratePending: "Making new codes",
  },
  scan: {
    heading: "Scan this code",
    lede: "Open your authenticator app, add an account and scan the code. Then enter the 6-digit code it shows.",
    qrLabel: "QR code for your authenticator app",
    manual: "Cannot scan it?",
    manualLede:
      "Add the account by hand instead: choose time-based, and enter this key as the secret.",
    secretLabel: "Setup key",
    uriLabel: "Setup link",
    code: { label: "Code from the app", help: "The code changes every 30 seconds." },
    submit: "Turn on two-step sign-in",
    pending: "Checking the code",
  },
  backup: {
    enabledHeading: "Two-step sign-in is on",
    regeneratedHeading: "Your new backup codes",
    shownOnce:
      "These backup codes are shown once. Save them somewhere safe, such as a password manager. Each works one time if your phone is not at hand.",
    codesLabel: "Backup codes",
    done: "I have saved them",
  },
  results: {
    disabled: "Two-step sign-in is off. Your password alone signs you in.",
    enabled: "Two-step sign-in is on.",
    regenerated: "Your new backup codes are in place. The old ones no longer work.",
  },
  freshAuth: {
    sentence:
      "For safety, this needs a sign-in from the last ten minutes. Sign in again, then come back here.",
    action: "Sign in again",
  },
  cancel: "Cancel",
  devicesLink: "Devices",
} as const;

export type TwoFactorFailureContext = "password" | "code";

/** The sentence under a failed call: what to do next, never only that it failed. */
export function describeTwoFactorFailure(
  error: SettingsCallError | null | undefined,
  context: TwoFactorFailureContext,
): string {
  if (freshAuthRequired(error)) return twoFactorCopy.freshAuth.sentence;
  if (error === null || error === undefined || error.status === 0) {
    return "We could not reach Tidefern. Check your connection and try again.";
  }
  if (error.status === 429) return "Too many attempts in a row. Wait a minute and try again.";
  switch (error.code) {
    case "INVALID_PASSWORD":
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That password did not match. Check it and try again.";
    case "INVALID_CODE":
      return "That code did not match. Wait for a new one in the app and try again.";
    case "TOTP_ALREADY_ENABLED":
      return "Two-step sign-in is already on for this account. Reload the page.";
    case "TOTP_NOT_ENABLED":
    case "TWO_FACTOR_NOT_ENABLED":
      return "Two-step sign-in is not on yet. Start again from the top of this page.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many codes did not match. Wait a few minutes and try again.";
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "This account has no password to confirm. Set one from the reset link on the sign-in page first.";
    default:
      break;
  }
  if (error.status >= 500)
    return "Tidefern had a problem on our side. Wait a moment and try again.";
  return context === "code"
    ? "That code did not work. Check it and try again."
    : "That did not work. Check your password and try again.";
}
