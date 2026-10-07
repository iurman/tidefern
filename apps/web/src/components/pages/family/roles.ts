import { listScope, type Action, type Actor, type Level } from "@tidefern/core";
import type { Me } from "@tidefern/api-client";

/**
 * What the family screens may offer for one child, decided the way the API
 * decides it: `listScope()` from packages/core (which asks `can()` about each
 * guardianship and grant) over the guardianships and active grants GET
 * /v1/me returned. The page never compares ids itself and never guesses a
 * grantee's rights: a control appears only where the API would answer the
 * call it makes, and the API stays the judge.
 */

export type ChildRole = "guardian" | Level;

export interface ChildAccess {
  /** A guardian, or the level of the child grant she holds. */
  role: ChildRole;
  /** Events, measurements and milestones answer her (`read` and above). */
  canRead: boolean;
  /** She can log, measure and check milestones (`contribute` and guardians). */
  canWrite: boolean;
  /** She can delete an event, which is how Undo works; guardians alone hold `delete`. */
  canDelete: boolean;
}

/**
 * The policy's actor from the session read. `me.grants` lists only active
 * grants with this person as the grantee, so each is unrevoked and hers.
 */
export function actorFrom(me: Pick<Me, "id" | "guardianOf" | "grants">): Actor {
  return {
    id: me.id,
    guardianOf: [...me.guardianOf],
    grants: me.grants.map((grant) => ({
      ownerId: grant.ownerId,
      granteeId: me.id,
      category: grant.category,
      level: grant.level,
      ...(grant.childId === undefined ? {} : { childId: grant.childId }),
      revokedAt: null,
    })),
  };
}

function reaches(actor: Actor, action: Action, childId: string): boolean {
  return listScope(actor, action).some((scope) => scope.childId === childId);
}

/** Her access to one child, or null when she cannot reach it at all. */
export function childAccess(
  me: Pick<Me, "id" | "guardianOf" | "grants">,
  childId: string,
): ChildAccess | null {
  const actor = actorFrom(me);
  const summary = listScope(actor, "summary").find((scope) => scope.childId === childId);
  if (summary === undefined) return null;
  return {
    role: summary.reason === "guardian" ? "guardian" : summary.level,
    canRead: reaches(actor, "read", childId),
    canWrite: reaches(actor, "write", childId),
    canDelete: reaches(actor, "delete", childId),
  };
}
