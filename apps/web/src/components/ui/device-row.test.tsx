import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeviceRow } from "./device-row";

describe("DeviceRow", () => {
  it("offers to sign out the other devices from the current row and signs this one out in one step", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const onRevokeOthers = vi.fn();
    render(
      <DeviceRow
        browser="Firefox on Linux"
        lastSeen="2026-10-05"
        current
        othersCount={2}
        onRevoke={onRevoke}
        onRevokeOthers={onRevokeOthers}
      />,
    );
    expect(screen.getByText("This browser")).toBeVisible();
    expect(screen.getByText("Last seen Oct 5")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign out 2 other devices" }));
    expect(onRevokeOthers).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("singular for one other device", () => {
    render(
      <DeviceRow
        browser="Firefox on Linux"
        lastSeen="2026-10-05"
        current
        othersCount={1}
        onRevokeOthers={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Sign out the other device" })).toBeVisible();
  });

  it("says so when this is the only device instead of offering an action", () => {
    render(
      <DeviceRow
        browser="Firefox on Linux"
        lastSeen="2026-10-05"
        current
        othersCount={0}
        onRevokeOthers={() => {}}
      />,
    );
    expect(screen.getByText(/Only this device\./)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the width, says Signing out and ignores presses while a revocation runs", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(
      <DeviceRow browser="Safari on iPhone" lastSeen="2026-10-04" onRevoke={onRevoke} loading />,
    );
    const action = screen.getByRole("button", { name: "Signing out" });
    expect(action).toHaveTextContent("Sign out this device");
    await user.click(action);
    expect(onRevoke).not.toHaveBeenCalled();
  });
});
