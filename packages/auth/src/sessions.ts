import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { uuidv7 } from "@tidefern/core";
import { auditActions, schema, withActor } from "@tidefern/db";
import type { ActorDatabase, AuditAction } from "@tidefern/db";
import { describeError } from "@tidefern/db/jobs";

/** The id `auth.options.plugins` lists this plugin under. */
export const SESSION_AUDIT_PLUGIN_ID = "session-audit";

/**
 * The Better Auth endpoints through which a person signs out other devices:
 * one session by its token, every other session, or every session. Signing
 * out the device in hand (`/sign-out`, or `/revoke-session` with its own
 * token) is not a device sign-out, and neither are the sessions a password
 * reset, a password change or turning two-step sign-in on or off end on
 * the way; those requests write no `session.revoke`.
 */
export const REVOKE_PATHS: ReadonlySet<string> = new Set([
  "/revoke-session",
  "/revoke-other-sessions",
  "/revoke-sessions",
]);

export interface SessionAuditOptions {
  /** Where `audit_events` lives; the pooled production client by default, PGlite in tests. */
  database?: ActorDatabase | undefined;
}

/**
 * The name and code of a failed database call, which quote nothing. A failed
 * query throws Drizzle's own error, which has neither (its name is plain
 * `Error`) and whose message quotes the statement's parameters; the driver's
 * error it keeps as the cause carries the SQLSTATE, so a log line can tell a
 * refused permission (42501) from a lost connection. An error with no cause,
 * such as a failed connect, is described as it is.
 */
function describeFailure(error: unknown): string {
  return describeError(
    error instanceof Error && error.cause instanceof Error ? error.cause : error,
  );
}

/**
 * What a failed audit write throws in place of the database's own error,
 * whose message and parameters quote the person's id. Better Auth logs
 * whatever a hook throws, and architecture 9.1 allows no user id in a log
 * line, so this keeps the action and the failure's name and code only
 * (`describeFailure()`), as `describeError()` does for the outbox.
 */
export class SessionAuditError extends Error {
  override readonly name = "SessionAuditError";

  constructor(action: AuditAction, underlying: unknown) {
    super(`The ${action} audit row was not written: ${describeFailure(underlying)}.`);
  }
}

/**
 * One row in the person's own name, actor and subject both, with no
 * category, no child and nothing about the device: the vocabulary has no
 * column for an address or a browser, and Better Auth's session row already
 * keeps those for the devices screen and deletes them at expiry
 * (architecture 7.4). `withActor()` lets B8's insert policy accept the row
 * whichever role the connection belongs to, the app role included.
 */
async function record(
  database: ActorDatabase | undefined,
  userId: string,
  action: AuditAction,
): Promise<void> {
  try {
    await withActor(
      userId,
      async (tx) => {
        await tx
          .insert(schema.auditEvents)
          .values({ id: uuidv7(), actorId: userId, action, subjectId: userId });
      },
      database,
    );
  } catch (error) {
    throw new SessionAuditError(action, error);
  }
}

/**
 * Writes sign-ins and device sign-outs to the audit log, so the activity
 * view can show them (task C7, architecture 8.3).
 *
 * `session.sign_in`: once per request that leaves a person holding a
 * session she did not hold when the request began. An endpoint after-hook
 * decides at the end of the request from Better Auth's `newSession`, which
 * is set exactly when the response sets a session cookie, and skips it when
 * the request already carried a session of the same person (a refreshed
 * session, or one rotated as two-step sign-in is turned on or off). A
 * database hook on session creation would not do: it fires for every
 * rotation, and for the session a password sign-in makes while the second
 * factor is still owed, which the two-factor plugin deletes in its own
 * after-hook, clearing `newSession`. Plugin after-hooks run in plugin
 * order, after the one in `options.hooks`, so `createAuth()` lists this
 * plugin after two-factor; it then sees only the sessions that stand, and
 * records a sign-in on a device trusted for the second factor without
 * guessing which devices are.
 *
 * `session.revoke`: once per request to `REVOKE_PATHS` that ended at least
 * one live session of hers other than the one making the request. A
 * database hook sees each session as it is deleted, so a token that is not
 * hers, not live or not known ends nothing and writes nothing; the first
 * deletion in a request writes the row and the rest of that request's
 * deletions find it written.
 *
 * Signing yourself out writes nothing, and the vocabulary has no
 * `session.end`: it ends only the session doing the asking, says nothing
 * about anyone reaching the account, and sessions also end silently at
 * expiry, so a row per sign-out would add noise without completing any
 * picture.
 *
 * Each row is written after the fact it records and in a transaction of
 * its own. If the write fails the request fails with a `SessionAuditError`:
 * a sign-in answers an error without its session cookie, so no usable
 * session goes unrecorded, and ends the session it made, which would
 * otherwise stay on her devices list, held by nobody, until it expired; a
 * revocation answers an error although the device was signed out, which
 * the devices list then shows.
 */
export function sessionAudit(options: SessionAuditOptions = {}) {
  const { database } = options;
  // The requests whose session.revoke is written, keyed by the request's own
  // context object, so one action that ends several devices writes one row.
  const revoked = new WeakSet<object>();

  return {
    id: SESSION_AUDIT_PLUGIN_ID,
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            delete: {
              after: async (session, context) => {
                // Typed `| null`, but a session ended outside a request (a job or a
                // script through the internal adapter) passes undefined. Neither
                // is a device sign-out.
                if (context == null || !REVOKE_PATHS.has(context.path)) return;
                const current = context.context.session;
                if (current === null) return;
                const mine = session.userId === current.session.userId;
                const thisDevice = session.token === current.session.token;
                const live = new Date(session.expiresAt).getTime() > Date.now();
                if (!mine || thisDevice || !live) return;
                if (revoked.has(context.context)) return;
                revoked.add(context.context);
                await record(database, current.session.userId, auditActions.sessionRevoke);
              },
            },
          },
        },
      },
    }),
    hooks: {
      after: [
        {
          matcher: (context) => context.context.newSession !== null,
          handler: createAuthMiddleware(async (ctx) => {
            // Better Auth's own definition: a session cookie is set on the response.
            const established = ctx.context.newSession;
            if (established === null) return;
            // A rotation or a refresh hands the same person a session she held.
            const held = ctx.context.session;
            if (held !== null && held.session.userId === established.session.userId) return;
            try {
              await record(database, established.session.userId, auditActions.sessionSignIn);
            } catch (failure) {
              // The 500 goes out without the cookie, so nobody holds this session:
              // end it. The path is a sign-in path, so the delete hook writes nothing.
              try {
                await ctx.context.internalAdapter.deleteSession(established.session.token);
                ctx.context.setNewSession(null);
              } catch (error) {
                // The audit failure stays the error to report. The delete's own
                // error quotes the token, so this line keeps its name and code.
                ctx.context.logger.error(
                  `The session of a sign-in whose audit row was not written could not be ended: ${describeFailure(error)}.`,
                );
              }
              throw failure;
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
