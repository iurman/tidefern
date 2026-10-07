import { render, screen } from "@testing-library/react";
import type { MeLookup } from "@tidefern/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => {
  /** What `redirect()` throws here; the real one throws Next's own redirect error the same way. */
  class Redirected extends Error {
    constructor(readonly path: string) {
      super(`redirected to ${path}`);
    }
  }
  return { lookup: { kind: "anonymous" } as unknown, Redirected };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new session.Redirected(path);
  },
}));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
}));

const { default: ClosingPage, metadata } = await import("./page");

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

beforeEach(() => {
  given({ kind: "anonymous" });
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("the /closing placeholder", () => {
  it("has a neutral title", () => {
    expect(metadata.title).toEqual({ absolute: "Your account | Tidefern" });
  });

  it("sends a person who is not closing to Settings, and a visitor to sign in", async () => {
    given({
      kind: "ok",
      me: {
        id: "018f5e7a-5eed-7000-8000-000000000001",
        profile: null,
        today: null,
        guardianOf: [],
        grants: [],
        session: {
          expiresAt: "2026-10-12T00:00:00.000Z",
          authenticatedAt: "2026-10-05T00:00:00.000Z",
        },
      },
    });
    await expect(ClosingPage()).rejects.toMatchObject({ path: "/settings" });
    given({ kind: "anonymous" });
    await expect(ClosingPage()).rejects.toMatchObject({ path: "/sign-in" });
  });

  it("tells a closing account where it stands", async () => {
    given({ kind: "closing" });
    render(await ClosingPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Your account is closing" }),
    ).toBeVisible();
    expect(screen.getByText(/You can sign out below\./)).toBeVisible();
  });

  it("says what to do when the session read failed, without claiming a closure", async () => {
    given({ kind: "failed" });
    render(await ClosingPage());
    expect(screen.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    expect(
      screen.getByText("We could not load your account just now. Reload the page to try again."),
    ).toBeVisible();
  });

  it("takes an invitation link's fragment out of the address bar, since nothing here accepts it", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/closing#invitation=abc");
    given({ kind: "closing" });
    render(await ClosingPage());
    vi.runAllTimers();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/closing");
  });
});
