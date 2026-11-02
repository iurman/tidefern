import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ POST: vi.fn(), GET: vi.fn(), goTo: vi.fn() }));

vi.mock("@/lib/api-browser", () => ({
  browserApiClient: () => ({ POST: api.POST, GET: api.GET }),
}));
vi.mock("./navigate", () => ({ goTo: api.goTo }));

const { ClosingView } = await import("./closing-view");

function answered(status: number, error?: unknown) {
  return { data: undefined, error, response: new Response(null, { status }) };
}

beforeEach(() => {
  api.POST.mockReset();
  api.goTo.mockReset();
});

describe("the locked view", () => {
  it("counts the days left to undo, and says less than a day on the last one", () => {
    const { rerender } = render(<ClosingView view={{ kind: "undo", daysLeft: 6 }} />);
    expect(screen.getByText("6")).toBeVisible();
    expect(screen.getByText("days left to undo")).toBeVisible();
    rerender(<ClosingView view={{ kind: "undo", daysLeft: 1 }} />);
    expect(screen.getByText("Less than a day left to undo.")).toBeVisible();
  });

  it("undoes the closure and says what stays revoked before sending her back to Settings", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue({
      ...answered(200),
      data: { request: {}, sessionsRestored: false },
    });
    render(<ClosingView view={{ kind: "undo", daysLeft: 7 }} />);
    await user.click(screen.getByRole("button", { name: "Undo and keep my account" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your account is open again" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The closure is undone, so nothing will be deleted.",
    );
    expect(screen.getByText(/Devices that were signed out stay signed out/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(api.POST).toHaveBeenCalledWith("/api/v1/me/close/undo");
  });

  it("turns into the deletion it now is when the API refuses the undo for its window", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(409, { code: "conflict", detail: "undo_window_closed" }));
    render(<ClosingView view={{ kind: "undo", daysLeft: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Undo and keep my account" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "It is too late to undo this. You can still download your data below.",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your account is being deleted",
    );
    expect(
      screen.getByText("The 7 days to undo have passed, so the deletion goes ahead."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download my data" })).toBeVisible();
  });

  it("names the next step when the undo fails for any other reason", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValueOnce(answered(500, { code: "internal" }));
    api.POST.mockResolvedValueOnce(answered(404, { code: "not_found" }));
    render(<ClosingView view={{ kind: "undo", daysLeft: 3 }} />);
    await user.click(screen.getByRole("button", { name: "Undo and keep my account" }));
    expect(await screen.findByText(/problem on our side/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo and keep my account" }));
    expect(await screen.findByText(/Nothing is closing now/)).toBeVisible();
  });

  it("offers no undo once the deletion is under way, and keeps the export", () => {
    render(<ClosingView view={{ kind: "deleting", reason: "started" }} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your account is being deleted",
    );
    expect(screen.getByText("The deletion has started and cannot be undone.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download my data" })).toBeVisible();
  });
});
