import { freshAuthRequired } from "@/lib/auth-client";
import type { SettingsCallError } from "@/lib/auth-client";
import { welcomeCopy } from "./copy";

/**
 * What adding a passkey (`authClient.passkey.addPasskey()`, Better Auth's
 * passkey plugin over @simplewebauthn/browser) ended in, read from the
 * error it answers with. The ceremony's own refusals arrive as WebAuthn
 * codes: a closed prompt is `ERROR_CEREMONY_ABORTED`, or in Chromium a
 * NotAllowedError passed through as `ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY`;
 * a passkey this authenticator already holds for the account is
 * `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`. The server's refusal of a
 * session older than its fresh window is `SESSION_NOT_FRESH`.
 */
export type PasskeyOutcome = "already" | "closed" | "notFresh" | "failed";

const CLOSED = new Set([
  "ERROR_CEREMONY_ABORTED",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  "AUTH_CANCELLED",
]);

export function passkeyOutcome(error: SettingsCallError | null | undefined): PasskeyOutcome {
  if (error?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "already";
  if (error?.code !== undefined && CLOSED.has(error.code)) return "closed";
  if (freshAuthRequired(error)) return "notFresh";
  return "failed";
}

/** The sentence beside the buttons for an outcome other than a saved passkey. */
export function passkeySentence(outcome: PasskeyOutcome): string {
  const copy = welcomeCopy.passkey;
  switch (outcome) {
    case "already":
      return copy.already;
    case "closed":
      return copy.closed;
    case "notFresh":
      return copy.notFresh;
    case "failed":
      return copy.failed;
  }
}
