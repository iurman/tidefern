import { render, screen } from "@testing-library/react";
import type { MeLookup } from "@tidefern/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosureRequest } from "@/components/pages/settings/closure";
import type { CloseRead } from "@/components/pages/settings/server-data";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const DAY = 86_400_000;

const session = vi.hoisted(() => {
  /** What `redirect()` throws here; the real one throws Next's own redirect error the same way. */
  class Redirected extends Error {
    constructor(readonly path: string) {
      super(`redirected to ${path}`);
    }
  }
  return {
    lookup: { kind: "anonymous" } as unknown,
    closure: { ok: false } as unknown,
    Redirected,
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new session.Redirected(path);
  },
}));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
}));

// The closure read is the server's (server-only); the page's own decisions are what is tested here.
vi.mock("@/components/pages/settings/server-data", () => ({
  settingsClient: async () => ({}),
  readClosure: async () => session.closure,
  serverNow: () => NOW,
}));

const { default: ClosingPage, metadata } = await import("./page");

function given(lookup: MeLookup, closure: CloseRead = { ok: false }) {
  session.lookup = lookup;
  session.closure = closure;
}

function request(overrides: Partial<ClosureRequest>): ClosureRequest {
  return {
    id: "018f5e7a-5eed-7000-8000-0000000000aa",
    mode: "undo-window",
    state: "requested",
    requestedAt: new Date(NOW).toISOString(),
    undoUntil: new Date(NOW + 7 * DAY - 1000).toISOString(),
    deadlineAt: new Date(NOW + 45 * DAY).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  given({ kind: "anonymous" });
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("the /closing locked view", () => {
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

  // G10's placeholder said the undo would arrive and pointed at sign-out; the built view says
  // the days left and offers the undo and the export, and the flow frame keeps sign-out.
  it("tells a closing account how many days are left to undo, with the undo and the export", async () => {
    given({ kind: "closing" }, { ok: true, request: request({}) });
    render(await ClosingPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Your account is closing" }),
    ).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText("days left to undo")).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo and keep my account" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Your data" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download my data" })).toBeVisible();
  });

  it("says a deletion asked for now cannot be undone, and still offers the export", async () => {
    given({ kind: "closing" }, { ok: true, request: request({ mode: "now", undoUntil: null }) });
    render(await ClosingPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Your account is being deleted" }),
    ).toBeVisible();
    expect(screen.getByText("You chose to delete it now, so there is no undo.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download my data" })).toBeVisible();
  });

  it("says what to do when the session read failed, without claiming a closure", async () => {
    given({ kind: "failed" });
    render(await ClosingPage());
    expect(screen.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    expect(
      screen.getByText("We could not load your account just now. Reload the page to try again."),
    ).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says the same when the closure itself could not be read", async () => {
    given({ kind: "closing" }, { ok: false });
    render(await ClosingPage());
    expect(screen.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    expect(
      screen.getByText("We could not load your account just now. Reload the page to try again."),
    ).toBeVisible();
  });

  it("takes an invitation link's fragment out of the address bar, since nothing here accepts it", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/closing#invitation=abc");
    given({ kind: "closing" }, { ok: true, request: request({}) });
    render(await ClosingPage());
    vi.runAllTimers();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/closing");
  });
});
