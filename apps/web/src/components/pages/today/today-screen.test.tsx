import { render, screen, within } from "@testing-library/react";
import type { CyclePrediction } from "@tidefern/schemas";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Hero, TodayView } from "@/app/(app)/today/load";
import { emptyDay } from "@/lib/day-log";
import { PREDICTION_FOOTER } from "@/lib/prediction-copy";
import { TodayScreen } from "./today-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const today = "2026-10-05";

const prediction: CyclePrediction = {
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  computedAt: "2026-10-05T00:00:00.000Z",
  basis: "first_guess",
  cycleLength: 28,
  sampleSize: 0,
  nextPeriod: { expected: "2026-11-02", start: "2026-10-29", end: "2026-11-06" },
  ovulation: { expected: "2026-10-19", start: "2026-10-17", end: "2026-10-21" },
  fertileWindow: { start: "2026-10-14", end: "2026-10-19" },
  uncertaintyDays: 4,
  ovulationBandDays: 2,
  irregular: false,
  periodsLogged: 1,
  cycleLengthRange: null,
  daysLate: 0,
  pointToCare: false,
};

const cycleHero: Hero = {
  kind: "cycle",
  prediction,
  cycleDay: 1,
  latestStart: today,
  loggedDays: [today],
  week: { logged: { start: today, end: today }, nextPeriod: null, fertile: null },
  nudge: true,
};

function view(patch: Partial<TodayView>): TodayView {
  return {
    today,
    stage: "cycle",
    hero: { kind: "empty" },
    child: null,
    log: { stage: "cycle", initial: emptyDay(today) },
    partners: { ok: true, value: { people: [], childNames: {}, pregnancyPaused: false } },
    ...patch,
  };
}

describe("TodayScreen", () => {
  it("lays the cycle stage out as composition A: ring, tide line, open card, side cards, footer", () => {
    const { container } = render(<TodayScreen view={view({ hero: cycleHero })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Today, Monday, Oct 5" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Log today" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "You are the only one who can see this" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByText(PREDICTION_FOOTER)).toBeVisible();
    // Signature move 5: one warmth surface on the screen, and it holds no control.
    const warm = container.querySelectorAll(".warmth");
    expect(warm).toHaveLength(1);
    expect(warm[0]?.querySelector("button, a, input")).toBeNull();
    // The prediction footer closes the page: nothing of the page follows it.
    expect(screen.getByText(PREDICTION_FOOTER).nextElementSibling).toBeNull();
  });

  it("keeps the open card in place when the page refreshes into another state", () => {
    const { rerender } = render(<TodayScreen view={view({})} />);
    const before = screen.getByRole("region", { name: "Log today" });
    rerender(<TodayScreen view={view({ hero: cycleHero })} />);
    // The same element, so a save's "Saved" line and its Undo survive the refresh.
    expect(screen.getByRole("region", { name: "Log today" })).toBe(before);
  });

  it("shows no footer and no This week without a prediction", () => {
    render(<TodayScreen view={view({ hero: { kind: "quiet", feeding: false } })} />);
    expect(screen.queryByText(PREDICTION_FOOTER)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "This week" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "When you are ready" })).toBeVisible();
  });

  it("asks the none stage nothing: no open card, no sheet, no log action", () => {
    render(
      <TodayScreen
        view={view({
          stage: "none",
          log: null,
          partners: null,
          hero: { kind: "shared", people: [], children: { ok: true, value: [] } },
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nothing shared with you yet" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Log today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log/i })).not.toBeInTheDocument();
    expect(screen.queryByText(PREDICTION_FOOTER)).not.toBeInTheDocument();
  });

  it("puts the pregnancy's week card where the ring goes, and nothing else on warmth", () => {
    const { container } = render(
      <TodayScreen
        view={view({
          stage: "pregnancy",
          log: { stage: "pregnancy", initial: emptyDay(today) },
          hero: {
            kind: "pregnancy",
            pregnancy: { ok: true, value: { dueDate: "2027-02-07", method: "lmp" } },
          },
        })}
      />,
    );
    expect(screen.getAllByRole("region", { name: "This week" })).toHaveLength(1);
    expect(container.querySelectorAll(".warmth")).toHaveLength(0);
    const card = screen.getByRole("region", { name: "Log today" });
    // Pregnancy logs symptoms, mood and a note; never a period.
    expect(within(card).queryByRole("switch", { name: "Period" })).not.toBeInTheDocument();
  });

  it("says the cycle could not be read, and keeps the open card", () => {
    render(<TodayScreen view={view({ hero: { kind: "failed" } })} />);
    expect(
      screen.getByText("We could not load your cycle just now. Reload the page to try again."),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Log today" })).toBeInTheDocument();
  });
});
