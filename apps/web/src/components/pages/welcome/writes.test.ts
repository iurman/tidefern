import { createApiClient } from "@tidefern/api-client";
import { TERMS_VERSION } from "@tidefern/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addChild,
  causeOf,
  createProfile,
  detailOf,
  planWrites,
  recordConsent,
  startPregnancy,
  writePeriodDay,
} from "./writes";

interface Sent {
  method: string;
  path: string;
  key: string | null;
  ifMatch: string | null;
  body: unknown;
}

let sent: Sent[] = [];
let answers: Array<() => Response> = [];

const client = createApiClient({
  baseUrl: "http://tidefern.test",
  fetch: async (request) => {
    const text = await request.text();
    sent.push({
      method: request.method,
      path: new URL(request.url).pathname,
      key: request.headers.get("idempotency-key"),
      ifMatch: request.headers.get("if-match"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    const next = answers.shift();
    if (next === undefined) throw new Error(`unexpected ${request.method} ${request.url}`);
    return next();
  },
});

const json = (body: unknown, status: number) => () => Response.json(body, { status });
const problem = (status: number, detail?: string) => () =>
  new Response(JSON.stringify({ type: "urn:tidefern:problem:x", title: "x", status, detail }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
const dropped = () => {
  throw new TypeError("Failed to fetch");
};

beforeEach(() => {
  sent = [];
  answers = [];
});

describe("the order of the writes", () => {
  it("records the consent, then the profile, then the facts her stage gave", () => {
    expect(planWrites({ stage: "cycle", consent: true, start: true, since: false })).toEqual([
      "consent",
      "profile",
      "start",
    ]);
    expect(planWrites({ stage: "cycle", consent: true, start: false, since: false })).toEqual([
      "consent",
      "profile",
    ]);
    expect(planWrites({ stage: "pregnancy", consent: true, start: false, since: false })).toEqual([
      "consent",
      "profile",
      "pregnancy",
    ]);
    expect(planWrites({ stage: "postpartum", consent: true, start: false, since: true })).toEqual([
      "consent",
      "profile",
      "child",
      "since",
    ]);
  });

  it("writes only the profile for a stage that collects nothing about her body", () => {
    expect(planWrites({ stage: "none", consent: false, start: false, since: false })).toEqual([
      "profile",
    ]);
  });
});

describe("why a write stops", () => {
  it("reads the next step from the status", () => {
    expect([0, 401, 429, 500, 503, 422, 409, 403].map(causeOf)).toEqual([
      "network",
      "session",
      "rate",
      "server",
      "server",
      "refused",
      "refused",
      "refused",
    ]);
  });

  it("reads a problem's detail, and nothing from anything else", () => {
    expect(detailOf({ detail: "stale_version" })).toBe("stale_version");
    expect(detailOf({ detail: 4 })).toBeUndefined();
    expect(detailOf(null)).toBeUndefined();
  });
});

describe("recording the consent", () => {
  it("sends the categories, the text and terms versions, and the key the page minted", async () => {
    answers.push(json({ id: "0199b0a0-0000-7000-8000-000000000001" }, 201));
    const outcome = await recordConsent(client, {
      categories: ["cycle.history", "journal.private"],
      key: "0199b0a0-0000-7000-8000-00000000000a",
    });
    expect(outcome).toEqual({ ok: true });
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/api/v1/me/consents",
        key: "0199b0a0-0000-7000-8000-00000000000a",
        ifMatch: null,
        body: {
          categories: ["cycle.history", "journal.private"],
          textVersion: "2026-10",
          termsVersion: TERMS_VERSION,
        },
      },
    ]);
  });

  it("counts a replay of the same key as recorded", async () => {
    answers.push(() =>
      Response.json({ id: "x" }, { status: 201, headers: { "Idempotency-Replayed": "true" } }),
    );
    expect(await recordConsent(client, { categories: ["journal.private"], key: "k" })).toEqual({
      ok: true,
    });
  });

  it("stops on a refusal, a server failure or no answer, with the cause", async () => {
    answers.push(problem(500), dropped);
    expect(await recordConsent(client, { categories: ["journal.private"], key: "k" })).toEqual({
      ok: false,
      failure: { cause: "server", status: 500 },
    });
    expect(await recordConsent(client, { categories: ["journal.private"], key: "k" })).toEqual({
      ok: false,
      failure: { cause: "network", status: 0 },
    });
  });
});

describe("creating the profile", () => {
  const body = {
    displayName: "Sam",
    timeZone: "Europe/Berlin",
    stage: "cycle" as const,
    weekStart: 7,
  };

  it("sends the age attestation with it", async () => {
    answers.push(json({}, 201));
    expect(await createProfile(client, body)).toEqual({ ok: true });
    expect(sent[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/me/profile",
      body: { ...body, ageAttested: true },
    });
  });

  it("counts a profile that already exists as saved: the first try landed and its answer was lost", async () => {
    answers.push(problem(422, "if_match_required"), json({ ...body, version: 1 }, 200));
    expect(await createProfile(client, body)).toEqual({ ok: true });
    expect(sent.map((request) => `${request.method} ${request.path}`)).toEqual([
      "PUT /api/v1/me/profile",
      "GET /api/v1/me/profile",
    ]);
  });

  it("replaces a saved profile that holds a zone or stage she changed after the lost answer", async () => {
    const changed = { ...body, timeZone: "America/Chicago", stage: "none" as const };
    answers.push(
      problem(422, "if_match_required"),
      json({ ...body, version: 1 }, 200),
      json({ ...changed, version: 2 }, 200),
    );
    expect(await createProfile(client, changed)).toEqual({ ok: true });
    expect(sent.map((request) => `${request.method} ${request.path}`)).toEqual([
      "PUT /api/v1/me/profile",
      "GET /api/v1/me/profile",
      "PUT /api/v1/me/profile",
    ]);
    expect(sent[2]).toMatchObject({ ifMatch: "1", body: { ...changed, ageAttested: true } });
  });

  it("fails when the replacement is refused, so the saved profile never silently keeps her old choice", async () => {
    const changed = { ...body, stage: "none" as const };
    answers.push(
      problem(422, "if_match_required"),
      json({ ...body, version: 3 }, 200),
      problem(409, "stale_version"),
    );
    expect(await createProfile(client, changed)).toEqual({
      ok: false,
      failure: { cause: "refused", status: 409, detail: "stale_version" },
    });
  });

  it("fails when the profile read back is not one", async () => {
    answers.push(problem(422, "if_match_required"), json({}, 200));
    expect(await createProfile(client, body)).toEqual({
      ok: false,
      failure: { cause: "refused", status: 200 },
    });
  });

  it("stops on any other refusal, with its detail", async () => {
    answers.push(problem(422, "age_attestation_required"));
    expect(await createProfile(client, body)).toEqual({
      ok: false,
      failure: { cause: "refused", status: 422, detail: "age_attestation_required" },
    });
  });
});

describe("the facts", () => {
  it("writes a period day as its flow, the date in the path", async () => {
    answers.push(json({}, 200));
    expect(await writePeriodDay(client, { date: "2026-09-23", flow: "medium" })).toEqual({
      ok: true,
    });
    expect(sent[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/cycle/entries/2026-09-23",
      body: { flow: "medium" },
    });
  });

  it("starts a pregnancy with the id and key minted for it, and counts one already there as started", async () => {
    const input = {
      id: "0199b0a0-0000-7000-8000-0000000000b1",
      key: "0199b0a0-0000-7000-8000-0000000000b2",
      dating: { method: "lmp" as const, lastPeriodStart: "2026-07-27" },
    };
    answers.push(json({}, 201), problem(409, "pregnancy_open"), problem(409, "id_in_use"));
    expect(await startPregnancy(client, input)).toEqual({ ok: true });
    expect(await startPregnancy(client, input)).toEqual({ ok: true });
    expect(await startPregnancy(client, input)).toEqual({ ok: true });
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/pregnancies",
      key: input.key,
      body: { id: input.id, dating: input.dating },
    });
    // Every try carried the same key and the same id.
    expect(new Set(sent.map((request) => request.key))).toEqual(new Set([input.key]));
    answers.push(problem(409, "pregnancy_ended"));
    expect(await startPregnancy(client, input)).toMatchObject({ ok: false });
  });

  it("adds the child with the guardian's consent on the child's behalf", async () => {
    const input = {
      id: "0199b0a0-0000-7000-8000-0000000000c1",
      key: "0199b0a0-0000-7000-8000-0000000000c2",
      displayName: "Ilo",
      dateOfBirth: "2026-08-20",
    };
    answers.push(json({}, 201), problem(409, "id_in_use"), problem(422));
    expect(await addChild(client, input)).toEqual({ ok: true });
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/children",
      key: input.key,
      body: {
        id: input.id,
        displayName: "Ilo",
        dateOfBirth: "2026-08-20",
        guardianConsent: { given: true, textVersion: "2026-10" },
      },
    });
    expect(await addChild(client, input)).toEqual({ ok: true });
    expect(await addChild(client, input)).toEqual({
      ok: false,
      failure: { cause: "refused", status: 422 },
    });
  });
});
