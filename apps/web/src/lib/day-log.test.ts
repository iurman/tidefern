import { createApiClient } from "@tidefern/api-client";
import type { CycleEntry, Note } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  allSaved,
  changedParts,
  dayFingerprint,
  dayLogKey,
  dayNeighbours,
  dayStateFrom,
  deleteNote,
  draftFrom,
  emptyDay,
  entryWriteFrom,
  isEmptyPlan,
  isLoggingStage,
  isOlderDay,
  isSignedOut,
  loadDay,
  periodOn,
  planSave,
  planUndo,
  runPlan,
  sameDraft,
  shareCategoryFor,
  shareNote,
  withPeriod,
  type DayDraft,
  type DayState,
} from "./day-log";

const date = "2026-10-05";
const subjectId = "018f5e7a-5eed-7000-8000-000000000001";
const noteId = "018f5e7a-5eed-7040-8000-000000000001";
const newNoteId = "018f5e7a-5eed-7040-8000-00000000000a";

function entry(patch: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: "018f5e7a-5eed-7010-8000-000000000001",
    subjectId,
    date,
    flow: "medium",
    period: true,
    symptoms: ["cramps"],
    mood: "steady",
    version: 3,
    updatedAt: "2026-10-05T08:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

function note(patch: Partial<Note> = {}): Note {
  return {
    id: noteId,
    subjectId,
    authorId: subjectId,
    category: "journal.private",
    date,
    body: "Slept badly.",
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
    version: 1,
    ...patch,
  };
}

/** A day with an entry at version 3 and a private note at version 1. */
const logged: DayState = {
  date,
  entry: {
    status: "live",
    version: 3,
    values: { flow: "medium", symptoms: ["cramps"], mood: "steady" },
  },
  note: { status: "saved", id: noteId, body: "Slept badly.", version: 1 },
  others: [],
};

function draft(patch: Partial<DayDraft> = {}): DayDraft {
  return { ...draftFrom(logged), ...patch };
}

/* ------------------------------------------------------------------------ */
/* A fake API behind the real typed client                                   */
/* ------------------------------------------------------------------------ */

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

type Answer = Response | (() => Response) | "network-error";

/** Routes "METHOD /path" to answers, served in order; every request is recorded. */
function fakeApi(routes: Record<string, Answer[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([key, answers]) => [key, [...answers]]));
  const client = createApiClient({
    baseUrl: "http://tidefern.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      const text = await request.text();
      calls.push({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers,
        body: text === "" ? undefined : JSON.parse(text),
      });
      const next = queues.get(`${request.method} ${url.pathname}`)?.shift();
      if (next === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
      if (next === "network-error") throw new TypeError("Failed to fetch");
      return typeof next === "function" ? next() : next;
    },
  });
  return { client, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });
