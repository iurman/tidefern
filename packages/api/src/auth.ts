import type { MiddlewareHandler } from "hono";
import type { ActorDatabase } from "@tidefern/db";

import { loadActor } from "./actor";
import type { ApiEnv, SessionFacts } from "./context";
import { problem } from "./problem";

/** What a session lookup returns: the session row and the user it belongs to. */
export interface SessionLookup {
  session: {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
}

/**
 * The slice of a Better Auth instance the API uses. The Next.js host passes
 * the real `auth` from `@tidefern/auth/server`; tests pass a fake that
 * answers the same two calls. Keeping the contract this small is what lets
 * the API package never import the auth server (and so never build the
 * pool) in its own tests. `session.test.ts` proves the real instance fits.
 */
export interface SessionAuth {
  /** Serves every request under the auth base path. */
  handler(request: Request): Promise<Response>;
  api: {
    /** The session the request's cookie names, or null. */
    getSession(input: { headers: Headers }): Promise<SessionLookup | null>;
  };
}

/** Architecture 6.1: ten minutes since authentication for the sensitive operations. */
export const FRESH_AUTH_MAX_AGE_SECONDS = 600;

/** The `detail` of the 401 a stale session gets on a sensitive route (architecture 5.1). */
export const FRESH_AUTHENTICATION_REQUIRED = "fresh_authentication_required";

/**
 * A request can only carry a session in a cookie (the web client) or, from
 * Phase 3, a bearer header. Anything else is anonymous, so the health and
 * contract routes never cost a session lookup or a database round trip.
 */
function carriesCredential(headers: Headers): boolean {
  return headers.has("cookie") || headers.has("authorization");
}

/**
 * Loads the Better Auth session for the request and then the actor, and
 * sets both on the context; anonymous requests get null for each. Mounted
 * on `/v1/*`, so `/auth/*` is served by Better Auth itself without a
 * second lookup. Without an injected auth instance every request is
 * anonymous, which is what the contract emitter and the health tests run
 * with.
 */
export function withSession(
  auth: SessionAuth | undefined,
  db: ActorDatabase | undefined,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    c.set("session", null);
    c.set("actor", null);
    if (auth !== undefined && carriesCredential(c.req.raw.headers)) {
      const found = await auth.api.getSession({ headers: c.req.raw.headers });
      if (found !== null) {
        const session: SessionFacts = {
          id: found.session.id,
          userId: found.session.userId,
          createdAt: found.session.createdAt,
          expiresAt: found.session.expiresAt,
        };
        c.set("session", session);
        c.set("actor", await loadActor(session.userId, db));
      }
    }
    await next();
  };
}

/** Answers the 401 problem when the request has no actor; every `/v1` route that needs one lists it. */
export const requireActor: MiddlewareHandler<ApiEnv> = async (c, next) => {
  if (c.var.actor === null) return problem(c, 401, "unauthenticated");
  await next();
};

/**
 * Architecture 6.1: account deletion, data export, creating or changing a
 * grant, sending an invitation, revoking devices and changing email or
 * password need an authentication within the last `maxAgeSeconds`. The
 * answer for a stale session is the 401 problem with the
 * `fresh_authentication_required` detail (architecture 5.1), so a client
 * re-authenticates in place and retries; no session at all is the plain
 * 401. The authentication instant is `session.createdAt`, see
 * `SessionFacts`.
 */
export function requireFreshAuth(
  maxAgeSeconds: number = FRESH_AUTH_MAX_AGE_SECONDS,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const session = c.var.session;
    if (session === null || c.var.actor === null) return problem(c, 401, "unauthenticated");
    if (Date.now() - session.createdAt.getTime() > maxAgeSeconds * 1000) {
      return problem(c, 401, "unauthenticated", { detail: FRESH_AUTHENTICATION_REQUIRED });
    }
    await next();
  };
}
