import { describe, expect, it } from "vitest";
import { consentView, dayIn, type Consent } from "./consent-records";

const SELF = "018f5e7a-5eed-7000-8000-000000000003";
const OTHER_GUARDIAN = "018f5e7a-5eed-7000-8000-000000000004";
const CHILD_A = "018f5e7a-5eed-7006-8000-000000000001";
const CHILD_B = "018f5e7a-5eed-7006-8000-000000000002";

let n = 0;
function consent(overrides: Partial<Consent>): Consent {
  n += 1;
  return {
    id: `018f5e7a-5eed-7005-8000-${n.toString(16).padStart(12, "0")}`,
    subjectId: SELF,
    consentingGuardianId: null,
    category: "journal.private",
    basis: "necessary",
    purpose: "Keep your private notes, readable by you alone.",
    textVersion: "2026-10",
    textHash: "hash",
    grantedAt: "2025-09-01T10:00:00.000Z",
    withdrawnAt: null,
    ...overrides,
  };
}

describe("the consent record Settings shows", () => {
  it("dates an instant on the profile's own calendar", () => {
    // 23:30 in UTC on Oct 4 is already Oct 5 in Berlin, and still Oct 4 in Vancouver.
    expect(dayIn("2026-10-04T23:30:00.000Z", "Europe/Berlin")).toBe("2026-10-05");
    expect(dayIn("2026-10-04T23:30:00.000Z", "America/Vancouver")).toBe("2026-10-04");
  });

  it("groups what she agreed to on one day under one text into one record, categories in order", () => {
    const view = consentView(
      [
        consent({ category: "journal.private", purpose: "Notes." }),
        consent({ category: "cycle.history", purpose: "Dates." }),
        consent({
          category: "cycle.status",
          basis: "consent",
          purpose: "Status.",
          grantedAt: "2026-06-27T08:00:00.000Z",
        }),
      ],
      SELF,
      "Europe/Berlin",
      new Map(),
    );
    expect(view.active).toHaveLength(2);
    expect(view.active[0]).toMatchObject({
      agreedOn: "2025-09-01",
      textVersion: "2026-10",
      categories: ["Cycle history", "Private notes"],
      purposes: ["Dates.", "Notes."],
      withdrawnOn: null,
    });
    expect(view.active[1]).toMatchObject({ agreedOn: "2026-06-27", categories: ["Cycle status"] });
    expect(view.withdrawn).toEqual([]);
  });

  it("offers one withdraw for all of her standing consents, and none once they are withdrawn", () => {
    const standing = consent({ category: "cycle.history" });
    expect(consentView([standing, consent({})], SELF, "UTC", new Map()).withdrawId).toBe(
      standing.id,
    );
    const view = consentView(
      [
        consent({ withdrawnAt: "2026-10-06T09:00:00.000Z" }),
        consent({ category: "cycle.history", withdrawnAt: "2026-10-06T09:00:00.000Z" }),
      ],
      SELF,
      "UTC",
      new Map(),
    );
    expect(view.withdrawId).toBeNull();
    expect(view.active).toEqual([]);
    expect(view.withdrawn).toEqual([
      expect.objectContaining({
        withdrawnOn: "2026-10-06",
        categories: ["Cycle history", "Private notes"],
      }),
    ]);
  });

  it("lists a guardian's consent for a child by the child's name, never as hers to withdraw", () => {
    const view = consentView(
      [
        consent({
          subjectId: CHILD_A,
          consentingGuardianId: SELF,
          category: "child",
          purpose: "Keep this child's records.",
          grantedAt: "2026-08-23T10:00:00.000Z",
        }),
        consent({
          subjectId: CHILD_B,
          consentingGuardianId: OTHER_GUARDIAN,
          category: "child",
          purpose: "Keep this child's records.",
          grantedAt: "2025-08-10T10:00:00.000Z",
        }),
      ],
      SELF,
      "UTC",
      new Map([[CHILD_A, "Ilo"]]),
    );
    expect(view.children).toEqual([
      expect.objectContaining({ child: "A child", agreedOn: "2025-08-10", byYou: false }),
      expect.objectContaining({ child: "Ilo", agreedOn: "2026-08-23", byYou: true }),
    ]);
    expect(view.active).toEqual([]);
    expect(view.withdrawId).toBeNull();
  });

  it("is empty for a person with no consent rows", () => {
    expect(consentView([], SELF, "UTC", new Map())).toEqual({
      active: [],
      withdrawn: [],
      children: [],
      withdrawId: null,
    });
  });
});
