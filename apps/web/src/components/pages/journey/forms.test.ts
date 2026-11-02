import { describe, expect, it } from "vitest";
import { journeyCopy as copy } from "./copy";
import {
  endFailure,
  eventBody,
  eventFailure,
  keyMemory,
  validateEnd,
  validateEvent,
} from "./forms";

const problem = (detail?: string, errors?: { path: string; message: string }[]) => ({
  type: "urn:tidefern:problem:x",
  title: "x",
  status: 0,
  code: "conflict",
  ...(detail === undefined ? {} : { detail }),
  ...(errors === undefined ? {} : { errors }),
});

describe("the event form", () => {
  const start = "2026-05-03";

  it("wants a kind and a real date, and a detail no longer than the contract takes", () => {
    expect(
      validateEvent({ kind: "appointment", date: "2026-11-01", detail: "" }, start),
    ).toBeNull();
    expect(validateEvent({ kind: null, date: null, detail: "x".repeat(501) }, start)).toEqual({
      kind: copy.event.errors.kindMissing,
      date: copy.event.errors.dateMissing,
      detail: copy.event.errors.detailTooLong,
    });
    expect(
      validateEvent(
        { kind: "milestone", date: "2026-11-01", detail: ` ${"x".repeat(500)} ` },
        start,
      ),
    ).toBeNull();
  });

  it("refuses a day before the pregnancy began and takes day 0 itself", () => {
    expect(validateEvent({ kind: "appointment", date: "2025-03-02", detail: "" }, start)).toEqual({
      date: copy.event.errors.dateBefore,
    });
    expect(validateEvent({ kind: "appointment", date: "2026-05-02", detail: "" }, start)).toEqual({
      date: copy.event.errors.dateBefore,
    });
    expect(validateEvent({ kind: "appointment", date: start, detail: "" }, start)).toBeNull();
  });

  it("always sends the detail it has, trimmed, and leaves an empty one out to clear it", () => {
    expect(
      eventBody({ kind: "appointment", date: "2026-11-01", detail: "  Glucose screening " }),
    ).toEqual({
      kind: "appointment",
      date: "2026-11-01",
      detail: "Glucose screening",
    });
    expect(eventBody({ kind: "milestone", date: "2026-11-01", detail: "   " })).toEqual({
      kind: "milestone",
      date: "2026-11-01",
    });
  });

  it("says what to do next for every refusal, and refreshes when the page is out of date", () => {
    const e = copy.event.errors;
    expect(eventFailure(0, undefined)).toEqual({
      kind: "message",
      text: e.offline,
      refresh: false,
    });
    expect(eventFailure(401, problem())).toEqual({ kind: "signed-out" });
    expect(eventFailure(404, problem())).toEqual({ kind: "message", text: e.gone, refresh: true });
    expect(eventFailure(409, problem("stale_version"))).toEqual({
      kind: "message",
      text: e.stale,
      refresh: true,
    });
    expect(eventFailure(409, problem("pregnancy_paused"))).toEqual({
      kind: "message",
      text: e.paused,
      refresh: true,
    });
    expect(eventFailure(429, problem())).toEqual({
      kind: "message",
      text: e.limited,
      refresh: false,
    });
    expect(eventFailure(500, undefined)).toEqual({
      kind: "message",
      text: e.failed,
      refresh: false,
    });
    expect(eventFailure(500, undefined, "delete")).toEqual({
      kind: "message",
      text: e.removeFailed,
      refresh: false,
    });
  });

  it("puts a validation refusal beside its field", () => {
    expect(
      eventFailure(422, problem(undefined, [{ path: "date", message: "Not a calendar day." }])),
    ).toEqual({ kind: "fields", errors: { date: copy.event.errors.dateInvalid } });
    expect(eventFailure(422, problem(undefined, [{ path: "id", message: "x" }]))).toEqual({
      kind: "message",
      text: copy.event.errors.failed,
      refresh: false,
    });
  });

  it("never calls a paused pregnancy ended", () => {
    const paused = eventFailure(409, problem("pregnancy_paused"));
    expect(JSON.stringify(paused)).not.toMatch(/ended/i);
  });
});

describe("the ending form", () => {
  const bounds = { today: "2026-10-04", start: "2026-05-03" };

  it("takes a day from the pregnancy's first to today, and a reason", () => {
    expect(validateEnd({ date: "2026-10-04", reason: "birth" }, bounds)).toBeNull();
    expect(validateEnd({ date: "2026-05-03", reason: "loss" }, bounds)).toBeNull();
    expect(validateEnd({ date: "2026-10-05", reason: "other" }, bounds)).toEqual({
      endedAt: copy.end.errors.dateFuture,
    });
    expect(validateEnd({ date: "2026-05-02", reason: "other" }, bounds)).toEqual({
      endedAt: copy.end.errors.dateBefore,
    });
    expect(validateEnd({ date: null, reason: null }, bounds)).toEqual({
      endedAt: copy.end.errors.dateMissing,
      reason: copy.end.errors.reasonMissing,
    });
  });

  it("shows a stale sign-in as the next step, never as a failure to retry", () => {
    expect(endFailure(401, problem("fresh_authentication_required"))).toEqual({
      kind: "fresh-auth",
    });
    // A replayed 401 carries no detail: that is a session to sign in to again, not a retry.
    expect(endFailure(401, problem())).toEqual({ kind: "signed-out" });
  });

  it("tells the API's two refusals of a day apart", () => {
    expect(
      endFailure(
        422,
        problem(undefined, [{ path: "endedAt", message: "Not a day that has happened yet." }]),
      ),
    ).toEqual({ kind: "fields", errors: { endedAt: copy.end.errors.dateFuture } });
    expect(
      endFailure(
        422,
        problem(undefined, [{ path: "endedAt", message: "Not a day after the pregnancy began." }]),
      ),
    ).toEqual({ kind: "fields", errors: { endedAt: copy.end.errors.dateBefore } });
  });

  it("says an ending already recorded elsewhere, and refreshes", () => {
    expect(endFailure(409, problem("pregnancy_ended"))).toEqual({
      kind: "message",
      text: copy.end.errors.ended,
      refresh: true,
    });
    expect(endFailure(0, undefined)).toMatchObject({ text: copy.end.errors.offline });
    expect(endFailure(503, undefined)).toMatchObject({ text: copy.end.errors.failed });
  });
});

describe("keyMemory", () => {
  it("reuses a key for the same body and takes a new one when the body changes", () => {
    let minted = 0;
    const keyFor = keyMemory(() => `key-${(minted += 1)}`);
    const body = { endedAt: "2026-10-04", reason: "loss" };
    expect(keyFor(body)).toBe("key-1");
    expect(keyFor({ ...body })).toBe("key-1");
    expect(keyFor({ ...body, reason: "other" })).toBe("key-2");
    expect(keyFor(body)).toBe("key-3");
  });
});
