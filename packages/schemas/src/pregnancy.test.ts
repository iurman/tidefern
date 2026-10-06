import { describe, expect, it } from "vitest";

import {
  CalendarDate,
  DatingMethod,
  EndedReason,
  Id,
  PregnancyDatingInput,
  PregnancyEndInput,
  PregnancyEvent,
  PregnancyEventInput,
  PregnancyEventKind,
  PregnancyEventUpdate,
  PregnancyStartInput,
  PregnancyView,
} from "./index";

const ID = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";

describe("the pregnancy vocabularies", () => {
  it("are closed lists that mirror packages/core", () => {
    expect(DatingMethod.options).toEqual(["lmp", "ultrasound", "transfer", "manual"]);
    expect(EndedReason.options).toEqual(["birth", "loss", "other"]);
    expect(PregnancyEventKind.options).toEqual(["appointment", "milestone"]);
    expect(EndedReason.safeParse("unknown").success).toBe(false);
  });
});

describe("PregnancyDatingInput", () => {
  it("accepts one shape per method and refuses a mixed one", () => {
    expect(PregnancyDatingInput.parse({ method: "lmp", lastPeriodStart: "2026-01-10" })).toEqual({
      method: "lmp",
      lastPeriodStart: "2026-01-10",
    });
    expect(
      PregnancyDatingInput.parse({
        method: "ultrasound",
        scanDate: "2026-03-07",
        weeks: 8,
        days: 0,
      }),
    ).toMatchObject({ weeks: 8, days: 0 });
    expect(
      PregnancyDatingInput.parse({
        method: "transfer",
        transferDate: "2026-02-01",
        embryoAgeDays: 5,
      }),
    ).toMatchObject({ embryoAgeDays: 5 });
    expect(PregnancyDatingInput.parse({ method: "manual", dueDate: "2026-10-17" })).toMatchObject({
      dueDate: "2026-10-17",
    });
    expect(PregnancyDatingInput.safeParse({ method: "lmp", dueDate: "2026-10-17" }).success).toBe(
      false,
    );
    expect(PregnancyDatingInput.safeParse({ method: "guess" }).success).toBe(false);
  });
  it("bounds the scan age and the embryo age", () => {
    expect(
      PregnancyDatingInput.safeParse({
        method: "ultrasound",
        scanDate: "2026-03-07",
        weeks: 8,
        days: 7,
      }).success,
    ).toBe(false);
    expect(
      PregnancyDatingInput.safeParse({
        method: "transfer",
        transferDate: "2026-02-01",
        embryoAgeDays: 0,
      }).success,
    ).toBe(false);
  });
  it("takes dates as YYYY-MM-DD only, never a timestamp", () => {
    expect(
      PregnancyDatingInput.safeParse({ method: "lmp", lastPeriodStart: "2026-01-10T00:00:00Z" })
        .success,
    ).toBe(false);
  });
});

describe("PregnancyStartInput", () => {
  it("takes an optional client-minted v7 id", () => {
    const dating = { method: "lmp", lastPeriodStart: "2026-01-10" } as const;
    expect(PregnancyStartInput.parse({ dating })).toEqual({ dating });
    expect(PregnancyStartInput.parse({ id: ID, dating }).id).toBe(ID);
    const v4 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(PregnancyStartInput.safeParse({ id: v4, dating }).success).toBe(false);
  });
});

describe("PregnancyEventInput", () => {
  it("accepts a kind, a date and an optional bounded detail", () => {
    expect(PregnancyEventInput.parse({ kind: "appointment", date: "2026-03-07" })).toEqual({
      kind: "appointment",
      date: "2026-03-07",
    });
    expect(
      PregnancyEventInput.parse({ kind: "milestone", date: "2026-03-07", detail: "  first kick  " })
        .detail,
    ).toBe("first kick");
    expect(
      PregnancyEventInput.safeParse({
        kind: "milestone",
        date: "2026-03-07",
        detail: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(PregnancyEventInput.safeParse({ kind: "symptom", date: "2026-03-07" }).success).toBe(
      false,
    );
  });
  it("has an update shape without the id", () => {
    expect(
      PregnancyEventUpdate.safeParse({ id: ID, kind: "milestone", date: "2026-03-07" }).success,
    ).toBe(true);
    expect(
      PregnancyEventUpdate.parse({ id: ID, kind: "milestone", date: "2026-03-07" }),
    ).not.toHaveProperty("id");
  });
});

describe("PregnancyEndInput", () => {
  it("needs the day and a reason from the closed list", () => {
    expect(PregnancyEndInput.parse({ endedAt: "2026-10-12", reason: "birth" }).reason).toBe(
      "birth",
    );
    expect(PregnancyEndInput.safeParse({ endedAt: "2026-10-12", reason: "moved" }).success).toBe(
      false,
    );
    expect(PregnancyEndInput.safeParse({ reason: "birth" }).success).toBe(false);
  });
});

describe("the response shapes", () => {
  it("project a grantee's view without the reason or the history, and a paused view with nothing", () => {
    const paused = PregnancyView.parse({ status: "paused" });
    expect(paused).toStrictEqual({ status: "paused" });
    const overview = PregnancyView.parse({
      status: "active",
      id: ID,
      subjectId: ID,
      dueDate: "2026-10-17",
      gestation: { weeks: 10, days: 0, totalDays: 70, trimester: 1, label: "10w0d" },
      version: 1,
    });
    expect(Object.keys(overview)).not.toContain("endedReason");
    expect(PregnancyView.safeParse({ status: "active", id: ID }).success).toBe(false);
  });
  it("leave the detail and the author off a summary event", () => {
    const summary = PregnancyEvent.parse({
      id: ID,
      pregnancyId: ID,
      subjectId: ID,
      kind: "appointment",
      date: "2026-03-07",
      version: 1,
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z",
    });
    expect(summary).not.toHaveProperty("detail");
    expect(summary).not.toHaveProperty("authorId");
  });
});

describe("the mirrored primitives", () => {
  it("accept and refuse the same strings as CalendarDate and Id", () => {
    for (const value of ["2026-01-10", "2026-1-10", "2026-01-10T00:00:00Z", "", "today"]) {
      expect(PregnancyEndInput.safeParse({ endedAt: value, reason: "birth" }).success).toBe(
        CalendarDate.safeParse(value).success,
      );
    }
    for (const value of [ID, "not-an-id", "3f2504e0-4f89-41d3-9a0c-0305e82c3301"]) {
      expect(PregnancyView.safeParse({ status: "paused" }).success).toBe(true);
      expect(
        PregnancyEvent.safeParse({
          id: value,
          pregnancyId: ID,
          subjectId: ID,
          kind: "appointment",
          date: "2026-03-07",
          version: 1,
          createdAt: "2026-03-01T09:00:00.000Z",
          updatedAt: "2026-03-01T09:00:00.000Z",
        }).success,
      ).toBe(Id.safeParse(value).success);
    }
  });
});
