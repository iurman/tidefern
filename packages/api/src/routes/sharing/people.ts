import { and, eq, inArray, isNull } from "drizzle-orm";
import { listScope } from "@tidefern/core";
import { schema } from "@tidefern/db";
import type { Transaction } from "@tidefern/db";
import type { SharingGrant, SharingPerson } from "@tidefern/schemas";

import type { RequestActor } from "../../actor";

export type GrantRow = typeof schema.grants.$inferSelect;
type MembershipRow = typeof schema.householdMembers.$inferSelect;

/**
 * One person the actor shares with or could share with, as the sharing
 * screen lists her: her membership of a household the actor belongs to,
 * the actor's children she also guards, and every grant row the actor has
 * given her, revoked ones included, so `version` moves with each change.
 */
export interface Person {
  id: string;
  displayName: string | null;
  role: MembershipRow["role"] | null;
  householdId: string | null;
  guardianOf: string[];
  /** Every grant row from the actor to this person, revoked ones included. */
  grants: GrantRow[];
}

/** The grants of a person that reach her today. */
export function activeGrants(person: Person): GrantRow[] {
  return person.grants.filter((grant) => grant.revokedAt === null && grant.deletedAt === null);
}

/**
 * What `If-Match` compares: the sum of the versions of every grant row from
 * the actor to this person. A create adds a row, an update or a revoke
 * bumps one, so any change moves it; two people's versions are unrelated.
 */
export function personVersion(person: Person): number {
  return person.grants.reduce((sum, grant) => sum + grant.version, 0);
}

/**
 * Everyone the actor can share with, keyed by id. The subjects come from
 * `listScope(actor, "share")`: her own scope names the grants she owns, and
 * each guardian scope names a child whose co-guardians count. Membership
 * and guardianship rows are read under B8's policies, which show a member
 * her co-members and a guardian her co-guardians; profiles are read under
 * `is_related()` and only the display name leaves this function.
 */
export async function loadPeople(
  tx: Transaction,
  actor: RequestActor,
): Promise<Map<string, Person>> {
  const scopes = listScope(actor, "share");
  const ownerScope = scopes.find((scope) => scope.reason === "owner");
  const guardedChildren = scopes.flatMap((scope) =>
    scope.reason === "guardian" && scope.childId !== undefined ? [scope.childId] : [],
  );
  const people = new Map<string, Person>();
  const person = (id: string): Person => {
    let found = people.get(id);
    if (found === undefined) {
      found = { id, displayName: null, role: null, householdId: null, guardianOf: [], grants: [] };
      people.set(id, found);
    }
    return found;
  };

  const memberships = await tx
    .select({ householdId: schema.householdMembers.householdId })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.userId, actor.id),
        eq(schema.householdMembers.status, "active"),
      ),
    );
  if (memberships.length > 0) {
    const members = await tx
      .select({
        userId: schema.householdMembers.userId,
        householdId: schema.householdMembers.householdId,
        role: schema.householdMembers.role,
      })
      .from(schema.householdMembers)
      .where(
        and(
          inArray(
            schema.householdMembers.householdId,
            memberships.map((row) => row.householdId),
          ),
          eq(schema.householdMembers.status, "active"),
        ),
      )
      .orderBy(schema.householdMembers.joinedAt, schema.householdMembers.id);
    for (const member of members) {
      if (member.userId === actor.id) continue;
      const entry = person(member.userId);
      if (entry.householdId === null) {
        entry.householdId = member.householdId;
        entry.role = member.role;
      }
    }
  }

  if (guardedChildren.length > 0) {
    const guardians = await tx
      .select({ childId: schema.childGuardians.childId, userId: schema.childGuardians.userId })
      .from(schema.childGuardians)
      .where(inArray(schema.childGuardians.childId, guardedChildren))
      .orderBy(schema.childGuardians.childId, schema.childGuardians.createdAt);
    for (const guardian of guardians) {
      if (guardian.userId === actor.id) continue;
      person(guardian.userId).guardianOf.push(guardian.childId);
    }
  }

  if (ownerScope !== undefined) {
    const owned = await tx
      .select()
      .from(schema.grants)
      .where(and(eq(schema.grants.ownerId, ownerScope.subjectId), isNull(schema.grants.deletedAt)))
      .orderBy(schema.grants.createdAt, schema.grants.id);
    // A grant brings a person into the list only while it is active; a
    // removed partner whose grants are all revoked drops out. Revoked rows
    // still count toward the version of anyone who is listed.
    const holding = new Set(
      owned.filter((grant) => grant.revokedAt === null).map((grant) => grant.granteeId),
    );
    for (const grant of owned) {
      if (holding.has(grant.granteeId) || people.has(grant.granteeId)) {
        person(grant.granteeId).grants.push(grant);
      }
    }
  }

  if (people.size > 0) {
    const profiles = await tx
      .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
      .from(schema.profiles)
      .where(
        and(inArray(schema.profiles.userId, [...people.keys()]), isNull(schema.profiles.deletedAt)),
      );
    for (const profile of profiles) person(profile.userId).displayName = profile.displayName;
  }

  return people;
}

export function grantBody(grant: GrantRow): SharingGrant {
  return {
    id: grant.id,
    category: grant.category,
    level: grant.level,
    ...(grant.childId !== null ? { childId: grant.childId } : {}),
    notify: grant.notify,
    version: grant.version,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
  };
}

/** The response shape: the display name, the relationship, the active grants and the version. */
export function personBody(person: Person): SharingPerson {
  const active = activeGrants(person);
  return {
    id: person.id,
    displayName: person.displayName,
    role: person.role,
    householdId: person.householdId,
    guardianOf: person.guardianOf,
    grants: active.map(grantBody),
    notify: active.some((grant) => grant.notify),
    version: personVersion(person),
  };
}

/** The people sorted by id, which is what the list cursor walks. */
export function sortedPeople(people: Map<string, Person>): Person[] {
  return [...people.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
