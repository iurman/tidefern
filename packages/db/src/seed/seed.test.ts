import { sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import {
  FixedKeyProvider,
  KeyConfigurationError,
  createKeyCache,
  decryptFieldFor,
  unwrapForSubject,
} from "@tidefern/crypto";
import { CHILD_CONSENT_DISCLOSURES } from "@tidefern/schemas";
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
  GRANT_MIRA_LENA_SUMMARY,
  ILO,
  ILO_FEED_NOTE,
  LENA,
  LENA_PREGNANCY,
  MIRA,
  MIRA_PREGNANCY,
  NOOR,
  NOTE_NOOR_PRIVATE,
  PARTNER_READ,
  PARTNER_WRITE,
  PERSONAS,
  PIA,
  SEED_NOTES,
  SEED_PREGNANCY_EVENTS,
  SOL,
  SOL_BEYOND_BAND,
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
 * adds nothing and changes nothing, a second database seeded from the same
 * instant matches the first column for column except where the envelope and
 * the hasher need randomness, every row carries its own instant rather than
 * the clock, the sealed text opens with the KEK that
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

/**
 * The cast as packages/db/README.md documents it, rows per table. Task G10
 * added a grant (Mira's summary grant to Lena), its audit row and one of
 * Sol's measurements, for the page specs' paused-card and care cases.
 */
const CAST = {
  user: 5,
  account: 5,
  profiles: 5,
  subject_keys: 7,
  households: 2,
  household_members: 4,
  invitations: 5,
  grants: 6,
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
  child_measurements: 6,
  notes: 5,
  audit_events: 19,
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

/**
 * The only columns two databases seeded from the same instant may differ
 * in: the scrypt salt, the wrapped DEKs and the GCM envelopes under them.
 */
const RANDOM_COLUMNS: Record<string, string[]> = {
  account: ["password"],
  subject_keys: ["wrapped_dek"],
  notes: ["body"],
  pregnancy_events: ["label"],
  child_events: ["note"],
};

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

async function publicTables(db: Harness["db"] = harness.db): Promise<string[]> {
  return rows(
    await db.execute(
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

/**
 * Every row of every public table, serialised and sorted, so two runs (or
 * two databases, with the random columns dropped) can be compared whole.
 */
async function snapshot(
  db: Harness["db"] = harness.db,
  drop: Record<string, string[]> = {},
): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of await publicTables(db)) {
    const result = rows(await db.execute(sql`select * from ${sql.identifier(table)}`));
    dump[table] = result
      .map((row) => {
        const kept: Record<string, unknown> = { ...row };
        for (const column of drop[table] ?? []) delete kept[column];
        return JSON.stringify(kept, (_, value: unknown) =>
          value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
        );
      })
      .sort();
  }
  return dump;
}

/** A timestamptz column as the driver returns it, as epoch milliseconds. */
function instant(value: unknown): number {
  return new Date(value as string | Date).getTime();
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
    // Deliberately the whole public table list: a migration that adds a
    // table fails here until the seed decides whether the cast fills it or
    // leaves it empty, so no table slips in unseeded by accident.
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
    // The second summary grant is Mira's to Lena on her pregnancy (task G10).
    expect(levels).toEqual([
      { level: "contribute", revoked: false },
      { level: "read", revoked: false },
      { level: "read", revoked: false },
      { level: "read", revoked: true },
      { level: "summary", revoked: false },
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

  test("gives every feed its method and every diaper its contents (task E12)", async () => {
    const logged = rows(
      await harness.db.execute(
        sql`select id::text as id, child_id::text as child, kind::text as kind, feed_method::text as method, side::text as side, quantity_ml as ml, diaper_contents::text as contents from child_events where kind in ('feed', 'diaper') order by id`,
      ),
    );
    expect(logged).toEqual([
      {
        id: seedId(BLOCK.childEvents, 1),
        child: ILO,
        kind: "feed",
        method: "bottle",
        side: null,
        ml: 90,
        contents: null,
      },
      {
        id: ILO_FEED_NOTE.id,
        child: ILO,
        kind: "feed",
        method: "breast",
        side: null,
        ml: null,
        contents: null,
      },
      {
        id: seedId(BLOCK.childEvents, 4),
        child: ILO,
        kind: "diaper",
        method: null,
        side: null,
        ml: null,
        contents: "mixed",
      },
    ]);
  });

  test("records each child's consent, given by Mira, in the guardian's consent wording", async () => {
    const disclosure = CHILD_CONSENT_DISCLOSURES["2026-10"];
    const given = rows(
      await harness.db.execute(
        sql`select subject_id::text as subject, consenting_guardian_id::text as guardian, category::text as category, basis::text as basis, purpose, policy_version as version from consents where consenting_guardian_id is not null order by subject_id`,
      ),
    );
    const expected = { guardian: MIRA.id, category: "child", version: "2026-10" };
    expect(given).toEqual([
      { subject: ILO, ...expected, basis: disclosure.basis, purpose: disclosure.purpose },
      { subject: SOL, ...expected, basis: disclosure.basis, purpose: disclosure.purpose },
    ]);
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

describe("a second database", () => {
  test("seeded from the same instant matches the first column for column", async () => {
    const twin = await createTestDatabase();
    try {
      const report = await seed(twin.db, { now: NOW, kek });
      expect(report.inserted).toEqual(CAST);
      const here = await snapshot(harness.db, RANDOM_COLUMNS);
      const there = await snapshot(twin.db, RANDOM_COLUMNS);
      expect(there).toEqual(here);
      // The dropped columns really differ, so the comparison above is doing work.
      const whole = await snapshot(twin.db);
      expect(whole.account).not.toEqual((await snapshot())["account"]);
    } finally {
      await twin.close();
    }
  });
});

describe("the instants", () => {
  test("every created_at and updated_at is the row's own moment, never the clock", async () => {
    const stamped = rows(
      await harness.db.execute(
        sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in ('created_at', 'updated_at') order by table_name, column_name`,
      ),
    ) as { table_name: string; column_name: string }[];
    expect(stamped.length).toBeGreaterThan(30);
    const earliest = NOW.getTime() - 420 * 86_400_000;
    for (const { table_name, column_name } of stamped) {
      if (!(table_name in CAST)) continue;
      const [row] = rows(
        await harness.db.execute(
          sql`select min(${sql.identifier(column_name)}) as lo, max(${sql.identifier(column_name)}) as hi from ${sql.identifier(table_name)}`,
        ),
      );
      expect(instant(row?.lo), `${table_name}.${column_name}`).toBeGreaterThanOrEqual(earliest);
      expect(instant(row?.hi), `${table_name}.${column_name}`).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  test("pins a few rows to the instants the cast documents", async () => {
    const day = 86_400_000;
    const [entry] = rows(
      await harness.db.execute(
        sql`select created_at, updated_at from cycle_entries where date = ${shiftDays(dateIn(NOW, NOOR.timeZone), -58)}`,
      ),
    );
    expect(instant(entry?.created_at)).toBe(NOW.getTime() - 58 * day);
    expect(instant(entry?.updated_at)).toBe(NOW.getTime() - 58 * day);

    const [revoked] = rows(
      await harness.db.execute(
        sql`select updated_at, revoked_at from grants where revoked_at is not null`,
      ),
    );
    expect(instant(revoked?.updated_at)).toBe(instant(revoked?.revoked_at));
    expect(instant(revoked?.updated_at)).toBe(NOW.getTime() - 20 * day);

    const [drift] = rows(
      await harness.db.execute(
        sql`select count(*)::int as n from audit_events where created_at <> occurred_at`,
      ),
    );
    expect(drift).toEqual({ n: 0 });

    const keys = rows(
      await harness.db.execute(
        sql`select subject_id, created_at from subject_keys where subject_id in (${NOOR.id}::uuid, ${ILO}::uuid) order by subject_id`,
      ),
    ).map((row) => [row.subject_id, instant(row.created_at)]);
    expect(keys).toEqual(
      [
        [NOOR.id, NOW.getTime() - NOOR.signedUpDaysAgo * day],
        [ILO, NOW.getTime() - 42 * day],
      ].sort(),
    );

    const [vocabulary] = rows(
      await harness.db.execute(
        sql`select count(distinct created_at)::int as distinct_instants, min(created_at) as at from vocabulary`,
      ),
    );
    expect(vocabulary?.distinct_instants).toBe(1);
    expect(instant(vocabulary?.at)).toBe(NOW.getTime());
  });

  // The names and the key format changed on purpose in task G10: the seed wrote `share.read`,
  // `share.write` and `read:a:b:c:day` where the API writes `partner.read`, `partner.write` and
  // `a/b/c/day`, so the activity view could not name the seeded rows and an API read on a seeded
  // day added a second row instead of collapsing onto the first.
  test("names partner reads and writes as the API does and keys each read the API's way", async () => {
    const actions = rows(
      await harness.db.execute(
        sql`select action, count(*)::int as n from audit_events where action like '%.read' or action like '%.write' group by action order by action`,
      ),
    );
    expect(actions).toEqual([
      { action: PARTNER_READ, n: 3 },
      { action: PARTNER_WRITE, n: 2 },
    ]);
    expect([PARTNER_READ, PARTNER_WRITE]).toEqual(["partner.read", "partner.write"]);

    const reads = rows(
      await harness.db.execute(
        sql`select actor_id, subject_id, child_id, dedupe_key, occurred_at from audit_events where action = ${PARTNER_READ} order by occurred_at desc`,
      ),
    );
    for (const read of reads) {
      // The subject's own zone for a person, the reader's for a child (who has no zone).
      const subject = PERSONAS.find((persona) => persona.id === read.subject_id);
      const reader = PERSONAS.find((persona) => persona.id === read.actor_id);
      const zone = read.child_id === null && subject ? subject.timeZone : reader?.timeZone;
      const readDay = dateIn(new Date(read.occurred_at as string | Date), zone ?? "UTC");
      expect(read.dedupe_key).toMatch(new RegExp(`/${readDay}$`));
    }
    expect(reads.map((read) => read.dedupe_key)).toEqual([
      `${THEO.id}/${NOOR.id}/cycle.symptoms/2026-10-05`,
      `${THEO.id}/${NOOR.id}/cycle.symptoms/2026-10-04`,
      `${PIA.id}/${SOL}/child/2026-10-03`,
    ]);
  });

  // Two instants where a read placed a whole 24 hours before `now` shares today's Berlin date or
  // skips yesterday's: CI's midnight UTC, and 23:30 on Berlin's 25-hour day (2026-10-25, back to
  // winter time), where 24 hours earlier is 00:30 on the same date (found in G10's review).
  test.each([
    ["at midnight UTC, as CI's does", "2026-10-05T00:00:00Z", "2026-10-05", "2026-10-04"],
    ["late on Berlin's 25-hour day", "2026-10-25T22:30:00Z", "2026-10-25", "2026-10-24"],
  ])(
    "keeps Theo's two reads on today and yesterday in Berlin when the seed runs %s",
    async (_, at, today, yesterday) => {
      const twin = await createTestDatabase();
      try {
        await seed(twin.db, { now: new Date(at), kek });
        const reads = rows(
          await twin.db.execute(
            sql`select dedupe_key from audit_events where action = ${PARTNER_READ} and actor_id = ${THEO.id}::uuid order by occurred_at desc`,
          ),
        ).map((read) => read.dedupe_key);
        expect(reads).toEqual([
          `${THEO.id}/${NOOR.id}/cycle.symptoms/${today}`,
          `${THEO.id}/${NOOR.id}/cycle.symptoms/${yesterday}`,
        ]);
      } finally {
        await twin.close();
      }
    },
  );
});

describe("the cases the page specs need", () => {
  test("Mira's summary grant to Lena predates the end of the pregnancy it reaches", async () => {
    const [grant] = rows(
      await harness.db.execute(
        sql`select owner_id, grantee_id, category::text as category, level::text as level, created_at, revoked_at from grants where id = ${GRANT_MIRA_LENA_SUMMARY}::uuid`,
      ),
    );
    expect(grant).toMatchObject({
      owner_id: MIRA.id,
      grantee_id: LENA.id,
      category: "pregnancy.overview",
      level: "summary",
      revoked_at: null,
    });
    const [pregnancy] = rows(
      await harness.db.execute(
        sql`select started_at, ended_at::text as ended, ended_reason::text as reason from pregnancies where id = ${MIRA_PREGNANCY}::uuid`,
      ),
    );
    // Shared while open, so the API now answers Lena with the paused state (architecture 8.4 rule 2).
    expect(instant(grant?.created_at)).toBeGreaterThan(instant(pregnancy?.started_at));
    expect(pregnancy?.reason).toBe("birth");
    expect(instant(grant?.created_at)).toBeLessThan(
      instant(`${pregnancy?.ended as string}T00:00:00Z`),
    );
    const audited = rows(
      await harness.db.execute(
        sql`select occurred_at from audit_events where action = 'grant.create' and actor_id = ${MIRA.id}::uuid and category = 'pregnancy.overview'`,
      ),
    ).map((row) => instant(row.occurred_at));
    expect(audited).toEqual([instant(grant?.created_at)]);
  });

  test("Sol's newest measurement is the weight placed beyond two standard deviations", async () => {
    const [newest] = rows(
      await harness.db.execute(
        sql`select id, author_id, weight_grams, length_millimetres, head_millimetres, (date - (select date_of_birth from children where id = ${SOL}::uuid))::int as age_days from child_measurements where child_id = ${SOL}::uuid order by date desc limit 1`,
      ),
    );
    // packages/core's growthAssessment puts 10500 g at 912 days on the CDC chart at z -2.40,
    // the 0.8th percentile, under the 2.3rd percentile edge of 10934 g (this package cannot import
    // core, so the README records the check). Only the weight is set, so no other indicator is placed.
    expect(newest).toEqual({
      id: SOL_BEYOND_BAND,
      author_id: MIRA.id,
      weight_grams: 10500,
      length_millimetres: null,
      head_millimetres: null,
      age_days: 912,
    });
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
      // Sol's three, the newest the one beyond his band (task G10); the API sends her no care flag.
      measurements: 3,
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
      // Ilo's three and Sol's three, the newest of Sol's beyond his band (task G10).
      child_measurements: 6,
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
      // Lena's to her, and the two she made: Sol's to Pia and her pregnancy's to Lena (task G10).
      grants: 3,
      // Her sign-in, the two grants she made, her two writes for Lena, and
      // Pia's read of Sol, whose guardian she is.
      audit_events: 6,
    });
  });

  test("Lena sees her own journey, the children, and Mira's ended pregnancy only through the summary grant", async () => {
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
      // Her open one and, since task G10's summary grant, Mira's ended one; the API answers
      // her with the paused state for it and never projects its reason.
      pregnancies: 2,
      // Her four and Mira's one milestone, which the API's paused answer leaves out.
      pregnancy_events: 5,
      // Her own redating; Mira has none, and none is ever projected for a grantee.
      due_date_changes: 1,
      // Her two; Mira's private note never.
      notes: 2,
      children: 2,
      // Herself, both children and Mira, who granted to her.
      subject_keys: 4,
      profiles: 2,
      cycle_entries: 0,
    });
    const notes = await withActor(
      LENA.id,
      (tx) => tx.select({ category: schema.notes.category }).from(schema.notes),
      harness.db,
    );
    expect(notes.map((note) => note.category)).not.toContain("journal.private");
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
