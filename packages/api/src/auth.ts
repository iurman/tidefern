import type { MiddlewareHandler } from "hono";
import { openClosureOf, withActor } from "@tidefern/db";
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
 * with. A person whose account is closing is refused here with the 401
 * `account_closing` problem on every route but her data rights (see
 * `mayReachWhileClosing`).
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
        if (
          !mayReachWhileClosing(c.req.method, c.req.path) &&
          (await isClosing(session.userId, db))
        ) {
          return problem(c, 401, "unauthenticated", { detail: ACCOUNT_CLOSING });
        }
        c.set("session", session);
        c.set("actor", await loadActor(session.userId, db));
      }
    }
    await next();
  };
}

/** The `detail` of the 401 an actor with an open closure gets (architecture 11, task I2). */
export const ACCOUNT_CLOSING = "account_closing";

/**
 * What a closing account may still reach: her data rights of architecture
 * 11 and nothing else. The closure's own routes, so she can read the
 * state, see a close answered (a replay, or the 409 that one is open) and
 * undo inside the window; the export, as E8 asked, so she can take her
 * records before they go; the data summary (confirm and access); and the
 * consent controls, since withdrawing consent is the other way into the
 * same closure. Every route that reads or writes health records, sharing,
 * children, notes or the profile is refused. Sign-out lives under
 * `/api/auth` and never passes this middleware. The `/api` prefix is
 * `API_PREFIX` in app.ts, permanent by its own comment.
 */
const CLOSING_MAY_REACH: readonly (readonly [string, RegExp])[] = [
  ["GET", /^\/api\/v1\/me\/close$/],
  ["POST", /^\/api\/v1\/me\/close$/],
  ["POST", /^\/api\/v1\/me\/close\/undo$/],
  ["GET", /^\/api\/v1\/me\/export$/],
  ["GET", /^\/api\/v1\/me\/data-summary$/],
  ["GET", /^\/api\/v1\/me\/consents$/],
  ["POST", /^\/api\/v1\/me\/consents$/],
  ["POST", /^\/api\/v1\/me\/consents\/[^/]+\/withdraw$/],
];

export function mayReachWhileClosing(method: string, path: string): boolean {
  return CLOSING_MAY_REACH.some(([allowed, pattern]) => allowed === method && pattern.test(path));
}

/**
 * Whether the person has an open closure, read as herself under the
 * `data_requests` policy. Architecture 11: the account is locked at once,
 * so from the close until the deletion finishes (or an undo) every other
 * route answers 401 `account_closing`.
 */
async function isClosing(userId: string, db: ActorDatabase | undefined): Promise<boolean> {
  return (await withActor(userId, (tx) => openClosureOf(tx, userId), db)) !== undefined;
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
