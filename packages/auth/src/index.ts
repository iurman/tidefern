// The server instance lives behind "@tidefern/auth/server" so that importing
// this entry never builds the database pool. The React client arrives with
// task C3.
export { CaptureMailer, ConsoleMailer } from "./mailer";
export type { MailMessage, Mailer } from "./mailer";
export {
  passwordResetEmail,
  reminderEmail,
  securityNoticeEmail,
  verificationEmail,
} from "./mail/templates";
export type { MailContent } from "./mail/templates";
export {
  DEFAULT_RESEND_TIMEOUT_MS,
  RESEND_SEND_URL,
  ResendError,
  ResendMailer,
} from "./mail/resend";
export type { ResendFailure, ResendMailerOptions } from "./mail/resend";
export { chooseMailTransport, chooseMailer } from "./mail/choose";
export type { ChooseMailerOptions, MailEnvironment, MailTransport } from "./mail/choose";
export { capturedMail, clearCapturedMail, linkIn, setCaptureMailer } from "./mail/capture";
export type { CapturedMail } from "./mail/capture";
export {
  DEFAULT_LOCAL_ORIGIN,
  VERCEL_PROJECT,
  apexOf,
  hostFactsFromEnvironment,
  previewHostPattern,
  resolveHosts,
  teamSlugFromDeploymentHost,
} from "./hosts";
export type { DynamicBaseUrl, HostEnvironment, HostFacts, ResolvedHosts } from "./hosts";
export type { Auth, CreateAuthOptions, Session } from "./auth";
export type { DatabaseHooks, UserCreatedHook, UserKeyHookOptions } from "./keys";
