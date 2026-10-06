import { randomBytes } from "node:crypto";
import { FixedKeyProvider, provisionSubjectKey } from "@tidefern/crypto";
import { schema } from "@tidefern/db";

import { ANNA, BEN, CARA, createActorFixture } from "./actors";
import type { FakeAuth } from "./auth-fake";
import type { ApiTestDatabase } from "./database";

/** Anna's profile time zone, which decides the day a partner read is filed under. */
export const ANNA_TIME_ZONE = "Europe/Berlin";

/** The grants the notes tests start from; the ids let a test revoke one. */
export const NOTE_GRANTS = {
  /** Ben reads Anna's symptoms: a shared note is his to read, never to change. */
  benReadsSymptoms: "018f5e7a-6000-7000-8000-000000000001",
  /** Ben contributes to Anna's pregnancy overview: he may write a note there about her. */
  benContributesOverview: "018f5e7a-6000-7000-8000-000000000002",
  /** Cara holds a summary on Anna's symptoms: she learns a note exists, never its body. */
  caraSummarySymptoms: "018f5e7a-6000-7000-8000-000000000003",
} as const;

/** Anna's household and the child she guards, for the guardian path. */
export const NOTE_HOUSEHOLD = "018f5e7a-6000-7000-8000-000000000010";
export const NOTE_CHILD = "018f5e7a-6000-7000-8000-000000000011";

export interface NotesFixture {
  harness: ApiTestDatabase;
  auth: FakeAuth;
  /** A fixed KEK for the file, so every subject key unwraps and nothing reads the environment. */
  keys: FixedKeyProvider;
}

/**
 * The three users with a wrapped data key each (the sign-up hook's work,
 * done here directly on the superuser connection), Anna's profile for her
 * time zone, the three grants above, and a child Anna guards. Notes are
 * the test file's own business.
 */
export async function createNotesFixture(): Promise<NotesFixture> {
  const { harness, auth } = await createActorFixture();
  const keys = new FixedKeyProvider(randomBytes(32), "test");
  for (const userId of [ANNA, BEN, CARA]) {
    await provisionSubjectKey(harness.db, userId, keys, "user");
  }
  await harness.db.insert(schema.profiles).values({
    userId: ANNA,
    displayName: "Anna",
    timeZone: ANNA_TIME_ZONE,
    stage: "cycle",
    ageAttestedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  const versions = { policyVersion: "2026-10", descriptionVersion: "2026-10" };
  await harness.db.insert(schema.grants).values([
    {
      id: NOTE_GRANTS.benReadsSymptoms,
      ownerId: ANNA,
      granteeId: BEN,
      category: "cycle.symptoms",
      level: "read",
      ...versions,
    },
    {
      id: NOTE_GRANTS.benContributesOverview,
      ownerId: ANNA,
      granteeId: BEN,
      category: "pregnancy.overview",
      level: "contribute",
      ...versions,
    },
    {
      id: NOTE_GRANTS.caraSummarySymptoms,
      ownerId: ANNA,
      granteeId: CARA,
      category: "cycle.symptoms",
      level: "summary",
      ...versions,
    },
  ]);
  await harness.db.insert(schema.households).values({ id: NOTE_HOUSEHOLD });
  await harness.db.insert(schema.householdMembers).values({
    id: "018f5e7a-6000-7000-8000-000000000012",
    householdId: NOTE_HOUSEHOLD,
    userId: ANNA,
    role: "owner",
  });
  await harness.db.insert(schema.children).values({
    id: NOTE_CHILD,
    householdId: NOTE_HOUSEHOLD,
    displayName: "Mila",
    dateOfBirth: "2026-03-01",
  });
  await harness.db.insert(schema.childGuardians).values({
    id: "018f5e7a-6000-7000-8000-000000000013",
    childId: NOTE_CHILD,
    userId: ANNA,
  });
  return { harness, auth, keys };
}
