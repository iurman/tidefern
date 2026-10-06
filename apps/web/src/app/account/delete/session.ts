import { GET as api } from "@/app/api/[[...route]]/route";

export type SessionState = "anonymous" | "signed-in" | "failed";

/**
 * Whether the incoming request carries a live session, read the way the
 * placeholder home screen reads it: the Hono app's own handler, called in
 * process with the incoming cookie, so the check costs no second function
 * invocation and never meets a preview's protection. The api-client
 * package (tasks E) replaces this with the typed client.
 */
export async function readSession(incoming: Headers): Promise<SessionState> {
  const cookie = incoming.get("cookie");
  if (cookie === null) return "anonymous";
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost";
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  try {
    const response = await api(
      new Request(`${protocol}://${host}/api/v1/me`, { headers: { cookie } }),
    );
    if (response.status === 401) return "anonymous";
    if (!response.ok) return "failed";
    return "signed-in";
  } catch {
    return "failed";
  }
}
