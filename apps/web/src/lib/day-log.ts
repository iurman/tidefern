import type { ApiClient } from "@tidefern/api-client";
import { addDays, compareDates, isCalendarDate } from "@tidefern/core";
import { SYMPTOM_CODES, isPeriodFlow } from "@tidefern/schemas";
import type {
  CycleEntry,
  CycleEntryWrite,
  FlowLevel,
  MoodCode,
  Note,
  NoteShareCategory,
  Stage,
  SymptomCode,
} from "@tidefern/schemas";

/**
 * The day-logging contract Today and Calendar share (DESIGN.md 5.1): what a
 * day looks like to the sheet, the rules that turn a draft into the E3 and
 * E6 calls, the ten-second Undo as compensating writes, and the calls
 * themselves over the typed client with their results per part. Nothing
 * here touches the DOM, the browser clock or React, so a server component
 * can load a day with `loadDay(serverApiClient(...), date)` and the client
 * controller can save it with the browser client.
 *
 * Two traps decide most of the shapes below. PUT /v1/cycle/entries/{date}
 * clears every field left out (cycle.ts, "a field left out is cleared"), so
 * every entry write carries flow, symptoms and mood. If-Match is a string
 * for an entry (its header is an entity tag) and an integer for a note.
 */

/** The stages that log a day; `none` is never asked a body question, so it has no sheet. */
export type LoggingStage = Exclude<Stage, "none">;

export function isLoggingStage(stage: Stage | null | undefined): stage is LoggingStage {
  return stage === "cycle" || stage === "pregnancy" || stage === "postpartum";
}

/** A day entry's three fields as the API stores them; null is unset. */
export interface EntryValues {
  flow: FlowLevel | null;
  symptoms: SymptomCode[];
  mood: MoodCode | null;
}

/** What the sheet edits: the entry's fields and the private note's text. */
export interface DayDraft extends EntryValues {
  note: string;
}

/** The entry as this client last knew it on the server. */
export type EntryState =
  | { status: "none" }
  | { status: "live"; version: number; values: EntryValues }
  /** A tombstone this client wrote; the API gives it the old version plus one. */
  | { status: "deleted"; version: number };

/** The private note the sheet edits, as this client last knew it. */
export type NoteState =
  { status: "none" } | { status: "saved"; id: string; body: string; version: number };

/** One day as the sheet sees it. */
export interface DayState {
  date: string;
  entry: EntryState;
  /** The first private note of the day: the one the note field edits. */
  note: NoteState;
  /** Every other note on the day (shared ones, a second private one), shown read-only. */
  others: Note[];
}

export const EMPTY_VALUES: EntryValues = { flow: null, symptoms: [], mood: null };
export const EMPTY_DRAFT: DayDraft = { ...EMPTY_VALUES, note: "" };

const weekdayDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Sunday, Oct 5" from a calendar date string, read as a UTC day so no machine zone shifts it. */
export function formatSheetDate(date: string): string {
  if (!isCalendarDate(date)) throw new Error("formatSheetDate expects YYYY-MM-DD");
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return weekdayDate.format(new Date(Date.UTC(year, month - 1, day)));
}

const NO_ENTRY: EntryState = { status: "none" };
const NO_NOTE: NoteState = { status: "none" };

/** Nothing logged and no note: a day the sheet opens empty. */
export function emptyDay(date: string): DayState {
  return { date, entry: NO_ENTRY, note: NO_NOTE, others: [] };
}

/* ------------------------------------------------------------------------ */
/* From the API to the sheet                                                 */
/* ------------------------------------------------------------------------ */

const SYMPTOM_ORDER = new Map<string, number>(SYMPTOM_CODES.map((code, index) => [code, index]));

/** Symptoms in the picker's order, each once, so two drafts compare as sets. */
export function inPickerOrder(symptoms: readonly SymptomCode[]): SymptomCode[] {
  return [...new Set(symptoms)].sort(
    (a, b) => (SYMPTOM_ORDER.get(a) ?? 0) - (SYMPTOM_ORDER.get(b) ?? 0),
  );
}

function valuesOf(entry: CycleEntry): EntryValues {
  return {
    flow: entry.flow ?? null,
    symptoms: inPickerOrder(entry.symptoms ?? []),
    mood: entry.mood ?? null,
  };
}

