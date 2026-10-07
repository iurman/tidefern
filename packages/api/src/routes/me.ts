import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { Id, Problem, ShareCategory, ShareLevel, Stage } from "@tidefern/schemas";
import { notificationDetailValues, unitsValues } from "@tidefern/db/schema";

import { requireActor } from "../auth";
import type { ApiEnv } from "../context";

const MeProfile = z
  .object({
    displayName: z.string().nullable(),
    timeZone: z.string().describe("IANA time zone every calendar fact is read in"),
    stage: Stage,
    weekStart: z.int().min(1).max(7).describe("1 is Monday, 7 is Sunday"),
    units: z.enum(unitsValues),
    notificationDetail: z.enum(notificationDetailValues),
  })
  .openapi("MeProfile");

const HeldGrant = z
  .object({
    id: Id,
    ownerId: Id.describe("Whose records the grant reaches"),
    category: ShareCategory,
    level: ShareLevel,
    childId: Id.optional().describe("The one child a child grant reaches"),
    createdAt: z.iso.datetime(),
  })
  .openapi("HeldGrant");

export const Me = z
  .object({
    id: Id,
    // A union rather than .nullable(), which would mark the shared component itself as nullable.
    profile: z
      .union([MeProfile, z.null()])
      .describe("The profile summary, or null until onboarding creates the profile"),
    today: z.iso
      .date()
      .nullable()
      .describe(
        "Today in the profile's time zone on the server's calendar clock, the one today every screen counts from instead of the device clock; null until onboarding creates the profile",
      ),
    guardianOf: z.array(Id).describe("Children this actor is a guardian of"),
    grants: z.array(HeldGrant).describe("Active grants where this actor is the grantee"),
    session: z.object({
      expiresAt: z.iso.datetime(),
      authenticatedAt: z.iso.datetime().describe("When this session was created by signing in"),
    }),
  })
  .openapi("Me");
export type Me = z.infer<typeof Me>;

export const meRoute = createRoute({
  method: "get",
  path: "/v1/me",
  tags: ["identity"],
  summary: "The signed-in actor",
  description:
    "The actor id, the profile summary with today's date in its time zone, guardianships, active grants held and the session expiry: every client bootstraps from this one call.",
  middleware: [requireActor] as const,
  responses: {
    200: {
      description: "The actor",
      content: { "application/json": { schema: Me } },
    },
    401: {
      description: "No session",
      content: { "application/problem+json": { schema: Problem } },
    },
  },
});

/**
 * The response body for the actor on the context; the route's middleware
 * guarantees both are set. `today` is the calendar clock's (clock.ts), read
 * in the profile's zone, so a page renders the same day the API decides
 * cycle days, gestation weeks and ages on.
 */
export function meBody(c: Context<ApiEnv>): Me {
  const actor = c.var.actor;
  const session = c.var.session;
  if (actor === null || session === null) {
    throw new Error("requireActor must run before the /v1/me handler");
  }
  return {
    id: actor.id,
    profile: actor.profile,
    today: actor.profile === null ? null : c.var.clock.today(actor.profile.timeZone),
    guardianOf: actor.guardianOf,
    grants: actor.grants.map((grant) => ({
      id: grant.id,
      ownerId: grant.ownerId,
      category: grant.category,
      level: grant.level,
      ...(grant.childId !== undefined ? { childId: grant.childId } : {}),
      createdAt: grant.createdAt.toISOString(),
    })),
    session: {
      expiresAt: session.expiresAt.toISOString(),
      authenticatedAt: session.createdAt.toISOString(),
    },
  };
}
