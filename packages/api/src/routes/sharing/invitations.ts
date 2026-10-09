import { createHash, randomBytes } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { listScope } from "@tidefern/core";
import { schema, withActor } from "@tidefern/db";
import type { Transaction } from "@tidefern/db";
import {
  Id,
  InvitableRole,
  Invitation,
  InvitationAcceptInput,
  InvitationAcceptance,
  InvitationInput,
  Invitations,
  Problem,
} from "@tidefern/schemas";

import { requireActor, requireFreshAuth } from "../../auth";
import type { ApiEnv } from "../../context";
import type { AreaOptions } from "../index";
import type { MailMessage } from "../../jobs/notice";
import { ownOriginOf } from "../../middleware/cross-site";
import {
  SharingRefusal,
  actorOf,
  answering,
  auditInvitation,
  decodeCursor,
  invitationAuditActions,
  page,
  sharingDependencies,
  sharingDetails,
  uuidv7,
} from "./shared";

/** Invitations expire 72 hours after they are sent (architecture 8.3 and the retention table of 11). */
export const INVITATION_TTL_MS = 72 * 60 * 60_000;

/**
 * Where the link lands: the sharing screen (12.1), with the token in the
 * fragment so it never reaches a server log or a query string. The page
 * posts it to the accept route once the invitee is signed in; a browser
 * keeps the fragment across the sign-in redirect because the redirect
 * target names none.
 */
export const INVITATION_PATH = "/sharing";

export const INVITATION_SUBJECT = "An invitation to Tidefern";

/** Generic words and the link, nothing about the inviter or what she tracks (architecture 10.2). */
export function invitationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: INVITATION_SUBJECT,
    text: [
      "Someone you know has invited you to share with them on Tidefern.",
      "",
      "Sign in with this email address, then open the link to accept:",
      link,
      "",
      "The link works for 72 hours and only once. If you were not expecting it, you can ignore this email.",
    ].join("\n"),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

