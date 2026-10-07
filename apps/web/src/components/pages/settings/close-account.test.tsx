import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ POST: vi.fn(), newId: vi.fn(() => "key"), goTo: vi.fn() }));

vi.mock("@/lib/api-browser", () => ({
  browserApiClient: () => ({ POST: api.POST, newId: api.newId }),
}));
vi.mock("./navigate", () => ({ goTo: api.goTo }));

const { CloseAccount } = await import("./close-account");
const { WithdrawConsent } = await import("./withdraw-consent");

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

beforeEach(() => {
  api.POST.mockReset();
  api.goTo.mockReset();
});

function answered(status: number, error?: unknown) {
  return {
    data: status === 200 ? { id: "x" } : undefined,
    error,
    response: new Response(null, { status }),
  };
}

const freshAuthProblem = {
  code: "unauthenticated",
  status: 401,
  detail: "fresh_authentication_required",
};

describe("close account", () => {
  it("names the consequence and the undo window, then closes and goes to the locked view", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(200));
    render(<CloseAccount returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Close my account" }));
    const dialog = screen.getByRole("dialog", { name: "Close your account?" });
    expect(dialog).toHaveTextContent(
      "Closing your account locks it now and deletes it in 7 days. Until then, you can sign in and undo it.",
    );
    expect(dialog).toHaveTextContent("Undoing does not bring those back.");
    expect(
      within(dialog).getByRole("radio", { name: "In 7 days, with time to undo" }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Close my account" }));
    await vi.waitFor(() => expect(api.goTo).toHaveBeenCalledWith("/closing"));
    expect(api.POST).toHaveBeenCalledWith("/api/v1/me/close", { body: { mode: "undo-window" } });
  });

  it("asks for delete now in its own words and sends that mode", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(200));
    render(<CloseAccount returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Close my account" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Now, with no undo" }));
    expect(dialog).toHaveTextContent("There is no undo.");
    await user.click(within(dialog).getByRole("button", { name: "Delete my account now" }));
    await vi.waitFor(() => expect(api.goTo).toHaveBeenCalledWith("/closing"));
    expect(api.POST).toHaveBeenCalledWith("/api/v1/me/close", { body: { mode: "now" } });
  });

  it("keeps the dialog open with the next step when the close fails", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(500, { code: "internal", status: 500 }));
    render(<CloseAccount returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Close my account" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Close my account" }));
    expect(await within(dialog).findByText(/problem on our side/)).toBeVisible();
    expect(dialog).toHaveAttribute("open");
    expect(api.goTo).not.toHaveBeenCalled();
  });

  it("shows the fresh sign-in step when the API refuses an old sign-in", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(401, freshAuthProblem));
    render(<CloseAccount returnTo="/settings/close-account" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Close my account" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close my account" }),
    );
    expect(await screen.findByText(/closing your account needs a sign-in/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fsettings%2Fclose-account",
    );
    expect(screen.queryByRole("button", { name: "Close my account" })).toBeNull();
  });
});

describe("withdraw consent", () => {
  it("says withdrawing closes the account before and inside the confirm, with a key of its own", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(answered(200));
    render(<WithdrawConsent consentId="c1" returnTo="/settings" freshForMs={300_000} />);
    expect(screen.getByText(/withdrawing it also closes your account/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Withdraw consent" }));
    const dialog = screen.getByRole("dialog", { name: "Withdraw your consent?" });
    expect(dialog).toHaveTextContent("It locks now and is deleted in 7 days.");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw and close my account" }));
    await vi.waitFor(() => expect(api.goTo).toHaveBeenCalledWith("/closing"));
    expect(api.POST).toHaveBeenCalledWith("/api/v1/me/consents/{id}/withdraw", {
      params: { path: { id: "c1" }, header: { "idempotency-key": "key" } },
    });
  });

  it("says when the consent was already withdrawn", async () => {
    const user = userEvent.setup();
    api.POST.mockResolvedValue(
      answered(409, { code: "conflict", detail: "consent_already_withdrawn" }),
    );
    render(<WithdrawConsent consentId="c1" returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Withdraw consent" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw and close my account" }));
    expect(await within(dialog).findByText(/already withdrawn/)).toBeVisible();
  });

  it("asks for a fresh sign-in first when the session is too old", () => {
    render(<WithdrawConsent consentId="c1" returnTo="/settings/consent" freshForMs={0} />);
    expect(screen.getByText(/withdrawing your consent needs a sign-in/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw consent" })).toBeNull();
  });
});
