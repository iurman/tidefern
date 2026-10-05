import { NoteCategory } from "@tidefern/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "./index";
import {
  ANNA,
  BEN,
  CHILD,
  HOUSEHOLD,
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

const BODY = Uint8Array.from({ length: 64 }, (_, index) => (index * 17 + 9) % 256);
const CAPTION = Uint8Array.from({ length: 36 }, (_, index) => (index * 19 + 1) % 256);
const KEY = "018f5e7a-3000-7000-8000-000000000001";
const DEADLINE = new Date("2026-11-19T18:30:00Z");
const UNDO_UNTIL = new Date("2026-10-12T18:30:00Z");

async function columnNames(table: string): Promise<string[]> {
  return rows(
    await harness.db.execute(
      sql`select column_name from information_schema.columns where table_name = ${table} order by column_name`,
    ),
  ).map((row) => row.column_name as string);
}

beforeAll(async () => {
  harness = await createTestDatabase();
  await insertUser(harness, ANNA, "anna@example.test");
  await insertUser(harness, BEN, "ben@example.test");
  await harness.db.insert(schema.households).values({ id: HOUSEHOLD });
  await harness.db
    .insert(schema.children)
    .values({ id: CHILD, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2026-02-14" });
});

afterAll(async () => {
  await harness.close();
});

describe("the platform migration", () => {
  test("applies from empty as the seventh journal entry", async () => {
    await expectJournalApplied(harness, "0006_platform");
  });

  test("pins the note categories to the schemas package and the platform vocabularies", () => {
    expect([...schema.noteCategoryValues]).toEqual(NoteCategory.options);
    expect(schema.noteCategoryEnum.enumValues).toEqual(NoteCategory.options);
    expect([...schema.photoCategoryValues]).toEqual(["pregnancy.photos", "child"]);
    expect([...schema.jobStatusValues]).toEqual(["queued", "running", "done", "failed", "dead"]);
    expect([...schema.idempotencyStateValues]).toEqual(["in_flight", "done"]);
    expect([...schema.dataRequestKindValues]).toEqual(["export", "closure", "access", "deletion"]);
  });

  test("enables row level security on the user-data tables and not on the platform ones", async () => {
    const flags = await rowSecurityFlags(harness);
    expect(flags).toMatchObject({
      notes: true,
      photos: true,
      photo_variants: true,
      audit_events: true,
      data_requests: true,
      disclosures: true,
      jobs: false,
      idempotency_keys: false,
      product_events: false,
    });
  });
});

describe("notes", () => {
  test("store an encrypted body filed as private by default", async () => {
    const [note] = await harness.db
      .insert(schema.notes)
      .values({
        id: id(1),
        subjectId: ANNA,
        authorId: ANNA,
        date: "2026-10-04",
        body: BODY,
        kekVersion: "v1",
      })
      .returning();
    expect(note).toMatchObject({
      category: "journal.private",
      date: "2026-10-04",
      kekVersion: "v1",
      version: 1,
      deletedAt: null,
    });
    expect(Array.from(note?.body ?? [])).toEqual(Array.from(BODY));
    const [stored] = rows(
      await harness.db.execute(
        sql`select pg_typeof(body)::text as type, octet_length(body) as bytes from notes where id = ${id(1)}`,
      ),
    );
    expect(stored).toEqual({ type: "bytea", bytes: 64 });
  });

  test("refuse a note without a body and a category outside the vocabulary", async () => {
    const noBody = await refusal(
      harness.db.execute(
        sql`insert into notes (id, subject_id, date, kek_version) values (${id(2)}, ${ANNA}, '2026-10-04', 'v1')`,
      ),
    );
    expect(noBody).toMatch(/null value in column "body"/);
    const category = await refusal(
      harness.db.execute(
        sql`insert into notes (id, subject_id, category, date, body, kek_version) values (${id(2)}, ${ANNA}, 'child', '2026-10-04', '\\x00', 'v1')`,
      ),
    );
    expect(category).toMatch(/invalid input value for enum note_category/);
  });

  test("keep a partner's note about her when the partner is deleted", async () => {
    await harness.db.insert(schema.notes).values({
      id: id(3),
      subjectId: ANNA,
      authorId: BEN,
      category: "pregnancy.overview",
      date: "2026-10-05",
      body: BODY,
      kekVersion: "v1",
    });
    await harness.db.delete(schema.user).where(eq(schema.user.id, BEN));
    const kept = await harness.db.query.notes.findFirst({ where: eq(schema.notes.id, id(3)) });
    expect(kept).toMatchObject({ subjectId: ANNA, authorId: null });
  });
});

describe("photos", () => {
  test("store metadata only, with an encrypted caption and no filename or EXIF columns", async () => {
    const [photo] = await harness.db
      .insert(schema.photos)
      .values({
        id: id(10),
        subjectId: ANNA,
        authorId: ANNA,
        category: "pregnancy.photos",
        objectKey: "photos/018f5e7a/original",
        contentType: "image/jpeg",
        byteLength: 2_400_000,
        width: 3024,
        height: 4032,
        caption: CAPTION,
        kekVersion: "v1",
        takenOn: "2026-10-03",
      })
      .returning();
    expect(photo).toMatchObject({
      status: "pending",
      objectKey: "photos/018f5e7a/original",
      byteLength: 2_400_000,
      width: 3024,
      height: 4032,
      takenOn: "2026-10-03",
      childId: null,
    });
    expect(Array.from(photo?.caption ?? [])).toEqual(Array.from(CAPTION));

    const columns = await columnNames("photos");
    for (const forbidden of ["filename", "original_filename", "file_name", "exif", "gps"]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  test("store a child photo keyed to the child and refuse a mismatch", async () => {
    await harness.db.insert(schema.photos).values({
      id: id(11),
      subjectId: CHILD,
      childId: CHILD,
      authorId: ANNA,
      category: "child",
      objectKey: "photos/018f5e7b/original",
      contentType: "image/heic",
      byteLength: 1,
    });
    const noChild = await refusal(
      harness.db.insert(schema.photos).values({
        id: id(12),
        subjectId: CHILD,
        category: "child",
        objectKey: "photos/018f5e7c/original",
        contentType: "image/heic",
        byteLength: 1,
      }),
    );
    expect(noChild).toMatch(/photos_child_id_matches_category/);
    const sameKey = await refusal(
      harness.db.insert(schema.photos).values({
        id: id(12),
        subjectId: ANNA,
        category: "pregnancy.photos",
        objectKey: "photos/018f5e7a/original",
        contentType: "image/jpeg",
        byteLength: 1,
      }),
    );
    expect(sameKey).toMatch(/photos_object_key_unique/);
  });

  test("keep one row per variant and delete variants with the photo", async () => {
    await harness.db.insert(schema.photoVariants).values([
      {
        id: id(20),
        photoId: id(10),
        variant: "thumbnail",
        objectKey: "photos/018f5e7a/thumbnail",
        width: 240,
        height: 320,
        byteLength: 12_000,
      },
      {
        id: id(21),
        photoId: id(10),
        variant: "preview",
        objectKey: "photos/018f5e7a/preview",
        width: 1200,
        height: 1600,
        byteLength: 180_000,
      },
    ]);
    const twice = await refusal(
      harness.db.insert(schema.photoVariants).values({
        id: id(22),
        photoId: id(10),
        variant: "preview",
        objectKey: "photos/018f5e7a/preview-2",
        width: 1200,
        height: 1600,
        byteLength: 180_000,
      }),
    );
    expect(twice).toMatch(/photo_variants_photo_variant_unique/);

    await harness.db.delete(schema.photos).where(eq(schema.photos.id, id(10)));
    expect(await harness.db.query.photoVariants.findMany()).toEqual([]);
  });

  test("delete a child's photos with the child", async () => {
    await harness.db.delete(schema.children).where(eq(schema.children.id, CHILD));
    expect(await harness.db.query.photos.findMany()).toEqual([]);
  });
});

describe("audit events", () => {
  test("record who did what to whom, with no content columns", async () => {
    const [event] = await harness.db
      .insert(schema.auditEvents)
      .values({
        id: id(30),
        actorId: ANNA,
        action: "grant.create",
        subjectId: ANNA,
        category: "cycle.history",
      })
      .returning();
    expect(event).toMatchObject({
      action: "grant.create",
      category: "cycle.history",
      dedupeKey: null,
    });
    expect(event?.occurredAt).toBeInstanceOf(Date);

    const columns = await columnNames("audit_events");
    expect(columns).toEqual([
      "action",
      "actor_id",
      "category",
      "child_id",
      "created_at",
      "dedupe_key",
      "id",
      "occurred_at",
      "subject_id",
    ]);
  });

  test("collapse repeated partner reads on one day through the dedupe key", async () => {
    const read = {
      actorId: ANNA,
      action: "partner.read",
      subjectId: BEN,
      category: "cycle.status" as const,
      dedupeKey: "read|anna|ben|cycle.status|2026-10-05",
    };
    await harness.db.insert(schema.auditEvents).values({ id: id(31), ...read });
    const second = await harness.db
      .insert(schema.auditEvents)
      .values({ id: id(32), ...read })
      .onConflictDoNothing()
      .returning();
    expect(second).toEqual([]);
    const refused = await refusal(
      harness.db.insert(schema.auditEvents).values({ id: id(33), ...read }),
    );
    expect(refused).toMatch(/audit_events_dedupe_key_unique/);
    // Rows without a key never collide with each other.
    await harness.db.insert(schema.auditEvents).values([
      { id: id(34), actorId: ANNA, action: "session.sign_in", subjectId: ANNA },
      { id: id(35), actorId: ANNA, action: "session.sign_in", subjectId: ANNA },
    ]);
  });
});

describe("jobs and idempotency keys", () => {
  test("queue a job with an ids-only payload and the defaults 10.1 names", async () => {
    const [job] = await harness.db
      .insert(schema.jobs)
      .values({ id: id(40), type: "reminder.send", payloadJson: { pregnancyId: id(1) } })
      .returning();
    expect(job).toMatchObject({
      type: "reminder.send",
      payloadJson: { pregnancyId: id(1) },
      attempts: 0,
      status: "queued",
      lockedAt: null,
      lastError: null,
    });
    expect(job?.runAfter).toBeInstanceOf(Date);

    const [bare] = await harness.db
      .insert(schema.jobs)
      .values({ id: id(41), type: "sweep.daily" })
      .returning();
    expect(bare?.payloadJson).toEqual({});

    await harness.db
      .update(schema.jobs)
      .set({ status: "dead", attempts: 5, lastError: "timeout" })
      .where(eq(schema.jobs.id, id(40)));
    const dead = await harness.db.query.jobs.findMany({ where: eq(schema.jobs.status, "dead") });
    expect(dead.map((row) => row.id)).toEqual([id(40)]);
  });

  test("refuse a job status outside the vocabulary", async () => {
    const message = await refusal(
      harness.db.execute(
        sql`insert into jobs (id, type, status) values (${id(42)}, 'sweep.daily', 'paused')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum job_status/);
  });

  test("keep one idempotency row per actor and key and never a response body", async () => {
    const [row] = await harness.db
      .insert(schema.idempotencyKeys)
      .values({ id: id(50), actorId: ANNA, key: KEY, route: "POST /v1/notes", requestHash: "h1" })
      .returning();
    expect(row).toMatchObject({ state: "in_flight", resourceId: null });

    const message = await refusal(
      harness.db.insert(schema.idempotencyKeys).values({
        id: id(51),
        actorId: ANNA,
        key: KEY,
        route: "POST /v1/notes",
        requestHash: "h2",
      }),
    );
    expect(message).toMatch(/idempotency_keys_actor_key_unique/);

    await harness.db
      .update(schema.idempotencyKeys)
      .set({ state: "done", resourceId: id(1) })
      .where(eq(schema.idempotencyKeys.id, id(50)));

    const columns = await columnNames("idempotency_keys");
    expect(columns).toEqual([
      "actor_id",
      "created_at",
      "id",
      "key",
      "request_hash",
      "resource_id",
      "route",
      "state",
      "updated_at",
    ]);
  });

  test("delete idempotency rows with the actor", async () => {
    await insertUser(harness, BEN, "ben@example.test");
    await harness.db
      .insert(schema.idempotencyKeys)
      .values({ id: id(52), actorId: BEN, key: KEY, route: "POST /v1/notes", requestHash: "h1" });
    await harness.db.delete(schema.user).where(eq(schema.user.id, BEN));
    const left = await harness.db.query.idempotencyKeys.findMany();
    expect(left.map((row) => row.actorId)).toEqual([ANNA]);
  });
});

describe("data requests, product events and disclosures", () => {
  test("track a closure with its undo window and an access request from an email hash", async () => {
    const [closure, access] = await harness.db
      .insert(schema.dataRequests)
      .values([
        { id: id(60), userId: ANNA, kind: "closure", deadlineAt: DEADLINE, undoUntil: UNDO_UNTIL },
        { id: id(61), emailHmac: "hmac:former-partner", kind: "access", deadlineAt: DEADLINE },
      ])
      .returning();
    expect(closure).toMatchObject({ state: "requested", completedAt: null });
    expect(closure?.undoUntil?.toISOString()).toBe(UNDO_UNTIL.toISOString());
    expect(closure?.requestedAt).toBeInstanceOf(Date);
    expect(access).toMatchObject({
      userId: null,
      emailHmac: "hmac:former-partner",
      undoUntil: null,
    });
  });

  test("refuse a request with nobody behind it, an undo window outside closure and a completion without a date", async () => {
    const nobody = await refusal(
      harness.db
        .insert(schema.dataRequests)
        .values({ id: id(62), kind: "export", deadlineAt: DEADLINE }),
    );
    expect(nobody).toMatch(/data_requests_has_a_requester/);
    const undo = await refusal(
      harness.db.insert(schema.dataRequests).values({
        id: id(62),
        userId: ANNA,
        kind: "export",
        deadlineAt: DEADLINE,
        undoUntil: UNDO_UNTIL,
      }),
    );
    expect(undo).toMatch(/data_requests_undo_is_for_closure/);
    const completed = await refusal(
      harness.db
        .update(schema.dataRequests)
        .set({ state: "completed" })
        .where(eq(schema.dataRequests.id, id(61))),
    );
    expect(completed).toMatch(/data_requests_completed_matches_state/);
    await harness.db
      .update(schema.dataRequests)
      .set({ state: "cancelled", completedAt: new Date() })
      .where(eq(schema.dataRequests.id, id(60)));
  });

  test("count product events once per day and name, with no user column", async () => {
    await harness.db
      .insert(schema.productEvents)
      .values({ id: id(70), day: "2026-10-05", name: "sign_in.failed", count: 3 });
    const twice = await refusal(
      harness.db
        .insert(schema.productEvents)
        .values({ id: id(71), day: "2026-10-05", name: "sign_in.failed", count: 1 }),
    );
    expect(twice).toMatch(/product_events_day_name_unique/);
    const [bumped] = await harness.db
      .insert(schema.productEvents)
      .values({ id: id(71), day: "2026-10-05", name: "sign_in.failed", count: 1 })
      .onConflictDoUpdate({
        target: [schema.productEvents.day, schema.productEvents.name],
        set: { count: sql`${schema.productEvents.count} + 1` },
      })
      .returning();
    expect(bumped).toMatchObject({ id: id(70), day: "2026-10-05", count: 4 });

    const columns = await columnNames("product_events");
    expect(columns).toEqual(["count", "created_at", "day", "id", "name", "updated_at"]);
    const negative = await refusal(
      harness.db
        .insert(schema.productEvents)
        .values({ id: id(72), day: "2026-10-06", name: "sign_in.failed", count: -1 }),
    );
    expect(negative).toMatch(/product_events_count_is_not_negative/);
  });

  test("keep a disclosure ledger per user that goes with the user", async () => {
    await harness.db.insert(schema.disclosures).values({
      id: id(80),
      userId: ANNA,
      recipient: "Example Processor",
      contact: "privacy@example.test",
      purpose: "Transactional email delivery",
    });
    await harness.db.delete(schema.user).where(eq(schema.user.id, ANNA));
    expect(await harness.db.query.disclosures.findMany()).toEqual([]);
    expect(await harness.db.query.dataRequests.findMany()).toHaveLength(1);
    expect(await harness.db.query.auditEvents.findMany()).toEqual([]);
  });
});
