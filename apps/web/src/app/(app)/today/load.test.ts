import { createApiClient, type Me } from "@tidefern/api-client";
import type {
  Child,
  CycleEntry,
  CyclePrediction,
  CycleStatus,
  Note,
  Pregnancy,
  SharingPerson,
} from "@tidefern/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import {
  childAge,
  loadToday,
  partnersFrom,
  periodDays,
  pickChild,
  weekLines,
  weekOf,
  type MeProfile,
  type Part,
  type TodaySession,
} from "./load";

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";
const today = "2026-10-05";

/* ------------------------------------------------------------------ */
/* Canned answers                                                      */
/* ------------------------------------------------------------------ */

function prediction(patch: Partial<CyclePrediction> = {}): CyclePrediction {
  return {
    subjectId: NOOR,
    computedAt: "2026-10-05T00:00:00.000Z",
    basis: "estimate",
    cycleLength: 28,
    sampleSize: 2,
    nextPeriod: { expected: "2026-10-31", start: "2026-10-28", end: "2026-11-03" },
    ovulation: { expected: "2026-10-17", start: "2026-10-15", end: "2026-10-19" },
    fertileWindow: { start: "2026-10-12", end: "2026-10-17" },
    uncertaintyDays: 3,
    ovulationBandDays: 2,
    irregular: false,
    periodsLogged: 3,
    cycleLengthRange: { min: 28, max: 28 },
    daysLate: 0,
    pointToCare: false,
    ...patch,
  };
}

const none = prediction({
  basis: "none",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 0,
  periodsLogged: 0,
  cycleLengthRange: null,
});

function status(patch: Partial<CycleStatus> = {}): CycleStatus {
  return {
    subjectId: NOOR,
    date: today,
    cycleDay: 3,
    periodDay: 3,
    inFertileWindow: false,
    ...patch,
  };
}

