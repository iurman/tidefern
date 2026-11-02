import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CURRENT_SHARING_DESCRIPTION_VERSION,
  SHARING_DESCRIPTIONS,
  ShareCategory,
} from "@tidefern/schemas";
import { GrantRow, grantCopy, grantLevelText } from "./grant-row";
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

  it("reads every category's words from the catalog version the screen shows", () => {
    const catalog = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION].categories;
    for (const category of ShareCategory.options) {
      expect(grantCopy[category]).toEqual(catalog[category]);
    }
  });

  it("shows the level of an on grant with its description, and none while it is off", () => {
    const { rerender } = render(
      <GrantRow
        label={status.label}
        description={status.description}
        checked
        level={grantLevelText("summary")}
      />,
    );
    const control = screen.getByRole("switch", { name: "Cycle status" });
    expect(screen.getByText("Level: summary")).toBeVisible();
    expect(control).toHaveAccessibleDescription(`${status.description} Level: summary`);
    rerender(
      <GrantRow
        label={status.label}
        description={status.description}
        checked={false}
        level={grantLevelText("summary")}
      />,
    );
    expect(screen.queryByText("Level: summary")).not.toBeInTheDocument();
    expect(control).toHaveAccessibleDescription(status.description);
  });

  it("reads a note with the switch and shows the outcome of a saved change", () => {
    render(
      <GrantRow
        label={status.label}
        description={status.description}
        checked={false}
        disabled
        note="Turn on cycle status first."
        done="Alex can no longer see your cycle status."
      />,
    );
    const control = screen.getByRole("switch", { name: "Cycle status" });
    expect(control).toBeDisabled();
    expect(control).toHaveAccessibleDescription(
      `${status.description} Turn on cycle status first.`,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Alex can no longer see your cycle status.",
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

  it("leaves out the since line before anything is shared, and names the year of an older one", () => {
    const { rerender } = render(
      <PersonCard name="Alex" relation="partner" grants={[]} notify={false} />,
    );
    expect(screen.getByRole("article", { name: "Alex" })).toHaveTextContent(/partner/);
    expect(screen.getByRole("article", { name: "Alex" })).not.toHaveTextContent("since");
    rerender(
      <PersonCard
        name="Alex"
        relation="partner"
        since="2025-12-29"
        today="2026-10-04"
        grants={[]}
        notify={false}
      />,
    );
    expect(screen.getByRole("article", { name: "Alex" })).toHaveTextContent(
      "partner, since Dec 29, 2025",
    );
  });

  it("hides the notify row, or keeps it and says why it cannot be pressed, with its own error", () => {
    const { rerender } = render(
      <PersonCard
        name="Alex"
        relation="partner"
        grants={[{ category: "cycle.status", checked: false }]}
        notify={false}
        notifyHidden
      />,
    );
    expect(
      screen.queryByRole("switch", { name: "Tell Alex when my period starts" }),
    ).not.toBeInTheDocument();
    rerender(
      <PersonCard
        name="Alex"
        relation="partner"
        grants={[{ category: "cycle.status", checked: false }]}
        notify={false}
        notifyDisabled
        notifyNote="Share your cycle status or cycle history with Alex first."
        notifyError="We could not save this change. Try again."
      />,
    );
    const notify = screen.getByRole("switch", { name: "Tell Alex when my period starts" });
    expect(notify).toBeDisabled();
    expect(notify).toHaveAccessibleDescription(
      "The message says only that there is something new in Tidefern. Share your cycle status or cycle history with Alex first.",
    );
    expect(screen.getByText("We could not save this change. Try again.")).toBeVisible();
    // The category switches stay usable: only the notify row is held back.
    expect(screen.getByRole("switch", { name: "Cycle status" })).toBeEnabled();
  });

  it("names the removal's own consequence, can leave the private-notes line to the page, and shows a refusal", async () => {
    const user = userEvent.setup();
    render(
      <PersonCard
        name="Noor"
        relation="household owner"
        grants={[]}
        notify={false}
        notifyHidden
        showPrivateNotes={false}
        removeConsequence={<p>You leave the household you share with Noor.</p>}
        removeError="Noor cannot be removed right now. Try again."
      >
        <p>Noor shares nothing with you yet.</p>
      </PersonCard>,
    );
    const card = screen.getByRole("article", { name: "Noor" });
    expect(within(card).queryByRole("list")).not.toBeInTheDocument();
    expect(within(card).queryByText("Private notes are never shared.")).not.toBeInTheDocument();
    expect(within(card).getByText("Noor shares nothing with you yet.")).toBeVisible();
    expect(within(card).getByText("Noor cannot be removed right now. Try again.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.click(screen.getByRole("button", { name: "Remove Noor" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Noor?" });
    expect(dialog).toHaveTextContent("You leave the household you share with Noor.");
    expect(dialog).not.toHaveTextContent("loses access");
  });

  it("shows the level and the outcome on an on grant, keyed by its own id", () => {
    render(
      <PersonCard
        name="Pia"
        relation="outside your household"
        grants={[
          { category: "child", id: "child-a", childName: "Sol", checked: false },
          {
            category: "child",
            id: "child-b",
            childName: "Sol",
            checked: true,
            level: grantLevelText("read"),
            done: "Pia can now see everything logged for Sol.",
          },
        ]}
        notify={false}
        notifyHidden
      />,
    );
    // Two children with one name still get two rows.
    expect(screen.getAllByRole("switch", { name: "Sol" })).toHaveLength(2);
    expect(screen.getByText("Level: read")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pia can now see everything logged for Sol.",
    );
  });
});
