import { render, screen, within } from "@testing-library/react";
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
  usePathname: () => "/today",
}));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
}));

const { default: AppLayout } = await import("./layout");

const me: Me = {
  id: "018f5e7a-5eed-7000-8000-000000000001",
  profile: {
    displayName: "Noor",
    timeZone: "Europe/Berlin",
    stage: "cycle",
    weekStart: 1,
    units: "metric",
    notificationDetail: "generic",
  },
  today: "2026-10-05",
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

async function redirectOf(): Promise<string | null> {
  try {
    await AppLayout({ children: <p>Page</p> });
    return null;
  } catch (error) {
    if (error instanceof session.Redirected) return error.path;
    throw error;
  }
}

beforeEach(() => {
  given({ kind: "anonymous" });
});

describe("the (app) layout", () => {
  it("sends a visitor without a session to sign in", async () => {
    expect(await redirectOf()).toBe("/sign-in");
  });

  it("sends a person whose account is closing to the locked view, outside the shell", async () => {
    given({ kind: "closing" });
    expect(await redirectOf()).toBe("/closing");
  });

  it("sends a signed-in person without a profile to onboarding, outside the shell", async () => {
    given({ kind: "ok", me: { ...me, profile: null, today: null } });
    expect(await redirectOf()).toBe("/welcome");
  });

  it("draws the shell, the page in main and the policy line for a person with a profile", async () => {
    given({ kind: "ok", me });
    render(await AppLayout({ children: <p>Page</p> }));
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(within(main).getByText("Page")).toBeVisible();
    expect(screen.getAllByRole("navigation", { name: "Main" }).length).toBeGreaterThan(0);
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: "Consumer Health Data Privacy Policy" }),
    ).toHaveAttribute("href", "/health-privacy");
    expect(screen.queryByText(/could not load your profile/)).toBeNull();
  });

  it("keeps a person whose read failed in the shell and says so once", async () => {
    given({ kind: "failed" });
    render(await AppLayout({ children: <p>Page</p> }));
    expect(screen.getByText(/could not load your profile just now/)).toBeVisible();
    expect(screen.getByText("Page")).toBeVisible();
  });
});
