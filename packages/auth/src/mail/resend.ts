import type { MailMessage, Mailer } from "../mailer";

/**
 * Resend's send endpoint, called directly so this package gains no
 * dependency. Request shape from the API reference
 * (https://resend.com/docs/api-reference/emails/send-email, read 2026-10-05):
 * `POST https://api.resend.com/emails` with `Authorization: Bearer <key>`
 * and a JSON body whose required fields are `from`, `to` and `subject`, with
 * `text` and `html` optional; a success answers 200 with `{ "id": "..." }`.
 * Errors (https://resend.com/docs/api-reference/errors) answer 4xx or 5xx
 * with a JSON `name` such as `validation_error` or `daily_quota_exceeded`.
 */
export const RESEND_SEND_URL = "https://api.resend.com/emails";

export const DEFAULT_RESEND_TIMEOUT_MS = 10_000;

export interface ResendMailerOptions {
  /** The `RESEND_API_KEY` value. */
  apiKey: string;
  /** The `EMAIL_FROM` value: an address, optionally as `Tidefern <hello@example>`. */
  from: string;
  /** Injected by tests; the global `fetch` otherwise. */
  fetch?: typeof fetch | undefined;
  /** How long one send may take before it is abandoned. */
  timeoutMs?: number | undefined;
  /** Receives one line per successful send; `console.log` by default. */
  log?: ((line: string) => void) | undefined;
}

export type ResendFailure = "response" | "timeout" | "network";

/**
 * Thrown when Resend did not accept a message. The message names the HTTP
 * status and Resend's error name when the body carried one; it never names
 * the recipient, the subject or the body, because this error ends up in logs.
 */
export class ResendError extends Error {
  constructor(
    readonly kind: ResendFailure,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(describe(kind, status, code));
    this.name = "ResendError";
  }
}

function describe(kind: ResendFailure, status?: number, code?: string): string {
  if (kind === "timeout") return "Resend did not answer before the timeout";
  if (kind === "network") return "Resend could not be reached";
  return code === undefined ? `Resend answered ${status}` : `Resend answered ${status} (${code})`;
}

// Resend's error names are snake case tokens; anything else in the body may
// echo the request (a validation message names the offending field and its
// value), so only a token-shaped name reaches the thrown error.
const ERROR_NAME = /^[a-z_]{1,64}$/;

function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
  });
}

// The body read is raced against the same signal as the request, so a
// refusal whose body stalls is bounded by the one timeout even when the
// injected fetch does not tie the body stream to the signal itself.
async function errorNameOf(response: Response, signal: AbortSignal): Promise<string | undefined> {
  try {
    const body: unknown = await Promise.race([response.json(), whenAborted(signal)]);
    if (typeof body !== "object" || body === null) return undefined;
    const name = (body as { name?: unknown }).name;
    return typeof name === "string" && ERROR_NAME.test(name) ? name : undefined;
  } catch {
    void response.body?.cancel().catch(() => undefined);
    return undefined;
  }
}

/**
 * The production transport. One send is one request with a bearer key and a
 * timeout; the message id Resend returns is discarded, and the only log line
 * is "mail sent" with a request id minted here, so a log can be correlated
 * with a retry but never with a person.
 */
export class ResendMailer implements Mailer {
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly log: (line: string) => void;

  constructor(private readonly options: ResendMailerOptions) {
    if (!options.apiKey) throw new TypeError("ResendMailer needs an API key");
    if (!options.from) throw new TypeError("ResendMailer needs a sender address");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS;
    this.log = options.log ?? ((line) => console.log(line));
  }

  async send(message: MailMessage): Promise<void> {
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // The timer runs until the request and, on a refusal, the error body
    // read are both over, so neither can outlive the timeout.
    try {
      let response: Response;
      try {
        response = await this.fetch(RESEND_SEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: this.options.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            ...(message.html !== undefined ? { html: message.html } : {}),
          }),
          signal: controller.signal,
        });
      } catch {
        throw new ResendError(controller.signal.aborted ? "timeout" : "network");
      }

      if (!response.ok) {
        const code = await errorNameOf(response, controller.signal);
        throw new ResendError("response", response.status, code);
      }
    } finally {
      clearTimeout(timer);
    }
    this.log(`mail sent request=${requestId}`);
  }
}
