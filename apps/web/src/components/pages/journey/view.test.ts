import type { Me } from "@tidefern/api-client";
import { describe, expect, it } from "vitest";
import {
  birthChild,
  eventRow,
  historyRows,
  journeyView,
  overviewGrantees,
  type Child,
  type JourneyReads,
  type Pregnancy,
  type PregnancyEvent,
  type PregnancyOverview,
  type SharingPerson,
} from "./view";

const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const PREGNANCY = "018f5e7a-5eed-7300-8000-000000000001";
const today = "2026-10-04";

function me(patch: Partial<Me> = {}, stage: NonNullable<Me["profile"]>["stage"] = "pregnancy"): Me {
  return {
    id: LENA,
    profile: {
      displayName: "Lena",
      timeZone: "America/Vancouver",
      stage,
      weekStart: 7,
      units: "metric",
      notificationDetail: "generic",
    },
    today,
    guardianOf: [],
    grants: [],
    session: {
      expiresAt: "2026-10-12T00:00:00.000Z",
      authenticatedAt: "2026-10-04T08:00:00.000Z",
    },
    ...patch,
  };
}

function pregnancy(patch: Partial<Pregnancy> = {}): Pregnancy {
  return {
    id: PREGNANCY,
    subjectId: LENA,
    status: "active",
    dueDate: "2027-02-07",
    datingMethod: "ultrasound",
    startedAt: "2026-06-28T00:00:00.000Z",
    endedAt: null,
    endedReason: null,
    gestation: { weeks: 22, days: 0, totalDays: 154, trimester: 2, label: "22w0d" },
    version: 2,
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...patch,
  };
}

function event(patch: Partial<PregnancyEvent> = {}): PregnancyEvent {
  return {
    id: "018f5e7a-5eed-7400-8000-000000000001",
    pregnancyId: PREGNANCY,
    subjectId: LENA,
    authorId: LENA,
    kind: "appointment",
    date: "2026-09-20",
    detail: "Anatomy scan",
    version: 1,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...patch,
  };
}

const glucose = event({
  id: "018f5e7a-5eed-7400-8000-000000000004",
  authorId: MIRA,
  date: "2026-11-01",
  detail: "Glucose screening",
});

const people: SharingPerson[] = [
  {
    id: MIRA,
    displayName: "Mira",
    role: "owner",
    householdId: "018f5e7a-5eed-7100-8000-000000000002",
    guardianOf: [],
    grants: [
      {
        id: "018f5e7a-5eed-7200-8000-000000000004",
        category: "pregnancy.overview",
        level: "contribute",
        notify: false,
        version: 1,
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z",
      },
    ],
    notify: false,
    version: 1,
  },
];

const overview: PregnancyOverview = {
  status: "active",
  id: PREGNANCY,
  subjectId: LENA,
  dueDate: "2027-02-07",
  gestation: { weeks: 22, days: 0, totalDays: 154, trimester: 2, label: "22w0d" },
  version: 2,
};

const ilo: Child = {
  id: "018f5e7a-5eed-7500-8000-000000000001",
  displayName: "Ilo",
  dateOfBirth: "2026-08-23",
  sex: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  version: 1,
};

const sol: Child = {
  ...ilo,
  id: "018f5e7a-5eed-7500-8000-000000000002",
  displayName: "Sol",
  dateOfBirth: "2024-04-05",
};

function reads(patch: Partial<JourneyReads>): JourneyReads {
  return { own: { kind: "none" }, shared: [], people: null, ...patch };
}

