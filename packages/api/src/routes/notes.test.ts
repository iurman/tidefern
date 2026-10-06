import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { todayIn } from "@tidefern/core";
import { decryptField, readSubjectKey, unwrapSubjectDek } from "@tidefern/crypto";
import { schema } from "@tidefern/db";
import { Note, NoteList, Problem } from "@tidefern/schemas";

import { createApp } from "../app";
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../middleware/idempotency";
import { sessionHeaders } from "../test/auth-fake";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS } from "../test/actors";
import { ANNA_TIME_ZONE, NOTE_CHILD, NOTE_GRANTS, createNotesFixture } from "../test/notes";
import type { NotesFixture } from "../test/notes";
import type { NotesBindings } from "./notes";

// Health words on purpose: the tests prove they reach nothing but the encrypted column.
const PRIVATE_TEXT = "nausea after breakfast, slept badly";
const CHANGED_TEXT = "nausea gone by noon";
const PARTNER_TEXT = "scan booked for thursday, she was nervous";
const WORDS = ["nausea", "slept badly", "scan booked", "nervous", "by noon"];

const KEYS = {
  create: "018f5e7a-7000-7000-8000-000000000001",
  ownerShared: "018f5e7a-7000-7000-8000-000000000002",
  second: "018f5e7a-7000-7000-8000-000000000003",
  third: "018f5e7a-7000-7000-8000-000000000004",
  share: "018f5e7a-7000-7000-8000-000000000005",
  shareAgain: "018f5e7a-7000-7000-8000-000000000006",
  partnerCreate: "018f5e7a-7000-7000-8000-000000000007",
  partnerPrivate: "018f5e7a-7000-7000-8000-000000000008",
  partnerShare: "018f5e7a-7000-7000-8000-000000000009",
  benOwn: "018f5e7a-7000-7000-8000-00000000000a",
  remove: "018f5e7a-7000-7000-8000-00000000000b",
  clientId: "018f5e7a-7000-7000-8000-00000000000c",
  clientIdAgain: "018f5e7a-7000-7000-8000-00000000000d",
  invalid: "018f5e7a-7000-7000-8000-00000000000e",
  invalidDate: "018f5e7a-7000-7000-8000-000000000011",
  invalidId: "018f5e7a-7000-7000-8000-000000000012",
  shareStale: "018f5e7a-7000-7000-8000-00000000000f",
  caraCreate: "018f5e7a-7000-7000-8000-000000000010",
  childNote: "018f5e7a-7000-7000-8000-000000000013",
};

const CLIENT_NOTE_ID = "018f5e7a-8000-7000-8000-000000000001";
const TOMBSTONE_ID = "018f5e7a-8000-7000-8000-000000000002";

let fixture: NotesFixture;
let app: ReturnType<typeof createApp>;
let env: NotesBindings;
const lines: string[] = [];
const problems: string[] = [];

beforeAll(async () => {
  fixture = await createNotesFixture();
  app = createApp({
    auth: fixture.auth,
    db: fixture.harness.db,
    log: { secret: "log-secret", sink: (line) => lines.push(line) },
  });
  env = { db: fixture.harness.db, keys: fixture.keys };
});

afterAll(async () => {
  await fixture.harness.close();
});

type Token = (typeof TOKENS)[keyof typeof TOKENS];

const headers = (token: Token, key?: string, extra: Record<string, string> = {}) => ({
  ...(sessionHeaders(token) as Record<string, string>),
  origin: OWN_ORIGIN,
  "content-type": "application/json",
  ...(key === undefined ? {} : { [IDEMPOTENCY_KEY_HEADER]: key }),
  ...extra,
});

const request = (path: string, init: RequestInit) => app.request(`/api/v1${path}`, init, env);

const post = (path: string, token: Token, key: string, body: unknown, extra = {}) =>
  request(path, {
    method: "POST",
    headers: headers(token, key, extra),
    body: JSON.stringify(body),
  });

const put = (path: string, token: Token, version: number | undefined, body: unknown) =>
  request(path, {
    method: "PUT",
    headers: headers(
      token,
      undefined,
      version === undefined ? {} : { "If-Match": String(version) },
    ),
    body: JSON.stringify(body),
  });

const get = (path: string, token: Token) => request(path, { headers: headers(token) });