/** The live entry for `date` in a list answer, or none. */
export function entryStateFrom(date: string, entries: readonly CycleEntry[]): EntryState {
  const live = entries.find((entry) => entry.date === date && entry.deletedAt === null);
  return live === undefined
    ? NO_ENTRY
    : { status: "live", version: live.version, values: valuesOf(live) };
}

/** The private note the field edits holds a body the owner can read. */
function isEditable(note: Note): note is Note & { body: string } {
  return note.category === "journal.private" && note.body !== undefined;
}

/**
 * The day from the two list answers (GET /v1/cycle/entries and GET
 * /v1/notes, both with from and to set to the day): the live entry, the
 * first private note as the editable one, and every other live note of the
 * day as read-only. The lists come oldest first, so "first" is stable.
 */
export function dayStateFrom(
  date: string,
  entries: readonly CycleEntry[],
  notes: readonly Note[],
): DayState {
  const dayNotes = notes.filter((note) => note.date === date && note.deletedAt === undefined);
  const editable = dayNotes.find(isEditable);
  return {
    date,
    entry: entryStateFrom(date, entries),
    note:
      editable === undefined
        ? NO_NOTE
        : { status: "saved", id: editable.id, body: editable.body, version: editable.version },
    others: dayNotes.filter((note) => note !== editable),
  };
}

/** The values the entry holds now, or none. */
export function savedValues(day: DayState): EntryValues {
  return day.entry.status === "live" ? day.entry.values : EMPTY_VALUES;
}

/** The draft a day opens with: what is saved, nothing more. */
export function draftFrom(day: DayState): DayDraft {
  const values = savedValues(day);
  return {
    flow: values.flow,
    symptoms: [...values.symptoms],
    mood: values.mood,
    note: day.note.status === "saved" ? day.note.body : "",
  };
}

/* ------------------------------------------------------------------------ */
/* The period switch                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The flow the Period switch selects when it is turned on (DESIGN.md 5.1,
 * the lead's ruling): visible on the scale and changeable before Save, so
 * one press still logs a period day and only what she saw is written.
 */
export const DEFAULT_PERIOD_FLOW: FlowLevel = "medium";

/** A period day is a day whose flow is light, medium or heavy; the API has no period flag. */
export function periodOn(values: Pick<EntryValues, "flow">): boolean {
  return isPeriodFlow(values.flow);
}

/**
 * The switch's one rule: on selects Medium unless a period flow is already
 * chosen; off clears only a period flow, to unset. Spotting and none are
 * not a period, so the switch is already off for them and they are kept.
 */
export function withPeriod<T extends EntryValues>(draft: T, on: boolean): T {
  if (on) return periodOn(draft) ? draft : { ...draft, flow: DEFAULT_PERIOD_FLOW };
  return periodOn(draft) ? { ...draft, flow: null } : draft;
}

/* ------------------------------------------------------------------------ */
/* Comparing and planning                                                    */
/* ------------------------------------------------------------------------ */

/** No flow, no symptom and no mood: an entry with nothing in it. */
export function isEmptyEntry(values: EntryValues): boolean {
  return values.flow === null && values.symptoms.length === 0 && values.mood === null;
}

export function sameValues(a: EntryValues, b: EntryValues): boolean {
  const left = inPickerOrder(a.symptoms);
  const right = inPickerOrder(b.symptoms);
  return (
    a.flow === b.flow &&
    a.mood === b.mood &&
    left.length === right.length &&
    left.every((code, index) => code === right[index])
  );
}

/** A note of only spaces is no note. */
export function isBlankNote(text: string): boolean {
  return text.trim() === "";
}

/** Which parts of the draft differ from what is saved. */
export function changedParts(day: DayState, draft: DayDraft): { entry: boolean; note: boolean } {
  const savedNote = day.note.status === "saved" ? day.note.body : "";
  const noteChanged = isBlankNote(draft.note)
    ? day.note.status === "saved"
    : draft.note !== savedNote;
  return { entry: !sameValues(savedValues(day), draft), note: noteChanged };
}

export function isDirty(day: DayState, draft: DayDraft): boolean {
  const parts = changedParts(day, draft);
  return parts.entry || parts.note;
}