describe("her own active pregnancy", () => {
  it("carries the method and her rights, the weeks around today and the history in her zone", () => {
    const view = journeyView(
      me(),
      today,
      reads({
        own: {
          kind: "active",
          pregnancy: pregnancy(),
          events: { ok: true, value: [event(), glucose] },
          history: {
            ok: true,
            value: [
              {
                id: "018f5e7a-5eed-7600-8000-000000000001",
                previousDueDate: "2027-02-15",
                nextDueDate: "2027-02-07",
                method: "ultrasound",
                changedAt: "2026-08-10T00:00:00.000Z",
              },
            ],
          },
        },
        people: { ok: true, value: people },
      }),
    );
    expect(view.own?.kind).toBe("active");
    if (view.own?.kind !== "active") return;
    const own = view.own;
    expect(own.pregnancy).toMatchObject({
      id: PREGNANCY,
      method: "ultrasound",
      today,
      start: "2026-05-03",
      canAdd: true,
      canEdit: true,
      canDelete: true,
    });
    expect(own.pregnancy.weeks?.earlier.map((group) => group.week)).toEqual([20]);
    const ahead = own.pregnancy.weeks?.ahead ?? [];
    expect(ahead.map((group) => group.week)).toEqual([22, 26]);
    expect(ahead.find((group) => group.week === 26)?.items).toEqual([
      expect.objectContaining({
        title: "Glucose screening",
        note: "Appointment, added by Mira",
        expected: true,
      }),
    ]);
    // Midnight UTC on Aug 10 is still Aug 9 in Vancouver.
    expect(own.history).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ changedOn: "2026-08-09", from: "2027-02-15", to: "2027-02-07" }),
      ],
    });
    expect(own.sharedWith).toEqual(["Mira"]);
  });

  it("says each part that failed on its own and keeps the rest", () => {
    const view = journeyView(
      me(),
      today,
      reads({
        own: {
          kind: "active",
          pregnancy: pregnancy(),
          events: { ok: false },
          history: { ok: false },
        },
        people: { ok: false },
      }),
    );
    if (view.own?.kind !== "active") throw new Error("expected the active view");
    expect(view.own.pregnancy.weeks).toBeNull();
    expect(view.own.history).toEqual({ ok: false });
    expect(view.own.sharedWith).toBeNull();
  });

  it("is the failure sentence when her own read failed", () => {
    expect(journeyView(me(), today, reads({ own: { kind: "failed" } })).own).toEqual({
      kind: "failed",
    });
  });
});

describe("eventRow", () => {
  const context = { viewerId: LENA, today, names: new Map([[MIRA, "Mira"]]) };

  it("titles a row by its detail and names the kind under it", () => {
    expect(eventRow(event(), context)).toMatchObject({
      title: "Anatomy scan",
      note: "Appointment",
      detail: "Anatomy scan",
      expected: false,
    });
  });

  it("titles a row by its kind when there is no detail, as a summary grantee always sees it", () => {
    const summary = event({ kind: "milestone", date: "2026-10-05" });
    delete summary.detail;
    delete summary.authorId;
    expect(eventRow(summary, { ...context, viewerId: MIRA })).toMatchObject({
      title: "Milestone",
      note: null,
      detail: null,
      expected: true,
    });
  });

  it("says who added a row only when that was not the pregnancy's subject", () => {
    expect(eventRow(glucose, { ...context, viewerId: MIRA }).note).toBe(
      "Appointment, added by you",
    );
    expect(eventRow(event({ authorId: MIRA, detail: null }), context).note).toBe("Added by Mira");
    expect(eventRow(glucose, { ...context, names: new Map() }).note).toBe("Appointment");
  });
});

