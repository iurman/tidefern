import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "./session";

const read = vi.hoisted(() => ({ state: "anonymous" as SessionState }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "x=y" }),
}));

vi.mock("./session", () => ({
  readSession: async () => read.state,
}));

const { default: DeleteAccountPage } = await import("./page");

async function renderFor(state: SessionState) {
  read.state = state;
  render(await DeleteAccountPage());
}

beforeEach(() => {
  read.state = "anonymous";
});

describe("the public account deletion page", () => {
  it("points an account that is already closing at its own page, not at Settings", async () => {
    await renderFor("closing");
    expect(
      screen.getByText(
        "Your account is already closing. Its own page says what happens next and what you can still do.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "See your account" })).toHaveAttribute(
      "href",
      "/closing",
    );
    expect(screen.queryByRole("link", { name: "Close my account" })).toBeNull();
  });

  it("sends a signed-in person to Settings, where the confirmation lives", async () => {
    await renderFor("signed-in");
    expect(screen.getByRole("link", { name: "Close my account" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("sends a visitor to sign in, and says so when the session could not be checked", async () => {
    await renderFor("anonymous");
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByText(/could not check whether you are signed in/)).toBeNull();
  });

  it("says a failed check and still offers sign in", async () => {
    await renderFor("failed");
    expect(
      screen.getByText("We could not check whether you are signed in. Try again."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });
});