const empty = (status: number) => new Response(null, { status });
const problem = (status: number, detail?: string) =>
  Response.json(
    { type: "urn:tidefern:problem:conflict", title: "Conflict", status, code: "conflict", detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
const entriesPath = "/api/v1/cycle/entries";
const entryPath = `/api/v1/cycle/entries/${date}`;
const notesPath = "/api/v1/notes";
const notePath = (id: string) => `/api/v1/notes/${id}`;

/* ------------------------------------------------------------------------ */
/* From the API to the sheet                                                 */
/* ------------------------------------------------------------------------ */

describe("dayStateFrom", () => {
  it("keeps the live entry, makes the first private note editable and lists every other note", () => {
    const shared = note({ id: "018f5e7a-5eed-7040-8000-000000000002", category: "cycle.symptoms" });
    const elsewhere = note({ id: "018f5e7a-5eed-7040-8000-000000000003", date: "2026-10-04" });
    const day = dayStateFrom(
      date,
      [entry({ symptoms: ["fatigue", "cramps"] })],
      [note(), shared, elsewhere],
    );
    expect(day.entry).toEqual({
      status: "live",
      version: 3,
      values: { flow: "medium", symptoms: ["cramps", "fatigue"], mood: "steady" },
    });
    expect(day.note).toEqual({ status: "saved", id: noteId, body: "Slept badly.", version: 1 });
    expect(day.others).toEqual([shared]);
  });

  it("reads a tombstone, another day or no rows as nothing logged", () => {
    const day = dayStateFrom(
      date,
      [entry({ deletedAt: "2026-10-05T09:00:00.000Z" }), entry({ date: "2026-10-04" })],
      [],
    );
    expect(day).toEqual(emptyDay(date));
    expect(draftFrom(day)).toEqual(EMPTY_DRAFT);
  });

  it("leaves a shared note out of the field even when it is the only note", () => {
    const shared = note({ category: "cycle.symptoms" });
    const day = dayStateFrom(date, [], [shared]);
    expect(day.note).toEqual({ status: "none" });
    expect(day.others).toEqual([shared]);
    expect(draftFrom(day).note).toBe("");
  });
});

describe("the Period switch", () => {
  it("picks Medium when turned on, unless a period flow is already chosen", () => {
    expect(withPeriod(EMPTY_DRAFT, true).flow).toBe("medium");
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "spotting" }, true).flow).toBe("medium");
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "none" }, true).flow).toBe("medium");
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "heavy" }, true).flow).toBe("heavy");
  });

  it("clears only a period flow when turned off, to unset", () => {
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "light" }, false).flow).toBeNull();
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "spotting" }, false).flow).toBe("spotting");
    expect(withPeriod({ ...EMPTY_DRAFT, flow: "none" }, false).flow).toBe("none");
    expect(withPeriod(EMPTY_DRAFT, false).flow).toBeNull();
  });

  it("reads a period day from the flow alone", () => {
    expect(periodOn({ flow: "light" })).toBe(true);
    expect(periodOn({ flow: "spotting" })).toBe(false);
    expect(periodOn({ flow: null })).toBe(false);
  });
});

describe("planSave", () => {
  it("writes all three fields every time, because the PUT clears a field left out", () => {
    expect(entryWriteFrom({ flow: null, symptoms: [], mood: null })).toEqual({
      flow: null,
      symptoms: [],
      mood: null,
    });
    const plan = planSave(emptyDay(date), { ...EMPTY_DRAFT, flow: "medium" }, newNoteId);
    expect(plan.entry).toEqual({
      kind: "put",
      values: { flow: "medium", symptoms: [], mood: null },
      ifMatch: null,
    });
    expect(plan.note).toBeNull();
  });

  it("matches the entry's version as a string", () => {
    const plan = planSave(logged, draft({ mood: "low" }), newNoteId);
    expect(plan.entry).toEqual({
      kind: "put",
      values: { flow: "medium", symptoms: ["cramps"], mood: "low" },
      ifMatch: "3",
    });
    expect(typeof (plan.entry as { ifMatch: unknown }).ifMatch).toBe("string");
  });

  it("deletes the day once the draft empties, and writes nothing for an empty new day", () => {
    const cleared = planSave(logged, draft({ flow: null, symptoms: [], mood: null }), newNoteId);
    expect(cleared.entry).toEqual({ kind: "delete", ifMatch: "3" });
    expect(planSave(emptyDay(date), EMPTY_DRAFT, newNoteId)).toEqual({
      date,
      entry: null,
      note: null,
    });
  });

  it("keeps an explicit None: a day of no bleeding is not an empty day", () => {
    const plan = planSave(logged, draft({ flow: "none", symptoms: [], mood: null }), newNoteId);
    expect(plan.entry).toEqual({
      kind: "put",
      values: { flow: "none", symptoms: [], mood: null },
      ifMatch: "3",
    });
  });

  it("sends nothing for what did not change, symptoms compared as a set", () => {
    const reordered = { ...logged, entry: { ...logged.entry } } as DayState;
    expect(planSave(reordered, draft({ symptoms: ["cramps"] }), newNoteId)).toEqual({
      date,
      entry: null,
      note: null,
    });
    const two: DayState = {
      ...logged,
      entry: {
        status: "live",
        version: 3,
        values: { flow: "medium", symptoms: ["cramps", "fatigue"], mood: "steady" },
      },
    };
    expect(planSave(two, draft({ symptoms: ["fatigue", "cramps"] }), newNoteId).entry).toBeNull();
  });

  it("revives a tombstone it wrote with that tombstone's version", () => {
    const deleted: DayState = { ...logged, entry: { status: "deleted", version: 4 } };
    expect(planSave(deleted, draft(), newNoteId).entry).toEqual({
      kind: "put",
      values: { flow: "medium", symptoms: ["cramps"], mood: "steady" },
      ifMatch: "4",
    });
  });

  it("creates, updates with an integer version, or deletes the private note", () => {
    const fresh = emptyDay(date);
    expect(planSave(fresh, { ...EMPTY_DRAFT, note: "New" }, newNoteId).note).toEqual({
      kind: "create",
      id: newNoteId,
      body: "New",
    });
    expect(planSave(fresh, { ...EMPTY_DRAFT, note: "   " }, newNoteId).note).toBeNull();
    const update = planSave(logged, draft({ note: "Slept badly. Better now." }), newNoteId).note;
    expect(update).toEqual({
      kind: "update",
      id: noteId,
      body: "Slept badly. Better now.",
      ifMatch: 1,
    });
    expect(typeof (update as { ifMatch: unknown }).ifMatch).toBe("number");
    expect(planSave(logged, draft({ note: "" }), newNoteId).note).toEqual({
      kind: "delete",
      id: noteId,
    });
    expect(planSave(logged, draft(), newNoteId).note).toBeNull();
  });

  it("says which parts differ", () => {
    expect(changedParts(logged, draft())).toEqual({ entry: false, note: false });
    expect(changedParts(logged, draft({ mood: null }))).toEqual({ entry: true, note: false });
    expect(changedParts(logged, draft({ note: " " }))).toEqual({ entry: false, note: true });
    expect(sameDraft({ ...EMPTY_DRAFT, note: "" }, { ...EMPTY_DRAFT, note: "  " })).toBe(true);
  });
});

