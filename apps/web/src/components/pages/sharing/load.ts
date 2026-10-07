import type { ApiClient, components, Me } from "@tidefern/api-client";
import type { ChildName } from "./people";

type SharingPerson = components["schemas"]["SharingPerson"];
type Invitation = components["schemas"]["Invitation"];

/** The longest page the list routes serve (`limit` 1 to 200). */
export const PAGE_LIMIT = 200;

/** A guard against a cursor that never ends: 2,000 rows is far past any household. */
const MAX_PAGES = 10;

interface ListPage<T> {
  items: T[];
  nextCursor: string | null;
}

type ListRead<T> = (
  cursor: string | undefined,
) => Promise<{ data?: ListPage<T>; response: Response }>;

/** Every page of one list, or null when any page fails or never answers. */
export async function readAll<T>(read: ListRead<T>): Promise<T[] | null> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let answer: Awaited<ReturnType<ListRead<T>>>;
    try {
      answer = await read(cursor);
    } catch {
      return null;
    }
    if (!answer.response.ok || answer.data === undefined) return null;
    items.push(...answer.data.items);
    if (answer.data.nextCursor === null) return items;
    cursor = answer.data.nextCursor;
  }
  return items;
}

function query(cursor: string | undefined) {
  return cursor === undefined ? { limit: PAGE_LIMIT } : { limit: PAGE_LIMIT, cursor };
}

export interface SharingData {
  people: SharingPerson[];
  invitations: Invitation[];
  children: ChildName[];
}

/**
 * The three reads /sharing renders from, in parallel on the in-process
 * client (architecture 5.2): the people and what the actor shares with
 * each, her pending invitations, and the names of the children she guards
 * or holds a grant for (read only when there is one). Null when any read
 * fails, so the page says so instead of drawing part of the truth.
 */
export async function loadSharing(client: ApiClient, me: Me): Promise<SharingData | null> {
  const namesChildren =
    me.guardianOf.length > 0 || me.grants.some((grant) => grant.category === "child");
  const [people, invitations, children] = await Promise.all([
    readAll((cursor) => client.GET("/api/v1/sharing", { params: { query: query(cursor) } })),
    readAll((cursor) =>
      client.GET("/api/v1/sharing/invitations", { params: { query: query(cursor) } }),
    ),
    namesChildren
      ? readAll((cursor) => client.GET("/api/v1/children", { params: { query: query(cursor) } }))
      : Promise.resolve([]),
  ]);
  if (people === null || invitations === null || children === null) return null;
  return {
    people,
    invitations,
    children: children.map((child) => ({ id: child.id, displayName: child.displayName })),
  };
}
