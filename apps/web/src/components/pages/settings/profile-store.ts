import {
  outcomeOf,
  profileBody,
  type ProfileChange,
  type ProfileFields,
  type ProfileSnapshot,
  type PutAnswer,
  type SaveOutcome,
} from "./profile-input";

/** How the store reaches the API; the page passes the browser client, a test a fake. */
export interface ProfileTransport {
  /** PUT /v1/me/profile with the whole body and If-Match for `version`. Never throws. */
  put(body: ProfileFields, version: number): Promise<PutAnswer>;
  /** GET /v1/me/profile; null when it could not be read. Never throws. */
  read(): Promise<ProfileSnapshot | null>;
}

/**
 * One profile for every group on a page. The groups that edit it (profile,
 * time zone, units, notification detail) read the same snapshot and save
 * through the same queue, so two quick changes in two groups never race:
 * the second PUT is built from the profile the first one returned, with its
 * version for If-Match, instead of each group holding a copy that is stale
 * after the other saves (409) or that resets the other's field.
 *
 * It lives outside React state so a queued save can read the newest
 * snapshot when its turn comes; React reads it through `useSyncExternalStore`.
 */
export interface ProfileStore {
  get(): ProfileSnapshot;
  subscribe(listener: () => void): () => void;
  /** Takes a profile read elsewhere (a server render after a refresh) when it is newer. */
  adopt(next: ProfileSnapshot): void;
  /** Queues one save of `change` on top of the profile as it stands when the save runs. */
  save(change: ProfileChange): Promise<SaveOutcome>;
}

export function createProfileStore(
  initial: ProfileSnapshot,
  transport: ProfileTransport,
): ProfileStore {
  let current = initial;
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();

  function set(next: ProfileSnapshot) {
    current = next;
    for (const listener of listeners) listener();
  }

  function adopt(next: ProfileSnapshot) {
    if (next.version > current.version) set(next);
  }

  async function run(change: ProfileChange): Promise<SaveOutcome> {
    const base = current;
    const outcome = outcomeOf(await transport.put(profileBody(base, change), base.version));
    if (outcome.kind === "saved") {
      // The API's own answer is the profile from now on; a refresh that read this very write
      // in the meantime carries the same version and is the same record.
      if (outcome.profile.version >= current.version) set(outcome.profile);
    } else if (outcome.kind === "stale") {
      // Someone saved first: read what they saved, so the next attempt starts from it.
      const latest = await transport.read();
      if (latest !== null) adopt(latest);
    }
    return outcome;
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    adopt,
    save(change) {
      const result = queue.then(() => run(change));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
