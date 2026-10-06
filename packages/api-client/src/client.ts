import createClient from "openapi-fetch";
import type { Client, Middleware } from "openapi-fetch";
import { uuidv7 } from "./id";
import { assertSafeQuery } from "./query";
import type { paths } from "./schema";

export interface ApiClientOptions {
  /**
   * The origin the API is mounted on, such as `https://tidefern.app`. Every
   * path in the contract already starts with `/api/v1`. Native clients pass
   * an explicit origin and never read the document's `servers` list.
   */
  baseUrl: string;
  /**
   * How a request reaches the API. In the browser this is `window.fetch`
   * with the session cookie; in a server component it is the mounted Hono
   * app's own handler, called in process (architecture 5.2). Defaults to
   * the global `fetch`.
   */
  fetch?: (request: Request) => Promise<Response>;
  /** Headers sent with every request, such as the forwarded session cookie. */
  headers?: HeadersInit;
  /**
   * Mints the UUIDv7 ids an offline-first client puts on a create and the
   * `Idempotency-Key` of each POST. Defaults to a Web Crypto UUIDv7.
   */
  generateId?: () => string;
}

export type ApiClient = Client<paths> & {
  /** A fresh UUIDv7 from the client's generator, for the `id` of a create. */
  newId: () => string;
};

const IDEMPOTENCY_KEY = "Idempotency-Key";

/**
 * The typed client of architecture 5.2: `openapi-fetch` over the paths
 * generated from openapi/v1.json, so a call's path, parameters, body and
 * answer are checked against the contract at compile time. Two rules hold
 * for every request whatever the caller passes:
 *
 * - the query string carries only the contract's ids, dates, instants,
 *   cursors, numbers and the child event kind, each in its own shape
 *   (see query.ts); anything else throws before the request leaves;
 * - a POST without an `Idempotency-Key` gets one from `generateId`
 *   (architecture 5.3). A caller that retries the same create passes its
 *   own key so the server can replay the first answer.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const generateId = options.generateId ?? (() => uuidv7());
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  });
  const guard: Middleware = {
    onRequest({ request }) {
      assertSafeQuery(new URL(request.url));
      if (request.method === "POST" && !request.headers.has(IDEMPOTENCY_KEY)) {
        request.headers.set(IDEMPOTENCY_KEY, generateId());
      }
      return request;
    },
  };
  client.use(guard);
  return Object.assign(client, { newId: generateId });
}
