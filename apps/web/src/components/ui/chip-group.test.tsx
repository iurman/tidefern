import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymptomCode, cycleVocabulary } from "@tidefern/schemas";
import { describe, expect, it, vi } from "vitest";
import { ChipGroup, labelFromCode, symptomOptions, toggleSelection } from "./chip-group";

describe("chip selection rules", () => {
  it("adds on the first press and removes on the second, keeping order", () => {
    expect(toggleSelection([], "b")).toEqual(["b"]);
    expect(toggleSelection(["b"], "a")).toEqual(["b", "a"]);
    expect(toggleSelection(["b", "a"], "b")).toEqual(["a"]);
  });

  it("labels schema codes in sentence case", () => {
    expect(labelFromCode("tender_breasts")).toBe("Tender breasts");
    expect(labelFromCode("other")).toBe("Other");
    expect(symptomOptions[0]).toEqual({ value: "cramps", label: "Cramps" });
    expect(symptomOptions).toHaveLength(19);
  });

  // The chips used to label themselves from the code ("Insomnia", "Other");
  // they now carry the API's labels so the sheet and every summary agree.
  it("labels every symptom chip exactly as the API's vocabulary does, in its order", () => {
    const vocabulary = cycleVocabulary().symptoms;
    expect(symptomOptions.map(({ value, label }) => ({ code: value, label }))).toEqual(vocabulary);
    expect(symptomOptions.map((option) => option.value)).toEqual(SymptomCode.options);
    expect(symptomOptions.find((option) => option.value === "insomnia")?.label).toBe(
      "Trouble sleeping",
    );
    expect(symptomOptions.find((option) => option.value === "other")?.label).toBe("Something else");
  });
});

describe("ChipGroup", () => {
  const options = [
    { value: "one", label: "One" },
    { value: "two", label: "Two" },
    { value: "three", label: "Three" },
    { value: "four", label: "Four" },
  ];

  it("presses and unpresses chips and reports the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipGroup label="Pick" options={options} visible={4} onChange={onChange} />);
    const one = screen.getByRole("button", { name: "One" });
    expect(one).toHaveAttribute("aria-pressed", "false");
    await user.click(one);
    expect(one).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenLastCalledWith(["one"]);
    await user.click(screen.getByRole("button", { name: "Three" }));
    expect(onChange).toHaveBeenLastCalledWith(["one", "three"]);
    await user.click(one);
    expect(onChange).toHaveBeenLastCalledWith(["three"]);
    expect(screen.queryByRole("button", { name: /More/ })).not.toBeInTheDocument();
  });

  it("hides the rest behind More and reveals them in place", async () => {
    const user = userEvent.setup();
    render(<ChipGroup label="Pick" options={options} visible={2} />);
    expect(screen.queryByRole("button", { name: "Three" })).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More (2)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(screen.getByRole("button", { name: "Three" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the rest at once when a hidden chip is already selected", () => {
    render(<ChipGroup label="Pick" options={options} visible={2} defaultSelected={["four"]} />);
    expect(screen.getByRole("button", { name: "Four" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts no code into an id, a name or a data attribute", () => {
    render(<ChipGroup label="Pick" options={symptomOptions} visible={3} />);
    const html = document.body.innerHTML;
    for (const option of symptomOptions) {
      expect(html).not.toMatch(new RegExp(`(id|name|data-[a-z-]+)="[^"]*${option.value}`));
    }
  });
});