/** Two drafts say the same thing: the same entry values and the same note, a blank note being none. */
export function sameDraft(a: DayDraft, b: DayDraft): boolean {
  const notesMatch = isBlankNote(a.note) ? isBlankNote(b.note) : a.note === b.note;
  return notesMatch && sameValues(a, b);
}

/** The entry's three fields alone, symptoms in picker order: a draft without its note. */
export function entryValuesOf(values: EntryValues): EntryValues {
  return { flow: values.flow, symptoms: inPickerOrder(values.symptoms), mood: values.mood };
}

/** The write body: all three fields every time, because the PUT clears a field left out. */
export function entryWriteFrom(values: EntryValues): CycleEntryWrite {
  const { flow, symptoms, mood } = entryValuesOf(values);
  return { flow, symptoms, mood };
}

/** One write to the day's entry. `ifMatch` is the version as a string, the header's own form. */
export type EntryOp =
  | { kind: "put"; values: EntryValues; ifMatch: string | null }
  | { kind: "delete"; ifMatch: string | null };

/** One write to the private note. `ifMatch` is the version as an integer. */
export type NoteOp =
  | { kind: "create"; id: string; body: string }
  | { kind: "update"; id: string; body: string; ifMatch: number }
  | { kind: "delete"; id: string };

/** The writes one Save or one Undo sends, per part; null where a part has nothing to do. */
export interface DayPlan {
  date: string;
  entry: EntryOp | null;
  note: NoteOp | null;
}

export function isEmptyPlan(plan: DayPlan): boolean {
  return plan.entry === null && plan.note === null;
}

function entryPlan(current: EntryState, target: EntryValues): EntryOp | null {
  if (current.status === "live") {
    if (isEmptyEntry(target)) return { kind: "delete", ifMatch: String(current.version) };
    if (sameValues(current.values, target)) return null;
    return { kind: "put", values: entryValuesOf(target), ifMatch: String(current.version) };
  }
  if (isEmptyEntry(target)) return null;
  // A tombstone this client wrote revives with its known version; with no
  // row at all there is nothing to match, so the PUT creates the day.
  return {
    kind: "put",
    values: entryValuesOf(target),
    ifMatch: current.status === "deleted" ? String(current.version) : null,
  };
}

/**
 * What Save sends for a draft: the entry PUT with all three fields (or its
 * DELETE once the draft is empty, so no logged-day dot is left behind), and
 * the private note's create, update or delete. `newNoteId` is the id a new
 * note gets; the controller keeps it across retries, so a create whose
 * answer was lost meets its own row on the next attempt instead of making
 * a second note.
 */
export function planSave(day: DayState, draft: DayDraft, newNoteId: string): DayPlan {
  const entry = entryPlan(day.entry, draft);
  let note: NoteOp | null = null;
  const blank = isBlankNote(draft.note);
  if (day.note.status === "saved") {
    if (blank) note = { kind: "delete", id: day.note.id };
    else if (draft.note !== day.note.body) {
      note = { kind: "update", id: day.note.id, body: draft.note, ifMatch: day.note.version };
    }
  } else if (!blank) {
    note = { kind: "create", id: newNoteId, body: draft.note };
  }
  return { date: day.date, entry, note };
}

/**
 * The ten-second Undo as compensating writes (DESIGN.md 5.1 step 5, the
 * lead's ruling): a day the save created is deleted; otherwise the previous
 * values go back with the new version as If-Match. A note the save created
 * is deleted, an edited one gets its old text back, and a deleted one is
 * written again as a private note under its old id. There is no undo for a
 * share, so a share in between clears the plan (the controller's part).
 */
export function planUndo(before: DayState, after: DayState): DayPlan {
  let entry: EntryOp | null = null;
  if (before.entry.status === "live") {
    const previous = entryValuesOf(before.entry.values);
    if (after.entry.status === "live") {
      if (!sameValues(previous, after.entry.values)) {
        entry = { kind: "put", values: previous, ifMatch: String(after.entry.version) };
      }
    } else {
      entry = {
        kind: "put",
        values: previous,
        ifMatch: after.entry.status === "deleted" ? String(after.entry.version) : null,
      };
    }
  } else if (after.entry.status === "live") {
    entry = { kind: "delete", ifMatch: String(after.entry.version) };
  }

  let note: NoteOp | null = null;
  if (before.note.status === "saved") {
    const previous = before.note;
    if (after.note.status === "saved") {
      if (after.note.body !== previous.body) {
        note = {
          kind: "update",
          id: after.note.id,
          body: previous.body,
          ifMatch: after.note.version,
        };
      }
    } else {
      note = { kind: "create", id: previous.id, body: previous.body };
    }
  } else if (after.note.status === "saved") {
    note = { kind: "delete", id: after.note.id };
  }
  return { date: after.date, entry, note };
}

