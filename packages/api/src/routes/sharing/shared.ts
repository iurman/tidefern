import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { schema } from "@tidefern/db";
import type { ActorDatabase, Transaction } from "@tidefern/db";
import { jobId as uuidv7 } from "@tidefern/db/jobs";

import type { ApiEnv } from "../../context";
import type { Mailer } from "../../jobs/notice";
import { problem } from "../../problem";
import type { ProblemCode } from "../../problem";

export { uuidv7 };

/**
 * What the sharing routes take from the host: the mail transport the
 * invitation goes out through (architecture 10.2), the origin the link is
 * built on, and the clock. Routes are registered by `createApp` through the
 * registry in `routes/index.ts`, which hands them the app and nothing else,
 * so the host attaches these to the app it got back with
 * `configureSharing(app, ...)`. Without a mailer the console transport of
 * 10.2 renders the mail to standard output, as `createAuth()` does for its
 * own mail; production passes `chooseMailer(process.env)`. Without a
 * database `withActor()` opens its transactions on the db package's
 * production client, which is the one the host passes `createApp` anyway;
 * tests pass PGlite.
 */
export interface SharingDependencies {
  db?: ActorDatabase | undefined;
  mailer?: Mailer | undefined;
  /** The https origin links are built on; the request's own origin when unset. */
  siteUrl?: string | undefined;
  /** The clock, for tests. */
  now?: (() => Date) | undefined;
}

const dependencies = new WeakMap<object, SharingDependencies>();

export function configureSharing(app: OpenAPIHono<ApiEnv>, configured: SharingDependencies): void {
  dependencies.set(app, configured);
}

export function sharingDependencies(app: OpenAPIHono<ApiEnv>): SharingDependencies {
  return dependencies.get(app) ?? {};
}

/**
 * Renders the invitation mail to standard output, the development and test
 * transport of architecture 10.2, in the same two lines `ConsoleMailer` in
 * `@tidefern/auth` prints. The address and the link are printed because a
 * developer has to open the link; the mail carries nothing else.
 */
export const consoleMailer: Mailer = {
  async send(message) {
    console.log(`mail to=${message.to} subject=${JSON.stringify(message.subject)}`);
    console.log(message.text);
  },
};

/**
 * Aborts the actor transaction and answers a problem. Thrown inside
 * `withActor` so nothing the handler wrote before the refusal commits; the
 * route's `answering` turns it into the response.
 */
export class SharingRefusal extends Error {
  override readonly name = "SharingRefusal";

  constructor(
    readonly status: 404 | 409 | 422,
    readonly code: ProblemCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

/**
 * Runs a handler and answers a thrown refusal as its problem. The routes
 * declare every status a refusal can carry, and `@hono/zod-openapi` checks
 * a handler's return against the declared responses as a typed union the
 * generic problem helper does not produce; the cast says the problem is one
 * of them.
 */
export async function answering<T>(c: Context<ApiEnv>, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SharingRefusal) {
      return problem(
        c,
        error.status,
        error.code,
        error.detail ? { detail: error.detail } : {},
      ) as unknown as T;
    }
    throw error;
  }
}

/** The `detail` values of the problems the sharing routes answer, for clients to branch on. */
export const sharingDetails = {
  /** 409 on acceptance: the invitee belongs to another household and has not said `move` or `stay`. */
  householdChoiceRequired: "household_choice_required",
  /** 409 on `move`: the invitee owns a household other people still belong to. */
  householdOwnerMustHandOver: "household_owner_must_hand_over",
  /** 409 on removal: the person is the only other guardian of a child the actor guards. */
  coGuardianshipUnresolved: "co_guardianship_unresolved",
  /** 409 on an invitation: an open one to that address already exists in the household. */
  invitationPending: "invitation_pending",
  /** 409 on an update: `If-Match` named a version that is no longer current. */
  staleVersion: "stale_version",
} as const;

/** The actor the route middleware guaranteed; a missing one is a programming error, not a 401. */
export function actorOf(c: Context<ApiEnv>) {
  const actor = c.var.actor;
  if (actor === null) throw new Error("requireActor must run before a sharing handler");
  return actor;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Opaque list cursors (architecture 5.1): the last id of the page, base64url. */
export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): string | null {
  if (cursor === undefined) return null;
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  if (!UUID.test(id) || encodeCursor(id) !== cursor) {
    throw new SharingRefusal(422, "validation_failed", "cursor_invalid");
  }
  return id;
}

/** One page of an already sorted list: the items after the cursor, and the cursor for the next page. */
export function page<T extends { id: string }>(
  sorted: readonly T[],
  cursor: string | null,
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const start = cursor === null ? 0 : sorted.findIndex((item) => item.id > cursor);
  const from = start === -1 ? sorted.length : start;
  const items = sorted.slice(from, from + limit);
  const last = items[items.length - 1];
  const nextCursor =
    last !== undefined && from + limit < sorted.length ? encodeCursor(last.id) : null;
  return { items, nextCursor };
}

/**
 * The version an `If-Match` header names (architecture 5.1), quoted or
 * bare; null when the header is absent. A header that is not a version is
 * the 422 problem, a stale one is the 409 problem.
 */
export function ifMatchVersion(c: Context<ApiEnv>): number | null {
  const header = c.req.header("If-Match");
  if (header === undefined) return null;
  const bare = header
    .trim()
    .replace(/^W\//, "")
    .replace(/^"(.*)"$/, "$1");
  if (!/^\d{1,9}$/.test(bare)) {
    throw new SharingRefusal(422, "validation_failed", "if_match_invalid");
  }
  return Number(bare);
}

export function requireCurrent(expected: number | null, current: number): void {
  if (expected !== null && expected !== current) {
    throw new SharingRefusal(409, "conflict", sharingDetails.staleVersion);
  }
}

/**
 * The invitation events in the activity view. E1's `audit()` accepts only
 * the actions 8.3 names (reads, writes and grant changes), so these three
 * are written with the same row shape here until they join `auditActions`.
 * The subject is the actor herself: the inviter for a sent or withdrawn
 * invitation, the invitee for an accepted one, which is also the one row
 * B8's insert policy lets each of them write before any grant exists.
 */
export const invitationAuditActions = {
  create: "invitation.create",
  withdraw: "invitation.withdraw",
  accept: "invitation.accept",
} as const;

export async function auditInvitation(
  tx: Transaction,
  actorId: string,
  action: (typeof invitationAuditActions)[keyof typeof invitationAuditActions],
  occurredAt: Date,
): Promise<void> {
  await tx.insert(schema.auditEvents).values({
    id: uuidv7(),
    actorId,
    action,
    subjectId: actorId,
    occurredAt,
  });
}
