import { render, screen, within } from "@testing-library/react";
import type { SharingGrant, SharingPerson } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { grantCopy, privateNotesSentence } from "@/components/ui/grant-row";
import { PartnerCard, partnerLines } from "./partner-card";

const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";

function grant(patch: Partial<SharingGrant> & Pick<SharingGrant, "category">): SharingGrant {
  return {
    id: `018f5e7a-5eed-7003-8000-00000000000${patch.category.length % 10}`,
    level: "read",
    notify: false,
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...patch,
  };
}

function person(patch: Partial<SharingPerson>): SharingPerson {
  return {
    id: "018f5e7a-5eed-7000-8000-000000000002",
    displayName: "Theo",
    role: "partner",
    householdId: null,
    guardianOf: [],
    grants: [],
    notify: false,
    version: 1,
    ...patch,
  };
}

const theo = person({
  grants: [
    grant({
      id: "018f5e7a-5eed-7003-8000-000000000001",
      category: "cycle.status",
      level: "summary",
    }),
    grant({ id: "018f5e7a-5eed-7003-8000-000000000002", category: "cycle.symptoms" }),
  ],
});

describe("partnerLines", () => {
  it("names each category the way /sharing does, with its plain description", () => {
    expect(partnerLines(theo, {}, false)).toEqual([
      {
        key: "018f5e7a-5eed-7003-8000-000000000001",
        label: "Cycle status",
        description: grantCopy["cycle.status"].description,
      },
      {
        key: "018f5e7a-5eed-7003-8000-000000000002",
        label: "Symptoms",
        description: grantCopy["cycle.symptoms"].description,
      },
    ]);
  });

  it("names a child grant by the child, and adds each child guarded together once", () => {
    const pia = person({
      displayName: "Pia",
      guardianOf: [ILO, SOL],
      grants: [
        grant({ id: "018f5e7a-5eed-7003-8000-000000000005", category: "child", childId: SOL }),
      ],
    });
    expect(partnerLines(pia, { [ILO]: "Ilo", [SOL]: "Sol" }, false)).toEqual([
      {
        key: "018f5e7a-5eed-7003-8000-000000000005",
        label: "Sol",
        description: "Everything logged for Sol: feeds, sleep, growth, milestones and photos.",
      },
      {
        key: `guardian-${ILO}`,
        label: "Ilo",
        description: "As a guardian of Ilo, everything logged for Ilo.",
      },
    ]);
  });

  it("says the overview is paused once her pregnancy ended, and never names a child it cannot read", () => {
    const lena = person({
      displayName: "Lena",
      guardianOf: [ILO],
      grants: [
        grant({ id: "018f5e7a-5eed-7003-8000-000000000004", category: "pregnancy.overview" }),
      ],
    });
    const lines = partnerLines(lena, {}, true);
    expect(lines[0]).toMatchObject({
      label: "Pregnancy overview",
      description: "Weekly updates are paused. No week, due date or dates show.",
    });
    expect(lines[1]).toMatchObject({ label: "this child" });
    expect(partnerLines(lena, {}, false)[0]?.description).toBe(
      grantCopy["pregnancy.overview"].description,
    );
  });
});

describe("PartnerCard", () => {
  it("is one read-only card per person with a way to Sharing", () => {
    render(
      <PartnerCard
        partners={{ ok: true, value: { people: [theo], childNames: {}, pregnancyPaused: false } }}
      />,
    );
    const card = screen.getByRole("region", { name: "What Theo can see right now" });
    expect(within(card).getByText("Cycle status")).toBeInTheDocument();
    expect(within(card).getByText(grantCopy["cycle.status"].description)).toBeInTheDocument();
    expect(within(card).getByText(privateNotesSentence)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Change sharing" })).toHaveAttribute(
      "href",
      "/sharing",
    );
    // Read only: nothing on the card changes a grant.
    expect(within(card).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(card).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("names someone without a display name plainly", () => {
    render(
      <PartnerCard
        partners={{
          ok: true,
          value: {
            people: [person({ displayName: null, grants: theo.grants })],
            childNames: {},
            pregnancyPaused: false,
          },
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "What this person can see right now" }),
    ).toBeVisible();
  });

  it("says she is the only one who can see this when she shares with nobody", () => {
    render(
      <PartnerCard
        partners={{ ok: true, value: { people: [], childNames: {}, pregnancyPaused: false } }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "You are the only one who can see this" }),
    ).toBeVisible();
    expect(
      screen.getByText("Invite a partner and choose exactly what they see, category by category."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Invite a partner" })).toHaveAttribute(
      "href",
      "/sharing",
    );
  });

  it("says what to do when the sharing read failed", () => {
    render(<PartnerCard partners={{ ok: false }} />);
    expect(
      screen.getByText(
        "We could not load who you share with just now. Reload the page to try again.",
      ),
    ).toBeVisible();
  });
});
