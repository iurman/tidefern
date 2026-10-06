import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, count, eq, inArray } from "drizzle-orm";
import { can } from "@tidefern/core";
import type { Resource } from "@tidefern/core";
import { schema, withActor } from "@tidefern/db";
import type { Transaction } from "@tidefern/db";
import {
  GrantSetInput,
  Id,
  NotifyInput,
  Problem,
  ShareCategory,
  SharingPeople,
  SharingPerson,
} from "@tidefern/schemas";
import type { GrantSetting } from "@tidefern/schemas";

import type { RequestActor } from "../../actor";
import { requireActor, requireFreshAuth } from "../../auth";
import type { ApiEnv } from "../../context";
import { audit, auditActions } from "../../middleware/audit";
import type { AuditAction } from "../../middleware/audit";
import { activeGrants, loadPeople, personBody, personVersion, sortedPeople } from "./people";
import type { GrantRow, Person } from "./people";
import {
  SharingRefusal,
  actorOf,
  answering,
  decodeCursor,
  ifMatchVersion,
  page,
  requireCurrent,
  sharingDependencies,
  sharingDetails,
  uuidv7,
} from "./shared";

const ListQuery = z.object({
  cursor: z.string().optional().openapi({ description: "The nextCursor of the previous page" }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const IfMatch = z.object({
  "if-match": z
    .string()
    .optional()
    .openapi({ description: "The person's version from the last response; 409 when stale" }),
});

const ProblemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: Problem } },
});

const PersonResponse = {
  description: "The person with her grants as they now stand",
  content: { "application/json": { schema: SharingPerson } },
};

export const listPeopleRoute = createRoute({
  method: "get",
  path: "/v1/sharing",
  tags: ["sharing"],
  summary: "People and what the actor shares with each",
  description:
    "Everyone in a household the actor belongs to, every co-guardian of a child she guards and everyone holding a grant from her, each with the actor's active grants to her by category and level.",
  middleware: [requireActor] as const,
  request: { query: ListQuery },
  responses: {
    200: { description: "One page", content: { "application/json": { schema: SharingPeople } } },
    401: ProblemResponse("No session"),
    422: ProblemResponse("Validation failed"),
  },
});

export const setGrantsRoute = createRoute({
  method: "put",
  path: "/v1/sharing/grants/{personId}",
  tags: ["sharing"],
  summary: "Set what one person may see",
  description:
    "Sets the level of each listed category for the person, creating, changing or revoking grants; categories not listed stay as they are. The private journal cannot be named. A child grant names the child and needs the actor to be its guardian. Needs a fresh authentication.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: {
    params: z.object({ personId: Id }),
    headers: IfMatch,
    body: { content: { "application/json": { schema: GrantSetInput } }, required: true },
  },
  responses: {
    200: PersonResponse,
    401: ProblemResponse("No session, or one older than the fresh authentication window"),
    404: ProblemResponse("No such person in the actor's sharing, or a child she does not guard"),
    409: ProblemResponse("If-Match named a version that is no longer current"),
    422: ProblemResponse("Validation failed"),
  },
});

export const revokeGrantRoute = createRoute({
  method: "delete",
  path: "/v1/sharing/grants/{personId}/{category}",
  tags: ["sharing"],
  summary: "Revoke one category from one person",
  description:
    "Takes effect on the person's next request. A child grant names the child with childId. Revoking never needs a step-up: reducing access is always one step.",
  middleware: [requireActor] as const,
  request: {
    params: z.object({ personId: Id, category: ShareCategory }),
    query: z.object({ childId: Id.optional() }),
  },
  responses: {
    204: { description: "Revoked" },
    401: ProblemResponse("No session"),
    404: ProblemResponse("No active grant of that category to that person"),
    422: ProblemResponse("Validation failed"),
  },
});

export const removePersonRoute = createRoute({
  method: "delete",
  path: "/v1/sharing/people/{personId}",
  tags: ["sharing"],
  summary: "Remove a partner",
  description:
    "Revokes every grant the actor gave the person and ends the household membership they share: the person's when the actor owns the household, the actor's own otherwise. Refused while the person is the only other guardian of a child the actor guards; the co-guardianship is handled first.",
  middleware: [requireActor] as const,
  request: { params: z.object({ personId: Id }) },
  responses: {
    204: { description: "Removed" },
    401: ProblemResponse("No session"),
    404: ProblemResponse("No such person in the actor's sharing"),
    409: ProblemResponse("The person is the only other guardian of a child"),
  },
});

