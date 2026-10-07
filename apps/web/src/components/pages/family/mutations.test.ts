import { describe, expect, it } from "vitest";
import { createApiClient } from "@tidefern/api-client";
import { CHILD_CONSENT_DISCLOSURES } from "@tidefern/schemas";
import { ILO_ID, event } from "./fixtures";
import {
  CHILD_CONSENT_VERSION,
  addChild,
  addMeasurement,
  attemptFor,
  checkMilestone,
  endSleep,
  keepsAttempt,
  logEvent,
  removeEvent,
} from "./mutations";

interface Sent {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

const json = (body: unknown, status: number) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "content-type": "application/json" },
  });

/** A client whose every request is recorded and answered by `reply`, or throws when it says so. */
function fake(reply: (sent: Sent) => Response | "throw") {
  const sent: Sent[] = [];
  let minted = 0;
  const client = createApiClient({
    baseUrl: "http://api.test",
    generateId: () => {
      minted += 1;
      return `018f5e7a-0000-7000-8000-${minted.toString(16).padStart(12, "0")}`;
    },
    fetch: async (request) => {
      const text = await request.text();
      const entry: Sent = {
        method: request.method,
        path: new URL(request.url).pathname,
        headers: request.headers,
        body: text ? JSON.parse(text) : undefined,
      };
      sent.push(entry);
      const answer = reply(entry);
      if (answer === "throw") throw new TypeError("Failed to fetch");
      return answer;
    },
  });
  return { client, sent };
}

describe("attempts", () => {
  it("keeps the id and key while the body is the same, and mints both again when it changes", () => {
    const { client } = fake(() => json({}, 200));
    const first = attemptFor(client, null, { kind: "diaper" });
    expect(attemptFor(client, first, { kind: "diaper" })).toBe(first);
    const changed = attemptFor(client, first, { kind: "diaper", diaperContents: "wet" });
    expect(changed.id).not.toBe(first.id);
    expect(changed.key).not.toBe(first.key);
  });

  it("keeps an attempt only when the request may have landed", () => {
    expect(keepsAttempt({ kind: "failed", status: 0 })).toBe(true);
    expect(keepsAttempt({ kind: "failed", status: 503 })).toBe(true);
    expect(keepsAttempt({ kind: "invalid", errors: [] })).toBe(false);
    expect(keepsAttempt({ kind: "signedOut" })).toBe(false);
  });
});

describe("logEvent", () => {
  it("posts the event with the attempt's id and Idempotency-Key, and answers the id", async () => {
    const { client, sent } = fake(() => json({ id: "replayed" }, 201));
    const attempt = attemptFor(client, null, {});
    const result = await logEvent(
      client,
      ILO_ID,
      { kind: "diaper", date: "2026-10-04", diaperContents: "wet" },
      attempt,
    );
    expect(result).toEqual({ ok: true, value: attempt.id });
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.path).toBe(`/api/v1/children/${ILO_ID}/events`);
    expect(sent[0]?.headers.get("Idempotency-Key")).toBe(attempt.key);
    expect(sent[0]?.body).toEqual({
      kind: "diaper",
      date: "2026-10-04",
      diaperContents: "wet",
      id: attempt.id,
    });
  });

  it("names each failure: no answer, a server error, an ended session, a refused field", async () => {
    const attempt = { id: "a", key: "b", fingerprint: "{}" };
    const body = { kind: "diaper" as const, date: "2026-10-04" };
    expect(await logEvent(fake(() => "throw").client, ILO_ID, body, attempt)).toEqual({
      ok: false,
      kind: "failed",
      status: 0,
    });
    expect(
      await logEvent(fake(() => json({ code: "internal" }, 500)).client, ILO_ID, body, attempt),
    ).toEqual({ ok: false, kind: "failed", status: 500 });
    expect(
      await logEvent(
        fake(() => json({ code: "unauthenticated" }, 401)).client,
        ILO_ID,
        body,
        attempt,
      ),
    ).toEqual({ ok: false, kind: "signedOut" });
    const refused = await logEvent(
      fake(() =>
        json(
          { code: "validation_failed", errors: [{ path: "quantityMl", message: "Too much." }] },
          422,
        ),
      ).client,
      ILO_ID,
      body,
      attempt,
    );
    expect(refused).toEqual({
      ok: false,
      kind: "invalid",
      errors: [{ path: "quantityMl", message: "Too much." }],
    });
  });
});

