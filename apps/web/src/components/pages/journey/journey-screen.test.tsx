import { render, screen, within } from "@testing-library/react";
import type { Me } from "@tidefern/api-client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { JourneyScreen } from "./journey-screen";
import {
  journeyView,
  type JourneyReads,
  type Pregnancy,
  type PregnancyEvent,
  type PregnancyOverview,
  type SharingPerson,
} from "./view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const PREGNANCY = "018f5e7a-5eed-7300-8000-000000000001";
const today = "2026-10-04";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function me(id: string, stage: NonNullable<Me["profile"]>["stage"], patch: Partial<Me> = {}): Me {
  return {
    id,
    profile: {
      displayName: null,
      timeZone: "America/Vancouver",
      stage,
      weekStart: 7,
      units: "metric",
      notificationDetail: "generic",
    },
    today,
    guardianOf: [],
    grants: [],
    session: { expiresAt: "2026-10-12T00:00:00.000Z", authenticatedAt: "2026-10-04T08:00:00.000Z" },
    ...patch,
  };
}

const lenaPregnancy: Pregnancy = {
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
};

const overview: PregnancyOverview = {
  status: "active",
  id: PREGNANCY,
  subjectId: LENA,
  dueDate: "2027-02-07",
  gestation: lenaPregnancy.gestation!,
  version: 2,
};