export const setNotifyRoute = createRoute({
  method: "put",
  path: "/v1/sharing/notify",
  tags: ["sharing"],
  summary: "Tell this person when my period starts",
  description:
    "The per-person switch, stored on each of the actor's active grants to the person. 404 when nothing is shared with her yet.",
  middleware: [requireActor] as const,
  request: {
    headers: IfMatch,
    body: { content: { "application/json": { schema: NotifyInput } }, required: true },
  },
  responses: {
    200: PersonResponse,
    401: ProblemResponse("No session"),
    404: ProblemResponse("No such person, or no active grant to switch"),
    409: ProblemResponse("If-Match named a version that is no longer current"),
    422: ProblemResponse("Validation failed"),
  },
});

/** The resource a grant setting names: her own category, or the child for a child grant (8.3 step 2). */
function resourceOf(
  actor: RequestActor,
  setting: Pick<GrantSetting, "category" | "childId">,
): Resource {
  return setting.category === "child" && setting.childId !== undefined
    ? { subjectId: setting.childId, category: "child", childId: setting.childId }
    : { subjectId: actor.id, category: setting.category };
}

function matching(person: Person, category: GrantRow["category"], childId: string | null) {
  return activeGrants(person).find(
    (grant) => grant.category === category && grant.childId === childId,
  );
}

async function auditGrant(
  tx: Transaction,
  actor: RequestActor,
  action: AuditAction,
  resource: Resource,
): Promise<void> {
  await audit(tx, {
    actorId: actor.id,
    action,
    subjectId: resource.subjectId,
    category: resource.category,
    childId: resource.childId,
  });
}

/** Audited before the revoke, in the same transaction (E1's rule for grant.revoke). */
async function revoke(
  tx: Transaction,
  actor: RequestActor,
  grant: GrantRow,
  resource: Resource,
  now: Date,
): Promise<void> {
  await auditGrant(tx, actor, auditActions.grantRevoke, resource);
  await tx
    .update(schema.grants)
    .set({ revokedAt: now, updatedAt: now, version: grant.version + 1 })
    .where(eq(schema.grants.id, grant.id));
}

async function personOrRefuse(tx: Transaction, actor: RequestActor, personId: string) {
  const people = await loadPeople(tx, actor);
  const person = people.get(personId);
  if (person === undefined) throw new SharingRefusal(404, "not_found");
  return person;
}

