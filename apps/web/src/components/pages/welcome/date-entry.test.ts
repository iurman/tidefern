import { describe, expect, it } from "vitest";
import { dateEntryIn } from "./date-entry";

/** The parts as SegmentedDateInput draws them: a label per part with `data-part`, its input inside. */
function field(key: string, parts: { month: string; day: string; year: string }) {
  const root = document.createElement("div");
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-date-key", key);
  for (const [part, value] of Object.entries(parts)) {
    const label = document.createElement("label");
    label.dataset.part = part;
    const input = document.createElement("input");
    input.value = value;
    label.append(input);
    wrapper.append(label);
  }
  root.append(wrapper);
  return root;
}

describe("reading what a date field holds", () => {
  it("tells nothing, some parts and all three apart", () => {
    expect(dateEntryIn(field("start", { month: "", day: "", year: "" }), "start")).toBe("empty");
    expect(dateEntryIn(field("start", { month: "09", day: "", year: "" }), "start")).toBe(
      "partial",
    );
    expect(dateEntryIn(field("start", { month: "09", day: "23", year: "26" }), "start")).toBe(
      "partial",
    );
    expect(dateEntryIn(field("start", { month: "09", day: "23", year: "2026" }), "start")).toBe(
      "complete",
    );
    // Three full parts that make no date are complete here; the date check refuses them.
    expect(dateEntryIn(field("start", { month: "02", day: "31", year: "2027" }), "start")).toBe(
      "complete",
    );
  });

  it("reads only the field with its key, and empty when there is none", () => {
    const root = field("birth", { month: "09", day: "", year: "" });
    expect(dateEntryIn(root, "birth")).toBe("partial");
    expect(dateEntryIn(root, "since")).toBe("empty");
    expect(dateEntryIn(null, "birth")).toBe("empty");
  });
});
