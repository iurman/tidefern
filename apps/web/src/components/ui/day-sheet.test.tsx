import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@tidefern/schemas";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, type DayDraft } from "@/lib/day-log";
import { DayLogForm, DaySheet, formatSheetDate, noteAudience, shareExplanation } from "./day-sheet";
import { componentStates } from "./specimen";
import { specimens as patterns } from "./specimens/patterns";

const play = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sound")>()),
  play,
}));

beforeEach(() => {
  play.mockReset();
});

describe("formatSheetDate", () => {
  it("names the weekday and the month day from a calendar string, in UTC", () => {
    expect(formatSheetDate("2026-10-05")).toBe("Monday, Oct 5");
    expect(formatSheetDate("2026-12-31")).toBe("Thursday, Dec 31");
  });

  it("refuses anything that is not a calendar date", () => {
    expect(() => formatSheetDate("2026-10-05T00:00:00Z")).toThrow();
  });
});

const date = "2026-10-05";

const sharedNote: Note = {
  id: "018f5e7a-5eed-7040-8000-000000000002",
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  authorId: "018f5e7a-5eed-7000-8000-000000000001",
  category: "cycle.symptoms",
  date,
  body: "Steadier today. Sharing this one.",
  createdAt: "2026-10-05T07:30:00.000Z",
  updatedAt: "2026-10-05T07:40:00.000Z",
  version: 2,
};

function day(patch: Partial<DayDraft>): DayDraft {
  return { ...EMPTY_DRAFT, ...patch };
}

function sheet(props: Partial<Parameters<typeof DaySheet>[0]> = {}) {
  return (
    <DaySheet
      inline
      open
      onClose={() => {}}
      date={date}
      stage="cycle"
      onSave={() => {}}
      {...(props as object)}
    />
  );
}

const checkedFlow = () =>
  within(screen.getByRole("group", { name: "Flow" }))
    .queryAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked)
    .map((radio) => radio.getAttribute("value"));

describe("DaySheet: the period and the flow", () => {
  // The scale used to appear only while the switch was on, and a day saved
  // with the switch on but no flow picked logged no period. The lead's
  // ruling: the scale is always shown, and the switch picks Medium on it.
  it("always shows the flow scale, and the switch picks Medium on it, visibly", async () => {
    const user = userEvent.setup();
    render(sheet());
    const toggle = screen.getByRole("switch", { name: "Period" });
    expect(screen.getByRole("group", { name: "Flow" })).toBeInTheDocument();
    expect(checkedFlow()).toEqual([]);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Heavy" }));
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(checkedFlow()).toEqual([]);
  });

  it("logs a period day with one press and Save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ onSave }));
    await user.click(screen.getByRole("switch", { name: "Period" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ flow: "medium", symptoms: [], mood: null, note: "" });
  });

  it("opens a spotting day with Spotting chosen, the switch off, and keeps it on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ initial: day({ flow: "spotting", symptoms: ["bloating"] }), onSave }));
    expect(screen.getByRole("radio", { name: "Spotting" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Period" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ flow: "spotting", symptoms: ["bloating"] }),
    );
  });

  it("switching the period off clears only a period flow, to unset", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ initial: day({ flow: "light" }), onSave }));
    const toggle = screen.getByRole("switch", { name: "Period" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: null }));
  });

  it("has no switch and no scale in pregnancy, and keeps a flow it cannot show", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ stage: "pregnancy", initial: day({ flow: "light", mood: "low" }), onSave }));
    expect(screen.queryByRole("switch", { name: "Period" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Flow" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mood" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: "light", mood: "low" }));
  });

  it("keeps the switch and the scale after a birth", () => {
    render(sheet({ stage: "postpartum" }));
    expect(screen.getByRole("switch", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Flow" })).toBeInTheDocument();
  });
});