export function registerGrantRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listPeopleRoute, (c) => {
    const actor = actorOf(c);
    const query = c.req.valid("query");
    const deps = sharingDependencies(app);
    return answering(c, async () => {
      const cursor = decodeCursor(query.cursor);
      const people = await withActor(actor.id, (tx) => loadPeople(tx, actor), deps.db);
      const paged = page(sortedPeople(people), cursor, query.limit);
      return c.json({ items: paged.items.map(personBody), nextCursor: paged.nextCursor }, 200);
    });
  });

  app.openapi(setGrantsRoute, (c) => {
    const actor = actorOf(c);
    const { personId } = c.req.valid("param");
    const input = c.req.valid("json");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      const expected = ifMatchVersion(c);
      const updated = await withActor(
        actor.id,
        async (tx) => {
          const person = await personOrRefuse(tx, actor, personId);
          requireCurrent(expected, personVersion(person));
          const notify = activeGrants(person).some((grant) => grant.notify);
          for (const setting of input.grants) {
            const resource = resourceOf(actor, setting);
            if (!can(actor, "share", resource).allowed) throw new SharingRefusal(404, "not_found");
            const existing = matching(person, setting.category, setting.childId ?? null);
            if (setting.level === null) {
              if (existing !== undefined) await revoke(tx, actor, existing, resource, now);
              continue;
            }
            if (existing !== undefined) {
              if (existing.level === setting.level) continue;
              await tx
                .update(schema.grants)
                .set({
                  level: setting.level,
                  policyVersion: input.policyVersion,
                  descriptionVersion: input.descriptionVersion,
                  updatedAt: now,
                  version: existing.version + 1,
                })
                .where(eq(schema.grants.id, existing.id));
              await auditGrant(tx, actor, auditActions.grantUpdate, resource);
              continue;
            }
            await tx.insert(schema.grants).values({
              id: uuidv7(),
              ownerId: actor.id,
              granteeId: person.id,
              category: setting.category,
              level: setting.level,
              childId: setting.childId ?? null,
              policyVersion: input.policyVersion,
              descriptionVersion: input.descriptionVersion,
              notify,
              createdAt: now,
              updatedAt: now,
            });
            await auditGrant(tx, actor, auditActions.grantCreate, resource);
          }
          return personOrRefuse(tx, actor, personId);
        },
        deps.db,
      );
      return c.json(personBody(updated), 200);
    });
  });

  app.openapi(revokeGrantRoute, (c) => {
    const actor = actorOf(c);
    const { personId, category } = c.req.valid("param");
    const { childId } = c.req.valid("query");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      if ((category === "child") !== (childId !== undefined)) {
        throw new SharingRefusal(422, "validation_failed", "child_id_matches_category");
      }
      await withActor(
        actor.id,
        async (tx) => {
          const person = await personOrRefuse(tx, actor, personId);
          const existing = matching(person, category, childId ?? null);
          if (existing === undefined) throw new SharingRefusal(404, "not_found");
          const setting: Pick<GrantSetting, "category" | "childId"> =
            childId === undefined ? { category } : { category, childId };
          await revoke(tx, actor, existing, resourceOf(actor, setting), now);
        },
        deps.db,
      );
      return c.body(null, 204);
    });
  });

  app.openapi(removePersonRoute, (c) => {
    const actor = actorOf(c);
    const { personId } = c.req.valid("param");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      await withActor(
        actor.id,
        async (tx) => {
          const person = await personOrRefuse(tx, actor, personId);
          if (person.guardianOf.length > 0) {
            const guardians = await tx
              .select({ childId: schema.childGuardians.childId, count: count() })
              .from(schema.childGuardians)
              .where(inArray(schema.childGuardians.childId, person.guardianOf))
              .groupBy(schema.childGuardians.childId);
            if (guardians.some((row) => row.count <= 2)) {
              throw new SharingRefusal(409, "conflict", sharingDetails.coGuardianshipUnresolved);
            }
          }
          for (const grant of activeGrants(person)) {
            const setting: Pick<GrantSetting, "category" | "childId"> =
              grant.childId === null
                ? { category: grant.category }
                : { category: grant.category, childId: grant.childId };
            await revoke(tx, actor, grant, resourceOf(actor, setting), now);
          }
          await endSharedMemberships(tx, actor.id, person.id, now);
        },
        deps.db,
      );
      return c.body(null, 204);
    });
  });

  app.openapi(setNotifyRoute, (c) => {
    const actor = actorOf(c);
    const input = c.req.valid("json");
    const deps = sharingDependencies(app);
    const now = deps.now?.() ?? new Date();
    return answering(c, async () => {
      const expected = ifMatchVersion(c);
      const updated = await withActor(
        actor.id,
        async (tx) => {
          const person = await personOrRefuse(tx, actor, input.personId);
          requireCurrent(expected, personVersion(person));
          const active = activeGrants(person);
          if (active.length === 0) throw new SharingRefusal(404, "not_found");
          for (const grant of active) {
            if (grant.notify === input.notify) continue;
            await tx
              .update(schema.grants)
              .set({ notify: input.notify, updatedAt: now, version: grant.version + 1 })
              .where(eq(schema.grants.id, grant.id));
            const setting: Pick<GrantSetting, "category" | "childId"> =
              grant.childId === null
                ? { category: grant.category }
                : { category: grant.category, childId: grant.childId };
            await auditGrant(tx, actor, auditActions.grantUpdate, resourceOf(actor, setting));
          }
          return personOrRefuse(tx, actor, input.personId);
        },
        deps.db,
      );
      return c.json(personBody(updated), 200);
    });
  });
}

/**
 * Ends what the two share: in a household the actor owns, the person's
 * membership; in one she does not own, her own, because B8 lets a member
 * end only her own row or, as owner, anyone's. Grants are already revoked,
 * and guardianship is its own table, untouched here.
 */
async function endSharedMemberships(
  tx: Transaction,
  actorId: string,
  personId: string,
  now: Date,
): Promise<void> {
  const mine = await tx
    .select({
      householdId: schema.householdMembers.householdId,
      role: schema.householdMembers.role,
    })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.userId, actorId),
        eq(schema.householdMembers.status, "active"),
      ),
    );
  if (mine.length === 0) return;
  const theirs = await tx
    .select({ householdId: schema.householdMembers.householdId })
    .from(schema.householdMembers)
    .where(
      and(
        inArray(
          schema.householdMembers.householdId,
          mine.map((row) => row.householdId),
        ),
        eq(schema.householdMembers.userId, personId),
        eq(schema.householdMembers.status, "active"),
      ),
    );
  for (const shared of theirs) {
    const own = mine.find((row) => row.householdId === shared.householdId);
    const leaving = own?.role === "owner" ? personId : actorId;
    await tx
      .update(schema.householdMembers)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.householdMembers.householdId, shared.householdId),
          eq(schema.householdMembers.userId, leaving),
          eq(schema.householdMembers.status, "active"),
        ),
      );
  }
}
