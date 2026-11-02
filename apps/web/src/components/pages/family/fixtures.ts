import type { Child, ChildEvent, ChildMeasurement, MilestoneChecklist } from "./types";

/**
 * API-shaped rows for the family unit tests, modelled on the seed's Ilo and
 * Sol (packages/db seed cast). Test-only: nothing in the app imports it.
 */

export const ILO_ID = "018f5e7a-5eed-7006-8000-000000000001";
export const SOL_ID = "018f5e7a-5eed-7006-8000-000000000002";
export const MIRA_ID = "018f5e7a-5eed-7000-8000-000000000003";
export const LENA_ID = "018f5e7a-5eed-7000-8000-000000000004";

let counter = 0;

/** A live event with every field the contract carries; override what the case needs. */
export function event(overrides: Partial<ChildEvent> = {}): ChildEvent {
  counter += 1;
  return {
    id: `018f5e7a-5eed-7030-8000-${counter.toString(16).padStart(12, "0")}`,
    childId: ILO_ID,
    kind: "diaper",
    date: "2026-10-04",
    startedAt: null,
    endedAt: null,
    milestoneId: null,
    quantityMl: null,
    side: null,
    feedMethod: null,
    diaperContents: null,
    note: null,
    authorId: MIRA_ID,
    createdAt: "2026-10-04T18:00:00.000Z",
    updatedAt: "2026-10-04T18:00:00.000Z",
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function child(overrides: Partial<Child> = {}): Child {
  return {
    id: ILO_ID,
    displayName: "Ilo",
    dateOfBirth: "2026-08-23",
    sex: "female",
    householdId: "018f5e7a-5eed-7001-8000-000000000002",
    guardians: [MIRA_ID, LENA_ID],
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

export function measurement(overrides: Partial<ChildMeasurement> = {}): ChildMeasurement {
  return {
    id: "018f5e7a-5eed-7031-8000-000000000001",
    childId: ILO_ID,
    date: "2026-10-03",
    weightGrams: 4600,
    lengthMillimetres: 555,
    headMillimetres: 375,
    placements: [],
    authorId: MIRA_ID,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

export function checklist(overrides: Partial<MilestoneChecklist> = {}): MilestoneChecklist {
  return {
    childId: ILO_ID,
    months: 2,
    label: "2 months",
    framing: "Most children do this by 2 months.",
    notScreeningLine: "This is not a screening tool; your pediatrician is.",
    attribution:
      "Source: CDC. Reference to CDC materials does not imply endorsement by CDC, HHS or the U.S. Government.",
    items: [
      {
        id: "2m-social-1",
        domain: "social",
        text: "Calms down when spoken to or picked up",
        checked: true,
        checkedOn: "2026-10-01",
        eventId: "018f5e7a-5eed-7030-8000-000000000005",
      },
      {
        id: "2m-social-2",
        domain: "social",
        text: "Looks at your face",
        checked: false,
        checkedOn: null,
        eventId: null,
      },
      {
        id: "2m-language-1",
        domain: "language",
        text: "Makes sounds other than crying",
        checked: false,
        checkedOn: null,
        eventId: null,
      },
    ],
    ...overrides,
  };
}
