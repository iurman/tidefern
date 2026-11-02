import type { ApiClient, Me } from "@tidefern/api-client";
import type {
  Child,
  DueDateChange,
  JourneyReads,
  OwnRead,
  PredictionBasis,
  PregnancyEvent,
  Read,
  SharedRead,
  SharingPerson,
} from "@/components/pages/journey/view";

/**
 * The reads /journey renders from, through the typed client (on the server,
 * the in-process client of architecture 5.2). Which reads run depends on
 * what came back: an active pregnancy needs its events and her dating
 * history, a postpartum profile the child and whether predictions are
 * still paused, an ending only the latter. Each read reports a failure
 * rather than throwing, so one failed part shows its own honest sentence
 * and the rest of the page still renders. Only ids, cursors and limits
 * ever travel in a query string (the client refuses anything else).
 */

/** The contract's largest page, so one request usually holds a whole list. */
const PAGE = 200;
/** A bound on cursor following; more than this many pages is not a list a person keeps. */
const MAX_PAGES = 10;

const failed = { ok: false } as const;

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function settle<T>(request: () => Promise<{ data?: T; response: Response }>): Promise<{
  status: number;
  data: T | undefined;
}> {
  try {
    const { data, response } = await request();
    return { status: response.status, data };
  } catch {
    return { status: 0, data: undefined };
  }
}

/** Follows `nextCursor` until the list ends; a failed page fails the whole read. */
async function allPages<T>(
  page: (cursor: string | undefined) => Promise<{ data?: Page<T>; response: Response }>,
): Promise<Read<T[]>> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let count = 0; count < MAX_PAGES; count += 1) {
    const answer = await settle(() => page(cursor));
    if (answer.status !== 200 || answer.data === undefined) return failed;
    items.push(...answer.data.items);
    if (answer.data.nextCursor === null) break;
    cursor = answer.data.nextCursor;
  }
  return { ok: true, value: items };
}

/** A pregnancy's live events; tombstones only come with `updatedSince`, which this never sends. */
async function readEvents(client: ApiClient, id: string): Promise<Read<PregnancyEvent[]>> {
  const all = await allPages((cursor) =>
    client.GET("/api/v1/pregnancies/{id}/events", {
      params: { path: { id }, query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    }),
  );
  if (!all.ok) return all;
  return {
    ok: true,
    value: all.value.filter((item): item is PregnancyEvent => "kind" in item),
  };
}

function readHistory(client: ApiClient, id: string): Promise<Read<DueDateChange[]>> {
  return allPages((cursor) =>
    client.GET("/api/v1/pregnancies/{id}/dating-history", {
      params: { path: { id }, query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    }),
  );
}

function readChildren(client: ApiClient): Promise<Read<Child[]>> {
  return allPages((cursor) =>
    client.GET("/api/v1/children", {
      params: { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    }),
  );
}

function readPeople(client: ApiClient): Promise<Read<SharingPerson[]>> {
  return allPages((cursor) =>
    client.GET("/api/v1/sharing", {
      params: { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    }),
  );
}

/** Whether a prediction is offered: `none` means no period has been logged since the ending. */
async function readBasis(client: ApiClient): Promise<Read<PredictionBasis>> {
  const answer = await settle(() => client.GET("/api/v1/cycle/predictions", {}));
  if (answer.status !== 200 || answer.data === undefined) return failed;
  return { ok: true, value: answer.data.basis };
}

/** Her own most recent pregnancy and the reads its state calls for. */
export async function readOwn(client: ApiClient, me: Me): Promise<OwnRead> {
  const postpartum = me.profile?.stage === "postpartum";
  const current = await settle(() => client.GET("/api/v1/pregnancies/current", {}));
  if (current.status === 404) {
    if (!postpartum) return { kind: "none" };
    const [children, basis] = await Promise.all([readChildren(client), readBasis(client)]);
    return { kind: "none", children, basis };
  }
  const data = current.data;
  // Her own read answers her whole record; anything else is not an answer this page can use.
  if (current.status !== 200 || data === undefined || !("datingMethod" in data)) {
    return { kind: "failed" };
  }
  if (data.status === "active") {
    const [events, history] = await Promise.all([
      readEvents(client, data.id),
      readHistory(client, data.id),
    ]);
    return { kind: "active", pregnancy: data, events, history };
  }
  if (postpartum) {
    const [children, basis] = await Promise.all([readChildren(client), readBasis(client)]);
    return { kind: "ended", pregnancy: data, children, basis };
  }
  return { kind: "ended", pregnancy: data, basis: await readBasis(client) };
}

/** One pregnancy shared with her: the overview at her grant's level, or the paused state. */
export async function readShared(
  client: ApiClient,
  grant: { ownerId: string; level: SharedRead["level"] },
): Promise<SharedRead> {
  const base = { ownerId: grant.ownerId, level: grant.level };
  const current = await settle(() =>
    client.GET("/api/v1/pregnancies/current", {
      params: { query: { subject: grant.ownerId } },
    }),
  );
  if (current.status === 404) return { ...base, kind: "none" };
  const data = current.data;
  if (current.status !== 200 || data === undefined) return { ...base, kind: "failed" };
  if (data.status === "paused") return { ...base, kind: "paused" };
  if (data.status !== "active" || "datingMethod" in data) return { ...base, kind: "failed" };
  return { ...base, kind: "active", pregnancy: data, events: await readEvents(client, data.id) };
}

/**
 * Everything /journey shows for this person. The sharing list (names) is
 * read only when a name could appear: who added an event, whose pregnancy
 * is shared with her, and who will see hers paused.
 */
export async function loadJourney(client: ApiClient, me: Me): Promise<JourneyReads> {
  const grants = me.grants.filter((grant) => grant.category === "pregnancy.overview");
  const owners = new Map(grants.map((grant) => [grant.ownerId, grant.level]));
  // With a pregnancy shared with her, names are needed whatever her own state; start that read now.
  const early = owners.size > 0 ? readPeople(client) : null;
  const [own, shared] = await Promise.all([
    readOwn(client, me),
    Promise.all([...owners].map(([ownerId, level]) => readShared(client, { ownerId, level }))),
  ]);
  let people: Read<SharingPerson[]> | null = null;
  if (early !== null) people = await early;
  else if (own.kind === "active") people = await readPeople(client);
  return { own, shared, people };
}
