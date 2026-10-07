import { describe, expect, it } from "vitest";
import type { components, Me } from "@tidefern/api-client";
import { buildSharingView, offeredLevel, type SharingInput } from "./people";

type SharingPerson = components["schemas"]["SharingPerson"];
type SharingGrant = components["schemas"]["SharingGrant"];

// The seeded cast's ids and answers (packages/db seed), as GET /api/v1/sharing and /me give them.
const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const PIA = "018f5e7a-5eed-7000-8000-000000000005";
const HOUSEHOLD_A = "018f5e7a-5eed-7001-8000-000000000001";
const HOUSEHOLD_B = "018f5e7a-5eed-7001-8000-000000000002";
const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";
const children = [
  { id: ILO, displayName: "Ilo" },
  { id: SOL, displayName: "Sol" },
];

function me(
  id: string,
  stage: NonNullable<Me["profile"]>["stage"],
  timeZone: string,
  patch: Partial<Me> = {},
): Me {
  return {
    id,
    profile: {
      displayName: null,
      timeZone,
      stage,
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
    },
    today: "2026-10-05",
    guardianOf: [],
    grants: [],
    session: {
      expiresAt: "2026-10-12T00:00:00.000Z",
      authenticatedAt: "2026-10-05T00:00:00.000Z",
    },
    ...patch,
  };
}

let made = 0;

function grant(
  patch: Partial<SharingGrant> & Pick<SharingGrant, "category" | "level">,
): SharingGrant {
  made += 1;
  return {
    id: `018f5e7a-5eed-7004-8000-${String(100 + made).padStart(12, "0")}`,
    notify: false,
    version: 1,
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...patch,
  };
}

function person(patch: Partial<SharingPerson> & Pick<SharingPerson, "id">): SharingPerson {
  return {
    displayName: null,
    role: null,
    householdId: null,
    guardianOf: [],
    grants: [],
    notify: false,
    version: 0,
    ...patch,
  };
}

function view(input: Partial<SharingInput> & Pick<SharingInput, "me">) {
  return buildSharingView({ people: [], invitations: [], children: [], ...input });
}

const theoForNoor = person({
  id: THEO,
  displayName: "Theo",
  role: "partner",
  householdId: HOUSEHOLD_A,
  notify: true,
  version: 3,
  grants: [
    grant({ category: "cycle.status", level: "summary", notify: true }),
    grant({ category: "cycle.symptoms", level: "read" }),
  ],
});

describe("buildSharingView for an owner in the cycle stage (Noor)", () => {
  const sharing = view({ me: me(NOOR, "cycle", "Europe/Berlin"), people: [theoForNoor] });
  const theo = sharing.people[0];

  it("offers every category about her body, with the right ones on at their levels", () => {
    expect(theo?.rows.map((row) => [row.category, row.on, row.level, row.offer])).toEqual([
      ["cycle.status", true, "summary", "summary"],
      ["cycle.history", false, null, "read"],
      ["cycle.symptoms", true, "read", "read"],
      ["pregnancy.overview", false, null, "read"],
      ["pregnancy.photos", false, null, "read"],
    ]);
  });

  it("names the partner, his role and the day sharing began in her zone", () => {
    expect(theo).toMatchObject({
      name: "Theo",
      relation: "partner",
      since: "2026-06-27",
      version: 3,
      notify: true,
      notifyMode: "enabled",
      removal: "member",
      received: [],
    });
  });

  it("gives the day an instant falls on in the actor's own zone", () => {
    const late = view({
      me: me(NOOR, "cycle", "Europe/Berlin"),
      people: [
        person({
          id: THEO,
          grants: [
            grant({
              category: "cycle.status",
              level: "summary",
              createdAt: "2026-06-26T23:30:00.000Z",
            }),
          ],
        }),
      ],
      invitations: [
        {
          id: "018f5e7a-5eed-7002-8000-000000000009",
          householdId: HOUSEHOLD_A,
          inviteeEmail: "jo@example.test",
          role: "partner",
          createdAt: "2026-10-06T22:30:00.000Z",
          expiresAt: "2026-10-09T22:30:00.000Z",
        },
      ],
    });
    // 23:30 UTC is already the next day in Berlin.
    expect(late.people[0]?.since).toBe("2026-06-27");
    expect(late.invitations).toEqual([
      {
        id: "018f5e7a-5eed-7002-8000-000000000009",
        email: "jo@example.test",
        role: "partner",
        sentOn: "2026-10-07",
      },
    ]);
  });

  it("holds the notify switch back until a period category is shared, unless it is already on", () => {
    const nothing = view({
      me: me(NOOR, "cycle", "Europe/Berlin"),
      people: [person({ id: THEO, role: "partner", householdId: HOUSEHOLD_A })],
    });
    expect(nothing.people[0]?.notifyMode).toBe("disabled");
    const symptomsOnly = view({
      me: me(NOOR, "cycle", "Europe/Berlin"),
      people: [
        person({ id: THEO, grants: [grant({ category: "cycle.symptoms", level: "read" })] }),
      ],
    });
    expect(symptomsOnly.people[0]?.notifyMode).toBe("disabled");
    const stillOn = view({
      me: me(NOOR, "cycle", "Europe/Berlin"),
      people: [
        person({
          id: THEO,
          notify: true,
          grants: [grant({ category: "cycle.symptoms", level: "read", notify: true })],
        }),
      ],
    });
    expect(stillOn.people[0]?.notifyMode).toBe("enabled");
  });
});