describe("planUndo", () => {
  it("deletes a day the save created, with the new version", () => {
    const after: DayState = {
      ...emptyDay(date),
      entry: { status: "live", version: 1, values: { flow: "medium", symptoms: [], mood: null } },
    };
    expect(planUndo(emptyDay(date), after)).toEqual({
      date,
      entry: { kind: "delete", ifMatch: "1" },
      note: null,
    });
  });

  it("puts the previous values back with the new version's If-Match", () => {
    const after: DayState = {
      ...logged,
      entry: { status: "live", version: 4, values: { flow: "heavy", symptoms: [], mood: null } },
    };
    expect(planUndo(logged, after).entry).toEqual({
      kind: "put",
      values: { flow: "medium", symptoms: ["cramps"], mood: "steady" },
      ifMatch: "4",
    });
  });

  it("brings back a day the save deleted, matching the tombstone it left", () => {
    const deleted: DayState = { ...logged, entry: { status: "deleted", version: 4 } };
    expect(planUndo(logged, deleted).entry).toEqual({
      kind: "put",
      values: { flow: "medium", symptoms: ["cramps"], mood: "steady" },
      ifMatch: "4",
    });
    const gone: DayState = { ...logged, entry: { status: "none" } };
    expect(planUndo(logged, gone).entry).toMatchObject({ kind: "put", ifMatch: null });
  });

  it("undoes a note: deletes a new one, restores old text, writes a deleted one again", () => {
    const created: DayState = {
      ...emptyDay(date),
      note: { status: "saved", id: newNoteId, body: "New", version: 1 },
    };
    expect(planUndo(emptyDay(date), created).note).toEqual({ kind: "delete", id: newNoteId });
    const edited: DayState = {
      ...logged,
      note: { status: "saved", id: noteId, body: "Edited", version: 2 },
    };
    expect(planUndo(logged, edited).note).toEqual({
      kind: "update",
      id: noteId,
      body: "Slept badly.",
      ifMatch: 2,
    });
    expect(planUndo(logged, { ...logged, note: { status: "none" } }).note).toEqual({
      kind: "create",
      id: noteId,
      body: "Slept badly.",
    });
  });

  it("has nothing to undo when nothing changed", () => {
    expect(isEmptyPlan(planUndo(logged, logged))).toBe(true);
  });
});

