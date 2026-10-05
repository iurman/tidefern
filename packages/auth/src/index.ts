// The server instance lives behind "@tidefern/auth/server" so that importing
// this entry never builds the database pool. The React client arrives with
// task C3.
export { CaptureMailer, ConsoleMailer } from "./mailer";
export type { MailMessage, Mailer } from "./mailer";
export { passwordResetEmail, verificationEmail } from "./email";
export type { MailContent } from "./email";
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