describe("a pregnancy shared with her", () => {
  const grantee = me(
    {
      id: MIRA,
      grants: [
        {
          id: "018f5e7a-5eed-7200-8000-000000000004",
          ownerId: LENA,
          category: "pregnancy.overview",
          level: "contribute",
          createdAt: "2026-08-05T00:00:00.000Z",
        },
      ],
    },
    "postpartum",
  );

  it("never carries a method, lets a contributor add and edit but never delete", () => {
    const view = journeyView(
      grantee,
      today,
      reads({
        own: {
          kind: "none",
          children: { ok: true, value: [] },
          basis: { ok: true, value: "none" },
        },
        shared: [
          {
            ownerId: LENA,
            level: "contribute",
            kind: "active",
            pregnancy: overview,
            events: { ok: true, value: [glucose] },
          },
        ],
        people: { ok: true, value: [{ ...people[0]!, id: LENA, displayName: "Lena" }] },
      }),
    );
    const shared = view.shared[0];
    expect(shared).toMatchObject({ kind: "active", name: "Lena", highlight: true });
    if (shared?.kind !== "active") return;
    expect(shared.pregnancy).not.toHaveProperty("method");
    expect(shared.pregnancy).toMatchObject({ canAdd: true, canEdit: true, canDelete: false });
  });

  it("gives a reader or a summary grantee no way to write", () => {
    for (const level of ["read", "summary"] as const) {
      const view = journeyView(
        grantee,
        today,
        reads({
          shared: [
            {
              ownerId: LENA,
              level,
              kind: "active",
              pregnancy: overview,
              events: { ok: true, value: [] },
            },
          ],
        }),
      );
      expect(view.shared[0]).toMatchObject({
        pregnancy: { canAdd: false, canEdit: false, canDelete: false },
      });
    }
  });

  it("counts the subject's today from the gestation the API sent, whatever her own zone", () => {
    const berlin = journeyView(
      { ...grantee, today: "2026-10-05" },
      "2026-10-05",
      reads({
        shared: [
          {
            ownerId: LENA,
            level: "read",
            kind: "active",
            pregnancy: overview,
            events: { ok: true, value: [] },
          },
        ],
      }),
    );
    expect(berlin.shared[0]).toMatchObject({ pregnancy: { today: "2026-10-04" } });
  });

  it("is the paused card with nothing else once the pregnancy has ended", () => {
    const view = journeyView(
      me(),
      today,
      reads({
        own: {
          kind: "active",
          pregnancy: pregnancy(),
          events: { ok: true, value: [] },
          history: { ok: true, value: [] },
        },
        shared: [{ ownerId: MIRA, level: "summary", kind: "paused" }],
        people: { ok: true, value: people },
      }),
    );
    expect(view.shared).toEqual([{ ownerId: MIRA, name: "Mira", kind: "paused" }]);
  });

  it("keeps the warmth on her own card, and on the first shared one when she has none", () => {
    const sharedActive = (ownerId: string) => ({
      ownerId,
      level: "read" as const,
      kind: "active" as const,
      pregnancy: overview,
      events: { ok: true as const, value: [] },
    });
    const withOwn = journeyView(
      me(),
      today,
      reads({
        own: {
          kind: "active",
          pregnancy: pregnancy(),
          events: { ok: true, value: [] },
          history: { ok: true, value: [] },
        },
        shared: [sharedActive(MIRA)],
      }),
    );
    expect(withOwn.shared[0]).toMatchObject({ highlight: false });
    const without = journeyView(
      me({}, "none"),
      today,
      reads({ shared: [sharedActive(MIRA), sharedActive(LENA)] }),
    );
    expect(
      without.shared.map((shared) => (shared.kind === "active" ? shared.highlight : null)),
    ).toEqual([true, false]);
    expect(without.own).toBeNull();
  });
});