describe("the small rules", () => {
  it("moves by a day, never past today", () => {
    expect(dayNeighbours("2026-10-05", "2026-10-05")).toEqual({
      previous: "2026-10-04",
      next: null,
    });
    expect(dayNeighbours("2026-09-30", "2026-10-05")).toEqual({
      previous: "2026-09-29",
      next: "2026-10-01",
    });
    expect(() => dayNeighbours("2026-02-30x", "2026-10-05")).toThrow();
  });

  it("keys the draft by the date, the entry version and the reseed count", () => {
    expect(dayLogKey(date, logged.entry, 2)).toBe("2026-10-05:3:2");
    expect(dayLogKey(date, { status: "none" }, 0)).toBe("2026-10-05:0:0");
  });

  it("files a shared note by stage and never logs for the none stage", () => {
    expect(shareCategoryFor("pregnancy")).toBe("pregnancy.overview");
    expect(shareCategoryFor("cycle")).toBe("cycle.symptoms");
    expect(shareCategoryFor("postpartum")).toBe("cycle.symptoms");
    expect(isLoggingStage("none")).toBe(false);
    expect(isLoggingStage(null)).toBe(false);
    expect(isLoggingStage("postpartum")).toBe(true);
  });

  it("tells an older read of a day from a newer one", () => {
    const newer: DayState = {
      ...logged,
      entry: { status: "live", version: 5, values: { flow: null, symptoms: [], mood: "low" } },
    };
    expect(isOlderDay(logged, newer)).toBe(true);
    expect(isOlderDay(newer, logged)).toBe(false);
    expect(dayFingerprint(logged)).not.toBe(dayFingerprint(newer));
    const staleNote: DayState = {
      ...logged,
      note: { status: "saved", id: noteId, body: "Old", version: 0 },
    };
    expect(isOlderDay(staleNote, logged)).toBe(true);
  });

  it("reads the same day the same whatever order the shared notes arrive in", () => {
    const first = note({ id: "018f5e7a-5eed-7040-8000-000000000002", category: "cycle.symptoms" });
    const second = note({ id: "018f5e7a-5eed-7040-8000-000000000003", category: "cycle.symptoms" });
    expect(dayFingerprint({ ...logged, others: [first, second] })).toBe(
      dayFingerprint({ ...logged, others: [second, first] }),
    );
  });
});

/* ------------------------------------------------------------------------ */
/* Calls                                                                     */
/* ------------------------------------------------------------------------ */

