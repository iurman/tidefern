import { describe, expect, it } from "vitest";
import { can, type Actor } from "./policy";

const her = "11111111-1111-7111-8111-111111111111";
const partner = "22222222-2222-7222-8222-222222222222";
const child = "33333333-3333-7333-8333-333333333333";
const otherChild = "44444444-4444-7444-8444-444444444444";
const friend = "55555555-5555-7555-8555-555555555555";

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

describe("can()", () => {
  it("lets the subject do anything with her own records", () => {
    expect(
      can({ id: her, guardianOf: [], grants: [] }, "delete", {
        subjectId: her,
        category: "journal.private",
      }),
    ).toEqual({ allowed: true, reason: "owner" });
  });
  it("denies by default, even inside the same household", () => {
    expect(can(partnerActor, "read", { subjectId: her, category: "cycle.symptoms" }).allowed).toBe(
      false,
    );
  });
  it("honors a summary grant only for summary reads", () => {
    expect(can(partnerActor, "summary", { subjectId: her, category: "cycle.status" }).allowed).toBe(
      true,
    );
    expect(can(partnerActor, "read", { subjectId: her, category: "cycle.status" }).allowed).toBe(
      false,
    );
  });
  it("treats a revoked grant as absent", () => {
    expect(can(partnerActor, "read", { subjectId: her, category: "cycle.history" }).allowed).toBe(
      false,
    );
  });
  it("never shares the private journal", () => {
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
    expect(can(generous, "read", { subjectId: her, category: "journal.private" }).allowed).toBe(
      false,
    );
  });
  it("gives guardians full access to a child's records", () => {
    expect(
      can(partnerActor, "write", { subjectId: her, category: "child", childId: child }),
    ).toEqual({ allowed: true, reason: "guardian" });
  });
  it("scopes a child grant to exactly one child", () => {
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
    expect(can(auntie, "read", { subjectId: her, category: "child", childId: child }).allowed).toBe(
      true,
    );
    expect(
      can(auntie, "read", { subjectId: her, category: "child", childId: otherChild }).allowed,
    ).toBe(false);
    expect(
      can(auntie, "write", { subjectId: her, category: "child", childId: child }).allowed,
    ).toBe(false);
  });
  it("never lets a grantee share or delete", () => {
    expect(
      can(partnerActor, "share", { subjectId: her, category: "pregnancy.overview" }).allowed,
    ).toBe(false);
  });
});
