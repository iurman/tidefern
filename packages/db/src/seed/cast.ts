import type { notificationDetailValues, stageValues, unitsValues } from "../schema/enums";

/**
 * The synthetic cast the seed writes. Nothing here is a real person: the
 * emails sit on the reserved `example.test` domain and the passwords are
 * test-only values, listed in packages/db/README.md so browser tests can
 * sign in. Every id is fixed and UUIDv7-shaped, in a block of its own so the
 * cast never collides with the ids `src/schema/testing.ts` hands the schema
 * tests. No identifier below carries a health word (architecture record
 * 9.1): names, emails, action names and ids stay neutral.
 */

/** A fixed, UUIDv7-shaped id for the nth row of a block of seed rows. */
export function seedId(block: number, n: number): string {
  return `018f5e7a-5eed-7${block.toString(16).padStart(3, "0")}-8000-${n.toString(16).padStart(12, "0")}`;
}

/** One row block per table, so an id says which table it belongs to. */
export const BLOCK = {
  users: 0x000,
  households: 0x001,
  householdMembers: 0x002,
  invitations: 0x003,
  grants: 0x004,
  consents: 0x005,
  children: 0x006,
  childGuardians: 0x007,
  accounts: 0x008,
  cycleEntries: 0x010,
  entrySymptoms: 0x011,
  cyclePredictions: 0x012,
  pregnancies: 0x020,
  pregnancyEvents: 0x021,
  dueDateChanges: 0x022,
  childEvents: 0x030,
  childMeasurements: 0x031,
  notes: 0x040,
  auditEvents: 0x050,
} as const;

export interface Persona {
  id: string;
  name: string;
  email: string;
  /** A test-only value for browser tests; never a real credential. */
  password: string;
  timeZone: string;
  stage: (typeof stageValues)[number];
  /** Intl convention: 1 is Monday, 7 is Sunday. */
  weekStart: number;
  units: (typeof unitsValues)[number];
  notificationDetail: (typeof notificationDetailValues)[number];
  /** Days before the seed's `now` that the account was created and the age attested. */
  signedUpDaysAgo: number;
}

/** Household A, Berlin: Noor tracks her cycle; Theo is her partner and tracks nothing of his own. */
export const NOOR: Persona = {
  id: seedId(BLOCK.users, 1),
  name: "Noor",
  email: "noor@example.test",
  password: "tidefern-seed-noor",
  timeZone: "Europe/Berlin",
  stage: "cycle",
  weekStart: 1,
  units: "metric",
  notificationDetail: "generic",
  signedUpDaysAgo: 400,
};

export const THEO: Persona = {
  id: seedId(BLOCK.users, 2),
  name: "Theo",
  email: "theo@example.test",
  password: "tidefern-seed-theo",
  timeZone: "Europe/Berlin",
  stage: "none",
  weekStart: 1,
  units: "metric",
  notificationDetail: "generic",
  signedUpDaysAgo: 121,
};

/** Household B, Vancouver: Mira gave birth six weeks ago and has an older child; Lena, her partner, is expecting. */
export const MIRA: Persona = {
  id: seedId(BLOCK.users, 3),
  name: "Mira",
  email: "mira@example.test",
  password: "tidefern-seed-mira",
  timeZone: "America/Vancouver",
  stage: "postpartum",
  weekStart: 7,
  units: "metric",
  notificationDetail: "gentle",
  signedUpDaysAgo: 420,
};

export const LENA: Persona = {
  id: seedId(BLOCK.users, 4),
  name: "Lena",
  email: "lena@example.test",
  password: "tidefern-seed-lena",
  timeZone: "America/Vancouver",
  stage: "pregnancy",
  weekStart: 7,
  units: "metric",
  notificationDetail: "detailed",
  signedUpDaysAgo: 399,
};