const ListQuery = z.object({
  cursor: z.string().optional().openapi({ description: "The nextCursor of the previous page" }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ProblemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

export const createInvitationRoute = createRoute({
  method: "post",
  path: "/v1/sharing/invitations",
  tags: ["sharing"],
  summary: "Invite someone into the actor's household",
  description:
    "Mints a single-use token bound to the invitee's email, stores only its hash with a 72 hour expiry, and sends the link by mail. The actor's own household is created on the first invitation, unless she already belongs to a household she does not own (409 member_of_another_household). Needs a fresh authentication and an Idempotency-Key.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: {
    body: { content: { "application/json": { schema: InvitationInput } }, required: true },
  },
  responses: {
    201: {
      description: "The pending invitation",
      content: { "application/json": { schema: Invitation } },
    },
    401: ProblemResponse("No session, or one older than the fresh authentication window"),
    409: ProblemResponse(
      "An open invitation to that address already exists, the id is taken, or the actor belongs to a household she does not own",
    ),
    422: ProblemResponse("Validation failed"),
    503: ProblemResponse("No mail transport is configured; nothing was created or sent"),
  },
});

export const listInvitationsRoute = createRoute({
  method: "get",
  path: "/v1/sharing/invitations",
  tags: ["sharing"],
  summary: "The actor's pending invitations",
  description:
    "Invitations the actor sent that are neither accepted, withdrawn nor expired, oldest first.",
  middleware: [requireActor] as const,
  request: { query: ListQuery },
  responses: {
    200: { description: "One page", content: { "application/json": { schema: Invitations } } },
    401: ProblemResponse("No session"),
    422: ProblemResponse("Validation failed"),
  },
});

export const withdrawInvitationRoute = createRoute({
  method: "delete",
  path: "/v1/sharing/invitations/{id}",
  tags: ["sharing"],
  summary: "Withdraw a pending invitation",
  middleware: [requireActor] as const,
  request: { params: z.object({ id: Id }) },
  responses: {
    204: { description: "Withdrawn; the link no longer works" },
    401: ProblemResponse("No session"),
    404: ProblemResponse("No open invitation of the actor's by that id"),
  },
});

export const acceptInvitationRoute = createRoute({
  method: "post",
  path: "/v1/sharing/invitations/accept",
  tags: ["sharing"],
  summary: "Accept an invitation",
  description:
    "Joins the household the token names. The actor must be signed in with the verified email the invitation was sent to; anything else is 404. An invitee who already belongs to another household gets 409 and answers with household set to move or stay.",
  middleware: [requireActor] as const,
  request: {
    body: { content: { "application/json": { schema: InvitationAcceptInput } }, required: true },
  },
  responses: {
    200: {
      description: "The outcome",
      content: { "application/json": { schema: InvitationAcceptance } },
    },
    401: ProblemResponse("No session"),
    404: ProblemResponse("No open invitation for this token and this signed-in email"),
    409: ProblemResponse("The invitee belongs to another household and has to choose"),
    422: ProblemResponse("Validation failed"),
  },
});

type InvitationRow = typeof schema.invitations.$inferSelect;

function invitationBody(row: InvitationRow): Invitation {
  return {
    id: row.id,
    householdId: row.householdId,
    inviteeEmail: row.inviteeEmail,
    // The owner role is never invited into; the check invitations_role_is_invitable holds it.
    role: InvitableRole.parse(row.role),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function openInvitation(now: Date) {
  return and(
    isNull(schema.invitations.acceptedAt),
    isNull(schema.invitations.withdrawnAt),
    gt(schema.invitations.expiresAt, now),
  );
}

/**
 * The household the actor owns, created on first use: a household row and
 * her owner membership, which B8's policies let any signed-in actor write
 * once on an empty household. An actor who already belongs to a household
 * she does not own is refused instead of being given a second one, the
 * same one-household rule acceptance holds an invitee to (8.3): she leaves
 * that household first, then invites.
 */
async function ownedHousehold(tx: Transaction, actorId: string, now: Date): Promise<string> {
  const [owned] = await tx
    .select({ householdId: schema.householdMembers.householdId })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.userId, actorId),
        eq(schema.householdMembers.role, "owner"),
        eq(schema.householdMembers.status, "active"),
      ),
    )
    .orderBy(schema.householdMembers.joinedAt, schema.householdMembers.id)
    .limit(1);
  if (owned !== undefined) return owned.householdId;
  const [member] = await tx
    .select({ householdId: schema.householdMembers.householdId })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.userId, actorId),
        eq(schema.householdMembers.status, "active"),
      ),
    )
    .limit(1);
  if (member !== undefined) {
    throw new SharingRefusal(409, "conflict", sharingDetails.memberOfAnotherHousehold);
  }
  const householdId = uuidv7();
  await tx.insert(schema.households).values({ id: householdId, createdAt: now, updatedAt: now });
  await tx.insert(schema.householdMembers).values({
    id: uuidv7(),
    householdId,
    userId: actorId,
    role: "owner",
    status: "active",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return householdId;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  return code === "23505" || causeCode === "23505";
}

/** The boolean a definer helper answers; `tx.execute` is typed by the driver, so the row is named here. */
async function helperAnswers(tx: Transaction, query: ReturnType<typeof sql>): Promise<boolean> {
  const result = (await tx.execute(query)) as { rows: { ok: boolean | null }[] };
  return result.rows[0]?.ok === true;
}

export function registerInvitationRoutes(app: OpenAPIHono<ApiEnv>, options: AreaOptions): void {
  const { db } = options;
  app.openapi(createInvitationRoute, (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    const token = mintToken();
    const origin = deps.siteUrl ?? ownOriginOf(c.req.url, c.req.raw.headers);
    const link = `${origin}${INVITATION_PATH}#invitation=${token}`;
    const inviteeEmail = input.inviteeEmail.toLowerCase();
    return answering(c, async () => {
      const mailer = deps.mailer;
      if (mailer === undefined) {
        throw new SharingRefusal(503, "internal", sharingDetails.mailUnavailable);
      }
      const row = await withActor(
        actor.id,
        async (tx) => {
          const householdId = await ownedHousehold(tx, actor.id, now);
          const [pending] = await tx
            .select({ id: schema.invitations.id })
            .from(schema.invitations)
            .where(
              and(
                eq(schema.invitations.householdId, householdId),
                eq(sql`lower(${schema.invitations.inviteeEmail})`, inviteeEmail),
                openInvitation(now),
              ),
            )
            .limit(1);
          if (pending !== undefined) {
            throw new SharingRefusal(409, "conflict", sharingDetails.invitationPending);
          }
          let inserted: InvitationRow | undefined;
          try {
            [inserted] = await tx
              .insert(schema.invitations)
              .values({
                id: input.id ?? uuidv7(),
                householdId,
                inviterId: actor.id,
                inviteeEmail,
                role: input.role,
                tokenHash: hashToken(token),
                expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
                createdAt: now,
                updatedAt: now,
              })
              .returning();
          } catch (error) {
            // A client-minted id that already exists (architecture 5.1).
            if (isUniqueViolation(error)) throw new SharingRefusal(409, "conflict");
            throw error;
          }
          if (inserted === undefined) throw new Error("the invitation insert returned no row");
          await auditInvitation(tx, actor.id, invitationAuditActions.create, now);
          // Inside the transaction on purpose: a transport failure leaves no row behind.
          await mailer.send(invitationMail(inviteeEmail, link));
          return inserted;
        },
        db,
      );
      c.header("Location", `${c.req.path}/${row.id}`);
      return c.json(invitationBody(row), 201);
    });
  });

  app.openapi(listInvitationsRoute, (c) => {
    const actor = actorOf(c);
    const query = c.req.valid("query");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      const cursor = decodeCursor(query.cursor);
      const owner = listScope(actor, "share").find((scope) => scope.reason === "owner");
      const rows =
        owner === undefined
          ? []
          : await withActor(
              actor.id,
              (tx) =>
                tx
                  .select()
                  .from(schema.invitations)
                  .where(
                    and(eq(schema.invitations.inviterId, owner.subjectId), openInvitation(now)),
                  )
                  .orderBy(schema.invitations.id),
              db,
            );
      const paged = page(rows, cursor, query.limit);
      return c.json({ items: paged.items.map(invitationBody), nextCursor: paged.nextCursor }, 200);
    });
  });

  app.openapi(withdrawInvitationRoute, (c) => {
    const actor = actorOf(c);
    const { id } = c.req.valid("param");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      await withActor(
        actor.id,
        async (tx) => {
          const withdrawn = await tx
            .update(schema.invitations)
            .set({ withdrawnAt: now, updatedAt: now })
            .where(and(eq(schema.invitations.id, id), openInvitation(now)))
            .returning({ id: schema.invitations.id });
          if (withdrawn.length === 0) throw new SharingRefusal(404, "not_found");
          await auditInvitation(tx, actor.id, invitationAuditActions.withdraw, now);
        },
        db,
      );
      return c.body(null, 204);
    });
  });

  app.openapi(acceptInvitationRoute, (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      const outcome = await withActor(
        actor.id,
        async (tx): Promise<InvitationAcceptance> => {
          // The policies show the row to its inviter, the household owner and
          // the invitee; may_join() then says whether this actor is the
          // invitee, signed in with that verified email, while it is open.
          const [invitation] = await tx
            .select()
            .from(schema.invitations)
            .where(
              and(eq(schema.invitations.tokenHash, hashToken(input.token)), openInvitation(now)),
            )
            .limit(1);
          if (invitation === undefined) throw new SharingRefusal(404, "not_found");
          const invited = await helperAnswers(
            tx,
            sql`select may_join(${invitation.householdId}::uuid, ${invitation.role}::text) as ok`,
          );
          if (!invited) throw new SharingRefusal(404, "not_found");

          const memberships = await tx
            .select({
              householdId: schema.householdMembers.householdId,
              role: schema.householdMembers.role,
            })
            .from(schema.householdMembers)
            .where(
              and(
                eq(schema.householdMembers.userId, actor.id),
                eq(schema.householdMembers.status, "active"),
              ),
            );
          const alreadyHere = memberships.some((row) => row.householdId === invitation.householdId);
          const elsewhere = memberships.filter((row) => row.householdId !== invitation.householdId);
          if (elsewhere.length > 0) {
            if (input.household === undefined) {
              throw new SharingRefusal(409, "conflict", sharingDetails.householdChoiceRequired);
            }
            if (input.household === "stay") {
              return { invitationId: invitation.id, joined: false, householdId: null };
            }
            await leaveHouseholds(tx, actor.id, elsewhere, now);
          }

          if (!alreadyHere) {
            await tx.insert(schema.householdMembers).values({
              id: uuidv7(),
              householdId: invitation.householdId,
              userId: actor.id,
              role: invitation.role,
              status: "active",
              joinedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }
          // The invitee's only write to the invitation (B8): false means it
          // closed under her between the read above and now.
          const closed = await helperAnswers(
            tx,
            sql`select accept_invitation(${invitation.id}::uuid) as ok`,
          );
          if (!closed) throw new SharingRefusal(404, "not_found");
          await auditInvitation(tx, actor.id, invitationAuditActions.accept, now);
          return { invitationId: invitation.id, joined: true, householdId: invitation.householdId };
        },
        db,
      );
      return c.json(outcome, 200);
    });
  });
}

/**
 * `move`: the invitee ends her memberships elsewhere. A household she owns
 * with other active members cannot be left this way, because it would be
 * left without an owner; she hands it over first (a follow-up for the
 * household routes) and the problem says so.
 */
async function leaveHouseholds(
  tx: Transaction,
  actorId: string,
  memberships: { householdId: string; role: "owner" | "partner" | "guardian" }[],
  now: Date,
): Promise<void> {
  const owned = memberships.filter((row) => row.role === "owner").map((row) => row.householdId);
  if (owned.length > 0) {
    const others = await tx
      .select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .where(
        and(
          inArray(schema.householdMembers.householdId, owned),
          eq(schema.householdMembers.status, "active"),
        ),
      );
    if (others.some((row) => row.userId !== actorId)) {
      throw new SharingRefusal(409, "conflict", sharingDetails.householdOwnerMustHandOver);
    }
  }
  for (const membership of memberships) {
    await tx
      .update(schema.householdMembers)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.householdMembers.householdId, membership.householdId),
          eq(schema.householdMembers.userId, actorId),
          eq(schema.householdMembers.status, "active"),
        ),
      );
  }
}