describe("runPlan: the entry", () => {
  it("PUTs all three fields with If-Match as the version string and no idempotency key", async () => {
    const { client, calls } = fakeApi({
      [`PUT ${entryPath}`]: [json(entry({ mood: "low", version: 4 }), 200, { etag: '"4"' })],
    });
    const plan = planSave(logged, draft({ mood: "low" }), newNoteId);
    const result = await runPlan(client, logged, plan);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("if-match")).toBe("3");
    expect(calls[0]?.headers.get("idempotency-key")).toBeNull();
    expect(calls[0]?.body).toEqual({ flow: "medium", symptoms: ["cramps"], mood: "low" });
    expect(result.entry).toEqual({ outcome: "saved" });
    expect(result.note).toEqual({ outcome: "unchanged" });
    expect(result.day.entry).toEqual({
      status: "live",
      version: 4,
      values: { flow: "medium", symptoms: ["cramps"], mood: "low" },
    });
  });

  it("reads the day again on 409 version_mismatch and reports a conflict", async () => {
    const { client, calls } = fakeApi({
      [`PUT ${entryPath}`]: [problem(409, "version_mismatch")],
      [`GET ${entriesPath}`]: [
        json({ items: [entry({ flow: "heavy", version: 5 })], nextCursor: null }),
      ],
    });
    const result = await runPlan(
      client,
      logged,
      planSave(logged, draft({ mood: "low" }), newNoteId),
    );
    expect(result.entry).toEqual({ outcome: "conflict" });
    expect(calls[1]?.query.get("from")).toBe(date);
    expect(calls[1]?.query.get("to")).toBe(date);
    expect([...(calls[1]?.query.keys() ?? [])].sort()).toEqual(["from", "to"]);
    expect(result.day.entry).toMatchObject({ status: "live", version: 5 });
  });

  it("DELETEs an emptied day and remembers the tombstone's version", async () => {
    const { client, calls } = fakeApi({ [`DELETE ${entryPath}`]: [empty(204)] });
    const plan = planSave(logged, draft({ flow: null, symptoms: [], mood: null }), newNoteId);
    const result = await runPlan(client, logged, plan);
    expect(calls[0]?.headers.get("if-match")).toBe("3");
    expect(result.entry).toEqual({ outcome: "saved" });
    expect(result.day.entry).toEqual({ status: "deleted", version: 4 });
  });

  it("counts a day already gone as deleted", async () => {
    const { client } = fakeApi({ [`DELETE ${entryPath}`]: [problem(404)] });
    const plan = planSave(logged, draft({ flow: null, symptoms: [], mood: null }), newNoteId);
    const result = await runPlan(client, logged, plan);
    expect(result.entry).toEqual({ outcome: "saved" });
    expect(result.day.entry).toEqual({ status: "none" });
  });

  it("reports a request that never got an answer as failed with status 0", async () => {
    const { client } = fakeApi({ [`PUT ${entryPath}`]: ["network-error"] });
    const result = await runPlan(
      client,
      logged,
      planSave(logged, draft({ mood: "low" }), newNoteId),
    );
    expect(result.entry).toEqual({ outcome: "failed", status: 0 });
    expect(result.day).toEqual(logged);
  });

  it("reports an ended session so the sheet can say so instead of Try again", async () => {
    const { client } = fakeApi({ [`PUT ${entryPath}`]: [problem(401)] });
    const result = await runPlan(
      client,
      logged,
      planSave(logged, draft({ mood: "low" }), newNoteId),
    );
    expect(isSignedOut(result.entry)).toBe(true);
  });
});

