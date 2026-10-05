import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { componentStates, type SpecimenGroup } from "./specimen";
import { SpecimenFrame } from "./specimen-frame";

const group: SpecimenGroup = {
  slug: "example",
  title: "Example",
  lede: "A group with one specimen.",
  specimens: [
    {
      name: "Example control",
      source: "apps/web/src/components/ui/example.tsx",
      usage: "<Example />",
      keyboard: "Tab moves, Enter activates.",
      states: { empty: "none" },
      render: (state) => (
        <button type="button" disabled={state === "disabled"}>
          {state}
        </button>
      ),
    },
  ],
};

describe("SpecimenFrame", () => {
  it("renders every state once per theme and forces only the pseudo-class states", () => {
    render(<SpecimenFrame group={group} />);
    const themed = document.querySelectorAll("[data-theme]");
    expect(themed).toHaveLength(2);
    expect(themed[0]).toHaveAttribute("data-theme", "light");
    expect(themed[1]).toHaveAttribute("data-theme", "dark");
    for (const state of componentStates) {
      if (state === "empty") continue;
      expect(screen.getAllByRole("button", { name: state })).toHaveLength(2);
    }
    expect(screen.getAllByText("none")).toHaveLength(2);
    const forced = document.querySelectorAll("[data-specimen-state]");
    expect(forced).toHaveLength(6);
    for (const stage of forced) {
      expect(stage.children).toHaveLength(1);
      expect(stage.firstElementChild?.tagName).toBe("BUTTON");
    }
    expect(document.querySelectorAll('[data-specimen-state="disabled"]')).toHaveLength(0);
    expect(document.querySelectorAll("[data-state]")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "disabled" })[0]).toBeDisabled();
  });

  it("links the source path and prints the keyboard note and usage", () => {
    render(<SpecimenFrame group={group} />);
    expect(
      screen.getByRole("link", { name: "apps/web/src/components/ui/example.tsx" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/iurman/tidefern/blob/main/apps/web/src/components/ui/example.tsx",
    );
    expect(screen.getByText("Tab moves, Enter activates.")).toBeInTheDocument();
    expect(screen.getByText("<Example />")).toBeInTheDocument();
  });

  it("changes the frame width without touching the document", async () => {
    const user = userEvent.setup();
    render(<SpecimenFrame group={group} />);
    const control = screen.getByRole("group", { name: "Specimen width" });
    const wrapper = control.parentElement as HTMLElement;
    expect(wrapper.style.getPropertyValue("--specimen-width")).toBe("1200px");
    await user.click(screen.getByRole("button", { name: /Phone/ }));
    expect(wrapper.style.getPropertyValue("--specimen-width")).toBe("390px");
    expect(screen.getByRole("button", { name: /Phone/ })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.style.getPropertyValue("--specimen-width")).toBe("");
  });
});
