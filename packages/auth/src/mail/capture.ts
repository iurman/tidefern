import type { CaptureMailer } from "../mailer";

/**
 * What the `E2E_MAIL_CAPTURE` endpoint (task C2) returns for one message:
 * the recipient, the generic subject and the first link in the body, which
 * is the verification or reset link a browser test needs. The body itself
 * stays out of the response; nothing in it is secret beyond the link, but
 * the endpoint should hand over exactly what the test uses.
 */
export interface CapturedMail {
  to: string;
  subject: string;
  link: string | undefined;
}

// The one capture mailer `chooseMailer()` activates when E2E_MAIL_CAPTURE is
// on, kept on globalThis rather than in module scope: a Next.js production
// build loads this module once per runtime (the route handler's and the
// server render's each have their own module cache), and the endpoint, the
// Better Auth callbacks and the sharing routes in every copy must see the
// same messages. `Symbol.for` gives each copy the same key.
const STORE = Symbol.for("tidefern.captureMailer");

type CaptureHolder = { [STORE]?: CaptureMailer | undefined };

function holder(): CaptureHolder {
  return globalThis as CaptureHolder;
}

/** The capture mailer that is active in this process, if any. */
export function activeCaptureMailer(): CaptureMailer | undefined {
  return holder()[STORE];
}

/**
 * Makes `mailer` the instance `capturedMail()` reads, or turns capture off
 * with `undefined`. Called by `chooseMailer()`; tests call it directly.
 */
export function setCaptureMailer(mailer: CaptureMailer | undefined): void {
  holder()[STORE] = mailer;
}

/** The first absolute http or https URL in a body, or undefined. */
export function linkIn(text: string): string | undefined {
  return /https?:\/\/\S+/.exec(text)?.[0];
}

/**
 * The captured messages, oldest first. Empty when capture is off, so the
 * endpoint answers the same shape in every environment it exists in.
 */
export function capturedMail(): CapturedMail[] {
  return (activeCaptureMailer()?.messages ?? []).map((message) => ({
    to: message.to,
    subject: message.subject,
    link: linkIn(message.text),
  }));
}

/** Forgets every captured message; a test calls it before each sign-up. */
export function clearCapturedMail(): void {
  activeCaptureMailer()?.clear();
}
