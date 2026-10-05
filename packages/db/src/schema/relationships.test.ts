import { ShareCategory, ShareLevel } from "@tidefern/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./index";
import {
  ANNA,
  BEN,
  CARA,
  CHILD,
  HOUSEHOLD,
  OTHER_CHILD,
  constraintNames,
  expectJournalApplied,
  id,
  insertUser,
  refusal,
  rowSecurityFlags,
  rows,
  type Harness,
} from "./testing";
import { createTestDatabase } from "../test/harness";

let harness: Harness;

const EXPIRES_AT = new Date("2026-10-07T18:30:00Z");

function grant(
  n: number,
  values: Partial<typeof schema.grants.$inferInsert> = {},
): typeof schema.grants.$inferInsert {
  return {
    id: id(n),
    ownerId: ANNA,
    granteeId: BEN,
    category: "cycle.history",
    level: "read",
    policyVersion: "2026-10-01",
    descriptionVersion: "1",
    ...values,
  };
}

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await insertUser(harness, CARA, "cara@example.test");
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
});

afterAll(async () => {
  await harness.close();
});

describe("the relationships migration", () => {
  test("applies from empty as the third journal entry", async () => {
    await expectJournalApplied(harness, "0002_relationships");
  });

  test("pins the share vocabularies to the schemas package", () => {
    expect([...schema.shareCategoryValues]).toEqual(ShareCategory.options);
    expect(schema.shareCategoryEnum.enumValues).toEqual(ShareCategory.options);
    expect([...schema.shareLevelValues]).toEqual(ShareLevel.options);
    expect(schema.shareLevelEnum.enumValues).toEqual(ShareLevel.options);
    // The data categories are the share categories plus the private journal,
    // which can be consented to and read but never granted (core's Category).
    expect([...schema.dataCategoryValues]).toEqual([
      "cycle.status",
      "cycle.history",
      "cycle.symptoms",
      "journal.private",
      "pregnancy.overview",
      "pregnancy.photos",
      "child",
    ]);
    expect(schema.shareCategoryValues).not.toContain("journal.private");
  });

  test("enables row level security on every relationship table", async () => {
    const flags = await rowSecurityFlags(harness);
    expect(flags).toMatchObject({
      households: true,
      household_members: true,
      invitations: true,
      grants: true,
      consents: true,
    });
  });
});

