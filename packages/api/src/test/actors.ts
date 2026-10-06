import { schema } from "@tidefern/db";

import { FakeAuth } from "./auth-fake";
import { createApiTestDatabase } from "./database";
import type { ApiTestDatabase } from "./database";

// Synthetic ids only; nothing here is a real person. The same cast as
// session.test.ts, so a reader of one file recognizes the other.
export const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
export const BEN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
export const CARA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f30";

/** The session tokens `signInCast` registers, one per person. */
export const TOKENS = { anna: "anna", ben: "ben", cara: "cara" } as const;

/**
 * One PGlite with the three users and a fake auth that knows a session for
 * each, which is all the middleware tests need to have an actor on the
 * context. Relationships are the test file's own business.
 */
export async function createActorFixture(): Promise<{ harness: ApiTestDatabase; auth: FakeAuth }> {
  const harness = await createApiTestDatabase();
  await harness.db.insert(schema.user).values([
    { id: ANNA, name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: BEN, name: "Ben", email: "ben@example.com", emailVerified: true },
    { id: CARA, name: "Cara", email: "cara@example.com", emailVerified: true },
  ]);
  const auth = new FakeAuth();
  auth.signIn(TOKENS.anna, ANNA, "anna@example.com", 60);
  auth.signIn(TOKENS.ben, BEN, "ben@example.com", 60);
  auth.signIn(TOKENS.cara, CARA, "cara@example.com", 60);
  return { harness, auth };
}

/** The origin `app.request()` gives a path-only request, which the cross-site check treats as the app's own. */
export const OWN_ORIGIN = "http://localhost";
