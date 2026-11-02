import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
  it("is a native checkbox named by its label, with help and error tied to it", () => {
    render(
      <CheckboxField
        label="I am 18 or older"
        help="Tidefern is for adults."
        error="Tick the box to continue."
        required
      />,
    );
    // jsdom drops the space before the marker's span; a browser reads "I am 18 or older required".
    const box = screen.getByRole("checkbox", { name: /^I am 18 or older\s?required$/ });
    expect(box.tagName).toBe("INPUT");
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box).toBeRequired();
    expect(box).toBeInvalid();
    expect(box).toHaveAccessibleDescription("Tidefern is for adults. Tick the box to continue.");
    expect(box).not.toBeChecked();
  });

  it("marks nothing invalid and describes nothing when there is no help or error", () => {
    render(<CheckboxField label="Rolls over" />);
    const box = screen.getByRole("checkbox", { name: "Rolls over" });
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
    expect(box).not.toBeRequired();
  });

  it("ticks and unticks from a click on its label and from Space, reporting each change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxField label="Rolls over" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Rolls over" });
    await user.click(screen.getByText("Rolls over"));
    expect(box).toBeChecked();
    box.focus();
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("follows the caller's state when controlled", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [on, setOn] = useState(true);
      return <CheckboxField label="Waves bye" checked={on} onChange={setOn} />;
    }
    render(<Controlled />);
    const box = screen.getByRole("checkbox", { name: "Waves bye" });
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
  });

  it("stays put when the caller does not take the change", async () => {
    const user = userEvent.setup();
    render(<CheckboxField label="Waves bye" checked={false} onChange={() => undefined} />);
    const box = screen.getByRole("checkbox", { name: "Waves bye" });
    await user.click(box);
    expect(box).not.toBeChecked();
  });

  it("ignores presses while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxField label="Rolls over" disabled defaultChecked onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Rolls over" });
    expect(box).toBeDisabled();
    await user.click(box);
    expect(box).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says it is saving and refuses presses until the save ends", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxField label="Rolls over" defaultChecked loading onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Rolls over" });
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    expect(box).toHaveAttribute("aria-busy", "true");
    expect(box).toHaveAttribute("aria-disabled", "true");
    await user.click(box);
    expect(box).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a link in the label a link, and names the box with its text", () => {
    render(
      <CheckboxField
        label={
          <>
            I accept the <a href="/terms">terms</a>
          </>
        }
      />,
    );
    expect(screen.getByRole("link", { name: "terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("checkbox", { name: "I accept the terms" })).toBeInTheDocument();
  });

  it("submits its name and value with a form only when ticked", async () => {
    const user = userEvent.setup();
    render(
      <form aria-label="Agreement">
        <CheckboxField label="I accept" name="agreement" value="yes" />
      </form>,
    );
    const form = screen.getByRole("form", { name: "Agreement" }) as HTMLFormElement;
    expect(new FormData(form).get("agreement")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "I accept" }));
    expect(new FormData(form).get("agreement")).toBe("yes");
  });
});
