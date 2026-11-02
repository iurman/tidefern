import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionCards } from "./option-cards";

const options = [
  { value: "a", title: "First", line: "The first one." },
  { value: "b", title: "Second", line: "The second one." },
] as const;

describe("option cards", () => {
  it("draws one native radio per card, named by its title and described by its line", () => {
    render(
      <>
        <h2 id="question">Which one?</h2>
        <OptionCards labelledBy="question" options={options} value={null} onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole("group", { name: "Which one?" })).toBeVisible();
    const first = screen.getByRole("radio", { name: "First" });
    expect(first).toHaveAccessibleDescription("The first one.");
    expect(first).not.toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("chooses with a click anywhere on the card and with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<OptionCards legend="Which one?" options={options} value="a" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "First" })).toBeChecked();
    await userEvent.click(screen.getByText("The second one."));
    expect(onChange).toHaveBeenLastCalledWith("b");
    screen.getByRole("radio", { name: "First" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("names the next step under the group when nothing is chosen", () => {
    render(
      <OptionCards
        legend="Which one?"
        options={options}
        value={null}
        onChange={() => {}}
        error="Choose one to continue."
      />,
    );
    const group = screen.getByRole("group", { name: "Which one?" });
    expect(group).toHaveAccessibleDescription("Choose one to continue.");
    expect(group).toHaveAttribute("data-invalid", "true");
  });

  it("draws a compact list of titles alone", () => {
    render(
      <OptionCards
        legend="How?"
        compact
        options={[{ value: "x", title: "One way" }]}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "One way" })).not.toHaveAccessibleDescription();
  });
});
