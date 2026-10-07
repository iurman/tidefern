import { Hono } from "hono";

/** One captured message as a browser test reads it; `CapturedMail` in `@tidefern/auth` has this shape. */
export interface CapturedMessage {
  to: string;
  subject: string;
  link: string | undefined;
}

export interface MailCaptureOptions {
  /** The captured messages, oldest first: `capturedMail` from `@tidefern/auth`. */
  read: () => CapturedMessage[];
  /** Forgets every captured message: `clearCapturedMail` from `@tidefern/auth`. */
  clear: () => void;
}

/**
 * The `E2E_MAIL_CAPTURE` endpoint (architecture 15 and 17.1, task C5): a
 * browser test signs a fresh account up, reads its verification link here
 * and follows it, so the sign-up and onboarding suites need no seeded
 * person. It answers only what a test uses (the recipient, the generic
 * subject and the first link), never a body, and exists only when the host
 * passes the capture hooks, which it does under `E2E_MAIL_CAPTURE=true` off
 * Vercel. Outside the OpenAPI document, like the job runner.
 */
export function internalMailCapture(options: MailCaptureOptions) {
  return new Hono()
    .get("/e2e/mail", (c) => c.json({ messages: options.read() }, 200))
    .delete("/e2e/mail", (c) => {
      options.clear();
      return c.body(null, 204);
    });
}
