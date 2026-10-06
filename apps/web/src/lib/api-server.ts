import { createApiClient, forwardedRequest, readMe } from "@tidefern/api-client";
import type { ApiClient, MeLookup } from "@tidefern/api-client";
import { GET as app } from "@/app/api/[[...route]]/route";

/**
 * The server-component client of architecture 5.2: the typed client whose
 * fetch is the mounted Hono app's own handler, called in process with the
 * incoming request's cookie and host, so a server render costs no second
 * function invocation and never meets a preview's protection. The handler
 * answers every method, so the one import serves GET and POST alike.
 *
 * Server only: the route module it calls holds the database and the auth
 * server, which no client bundle may carry.
 */
export function serverApiClient(incoming: Headers): ApiClient {
  const { baseUrl, headers } = forwardedRequest(incoming);
  return createApiClient({ baseUrl, headers, fetch: async (request) => app(request) });
}

/**
 * GET /api/v1/me for the request being rendered. Without a cookie there is
 * no session to read, so the API is not called at all.
 */
export async function readSessionMe(incoming: Headers): Promise<MeLookup> {
  if (incoming.get("cookie") === null) return { kind: "anonymous" };
  return readMe(serverApiClient(incoming));
}
