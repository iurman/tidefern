import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GrantRow, grantCopy } from "./grant-row";
import { PersonCard } from "./person-card";

const status = grantCopy["cycle.status"];

// jsdom has no top layer: the modal methods flip the open attribute and fire the events a browser would.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("GrantRow", () => {
  it("is a switch named by its label and described by the plain words", () => {
    render(<GrantRow label={status.label} description={status.description} checked={false} />);
    const control = screen.getByRole("switch", { name: "Cycle status" });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toHaveAccessibleDescription(status.description);
    expect(control).toHaveTextContent("Off");
  });

  it("revokes in one press", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GrantRow
        label={status.label}
        description={status.description}
        checked
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("switch", { name: "Cycle status" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("says Saving and ignores presses while a change is saved", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GrantRow
        label={status.label}
        description={status.description}
        checked
        loading
        onChange={onChange}
      />,
    );
    const control = screen.getByRole("switch", { name: "Cycle status" });
    expect(control).toHaveTextContent("Saving");
    expect(control).toHaveAttribute("aria-busy", "true");
    await user.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces an error that says what to do next", () => {
    render(
      <GrantRow
        label={status.label}
        description={status.description}
        checked
        error="We could not save this change. Try again."
      />,
    );
    expect(screen.getByText("We could not save this change. Try again.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

describe("PersonCard", () => {
  it("lists every category with its description, names a child grant by the child, and asks before removing", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onGrantChange = vi.fn();
    render(
      <PersonCard
        name="Alex"
        relation="partner"
        since="2026-03-02"
        grants={[
          { category: "cycle.status", checked: true },
          { category: "child", childName: "Nora", checked: false },
        ]}
        notify={false}
        onGrantChange={onGrantChange}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByRole("article", { name: "Alex" })).toHaveTextContent("partner, since Mar 2");
    expect(screen.getByRole("switch", { name: "Cycle status" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Nora" })).toHaveAccessibleDescription(
      /Everything logged for Nora/,
    );
    expect(screen.getByRole("switch", { name: "Tell Alex when my period starts" })).toBeVisible();
    expect(screen.getByText("Private notes are never shared.")).toBeVisible();
    await user.click(screen.getByRole("switch", { name: "Cycle status" }));
    expect(onGrantChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: "cycle.status" }),
      false,
    );
    await user.click(screen.getByRole("button", { name: "Remove Alex" }));
    expect(onRemove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Remove Alex?" });
    expect(dialog).toHaveTextContent("Alex loses access to everything you share, right now.");
    await user.click(screen.getByRole("button", { name: "Keep sharing" }));
    expect(onRemove).not.toHaveBeenCalled();
  });
});
