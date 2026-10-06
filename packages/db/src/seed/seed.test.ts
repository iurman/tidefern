import { sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import {
  FixedKeyProvider,
  KeyConfigurationError,
  createKeyCache,
  decryptFieldFor,
  unwrapForSubject,
} from "@tidefern/crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { withActor, withSystem } from "../actor";
import type { ActorDatabase, Transaction } from "../actor";
import * as schema from "../schema/index";
import { refusal, rows } from "../schema/testing";
import type { Harness } from "../schema/testing";
import { createTestDatabase } from "../test/harness";
import { dateIn, shiftDays } from "./calendar";
import {
  BLOCK,
  CHECKED_MILESTONES,
  ILO,
  ILO_FEED_NOTE,
  LENA,
  LENA_PREGNANCY,
  MIRA,
  NOOR,
  NOTE_NOOR_PRIVATE,
  PERSONAS,
  PIA,
  SEED_NOTES,
  SEED_PREGNANCY_EVENTS,
  SOL,
  SeedConfigurationError,
  SeedRoleError,
  THEO,
  resolveSeedNow,
  seed,
  seedId,
} from "./index";
import type { SeedReport } from "./index";

/**
 * What this file proves on PGlite through the committed journal: the seed
 * fills an empty database with exactly the documented cast, a second run
 * adds nothing and changes nothing, the sealed text opens with the KEK that
 * sealed it and with no other, the users carry passwords Better Auth's own
 * verifier accepts, the app role is refused before a row is written, the
 * dates follow each profile's zone from the one `now`, no identifier
 * carries a health word, and the B8 policies show each actor only what the
 * grants allow.
 */

/** A frozen instant on which Berlin is already on the 5th and Vancouver still on the 4th. */
const NOW = new Date("2026-10-05T03:30:00Z");

/** The development KEK of this suite; a second one stands in for a wrong key. */
const kek = new FixedKeyProvider(
  Uint8Array.from({ length: 32 }, (_, index) => (index * 5 + 2) % 256),
  "v1",
);
const otherKek = new FixedKeyProvider(
  Uint8Array.from({ length: 32 }, (_, index) => (index * 11 + 7) % 256),
  "v1",
);

/** The cast as packages/db/README.md documents it, rows per table. */
const CAST = {
  user: 5,
  account: 5,
  profiles: 5,
  subject_keys: 7,
  households: 2,
  household_members: 4,
  invitations: 5,
  grants: 5,
  consents: 11,
  children: 2,
  child_guardians: 4,
  cycle_entries: 17,
  entry_symptoms: 14,
  cycle_predictions: 1,
  pregnancies: 2,
  pregnancy_events: 5,
  due_date_changes: 1,
  child_events: 10,
  child_measurements: 5,
  notes: 5,
  audit_events: 18,
  vocabulary: 27,
};

/** Tables the seed leaves empty on purpose. */
const UNTOUCHED = [
  "session",
  "verification",
  "two_factor",
  "passkey",
  "rate_limit",
  "photos",
  "photo_variants",
  "jobs",
  "idempotency_keys",
  "data_requests",
  "product_events",
  "disclosures",
];

/** The words that must never appear in a name, email, id or action the seed writes. */
const HEALTH_WORDS = [
  "cycle",
  "period",
  "pregnan",
  "symptom",
  "fertil",
  "ovulat",
  "postpartum",
  "journal",
  "mood",
  "flow",
  "bleed",
  "baby",
];

let harness: Harness;
let firstRun: SeedReport;

async function count(tx: Transaction, table: string): Promise<number> {
  const [row] = rows(
    await tx.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`),
  );
  return row?.n as number;
}

async function countsAs(actor: string, tables: string[]): Promise<Record<string, number>> {
  return withActor(
    actor,
    async (tx) => {
      const seen: Record<string, number> = {};
      for (const table of tables) seen[table] = await count(tx, table);
      return seen;
    },
    harness.db,
  );
}

async function publicTables(): Promise<string[]> {
  return rows(
    await harness.db.execute(
      sql`select relname from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    ),
  ).map((row) => row.relname as string);
}

