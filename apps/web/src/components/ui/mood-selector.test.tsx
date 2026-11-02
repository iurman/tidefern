import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodCode } from "@tidefern/schemas";
import { describe, expect, it, vi } from "vitest";
import { MoodSelector, moodOptions } from "./mood-selector";

const checked = () =>
  screen
    .queryAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked)
    .map((radio) => radio.getAttribute("value"));

describe("MoodSelector", () => {
  it("offers the three schema values in order", () => {
    expect(moodOptions.map((option) => option.value)).toEqual(MoodCode.options);
    expect(moodOptions.map((option) => option.label)).toEqual(["Low", "Steady", "Bright"]);
  });

  it("shows nothing chosen for a day with no mood logged, then reports the value she picks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MoodSelector label="Mood" value={null} onChange={onChange} />);
    expect(checked()).toEqual([]);
    await user.click(screen.getByRole("radio", { name: "Bright" }));
    expect(onChange).toHaveBeenCalledWith("bright");
  });

  it("keeps one value chosen and lays out as three columns", async () => {
    const user = userEvent.setup();
    render(<MoodSelector label="Mood" defaultValue="steady" />);
    expect(checked()).toEqual(["steady"]);
    await user.click(screen.getByRole("radio", { name: "Low" }));
    expect(checked()).toEqual(["low"]);
    const group = screen.getByRole("group", { name: "Mood" });
    expect(group).toHaveClass("columns");
    expect(group.style.getPropertyValue("--segment-count")).toBe("3");
  });

  it("carries the caller's action inside the group", () => {
    render(
      <MoodSelector
        label="Mood"
        value="low"
        onChange={() => {}}
        action={
          <button type="button" aria-label="Clear mood">
            Clear
          </button>
        }
      />,
    );
    expect(
      within(screen.getByRole("group", { name: "Mood" })).getByRole("button", {
        name: "Clear mood",
      }),
    ).toBeVisible();
  });
});
