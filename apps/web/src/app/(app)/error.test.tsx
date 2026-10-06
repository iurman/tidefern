import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AppErrorPage from "./error";

describe("the (app) error page", () => {
  it("draws only the statement, so the group's shell stays and no public header appears", () => {
    const { container } = render(
      <AppErrorPage error={new Error("secret detail")} retry={() => undefined} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong." })).toBeVisible();
    expect(container.querySelector("header, footer, main")).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(container.textContent).not.toContain("secret detail");
  });

  it("retries when the person asks", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<AppErrorPage error={new Error("boom")} retry={retry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
