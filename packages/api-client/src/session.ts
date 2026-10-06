import type { ApiClient } from "./client";
import type { components } from "./schema";

export type Me = components["schemas"]["Me"];

/** What GET /api/v1/me said: no session, the actor, or a failure that is not a 401. */
export type MeLookup = { kind: "anonymous" } | { kind: "ok"; me: Me } | { kind: "failed" };

/**
 * The session read every client bootstraps with (architecture 5.1). A 401
 * is a visitor without a session; any other failure (no database, for one)
 * is not, so a page can say the read failed instead of sending a signed-in
 * person to sign in.
 */
export async function readMe(client: ApiClient): Promise<MeLookup> {
  try {
    const { data, response } = await client.GET("/api/v1/me");
    if (response.status === 401) return { kind: "anonymous" };
    if (data === undefined) return { kind: "failed" };
    return { kind: "ok", me: data };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * The origin and headers a server-side client sends so the in-process call
 * looks like the request being rendered: the session cookie, and the host
 * and scheme the visitor used (behind Vercel's proxy, `x-forwarded-*`).
 * Nothing else is copied, so no client hint or tracking header reaches the
 * API's logs by way of a server render.
 */
export function forwardedRequest(incoming: Headers): { baseUrl: string; headers: Headers } {
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost";
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  const headers = new Headers();
  for (const name of ["cookie", "x-forwarded-host", "x-forwarded-proto"]) {
    const value = incoming.get(name);
    if (value !== null) headers.set(name, value);
  }
  return { baseUrl: `${protocol}://${host}`, headers };
}
