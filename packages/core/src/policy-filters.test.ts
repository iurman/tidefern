import { describe, expect, it } from "vitest";
import { CATEGORIES, categoriesFor, listScope, projectRow, STORAGE_MAP } from "./policy-filters";
import type { Actor, Category } from "./policy";

const her = "11111111-1111-7111-8111-111111111111";
const partner = "22222222-2222-7222-8222-222222222222";
const child = "33333333-3333-7333-8333-333333333333";
const otherChild = "44444444-4444-7444-8444-444444444444";
const friend = "55555555-5555-7555-8555-555555555555";

const herself: Actor = { id: her, guardianOf: [child, otherChild], grants: [] };

const partnerActor: Actor = {
  id: partner,
  guardianOf: [child],
  grants: [
    {
      ownerId: her,
      granteeId: partner,
      category: "cycle.status",
      level: "summary",
      revokedAt: null,
    },
    {
      ownerId: her,
      granteeId: partner,
      category: "pregnancy.overview",
      level: "read",
      revokedAt: null,
    },
    {
      ownerId: her,
      granteeId: partner,
      category: "cycle.history",
      level: "read",
      revokedAt: "2026-09-01T00:00:00Z",
    },
  ],
};

const auntie: Actor = {
  id: friend,
  guardianOf: [],
  grants: [
    {
      ownerId: her,
      granteeId: friend,
      category: "child",
      level: "read",
      childId: child,
      revokedAt: null,
    },
  ],
};

const everyCategory: Category[] = [
  "cycle.status",
  "cycle.history",
  "cycle.symptoms",
  "journal.private",
  "pregnancy.overview",
  "pregnancy.photos",
  "child",
];

describe("listScope()", () => {
  it("gives the owner every category, the private journal included", () => {
    const [own] = listScope(herself, "read");
    expect(own).toEqual({
      reason: "owner",
      subjectId: her,
      categories: everyCategory,
      level: "contribute",
    });
    expect(CATEGORIES).toEqual(everyCategory);
  });
  it("includes a summary grant for summary lists and not for read lists", () => {
    const summaries = listScope(partnerActor, "summary").filter((s) => s.reason === "grant");
    expect(summaries.map((s) => s.categories)).toEqual([["cycle.status"], ["pregnancy.overview"]]);
    expect(summaries[0]?.level).toBe("summary");
    const reads = listScope(partnerActor, "read").filter((s) => s.reason === "grant");
    expect(reads).toEqual([
      { reason: "grant", subjectId: her, categories: ["pregnancy.overview"], level: "read" },
    ]);
  });
  it("leaves a revoked grant out", () => {
    const granted = listScope(partnerActor, "summary")
      .filter((s) => s.reason === "grant")
      .flatMap((s) => s.categories);
    expect(granted).not.toContain("cycle.history");
  });
  it("adds a guardian scope for each guarded child and scopes a child grant to one child", () => {
    const guarded = listScope(herself, "write").filter((s) => s.reason === "guardian");
    expect(guarded).toEqual([
      {
        reason: "guardian",
        subjectId: child,
        categories: ["child"],
        level: "contribute",
        childId: child,
      },
      {
        reason: "guardian",
        subjectId: otherChild,
        categories: ["child"],
        level: "contribute",
        childId: otherChild,
      },
    ]);
    const granted = listScope(auntie, "read").filter((s) => s.reason === "grant");
    expect(granted).toEqual([
      { reason: "grant", subjectId: her, categories: ["child"], level: "read", childId: child },
    ]);
    expect(listScope(auntie, "write").filter((s) => s.reason === "grant")).toEqual([]);
  });
  it("carries the child id on every scope that reaches a child", () => {
    for (const actor of [herself, partnerActor, auntie]) {
      for (const scope of listScope(actor, "read")) {
        if (scope.reason !== "owner" && scope.categories.includes("child")) {
          expect(scope.childId).toBeDefined();
        }
      }
    }
  });
  it("answers from the first of two active grants on one category, as can() does", () => {
    const doubled: Actor = {
      id: partner,
      guardianOf: [],
      grants: [
        {
          ownerId: her,
          granteeId: partner,
          category: "cycle.history",
          level: "read",
          revokedAt: null,
        },
        {
          ownerId: her,
          granteeId: partner,
          category: "cycle.history",
          level: "contribute",
          revokedAt: null,
        },
      ],
    };
    expect(listScope(doubled, "read").filter((s) => s.reason === "grant")).toEqual([
      { reason: "grant", subjectId: her, categories: ["cycle.history"], level: "read" },
    ]);
    expect(listScope(doubled, "write").filter((s) => s.reason === "grant")).toEqual([]);
    expect(categoriesFor(doubled, her)?.levels).toEqual({ "cycle.history": "read" });
  });
  it("never reaches the private journal through a grant", () => {
    const generous: Actor = {
      ...partnerActor,
      grants: [
        {
          ownerId: her,
          granteeId: partner,
          category: "journal.private",
          level: "contribute",
          revokedAt: null,
        },
      ],
    };
    expect(listScope(generous, "summary").filter((s) => s.reason === "grant")).toEqual([]);
    expect(categoriesFor(generous, her)).toBeNull();
  });
  it("gives a grantee no scope for sharing or deleting", () => {
    expect(listScope(partnerActor, "share").filter((s) => s.reason === "grant")).toEqual([]);
  });
});