/** Where "Share this note with..." files a note: the pregnancy overview in that stage, else symptoms. */
export function shareCategoryFor(stage: LoggingStage): NoteShareCategory {
  return stage === "pregnancy" ? "pregnancy.overview" : "cycle.symptoms";
}

/**
 * The days either side of `date` the sheet may move to: the previous day
 * always, the next one only up to `today`, which comes from the API (a day
 * that has not happened has nothing to log).
 */
export function dayNeighbours(
  date: string,
  today: string,
): { previous: string; next: string | null } {
  if (!isCalendarDate(date) || !isCalendarDate(today)) {
    throw new Error("dayNeighbours expects YYYY-MM-DD dates");
  }
  const next = addDays(date, 1);
  return { previous: addDays(date, -1), next: compareDates(next, today) <= 0 ? next : null };
}

/**
 * The key a day's draft is mounted under (DaySheet's `draftKey`): the date,
 * the entry version it started from and how many times the controller
 * reseeded it. A late load, a day change or an undo changes the key and
 * remounts the draft from the new values; the controller's own save does
 * not, because the draft already equals what was saved, and a part that
 * failed keeps her text for Try again.
 */
export function dayLogKey(date: string, entry: EntryState, generation: number): string {
  return `${date}:${entry.status === "none" ? 0 : entry.version}:${generation}`;
}

function entryVersion(entry: EntryState): number {
  return entry.status === "none" ? 0 : entry.version;
}

/**
 * The versions a day was read at: two reads with the same fingerprint show
 * the same day. The read-only notes are sorted, because the client appends
 * a note it just shared while the API lists notes by date and id.
 */
export function dayFingerprint(day: DayState): string {
  const note = day.note.status === "saved" ? `${day.note.id}@${day.note.version}` : "-";
  const others = day.others
    .map((other) => `${other.id}@${other.version}`)
    .sort()
    .join(",");
  return `${day.date}|${entryVersion(day.entry)}|${note}|${others}`;
}

/**
 * Whether `incoming` is an older read than `current` of the same day: a
 * lower entry version, or the same private note at a lower version. Server
 * props that arrive after a refresh can trail the controller's own writes;
 * versions only ever grow, so an older read is never adopted.
 */
export function isOlderDay(incoming: DayState, current: DayState): boolean {
  if (entryVersion(incoming.entry) < entryVersion(current.entry)) return true;
  return (
    incoming.note.status === "saved" &&
    current.note.status === "saved" &&
    incoming.note.id === current.note.id &&
    incoming.note.version < current.note.version
  );
}

/* ------------------------------------------------------------------------ */
/* Calls                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * How one part of a save, an undo, a share or a delete ended: nothing to
 * do, written, refused because the server held a newer version (the client
 * read it again), or failed. `status` is the HTTP status of a failure, 0
 * when the request never got an answer.
 */
export interface PartResult {
  outcome: "unchanged" | "saved" | "conflict" | "failed";
  status?: number;
}

export interface RunResult {
  day: DayState;
  entry: PartResult;
  note: PartResult;
}

const UNCHANGED: PartResult = { outcome: "unchanged" };
const SAVED: PartResult = { outcome: "saved" };
const CONFLICT: PartResult = { outcome: "conflict" };

function failed(status: number): PartResult {
  return { outcome: "failed", status };
}

/** A failure Try again cannot fix: the session ended. */
export function isSignedOut(result: PartResult): boolean {
  return result.outcome === "failed" && result.status === 401;
}

/** Every part was written or had nothing to do. */
export function allSaved(...results: PartResult[]): boolean {
  return results.every((result) => result.outcome === "saved" || result.outcome === "unchanged");
}

