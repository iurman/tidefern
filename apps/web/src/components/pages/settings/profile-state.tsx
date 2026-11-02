"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { CLOSING_VIEW_PATH } from "./copy";
import { goTo } from "./navigate";
import { ifMatchFor, snapshotOf, type ProfileSnapshot, type SaveOutcome } from "./profile-input";
import { createProfileStore, type ProfileStore, type ProfileTransport } from "./profile-store";

/** The profile route over the browser client: the whole body, If-Match, and the answer's facts. */
export const browserProfileTransport: ProfileTransport = {
  async put(body, version) {
    try {
      const { data, error, response } = await browserApiClient().PUT("/api/v1/me/profile", {
        params: { header: { "if-match": ifMatchFor(version) } },
        body,
      });
      if (data !== undefined) return { kind: "saved", profile: snapshotOf(data) };
      const detail =
        typeof error === "object" && error !== null && "detail" in error
          ? (error as { detail?: unknown }).detail
          : undefined;
      return {
        kind: "refused",
        status: response.status,
        detail: typeof detail === "string" ? detail : undefined,
      };
    } catch {
      return { kind: "unreachable" };
    }
  },
  async read() {
    try {
      const { data } = await browserApiClient().GET("/api/v1/me/profile");
      return data === undefined ? null : snapshotOf(data);
    } catch {
      return null;
    }
  },
};

const ProfileContext = createContext<ProfileStore | null>(null);

/**
 * One profile store for the groups on a page (profile-store.ts). The server
 * passes the profile it read, or null when that read failed, in which case
 * each group says so. A server render after `router.refresh()` passes a
 * newer profile, which the store takes when its version is ahead.
 */
export function ProfileProvider({
  initial,
  transport = browserProfileTransport,
  children,
}: {
  initial: ProfileSnapshot | null;
  transport?: ProfileTransport;
  children: ReactNode;
}) {
  const [store] = useState(() =>
    initial === null ? null : createProfileStore(initial, transport),
  );
  useEffect(() => {
    if (store !== null && initial !== null) store.adopt(initial);
  }, [store, initial]);
  return <ProfileContext value={store}>{children}</ProfileContext>;
}

function subscribeToNothing() {
  return () => {};
}

function nothing() {
  return null;
}

async function nowhere(): Promise<SaveOutcome> {
  return { kind: "network" };
}

/** The shared profile (null when it could not be read) and the queued save. */
export function useProfile(): {
  profile: ProfileSnapshot | null;
  save: ProfileStore["save"];
} {
  const store = useContext(ProfileContext);
  const profile = useSyncExternalStore(
    store === null ? subscribeToNothing : store.subscribe,
    store === null ? nothing : store.get,
    store === null ? nothing : store.get,
  );
  return { profile, save: store === null ? nowhere : store.save };
}

/**
 * Leaves the page when a save says the session is gone (sign in) or the
 * account started closing elsewhere (the locked view). True when it left.
 */
export function leaveFor(outcome: SaveOutcome): boolean {
  if (outcome.kind === "signed-out") {
    goTo(SIGN_IN_PATH);
    return true;
  }
  if (outcome.kind === "closing") {
    goTo(CLOSING_VIEW_PATH);
    return true;
  }
  return false;
}