describe("households and members", () => {
  test("store a member with the right types and defaults", async () => {
    const [member] = await harness.db
      .insert(schema.householdMembers)
      .values({ id: id(1), householdId: HOUSEHOLD, userId: ANNA, role: "owner" })
      .returning();
    expect(member).toMatchObject({
      householdId: HOUSEHOLD,
      userId: ANNA,
      role: "owner",
      status: "active",
      endedAt: null,
    });
    expect(member?.joinedAt).toBeInstanceOf(Date);
    expect(member?.createdAt).toBeInstanceOf(Date);
  });

  test("refuse the same person twice in one household", async () => {
    const message = await refusal(
      harness.db
        .insert(schema.householdMembers)
        .values({ id: id(2), householdId: HOUSEHOLD, userId: ANNA, role: "partner" }),
    );
    expect(message).toMatch(/household_members_household_user_unique/);
  });

  test("refuse an ended membership without its ended_at, and the reverse", async () => {
    const noDate = await refusal(
      harness.db.insert(schema.householdMembers).values({
        id: id(3),
        householdId: HOUSEHOLD,
        userId: BEN,
        role: "partner",
        status: "ended",
      }),
    );
    expect(noDate).toMatch(/household_members_ended_matches_status/);
    const activeWithDate = await refusal(
      harness.db.insert(schema.householdMembers).values({
        id: id(3),
        householdId: HOUSEHOLD,
        userId: BEN,
        role: "partner",
        endedAt: new Date(),
      }),
    );
    expect(activeWithDate).toMatch(/household_members_ended_matches_status/);
  });

  test("refuse a membership outside the role vocabulary", async () => {
    const message = await refusal(
      harness.db.execute(
        sql`insert into household_members (id, household_id, user_id, role) values (${id(4)}, ${HOUSEHOLD}, ${BEN}, 'friend')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum household_role/);
  });
});

describe("invitations", () => {
  test("store a hashed token bound to the invitee email with its expiry", async () => {
    const [invitation] = await harness.db
      .insert(schema.invitations)
      .values({
        id: id(10),
        householdId: HOUSEHOLD,
        inviterId: ANNA,
        inviteeEmail: "ben@example.test",
        role: "partner",
        tokenHash: "sha256:0123456789abcdef",
        expiresAt: EXPIRES_AT,
      })
      .returning();
    expect(invitation).toMatchObject({
      inviteeEmail: "ben@example.test",
      role: "partner",
      tokenHash: "sha256:0123456789abcdef",
      acceptedAt: null,
      withdrawnAt: null,
    });
    expect(invitation?.expiresAt.toISOString()).toBe(EXPIRES_AT.toISOString());

    const columns = rows(
      await harness.db.execute(
        sql`select column_name from information_schema.columns where table_name = 'invitations' order by column_name`,
      ),
    ).map((row) => row.column_name);
    // The token itself never lands in the table.
    expect(columns).not.toContain("token");
    expect(columns).toContain("token_hash");
  });

  test("refuse a second invitation with the same token hash", async () => {
    const message = await refusal(
      harness.db.insert(schema.invitations).values({
        id: id(11),
        householdId: HOUSEHOLD,
        inviterId: ANNA,
        inviteeEmail: "cara@example.test",
        role: "guardian",
        tokenHash: "sha256:0123456789abcdef",
        expiresAt: EXPIRES_AT,
      }),
    );
    expect(message).toMatch(/invitations_token_hash_unique/);
  });

  test("refuse inviting someone as owner", async () => {
    const message = await refusal(
      harness.db.insert(schema.invitations).values({
        id: id(12),
        householdId: HOUSEHOLD,
        inviterId: ANNA,
        inviteeEmail: "cara@example.test",
        role: "owner",
        tokenHash: "sha256:fedcba9876543210",
        expiresAt: EXPIRES_AT,
      }),
    );
    expect(message).toMatch(/invitations_role_is_invitable/);
  });
});

describe("grants", () => {
  test("store a grant with notify off, version 1 and no revocation", async () => {
    const [written] = await harness.db.insert(schema.grants).values(grant(20)).returning();
    expect(written).toMatchObject({
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.history",
      level: "read",
      childId: null,
      policyVersion: "2026-10-01",
      descriptionVersion: "1",
      notify: false,
      revokedAt: null,
      version: 1,
      deletedAt: null,
    });
    expect(written?.createdAt).toBeInstanceOf(Date);
    expect(written?.updatedAt).toBeInstanceOf(Date);
  });

  test("refuse a second active grant on the same tuple, with or without a child", async () => {
    const same = await refusal(harness.db.insert(schema.grants).values(grant(21)));
    expect(same).toMatch(/grants_active_unique/);

    await harness.db
      .insert(schema.grants)
      .values(grant(22, { category: "child", childId: CHILD, level: "contribute" }));
    const sameChild = await refusal(
      harness.db
        .insert(schema.grants)
        .values(grant(23, { category: "child", childId: CHILD, level: "summary" })),
    );
    expect(sameChild).toMatch(/grants_active_unique/);
  });

  test("allow a grant for another child and for another category", async () => {
    await harness.db
      .insert(schema.grants)
      .values([
        grant(24, { category: "child", childId: OTHER_CHILD }),
        grant(25, { category: "cycle.symptoms", level: "summary" }),
      ]);
    const active = await harness.db.query.grants.findMany({
      where: eq(schema.grants.granteeId, BEN),
      orderBy: schema.grants.id,
    });
    expect(active.map((row) => [row.category, row.childId])).toEqual([
      ["cycle.history", null],
      ["child", CHILD],
      ["child", OTHER_CHILD],
      ["cycle.symptoms", null],
    ]);
  });

  test("allow a new active grant once the previous one is revoked", async () => {
    await harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date("2026-10-05T09:00:00Z") })
      .where(eq(schema.grants.id, id(20)));
    const [renewed] = await harness.db
      .insert(schema.grants)
      .values(grant(26, { level: "contribute", notify: true }))
      .returning();
    expect(renewed).toMatchObject({ level: "contribute", notify: true, revokedAt: null });

    const history = await harness.db.query.grants.findMany({
      where: eq(schema.grants.category, "cycle.history"),
      orderBy: schema.grants.id,
    });
    expect(history.map((row) => row.revokedAt === null)).toEqual([false, true]);
  });

  test("refuse a child grant without a child and a child id on another category", async () => {
    const noChild = await refusal(
      harness.db.insert(schema.grants).values(grant(27, { category: "child" })),
    );
    expect(noChild).toMatch(/grants_child_id_matches_category/);
    const strayChild = await refusal(
      harness.db.insert(schema.grants).values(grant(28, { childId: CHILD })),
    );
    expect(strayChild).toMatch(/grants_child_id_matches_category/);
  });

  test("refuse a grant to oneself and the private journal", async () => {
    const self = await refusal(
      harness.db.insert(schema.grants).values(grant(29, { granteeId: ANNA })),
    );
    expect(self).toMatch(/grants_owner_is_not_grantee/);
    const journal = await refusal(
      harness.db.execute(
        sql`insert into grants (id, owner_id, grantee_id, category, level, policy_version, description_version) values (${id(30)}, ${ANNA}, ${CARA}, 'journal.private', 'read', '1', '1')`,
      ),
    );
    expect(journal).toMatch(/invalid input value for enum share_category/);
  });

  test("carry the partial unique index 7.4 names", async () => {
    const names = await constraintNames(harness, "grants");
    expect(names).toContain("grants_active_unique");
    const [definition] = rows(
      await harness.db.execute(
        sql`select indexdef from pg_catalog.pg_indexes where indexname = 'grants_active_unique'`,
      ),
    );
    expect(definition?.indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(definition?.indexdef).toMatch(/WHERE \(revoked_at IS NULL\)/);
  });
});

describe("consents", () => {
  test("store a user consent and a child consent with the guardian recorded", async () => {
    const [own, child] = await harness.db
      .insert(schema.consents)
      .values([
        {
          id: id(40),
          subjectId: ANNA,
          category: "cycle.history",
          basis: "necessary",
          purpose: "Keep the periods you log so the calendar can show them.",
          policyVersion: "2026-10-01",
          textHash: "sha256:consent-text",
        },
        {
          id: id(41),
          subjectId: CHILD,
          consentingGuardianId: CARA,
          category: "child",
          basis: "necessary",
          purpose: "Keep the measurements you log for this child.",
          policyVersion: "2026-10-01",
          textHash: "sha256:child-consent-text",
        },
      ])
      .returning();
    expect(own).toMatchObject({
      subjectId: ANNA,
      consentingGuardianId: null,
      basis: "necessary",
      withdrawnAt: null,
      thirdPartySharing: null,
      version: 1,
      deletedAt: null,
    });
    expect(own?.grantedAt).toBeInstanceOf(Date);
    expect(child).toMatchObject({
      subjectId: CHILD,
      consentingGuardianId: CARA,
      category: "child",
    });
  });

  test("accept the private journal as a consent category and refuse an unknown basis", async () => {
    await harness.db.insert(schema.consents).values({
      id: id(42),
      subjectId: ANNA,
      category: "journal.private",
      basis: "consent",
      purpose: "Keep your private notes.",
      policyVersion: "2026-10-01",
      textHash: "sha256:journal-consent-text",
    });
    const message = await refusal(
      harness.db.execute(
        sql`insert into consents (id, subject_id, category, basis, purpose, policy_version, text_hash) values (${id(43)}, ${ANNA}, 'cycle.history', 'contract', 'x', '1', 'h')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum consent_basis/);
  });

  test("keep the child consent and clear the guardian when the guardian is deleted", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, CARA));
    const kept = await harness.db.query.consents.findFirst({
      where: eq(schema.consents.id, id(41)),
    });
    expect(kept).toMatchObject({ subjectId: CHILD, consentingGuardianId: null });
  });
});

describe("cascades", () => {
  test("deleting the household removes its members and invitations", async () => {
    await harness.db.delete(schema.households).where(eq(schema.households.id, HOUSEHOLD));
    expect(await harness.db.query.householdMembers.findMany()).toEqual([]);
    expect(await harness.db.query.invitations.findMany()).toEqual([]);
  });

  test("deleting a user removes the grants they gave or received", async () => {
    await harness.db.delete(schema.user).where(eq(schema.user.id, BEN));
    expect(await harness.db.query.grants.findMany()).toEqual([]);
    // Her own consent rows have no foreign key and stay until closure deletes them.
    const consents = await harness.db.query.consents.findMany();
    expect(consents).toHaveLength(3);
  });
});
