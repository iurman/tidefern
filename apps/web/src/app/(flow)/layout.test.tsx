import { render, screen, within } from "@testing-library/react";
import type { MeLookup } from "@tidefern/api-client";
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

const { default: FlowLayout } = await import("./layout");

const withoutProfile: MeLookup = {
  kind: "ok",
  me: {
    id: "018f5e7a-5eed-7000-8000-000000000009",
    profile: null,
    guardianOf: [],
    grants: [],
    session: {
      expiresAt: "2026-10-12T00:00:00.000Z",
      authenticatedAt: "2026-10-05T00:00:00.000Z",
    },
  },
};

beforeEach(() => {
  session.lookup = { kind: "anonymous" } satisfies MeLookup;
});

describe("the (flow) layout", () => {
  it("sends a visitor without a session to sign in", async () => {
    await expect(FlowLayout({ children: <p>Page</p> })).rejects.toMatchObject({
      path: "/sign-in",
    });
  });

  for (const lookup of [withoutProfile, { kind: "closing" }, { kind: "failed" }] as MeLookup[]) {
    it(`draws the column without the shell for the ${lookup.kind} lookup`, async () => {
      session.lookup = lookup;
      render(await FlowLayout({ children: <p>Page</p> }));
      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("id", "main");
      expect(main).toHaveAttribute("tabindex", "-1");
      expect(within(main).getByText("Page")).toBeVisible();
      // No rail, no tab bar, no public header.
      expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
      expect(screen.queryByRole("banner")).toBeNull();
    });
  }

  it("signs out with a POST form and keeps both policy links on the line under the page", async () => {
    session.lookup = withoutProfile;
    render(await FlowLayout({ children: <p>Page</p> }));
    const footer = screen.getByRole("contentinfo");
    const signOut = within(footer).getByRole("button", { name: "Sign out" });
    expect(signOut).toHaveAttribute("type", "submit");
    const form = signOut.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/sign-out");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(
      within(footer).getByRole("link", { name: "Consumer Health Data Privacy Policy" }),
    ).toHaveAttribute("href", "/health-privacy");
  });
});