/** Set by the API on an answer served from a stored idempotency row instead of the handler. */
const REPLAYED = "Idempotency-Replayed";

interface Answer<T> {
  status: number;
  data: T | undefined;
  replayed: boolean;
}

/** One request's status and body; a request that never got an answer is status 0. */
async function answer<T>(request: Promise<{ data?: T; response: Response }>): Promise<Answer<T>> {
  try {
    const { data, response } = await request;
    return { status: response.status, data, replayed: response.headers.get(REPLAYED) === "true" };
  } catch {
    return { status: 0, data: undefined, replayed: false };
  }
}

/** A whole note, as opposed to the `{ id }` an idempotent replay answers with. */
function isFullNote(value: unknown): value is Note {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Partial<Note>;
  return (
    typeof note.id === "string" &&
    typeof note.version === "number" &&
    typeof note.category === "string" &&
    typeof note.date === "string"
  );
}

function isFullEntry(value: unknown): value is CycleEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<CycleEntry>;
  return typeof entry.id === "string" && typeof entry.version === "number";
}

/** The day's entry read again, or null when the read itself failed. */
async function readEntry(client: ApiClient, date: string): Promise<EntryState | null> {
  const read = await answer(
    client.GET("/api/v1/cycle/entries", { params: { query: { from: date, to: date } } }),
  );
  if (read.status !== 200 || read.data === undefined) return null;
  return entryStateFrom(date, read.data.items);
}

/** A note read again by id: the note, gone, or null when the read itself failed. */
async function readNote(client: ApiClient, id: string): Promise<Note | "gone" | null> {
  const read = await answer(client.GET("/api/v1/notes/{id}", { params: { path: { id } } }));
  if (read.status === 404) return "gone";
  if (read.status !== 200 || !isFullNote(read.data)) return null;
  return read.data;
}

/**
 * Files a note the client just learned about where the sheet shows it: the
 * editable slot for this day's private note, the read-only list for a
 * shared one, and nowhere once it is gone or moved to another day.
 */
export function placeNote(day: DayState, id: string, found: Note | "gone"): DayState {
  const others = day.others.filter((note) => note.id !== id);
  const wasEditable = day.note.status === "saved" && day.note.id === id;
  const slot = wasEditable ? NO_NOTE : day.note;
  if (found === "gone" || found.date !== day.date) return { ...day, note: slot, others };
  if (isEditable(found) && slot.status === "none") {
    return {
      ...day,
      note: { status: "saved", id: found.id, body: found.body, version: found.version },
      others,
    };
  }
  return { ...day, note: slot, others: [...others, found] };
}

/**
 * A write the server answered but whose result could not be read back (an
 * id-only replay followed by a failed read): reported as a failure without
 * an answer, so Try again reads the part again before writing.
 */
const UNCONFIRMED = 0;

async function runEntry(
  client: ApiClient,
  date: string,
  current: EntryState,
  op: EntryOp | null,
): Promise<{ entry: EntryState; result: PartResult }> {
  if (op === null) return { entry: current, result: UNCHANGED };
  const params =
    op.ifMatch === null
      ? { path: { date } }
      : { path: { date }, header: { "if-match": op.ifMatch } };

  if (op.kind === "delete") {
    const sent = await answer(client.DELETE("/api/v1/cycle/entries/{date}", { params }));
    if (sent.status === 204) {
      return {
        entry:
          current.status === "live"
            ? { status: "deleted", version: current.version + 1 }
            : NO_ENTRY,
        result: SAVED,
      };
    }
    // No live entry: what the delete wanted is already true.
    if (sent.status === 404) return { entry: NO_ENTRY, result: SAVED };
    if (sent.status === 409) {
      return { entry: (await readEntry(client, date)) ?? current, result: CONFLICT };
    }
    return { entry: current, result: failed(sent.status) };
  }

  const sent = await answer(
    client.PUT("/api/v1/cycle/entries/{date}", { params, body: entryWriteFrom(op.values) }),
  );
  if (sent.status === 200) {
    if (!sent.replayed && isFullEntry(sent.data)) {
      return {
        entry: { status: "live", version: sent.data.version, values: valuesOf(sent.data) },
        result: SAVED,
      };
    }
    // An id-only replay: the write happened; read the day for its version.
    const fresh = await readEntry(client, date);
    return fresh === null
      ? { entry: current, result: failed(UNCONFIRMED) }
      : { entry: fresh, result: SAVED };
  }
  if (sent.status === 409) {
    return { entry: (await readEntry(client, date)) ?? current, result: CONFLICT };
  }
  return { entry: current, result: failed(sent.status) };
}