describe("DaySheet: symptoms, mood and the note", () => {
  it("labels the chips with the API's words and keeps the More chip", async () => {
    const user = userEvent.setup();
    render(sheet());
    expect(screen.queryByRole("button", { name: "Trouble sleeping" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More (13)" }));
    expect(screen.getByRole("button", { name: "Trouble sleeping" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Something else" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Insomnia" })).not.toBeInTheDocument();
  });

  it("hands every field back on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ initial: day({ symptoms: ["cramps"], mood: "steady" }), onSave }));
    await user.click(screen.getByRole("button", { name: "Headache" }));
    await user.click(screen.getByRole("radio", { name: "Bright" }));
    await user.type(screen.getByRole("textbox", { name: "Private note" }), "Slept badly.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      flow: null,
      symptoms: ["cramps", "headache"],
      mood: "bright",
      note: "Slept badly.",
    });
  });

  it("holds the note to the API's 4000 characters", () => {
    render(sheet());
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveAttribute(
      "maxlength",
      "4000",
    );
  });

  it("never puts the note into the title or an accessible name", () => {
    render(sheet({ initial: day({ note: "a very private sentence" }) }));
    expect(screen.getByRole("heading", { name: "Monday, Oct 5" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /private sentence/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue(
      "a very private sentence",
    );
  });
});

const checkedMood = () =>
  within(screen.getByRole("group", { name: "Mood" }))
    .queryAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked)
    .map((radio) => radio.getAttribute("value"));

describe("DaySheet: the shared scales, the mood's Clear and the Period help", () => {
  it("draws flow and mood through FlowScale and MoodSelector, both as columns", () => {
    render(sheet());
    const flow = screen.getByRole("group", { name: "Flow" });
    const mood = screen.getByRole("group", { name: "Mood" });
    expect(flow).toHaveClass("columns", "periodTone");
    expect(flow.style.getPropertyValue("--segment-count")).toBe("5");
    expect(mood).toHaveClass("columns");
    expect(mood.style.getPropertyValue("--segment-count")).toBe("3");
    expect(checkedFlow()).toEqual([]);
    expect(checkedMood()).toEqual([]);
  });

  it("offers Clear only while a mood is chosen, inside the mood group, and keeps focus on the radio", async () => {
    const user = userEvent.setup();
    render(sheet());
    expect(screen.queryByRole("button", { name: "Clear mood" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Low" }));
    const mood = screen.getByRole("group", { name: "Mood" });
    expect(within(mood).getByRole("button", { name: "Clear mood" })).toHaveTextContent("Clear");
    // The Clear arrives after the radios, so the radio she pressed keeps its focus and the arrows keep working.
    expect(screen.getByRole("radio", { name: "Low" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(checkedMood()).toEqual(["steady"]);
    expect(screen.getByRole("radio", { name: "Steady" })).toHaveFocus();
  });

  it("clears a chosen mood back to none, moves focus to Low and saves no mood", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(sheet({ initial: day({ mood: "steady", symptoms: ["cramps"] }), onSave }));
    expect(checkedMood()).toEqual(["steady"]);
    await user.click(screen.getByRole("button", { name: "Clear mood" }));
    expect(checkedMood()).toEqual([]);
    expect(screen.getByRole("radio", { name: "Low" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Low" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Clear mood" })).not.toBeInTheDocument();
    // The draft now differs from what is saved, so the quiet action reads Cancel.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ flow: null, symptoms: ["cramps"], mood: null, note: "" });
  });

  it("says what the Period switch does in one short line", () => {
    render(sheet());
    expect(screen.getByRole("switch", { name: "Period" })).toHaveAccessibleDescription(
      "Logs a period day at Medium. Change the flow below.",
    );
  });
});

describe("DaySheet: notes already shared and the share action", () => {
  it("shows a shared note read-only, labelled by who can read it, never as private", () => {
    render(sheet({ otherNotes: [sharedNote], onDeleteNote: async () => false }));
    const item = within(screen.getByRole("list", { name: "Notes on this day" })).getByRole(
      "listitem",
    );
    expect(within(item).getByText("Shared with people who can see your symptoms")).toBeVisible();
    expect(within(item).getByText("Steadier today. Sharing this one.")).toBeVisible();
    expect(within(item).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(item).queryByText("Only you can read this.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
  });

  it("names the pregnancy overview for a note shared there", () => {
    expect(noteAudience("pregnancy.overview")).toBe(
      "Shared with people who can see your pregnancy overview",
    );
    expect(noteAudience("journal.private")).toBe("Only you can read this.");
  });

  it("asks before it shares, says it is one way, and empties the field once shared", async () => {
    const user = userEvent.setup();
    const onShareNote = vi.fn(async () => true);
    render(sheet({ initial: day({ note: "Steadier today." }), onShareNote }));
    await user.click(screen.getByRole("button", { name: "Share this note with..." }));
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    expect(
      within(confirm).getByText(
        "It moves out of your private notes and is filed with your symptoms, so the people who can see your symptoms can read it. A shared note cannot be made private again, only deleted.",
      ),
    ).toBeVisible();
    expect(onShareNote).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Share note" }));
    expect(onShareNote).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("");
    expect(screen.queryByRole("group", { name: "Share this note?" })).not.toBeInTheDocument();
  });

  it("files a pregnancy note with the pregnancy overview", () => {
    expect(shareExplanation("pregnancy")).toContain("filed with your pregnancy overview");
    expect(shareExplanation("postpartum")).toContain("filed with your symptoms");
  });

  it("shares only a saved note that is unchanged", async () => {
    const user = userEvent.setup();
    const { unmount } = render(sheet({ onShareNote: async () => true }));
    expect(screen.queryByRole("button", { name: /Share this note/ })).not.toBeInTheDocument();
    unmount();
    render(sheet({ initial: day({ note: "Saved text" }), onShareNote: async () => true }));
    await user.type(screen.getByRole("textbox", { name: "Private note" }), " and more");
    expect(screen.getByRole("button", { name: "Share this note with..." })).toBeDisabled();
    expect(screen.getByText("Save the note first, then share it.")).toBeVisible();
  });

  it("keeps the confirm step open and says why when a share fails", async () => {
    const user = userEvent.setup();
    render(
      sheet({
        initial: day({ note: "Steadier today." }),
        onShareNote: async () => false,
        shareError: { message: "We could not share this note. Try again.", id: 1 },
        defaultConfirm: "share",
      }),
    );
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    expect(within(confirm).getByText("We could not share this note. Try again.")).toBeVisible();
    await user.click(within(confirm).getByRole("button", { name: "Keep it private" }));
    expect(screen.getByRole("button", { name: "Share this note with..." })).toBeEnabled();
  });

  it("asks before it deletes a shared note", async () => {
    const user = userEvent.setup();
    const onDeleteNote = vi.fn(async () => true);
    render(sheet({ otherNotes: [sharedNote], onDeleteNote }));
    await user.click(screen.getByRole("button", { name: "Delete this note" }));
    const confirm = screen.getByRole("group", { name: "Delete this note?" });
    expect(onDeleteNote).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Delete note" }));
    expect(onDeleteNote).toHaveBeenCalledWith(sharedNote.id);
  });

  it("moves focus into a confirm step and back to its trigger, never to the page", async () => {
    const user = userEvent.setup();
    render(
      sheet({
        initial: day({ note: "Steadier today." }),
        onShareNote: async () => false,
        otherNotes: [sharedNote],
        onDeleteNote: async () => false,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Share this note with..." }));
    expect(screen.getByText("Share this note?")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep it private" }));
    expect(screen.getByRole("button", { name: "Share this note with..." })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Delete this note" }));
    expect(screen.getByText("Delete this note?")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: "Delete this note" })).toHaveFocus();
  });

  it("takes no focus on its own when it opens with a confirm step showing", () => {
    render(
      sheet({
        initial: day({ note: "Text" }),
        onShareNote: async () => true,
        defaultConfirm: "share",
      }),
    );
    expect(screen.getByText("Share this note?")).not.toHaveFocus();
  });

  it("puts the note's current text in an untouched field when it changed, and closes the step", async () => {
    const user = userEvent.setup();
    let answer: (shared: boolean) => void = () => {};
    const onShareNote = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const conflict = "This note changed somewhere else. Check it, then share it again.";
    const { rerender } = render(
      sheet({ initial: day({ note: "Text A" }), onShareNote, defaultConfirm: "share" }),
    );
    await user.click(screen.getByRole("button", { name: "Share note" }));
    // The controller read the note again: newer text, and the share did not happen.
    rerender(
      sheet({
        initial: day({ note: "Text A" }),
        saved: day({ note: "Text B" }),
        onShareNote,
        shareError: { message: conflict, id: 1 },
      }),
    );
    await act(async () => answer(false));
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("Text B");
    expect(screen.queryByRole("group", { name: "Share this note?" })).not.toBeInTheDocument();
    expect(screen.getByText(conflict).closest("[tabindex]")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Share this note with..." })).toBeEnabled();
  });

  it("keeps her own edit when the saved note changes under it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      sheet({ initial: day({ note: "Text A" }), onShareNote: async () => false }),
    );
    await user.type(screen.getByRole("textbox", { name: "Private note" }), " and more");
    rerender(
      sheet({
        initial: day({ note: "Text A" }),
        saved: day({ note: "Text B" }),
        onShareNote: async () => false,
      }),
    );
    expect(screen.getByRole("textbox", { name: "Private note" })).toHaveValue("Text A and more");
  });

  it("will not share text that differs from what is saved, even from the confirm step", async () => {
    const user = userEvent.setup();
    const onShareNote = vi.fn(async () => true);
    render(sheet({ initial: day({ note: "Saved text" }), onShareNote, defaultConfirm: "share" }));
    await user.type(screen.getByRole("textbox", { name: "Private note" }), " and more");
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    expect(within(confirm).getByRole("button", { name: "Share note" })).toBeDisabled();
    expect(within(confirm).getByText("Save the note first, then share it.")).toBeVisible();
    expect(onShareNote).not.toHaveBeenCalled();
  });

  it("puts a share failure away once she opens or closes the step herself", async () => {
    const user = userEvent.setup();
    const failed = "We could not share this note. Try again.";
    const props = {
      initial: day({ note: "Steadier today." }),
      onShareNote: async () => false,
      defaultConfirm: "share" as const,
    };
    const { rerender } = render(sheet({ ...props, shareError: { message: failed, id: 1 } }));
    await user.click(screen.getByRole("button", { name: "Keep it private" }));
    expect(screen.queryByText(failed)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Share this note with..." }));
    expect(screen.queryByText(failed)).not.toBeInTheDocument();
    // A new failure is a new line.
    rerender(sheet({ ...props, shareError: { message: failed, id: 2 } }));
    const confirm = screen.getByRole("group", { name: "Share this note?" });
    expect(within(confirm).getByText(failed)).toBeVisible();
  });

  it("says a note was added by someone else when they wrote it", () => {
    render(
      sheet({
        otherNotes: [{ ...sharedNote, authorId: "018f5e7a-5eed-7000-8000-000000000003" }],
      }),
    );
    expect(screen.getByText("Added by someone you share with.")).toBeVisible();
  });
});

describe("DaySheet: saving, failing and undoing", () => {
  it("puts each failure under its own part, each with Try again", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      sheet({
        initial: day({ mood: "low", note: "Text" }),
        onSave,
        entryError: { message: "We could not save this day. Try again." },
        noteError: { message: "We could not save your note. Try again." },
      }),
    );
    const note = screen.getByRole("textbox", { name: "Private note" });
    const entryFailure = screen.getByText("We could not save this day. Try again.");
    const noteFailure = screen.getByText("We could not save your note. Try again.");
    const before = Node.DOCUMENT_POSITION_PRECEDING;
    expect(note.compareDocumentPosition(entryFailure) & before).toBeTruthy();
    expect(noteFailure.compareDocumentPosition(note) & before).toBeTruthy();
    const retries = screen.getAllByRole("button", { name: "Try again" });
    expect(retries).toHaveLength(2);
    await user.click(retries[1] as HTMLElement);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ mood: "low", note: "Text" }));
  });

  it("puts focus on a line whose action took its control away", () => {
    render(sheet({ notice: { tone: "success", message: "Note shared.", id: 3, focus: true } }));
    expect(screen.getByText("Note shared.").closest("[tabindex]")).toHaveFocus();
  });

  it("offers no Try again when trying again cannot help", () => {
    render(
      sheet({
        entryError: {
          message: "Your session has ended. Sign in again, then come back to this day.",
          retry: false,
        },
      }),
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows the saved line with Undo while the draft is what was saved", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      sheet({
        initial: day({ mood: "steady" }),
        notice: { tone: "success", message: "Saved for Monday, Oct 5.", id: 1, onUndo },
      }),
    );
    expect(screen.getByText("Saved for Monday, Oct 5.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("radio", { name: "Low" }));
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved for Monday, Oct 5.")).not.toBeVisible();
  });

  it("keeps a share's or a delete's line on screen while the draft has changes", async () => {
    const user = userEvent.setup();
    render(
      sheet({
        initial: day({ mood: "steady" }),
        notice: { tone: "success", message: "Note shared.", id: 2, keepWhileEditing: true },
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Low" }));
    expect(screen.getByText("Note shared.")).toBeVisible();
  });

  it("cancels or closes through the quiet action and ignores a save while one is in flight", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(sheet({ onClose, onSave }));
    // The sheet's own close button comes first; the form's quiet action is the last "Close".
    const closes = screen.getAllByRole("button", { name: "Close" });
    expect(closes).toHaveLength(2);
    await user.click(closes[1] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("radio", { name: "Steady" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    rerender(sheet({ onClose, onSave, saving: true }));
    expect(screen.getByRole("button", { name: "Saving" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saving" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("DaySheet: cues", () => {
  const lines = {
    notice: { tone: "success" as const, message: "Saved for Monday, Oct 5.", id: 1 },
    entryError: { message: "We could not save this day. Try again.", id: 1 },
    noteError: { message: "We could not save your note. Try again.", id: 1 },
    shareError: { message: "We could not share this note. Try again.", id: 1 },
    deleteError: { id: sharedNote.id, message: "We could not delete this note. Try again." },
    otherNotes: [sharedNote],
    onDeleteNote: async () => false,
    onShareNote: async () => false,
    defaultConfirm: "share" as const,
    initial: day({ note: "Text" }),
  };

  it("plays a cue with each line that answers a press, one error cue for the save", () => {
    render(sheet(lines));
    expect(play.mock.calls.map(([cue]) => cue).sort()).toEqual([
      "error",
      "error",
      "error",
      "success",
    ]);
  });

  it("plays none with cues off", () => {
    render(sheet({ ...lines, cues: false }));
    expect(play).not.toHaveBeenCalled();
  });

  it("plays none on the reference page, where nothing answers a press", () => {
    for (const specimen of patterns.specimens) {
      for (const state of componentStates) {
        if (specimen.states?.[state] === "none") continue;
        const { unmount } = render(<>{specimen.render(state)}</>);
        unmount();
      }
    }
    expect(play).not.toHaveBeenCalled();
  });
});

describe("DaySheet as a page", () => {
  it("is a page: an h1, and the days and the way back as real links", () => {
    render(
      <DaySheet
        page={{
          closeHref: "/calendar",
          previousHref: "/log/2026-10-04",
          nextHref: "/log/2026-10-06",
        }}
        date={date}
        stage="cycle"
        onSave={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Monday, Oct 5" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous day" })).toHaveAttribute(
      "href",
      "/log/2026-10-04",
    );
    expect(screen.getByRole("link", { name: "Next day" })).toHaveAttribute(
      "href",
      "/log/2026-10-06",
    );
    for (const link of screen.getAllByRole("link", { name: "Close" })) {
      expect(link).toHaveAttribute("href", "/calendar");
    }
  });

  it("has no next day on today", () => {
    render(
      <DaySheet
        page={{ closeHref: "/calendar", previousHref: "/log/2026-10-04" }}
        date={date}
        stage="cycle"
        onSave={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: "Next day" })).not.toBeInTheDocument();
  });
});

describe("DayLogForm", () => {
  it("posts, never gets, and keeps its controls inert until the page hydrates", () => {
    const html = renderToString(
      <DayLogForm stage="cycle" initial={EMPTY_DRAFT} onSave={() => {}} />,
    );
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<form[^>]*inert=""/);
    render(<DayLogForm stage="cycle" initial={EMPTY_DRAFT} onSave={() => {}} />);
    const form = document.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).not.toHaveAttribute("inert");
  });

  it("offers Cancel inline only while the draft differs, and puts the draft back", async () => {
    const user = userEvent.setup();
    render(
      <DayLogForm
        stage="cycle"
        initial={day({ mood: "steady" })}
        onSave={() => {}}
        secondary={{ kind: "reset" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("radio", { name: "Steady" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});