describe("after an ending", () => {
  const ended = pregnancy({
    status: "ended",
    endedAt: "2026-08-23",
    endedReason: "birth",
    gestation: null,
  });

  it("shows the child born that day and says predictions are paused until a period is logged", () => {
    const view = journeyView(
      me({ id: MIRA, guardianOf: [ilo.id, sol.id] }, "postpartum"),
      today,
      reads({
        own: {
          kind: "ended",
          pregnancy: ended,
          children: { ok: true, value: [sol, ilo] },
          basis: { ok: true, value: "none" },
        },
      }),
    );
    expect(view.own).toEqual({
      kind: "postpartum",
      child: { name: "Ilo", age: "6 weeks" },
      childrenFailed: false,
      predictionsPaused: true,
    });
  });

  it("drops the paused sentence once a period has been logged again", () => {
    const view = journeyView(
      me({ guardianOf: [ilo.id] }, "postpartum"),
      today,
      reads({
        own: {
          kind: "ended",
          pregnancy: ended,
          children: { ok: false },
          basis: { ok: true, value: "first_guess" },
        },
      }),
    );
    expect(view.own).toEqual({
      kind: "postpartum",
      child: null,
      childrenFailed: true,
      predictionsPaused: false,
    });
  });

  it("is the quiet card after a loss, with nothing week-shaped and never the reason", () => {
    const loss = pregnancy({
      status: "ended",
      endedAt: "2026-09-30",
      endedReason: "loss",
      gestation: null,
    });
    const view = journeyView(
      me({}, "cycle"),
      today,
      reads({ own: { kind: "ended", pregnancy: loss, basis: { ok: true, value: "none" } } }),
    );
    expect(view.own).toEqual({ kind: "after-ending", predictionsPaused: true });
    expect(JSON.stringify(view)).not.toContain("loss");
    const later = journeyView(
      me({}, "cycle"),
      today,
      reads({ own: { kind: "ended", pregnancy: loss, basis: { ok: true, value: "estimate" } } }),
    );
    expect(later.own).toEqual({ kind: "after-ending", predictionsPaused: false });
  });
});

describe("without a pregnancy", () => {
  it("is the empty state for a person who could start one", () => {
    for (const stage of ["cycle", "pregnancy"] as const) {
      expect(journeyView(me({}, stage), today, reads({})).own).toEqual({ kind: "empty" });
    }
  });

  it("asks the none stage no body question", () => {
    expect(journeyView(me({}, "none"), today, reads({})).own).toEqual({ kind: "nothing-shared" });
  });

  it("is the postpartum view for a postpartum profile without a record", () => {
    const view = journeyView(
      me({ guardianOf: [ilo.id] }, "postpartum"),
      today,
      reads({
        own: {
          kind: "none",
          children: { ok: true, value: [ilo] },
          basis: { ok: true, value: "none" },
        },
      }),
    );
    expect(view.own).toMatchObject({ kind: "postpartum", child: { name: "Ilo" } });
  });
});

describe("helpers", () => {
  it("names who will see her pregnancy paused, or nobody when a name is unknown", () => {
    expect(overviewGrantees({ ok: true, value: people })).toEqual(["Mira"]);
    expect(overviewGrantees({ ok: true, value: [] })).toEqual([]);
    expect(
      overviewGrantees({ ok: true, value: [{ ...people[0]!, displayName: null }] }),
    ).toBeNull();
    expect(overviewGrantees({ ok: false })).toBeNull();
    expect(overviewGrantees({ ok: true, value: [{ ...people[0]!, grants: [] }] })).toEqual([]);
  });

  it("finds the child born on the ending day, else the youngest she guards", () => {
    expect(birthChild([sol, ilo], [sol.id, ilo.id], "2026-08-23", today)?.displayName).toBe("Ilo");
    expect(birthChild([sol, ilo], [sol.id, ilo.id], null, today)?.displayName).toBe("Ilo");
    expect(birthChild([sol, ilo], [sol.id], "2026-08-23", today)?.displayName).toBe("Sol");
    expect(birthChild([ilo], [], "2026-08-23", today)).toBeNull();
  });

  it("dates each due date change by its day in her zone", () => {
    expect(
      historyRows(
        [
          {
            id: "a",
            previousDueDate: "2027-02-15",
            nextDueDate: "2027-02-07",
            method: "manual",
            changedAt: "2026-08-10T06:59:00.000Z",
          },
        ],
        "America/Vancouver",
      )[0]?.changedOn,
    ).toBe("2026-08-09");
  });
});
