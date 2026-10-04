/**
 * The only place that decides access. Route handlers never compare ids
 * themselves. Every health record has a subject (whose body or child it is
 * about); access comes from ownership, guardianship, or an explicit grant.
 */

export type Action = "read" | "summary" | "write" | "share" | "delete";

export type Category =
  | "cycle.status"
  | "cycle.history"
  | "cycle.symptoms"
  | "journal.private"
  | "pregnancy.overview"
  | "pregnancy.photos"
  | "child";

export type Level = "summary" | "read" | "contribute";

export interface Grant {
  ownerId: string;
  granteeId: string;
  category: Category;
  level: Level;
  revokedAt: string | null;
}

export interface Actor {
  id: string;
  /** Children this actor is a guardian of. */
  guardianOf: string[];
  /** Active grants where this actor is the grantee. */
  grants: Grant[];
}

export interface Resource {
  subjectId: string;
  category: Category;
  /** Set for child records. */
  childId?: string;
}

const LEVEL_RANK: Record<Level, number> = { summary: 0, read: 1, contribute: 2 };

function requiredLevel(action: Action): Level | null {
  switch (action) {
    case "summary":
      return "summary";
    case "read":
      return "read";
    case "write":
      return "contribute";
    case "share":
    case "delete":
      return null;
  }
}

export interface Decision {
  allowed: boolean;
  reason: "owner" | "guardian" | "grant" | "denied";
}

export function can(actor: Actor, action: Action, resource: Resource): Decision {
  if (resource.subjectId === actor.id) return { allowed: true, reason: "owner" };
  if (resource.childId && actor.guardianOf.includes(resource.childId)) {
    return { allowed: true, reason: "guardian" };
  }
  if (resource.category === "journal.private") return { allowed: false, reason: "denied" };
  const needed = requiredLevel(action);
  if (needed === null) return { allowed: false, reason: "denied" };
  const grant = actor.grants.find(
    (candidate) =>
      candidate.revokedAt === null &&
      candidate.ownerId === resource.subjectId &&
      candidate.category === resource.category,
  );
  if (!grant) return { allowed: false, reason: "denied" };
  if (LEVEL_RANK[grant.level] >= LEVEL_RANK[needed]) return { allowed: true, reason: "grant" };
  return { allowed: false, reason: "denied" };
}
