import { describe, expect, it } from "vitest";

import {
  ActivityEvent,
  ActivityPage,
  ActivityQuery,
  CloseInput,
  CloseUndone,
  ClosureReplay,
  ClosureRequest,
  DataCategory,
  ExportLine,
} from "./account";

const ID = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const OTHER = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f20";
const AT = "2026-10-05T12:00:00.000Z";

describe("ActivityEvent", () => {
  it("accepts a neutral dotted action with an optional category and child", () => {
    const row = ActivityEvent.parse({
      id: ID,
      action: "grant.revoke",
      actorId: ID,
      subjectId: OTHER,
      category: "child",
      childId: OTHER,
      occurredAt: AT,
    });
    expect(row.category).toBe("child");
  });

  it("refuses an action that is not a dotted name", () => {
    for (const action of ["read", "Grant.Revoke", "nausea logged", "grant.", ".create"]) {
      const result = ActivityEvent.safeParse({
        id: ID,
        action,
        actorId: ID,
        subjectId: ID,
        occurredAt: AT,
      });
      expect(result.success, action).toBe(false);
    }
  });

  it("names every category the audit log can hold, the private journal included", () => {
    expect(DataCategory.options).toEqual([
      "cycle.status",
      "cycle.history",
      "cycle.symptoms",
      "journal.private",
      "pregnancy.overview",
      "pregnancy.photos",
      "child",
    ]);
  });
});

describe("ActivityPage and ActivityQuery", () => {
  it("ends with a null cursor on the last page", () => {
    const page = ActivityPage.parse({ items: [], nextCursor: null });
    expect(page.nextCursor).toBeNull();
  });

  it("defaults the limit to 50 and bounds it to 1 through 200, coercing the query string", () => {
    expect(ActivityQuery.parse({}).limit).toBe(50);
    expect(ActivityQuery.parse({ limit: "200" }).limit).toBe(200);
    expect(ActivityQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(ActivityQuery.safeParse({ limit: "201" }).success).toBe(false);
    expect(ActivityQuery.safeParse({ limit: "2.5" }).success).toBe(false);
    expect(ActivityQuery.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("closure", () => {
  it("accepts the two modes and nothing else", () => {
    expect(CloseInput.parse({ mode: "undo-window" }).mode).toBe("undo-window");
    expect(CloseInput.parse({ mode: "now" }).mode).toBe("now");
    expect(CloseInput.safeParse({ mode: "later" }).success).toBe(false);
    expect(CloseInput.safeParse({}).success).toBe(false);
  });

  it("carries a nullable undo deadline and the 45 day deadline", () => {
    const request = ClosureRequest.parse({
      id: ID,
      mode: "now",
      state: "requested",
      requestedAt: AT,
      undoUntil: null,
      deadlineAt: AT,
    });
    expect(request.undoUntil).toBeNull();
    expect(ClosureRequest.safeParse({ ...request, state: "done" }).success).toBe(false);
  });

  it("says that nothing revoked comes back after an undo", () => {
    const undone = CloseUndone.parse({
      request: {
        id: ID,
        mode: "undo-window",
        state: "cancelled",
        requestedAt: AT,
        undoUntil: AT,
        deadlineAt: AT,
      },
      sessionsRestored: false,
      grantsRestored: false,
    });
    expect(undone.sessionsRestored).toBe(false);
    expect(
      CloseUndone.safeParse({ ...undone, sessionsRestored: true }).success,
      "the literal is false by design",
    ).toBe(false);
  });
});

describe("ExportLine", () => {
  it("is a header or a record, and a record names its kind in camel case", () => {
    expect(
      ExportLine.parse({ kind: "export", format: 1, subjectId: ID, generatedAt: AT }),
    ).toMatchObject({ kind: "export" });
    expect(ExportLine.parse({ kind: "cycleEntry", data: { id: ID } })).toMatchObject({
      kind: "cycleEntry",
    });
    expect(ExportLine.safeParse({ kind: "cycle_entry", data: {} }).success).toBe(false);
    expect(ExportLine.safeParse({ kind: "export", format: 2 }).success).toBe(false);
  });

  it("ends with an end line counting the records, and no record may take the header's or the end's kind", () => {
    expect(ExportLine.parse({ kind: "end", records: 3 })).toEqual({ kind: "end", records: 3 });
    expect(ExportLine.safeParse({ kind: "end", records: -1 }).success).toBe(false);
    expect(ExportLine.safeParse({ kind: "end", data: {} }).success).toBe(false);
    expect(ExportLine.safeParse({ kind: "export", data: {} }).success).toBe(false);
  });
});

describe("ClosureReplay", () => {
  it("is the request id alone, as a replayed close answers", () => {
    expect(ClosureReplay.parse({ id: ID })).toEqual({ id: ID });
    expect(ClosureReplay.safeParse({ id: "not-an-id" }).success).toBe(false);
  });
});
