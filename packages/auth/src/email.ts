import type { MailMessage } from "./mailer";

/** A rendered subject and body, with the recipient still to be attached. */
export type MailContent = Omit<MailMessage, "to">;

/**
 * The link alone, as text and as one anchor. Both are escaped: Better Auth
 * builds the URL from the configured base URL and a token, but a template
 * must never trust its input.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assertLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError("an email link must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError("an email link must be an http or https URL");
  }
}

/**
 * Sent on sign-up and whenever verification is requested again. The subject
 * is the generic one from section 10.2; the body is the link and a line
 * saying what to do if the person did not sign up.
 */
export function verificationEmail(url: string): MailContent {
  assertLink(url);
  return {
    subject: "Confirm your email",
    text: [
      "Confirm your email address to finish setting up your Tidefern account:",
      "",
      url,
      "",
      "If you did not create an account, you can ignore this message.",
    ].join("\n"),
    html: [
      "<p>Confirm your email address to finish setting up your Tidefern account:</p>",
      `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      "<p>If you did not create an account, you can ignore this message.</p>",
    ].join("\n"),
  };
}

/**
 * Sent when a password reset is requested. Every other session is revoked
 * once the reset completes (`revokeSessionsOnPasswordReset`), which the body
 * says so nobody is surprised by a sign-out.
 */
export function passwordResetEmail(url: string): MailContent {
  assertLink(url);
  return {
    subject: "Reset your Tidefern password",
    text: [
      "Use this link to choose a new Tidefern password:",
      "",
      url,
      "",
      "Choosing a new password signs you out everywhere else.",
      "If you did not ask for this, you can ignore this message and your password stays the same.",
    ].join("\n"),
    html: [
      "<p>Use this link to choose a new Tidefern password:</p>",
      `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      "<p>Choosing a new password signs you out everywhere else.</p>",
      "<p>If you did not ask for this, you can ignore this message and your password stays the same.</p>",
    ].join("\n"),
  };
}
