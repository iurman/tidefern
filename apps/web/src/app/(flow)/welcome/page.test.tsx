import { render, screen } from "@testing-library/react";
import type { Me, MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { default: WelcomePage, metadata } = await import("./page");

const me: Me = {
  id: "018f5e7a-5eed-7000-8000-000000000009",
  profile: null,
  today: null,
  guardianOf: [],
  grants: [],
  session: {
    expiresAt: "2026-10-12T00:00:00.000Z",
    authenticatedAt: "2026-10-05T00:00:00.000Z",
  },
};

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

beforeEach(() => {
  given({ kind: "anonymous" });
});

describe("the /welcome placeholder", () => {
  it("is titled from CONTENT.md, with no stage in the title", () => {
    expect(metadata.title).toEqual({ absolute: "Welcome | Tidefern" });
  });

  it("sends someone who already has a profile on to Today", async () => {
    given({
      kind: "ok",
      me: {
        ...me,
        profile: {
          displayName: "Noor",
          timeZone: "Europe/Berlin",
          stage: "cycle",
          weekStart: 1,
          units: "metric",
          notificationDetail: "generic",
        },
        today: "2026-10-05",
      },
    });
    await expect(WelcomePage()).rejects.toMatchObject({ path: "/today" });
  });

  it("sends an account that is closing to its own page, and a visitor to sign in", async () => {
    given({ kind: "closing" });
    await expect(WelcomePage()).rejects.toMatchObject({ path: "/closing" });
    given({ kind: "anonymous" });
    await expect(WelcomePage()).rejects.toMatchObject({ path: "/sign-in" });
  });

  it("greets a person without a profile with one heading and one sentence", async () => {
    given({ kind: "ok", me });
    render(await WelcomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to Tidefern" })).toBeVisible();
    expect(screen.getByText("The steps that set up your account arrive here soon.")).toBeVisible();
  });

  it("says what to do when the session read failed", async () => {
    given({ kind: "failed" });
    render(await WelcomePage());
    expect(
      screen.getByText("We could not load your account just now. Reload the page to try again."),
    ).toBeVisible();
    expect(screen.queryByText(/arrive here soon/)).toBeNull();
  });
});