describe("endSleep", () => {
  it("replaces the whole sleep with its end, its note kept, under If-Match", async () => {
    const sleep = event({
      kind: "sleep",
      date: "2026-10-04",
      startedAt: "2026-10-04T21:15:00.000Z",
      note: "Down after the bath.",
      version: 3,
    });
    const { client, sent } = fake(() =>
      json({ ...sleep, endedAt: "2026-10-04T23:00:00.000Z" }, 200),
    );
    const result = await endSleep(client, ILO_ID, sleep, "2026-10-04T23:00:00.000Z");
    expect(result.ok).toBe(true);
    expect(sent[0]?.method).toBe("PUT");
    expect(sent[0]?.path).toBe(`/api/v1/children/${ILO_ID}/events/${sleep.id}`);
    expect(sent[0]?.headers.get("if-match")).toBe("3");
    expect(sent[0]?.body).toEqual({
      kind: "sleep",
      date: "2026-10-04",
      startedAt: "2026-10-04T21:15:00.000Z",
      endedAt: "2026-10-04T23:00:00.000Z",
      note: "Down after the bath.",
    });
  });

  it("never sends an end before the start, and says an end recorded elsewhere as a conflict", async () => {
    const sleep = event({ kind: "sleep", startedAt: "2026-10-04T21:15:00.000Z" });
    const { client, sent } = fake(() => json({ code: "conflict" }, 409));
    expect(await endSleep(client, ILO_ID, sleep, "2026-10-04T21:00:00.000Z")).toEqual({
      ok: false,
      kind: "conflict",
    });
    expect((sent[0]?.body as { endedAt: string }).endedAt).toBe("2026-10-04T21:15:00.000Z");
    expect(sent[0]?.body).not.toHaveProperty("note");
  });
});

describe("removeEvent", () => {
  it("counts a deleted or already gone event as undone", async () => {
    const gone = fake(() => json(undefined, 204));
    expect(await removeEvent(gone.client, ILO_ID, "e")).toEqual({ ok: true, value: undefined });
    expect(gone.sent[0]?.method).toBe("DELETE");
    expect(await removeEvent(fake(() => json({}, 404)).client, ILO_ID, "e")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await removeEvent(fake(() => json({}, 500)).client, ILO_ID, "e")).toEqual({
      ok: false,
      kind: "failed",
      status: 500,
    });
  });
});

describe("addChild", () => {
  it("sends the guardian's consent with the version of the text the form shows", async () => {
    const { client, sent } = fake(() => json({ id: "x" }, 201));
    const attempt = attemptFor(client, null, {});
    expect(CHILD_CONSENT_VERSION).toBe("2026-10");
    expect(CHILD_CONSENT_DISCLOSURES["2026-10"].text).toMatch(/^You are adding/);
    const result = await addChild(
      client,
      { displayName: "Ada", dateOfBirth: "2026-09-20", sex: "female" },
      attempt,
    );
    expect(result).toEqual({ ok: true, value: attempt.id });
    expect(sent[0]?.path).toBe("/api/v1/children");
    expect(sent[0]?.headers.get("Idempotency-Key")).toBe(attempt.key);
    expect(sent[0]?.body).toEqual({
      displayName: "Ada",
      dateOfBirth: "2026-09-20",
      sex: "female",
      id: attempt.id,
      guardianConsent: { given: true, textVersion: "2026-10" },
    });
  });
});

describe("addMeasurement", () => {
  it("posts SI integers and passes the API's refusal of a date before birth through", async () => {
    const { client, sent } = fake(() =>
      json(
        {
          code: "validation_failed",
          errors: [{ path: "date", message: "A measurement is never dated before the birth." }],
        },
        422,
      ),
    );
    const attempt = attemptFor(client, null, {});
    const result = await addMeasurement(
      client,
      ILO_ID,
      { date: "2026-08-01", weightGrams: 4600 },
      attempt,
    );
    expect(result).toEqual({
      ok: false,
      kind: "invalid",
      errors: [{ path: "date", message: "A measurement is never dated before the birth." }],
    });
    expect(sent[0]?.body).toEqual({ date: "2026-08-01", weightGrams: 4600, id: attempt.id });
  });
});

describe("checkMilestone", () => {
  it("puts the item in the body, never the path, and answers the item as it stands", async () => {
    const item = {
      id: "2m-social-2",
      domain: "social",
      text: "Looks at your face",
      checked: true,
      checkedOn: "2026-10-04",
      eventId: "018f5e7a-5eed-7030-8000-0000000000aa",
    };
    const { client, sent } = fake(() => json(item, 200));
    expect(await checkMilestone(client, ILO_ID, "2m-social-2", true)).toEqual({
      ok: true,
      value: item,
    });
    expect(sent[0]?.method).toBe("PUT");
    expect(sent[0]?.path).toBe(`/api/v1/children/${ILO_ID}/milestones`);
    expect(sent[0]?.body).toEqual({ itemId: "2m-social-2", checked: true });
  });
});
