import { describe, expect, it } from "vitest";
import type { Me } from "@tidefern/api-client";
import { actorFrom, childAccess } from "./roles";

const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";

type Grant = Me["grants"][number];

function childGrant(level: Grant["level"], childId: string): Grant {
  return {
    id: "018f5e7a-5eed-7004-8000-0000000000aa",
    ownerId: MIRA,
    category: "child",
    level,
    childId,
    createdAt: "2026-03-19T00:00:00.000Z",
  };
}

function person(guardianOf: string[], grants: Grant[]) {
  return { id: "018f5e7a-5eed-7000-8000-000000000009", guardianOf, grants };
}

describe("childAccess", () => {
  it("gives a guardian every action, Undo included", () => {
    expect(childAccess(person([ILO, SOL], []), ILO)).toEqual({
      role: "guardian",
      canRead: true,
      canWrite: true,
      canDelete: true,
    });
  });

  it("lets a contribute grantee log but never undo, which is a guardian's delete", () => {
    expect(childAccess(person([], [childGrant("contribute", SOL)]), SOL)).toEqual({
      role: "contribute",
      canRead: true,
      canWrite: true,
      canDelete: false,
    });
  });

  it("gives a read grantee the records and no write control", () => {
    expect(childAccess(person([], [childGrant("read", SOL)]), SOL)).toEqual({
      role: "read",
      canRead: true,
      canWrite: false,
      canDelete: false,
    });
  });

  it("gives a summary grantee the card alone", () => {
    expect(childAccess(person([], [childGrant("summary", SOL)]), SOL)).toEqual({
      role: "summary",
      canRead: false,
      canWrite: false,
      canDelete: false,
    });
  });

  it("never lets a grant for one child reach another, nor any other category reach a child", () => {
    expect(childAccess(person([], [childGrant("contribute", SOL)]), ILO)).toBeNull();
    const pregnancy: Grant = {
      ...childGrant("contribute", SOL),
      category: "pregnancy.overview",
    };
    delete pregnancy.childId;
    expect(childAccess(person([], [pregnancy]), SOL)).toBeNull();
    expect(childAccess(person([], []), SOL)).toBeNull();
  });

  it("builds the policy's actor from the session read, every held grant active and hers", () => {
    const me = person([ILO], [childGrant("read", SOL)]);
    expect(actorFrom(me)).toEqual({
      id: me.id,
      guardianOf: [ILO],
      grants: [
        {
          ownerId: MIRA,
          granteeId: me.id,
          category: "child",
          level: "read",
          childId: SOL,
          revokedAt: null,
        },
      ],
    });
  });
});
