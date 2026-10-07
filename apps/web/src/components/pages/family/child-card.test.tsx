import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChildCard } from "./child-card";
import { SOL_ID, child, event } from "./fixtures";
import type { FamilyCard } from "./load";
import { summarizeDay } from "./summary";
import { words } from "./test-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const today = "2026-10-04";

const guardian = { role: "guardian", canRead: true, canWrite: true, canDelete: true } as const;
const reader = { role: "read", canRead: true, canWrite: false, canDelete: false } as const;
const contributor = {
  role: "contribute",
  canRead: true,
  canWrite: true,
  canDelete: false,
} as const;
const summaryOnly = { role: "summary", canRead: false, canWrite: false, canDelete: false } as const;

function day() {
  const diaper = event({
    kind: "diaper",
    diaperContents: "wet",
    startedAt: "2026-10-04T22:00:00.000Z",
  });
  return {
    summary: summarizeDay({
      last: { feed: null, sleep: null, diaper },
      todayEvents: [diaper],
      today,
      timeZone: "America/Vancouver",
      now: new Date("2026-10-05T00:00:00.000Z"),
    }),
    ongoingSleep: null,
  };
}

function card(overrides: Partial<FamilyCard>): FamilyCard {
  return { child: child(), access: guardian, guardians: ["you", "Lena"], day: day(), ...overrides };
}

describe("ChildCard", () => {
  it("gives a guardian the summary, the controls, the guardians and the way to the child's page", () => {
    render(<ChildCard card={card({})} today={today} units="metric" warm />);
    expect(screen.getByRole("heading", { level: 2, name: "Ilo" })).toBeInTheDocument();
    expect(screen.getByText("6 weeks")).toBeInTheDocument();
    const summary = screen.getByRole("article").querySelector("dl");
    expect(summary).toHaveAttribute("data-warmth", "true");
    const row = (label: string) =>
      [...(screen.getByText(label).parentElement?.children ?? [])].map((cell) =>
        words(cell.textContent),
      );
    expect(row("Last feed")).toEqual(["Last feed", "None logged yet"]);
    expect(row("Last diaper")).toEqual(["Last diaper", "2 h ago", "Today: 1 (1 wet, 0 dirty)"]);
    expect(screen.getByRole("button", { name: "Feed for Ilo" })).toBeInTheDocument();
    expect(screen.getByText("Guardians: you and Lena")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Timeline, growth and milestones for Ilo" }),
    ).toHaveAttribute("href", `/family/${child().id}`);
  });

  it("gives a contribute grantee the controls without the guardians", () => {
    render(
      <ChildCard
        card={card({ access: contributor, guardians: null })}
        today={today}
        units="metric"
        warm={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Diaper for Ilo" })).toBeInTheDocument();
    expect(screen.queryByText(/Guardians?:/)).toBeNull();
    expect(screen.getByRole("article").querySelector("[data-warmth]")).toBeNull();
  });

  it("gives a read grantee what her grant answers and no control", () => {
    const sol = child({ id: SOL_ID, displayName: "Sol", dateOfBirth: "2024-04-04", sex: "male" });
    render(
      <ChildCard
        card={card({ child: sol, access: reader, guardians: null })}
        today={today}
        units="imperial"
        warm
      />,
    );
    expect(screen.getByText("2 years, 6 months")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Guardians?:/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Timeline, growth and milestones for Sol" }),
    ).toBeInTheDocument();
  });

  it("gives a summary grantee the name, the age and the owner's line alone", () => {
    render(
      <ChildCard
        card={card({ access: summaryOnly, guardians: null, day: null })}
        today={today}
        units="metric"
        warm={false}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Ilo" })).toBeInTheDocument();
    expect(screen.getByText(/^\[OWNER\] line for a person whose grant shows/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("term")).toBeNull();
  });

  it("says a failed read of the day on its own card and offers no control on it", () => {
    render(<ChildCard card={card({ day: "failed" })} today={today} units="metric" warm={false} />);
    expect(
      screen.getByText("We could not load today for this child. Reload the page to try again."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
