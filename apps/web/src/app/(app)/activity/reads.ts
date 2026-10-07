import type { ApiClient, Me, components } from "@tidefern/api-client";
import type { ActivityPage } from "./sentences";

type SharingPeople = components["schemas"]["SharingPeople"];

/** How many rows a page holds: the server's first page and every Load more. */
export const ACTIVITY_PAGE_SIZE = 25;

/** The largest page the sharing list answers (its `limit` is at most 200). */
const PEOPLE_PAGE_SIZE = 200;

/** A household is a handful of people; past this many pages the rest are named by the fallback. */
const PEOPLE_PAGES = 5;

/**
 * The first page of the person's activity, newest first, or null when the
 * read failed, which the page then says. On a server without a database the
 * in-process call throws rather than answering, so the throw is a failure too.
 */
export async function readFirstPage(client: ApiClient): Promise<ActivityPage | null> {
  try {
    const { data } = await client.GET("/api/v1/me/activity", {
      params: { query: { limit: ACTIVITY_PAGE_SIZE } },
    });
    return data ?? null;
  } catch {
    return null;
  }
}

/** One page of GET /v1/sharing, or undefined when the read failed. */
async function readPeoplePage(
  client: ApiClient,
  cursor: string | undefined,
): Promise<SharingPeople | undefined> {
  const query: { limit: number; cursor?: string } = { limit: PEOPLE_PAGE_SIZE };
  if (cursor !== undefined) query.cursor = cursor;
  try {
    const { data } = await client.GET("/api/v1/sharing", { params: { query } });
    return data;
  } catch {
    return undefined;
  }
}

/** Every person GET /v1/sharing lists who has a display name, by id; a failed page keeps the pages before it. */
async function readPeople(client: ApiClient): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  let cursor: string | undefined;
  for (let page = 0; page < PEOPLE_PAGES; page += 1) {
    const data = await readPeoplePage(client, cursor);
    if (data === undefined) break;
    for (const person of data.items) {
      if (person.displayName !== null) names[person.id] = person.displayName;
    }
    if (data.nextCursor === null) break;
    cursor = data.nextCursor;
  }
  return names;
}

/**
 * The children she guards, by id. Each is read on its own: a guardian's
 * read is never audited, while the children list would also audit a read
 * of any child she reaches through a grant, and the page must never write
 * the activity it shows.
 */
async function readChildren(
  client: ApiClient,
  guardianOf: readonly string[],
): Promise<Record<string, string>> {
  const answers = await Promise.all(
    guardianOf.map(async (id) => {
      try {
        const { data } = await client.GET("/api/v1/children/{id}", { params: { path: { id } } });
        return data === undefined ? null : ([id, data.displayName] as const);
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(answers.filter((answer) => answer !== null));
}

/**
 * The display names the rows can use, read without writing an audit row:
 * the people GET /v1/sharing lists (household members, co-guardians and
 * the people she shares with; a removed partner is no longer among them)
 * and the children she guards. A read that fails leaves its names out, so
 * those rows fall back to neutral words instead of failing the page.
 */
export async function readNames(
  client: ApiClient,
  me: Pick<Me, "guardianOf">,
): Promise<Record<string, string>> {
  const [people, children] = await Promise.all([
    readPeople(client),
    readChildren(client, me.guardianOf),
  ]);
  return { ...people, ...children };
}
