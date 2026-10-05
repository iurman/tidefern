import { CaptureMailer, ConsoleMailer } from "../mailer";
import type { Mailer } from "../mailer";
import { setCaptureMailer } from "./capture";
import { ResendMailer } from "./resend";

/** The subset of the environment the transport choice is made from. */
export interface MailEnvironment {
  VERCEL_ENV?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  E2E_MAIL_CAPTURE?: string | undefined;
}

export type MailTransport = "resend" | "capture" | "console";

export interface ChooseMailerOptions {
  /** Injected into `ResendMailer`; the global `fetch` otherwise. */
  fetch?: typeof fetch | undefined;
  /** Where the console transport writes; stdout otherwise. */
  write?: ((line: string) => void) | undefined;
}

/**
 * Which transport the facts call for (architecture 7.5, 10.2, 15 and 17.1):
 *
 * - Resend only on Vercel production with both `RESEND_API_KEY` and
 *   `EMAIL_FROM`; previews never hold the key, so a seeded persona can never
 *   receive real mail.
 * - The capture mailer when `E2E_MAIL_CAPTURE` is exactly `true` anywhere
 *   but production. Setting it on production is refused outright, the same
 *   rule as `TIDEFERN_FAKE_NOW`.
 * - The console transport otherwise: local, previews and CI.
 *
 * Half a Resend configuration on production is refused too, because the
 * alternative is verification links printed into production logs.
 */
export function chooseMailTransport(env: MailEnvironment): MailTransport {
  const production = env.VERCEL_ENV === "production";
  const capture = env.E2E_MAIL_CAPTURE === "true";

  if (production && capture) {
    throw new Error("E2E_MAIL_CAPTURE must not be set when VERCEL_ENV is production");
  }
  if (production) {
    const key = Boolean(env.RESEND_API_KEY);
    const from = Boolean(env.EMAIL_FROM);
    if (key !== from) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM must be set together on production");
    }
    if (key && from) return "resend";
  }
  return capture ? "capture" : "console";
}

/**
 * Builds the mailer `chooseMailTransport()` names. Never reads `process.env`
 * itself: the module-scope `auth` in ../auth.ts passes the real environment,
 * tests pass facts.
 */
export function chooseMailer(env: MailEnvironment, options: ChooseMailerOptions = {}): Mailer {
  const transport = chooseMailTransport(env);
  if (transport === "capture") {
    const mailer = new CaptureMailer();
    setCaptureMailer(mailer);
    return mailer;
  }
  setCaptureMailer(undefined);
  if (transport === "resend") {
    return new ResendMailer({
      apiKey: env.RESEND_API_KEY as string,
      from: env.EMAIL_FROM as string,
      fetch: options.fetch,
    });
  }
  return new ConsoleMailer(options.write);
}