const remove = (path: string, token: Token, key?: string) =>
  request(path, { method: "DELETE", headers: headers(token, key) });

/** A problem's text, collected so the hygiene test can scan every message the suite produced. */
async function problemOf(response: Response): Promise<Problem> {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body = Problem.parse(await response.json());
  problems.push(JSON.stringify(body));
  return body;
}

async function noteOf(response: Response): Promise<Note> {
  return Note.parse(await response.json());
}

/** The keys the server sent, read before a schema parse can strip a leaked field. */
async function rawKeysOf(response: Response): Promise<string[]> {
  return Object.keys((await response.clone().json()) as object).sort();
}

/** The keys of every list item the server sent, read before a schema parse. */
async function rawItemKeysOf(response: Response): Promise<string[][]> {
  const raw = (await response.clone().json()) as { items: object[] };
  return raw.items.map((item) => Object.keys(item).sort());
}

async function rowOf(id: string) {
  const [row] = await fixture.harness.db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.id, id))
    .limit(1);
  return row;
}

/** Decrypts straight from the column with the subject's key, as an export would. */
async function plaintextOf(id: string, subjectId: string): Promise<string> {
  const row = await rowOf(id);
  if (row === undefined) throw new Error("no such row");
  const dek = await unwrapSubjectDek(
    fixture.keys,
    subjectId,
    await readSubjectKey(fixture.harness.db, subjectId),
  );
  return decryptField(dek, { table: "notes", column: "body", rowId: id }, row.body);
}

async function auditRows(subjectId: string) {
  return fixture.harness.db
    .select({
      actorId: schema.auditEvents.actorId,
      action: schema.auditEvents.action,
      category: schema.auditEvents.category,
      dedupeKey: schema.auditEvents.dedupeKey,
    })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.subjectId, subjectId))
    .orderBy(schema.auditEvents.id);
}

const NOTE_KEYS = [
  "id",
  "subjectId",
  "authorId",
  "category",
  "date",
  "body",
  "createdAt",
  "updatedAt",
  "version",
];

let privateId = "";
let sharedId = "";
let partnerId = "";
let benOwnId = "";

