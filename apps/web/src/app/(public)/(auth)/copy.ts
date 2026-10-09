import type { AuthClientError } from "@/lib/auth-client";

/**
 * Every string the auth routes show, in one module (architecture 13.10).
 *
 * `docs/design/CONTENT.md` has no rows for sign up, sign in, verify, reset
 * and sign out yet, so apart from the two sentences it does carry ("That
 * email is already in use. Sign in instead." and the pending example
 * "Checking your passkey") the lines below are placeholders written to its
 * voice table: pending says what is happening, failure says what to do
 * next. They are an owner input, listed in the C3 report, and the owner
 * replaces them here in one place.
 */
export const authCopy = {
  signUp: {
    title: "Create an account",
    description: "Create a Tidefern account with your email and a password.",
    heading: "Create your account",
    lede: "One account for everything you keep in Tidefern. You choose what anyone else sees, and nothing is shared until you do.",
    name: { label: "Your name", help: "What Tidefern calls you. You can change it later." },
    email: { label: "Email", help: "We send a link here to confirm it." },
    password: {
      label: "Password",
      help: "At least 8 characters. A password manager can choose one for you.",
    },
    submit: "Create account",
    pending: "Creating your account",
    sent: "Check your inbox. We sent a link to confirm your email.",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
  },
  signIn: {
    title: "Sign in",
    description: "Sign in to your Tidefern account.",
    heading: "Sign in",
    lede: "Welcome back.",
    email: { label: "Email" },
    password: { label: "Password" },
    submit: "Sign in",
    pending: "Signing in",
    passkey: "Sign in with a passkey",
    passkeyPending: "Checking your passkey",
    forgot: "Forgot your password?",
    noAccount: "New to Tidefern?",
    createAccount: "Create an account",
    twoFactor: {
      heading: "Enter your code",
      lede: "Open your authenticator app and enter the 6-digit code for Tidefern.",
      code: { label: "Code", help: "The code changes every 30 seconds." },
      backupLede:
        "Enter one of the backup codes you saved when you turned on two-step sign-in. Each code works once.",
      backupCode: { label: "Backup code" },
      submit: "Continue",
      pending: "Checking the code",
      useBackup: "Use a backup code instead",
      useApp: "Use the authenticator app instead",
    },
  },
  verify: {
    title: "Verify your email",
    description: "The result of the link in your confirmation email.",
    heading: "Confirm your email",
    lede: "Open the link in the mail we sent you. It brings you back here once your email is confirmed.",
    confirmedHeading: "Your email is confirmed",
    confirmedLede: "Sign in and Tidefern is ready for you.",
    failedHeading: "This link no longer works",
    failedLede:
      "It may have expired or already been used. Sign in with your email and password and we send a fresh one if your email still needs confirming.",
    signIn: "Sign in",
  },
  reset: {
    title: "Reset your password",
    description: "Request a link to choose a new password.",
    heading: "Reset your password",
    lede: "Enter your email and we will send you a link to choose a new password.",
    email: { label: "Email" },
    submit: "Send the link",
    pending: "Sending the link",
    sent: "If that email has an account, a link is on its way. It works for one hour.",
    expired: "That link has expired. Request a new one below.",
    backToSignIn: "Back to sign in",
  },
  newPassword: {
    title: "Choose a new password",
    description: "Set a new password for your Tidefern account.",
    heading: "Choose a new password",
    lede: "Setting it signs you out everywhere else.",
    password: { label: "New password", help: "At least 8 characters." },
    confirm: { label: "Repeat the new password" },
    mismatch: "The two passwords differ. Type the same one in both fields.",
    submit: "Set the new password",
    pending: "Setting your password",
    done: "Your password is set. Sign in with it.",
    signIn: "Sign in",
    requestAgain: "Request a new link",
  },
} as const;

/**
 * Where a failed call is read from: the same code means a different next
 * step on sign-up than on sign-in.
 */
export type AuthFailureContext =
  "sign-up" | "sign-in" | "passkey" | "two-factor" | "reset-request" | "new-password";

/** The sentence under the form when a call fails: what to do next, never only that it failed. */
export function describeAuthFailure(
  error: AuthClientError | null | undefined,
  context: AuthFailureContext,
): string {
  if (error === null || error === undefined || error.status === 0) {
    return "We could not reach Tidefern. Check your connection and try again.";
  }
  if (error.status === 429) {
    return "Too many attempts in a row. Wait a minute and try again.";
  }
  if (context === "passkey" && error.code === "USER_NOT_FOUND") {
    return "That passkey is not on this account. Sign in with your password, or add the passkey in Settings.";
  }
  switch (error.code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "That email is already in use. Sign in instead.";
    case "INVALID_EMAIL":
      return "That does not look like an email address. Check it and try again.";
    case "PASSWORD_TOO_SHORT":
      return "Choose a password of at least 8 characters.";
    case "PASSWORD_TOO_LONG":
      return "Choose a password of at most 128 characters.";
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return context === "sign-in"
        ? "That email and password do not match. Check both, or reset your password."
        : "Something about that account does not match. Sign in again and retry.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email first. We just sent a fresh link to your inbox.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return context === "new-password"
        ? "This link has expired. Request a new one."
        : "That link no longer works. Request a new one.";
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return "That code did not match. Check it and try again.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many codes did not match. Wait a few minutes and sign in again.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "That sign-in has timed out. Sign in again from the start.";
    case "AUTH_CANCELLED":
      return "The passkey prompt was closed. Try again, or sign in with your password.";
    case "PASSKEY_NOT_FOUND":
    case "AUTHENTICATION_FAILED":
      return "That passkey is not on this account. Sign in with your password, or add the passkey in Settings.";
    default:
      break;
  }
  if (context === "passkey") {
    return "That passkey did not work. Try again, or sign in with your password.";
  }
  if (error.status >= 500) {
    return "Tidefern had a problem on our side. Wait a moment and try again.";
  }
  return "That did not work. Check what you entered and try again.";
}

/** Strips spaces from a code someone pasted from an authenticator app or a saved backup list. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "");
}
