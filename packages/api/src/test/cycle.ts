import { schema } from "@tidefern/db";

import { createApp } from "../app";
import { configureCycle } from "../routes/cycle";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "./actors";
import { sessionHeaders } from "./auth-fake";
import type { ApiTestDatabase } from "./database";

// Synthetic people for the cycle routes, beside the shared cast in actors.ts.
export const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
export const EVE = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f50";
export const FINN = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f60";
export const GINA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f70";
export const HANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f80";
export const IVY = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f90";

export { ANNA, BEN, CARA };

export const CYCLE_TOKENS = {
  ...TOKENS,
  dana: "dana",
  eve: "eve",
  finn: "finn",
  gina: "gina",
  hana: "hana",
  ivy: "ivy",
} as const;

/** Anna reads her calendar in this zone; the status route's "today" is hers. */
export const ANNA_TIME_ZONE = "America/New_York";

/** The grant Ben holds on Anna's history, which a test revokes part way. */
export const BEN_HISTORY_GRANT = "018f5e7a-2000-7000-8000-00000000e301";

/** Gina's pregnancy ended on this day (architecture record 8.4 rule 4). */
export const GINA_ENDED_AT = "2026-06-10";

const VERSIONS = { policyVersion: "2026-10", descriptionVersion: "2026-10" } as const;

/**
 * The cycle routes' world. Anna tracks her cycle and shares it four ways:
 * Ben reads her history and holds the status card, Dana reads her symptoms
 * and holds a summary of her history, Eve contributes to her symptoms, Ivy
 * holds only a summary of her history, and Finn's history grant is revoked.
 * Cara holds nothing. Gina's pregnancy ended in a loss; Hana is pregnant now
 * and Eve contributes to her history without seeing the pregnancy.
 */
export async function createCycleFixture(): Promise<{
  harness: ApiTestDatabase;
  app: ReturnType<typeof createApp>;
}> {
  const { harness, auth } = await createActorFixture();
  const { db } = harness;
  const extra = [
    [DANA, "dana"],
    [EVE, "eve"],
    [FINN, "finn"],
    [GINA, "gina"],
    [HANA, "hana"],
    [IVY, "ivy"],
  ] as const;
  await db.insert(schema.user).values(
    extra.map(([id, token]) => ({
      id,
      name: token,
      email: `${token}@example.com`,
      emailVerified: true,
    })),
  );
  for (const [id, token] of extra) auth.signIn(token, id, `${token}@example.com`, 60);

  await db.insert(schema.profiles).values({
    userId: ANNA,
    timeZone: ANNA_TIME_ZONE,
    stage: "cycle",
    ageAttestedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  const grant = (
    id: string,
    ownerId: string,
    granteeId: string,
    category: "cycle.status" | "cycle.history" | "cycle.symptoms",
    level: "summary" | "read" | "contribute",
    revokedAt: Date | null = null,
  ) => ({ id, ownerId, granteeId, category, level, revokedAt, ...VERSIONS });
  await db
    .insert(schema.grants)
    .values([
      grant(BEN_HISTORY_GRANT, ANNA, BEN, "cycle.history", "read"),
      grant("018f5e7a-2000-7000-8000-00000000e302", ANNA, BEN, "cycle.status", "summary"),
      grant("018f5e7a-2000-7000-8000-00000000e303", ANNA, DANA, "cycle.symptoms", "read"),
      grant("018f5e7a-2000-7000-8000-00000000e304", ANNA, DANA, "cycle.history", "summary"),
      grant("018f5e7a-2000-7000-8000-00000000e305", ANNA, EVE, "cycle.symptoms", "contribute"),
      grant("018f5e7a-2000-7000-8000-00000000e306", ANNA, IVY, "cycle.history", "summary"),
      grant(
        "018f5e7a-2000-7000-8000-00000000e307",
        ANNA,
        FINN,
        "cycle.history",
        "read",
        new Date("2026-09-01T00:00:00.000Z"),
      ),
      grant("018f5e7a-2000-7000-8000-00000000e308", HANA, EVE, "cycle.history", "contribute"),
    ]);

  await db.insert(schema.pregnancies).values([
    {
      id: "018f5e7a-2000-7000-8000-00000000e401",
      subjectId: GINA,
      dueDate: "2026-12-20",
      datingMethod: "lmp",
      endedAt: GINA_ENDED_AT,
      endedReason: "loss",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000e402",
      subjectId: HANA,
      dueDate: "2027-03-01",
      datingMethod: "lmp",
    },
  ]);

  configureCycle({ db });
  const app = createApp({ auth, db, log: { sink: () => undefined } });
  return { harness, app };
}

/** Headers for a request as `token`: the session, the app's own origin and JSON. */
export function cycleHeaders(
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...(sessionHeaders(token) as Record<string, string>),
    origin: OWN_ORIGIN,
    "content-type": "application/json",
    ...extra,
  };
}