async function runNote(
  client: ApiClient,
  day: DayState,
  op: NoteOp | null,
): Promise<{ day: DayState; result: PartResult }> {
  if (op === null) return { day, result: UNCHANGED };

  if (op.kind === "delete") {
    const sent = await answer(
      client.DELETE("/api/v1/notes/{id}", { params: { path: { id: op.id } } }),
    );
    if (sent.status === 204 || sent.status === 404) {
      return { day: placeNote(day, op.id, "gone"), result: SAVED };
    }
    return { day, result: failed(sent.status) };
  }

  if (op.kind === "update") {
    const sent = await answer(
      client.PUT("/api/v1/notes/{id}", {
        params: { path: { id: op.id }, header: { "If-Match": op.ifMatch } },
        body: { body: op.body },
      }),
    );
    if (sent.status === 200) {
      if (!sent.replayed && isFullNote(sent.data)) {
        return { day: placeNote(day, op.id, sent.data), result: SAVED };
      }
      // An id-only replay: the write happened; read the note for its version.
      const fresh = await readNote(client, op.id);
      if (fresh === null) return { day, result: failed(UNCONFIRMED) };
      return { day: placeNote(day, op.id, fresh), result: fresh === "gone" ? CONFLICT : SAVED };
    }
    if (sent.status === 404) return { day: placeNote(day, op.id, "gone"), result: CONFLICT };
    if (sent.status === 409) {
      const fresh = await readNote(client, op.id);
      return { day: fresh === null ? day : placeNote(day, op.id, fresh), result: CONFLICT };
    }
    return { day, result: failed(sent.status) };
  }

  const sent = await answer(
    client.POST("/api/v1/notes", {
      body: { id: op.id, date: day.date, category: "journal.private", body: op.body },
    }),
  );
  if (sent.status === 201 && !sent.replayed && isFullNote(sent.data)) {
    return { day: placeNote(day, op.id, sent.data), result: SAVED };
  }
  if (sent.status === 201 || sent.status === 409) {
    // An id-only replay, or the id is taken because an earlier attempt whose
    // answer was lost already wrote it: read the note by its id.
    const fresh = await readNote(client, op.id);
    if (fresh === null) return { day, result: failed(UNCONFIRMED) };
    if (fresh === "gone") return { day, result: failed(sent.status) };
    const placed = placeNote(day, op.id, fresh);
    if (fresh.body === op.body || placed.note.status !== "saved") {
      return { day: placed, result: SAVED };
    }
    // The earlier attempt carried older text: bring it up to the draft.
    return runNote(client, placed, {
      kind: "update",
      id: op.id,
      body: op.body,
      ifMatch: placed.note.version,
    });
  }
  return { day, result: failed(sent.status) };
}

/**
 * Sends a plan: the entry and the note at once, each with its own result,
 * so "entry saved, note failed" is an answer the sheet can show part by
 * part. A 409 reads the part again so the next attempt carries the current
 * version; the draft is the caller's and is never touched here.
 */
export async function runPlan(client: ApiClient, day: DayState, plan: DayPlan): Promise<RunResult> {
  const [entry, note] = await Promise.all([
    runEntry(client, day.date, day.entry, plan.entry),
    runNote(client, day, plan.note),
  ]);
  return { day: { ...note.day, entry: entry.entry }, entry: entry.result, note: note.result };
}

/** A day read from the API, or the status of the read that failed (0 without an answer). */
export type DayLoad = { ok: true; day: DayState } | { ok: false; status: number };

/**
 * Loads one day: GET /v1/cycle/entries and GET /v1/notes, both with from
 * and to set to the day. The query carries dates only (architecture 9.1).
 */
