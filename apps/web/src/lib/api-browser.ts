import { createApiClient } from "@tidefern/api-client";
import type { ApiClient } from "@tidefern/api-client";

let client: ApiClient | undefined;

/**
 * The browser client of architecture 5.2: the typed client on the page's own
 * origin, sending the session cookie the browser already holds
 * (`credentials: "include"`). One instance per page, built on first use so
 * a server render that imports a client component never touches `window`.
 */
export function browserApiClient(): ApiClient {
  client ??= createApiClient({
    baseUrl: window.location.origin,
    fetch: (request) => window.fetch(new Request(request, { credentials: "include" })),
  });
  return client;
}
