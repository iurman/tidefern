import type { MeLookup } from "@tidefern/api-client";
import { describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => ({ lookup: { kind: "anonymous" } as unknown }));

vi.mock("@/lib/api-server", () => ({
  readSessionMe: async () => read.lookup,
}));

const { readSession } = await import("./session");

describe("readSession", () => {
  it("names each answer of the session read as the page's state", async () => {
    const cases: [MeLookup, string][] = [
      [{ kind: "anonymous" }, "anonymous"],
      [{ kind: "closing" }, "closing"],
      [{ kind: "failed" }, "failed"],
      [
        {
          kind: "ok",
          me: {
            id: "018f5e7a-5eed-7000-8000-000000000001",
            profile: null,
            guardianOf: [],
            grants: [],
            session: {
              expiresAt: "2026-10-12T00:00:00.000Z",
              authenticatedAt: "2026-10-05T00:00:00.000Z",
            },
          },
        },
        "signed-in",
      ],
    ];
    for (const [lookup, state] of cases) {
      read.lookup = lookup;
      expect(await readSession(new Headers({ cookie: "x=y" }))).toBe(state);
    }
  });
});