const anatomy: PregnancyEvent = {
  id: "018f5e7a-5eed-7400-8000-000000000002",
  pregnancyId: PREGNANCY,
  subjectId: LENA,
  authorId: LENA,
  kind: "appointment",
  date: "2026-09-20",
  detail: "Anatomy scan",
  version: 1,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const glucose: PregnancyEvent = {
  ...anatomy,
  id: "018f5e7a-5eed-7400-8000-000000000004",
  authorId: MIRA,
  date: "2026-11-01",
  detail: "Glucose screening",
};

function person(id: string, displayName: string, overviewGrant: boolean): SharingPerson {
  return {
    id,
    displayName,
    role: "partner",
    householdId: "018f5e7a-5eed-7100-8000-000000000002",
    guardianOf: [],
    grants: overviewGrant
      ? [
          {
            id: "018f5e7a-5eed-7200-8000-000000000004",
            category: "pregnancy.overview",
            level: "contribute",
            notify: false,
            version: 1,
            createdAt: "2026-08-05T00:00:00.000Z",
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
        ]
      : [],
    notify: false,
    version: 1,
  };
}

function show(viewer: Me, reads: Partial<JourneyReads>) {
  render(
    <JourneyScreen
      view={journeyView(viewer, today, {
        own: { kind: "none" },
        shared: [],
        people: null,
        ...reads,
      })}
    />,
  );
}

describe("her own pregnancy", () => {
  function showLena() {
    show(me(LENA, "pregnancy"), {
      own: {
        kind: "active",
        pregnancy: lenaPregnancy,
        events: { ok: true, value: [anatomy, glucose] },
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
      shared: [{ ownerId: MIRA, level: "summary", kind: "paused" }],
      people: { ok: true, value: [person(MIRA, "Mira", true)] },
    });
  }

  it("leads with the week card on warmth, with the dating method and the way to her history", () => {
    showLena();
    expect(screen.getByRole("heading", { level: 1, name: "Journey" })).toBeInTheDocument();
    const own = screen.getByRole("region", { name: "Your pregnancy" });
    const card = within(own).getByRole("region", { name: "This week" });
    expect(card).toHaveClass("active");
    expect(card).toHaveTextContent("Week22");
    expect(within(card).getByText("Dated from an ultrasound.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "#dating-history",
    );
  });

  it("marks this week with the tide line, then lists the weeks that hold something", () => {
    showLena();
    const own = screen.getByRole("region", { name: "Your pregnancy" });
    const weeks = within(own)
      .getAllByRole("heading", { level: 4 })
      .map((heading) => heading.textContent);
    // Week 20 sits in the collapsed earlier weeks; this week leads the rest even with nothing in it.
    expect(weeks).toEqual(["Week 20", "Week 22", "Week 26"]);
    const marker = within(own).getByText("This week", { selector: "span" });
    const thisWeek = marker.parentElement?.nextElementSibling?.querySelector("li");
    expect(thisWeek).toHaveTextContent("Week 22");
    expect(thisWeek).toHaveTextContent("Oct 4 to 10");
    expect(within(own).getByText("Earlier weeks").closest("details")).not.toHaveAttribute("open");
    expect(
      within(own).queryByText(/Nothing is added for the weeks ahead yet/),
    ).not.toBeInTheDocument();
    const glucoseRow = within(own).getByRole("list", { name: "Week 26" });
    expect(glucoseRow).toHaveTextContent("Glucose screening");
    expect(glucoseRow).toHaveTextContent("Appointment, added by Mira");
    expect(glucoseRow).toHaveTextContent("Expected");
    expect(
      within(glucoseRow).getByRole("button", { name: "Edit Glucose screening, Nov 1" }),
    ).toBeInTheDocument();
    expect(within(own).getByRole("button", { name: "Add an appointment" })).toBeInTheDocument();
    expect(within(own).getByRole("button", { name: "Add a milestone" })).toBeInTheDocument();
  });

  it("shows her due date history, hers alone, and the way out last", () => {
    showLena();
    const own = screen.getByRole("region", { name: "Your pregnancy" });
    const history = within(own).getByRole("heading", { name: "Due date history" }).parentElement;
    expect(history).toHaveAttribute("id", "dating-history");
    expect(history).toHaveTextContent("Aug 9");
    expect(history).toHaveTextContent("From Feb 15, 2027 to Feb 7, 2027");
    expect(within(own).getByRole("button", { name: "My pregnancy ended" })).toBeInTheDocument();
  });

  it("shows a pregnancy that ended for its owner only as the neutral paused card", () => {
    showLena();
    const mira = screen.getByRole("region", { name: "Mira's pregnancy" });
    expect(within(mira).getByRole("heading", { name: "Paused" })).toBeInTheDocument();
    expect(within(mira).getByText("Weekly updates are paused.")).toBeInTheDocument();
    expect(mira.textContent).not.toMatch(/\d/);
    expect(mira.textContent).not.toMatch(/birth|ended|loss/i);
  });

  it("says what would be in the weeks ahead when nothing is added yet", () => {
    show(me(LENA, "pregnancy"), {
      own: {
        kind: "active",
        pregnancy: lenaPregnancy,
        events: { ok: true, value: [] },
        history: { ok: true, value: [] },
      },
    });
    const own = screen.getByRole("region", { name: "Your pregnancy" });
    expect(
      within(own)
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(["Week 22"]);
    expect(own).toHaveTextContent(
      "Nothing is added for the weeks ahead yet. Appointments and milestones show here under their week.",
    );
    expect(within(own).queryByText("Earlier weeks")).not.toBeInTheDocument();
    expect(own).toHaveTextContent("The due date has not changed since it was set.");
  });

  it("says when the weeks or the history could not be read, and keeps the rest", () => {
    show(me(LENA, "pregnancy"), {
      own: {
        kind: "active",
        pregnancy: lenaPregnancy,
        events: { ok: false },
        history: { ok: false },
      },
    });
    expect(
      screen.getByText(
        "We could not load the appointments and milestones just now. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We could not load the due date history just now. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "This week" })).toBeInTheDocument();
  });
});

describe("a pregnancy shared with her", () => {
  const grant = (level: "summary" | "read" | "contribute") => ({
    id: "018f5e7a-5eed-7200-8000-000000000004",
    ownerId: LENA,
    category: "pregnancy.overview" as const,
    level,
    createdAt: "2026-08-05T00:00:00.000Z",
  });

  it("draws the card without a dating row or a history, and lets a contributor add and edit", () => {
    show(me(MIRA, "postpartum", { grants: [grant("contribute")] }), {
      own: { kind: "none", children: { ok: true, value: [] }, basis: { ok: true, value: "none" } },
      shared: [
        {
          ownerId: LENA,
          level: "contribute",
          kind: "active",
          pregnancy: overview,
          events: { ok: true, value: [glucose] },
        },
      ],
      people: { ok: true, value: [person(LENA, "Lena", false)] },
    });
    const lena = screen.getByRole("region", { name: "Lena's pregnancy" });
    const card = within(lena).getByRole("region", { name: "This week" });
    expect(card).toHaveClass("active");
    expect(card).not.toHaveTextContent("Dating");
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(lena).getByRole("list", { name: "Week 26" })).toHaveTextContent(
      "Appointment, added by you",
    );
    expect(within(lena).getByRole("button", { name: "Add an appointment" })).toBeInTheDocument();
    expect(
      within(lena).getByRole("button", { name: "Edit Glucose screening, Nov 1" }),
    ).toBeInTheDocument();
    expect(within(lena).queryByRole("button", { name: "My pregnancy ended" })).toBeNull();
    expect(within(lena).queryByText("Due date history")).toBeNull();
  });

  it("gives a reader the weeks to read and nothing to change", () => {
    show(me(MIRA, "none", { grants: [grant("read")] }), {
      shared: [
        {
          ownerId: LENA,
          level: "read",
          kind: "active",
          pregnancy: overview,
          events: { ok: true, value: [glucose] },
        },
      ],
      people: { ok: true, value: [person(LENA, "Lena", false)] },
    });
    const lena = screen.getByRole("region", { name: "Lena's pregnancy" });
    expect(within(lena).getByText("Glucose screening")).toBeInTheDocument();
    expect(within(lena).queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText("Nothing shared with you yet")).toBeNull();
  });

  it("says plainly when it could not be read", () => {
    show(me(MIRA, "none", { grants: [grant("read")] }), {
      shared: [{ ownerId: LENA, level: "read", kind: "failed" }],
      people: { ok: false },
    });
    const section = screen.getByRole("region", { name: "A pregnancy shared with you" });
    expect(section).toHaveTextContent(
      "We could not load this pregnancy just now. Reload the page to try again.",
    );
  });
});

describe("after an ending and without a pregnancy", () => {
  it("shows the child's age after a birth and no week, with the paused card", () => {
    const ilo = {
      id: "018f5e7a-5eed-7500-8000-000000000001",
      displayName: "Ilo",
      dateOfBirth: "2026-08-23",
      sex: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      version: 1,
    };
    show(me(MIRA, "postpartum", { guardianOf: [ilo.id] }), {
      own: {
        kind: "ended",
        pregnancy: {
          ...lenaPregnancy,
          subjectId: MIRA,
          status: "ended",
          endedAt: "2026-08-23",
          endedReason: "birth",
          gestation: null,
        },
        children: { ok: true, value: [ilo] },
        basis: { ok: true, value: "none" },
      },
    });
    const own = screen.getByRole("region", { name: "After the birth" });
    expect(own).toHaveTextContent("Ilo 6 weeks");
    expect(
      within(own).getByRole("heading", { name: "Predictions are paused after birth" }),
    ).toBeInTheDocument();
    expect(within(own).getByRole("link", { name: "Log a period" })).toHaveAttribute(
      "href",
      "/log/2026-10-04",
    );
    expect(own.textContent).not.toMatch(/Week \d/);
    expect(screen.queryByRole("region", { name: "This week" })).toBeNull();
  });

  it("is the quiet card after a loss, with one action and nothing week-shaped", () => {
    show(me(LENA, "cycle"), {
      own: {
        kind: "ended",
        pregnancy: {
          ...lenaPregnancy,
          status: "ended",
          endedAt: "2026-09-30",
          endedReason: "loss",
          gestation: null,
        },
        basis: { ok: true, value: "none" },
      },
    });
    expect(screen.getByRole("heading", { name: "When you are ready" })).toBeInTheDocument();
    expect(
      screen.getByText("Predictions are paused until a period is logged."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log a period when it comes" })).toHaveAttribute(
      "href",
      "/log/2026-10-04",
    );
    expect(document.body.textContent).not.toMatch(/Week|loss|milestone|appointment/i);
  });

  it("is the empty state without a start action for a person who could start one", () => {
    show(me(LENA, "cycle"), {});
    expect(screen.getByRole("heading", { name: "No pregnancy recorded" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start one with a due date or your last period and this becomes week by week.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("asks the none stage nothing about her own body", () => {
    show(me(LENA, "none"), {});
    expect(
      screen.getByRole("heading", { name: "Nothing shared with you yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/your last period|due date/i)).toBeNull();
  });

  it("says when her own pregnancy could not be read", () => {
    show(me(LENA, "pregnancy"), { own: { kind: "failed" } });
    expect(
      screen.getByText("We could not load your pregnancy just now. Reload the page to try again."),
    ).toBeInTheDocument();
  });
});