describe("creating a note", () => {
  it("files the owner's note in the private journal, encrypted under her key, and answers 201", async () => {
    const response = await post("/notes", TOKENS.anna, KEYS.create, {
      date: "2026-10-02",
      body: PRIVATE_TEXT,
    });
    expect(response.status).toBe(201);
    const note = await noteOf(response);
    privateId = note.id;
    expect(response.headers.get("location")).toBe(`/api/v1/notes/${note.id}`);
    expect(note).toMatchObject({
      subjectId: ANNA,
      authorId: ANNA,
      category: "journal.private",
      date: "2026-10-02",
      body: PRIVATE_TEXT,
      version: 1,
    });
    expect(note.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const row = await rowOf(note.id);
    expect(row?.kekVersion).toBe("test");
    const stored = Buffer.from(row?.body ?? new Uint8Array()).toString("latin1");
    for (const word of WORDS) expect(stored).not.toContain(word);
    expect(await plaintextOf(note.id, ANNA)).toBe(PRIVATE_TEXT);
    // The ciphertext is bound to this row: under another row id it does not open.
    const dek = await unwrapSubjectDek(
      fixture.keys,
      ANNA,
      await readSubjectKey(fixture.harness.db, ANNA),
    );
    expect(() =>
      decryptField(dek, { table: "notes", column: "body", rowId: TOMBSTONE_ID }, row!.body),
    ).toThrow();
    expect(await auditRows(ANNA)).toEqual([]);
  });

  it("replays the create from the idempotency row without a second note", async () => {
    const replay = await post("/notes", TOKENS.anna, KEYS.create, {
      date: "2026-10-02",
      body: PRIVATE_TEXT,
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await replay.json()).toEqual({ id: privateId });
    const rows = await fixture.harness.db
      .select({ id: schema.notes.id })
      .from(schema.notes)
      .where(eq(schema.notes.subjectId, ANNA));
    expect(rows).toHaveLength(1);
  });

  it("keeps a client-minted id and answers 409 when the id is taken", async () => {
    const first = await post("/notes", TOKENS.anna, KEYS.clientId, {
      id: CLIENT_NOTE_ID,
      date: "2026-10-03",
      body: "third day",
    });
    expect(first.status).toBe(201);
    expect((await noteOf(first)).id).toBe(CLIENT_NOTE_ID);
    const taken = await post("/notes", TOKENS.anna, KEYS.clientIdAgain, {
      id: CLIENT_NOTE_ID,
      date: "2026-10-04",
      body: "another",
    });
    expect(taken.status).toBe(409);
    expect((await problemOf(taken)).code).toBe("conflict");
  });

  it("refuses the owner's own note in a shared category: the share action is the only way there", async () => {
    const response = await post("/notes", TOKENS.anna, KEYS.ownerShared, {
      date: "2026-10-02",
      category: "cycle.symptoms",
      body: PRIVATE_TEXT,
    });
    expect(response.status).toBe(422);
    const body = await problemOf(response);
    expect(body.code).toBe("validation_failed");
    expect(body.errors?.[0]?.path).toBe("category");
  });

  it("answers the 422 shape for an empty body, a date that is not a day and a bad id, and 400 without a key", async () => {
    const empty = await post("/notes", TOKENS.anna, KEYS.invalid, { date: "2026-10-02", body: "" });
    expect(empty.status).toBe(422);
    const emptyBody = await problemOf(empty);
    expect(emptyBody.code).toBe("validation_failed");
    expect(emptyBody.errors?.map((error) => error.path)).toEqual(["body"]);

    const badDate = await post("/notes", TOKENS.anna, KEYS.invalidDate, {
      date: "2026-02-30",
      body: PRIVATE_TEXT,
    });
    expect(badDate.status).toBe(422);
    expect((await problemOf(badDate)).errors?.[0]?.path).toBe("date");

    const badId = await post("/notes", TOKENS.anna, KEYS.invalidId, {
      id: "42",
      date: "2026-10-02",
      body: "x",
    });
    expect(badId.status).toBe(422);
    expect((await problemOf(badId)).errors?.[0]?.path).toBe("id");

    const noKey = await request("/notes", {
      method: "POST",
      headers: headers(TOKENS.anna),
      body: JSON.stringify({ date: "2026-10-02", body: PRIVATE_TEXT }),
    });
    expect(noKey.status).toBe(400);
    expect((await problemOf(noKey)).code).toBe("validation_failed");

    const anonymous = await app.request(
      "/api/v1/notes",
      {
        method: "POST",
        headers: { origin: OWN_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ date: "2026-10-02", body: "x" }),
      },
      env,
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("a guardian", () => {
  it("cannot file a note about the child: the notes table holds a person's notes only", async () => {
    // notes.subject_id references a user and the row categories have no child category,
    // so a child's journal is a request to the lead, not a row this route can write.
    const response = await post("/notes", TOKENS.anna, KEYS.childNote, {
      subject: NOTE_CHILD,
      date: "2026-10-02",
      body: PRIVATE_TEXT,
    });
    expect(response.status).toBe(404);
    expect((await problemOf(response)).code).toBe("not_found");
    const list = await get(`/notes?subject=${NOTE_CHILD}`, TOKENS.anna);
    expect(list.status).toBe(404);
    await problemOf(list);
    const rows = await fixture.harness.db
      .select({ id: schema.notes.id })
      .from(schema.notes)
      .where(eq(schema.notes.subjectId, NOTE_CHILD));
    expect(rows).toEqual([]);
  });
});

describe("reading notes as the owner", () => {
  it("lists her notes in date order with every category, pages by cursor and filters by date", async () => {
    const second = await post("/notes", TOKENS.anna, KEYS.second, {
      date: "2026-10-01",
      body: "first day",
    });
    expect(second.status).toBe(201);
    const all = await get("/notes", TOKENS.anna);
    expect(all.status).toBe(200);
    const page = NoteList.parse(await all.json());
    expect(page.items.map((item) => item.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(page.items[1]?.body).toBe(PRIVATE_TEXT);
    expect(page.nextCursor).toBeNull();

    const firstPage = NoteList.parse(await (await get("/notes?limit=2", TOKENS.anna)).json());
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const secondPage = NoteList.parse(
      await (await get(`/notes?limit=2&cursor=${firstPage.nextCursor}`, TOKENS.anna)).json(),
    );
    expect(secondPage.items.map((item) => item.date)).toEqual(["2026-10-03"]);
    expect(secondPage.nextCursor).toBeNull();

    const ranged = NoteList.parse(
      await (await get("/notes?from=2026-10-02&to=2026-10-02", TOKENS.anna)).json(),
    );
    expect(ranged.items.map((item) => item.id)).toEqual([privateId]);

    const explicit = NoteList.parse(
      await (await get(`/notes?subject=${ANNA}`, TOKENS.anna)).json(),
    );
    expect(explicit.items).toHaveLength(3);
  });

  it("answers 422 for a cursor it did not issue, a bad limit and a range that ends first", async () => {
    const garbage = await get("/notes?cursor=bm90LWEtY3Vyc29y", TOKENS.anna);
    expect(garbage.status).toBe(422);
    expect((await problemOf(garbage)).errors?.[0]?.path).toBe("cursor");
    const limit = await get("/notes?limit=500", TOKENS.anna);
    expect(limit.status).toBe(422);
    expect((await problemOf(limit)).errors?.[0]?.path).toBe("limit");
    const range = await get("/notes?from=2026-10-09&to=2026-10-01", TOKENS.anna);
    expect(range.status).toBe(422);
    await problemOf(range);
  });

  it("reads one note by id and answers 404 for an unknown id", async () => {
    const found = await get(`/notes/${privateId}`, TOKENS.anna);
    expect(found.status).toBe(200);
    expect((await noteOf(found)).body).toBe(PRIVATE_TEXT);
    const missing = await get(`/notes/${TOMBSTONE_ID}`, TOKENS.anna);
    expect(missing.status).toBe(404);
    expect((await problemOf(missing)).code).toBe("not_found");
    const malformed = await get("/notes/not-an-id", TOKENS.anna);
    expect(malformed.status).toBe(422);
    await problemOf(malformed);
  });

  it("serves a sync feed with updatedSince, tombstones included and without a body", async () => {
    const before = NoteList.parse(
      await (await get("/notes?updatedSince=2000-01-01T00:00:00.000Z", TOKENS.anna)).json(),
    );
    expect(before.items).toHaveLength(3);
    const after = NoteList.parse(
      await (await get("/notes?updatedSince=2999-01-01T00:00:00.000Z", TOKENS.anna)).json(),
    );
    expect(after.items).toHaveLength(0);

    // A tombstone inserted by hand: deletes are hard (architecture 11), so no route writes one today.
    // The feed still has to serve the schema's deletedAt rows without a body and drop them from the plain list.
    const original = await rowOf(privateId);
    await fixture.harness.db.insert(schema.notes).values({
      id: TOMBSTONE_ID,
      subjectId: ANNA,
      authorId: ANNA,
      category: "journal.private",
      date: "2026-10-05",
      body: original!.body,
      kekVersion: "test",
      deletedAt: new Date(),
    });
    const feed = NoteList.parse(
      await (await get("/notes?updatedSince=2000-01-01T00:00:00.000Z", TOKENS.anna)).json(),
    );
    const tombstone = feed.items.find((item) => item.id === TOMBSTONE_ID);
    expect(tombstone?.deletedAt).toMatch(/Z$/);
    expect(tombstone).not.toHaveProperty("body");
    const plain = NoteList.parse(await (await get("/notes", TOKENS.anna)).json());
    expect(plain.items.map((item) => item.id)).not.toContain(TOMBSTONE_ID);
    expect((await get(`/notes/${TOMBSTONE_ID}`, TOKENS.anna)).status).toBe(404);
    await fixture.harness.db.delete(schema.notes).where(eq(schema.notes.id, TOMBSTONE_ID));
  });
});

describe("changing a note", () => {
  it("needs If-Match, answers 409 on a stale version and re-encrypts the new body", async () => {
    const missing = await put(`/notes/${privateId}`, TOKENS.anna, undefined, {
      body: CHANGED_TEXT,
    });
    expect(missing.status).toBe(422);
    expect((await problemOf(missing)).errors?.[0]?.path).toBe("If-Match");

    const stale = await put(`/notes/${privateId}`, TOKENS.anna, 7, { body: CHANGED_TEXT });
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).code).toBe("conflict");
    expect(await plaintextOf(privateId, ANNA)).toBe(PRIVATE_TEXT);

    const empty = await put(`/notes/${privateId}`, TOKENS.anna, 1, {});
    expect(empty.status).toBe(422);
    await problemOf(empty);

    const changed = await put(`/notes/${privateId}`, TOKENS.anna, 1, {
      body: CHANGED_TEXT,
      date: "2026-10-06",
    });
    expect(changed.status).toBe(200);
    const note = await noteOf(changed);
    expect(note).toMatchObject({ version: 2, date: "2026-10-06", body: CHANGED_TEXT });
    expect(await plaintextOf(privateId, ANNA)).toBe(CHANGED_TEXT);

    const again = await put(`/notes/${privateId}`, TOKENS.anna, 1, { body: "late" });
    expect(again.status).toBe(409);
    await problemOf(again);
    expect(await auditRows(ANNA)).toEqual([]);
  });

  it("never takes a category on update", async () => {
    const response = await put(`/notes/${privateId}`, TOKENS.anna, 2, {
      date: "2026-10-06",
      category: "cycle.symptoms",
    });
    expect(response.status).toBe(200);
    expect((await noteOf(response)).category).toBe("journal.private");
  });
});

describe("a grantee", () => {
  it("never reaches the private journal: an empty list, 404 by id, and no body in a log line", async () => {
    const list = await get(`/notes?subject=${ANNA}`, TOKENS.ben);
    expect(list.status).toBe(200);
    expect(NoteList.parse(await list.json()).items).toEqual([]);
    const byId = await get(`/notes/${privateId}`, TOKENS.ben);
    expect(byId.status).toBe(404);
    expect((await problemOf(byId)).code).toBe("not_found");
    expect(await auditRows(ANNA)).toEqual([]);
  });

  it("sees a note once the owner shares it, with the share and the reads audited", async () => {
    const shared = await post(`/notes/${privateId}/share`, TOKENS.anna, KEYS.share, {
      category: "cycle.symptoms",
    });
    expect(shared.status).toBe(200);
    const note = await noteOf(shared);
    sharedId = note.id;
    expect(note).toMatchObject({ category: "cycle.symptoms", version: 4, body: CHANGED_TEXT });
    expect(await auditRows(ANNA)).toEqual([
      { actorId: ANNA, action: "note.share", category: "cycle.symptoms", dedupeKey: null },
    ]);

    const byId = await get(`/notes/${sharedId}`, TOKENS.ben);
    expect(byId.status).toBe(200);
    expect(await rawKeysOf(byId)).toEqual([...NOTE_KEYS].sort());
    const seen = await noteOf(byId);
    expect(seen.body).toBe(CHANGED_TEXT);
    expect(seen.category).toBe("cycle.symptoms");

    const listResponse = await get(`/notes?subject=${ANNA}`, TOKENS.ben);
    expect(await rawItemKeysOf(listResponse)).toEqual([[...NOTE_KEYS].sort()]);
    const list = NoteList.parse(await listResponse.json());
    expect(list.items.map((item) => item.id)).toEqual([sharedId]);
    expect(list.items.every((item) => item.category === "cycle.symptoms")).toBe(true);
    // Two reads of one category on one day collapse to one audit row, in Anna's zone.
    const day = todayIn(ANNA_TIME_ZONE);
    expect(await auditRows(ANNA)).toEqual([
      { actorId: ANNA, action: "note.share", category: "cycle.symptoms", dedupeKey: null },
      {
        actorId: BEN,
        action: "partner.read",
        category: "cycle.symptoms",
        dedupeKey: `${BEN}/${ANNA}/cycle.symptoms/${day}`,
      },
    ]);
  });

  it("with a summary level learns the note exists and nothing of its body", async () => {
    const summaryKeys = NOTE_KEYS.filter((key) => key !== "body").sort();
    const listResponse = await get(`/notes?subject=${ANNA}`, TOKENS.cara);
    expect(await rawItemKeysOf(listResponse)).toEqual([summaryKeys]);
    const list = NoteList.parse(await listResponse.json());
    expect(list.items.map((item) => item.id)).toEqual([sharedId]);
    expect(list.items[0]).not.toHaveProperty("body");
    const byId = await get(`/notes/${sharedId}`, TOKENS.cara);
    expect(byId.status).toBe(200);
    expect(await rawKeysOf(byId)).toEqual(summaryKeys);
    expect(await byId.text()).not.toContain("noon");
    expect((await auditRows(ANNA)).filter((row) => row.actorId === CARA)).toHaveLength(1);
  });

  it("audits no read for a category whose sync page held only tombstones", async () => {
    // Inserted by hand: deletes are hard (architecture 11), so no route writes a tombstone today.
    await fixture.harness.db.insert(schema.notes).values({
      id: TOMBSTONE_ID,
      subjectId: ANNA,
      authorId: ANNA,
      category: "pregnancy.overview",
      date: "2026-10-05",
      body: (await rowOf(sharedId))!.body,
      kekVersion: "test",
      deletedAt: new Date(),
    });
    const feed = await get(
      `/notes?subject=${ANNA}&updatedSince=2000-01-01T00:00:00.000Z`,
      TOKENS.ben,
    );
    expect(feed.status).toBe(200);
    const items = NoteList.parse(await feed.json()).items;
    expect(items.find((item) => item.id === TOMBSTONE_ID)).not.toHaveProperty("body");
    const reads = (await auditRows(ANNA)).filter(
      (row) => row.actorId === BEN && row.action === "partner.read",
    );
    expect(reads.map((row) => row.category)).toEqual(["cycle.symptoms"]);
    await fixture.harness.db.delete(schema.notes).where(eq(schema.notes.id, TOMBSTONE_ID));
  });

  it("with read access cannot change, share or delete the note", async () => {
    const change = await put(`/notes/${sharedId}`, TOKENS.ben, 4, { body: "mine now" });
    expect(change.status).toBe(404);
    await problemOf(change);
    const reshare = await post(`/notes/${sharedId}/share`, TOKENS.ben, KEYS.partnerShare, {
      category: "pregnancy.overview",
    });
    expect(reshare.status).toBe(404);
    await problemOf(reshare);
    const gone = await remove(`/notes/${sharedId}`, TOKENS.ben);
    expect(gone.status).toBe(404);
    await problemOf(gone);
    expect(await plaintextOf(sharedId, ANNA)).toBe(CHANGED_TEXT);
    expect((await rowOf(sharedId))?.category).toBe("cycle.symptoms");
  });

  it("with contribute access writes a note about her under that category, audited, and never a private one", async () => {
    const privateAttempt = await post("/notes", TOKENS.ben, KEYS.partnerPrivate, {
      subject: ANNA,
      date: "2026-10-07",
      body: PARTNER_TEXT,
    });
    expect(privateAttempt.status).toBe(404);
    await problemOf(privateAttempt);

    const created = await post("/notes", TOKENS.ben, KEYS.partnerCreate, {
      subject: ANNA,
      date: "2026-10-07",
      category: "pregnancy.overview",
      body: PARTNER_TEXT,
    });
    expect(created.status).toBe(201);
    const note = await noteOf(created);
    partnerId = note.id;
    expect(note).toMatchObject({
      subjectId: ANNA,
      authorId: BEN,
      category: "pregnancy.overview",
      body: PARTNER_TEXT,
    });
    // Sealed under Anna's key, not Ben's: she keeps it when his access ends.
    expect(await plaintextOf(partnerId, ANNA)).toBe(PARTNER_TEXT);

    const changed = await put(`/notes/${partnerId}`, TOKENS.ben, 1, { body: "scan moved" });
    expect(changed.status).toBe(200);
    expect((await noteOf(changed)).version).toBe(2);

    const hers = await get(`/notes/${partnerId}`, TOKENS.anna);
    expect(hers.status).toBe(200);
    expect((await noteOf(hers)).body).toBe("scan moved");

    const writes = (await auditRows(ANNA)).filter((row) => row.action === "partner.write");
    expect(writes).toEqual([
      { actorId: BEN, action: "partner.write", category: "pregnancy.overview", dedupeKey: null },
      { actorId: BEN, action: "partner.write", category: "pregnancy.overview", dedupeKey: null },
    ]);
  });

  it("whose grant is revoked, and a stranger, both get 404 and an unreachable subject", async () => {
    await fixture.harness.db
      .update(schema.grants)
      .set({ revokedAt: new Date() })
      .where(eq(schema.grants.id, NOTE_GRANTS.caraSummarySymptoms));
    const list = await get(`/notes?subject=${ANNA}`, TOKENS.cara);
    expect(list.status).toBe(404);
    expect((await problemOf(list)).code).toBe("not_found");
    const byId = await get(`/notes/${sharedId}`, TOKENS.cara);
    expect(byId.status).toBe(404);
    await problemOf(byId);
    const write = await post("/notes", TOKENS.cara, KEYS.caraCreate, {
      subject: ANNA,
      date: "2026-10-07",
      category: "cycle.symptoms",
      body: "x",
    });
    expect(write.status).toBe(404);
    await problemOf(write);

    // Ben's own note is his alone: Anna holds nothing from him.
    const own = await post("/notes", TOKENS.ben, KEYS.benOwn, { date: "2026-10-07", body: "ben" });
    expect(own.status).toBe(201);
    benOwnId = (await noteOf(own)).id;
    expect((await get(`/notes/${benOwnId}`, TOKENS.anna)).status).toBe(404);
    expect((await get(`/notes?subject=${BEN}`, TOKENS.anna)).status).toBe(404);
    expect((await put(`/notes/${benOwnId}`, TOKENS.anna, 1, { body: "x" })).status).toBe(404);
    expect((await remove(`/notes/${benOwnId}`, TOKENS.anna)).status).toBe(404);
    expect(await auditRows(BEN)).toEqual([]);
  });
});

describe("sharing", () => {
  it("honours If-Match when sent, is a no-op for the same category and never files a note as private", async () => {
    const stale = await post(
      `/notes/${sharedId}/share`,
      TOKENS.anna,
      KEYS.shareStale,
      { category: "pregnancy.overview" },
      { "If-Match": "1" },
    );
    expect(stale.status).toBe(409);
    await problemOf(stale);

    const before = (await auditRows(ANNA)).length;
    const same = await post(`/notes/${sharedId}/share`, TOKENS.anna, KEYS.shareAgain, {
      category: "cycle.symptoms",
    });
    expect(same.status).toBe(200);
    expect((await noteOf(same)).version).toBe(4);
    expect((await auditRows(ANNA)).length).toBe(before);

    const back = await post(`/notes/${sharedId}/share`, TOKENS.anna, KEYS.third, {
      category: "journal.private",
    });
    expect(back.status).toBe(422);
    expect((await problemOf(back)).errors?.[0]?.path).toBe("category");
  });
});

describe("deleting a note", () => {
  it("is a hard delete by the owner, replayed from the key, and 404 afterwards", async () => {
    const gone = await remove(`/notes/${sharedId}`, TOKENS.anna, KEYS.remove);
    expect(gone.status).toBe(204);
    expect(await rowOf(sharedId)).toBeUndefined();
    const replay = await remove(`/notes/${sharedId}`, TOKENS.anna, KEYS.remove);
    expect(replay.status).toBe(204);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    const after = await get(`/notes/${sharedId}`, TOKENS.anna);
    expect(after.status).toBe(404);
    await problemOf(after);
    const asBen = await get(`/notes/${sharedId}`, TOKENS.ben);
    expect(asBen.status).toBe(404);
    await problemOf(asBen);
    // The idempotency row holds a hash, never the id in a body it could replay content from.
    const [row] = await fixture.harness.db
      .select({
        state: schema.idempotencyKeys.state,
        resourceId: schema.idempotencyKeys.resourceId,
      })
      .from(schema.idempotencyKeys)
      .where(
        and(eq(schema.idempotencyKeys.actorId, ANNA), eq(schema.idempotencyKeys.key, KEYS.remove)),
      );
    expect(row).toEqual({ state: "done", resourceId: null });
  });
});

describe("hygiene", () => {
  it("keeps every note body out of the log lines, the problem messages, the audit rows and the idempotency rows", async () => {
    expect(lines.length).toBeGreaterThan(20);
    expect(problems.length).toBeGreaterThan(10);
    const audits = JSON.stringify(await fixture.harness.db.select().from(schema.auditEvents));
    const keys = JSON.stringify(await fixture.harness.db.select().from(schema.idempotencyKeys));
    const everything = [lines.join("\n"), problems.join("\n"), audits, keys];
    for (const text of everything) {
      for (const word of WORDS) expect(text).not.toContain(word);
      expect(text).not.toContain("scan moved");
      expect(text).not.toContain("first day");
    }
    // The log line names the route template, never a note id or a subject id.
    expect(lines.join("\n")).not.toContain(privateId);
    expect(lines.join("\n")).not.toContain(ANNA);
    expect(lines.some((line) => line.includes('"route":"/api/v1/notes/:id"'))).toBe(true);
  });
});
