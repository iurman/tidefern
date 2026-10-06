import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InvitationCard } from "./invitation-card";

describe("InvitationCard", () => {
  it("shows who, when, and that acceptance happens at sign-in, with no link anywhere", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    render(<InvitationCard name="Jo" sentOn="2026-10-03" onWithdraw={onWithdraw} />);
    const card = screen.getByRole("article", { name: "Jo" });
    expect(card).toHaveTextContent("Sent Oct 3. Waiting for Jo to sign in and accept.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it("says Withdrawing at the same width and ignores presses while it runs", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    render(<InvitationCard name="Jo" sentOn="2026-10-03" onWithdraw={onWithdraw} loading />);
    const action = screen.getByRole("button", { name: "Withdrawing" });
    expect(action).toHaveTextContent("Withdraw");
    await user.click(action);
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it("announces an expiry with the next step", () => {
    render(
      <InvitationCard
        name="Jo"
        sentOn="2026-10-03"
        error="The invitation has expired. Send a new one."
      />,
    );
    expect(screen.getByText("The invitation has expired. Send a new one.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