describe("buildSharingView for a partner who tracks nothing (Theo)", () => {
  const sharing = view({
    me: me(THEO, "none", "Europe/Berlin", {
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000001",
          ownerId: NOOR,
          category: "cycle.status",
          level: "summary",
          createdAt: "2026-06-27T00:00:00.000Z",
        },
        {
          id: "018f5e7a-5eed-7004-8000-000000000002",
          ownerId: NOOR,
          category: "cycle.symptoms",
          level: "read",
          createdAt: "2026-06-27T00:00:00.000Z",
        },
      ],
    }),
    people: [person({ id: NOOR, displayName: "Noor", role: "owner", householdId: HOUSEHOLD_A })],
  });
  const noor = sharing.people[0];

  it("offers nothing of his own and nothing of hers, and shows what he holds", () => {
    expect(noor?.rows).toEqual([]);
    expect(noor?.received).toEqual([
      { key: "018f5e7a-5eed-7004-8000-000000000001", label: "Cycle status", level: "summary" },
      { key: "018f5e7a-5eed-7004-8000-000000000002", label: "Symptoms", level: "read" },
    ]);
    expect(sharing.sharedWithYou).toEqual([]);
  });

  it("hides the notify row, has no since, and removing the owner means leaving", () => {
    expect(noor).toMatchObject({
      relation: "household owner",
      since: null,
      notifyMode: "hidden",
      removal: "owner",
    });
    expect(sharing.householdOwners).toEqual({ [HOUSEHOLD_A]: "Noor" });
  });

  it("still lists a grant he made before, so he can turn it off", () => {
    const earlier = view({
      me: me(THEO, "none", "Europe/Berlin"),
      people: [
        person({
          id: NOOR,
          role: "owner",
          householdId: HOUSEHOLD_A,
          grants: [grant({ category: "cycle.history", level: "read" })],
        }),
      ],
    });
    expect(earlier.people[0]?.rows.map((row) => [row.category, row.on])).toEqual([
      ["cycle.history", true],
    ]);
  });
});