describe("runPlan: the note", () => {
  it("creates a private note with the id the controller minted", async () => {
    const created = note({ id: newNoteId, body: "New" });
    const { client, calls } = fakeApi({ [`POST ${notesPath}`]: [json(created, 201)] });
    const fresh = emptyDay(date);
    const result = await runPlan(
      client,
      fresh,
      planSave(fresh, { ...EMPTY_DRAFT, note: "New" }, newNoteId),
    );
    expect(calls[0]?.body).toEqual({
      id: newNoteId,
      date,
      category: "journal.private",
      body: "New",
    });
    expect(calls[0]?.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.note).toEqual({ outcome: "saved" });
    expect(result.day.note).toEqual({ status: "saved", id: newNoteId, body: "New", version: 1 });
  });

  it("reads the note again after an id-only idempotent replay", async () => {
    const { client, calls } = fakeApi({
      [`POST ${notesPath}`]: [json({ id: newNoteId }, 201, { "idempotency-replayed": "true" })],
      [`GET ${notePath(newNoteId)}`]: [json(note({ id: newNoteId, body: "New", version: 1 }))],
    });
    const fresh = emptyDay(date);
    const result = await runPlan(
      client,
      fresh,
      planSave(fresh, { ...EMPTY_DRAFT, note: "New" }, newNoteId),
    );
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${notesPath}`,
      `GET ${notePath(newNoteId)}`,
    ]);
    expect(result.note).toEqual({ outcome: "saved" });
    expect(result.day.note).toMatchObject({ status: "saved", id: newNoteId, version: 1 });
  });

  it("meets its own earlier attempt on a taken id and brings it up to the draft", async () => {
    const { client, calls } = fakeApi({
      [`POST ${notesPath}`]: [problem(409)],
      [`GET ${notePath(newNoteId)}`]: [json(note({ id: newNoteId, body: "Old text", version: 1 }))],
      [`PUT ${notePath(newNoteId)}`]: [json(note({ id: newNoteId, body: "New text", version: 2 }))],
    });
    const fresh = emptyDay(date);
    const result = await runPlan(
      client,
      fresh,
      planSave(fresh, { ...EMPTY_DRAFT, note: "New text" }, newNoteId),
    );
    expect(calls[2]?.headers.get("if-match")).toBe("1");
    expect(calls[2]?.body).toEqual({ body: "New text" });
    expect(result.note).toEqual({ outcome: "saved" });
    expect(result.day.note).toEqual({
      status: "saved",
      id: newNoteId,
      body: "New text",
      version: 2,
    });
  });

  it("updates with If-Match as the integer version and reads again on a 409", async () => {
    const { client, calls } = fakeApi({
      [`PUT ${notePath(noteId)}`]: [problem(409)],
      [`GET ${notePath(noteId)}`]: [json(note({ body: "Edited elsewhere", version: 2 }))],
    });
    const result = await runPlan(
      client,
      logged,
      planSave(logged, draft({ note: "Mine" }), newNoteId),
    );
    expect(calls[0]?.headers.get("if-match")).toBe("1");
    expect(result.note).toEqual({ outcome: "conflict" });
    expect(result.day.note).toEqual({
      status: "saved",
      id: noteId,
      body: "Edited elsewhere",
      version: 2,
    });
  });

  it("deletes a note whose field was emptied, and counts one already gone as deleted", async () => {
    const { client } = fakeApi({ [`DELETE ${notePath(noteId)}`]: [empty(204)] });
    const result = await runPlan(client, logged, planSave(logged, draft({ note: "" }), newNoteId));
    expect(result.note).toEqual({ outcome: "saved" });
    expect(result.day.note).toEqual({ status: "none" });
    const gone = fakeApi({ [`DELETE ${notePath(noteId)}`]: [problem(404)] });
    const again = await runPlan(
      gone.client,
      logged,
      planSave(logged, draft({ note: "" }), newNoteId),
    );
    expect(again.note).toEqual({ outcome: "saved" });
  });
});

describe("runPlan: results per part", () => {
  it("answers entry saved, note failed, and keeps the old note for Try again", async () => {
    const { client } = fakeApi({
      [`PUT ${entryPath}`]: [json(entry({ mood: "low", version: 4 }))],
      [`PUT ${notePath(noteId)}`]: [json({ code: "internal" }, 500)],
    });
    const plan = planSave(logged, draft({ mood: "low", note: "New text" }), newNoteId);
    const result = await runPlan(client, logged, plan);
    expect(result.entry).toEqual({ outcome: "saved" });
    expect(result.note).toEqual({ outcome: "failed", status: 500 });
    expect(allSaved(result.entry, result.note)).toBe(false);
    expect(result.day.entry).toMatchObject({ version: 4 });
    expect(result.day.note).toEqual(logged.note);
    // Try again plans only the part that is still different.
    const retry = planSave(result.day, draft({ mood: "low", note: "New text" }), newNoteId);
    expect(retry.entry).toBeNull();
    expect(retry.note).toMatchObject({ kind: "update", ifMatch: 1 });
  });

  it("undoes a save with compensating writes", async () => {
    const after: DayState = {
      ...logged,
      entry: { status: "live", version: 4, values: { flow: "heavy", symptoms: [], mood: null } },
      note: { status: "saved", id: noteId, body: "Edited", version: 2 },
    };
    const { client, calls } = fakeApi({
      [`PUT ${entryPath}`]: [json(entry({ version: 5 }))],
      [`PUT ${notePath(noteId)}`]: [json(note({ version: 3 }))],
    });
    const result = await runPlan(client, after, planUndo(logged, after));
    const entryCall = calls.find((call) => call.path === entryPath);
    expect(entryCall?.headers.get("if-match")).toBe("4");
    expect(entryCall?.body).toEqual({ flow: "medium", symptoms: ["cramps"], mood: "steady" });
    expect(calls.find((call) => call.path === notePath(noteId))?.body).toEqual({
      body: "Slept badly.",
    });
    expect(allSaved(result.entry, result.note)).toBe(true);
  });
});

describe("loadDay", () => {
  it("reads the day's entries and notes with dates only in the query", async () => {
    const { client, calls } = fakeApi({
      [`GET ${entriesPath}`]: [json({ items: [entry()], nextCursor: null })],
      [`GET ${notesPath}`]: [json({ items: [note()], nextCursor: null })],
    });
    const result = await loadDay(client, date);
    expect(result).toEqual({ ok: true, day: logged });
    for (const call of calls) {
      expect(Object.fromEntries(call.query)).toEqual({ from: date, to: date });
    }
  });

  it("fails as a whole when either read fails, with its status", async () => {
    const { client } = fakeApi({
      [`GET ${entriesPath}`]: [json({ items: [], nextCursor: null })],
      [`GET ${notesPath}`]: [json({ code: "internal" }, 500)],
    });
    expect(await loadDay(client, date)).toEqual({ ok: false, status: 500 });
  });
});

describe("shareNote", () => {
  it("re-files the saved note with its version and moves it to the shared notes", async () => {
    const shared = note({ category: "cycle.symptoms", version: 2 });
    const { client, calls } = fakeApi({ [`POST ${notePath(noteId)}/share`]: [json(shared)] });
    const { day, result } = await shareNote(client, logged, "cycle.symptoms");
    expect(calls[0]?.headers.get("if-match")).toBe("1");
    expect(calls[0]?.body).toEqual({ category: "cycle.symptoms" });
    expect(result).toEqual({ outcome: "saved" });
    expect(day.note).toEqual({ status: "none" });
    expect(day.others).toEqual([shared]);
  });

  it("reads the note after an id-only replay", async () => {
    const shared = note({ category: "pregnancy.overview", version: 2 });
    const { client } = fakeApi({
      [`POST ${notePath(noteId)}/share`]: [
        json({ id: noteId }, 200, { "idempotency-replayed": "true" }),
      ],
      [`GET ${notePath(noteId)}`]: [json(shared)],
    });
    const { day, result } = await shareNote(client, logged, "pregnancy.overview");
    expect(result).toEqual({ outcome: "saved" });
    expect(day.others).toEqual([shared]);
  });

  it("reads the note again when its version moved, and shares nothing", async () => {
    const { client } = fakeApi({
      [`POST ${notePath(noteId)}/share`]: [problem(409)],
      [`GET ${notePath(noteId)}`]: [json(note({ body: "Edited elsewhere", version: 2 }))],
    });
    const { day, result } = await shareNote(client, logged, "cycle.symptoms");
    expect(result).toEqual({ outcome: "conflict" });
    expect(day.note).toEqual({ status: "saved", id: noteId, body: "Edited elsewhere", version: 2 });
  });

  it("has nothing to share without a saved note", async () => {
    const { client, calls } = fakeApi({});
    const { result } = await shareNote(client, emptyDay(date), "cycle.symptoms");
    expect(result).toEqual({ outcome: "unchanged" });
    expect(calls).toHaveLength(0);
  });
});

describe("deleteNote", () => {
  it("removes a shared note, and one already gone too", async () => {
    const shared = note({ id: "018f5e7a-5eed-7040-8000-000000000002", category: "cycle.symptoms" });
    const day: DayState = { ...logged, others: [shared] };
    const { client } = fakeApi({ [`DELETE ${notePath(shared.id)}`]: [empty(204), problem(404)] });
    const first = await deleteNote(client, day, shared.id);
    expect(first.result).toEqual({ outcome: "saved" });
    expect(first.day.others).toEqual([]);
    const second = await deleteNote(client, day, shared.id);
    expect(second.result).toEqual({ outcome: "saved" });
  });

  it("keeps the note and reports a failure", async () => {
    const shared = note({ id: "018f5e7a-5eed-7040-8000-000000000002", category: "cycle.symptoms" });
    const day: DayState = { ...logged, others: [shared] };
    const { client } = fakeApi({ [`DELETE ${notePath(shared.id)}`]: [json({}, 500)] });
    const { day: after, result } = await deleteNote(client, day, shared.id);
    expect(result).toEqual({ outcome: "failed", status: 500 });
    expect(after.others).toEqual([shared]);
  });
});
