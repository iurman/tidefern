import { createHmac, randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

import type { ApiEnv } from "../context";
import { routeTemplate } from "./route";

export interface LoggerOptions {
  /**
   * `LOG_HMAC_SECRET` (architecture 17.1): keys the HMAC of the actor id.
   * Without it the line carries no actor at all; a bare hash of a UUID is
   * reversible by anyone holding the user table (architecture 9.1).
   */
  secret?: string | undefined;
  /** Where a line goes; standard output unless a test collects them. */
  sink?: ((line: string) => void) | undefined;
}

/**
 * The only fields a log line may carry (architecture 9.1): the route
 * template, the status, the latency, the request id, the method, the HMAC
 * of the actor id and the allowlisted client header. Never a path, a query
 * string, a header, a body or anything from one.
 */
export const LOG_FIELDS = [
  "requestId",
  "method",
  "route",
  "status",
  "latencyMs",
  "actor",
  "client",
] as const;

export interface LogLine {
  requestId: string;
  method: string;
  route: string;
  status: number;
  latencyMs: number;
  actor?: string;
  client?: string;
}

/** The response header that echoes the request id, so a person can quote it to support. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * The platform's request id (`x-vercel-id`): one or more region labels
 * joined by `::`, then the function's own token, a timestamp and a hash,
 * all lower-case. Nothing a person could type a word into.
 */
const VERCEL_ID = /^[a-z0-9]{1,16}(?:::[a-z0-9]{1,16})+-[0-9]{1,20}-[0-9a-z]{1,32}$/;

/** A client-chosen `x-request-id` is kept only when it is a UUID; anything else is replaced by a fresh one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `<platform>/<semver>` (architecture 5.1); anything else is left out of
 * the line. The prerelease or build part is capped at 16 characters so the
 * field cannot carry a sentence.
 */
const CLIENT = /^[a-z]+\/[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]{1,16})?$/;

/** HMAC-SHA256 of an id under the per-environment secret, base64url. */
export function hashId(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

/**
 * The platform's id first, so a line can be matched to the host's own
 * request log; a client's id only when it is a UUID; a fresh UUID
 * otherwise. Both accepted shapes are closed, so no free text reaches the
 * line either way.
 */
function requestIdFrom(headers: Headers): string {
  const platform = headers.get("x-vercel-id");
  if (platform !== null && VERCEL_ID.test(platform)) return platform;
  const client = headers.get("x-request-id");
  if (client !== null && UUID.test(client)) return client.toLowerCase();
  return randomUUID();
}

/**
 * One structured JSON line per `/v1` request with the allowlisted fields
 * and nothing else. The line is built from the route template and the
 * context, never from the URL, so a health word in a body or a query
 * string cannot reach it.
 */
export function logger(options: LoggerOptions = {}): MiddlewareHandler<ApiEnv> {
  const sink = options.sink ?? ((line: string) => console.log(line));
  const secret = options.secret;
  return async (c, next) => {
    const started = performance.now();
    const requestId = requestIdFrom(c.req.raw.headers);
    await next();
    c.header(REQUEST_ID_HEADER, requestId);
    const line: LogLine = {
      requestId,
      method: c.req.method.toUpperCase(),
      route: routeTemplate(c),
      status: c.res.status,
      latencyMs: Math.round(performance.now() - started),
    };
    const actor = c.var.actor;
    if (actor !== null && secret !== undefined && secret !== "") {
      line.actor = hashId(actor.id, secret);
    }
    const client = c.req.header("x-tidefern-client");
    if (client !== undefined && CLIENT.test(client)) line.client = client;
    sink(JSON.stringify(line));
  };
}
