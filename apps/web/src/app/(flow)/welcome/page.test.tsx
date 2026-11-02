import { render, screen } from "@testing-library/react";
import type { Me, MeLookup } from "@tidefern/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task H1 replaced G10's placeholder with the steps, on purpose: the
 * "arrive here soon" sentence is gone and the page now renders the flow
 * with the server's instant and the processors from the data summary. The
 * redirects, the title, the one H1 and the failed-read sentence are G10's
 * and stay as they were tested.
 */

const session = vi.hoisted(() => {
  /** What `redirect()` throws here; the real one throws Next's own redirect error the same way. */
  class Redirected extends Error {
    constructor(readonly path: string) {
      super(`redirected to ${path}`);
    }
  }
  return {
    lookup: { kind: "anonymous" } as unknown,
    summary: { data: undefined as unknown, throws: false },
    Redirected,
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new session.Redirected(path);
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "a=b" }) }));

vi.mock("@/lib/api-server", () => ({
  sessionMe: async () => session.lookup,
  serverApiClient: () => ({
    GET: async (path: string) => {
      if (path !== "/api/v1/me/data-summary") throw new Error(`unexpected read ${path}`);
      if (session.summary.throws) throw new TypeError("fetch failed");
      return { data: session.summary.data };
    },
  }),
}));

// The flow is the client's; here it only shows what the page handed it.
vi.mock("@/components/pages/welcome/welcome-flow", () => ({
  WelcomeFlow: ({ now, processors }: { now: string; processors: Array<{ name: string }> }) => (
    <p data-testid="flow" data-now={now}>
      {processors.map((processor) => processor.name).join(", ")}
    </p>
  ),
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

const summary = {
  categories: [],
  people: [],
  disclosures: [],
  processors: [
    { name: "Vercel", receives: "Runs the application", contact: "https://vercel.com/legal/dpa" },
    { name: "Neon (Databricks, Inc.)", receives: "Hosts the database", contact: "https://x.test" },
    { name: "GitHub", receives: "Source code", contact: "https://x.test" },
    { name: "Resend", receives: "Email addresses", contact: "https://x.test" },
    { name: "Cloudflare", receives: "DNS queries", contact: "https://x.test" },
  ],
};

function given(lookup: MeLookup) {
  session.lookup = lookup;
}

beforeEach(() => {
  given({ kind: "anonymous" });
  session.summary = { data: summary, throws: false };
});

describe("/welcome", () => {
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

  it("starts the steps for a person without a profile, with the server's instant and every processor", async () => {
    given({ kind: "ok", me });
    render(await WelcomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to Tidefern" })).toBeVisible();
    const flow = screen.getByTestId("flow");
    expect(flow).toHaveTextContent("Vercel, Neon (Databricks, Inc.), GitHub, Resend, Cloudflare");
    expect(Number.isNaN(Date.parse(flow.dataset.now ?? ""))).toBe(false);
  });

  it("says what to do when the session read failed, and starts no step", async () => {
    given({ kind: "failed" });
    render(await WelcomePage());
    expect(
      screen.getByText("We could not load your account just now. Reload the page to try again."),
    ).toBeVisible();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("starts no step the consent could not end when the processors cannot be read", async () => {
    given({ kind: "ok", me });
    session.summary = { data: undefined, throws: false };
    render(await WelcomePage());
    expect(screen.getByText(/We could not load your account just now/)).toBeVisible();
    expect(screen.queryByTestId("flow")).toBeNull();

    session.summary = {
      data: { ...summary, processors: summary.processors.slice(1) },
      throws: false,
    };
    render(await WelcomePage());
    expect(screen.queryByTestId("flow")).toBeNull();

    session.summary = { data: summary, throws: true };
    render(await WelcomePage());
    expect(screen.queryByTestId("flow")).toBeNull();
  });
});
