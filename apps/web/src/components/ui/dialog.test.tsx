import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./bottom-sheet";
import { Dialog } from "./dialog";

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

describe("Dialog", () => {
  it("opens through showModal when open becomes true and closes when it becomes false", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Send the invitation?">
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).not.toHaveAttribute("open");
    rerender(
      <Dialog open onClose={() => {}} title="Send the invitation?">
        <p>Body</p>
      </Dialog>,
    );
    expect(dialog).toHaveAttribute("open");
    rerender(
      <Dialog open={false} onClose={() => {}} title="Send the invitation?">
        <p>Body</p>
      </Dialog>,
    );
    expect(dialog).not.toHaveAttribute("open");
  });

  it("reports a close the browser performed (Escape) exactly once", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Send the invitation?">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("names the panel by its title and runs the two actions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Dialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Remove Alex?"
        variant="destructive"
        confirmLabel="Remove Alex"
        cancelLabel="Keep sharing"
      >
        <p>Alex loses access now.</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Remove Alex?" })).toHaveAccessibleDescription(
      "Alex loses access now.",
    );
    await user.click(screen.getByRole("button", { name: "Keep sharing" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Remove Alex" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirm width while loading, shows the pending words and ignores presses", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <Dialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Send the invitation?"
        confirmLabel="Send the invitation"
        pendingLabel="Sending the invitation"
        loading
      >
        <p>Body</p>
      </Dialog>,
    );
    const confirm = screen.getByRole("button", { name: "Sending the invitation" });
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm).toHaveTextContent("Send the invitation");
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("announces the error in a polite region", () => {
    render(
      <Dialog open onClose={() => {}} title="Send the invitation?" error="Try again.">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByText("Try again.")).toHaveAttribute("aria-live", "polite");
  });
});

describe("BottomSheet", () => {
  it("closes from its visible close button and reports Escape once", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="Sunday, Oct 5">
        <p>Body</p>
      </BottomSheet>,
    );
    const sheet = screen.getByRole("dialog", { name: "Sunday, Oct 5" });
    expect(sheet).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(sheet, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("marks the body busy and says Loading while content arrives", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Sunday, Oct 5" loading>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByText("Loading").parentElement).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
  });
});