describe("categoriesFor()", () => {
  it("gives the owner every category at full level", () => {
    const access = categoriesFor(herself, her);
    expect(access?.reason).toBe("owner");
    expect(access?.categories).toEqual(everyCategory);
    expect(access?.levels["journal.private"]).toBe("contribute");
  });
  it("merges a partner's active grants with their own levels and drops the revoked one", () => {
    expect(categoriesFor(partnerActor, her)).toEqual({
      reason: "grant",
      categories: ["cycle.status", "pregnancy.overview"],
      levels: { "cycle.status": "summary", "pregnancy.overview": "read" },
    });
  });
  it("answers a child record by guardianship first, then by the grant for that child only", () => {
    expect(categoriesFor(partnerActor, her, child)).toEqual({
      reason: "guardian",
      categories: ["child"],
      levels: { child: "contribute" },
    });
    expect(categoriesFor(auntie, her, child)?.levels).toEqual({ child: "read" });
    expect(categoriesFor(auntie, her, otherChild)).toBeNull();
    expect(categoriesFor(auntie, her)).toBeNull();
  });
});

describe("projectRow()", () => {
  const entry = {
    id: "entry-1",
    subject_id: her,
    date: "2026-09-20",
    flow: "medium",
    mood: "calm",
    created_at: "2026-09-20T21:00:00Z",
  };
  const pregnancy = {
    id: "preg-1",
    subject_id: her,
    due_date: "2027-03-01",
    dating_method: "lmp",
    ended_at: "2026-10-01",
    ended_reason: "loss",
    due_date_changes: [{ previous: "2027-02-27", next: "2027-03-01" }],
  };

  it("keeps the whole row for the owner", () => {
    const own = categoriesFor(herself, her);
    expect(own && projectRow("pregnancies", pregnancy, own)).toEqual(pregnancy);
  });
  it("keeps only the columns filed under granted categories, plus the keys", () => {
    const historyOnly = { reason: "grant" as const, categories: ["cycle.history" as const] };
    expect(projectRow("cycle_entries", entry, historyOnly)).toEqual({
      id: "entry-1",
      subject_id: her,
      date: "2026-09-20",
      flow: "medium",
    });
    const symptomsOnly = { reason: "grant" as const, categories: ["cycle.symptoms" as const] };
    expect(projectRow("cycle_entries", entry, symptomsOnly)).toEqual({
      id: "entry-1",
      subject_id: her,
      mood: "calm",
    });
    const unrelated = { reason: "grant" as const, categories: ["pregnancy.photos" as const] };
    expect(projectRow("cycle_entries", entry, unrelated)).toEqual({});
  });
  it("strips ended_reason and due_date_changes for any grantee", () => {
    const access = categoriesFor(partnerActor, her);
    expect(access && projectRow("pregnancies", pregnancy, access)).toEqual({
      id: "preg-1",
      subject_id: her,
      due_date: "2027-03-01",
      dating_method: "lmp",
      ended_at: "2026-10-01",
    });
    const change = { id: "change-1", pregnancy_id: "preg-1", previous: "2027-02-27" };
    expect(access && projectRow("due_date_changes", change, access)).toEqual({});
  });
  it("files a note or photo under the category its row carries", () => {
    const access = { reason: "grant" as const, categories: ["pregnancy.overview" as const] };
    const shared = { id: "note-1", category: "pregnancy.overview", body: "..." };
    const kept = { id: "note-2", category: "journal.private", body: "..." };
    const odd = { id: "note-3", category: "child", body: "..." };
    expect(projectRow("notes", shared, access)).toEqual(shared);
    expect(projectRow("notes", kept, access)).toEqual({});
    expect(projectRow("notes", odd, { reason: "grant", categories: ["child"] })).toEqual({});
  });
  it("names every table of the storage map", () => {
    expect(Object.keys(STORAGE_MAP).sort()).toEqual([
      "child_events",
      "child_measurements",
      "children",
      "cycle_entries",
      "cycle_predictions",
      "due_date_changes",
      "entry_symptoms",
      "notes",
      "photos",
      "pregnancies",
      "pregnancy_events",
    ]);
  });
});