export async function loadDay(client: ApiClient, date: string): Promise<DayLoad> {
  const [entries, notes] = await Promise.all([
    answer(client.GET("/api/v1/cycle/entries", { params: { query: { from: date, to: date } } })),
    answer(client.GET("/api/v1/notes", { params: { query: { from: date, to: date } } })),
  ]);
  if (entries.status !== 200 || entries.data === undefined)
    return { ok: false, status: entries.status };
  if (notes.status !== 200 || notes.data === undefined) return { ok: false, status: notes.status };
  return { ok: true, day: dayStateFrom(date, entries.data.items, notes.data.items) };
}

/**
 * The explicit share (architecture 8.2): POST /v1/notes/{id}/share re-files
 * the saved private note under `category`, with its version as If-Match so
 * she shares exactly the text she sees. One way; there is no unshare.
 *
 * `idempotencyKey` is this share's key. The controller keeps it across the
 * retries of a share that got no answer (`keepsShareKey`), so a retry meets
 * the first attempt's stored answer instead of a version that attempt
 * already moved. A 409 reads the note again and sorts out what it means:
 * filed under `category` with the text she saw, an earlier attempt landed
 * and the share is done; still private at the version she sent, nothing
 * moved yet (the first attempt is still running) and the share failed;
 * anything else is a conflict, and the day carries the note as it is now
 * so the sheet can show her the current text before she shares again.
 */
export async function shareNote(
  client: ApiClient,
  day: DayState,
  category: NoteShareCategory,
  idempotencyKey?: string,
): Promise<{ day: DayState; result: PartResult }> {
  if (day.note.status !== "saved") return { day, result: UNCHANGED };
  const { id, version, body } = day.note;
  const sent = await answer(
    client.POST("/api/v1/notes/{id}/share", {
      params: { path: { id }, header: { "If-Match": version } },
      body: { category },
      ...(idempotencyKey === undefined ? {} : { headers: { "Idempotency-Key": idempotencyKey } }),
    }),
  );
  if (sent.status === 200) {
    if (!sent.replayed && isFullNote(sent.data)) {
      return { day: placeNote(day, id, sent.data), result: SAVED };
    }
    const fresh = await readNote(client, id);
    if (fresh === null) return { day, result: failed(UNCONFIRMED) };
    if (fresh === "gone") return { day: placeNote(day, id, "gone"), result: CONFLICT };
    return { day: placeNote(day, id, fresh), result: SAVED };
  }
  if (sent.status === 404) return { day: placeNote(day, id, "gone"), result: CONFLICT };
  if (sent.status === 409) {
    const fresh = await readNote(client, id);
    // Without the note's current state there is nothing to show her: Try again reads it.
    if (fresh === null) return { day, result: failed(UNCONFIRMED) };
    if (fresh !== "gone" && fresh.body === body) {
      if (fresh.category === category) return { day: placeNote(day, id, fresh), result: SAVED };
      if (fresh.category === "journal.private" && fresh.version === version) {
        return { day, result: failed(409) };
      }
    }
    return { day: placeNote(day, id, fresh), result: CONFLICT };
  }
  return { day, result: failed(sent.status) };
}

/**
 * Whether the next press of Share note reuses this share's Idempotency-Key:
 * yes after no answer, a server error or a 409 that moved nothing, where the
 * first attempt may still land or have landed; no after any other answer,
 * which the server keeps under the key and would only replay.
 */
export function keepsShareKey(result: PartResult): boolean {
  if (result.outcome !== "failed") return false;
  const status = result.status ?? 0;
  return status === 0 || status === 409 || status >= 500;
}

/** Where a note sits on the day: the field's private note, the read-only list, or nowhere. */
export type NotePlace = "field" | "listed" | "absent";

export function notePlace(day: DayState, id: string): NotePlace {
  if (day.note.status === "saved" && day.note.id === id) return "field";
  return day.others.some((note) => note.id === id) ? "listed" : "absent";
}

/** Deletes one of the read-only notes (a shared note can only be deleted). A note already gone counts as deleted. */
export async function deleteNote(
  client: ApiClient,
  day: DayState,
  id: string,
): Promise<{ day: DayState; result: PartResult }> {
  const sent = await answer(client.DELETE("/api/v1/notes/{id}", { params: { path: { id } } }));
  if (sent.status === 204 || sent.status === 404) {
    return { day: placeNote(day, id, "gone"), result: SAVED };
  }
  return { day, result: failed(sent.status) };
}
