import type { OpenAPIHono } from "@hono/zod-openapi";

import type { ApiEnv } from "../../context";
import { registerGrantRoutes } from "./grants";
import { registerInvitationRoutes } from "./invitations";

export { configureSharing, sharingDetails } from "./shared";
export type { SharingDependencies } from "./shared";
export {
  INVITATION_PATH,
  INVITATION_SUBJECT,
  INVITATION_TTL_MS,
  hashToken,
  invitationMail,
} from "./invitations";

/**
 * The sharing area (task E7): people and grants under `/v1/sharing`,
 * invitations under `/v1/sharing/invitations`. The invitation routes are
 * registered first so `/invitations/accept` is matched before any `{id}`
 * pattern could claim the word.
 */
export function registerSharing(app: OpenAPIHono<ApiEnv>): void {
  registerInvitationRoutes(app);
  registerGrantRoutes(app);
}