/** Outside both households: a grandparent with a read grant on one child only. */
export const PIA: Persona = {
  id: seedId(BLOCK.users, 5),
  name: "Pia",
  email: "pia@example.test",
  password: "tidefern-seed-pia",
  timeZone: "America/New_York",
  stage: "none",
  weekStart: 7,
  units: "imperial",
  notificationDetail: "generic",
  signedUpDaysAgo: 210,
};

export const PERSONAS: readonly Persona[] = [NOOR, THEO, MIRA, LENA, PIA];

export const HOUSEHOLD_A = seedId(BLOCK.households, 1);
export const HOUSEHOLD_B = seedId(BLOCK.households, 2);

/** Mira and Lena's children: Ilo, six weeks old, and Sol, thirty months. */
export const ILO = seedId(BLOCK.children, 1);
export const SOL = seedId(BLOCK.children, 2);

/** The grants, named by their state rather than their category. */
export const GRANT_NOOR_THEO_SUMMARY = seedId(BLOCK.grants, 1);
export const GRANT_NOOR_THEO_READ = seedId(BLOCK.grants, 2);
export const GRANT_NOOR_THEO_REVOKED = seedId(BLOCK.grants, 3);
export const GRANT_LENA_MIRA_CONTRIBUTE = seedId(BLOCK.grants, 4);
export const GRANT_MIRA_PIA_READ = seedId(BLOCK.grants, 5);
/** Mira shared her pregnancy with Lena before it ended, so Lena's view of it is the paused card (8.4 rule 2). */
export const GRANT_MIRA_LENA_SUMMARY = seedId(BLOCK.grants, 6);

/**
 * Sol's newest weight, beyond two standard deviations for his age, so a
 * guardian's answer carries the pointing-to-care flag and a grantee's never
 * does (architecture 8.4, task E5's `pointToCare`).
 */
export const SOL_BEYOND_BAND = seedId(BLOCK.childMeasurements, 6);

/** The invitations, one per state. */
export const INVITATION_THEO_ACCEPTED = seedId(BLOCK.invitations, 1);
export const INVITATION_PENDING = seedId(BLOCK.invitations, 2);
export const INVITATION_EXPIRED = seedId(BLOCK.invitations, 3);
export const INVITATION_WITHDRAWN = seedId(BLOCK.invitations, 4);
export const INVITATION_LENA_ACCEPTED = seedId(BLOCK.invitations, 5);

/**
 * The plaintext tokens behind the invitations' `token_hash` (SHA-256, hex).
 * A browser test that exercises acceptance sends the pending one; the mail
 * that would have carried it is never sent by the seed.
 */
export const INVITATION_TOKENS: Readonly<Record<string, string>> = {
  [INVITATION_THEO_ACCEPTED]: "seed-invitation-theo",
  [INVITATION_PENDING]: "seed-invitation-kim",
  [INVITATION_EXPIRED]: "seed-invitation-rafa",
  [INVITATION_WITHDRAWN]: "seed-invitation-uma",
  [INVITATION_LENA_ACCEPTED]: "seed-invitation-lena",
};

/** The plaintext token of one seeded invitation; throws for an id the seed does not write. */
export function invitationToken(invitationId: string): string {
  const token = INVITATION_TOKENS[invitationId];
  if (!token) throw new RangeError("no seeded invitation has that id");
  return token;
}

export const LENA_PREGNANCY = seedId(BLOCK.pregnancies, 1);
export const MIRA_PREGNANCY = seedId(BLOCK.pregnancies, 2);

export const NOOR_PREDICTION = seedId(BLOCK.cyclePredictions, 1);

/** The notes, each sealed under its subject's key; the test decrypts every one. */
export const NOTE_NOOR_PRIVATE = seedId(BLOCK.notes, 1);
export const NOTE_NOOR_SHARED = seedId(BLOCK.notes, 2);
export const NOTE_LENA_OWN = seedId(BLOCK.notes, 3);
export const NOTE_MIRA_PRIVATE = seedId(BLOCK.notes, 4);
export const NOTE_LENA_BY_MIRA = seedId(BLOCK.notes, 5);
