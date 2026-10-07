import { render, screen, within } from "@testing-library/react";
import type { CycleStatus } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { CARE_SENTENCE, CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { SharedSummaries, personBlocks, pregnancyLines, statusLines } from "./shared-summaries";

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";

function status(patch: Partial<CycleStatus> = {}): CycleStatus {
  return {
    subjectId: NOOR,
    date: "2026-10-05",
    cycleDay: 3,
    periodDay: 3,
    inFertileWindow: false,
    ...patch,
  };
}

describe("statusLines", () => {
  it("says only what the status card carries (architecture 8.2)", () => {
    expect(statusLines(status())).toEqual(["Cycle day 3", "Period day 3"]);
    expect(statusLines(status({ cycleDay: 14, periodDay: null, inFertileWindow: true }))).toEqual([
      "Cycle day 14",
      `In the estimated fertile window today. ${CONTRACEPTION_LINE}`,
    ]);
    expect(statusLines(status({ cycleDay: null, periodDay: null }))).toEqual([
      "Nothing to show for today yet.",
    ]);
  });
});

describe("pregnancyLines", () => {
  it("says the week and the due date, or only that updates are paused", () => {
    expect(
      pregnancyLines({
        status: "active",
        id: "018f5e7a-5eed-7020-8000-000000000001",
        subjectId: NOOR,
        dueDate: "2027-02-07",
        gestation: { weeks: 22, days: 3, totalDays: 157, trimester: 2, label: "22w3d" },
        version: 1,
      }),
    ).toEqual(["Week 22 and 3 days", "Due Feb 7, 2027"]);
    expect(pregnancyLines({ status: "paused" })).toEqual(["Weekly updates are paused."]);
  });
});

describe("personBlocks", () => {
  it("names each category as /sharing does and says when a read failed", () => {
    expect(
      personBlocks(
        {
          ownerId: NOOR,
          name: "Noor",
          status: { ok: false },
          pregnancy: { ok: true, value: null },
        },
        "Noor",
      ),
    ).toEqual([
      {
        label: "Cycle status",
        lines: ["We could not load what Noor shares just now. Reload the page to try again."],
      },
      { label: "Pregnancy overview", lines: ["Nothing to show for today yet."] },
    ]);
  });
});

describe("SharedSummaries", () => {
  it("shows a person's status card and a child's age, and never a care sentence or a log", () => {
    render(
      <SharedSummaries
        people={[
          { ownerId: NOOR, name: "Noor", status: { ok: true, value: status() }, pregnancy: null },
        ]}
        childAges={{
          ok: true,
          value: [
            { id: "018f5e7a-5eed-7006-8000-000000000002", name: "Sol", age: "2 years, 6 months" },
          ],
        }}
      />,
    );
    const noor = screen.getByRole("region", { name: "Noor" });
    expect(within(noor).getByText("Cycle status")).toBeInTheDocument();
    expect(within(noor).getByText("Cycle day 3")).toBeInTheDocument();
    expect(within(noor).getByText("Period day 3")).toBeInTheDocument();
    const sol = screen.getByRole("region", { name: "Sol" });
    expect(within(sol).getByText("2 years, 6 months")).toBeInTheDocument();
    expect(within(sol).getByRole("link", { name: "Open Family" })).toHaveAttribute(
      "href",
      "/family",
    );
    expect(screen.queryByText(CARE_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log/i })).not.toBeInTheDocument();
  });

  it("names someone the sharing list does not, plainly", () => {
    render(
      <SharedSummaries
        people={[
          { ownerId: NOOR, name: null, status: { ok: true, value: status() }, pregnancy: null },
        ]}
        childAges={{ ok: true, value: [] }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Someone who shares with you" })).toBeVisible();
  });

  it("says what would be here when nothing is shared, and what to do when the children failed", () => {
    const { unmount } = render(<SharedSummaries people={[]} childAges={{ ok: true, value: [] }} />);
    expect(screen.getByRole("heading", { name: "Nothing shared with you yet" })).toBeVisible();
    expect(
      screen.getByText(
        "When someone shares a cycle, a pregnancy or a child with you, it shows here.",
      ),
    ).toBeVisible();
    unmount();
    render(<SharedSummaries people={[]} childAges={{ ok: false }} />);
    expect(
      screen.getByText(
        "We could not load the children you see just now. Reload the page to try again.",
      ),
    ).toBeVisible();
  });
});