function entry(
  date: string,
  flow: CycleEntry["flow"],
  patch: Partial<CycleEntry> = {},
): CycleEntry {
  return {
    id: `018f5e7a-5eed-7010-8000-0000000${date.replaceAll("-", "").slice(3)}`,
    subjectId: NOOR,
    date,
    flow,
    period: flow === "light" || flow === "medium" || flow === "heavy",
    symptoms: [],
    mood: null,
    version: 1,
    updatedAt: "2026-10-05T08:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

function pregnancy(patch: Partial<Pregnancy> = {}): Pregnancy {
  return {
    id: "018f5e7a-5eed-7020-8000-000000000001",
    subjectId: LENA,
    status: "active",
    dueDate: "2027-02-07",
    datingMethod: "ultrasound",
    startedAt: "2026-06-01T00:00:00.000Z",
    endedAt: null,
    endedReason: null,
    gestation: { weeks: 22, days: 1, totalDays: 155, trimester: 2, label: "22w1d" },
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...patch,
  };
}

function child(id: string, displayName: string, dateOfBirth: string, guardians?: string[]): Child {
  return {
    id,
    displayName,
    dateOfBirth,
    sex: null,
    ...(guardians === undefined ? {} : { guardians }),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
}

function person(patch: Partial<SharingPerson> & { id: string }): SharingPerson {
  return {
    displayName: null,
    role: "partner",
    householdId: null,
    guardianOf: [],
    grants: [],
    notify: false,
    version: 0,
    ...patch,
  };
}

const theoForNoor = person({
  id: THEO,
  displayName: "Theo",
  grants: [
    {
      id: "018f5e7a-5eed-7003-8000-000000000001",
      category: "cycle.status",
      level: "summary",
      notify: true,
      version: 1,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ],
});

function me(profile: Partial<MeProfile> = {}, patch: Partial<Me> = {}): TodaySession {
  const full: MeProfile = {
    displayName: "Noor",
    timeZone: "Europe/Berlin",
    stage: "cycle",
    weekStart: 1,
    units: "metric",
    notificationDetail: "generic",
    ...profile,
  };
  const actor: Me = {
    id: NOOR,
    profile: full,
    today,
    guardianOf: [],
    grants: [],
    session: { expiresAt: "2026-10-12T00:00:00.000Z", authenticatedAt: "2026-10-05T00:00:00.000Z" },
    ...patch,
  };
  return { me: actor, profile: full, today };
}

/* ------------------------------------------------------------------ */
/* A canned API                                                        */
/* ------------------------------------------------------------------ */

type Answer = { status: number; body?: unknown } | "drop";
let routes: Map<string, Answer>;
let calls: string[];

function answer(key: string, value: Answer) {
  routes.set(key, value);
}

function api() {
  return createApiClient({
    baseUrl: "http://tidefern.test",
    fetch: async (request) => {
      const url = new URL(request.url);
      const key = `${request.method} ${url.pathname}${url.search}`;
      calls.push(key);
      const found = routes.get(key) ?? routes.get(`${request.method} ${url.pathname}`);
      if (found === undefined) throw new Error(`unexpected ${key}`);
      if (found === "drop") throw new TypeError("Failed to fetch");
      return found.body === undefined
        ? new Response(null, { status: found.status })
        : Response.json(found.body, { status: found.status });
    },
  });
}

const list = (items: unknown[]) => ({ status: 200, body: { items, nextCursor: null } });
const notFound = { status: 404, body: { type: "about:blank", title: "Not found", status: 404 } };
const broken = { status: 500, body: { type: "about:blank", title: "Server error", status: 500 } };

/** Noor on the seed day: an estimate, cycle day 3, three period days, Theo seeing her status. */
function noorAnswers() {
  answer("GET /api/v1/cycle/predictions", { status: 200, body: prediction() });
  answer("GET /api/v1/cycle/status", { status: 200, body: status() });
  answer("GET /api/v1/pregnancies/current", notFound);
  answer("GET /api/v1/sharing", list([theoForNoor]));
  answer("GET /api/v1/children", list([]));
  answer(
    "GET /api/v1/cycle/entries",
    list([
      entry("2026-10-03", "medium"),
      entry("2026-10-04", "heavy"),
      entry("2026-10-05", "medium", { mood: "steady" }),
    ]),
  );
  answer("GET /api/v1/notes", list([] satisfies Note[]));
}

beforeEach(() => {
  routes = new Map();
  calls = [];
});

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

describe("periodDays", () => {
  it("keeps light, medium and heavy days of live entries, oldest first", () => {
    const days = periodDays([
      entry("2026-10-05", "medium"),
      entry("2026-10-02", "spotting"),
      entry("2026-10-03", "light"),
      entry("2026-10-04", "none"),
      entry("2026-10-01", "heavy", { deletedAt: "2026-10-02T00:00:00.000Z" }),
    ]);
    expect(days).toEqual(["2026-10-03", "2026-10-05"]);
  });
});

describe("weekOf", () => {
  it("follows the profile's week start", () => {
    expect(weekOf("2026-10-05", 1)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(weekOf("2026-10-04", 7)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(weekOf("2026-10-07", 7)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
  });
});

describe("weekLines", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };

  it("gives the whole logged run that touches the week", () => {
    const lines = weekLines(week, ["2026-10-03", "2026-10-04", "2026-10-05"], prediction());
    expect(lines).toEqual({
      logged: { start: "2026-10-03", end: "2026-10-05" },
      nextPeriod: null,
      fertile: null,
    });
  });

  it("names the fertile window and the next period only when they touch the week", () => {
    const fertileWeek = { start: "2026-10-12", end: "2026-10-18" };
    expect(weekLines(fertileWeek, [], prediction()).fertile).toEqual({
      start: "2026-10-12",
      end: "2026-10-17",
    });
    const nextWeek = { start: "2026-11-02", end: "2026-11-08" };
    expect(weekLines(nextWeek, [], prediction())).toEqual({
      logged: null,
      nextPeriod: { start: "2026-10-28", end: "2026-11-03" },
      fertile: null,
    });
  });

  it("gives a first guess's band when it touches the week, as it does an estimate's", () => {
    // One period on Sep 10: the first guess is Oct 8, give or take 4 days, which reaches into this week.
    const firstGuess = prediction({
      basis: "first_guess",
      sampleSize: 0,
      uncertaintyDays: 4,
      nextPeriod: { expected: "2026-10-08", start: "2026-10-04", end: "2026-10-12" },
      ovulation: { expected: "2026-09-24", start: "2026-09-22", end: "2026-09-26" },
      fertileWindow: { start: "2026-09-19", end: "2026-09-24" },
    });
    expect(weekLines(week, ["2026-09-10"], firstGuess)).toEqual({
      logged: null,
      nextPeriod: { start: "2026-10-04", end: "2026-10-12" },
      fertile: null,
    });
  });

  it("offers no dates when the API offers none", () => {
    const tooDifferent = prediction({
      basis: "not_enough_regular_cycles",
      nextPeriod: { expected: "2026-10-08", start: "2026-10-06", end: "2026-10-10" },
      fertileWindow: { start: "2026-10-05", end: "2026-10-10" },
    });
    expect(weekLines(week, [], tooDifferent)).toEqual({
      logged: null,
      nextPeriod: null,
      fertile: null,
    });
  });
});

describe("pickChild", () => {
  const ilo = child(ILO, "Ilo", "2026-08-23");
  const sol = child(SOL, "Sol", "2024-04-04");
  const older = child("018f5e7a-5eed-7006-8000-000000000009", "June", "2026-09-30");

  it("takes the guarded child born on the day the pregnancy ended", () => {
    const ended = pregnancy({ status: "ended", endedAt: "2026-08-23", gestation: null });
    expect(pickChild([sol, older, ilo], [SOL, ILO, older.id], ended)?.id).toBe(ILO);
  });

  it("otherwise takes the youngest guarded child, never one reached only through a grant", () => {
    expect(pickChild([sol, ilo], [SOL, ILO], null)?.id).toBe(ILO);
    expect(pickChild([sol, ilo], [SOL], null)?.id).toBe(SOL);
    expect(pickChild([sol, ilo], [], null)).toBeNull();
  });
});

describe("childAge", () => {
  it("words the age with formatChildAge, and gives nothing for a birth after today", () => {
    expect(childAge(child(ILO, "Ilo", "2026-08-24"), today)).toEqual({
      id: ILO,
      name: "Ilo",
      age: "6 weeks",
    });
    expect(childAge(child(ILO, "Ilo", "2026-10-06"), today)).toBeNull();
  });
});

describe("partnersFrom", () => {
  it("lists only people with a grant or a child guarded together, and names the children", () => {
    const lena = person({ id: LENA, displayName: "Lena", guardianOf: [ILO] });
    const kim = person({ id: "018f5e7a-5eed-7000-8000-000000000008", displayName: "Kim" });
    const answer = partnersFrom(
      { ok: true, value: [theoForNoor, lena, kim] },
      { ok: true, value: [child(ILO, "Ilo", "2026-08-23")] },
      { ok: true, value: pregnancy({ status: "ended", endedAt: "2026-08-23", gestation: null }) },
    );
    expect(answer).toEqual({
      ok: true,
      value: { people: [theoForNoor, lena], childNames: { [ILO]: "Ilo" }, pregnancyPaused: true },
    });
  });

  it("fails when the sharing read failed, and pauses nothing without an ended pregnancy", () => {
    expect(partnersFrom({ ok: false }, { ok: true, value: [] }, null)).toEqual({ ok: false });
    const open = partnersFrom(
      { ok: true, value: [] },
      { ok: false },
      { ok: true, value: pregnancy() },
    );
    expect(open.ok && open.value.pregnancyPaused).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* loadToday per stage                                                 */
/* ------------------------------------------------------------------ */

describe("loadToday, cycle stage", () => {
  it("places the ring from the status and reads the period days from the week's start", async () => {
    noorAnswers();
    const view = await loadToday(api(), me());
    expect(view.hero).toEqual({
      kind: "cycle",
      prediction: prediction(),
      cycleDay: 3,
      latestStart: "2026-10-03",
      loggedDays: ["2026-10-03", "2026-10-04", "2026-10-05"],
      week: { logged: { start: "2026-10-03", end: "2026-10-05" }, nextPeriod: null, fertile: null },
      nudge: true,
    });
    expect(view.log?.stage).toBe("cycle");
    expect(view.log?.initial?.entry).toMatchObject({ status: "live", values: { flow: "medium" } });
    expect(view.partners).toMatchObject({ ok: true, value: { people: [theoForNoor] } });
    expect(view.child).toBeNull();
    // Dates and a page size only ever travel in the query (architecture 9.1).
    expect(calls).toContain("GET /api/v1/cycle/entries?from=2026-10-03&to=2026-10-05&limit=200");
    expect(calls).toContain("GET /api/v1/cycle/entries?from=2026-10-05&to=2026-10-05");
  });

  it("is the empty state before the first log, with no cycle day", async () => {
    noorAnswers();
    answer("GET /api/v1/cycle/predictions", { status: 200, body: none });
    answer("GET /api/v1/cycle/status", {
      status: 200,
      body: status({ cycleDay: null, periodDay: null }),
    });
    const view = await loadToday(api(), me());
    expect(view.hero).toEqual({ kind: "empty" });
    expect(calls.some((call) => call.includes("limit=200") && call.includes("entries"))).toBe(
      false,
    );
  });

  it("is the quiet card when a pregnancy is on record and no period came after it", async () => {
    noorAnswers();
    answer("GET /api/v1/cycle/predictions", { status: 200, body: none });
    // The owner's own status counts through a pregnancy; Today never shows it while the basis is none.
    answer("GET /api/v1/cycle/status", { status: 200, body: status({ cycleDay: 71 }) });
    answer("GET /api/v1/pregnancies/current", {
      status: 200,
      body: pregnancy({
        status: "ended",
        endedAt: "2026-09-20",
        endedReason: "loss",
        gestation: null,
      }),
    });
    const view = await loadToday(api(), me());
    expect(view.hero).toEqual({ kind: "quiet", feeding: false });
  });

  it("says the cycle failed when the prediction, the status or the entries failed", async () => {
    for (const failing of [
      "GET /api/v1/cycle/predictions",
      "GET /api/v1/cycle/status",
      "GET /api/v1/cycle/entries",
    ]) {
      routes = new Map();
      noorAnswers();
      answer(failing, broken);
      if (failing === "GET /api/v1/cycle/entries") {
        // Today's own day still loads; only the range read fails.
        answer("GET /api/v1/cycle/entries?from=2026-10-05&to=2026-10-05", list([]));
      }
      const view = await loadToday(api(), me());
      expect(view.hero, failing).toEqual({ kind: "failed" });
    }
  });

  it("cannot tell the empty state from the quiet card without the pregnancy, so it says so", async () => {
    noorAnswers();
    answer("GET /api/v1/cycle/predictions", { status: 200, body: none });
    answer("GET /api/v1/pregnancies/current", "drop");
    expect((await loadToday(api(), me())).hero).toEqual({ kind: "failed" });
  });

  it("keeps the open card and loads the day in the browser when the server could not", async () => {
    noorAnswers();
    answer("GET /api/v1/notes", broken);
    answer("GET /api/v1/sharing", broken);
    const view = await loadToday(api(), me());
    expect(view.log).toEqual({ stage: "cycle", initial: null });
    expect(view.partners).toEqual({ ok: false });
    expect(view.hero.kind).toBe("cycle");
  });
});

describe("loadToday, postpartum stage", () => {
  function miraAnswers() {
    answer("GET /api/v1/cycle/predictions", { status: 200, body: none });
    answer("GET /api/v1/cycle/status", {
      status: 200,
      body: status({ subjectId: MIRA, cycleDay: null, periodDay: null }),
    });
    answer("GET /api/v1/pregnancies/current", {
      status: 200,
      body: pregnancy({
        subjectId: MIRA,
        status: "ended",
        endedAt: "2026-08-23",
        endedReason: "birth",
        gestation: null,
      }),
    });
    answer(
      "GET /api/v1/children",
      list([child(ILO, "Ilo", "2026-08-23", [MIRA, LENA]), child(SOL, "Sol", "2024-04-04")]),
    );
    answer("GET /api/v1/sharing", list([]));
    answer("GET /api/v1/cycle/entries", list([]));
    answer("GET /api/v1/notes", list([]));
  }
  const mira = () => me({ stage: "postpartum", displayName: "Mira" }, { guardianOf: [ILO, SOL] });

  it("shows the child's age and the quiet card with the feeding line until a period is logged", async () => {
    miraAnswers();
    const view = await loadToday(api(), mira());
    expect(view.hero).toEqual({ kind: "quiet", feeding: true });
    expect(view.child).toEqual({
      ok: true,
      value: { id: ILO, name: "Ilo", age: "6 weeks, 1 day" },
    });
    expect(view.log?.stage).toBe("postpartum");
    expect(view.partners).toMatchObject({ ok: true, value: { pregnancyPaused: true } });
  });

  it("returns to the cycle view once a period after the birth gives a prediction, without the nudge", async () => {
    miraAnswers();
    answer("GET /api/v1/cycle/predictions", {
      status: 200,
      body: prediction({ subjectId: MIRA, basis: "first_guess", sampleSize: 0, irregular: true }),
    });
    answer("GET /api/v1/cycle/status", {
      status: 200,
      body: status({ subjectId: MIRA, cycleDay: 2, periodDay: 2 }),
    });
    const view = await loadToday(api(), mira());
    expect(view.hero).toMatchObject({ kind: "cycle", nudge: false, cycleDay: 2 });
    expect(view.child).toMatchObject({ ok: true, value: { name: "Ilo" } });
  });

  it("says the children could not be read rather than guessing", async () => {
    miraAnswers();
    answer("GET /api/v1/children", broken);
    expect((await loadToday(api(), mira())).child).toEqual({ ok: false });
  });
});

describe("loadToday, pregnancy stage", () => {
  const lena = () => me({ stage: "pregnancy", displayName: "Lena" });

  it("puts her open pregnancy's due date and dating method in the week card", async () => {
    answer("GET /api/v1/pregnancies/current", { status: 200, body: pregnancy() });
    answer("GET /api/v1/cycle/entries", list([]));
    answer("GET /api/v1/notes", list([]));
    answer("GET /api/v1/sharing", list([]));
    answer("GET /api/v1/children", list([]));
    const view = await loadToday(api(), lena());
    expect(view.hero).toEqual({
      kind: "pregnancy",
      pregnancy: { ok: true, value: { dueDate: "2027-02-07", method: "ultrasound" } },
    });
    expect(view.log?.stage).toBe("pregnancy");
    // No prediction is read in pregnancy: there is none (architecture 8.4).
    expect(calls.some((call) => call.includes("predictions"))).toBe(false);
  });

  it("gives the week card nothing for a pregnancy that ended, and a failure for a read that failed", async () => {
    answer("GET /api/v1/pregnancies/current", {
      status: 200,
      body: pregnancy({ status: "ended", endedAt: "2026-09-01", gestation: null }),
    });
    answer("GET /api/v1/cycle/entries", list([]));
    answer("GET /api/v1/notes", list([]));
    answer("GET /api/v1/sharing", list([]));
    answer("GET /api/v1/children", list([]));
    expect((await loadToday(api(), lena())).hero).toEqual({
      kind: "pregnancy",
      pregnancy: { ok: true, value: null },
    });
    answer("GET /api/v1/pregnancies/current", broken);
    expect((await loadToday(api(), lena())).hero).toEqual({
      kind: "pregnancy",
      pregnancy: { ok: false },
    });
  });
});

describe("loadToday, none stage", () => {
  it("reads the status a status grant reaches, with the owner's name, and never a day to log", async () => {
    answer("GET /api/v1/sharing", list([person({ id: NOOR, displayName: "Noor", role: "owner" })]));
    answer("GET /api/v1/children", list([]));
    answer(`GET /api/v1/cycle/status?subject=${NOOR}`, { status: 200, body: status() });
    const theo = me(
      { stage: "none", displayName: "Theo" },
      {
        id: THEO,
        grants: [
          {
            id: "018f5e7a-5eed-7003-8000-000000000001",
            ownerId: NOOR,
            category: "cycle.status",
            level: "summary",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "018f5e7a-5eed-7003-8000-000000000002",
            ownerId: NOOR,
            category: "cycle.symptoms",
            level: "read",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    );
    const view = await loadToday(api(), theo);
    expect(view.hero).toEqual({
      kind: "shared",
      people: [
        {
          ownerId: NOOR,
          name: { ok: true, value: "Noor" },
          status: { ok: true, value: status() },
          pregnancy: null,
        },
      ],
      children: { ok: true, value: [] },
    });
    expect(view.log).toBeNull();
    // Theo shares nothing of his own, so there is no card about what others see of his.
    expect(view.partners).toBeNull();
    // A symptoms grant has no summary on Today; nothing reads the owner's entries or predictions.
    expect(calls.some((call) => call.includes("entries") || call.includes("predictions"))).toBe(
      false,
    );
  });

  it("shows the children it sees, and the pregnancy an overview grant reaches", async () => {
    answer("GET /api/v1/sharing", list([]));
    answer("GET /api/v1/children", list([child(SOL, "Sol", "2024-04-04")]));
    answer(`GET /api/v1/pregnancies/current?subject=${LENA}`, {
      status: 200,
      body: { status: "paused" },
    });
    const pia = me(
      { stage: "none", displayName: "Pia", weekStart: 7 },
      {
        grants: [
          {
            id: "018f5e7a-5eed-7003-8000-000000000005",
            ownerId: LENA,
            category: "pregnancy.overview",
            level: "summary",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    );
    const view = await loadToday(api(), pia);
    expect(view.hero).toEqual({
      kind: "shared",
      people: [
        {
          ownerId: LENA,
          // Lena is not in Pia's sharing list, so the read answered and there is no name to show.
          name: { ok: true, value: null },
          status: null,
          pregnancy: { ok: true, value: { status: "paused" } },
        },
      ],
      children: { ok: true, value: [{ id: SOL, name: "Sol", age: "2 years, 6 months" }] },
    });
  });

  it("answers each failed read in its own place", async () => {
    answer("GET /api/v1/sharing", "drop");
    answer("GET /api/v1/children", broken);
    answer(`GET /api/v1/cycle/status?subject=${NOOR}`, broken);
    const theo = me(
      { stage: "none" },
      {
        grants: [
          {
            id: "018f5e7a-5eed-7003-8000-000000000001",
            ownerId: NOOR,
            category: "cycle.status",
            level: "summary",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    );
    const view = await loadToday(api(), theo);
    // Changed on purpose after review: a failed sharing read used to leave the name null and the
    // partner card out, so nothing said a read failed. Now the name is a failure the summary card
    // says, and the partner card stays to say its own failure line.
    expect(view.hero).toEqual({
      kind: "shared",
      people: [{ ownerId: NOOR, name: { ok: false }, status: { ok: false }, pregnancy: null }],
      children: { ok: false },
    });
    expect(view.partners).toEqual({ ok: false });
  });

  it("keeps the partner card out only when the sharing read answered that nothing is shared", async () => {
    answer("GET /api/v1/sharing", list([person({ id: NOOR, displayName: "Noor", role: "owner" })]));
    answer("GET /api/v1/children", list([]));
    const view = await loadToday(api(), me({ stage: "none" }));
    expect(view.partners).toBeNull();
    answer("GET /api/v1/sharing", broken);
    const failedRead = await loadToday(api(), me({ stage: "none" }));
    expect(failedRead.partners).toEqual({ ok: false });
  });
});

describe("Part", () => {
  it("is a value or a failure, nothing in between", () => {
    const parts: Part<number>[] = [{ ok: true, value: 1 }, { ok: false }];
    expect(parts.map((part) => (part.ok ? part.value : "failed"))).toEqual([1, "failed"]);
  });
});
