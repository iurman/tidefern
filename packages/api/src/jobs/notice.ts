/**
 * The shape of `Mailer` in `@tidefern/auth`, repeated here so the API takes
 * the host's transport by structure and never depends on the auth package
 * at runtime. The real `ConsoleMailer`, `CaptureMailer` and `ResendMailer`
 * all fit it.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * The owner notice the sweep sends when the dead queue is not empty
 * (architecture 10.1 and 19). The subject and the body carry the count and
 * nothing else: no job type, no id, no error name. Those wait in the
 * database for the operations panel after sign-in.
 */
export function deadQueueNotice(to: string, count: number): MailMessage {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("a dead-queue notice needs a positive count");
  }
  const jobs = count === 1 ? "1 job is" : `${count} jobs are`;
  return {
    to,
    subject: "Tidefern jobs need attention",
    text: [
      `${jobs} in the dead queue after today's sweep.`,
      "Sign in to Tidefern and open the operations panel to see which.",
    ].join("\n"),
  };
}
