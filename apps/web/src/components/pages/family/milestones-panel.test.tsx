import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ILO_ID, checklist } from "./fixtures";
import { MilestonesPanel, byDomain } from "./milestones-panel";
import { fakeApi, json, problem } from "./test-api";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  refresh.mockClear();
  api = fakeApi();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MilestonesPanel", () => {
  it("shows the API's list under CDC's headings with the template and the attribution once", () => {
    render(<MilestonesPanel childId={ILO_ID} checklist={checklist()} canWrite />);
    expect(screen.getByRole("heading", { name: "Checklist for 2 months" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Most children do this by 2 months. This is not a screening tool; your pediatrician is.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Source: CDC\./)).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Social and emotional" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Language and communication" })).toBeInTheDocument();
    const marked = screen.getByRole("checkbox", { name: "Calms down when spoken to or picked up" });
    expect(marked).toBeChecked();
    expect(screen.getByText("Marked on Oct 1, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Nothing marked yet")).toBeNull();
  });

  it("checks an item off only once the API holds it, and reads the page again", async () => {
    const user = userEvent.setup();
    api.route(
      `PUT /api/v1/children/${ILO_ID}/milestones`,
      json({
        id: "2m-social-2",
        domain: "social",
        text: "Looks at your face",
        checked: true,
        checkedOn: "2026-10-04",
        eventId: "018f5e7a-5eed-7030-8000-0000000000aa",
      }),
    );
    render(<MilestonesPanel childId={ILO_ID} checklist={checklist()} canWrite />);
    await user.click(screen.getByRole("checkbox", { name: "Looks at your face" }));
    expect(await screen.findByText("Marked on Oct 4, 2026")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Looks at your face" })).toBeChecked();
    expect(api.calls[0]).toMatchObject({
      method: "PUT",
      path: `/api/v1/children/${ILO_ID}/milestones`,
      query: "",
      body: { itemId: "2m-social-2", checked: true },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the box as it was and says what to do next beside it when the save fails", async () => {
    const user = userEvent.setup();
    api.route(`PUT /api/v1/children/${ILO_ID}/milestones`, problem(500));
    render(<MilestonesPanel childId={ILO_ID} checklist={checklist()} canWrite />);
    const box = screen.getByRole("checkbox", { name: "Looks at your face" });
    await user.click(box);
    expect(await screen.findByText("We could not save this. Try again.")).toBeInTheDocument();
    expect(box).not.toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is read-only for someone who cannot write, and says when nothing is marked", () => {
    const empty = checklist({
      items: checklist().items.map((item) => ({ ...item, checked: false, checkedOn: null })),
    });
    const { rerender } = render(
      <MilestonesPanel childId={ILO_ID} checklist={empty} canWrite={false} />,
    );
    const region = screen.getByRole("region", { name: "Nothing marked yet" });
    expect(within(region).queryByRole("button")).toBeNull();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    // Nothing marked: the empty state carries the not-a-screening line, the list the framing.
    expect(screen.getByText("Most children do this by 2 months.")).toBeInTheDocument();
    expect(
      screen.getAllByText(/This is not a screening tool; your pediatrician is\./),
    ).toHaveLength(1);
    rerender(<MilestonesPanel childId={ILO_ID} checklist={empty} canWrite />);
    expect(
      within(screen.getByRole("region", { name: "Nothing marked yet" })).getByRole("button", {
        name: "Mark a milestone",
      }),
    ).toBeInTheDocument();
  });

  it("moves to the first item from the empty state's action", async () => {
    const user = userEvent.setup();
    const empty = checklist({
      items: checklist().items.map((item) => ({ ...item, checked: false, checkedOn: null })),
    });
    render(<MilestonesPanel childId={ILO_ID} checklist={empty} canWrite />);
    await user.click(screen.getByRole("button", { name: "Mark a milestone" }));
    expect(
      screen.getByRole("checkbox", { name: "Calms down when spoken to or picked up" }),
    ).toHaveFocus();
  });
});

describe("byDomain", () => {
  it("keeps CDC's order of headings and leaves out an empty one", () => {
    const groups = byDomain(checklist().items);
    expect(groups.map((group) => group.domain)).toEqual(["social", "language"]);
    expect(groups[0]?.items).toHaveLength(2);
  });
});
