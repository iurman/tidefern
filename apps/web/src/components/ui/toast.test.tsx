import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_AUTO_DISMISS_MS, Toast, ToastRegion } from "./toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a polite status with its tone named, one dismiss control and the action", () => {
    render(
      <Toast tone="success" action={<button type="button">Undo</button>}>
        Saved for Sunday, Oct 5.
      </Toast>,
    );
    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveTextContent("Success: Saved for Sunday, Oct 5.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
  });

  it("dismisses on the button and reports it", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="error" onDismiss={onDismiss}>
        We could not change that. Try again.
      </Toast>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leaves on its own only for success and never before six seconds", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss} autoDismissMs={1000}>
        Saved.
      </Toast>,
    );
    act(() => {
      vi.advanceTimersByTime(MIN_AUTO_DISMISS_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays for an error and for a note however long", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <Toast tone="error" onDismiss={onDismiss}>
          The invitation has expired. Send a new one.
        </Toast>
        <Toast tone="info" onDismiss={onDismiss}>
          Your export is ready.
        </Toast>
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(MIN_AUTO_DISMISS_MS * 10);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("pauses the timer while the pointer is over it and while focus is inside it", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    const toast = screen.getByRole("status");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.pointerEnter(toast);
    expect(toast).toHaveAttribute("data-paused", "true");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    expect(toast).not.toHaveAttribute("data-paused");
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses on focus inside and resumes when focus leaves", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" onDismiss={onDismiss}>
        Saved.
      </Toast>,
    );
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    act(() => {
      dismiss.focus();
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-paused", "true");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      dismiss.blur();
    });
    expect(screen.getByRole("status")).not.toHaveAttribute("data-paused");
    act(() => {
      vi.advanceTimersByTime(MIN_AUTO_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("ToastRegion", () => {
  it("is a named region that shows one toast per id, so an action never appears twice", () => {
    render(
      <ToastRegion
        fixed={false}
        toasts={[
          { id: "export", tone: "info", text: "Your export is ready." },
          { id: "export", tone: "info", text: "A second toast for the same action." },
          { id: "share", tone: "error", text: "We could not change that. Try again." },
        ]}
      />,
    );
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).not.toHaveAttribute("data-fixed");
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByText("A second toast for the same action.")).not.toBeInTheDocument();
  });

  it("reports which toast was dismissed and sits on the toast tier by default", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <ToastRegion
        onDismiss={onDismiss}
        toasts={[{ id: "share", tone: "error", text: "We could not change that. Try again." }]}
      />,
    );
    expect(screen.getByRole("region", { name: "Notifications" })).toHaveAttribute("data-fixed");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("share");
  });
});