async function totalCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await publicTables()) {
    const [row] = rows(
      await harness.db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`),
    );
    counts[table] = row?.n as number;
  }
  return counts;
}

/** Every row of every public table, serialised and sorted, so two runs can be compared whole. */
async function snapshot(): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of await publicTables()) {
    const result = rows(await harness.db.execute(sql`select * from ${sql.identifier(table)}`));
    dump[table] = result
      .map((row) =>
        JSON.stringify(row, (_, value: unknown) =>
          value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
        ),
      )
      .sort();
  }
  return dump;
}

/** The actor's view of one subject's sealed field, decrypted with the KEK the cache was filled from. */
async function decryptAs(
  actor: string,
  provider: FixedKeyProvider,
  location: { subjectId: string; table: string; column: string; rowId: string },
  bytes: Uint8Array,
): Promise<string> {
  const keys = createKeyCache();
  try {
    return await withActor(
      actor,
      async (tx) => {
        await unwrapForSubject(tx, location.subjectId, provider, keys);
        return decryptFieldFor(keys, location, bytes);
      },
      harness.db,
    );
  } finally {
    keys.clear();
  }
}

beforeAll(async () => {
  harness = await createTestDatabase();
  firstRun = await seed(harness.db, { now: NOW, kek });
});

afterAll(async () => {
  await harness.close();
});

describe("the first run", () => {
  test("fills an empty database with the documented cast and reports every row", async () => {
    const counts = await totalCounts();
    for (const [table, expected] of Object.entries(CAST)) {
      expect(counts[table], table).toBe(expected);
    }
    for (const table of UNTOUCHED) {
      expect(counts[table], table).toBe(0);
    }
    expect(Object.keys(counts).sort()).toEqual([...Object.keys(CAST), ...UNTOUCHED].sort());
    expect(firstRun.inserted).toEqual(CAST);
  });

  test("covers every stage and every grant state between the two households", async () => {
    const stages = rows(
      await harness.db.execute(sql`select stage::text as stage from profiles order by stage`),
    ).map((row) => row.stage);
    expect(stages).toEqual(["cycle", "none", "none", "postpartum", "pregnancy"]);

    const levels = rows(
      await harness.db.execute(
        sql`select level::text as level, (revoked_at is not null) as revoked from grants order by level, revoked`,
      ),
    );
    expect(levels).toEqual([
      { level: "contribute", revoked: false },
      { level: "read", revoked: false },
      { level: "read", revoked: false },
      { level: "read", revoked: true },
      { level: "summary", revoked: false },
    ]);

    const invitations = rows(
      await harness.db.execute(
        sql`select case when accepted_at is not null then 'accepted' when withdrawn_at is not null then 'withdrawn' when expires_at < ${NOW.toISOString()}::timestamptz then 'expired' else 'pending' end as state from invitations order by state`,
      ),
    ).map((row) => row.state);
    expect(invitations).toEqual(["accepted", "accepted", "expired", "pending", "withdrawn"]);

    const children = rows(await harness.db.execute(sql`select count(*)::int as n from children`));
    expect(children).toEqual([{ n: 2 }]);
    const ended = rows(
      await harness.db.execute(
        sql`select ended_reason::text as reason from pregnancies where ended_at is not null`,
      ),
    );
    expect(ended).toEqual([{ reason: "birth" }]);
  });

  test("derives every date from the one instant in each profile's own zone", async () => {
    expect(dateIn(NOW, NOOR.timeZone)).toBe("2026-10-05");
    expect(dateIn(NOW, MIRA.timeZone)).toBe("2026-10-04");

    const entries = rows(
      await harness.db.execute(
        sql`select min(date)::text as first, max(date)::text as last from cycle_entries where subject_id = ${NOOR.id}::uuid`,
      ),
    );
    expect(entries).toEqual([{ first: "2026-08-08", last: "2026-10-05" }]);

    const born = rows(
      await harness.db.execute(
        sql`select date_of_birth::text as born from children where id = ${ILO}::uuid`,
      ),
    );
    expect(born).toEqual([{ born: "2026-08-23" }]);

    const due = rows(
      await harness.db.execute(
        sql`select due_date::text as due from pregnancies where subject_id = ${LENA.id}::uuid`,
      ),
    );
    expect(due).toEqual([{ due: "2027-02-07" }]);
    expect(shiftDays("2026-10-04", 126)).toBe("2027-02-07");

    // The prediction follows core's rule for two 28 day cycles: 28 days on
    // from the latest start, ovulation 14 days before that, a six day window.
    const prediction = rows(
      await harness.db.execute(
        sql`select next_period_start::text as next, ovulation::text as ovulation, fertile_window_start::text as window_start, uncertainty_days from cycle_predictions`,
      ),
    );
    expect(prediction).toEqual([
      {
        next: "2026-10-31",
        ovulation: "2026-10-17",
        window_start: "2026-10-12",
        uncertainty_days: 3,
      },
    ]);
  });

  test("records the due date change with the previous value still visible to her", async () => {
    const changes = rows(
      await harness.db.execute(
        sql`select previous_due_date::text as previous, next_due_date::text as next, method::text as method from due_date_changes`,
      ),
    );
    expect(changes).toEqual([{ previous: "2027-02-15", next: "2027-02-07", method: "ultrasound" }]);
  });

  test("checks milestones with core's checklist keys and keeps the rest free of ids", async () => {
    const milestones = rows(
      await harness.db.execute(
        sql`select milestone_id from child_events where kind = 'milestone' order by milestone_id`,
      ),
    ).map((row) => row.milestone_id);
    expect(milestones).toEqual(CHECKED_MILESTONES.map((item) => item.milestoneId).sort());
    for (const key of milestones) {
      expect(key).toMatch(/^\d+m-(social|language|cognitive|movement)-\d+$/);
    }
    const others = rows(
      await harness.db.execute(
        sql`select count(*)::int as n from child_events where kind <> 'milestone' and milestone_id is not null`,
      ),
    );
    expect(others).toEqual([{ n: 0 }]);
  });
});

describe("a second run", () => {
  test("adds nothing and changes nothing", async () => {
    const before = await snapshot();
    const second = await seed(harness.db, { now: NOW, kek });
    expect(second.inserted).toEqual(Object.fromEntries(Object.keys(CAST).map((t) => [t, 0])));
    expect(await snapshot()).toEqual(before);
  });

  test("also adds nothing when the clock has moved on", async () => {
    const before = await snapshot();
    const later = await seed(harness.db, {
      now: new Date("2026-11-20T12:00:00Z"),
      kek,
    });
    expect(Object.values(later.inserted).every((n) => n === 0)).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
});

describe("the sealed text", () => {
  test("opens with the development KEK for every note, label and child note", async () => {
    for (const note of SEED_NOTES) {
      const [row] = await harness.db
        .select({ body: schema.notes.body, kekVersion: schema.notes.kekVersion })
        .from(schema.notes)
        .where(sql`${schema.notes.id} = ${note.id}::uuid`);
      expect(row?.kekVersion).toBe("v1");
      expect(
        await decryptAs(
          note.subjectId,
          kek,
          { subjectId: note.subjectId, table: "notes", column: "body", rowId: note.id },
          row?.body as Uint8Array,
        ),
      ).toBe(note.text);
    }

    for (const event of SEED_PREGNANCY_EVENTS) {
      const [row] = await harness.db
        .select({
          label: schema.pregnancyEvents.label,
          kekVersion: schema.pregnancyEvents.kekVersion,
        })
        .from(schema.pregnancyEvents)
        .where(sql`${schema.pregnancyEvents.id} = ${event.id}::uuid`);
      if (event.label === null) {
        expect(row).toEqual({ label: null, kekVersion: null });
        continue;
      }
      expect(
        await decryptAs(
          event.subjectId,
          kek,
          {
            subjectId: event.subjectId,
            table: "pregnancy_events",
            column: "label",
            rowId: event.id,
          },
          row?.label as Uint8Array,
        ),
      ).toBe(event.label);
    }

    const [feed] = await harness.db
      .select({ note: schema.childEvents.note })
      .from(schema.childEvents)
      .where(sql`${schema.childEvents.id} = ${ILO_FEED_NOTE.id}::uuid`);
    // A guardian reads the child's note with the child's own key.
    expect(
      await decryptAs(
        MIRA.id,
        kek,
        { subjectId: ILO, table: "child_events", column: "note", rowId: ILO_FEED_NOTE.id },
        feed?.note as Uint8Array,
      ),
    ).toBe(ILO_FEED_NOTE.text);
  });

  test("stays sealed under any other key", async () => {
    const [row] = await harness.db
      .select({ body: schema.notes.body })
      .from(schema.notes)
      .where(sql`${schema.notes.id} = ${NOTE_NOOR_PRIVATE}::uuid`);
    const attempt = decryptAs(
      NOOR.id,
      otherKek,
      { subjectId: NOOR.id, table: "notes", column: "body", rowId: NOTE_NOOR_PRIVATE },
      row?.body as Uint8Array,
    );
    // The wrapped DEK does not open under the wrong KEK, so no field is ever tried.
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(KeyConfigurationError);
  });
});

describe("the users", () => {
  test("are verified and carry passwords Better Auth's own verifier accepts", async () => {
    for (const persona of PERSONAS) {
      const [user] = await harness.db
        .select({ verified: schema.user.emailVerified, name: schema.user.name })
        .from(schema.user)
        .where(sql`${schema.user.id} = ${persona.id}::uuid`);
      expect(user).toEqual({ verified: true, name: persona.name });

      const [account] = await harness.db
        .select({ providerId: schema.account.providerId, password: schema.account.password })
        .from(schema.account)
        .where(sql`${schema.account.userId} = ${persona.id}::uuid`);
      expect(account?.providerId).toBe("credential");
      expect(
        await verifyPassword({ hash: account?.password ?? "", password: persona.password }),
      ).toBe(true);
      expect(
        await verifyPassword({ hash: account?.password ?? "", password: "not-the-password" }),
      ).toBe(false);
    }
  });

  test("have distinct emails on the reserved example.test domain and nothing real", () => {
    const emails = PERSONAS.map((persona) => persona.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) expect(email).toMatch(/@example\.test$/);
  });
});

describe("identifiers", () => {
  test("carry no health word in a name, email, id, action or key", async () => {
    const strings = rows(
      await harness.db.execute(sql`
        select email as value from "user"
        union all select name from "user"
        union all select display_name from profiles
        union all select display_name from children
        union all select invitee_email from invitations
        union all select action from audit_events
        union all select id::text from "user"
        union all select id::text from children
        union all select id::text from households
        union all select milestone_id from child_events where milestone_id is not null
      `),
    ).map((row) => String(row.value).toLowerCase());
    expect(strings.length).toBeGreaterThan(20);
    for (const value of strings) {
      for (const word of HEALTH_WORDS) {
        expect(value, `${value} contains ${word}`).not.toContain(word);
      }
    }
  });
});

describe("the role guard", () => {
  test("refuses the app role before any row is written", async () => {
    const fresh = await createTestDatabase();
    try {
      // The same database handle, but every transaction drops to the app role
      // first, which is what a DATABASE_URL belonging to tidefern_app gives.
      const asApp: ActorDatabase = {
        transaction: (fn) =>
          fresh.db.transaction(async (tx) => {
            await tx.execute(sql`set local role tidefern_app`);
            return fn(tx);
          }),
      };
      await expect(seed(asApp, { now: NOW, kek })).rejects.toBeInstanceOf(SeedRoleError);
      const [users] = rows(await fresh.db.execute(sql`select count(*)::int as n from "user"`));
      expect(users).toEqual({ n: 0 });
    } finally {
      await fresh.close();
    }
  });
});

describe("resolveSeedNow", () => {
  test("honours TIDEFERN_FAKE_NOW outside production and the clock otherwise", () => {
    expect(resolveSeedNow({ TIDEFERN_FAKE_NOW: "2026-10-05T03:30:00Z" })).toEqual(NOW);
    expect(resolveSeedNow({ TIDEFERN_FAKE_NOW: " 2026-10-05T03:30:00Z " })).toEqual(NOW);
    const before = Date.now();
    const clock = resolveSeedNow({}).getTime();
    expect(clock).toBeGreaterThanOrEqual(before);
    expect(clock).toBeLessThanOrEqual(Date.now());
  });

  test("refuses the variable on production and an instant it cannot read", () => {
    expect(() =>
      resolveSeedNow({ TIDEFERN_FAKE_NOW: "2026-10-05T03:30:00Z", VERCEL_ENV: "production" }),
    ).toThrow(SeedConfigurationError);
    expect(() => resolveSeedNow({ TIDEFERN_FAKE_NOW: "yesterday" })).toThrow(
      SeedConfigurationError,
    );
  });
});

describe("under the B8 policies", () => {
  test("Noor sees her own records, her household and the trail about her", async () => {
    expect(
      await countsAs(NOOR.id, [
        "profiles",
        "subject_keys",
        "cycle_entries",
        "entry_symptoms",
        "cycle_predictions",
        "notes",
        "grants",
        "households",
        "household_members",
        "invitations",
        "children",
        "pregnancies",
        "audit_events",
      ]),
    ).toEqual({
      // Herself and Theo; nobody in the other household is related to her.
      profiles: 2,
      subject_keys: 1,
      cycle_entries: 17,
      entry_symptoms: 14,
      cycle_predictions: 1,
      notes: 2,
      grants: 3,
      households: 1,
      household_members: 2,
      invitations: 4,
      children: 0,
      pregnancies: 0,
      // Her sign-in, three grants made, one revoked, an invitation made and
      // withdrawn, and Theo's two reads of her symptoms.
      audit_events: 9,
    });
  });

  test("Theo reads the day sheet through his symptoms grant and nothing the revoked grant covered", async () => {
    expect(
      await countsAs(THEO.id, [
        "profiles",
        "subject_keys",
        "cycle_entries",
        "entry_symptoms",
        "cycle_predictions",
        "notes",
        "grants",
        "households",
        "children",
        "pregnancies",
        "audit_events",
      ]),
    ).toEqual({
      profiles: 2,
      // His own key and Noor's, for the shared note.
      subject_keys: 2,
      cycle_entries: 17,
      entry_symptoms: 14,
      // cycle.history is the revoked grant.
      cycle_predictions: 0,
      // The shared note only; the private journal never.
      notes: 1,
      grants: 3,
      households: 1,
      children: 0,
      pregnancies: 0,
      // His sign-in and his two reads.
      audit_events: 3,
    });
    const seen = await withActor(
      THEO.id,
      (tx) => tx.select({ category: schema.notes.category }).from(schema.notes),
      harness.db,
    );
    expect(seen).toEqual([{ category: "cycle.symptoms" }]);
  });

  test("Theo cannot write on Noor's day sheet at read level", async () => {
    const message = await refusal(
      withActor(
        THEO.id,
        (tx) =>
          tx.insert(schema.entrySymptoms).values({
            id: "018f5e7a-5eed-7fff-8000-000000000001",
            entryId: seedId(BLOCK.cycleEntries, 17),
            subjectId: NOOR.id,
            code: "headache",
          }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "entry_symptoms"/);
  });

  test("Pia reaches Sol alone, not Ilo, and never the guardians", async () => {
    const seen = await withActor(
      PIA.id,
      async (tx) => ({
        children: (await tx.select({ id: schema.children.id }).from(schema.children)).map(
          (row) => row.id,
        ),
        events: new Set(
          (await tx.select({ childId: schema.childEvents.childId }).from(schema.childEvents)).map(
            (row) => row.childId,
          ),
        ),
        measurements: await count(tx, "child_measurements"),
        guardians: await count(tx, "child_guardians"),
        keys: await count(tx, "subject_keys"),
        profiles: await count(tx, "profiles"),
        households: await count(tx, "households"),
        audit: await count(tx, "audit_events"),
      }),
      harness.db,
    );
    expect(seen).toEqual({
      children: [SOL],
      events: new Set([SOL]),
      measurements: 2,
      guardians: 0,
      // Her own key and Sol's.
      keys: 2,
      // Herself and Mira, who made the grant.
      profiles: 2,
      households: 0,
      // Her sign-in and her read of Sol's records.
      audit: 2,
    });
    const message = await refusal(
      withActor(
        PIA.id,
        (tx) =>
          tx.insert(schema.childEvents).values({
            id: "018f5e7a-5eed-7fff-8000-000000000002",
            childId: ILO,
            authorId: PIA.id,
            kind: "diaper",
            date: "2026-10-04",
          }),
        harness.db,
      ),
    );
    expect(message).toMatch(/row-level security policy for table "child_events"/);
  });

  test("Mira sees both children, Lena's journey through her contribute grant, and not the due date history", async () => {
    expect(
      await countsAs(MIRA.id, [
        "children",
        "child_guardians",
        "child_events",
        "child_measurements",
        "pregnancies",
        "pregnancy_events",
        "due_date_changes",
        "notes",
        "subject_keys",
        "profiles",
        "grants",
        "audit_events",
      ]),
    ).toEqual({
      children: 2,
      child_guardians: 4,
      child_events: 10,
      child_measurements: 5,
      // Her own ended one and Lena's open one.
      pregnancies: 2,
      pregnancy_events: 5,
      // Lena's alone to read.
      due_date_changes: 0,
      // Her private note and the two under Lena's pregnancy.overview.
      notes: 3,
      // Herself, both children and Lena, who granted to her.
      subject_keys: 4,
      // Herself, Lena and Pia.
      profiles: 3,
      grants: 2,
      // Her sign-in, the child grant she made, her two writes for Lena, and
      // Pia's read of Sol, whose guardian she is.
      audit_events: 5,
    });
  });

  test("Lena sees her own journey and the children, and none of Mira's history", async () => {
    expect(
      await countsAs(LENA.id, [
        "pregnancies",
        "pregnancy_events",
        "due_date_changes",
        "notes",
        "children",
        "subject_keys",
        "profiles",
        "cycle_entries",
      ]),
    ).toEqual({
      pregnancies: 1,
      pregnancy_events: 4,
      due_date_changes: 1,
      notes: 2,
      children: 2,
      // Herself and both children; no grant from Mira.
      subject_keys: 3,
      profiles: 2,
      cycle_entries: 0,
    });
  });

  test("a contribute grantee writes for the subject and the row stays the subject's", async () => {
    const id = "018f5e7a-5eed-7fff-8000-000000000003";
    const [written] = await withActor(
      MIRA.id,
      (tx) =>
        tx
          .insert(schema.pregnancyEvents)
          .values({
            id,
            pregnancyId: LENA_PREGNANCY,
            subjectId: LENA.id,
            authorId: MIRA.id,
            kind: "appointment",
            date: "2026-11-01",
          })
          .returning({ subjectId: schema.pregnancyEvents.subjectId }),
      harness.db,
    );
    expect(written).toEqual({ subjectId: LENA.id });
    await withSystem(
      (tx) =>
        tx.delete(schema.pregnancyEvents).where(sql`${schema.pregnancyEvents.id} = ${id}::uuid`),
      harness.db,
    );
  });
});