describe("buildSharingView for a guardian with a co-guardian and someone outside (Mira)", () => {
  const sharing = view({
    me: me(MIRA, "postpartum", "America/Vancouver", {
      guardianOf: [ILO, SOL],
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000004",
          ownerId: LENA,
          category: "pregnancy.overview",
          level: "contribute",
          createdAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    }),
    children,
    people: [
      person({
        id: PIA,
        displayName: "Pia",
        version: 1,
        grants: [
          grant({
            category: "child",
            level: "read",
            childId: SOL,
            createdAt: "2026-03-19T00:00:00.000Z",
          }),
        ],
      }),
      person({
        id: LENA,
        displayName: "Lena",
        role: "partner",
        householdId: HOUSEHOLD_B,
        guardianOf: [ILO, SOL],
        version: 1,
        grants: [
          grant({
            category: "pregnancy.overview",
            level: "summary",
            createdAt: "2025-12-29T00:00:00.000Z",
          }),
        ],
      }),
    ],
  });
  const [lena, pia] = sharing.people;

  it("lists household members first, then everyone else", () => {
    expect(sharing.people.map((entry) => entry.name)).toEqual(["Lena", "Pia"]);
  });

  it("gives a co-guardian a guardianship line instead of child switches", () => {
    expect(lena?.relation).toBe("partner, co-guardian of Ilo and Sol");
    expect(lena?.coGuardianOf).toEqual(["Ilo", "Sol"]);
    expect(lena?.rows.some((row) => row.category === "child")).toBe(false);
    expect(lena?.since).toBe("2025-12-28");
    expect(lena?.received).toEqual([
      {
        key: "018f5e7a-5eed-7004-8000-000000000004",
        label: "Pregnancy overview",
        level: "contribute",
      },
    ]);
  });

  it("gives someone outside the household one switch per child, by name", () => {
    expect(pia?.relation).toBe("outside your household");
    expect(pia?.removal).toBe("grants");
    expect(
      pia?.rows
        .filter((row) => row.category === "child")
        .map((row) => [row.key, row.childName, row.on, row.level]),
    ).toEqual([
      [`child:${ILO}`, "Ilo", false, null],
      [`child:${SOL}`, "Sol", true, "read"],
    ]);
  });

  it("removes a member of her own household with the membership", () => {
    expect(lena?.removal).toBe("member");
  });

  it("holds the notify switch back for people who hold no period category", () => {
    expect(lena?.notifyMode).toBe("disabled");
    expect(pia?.notifyMode).toBe("disabled");
  });
});

describe("buildSharingView for a pregnant partner (Lena)", () => {
  const sharing = view({
    me: me(LENA, "pregnancy", "America/Vancouver", { guardianOf: [ILO, SOL] }),
    children,
    people: [
      person({
        id: MIRA,
        displayName: "Mira",
        role: "owner",
        householdId: HOUSEHOLD_B,
        guardianOf: [ILO, SOL],
        version: 1,
        grants: [grant({ category: "pregnancy.overview", level: "contribute" })],
      }),
    ],
  });

  it("hides the period notice in the pregnancy stage and names the owner's household", () => {
    const mira = sharing.people[0];
    expect(mira?.notifyMode).toBe("hidden");
    expect(mira?.relation).toBe("household owner, co-guardian of Ilo and Sol");
    expect(mira?.removal).toBe("owner");
    expect(mira?.rows.find((row) => row.category === "pregnancy.overview")?.level).toBe(
      "contribute",
    );
  });
});

describe("buildSharingView for someone sharing with nobody (Pia)", () => {
  const sharing = view({
    me: me(PIA, "none", "America/New_York", {
      grants: [
        {
          id: "018f5e7a-5eed-7004-8000-000000000005",
          ownerId: MIRA,
          category: "child",
          level: "read",
          childId: SOL,
          createdAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    }),
    children: [{ id: SOL, displayName: "Sol" }],
  });

  it("has nobody to list and shows what someone outside her list shares with her", () => {
    expect(sharing.people).toEqual([]);
    expect(sharing.sharedWithYou).toEqual([
      { key: "018f5e7a-5eed-7004-8000-000000000005", label: "Sol", level: "read" },
    ]);
  });
});

describe("buildSharingView edges", () => {
  it("names a person without a display name, and two members of one household who do not own it", () => {
    const sharing = view({
      me: me(THEO, "cycle", "Europe/Berlin"),
      people: [
        person({ id: NOOR, displayName: "Noor", role: "owner", householdId: HOUSEHOLD_A }),
        person({ id: PIA, displayName: "  ", role: "partner", householdId: HOUSEHOLD_A }),
      ],
    });
    const other = sharing.people.find((entry) => entry.id === PIA);
    expect(other?.name).toBe("Someone");
    expect(other?.removal).toBe("grants");
  });

  it("offers cycle status as a summary and everything else to read", () => {
    expect(offeredLevel("cycle.status")).toBe("summary");
    expect(offeredLevel("cycle.history")).toBe("read");
    expect(offeredLevel("child")).toBe("read");
  });

  it("refuses to build a view without a profile, which the page never asks for", () => {
    expect(() => view({ me: { ...me(NOOR, "cycle", "Europe/Berlin"), profile: null } })).toThrow();
  });
});
