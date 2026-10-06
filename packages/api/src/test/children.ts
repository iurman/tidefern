import { randomBytes } from "node:crypto";
import { FixedKeyProvider } from "@tidefern/crypto";
import { schema } from "@tidefern/db";

import { createApp } from "../app";
import { FRESH_AUTH_MAX_AGE_SECONDS } from "../auth";
import { configureChildren } from "../routes/children";
import { ANNA, BEN, TOKENS, createActorFixture } from "./actors";
import type { FakeAuth } from "./auth-fake";
import type { ApiTestDatabase } from "./database";

/** A fourth person with no household at all; synthetic like the other three. */
export const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
export const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
export const CHILDREN_TOKENS = { ...TOKENS, dana: "dana", annaStale: "anna-stale" } as const;

export interface ChildrenFixture {
  harness: ApiTestDatabase;
  auth: FakeAuth;
  app: ReturnType<typeof createApp>;
  keys: FixedKeyProvider;
}

/**
 * The cast of the children suite: Anna owns a household that Ben belongs to
 * as a partner, Cara is outside it, Dana has no household. Anna has a
 * profile with a time zone (the audit day is hers); nobody has a child yet,
 * the routes make them. The area's runtime points at this PGlite and a fixed
 * key provider, so no environment variable is read.
 */
export async function createChildrenFixture(): Promise<ChildrenFixture> {
  const { harness, auth } = await createActorFixture();
  const { db } = harness;
  await db
    .insert(schema.user)
    .values({ id: DANA, name: "Dana", email: "dana@example.com", emailVerified: true });
  auth.signIn(CHILDREN_TOKENS.dana, DANA, "dana@example.com", 60);
  // Anna again, authenticated past the fresh-authentication window (architecture 6.1).
  auth.signIn(CHILDREN_TOKENS.annaStale, ANNA, "anna@example.com", FRESH_AUTH_MAX_AGE_SECONDS + 60);
  await db
    .insert(schema.profiles)
    .values({ userId: ANNA, timeZone: "Europe/Berlin", ageAttestedAt: new Date() });
  await db.insert(schema.households).values({ id: HOUSEHOLD });
  await db.insert(schema.householdMembers).values([
    {
      id: "018f5e7a-2000-7000-8000-00000000b001",
      householdId: HOUSEHOLD,
      userId: ANNA,
      role: "owner",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000b002",
      householdId: HOUSEHOLD,
      userId: BEN,
      role: "partner",
    },
  ]);
  const keys = new FixedKeyProvider(randomBytes(32), "test");
  configureChildren({ db, keys });
  const app = createApp({ auth, db, log: { sink: () => undefined } });
  return { harness, auth, app, keys };
}
