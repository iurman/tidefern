import { readSessionMe } from "@/lib/api-server";

export type SessionState = "anonymous" | "signed-in" | "closing" | "failed";

/**
 * Whether the incoming request carries a live session, read the way the
 * placeholder home screen reads it: GET /api/v1/me through the typed
 * client over the Hono app's own handler, called in process with the
 * incoming cookie, so the check costs no second function invocation and
 * never meets a preview's protection. A session whose account is already
 * closing is its own state: the API refuses it everywhere but the
 * closure, so the page points it at the locked view instead of Settings.
 */
export async function readSession(incoming: Headers): Promise<SessionState> {
  const lookup = await readSessionMe(incoming);
  if (lookup.kind === "ok") return "signed-in";
  return lookup.kind;
}
