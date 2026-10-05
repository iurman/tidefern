import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema";
import { children } from "./children";
import {
  consentBasisEnum,
  dataCategoryEnum,
  householdRoleEnum,
  membershipStatusEnum,
  shareCategoryEnum,
  shareLevelEnum,
} from "./enums";

/**
 * The relationship tables of architecture record 7.4 and 8.1. A household
 * groups the people who share a home; children belong to one (task B6).
 * Membership on its own grants nothing: reading another member's records
 * takes a `grants` row for the category, and reaching a child takes
 * guardianship or a `child` grant. Every id is minted by the API (UUIDv7,
 * architecture record 5.1), so no column here has a database default.
 */
export const households = pgTable("households", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: householdRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the person leaves or is removed; the row stays as the record
    // of the membership having existed.
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("household_members_household_user_unique").on(table.householdId, table.userId),
    index("household_members_user_idx").on(table.userId),
    check(
      "household_members_ended_matches_status",
      sql`(${table.status} = 'ended') = (${table.endedAt} is not null)`,
    ),
  ],
).enableRLS();

/**
 * An invitation to join a household (architecture record 8.3). The token
 * itself is never stored: the mail carries it once and `token_hash` is what
 * acceptance compares against. It is bound to `invitee_email` (acceptance
 * happens only by POST after the invitee has signed in with that verified
 * email), expires 72 hours after creation, and is single use: `accepted_at`
 * or `withdrawn_at` closes it.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email").notNull(),
    role: householdRoleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_household_idx").on(table.householdId),
    // The owner role is never handed out by invitation.
    check("invitations_role_is_invitable", sql`${table.role} <> 'owner'`),
  ],
).enableRLS();

/**
 * The nil UUID stands in for "no child" inside the active-grant index, so
 * two active grants on one (grantee, owner, category) tuple collide whether
 * or not a child is named; a plain unique index would treat two NULLs as
 * distinct and let the second grant through.
 */
const NO_CHILD = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * One grant per (owner, grantee, category, child) at a time (architecture
 * record 8.1 and 8.2). `child_id` is required exactly when the category is
 * `child` and names the one child the grant reaches; its foreign key to
 * `children` arrived with the B6 migration, after that table existed, which
 * is why this file and children.ts import each other through the lazy
 * `references` callbacks.
 * `policy_version` and `description_version` record which policy and which
 * plain-words description the owner saw when she made the grant. `notify` is
 * her per-person switch for partner notifications, off by default. A grant
 * ends with `revoked_at`, never by deleting the row, so the activity view
 * can still show it; `deleted_at` is only the sync tombstone of 7.3.
 */
export const grants = pgTable(
  "grants",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    granteeId: uuid("grantee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: shareCategoryEnum("category").notNull(),
    level: shareLevelEnum("level").notNull(),
    childId: uuid("child_id").references(() => children.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull(),
    descriptionVersion: text("description_version").notNull(),
    notify: boolean("notify").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("grants_active_unique")
      .on(
        table.granteeId,
        table.ownerId,
        table.category,
        sql`coalesce(${table.childId}, ${NO_CHILD})`,
      )
      .where(sql`${table.revokedAt} is null`),
    index("grants_owner_idx").on(table.ownerId),
    check("grants_owner_is_not_grantee", sql`${table.ownerId} <> ${table.granteeId}`),
    check(
      "grants_child_id_matches_category",
      sql`(${table.category} = 'child') = (${table.childId} is not null)`,
    ),
  ],
).enableRLS();

/**
 * Consent records (architecture record 7.4 and 11). The subject is a user or
 * a child, so `subject_id` carries no foreign key, like `subject_keys`; for a
 * child the guardian who consented on the child's behalf is recorded.
 * `text_hash` is the hash of the exact disclosure shown; `withdrawn_at` on
 * the collection consent starts account closure. `third_party_sharing` is
 * reserved for any future disclosure to an entity and stays null in v1,
 * because a grant to a partner is a disclosure to a consumer, not sharing.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id").notNull(),
    consentingGuardianId: uuid("consenting_guardian_id").references(() => user.id, {
      onDelete: "set null",
    }),
    category: dataCategoryEnum("category").notNull(),
    basis: consentBasisEnum("basis").notNull(),
    purpose: text("purpose").notNull(),
    policyVersion: text("policy_version").notNull(),
    textHash: text("text_hash").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    thirdPartySharing: text("third_party_sharing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("consents_subject_idx").on(table.subjectId)],
).enableRLS();
