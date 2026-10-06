import { and, eq, isNull } from "drizzle-orm";
import type { Actor, Grant } from "@tidefern/core";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";

/**
 * The columns of the actor's own profile that a client needs to render
 * itself: display, locale and the stage, which decides the home screen. No
 * health fact beyond the stage, and never the attestation or the
 * tombstone.
 */
export type ProfileSummary = Pick<
  typeof schema.profiles.$inferSelect,
  "displayName" | "timeZone" | "stage" | "weekStart" | "units" | "notificationDetail"
>;

/** A grant the actor holds, with the row facts `/v1/me` reports beside what `can()` reads. */
export interface HeldGrant extends Grant {
  /** The share categories the grants table holds; the private journal is never granted. */
  category: (typeof schema.grants.$inferSelect)["category"];
  id: string;
  createdAt: Date;
}

/**
 * What `can()` consumes (architecture 8.3 step 1), plus the actor's own
 * profile summary for `/v1/me`. `guardianOf` and `grants` are exactly the
 * shape in `packages/core`, so a route hands `c.var.actor` to `can()` as it
 * is.
 */
export interface RequestActor extends Actor {
  grants: HeldGrant[];
  profile: ProfileSummary | null;
}

/**
 * Loads the actor in one `withActor` transaction: the profile row, every
 * guardianship in `child_guardians`, and every grant in `grants` where the
 * actor is the grantee that is neither revoked nor tombstoned. The same
 * policies that guard the request's later queries guard these reads, so an
 * actor can never load a relationship RLS would hide from her.
 */
export async function loadActor(userId: string, db?: ActorDatabase): Promise<RequestActor> {
  return withActor(
    userId,
    async (tx) => {
      const [profile] = await tx
        .select({
          displayName: schema.profiles.displayName,
          timeZone: schema.profiles.timeZone,
          stage: schema.profiles.stage,
          weekStart: schema.profiles.weekStart,
          units: schema.profiles.units,
          notificationDetail: schema.profiles.notificationDetail,
        })
        .from(schema.profiles)
        .where(and(eq(schema.profiles.userId, userId), isNull(schema.profiles.deletedAt)))
        .limit(1);
      const guardianships = await tx
        .select({ childId: schema.childGuardians.childId })
        .from(schema.childGuardians)
        .where(eq(schema.childGuardians.userId, userId));
      const held = await tx
        .select({
          id: schema.grants.id,
          ownerId: schema.grants.ownerId,
          granteeId: schema.grants.granteeId,
          category: schema.grants.category,
          level: schema.grants.level,
          childId: schema.grants.childId,
          createdAt: schema.grants.createdAt,
        })
        .from(schema.grants)
        .where(
          and(
            eq(schema.grants.granteeId, userId),
            isNull(schema.grants.revokedAt),
            isNull(schema.grants.deletedAt),
          ),
        )
        .orderBy(schema.grants.createdAt, schema.grants.id);
      return {
        id: userId,
        profile: profile ?? null,
        guardianOf: guardianships.map((row) => row.childId),
        grants: held.map((row) => {
          const grant: HeldGrant = {
            id: row.id,
            ownerId: row.ownerId,
            granteeId: row.granteeId,
            category: row.category,
            level: row.level,
            revokedAt: null,
            createdAt: row.createdAt,
          };
          if (row.childId !== null) grant.childId = row.childId;
          return grant;
        }),
      };
    },
    db,
  );
}
