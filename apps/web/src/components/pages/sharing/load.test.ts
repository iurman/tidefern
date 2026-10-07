import { createApiClient, type Me } from "@tidefern/api-client";
import { describe, expect, it } from "vitest";
import { PAGE_LIMIT, loadSharing, readAll } from "./load";

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";

function me(patch: Partial<Me> = {}): Me {
  return {
    id: NOOR,
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
    ...patch,
  };
}

/** A typed client whose fetch answers from a table and records every request it was asked. */
function fakeClient(answer: (url: URL) => Response) {
  const asked: string[] = [];
  const client = createApiClient({
    baseUrl: "https://tidefern.example",
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${request.method} ${url.pathname}${url.search}`);
      return answer(url);
    },
  });
  return { client, asked };
}

const empty = () => Response.json({ items: [], nextCursor: null });

describe("readAll", () => {
  it("follows the cursor to the last page", async () => {
    const pages = [
      { items: [1, 2], nextCursor: "MDE" },
      { items: [3], nextCursor: null },
    ];
    const cursors: (string | undefined)[] = [];
    const items = await readAll<number>(async (cursor) => {
      cursors.push(cursor);
      const page = pages[cursors.length - 1];
      return { data: page, response: new Response(null, { status: 200 }) };
    });
    expect(items).toEqual([1, 2, 3]);
    expect(cursors).toEqual([undefined, "MDE"]);
  });

  it("answers null when a page fails or never answers", async () => {
    expect(
      await readAll<number>(async () => ({ response: new Response(null, { status: 500 }) })),
    ).toBeNull();
    expect(
      await readAll<number>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).toBeNull();
  });
});

describe("loadSharing", () => {
  it("reads people and invitations, and children only for someone who can name one", async () => {
    const { client, asked } = fakeClient(empty);
    expect(await loadSharing(client, me())).toEqual({ people: [], invitations: [], children: [] });
    expect(asked.sort()).toEqual([
      `GET /api/v1/sharing/invitations?limit=${PAGE_LIMIT}`,
      `GET /api/v1/sharing?limit=${PAGE_LIMIT}`,
    ]);

    const guardian = fakeClient((url) =>
      url.pathname === "/api/v1/children"
        ? Response.json({
            items: [
              {
                id: "018f5e7a-5eed-7006-8000-000000000001",
                displayName: "Ilo",
                dateOfBirth: "2026-08-23",
                sex: "female",
                createdAt: "2026-08-23T00:00:00.000Z",
                updatedAt: "2026-08-23T00:00:00.000Z",
                version: 1,
              },
            ],
            nextCursor: null,
          })
        : empty(),
    );
    const loaded = await loadSharing(
      guardian.client,
      me({ guardianOf: ["018f5e7a-5eed-7006-8000-000000000001"] }),
    );
    expect(loaded?.children).toEqual([
      { id: "018f5e7a-5eed-7006-8000-000000000001", displayName: "Ilo" },
    ]);
    expect(guardian.asked).toContain(`GET /api/v1/children?limit=${PAGE_LIMIT}`);
  });

  it("answers null when any read fails, so the page never draws part of the truth", async () => {
    const { client } = fakeClient((url) =>
      url.pathname === "/api/v1/sharing/invitations"
        ? Response.json({ code: "internal" }, { status: 500 })
        : empty(),
    );
    expect(await loadSharing(client, me())).toBeNull();
  });
});
