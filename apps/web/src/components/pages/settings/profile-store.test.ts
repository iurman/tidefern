import { describe, expect, it, vi } from "vitest";
import type { ProfileFields, ProfileSnapshot, PutAnswer } from "./profile-input";
import { createProfileStore, type ProfileTransport } from "./profile-store";

const first: ProfileSnapshot = {
  displayName: "Noor",
  timeZone: "Europe/Berlin",
  stage: "cycle",
  weekStart: 1,
  units: "metric",
  notificationDetail: "generic",
  version: 3,
};

/** A transport that saves like the route does: the body becomes the profile at version + 1. */
function routeLike(overrides: Partial<ProfileTransport> = {}) {
  const puts: { body: ProfileFields; version: number }[] = [];
  let stored = first;
  const transport: ProfileTransport = {
    async put(body, version) {
      puts.push({ body, version });
      if (version !== stored.version)
        return { kind: "refused", status: 409, detail: "stale_version" };
      stored = { ...body, version: version + 1 };
      return { kind: "saved", profile: stored };
    },
    async read() {
      return stored;
    },
    ...overrides,
  };
  return { transport, puts };
}

describe("the profile store the settings groups share", () => {
  it("runs two quick saves one after the other, the second built on the first one's answer", async () => {
    const { transport, puts } = routeLike();
    const store = createProfileStore(first, transport);
    const units = store.save({ units: "imperial" });
    const detail = store.save({ notificationDetail: "gentle" });
    await expect(units).resolves.toMatchObject({ kind: "saved" });
    await expect(detail).resolves.toMatchObject({ kind: "saved" });
    expect(puts.map((put) => put.version)).toEqual([3, 4]);
    // The second body still carries the first change: nothing reset the units.
    expect(puts[1]?.body).toMatchObject({ units: "imperial", notificationDetail: "gentle" });
    expect(store.get()).toMatchObject({
      units: "imperial",
      notificationDetail: "gentle",
      version: 5,
    });
  });

  it("keeps the saved profile when a save fails, so the next one starts from the API's answer", async () => {
    const answers: PutAnswer[] = [{ kind: "refused", status: 503 }];
    const { transport, puts } = routeLike({
      put: vi.fn(async (body: ProfileFields, version: number): Promise<PutAnswer> => {
        puts.push({ body, version });
        return answers.shift() ?? { kind: "saved", profile: { ...body, version: version + 1 } };
      }),
    });
    const store = createProfileStore(first, transport);
    await expect(store.save({ units: "imperial" })).resolves.toEqual({ kind: "server" });
    expect(store.get()).toEqual(first);
    await store.save({ notificationDetail: "detailed" });
    expect(puts[1]?.body).toMatchObject({ units: "metric", notificationDetail: "detailed" });
  });

  it("reads the latest profile back after a stale version, and tells its listeners", async () => {
    const newer: ProfileSnapshot = { ...first, timeZone: "Asia/Tokyo", version: 7 };
    const { transport } = routeLike({
      put: async () => ({ kind: "refused", status: 409, detail: "stale_version" }),
      read: async () => newer,
    });
    const store = createProfileStore(first, transport);
    const heard = vi.fn();
    store.subscribe(heard);
    await expect(store.save({ units: "imperial" })).resolves.toEqual({ kind: "stale" });
    expect(store.get()).toEqual(newer);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("takes a profile from a later server render only when it is newer", () => {
    const { transport } = routeLike();
    const store = createProfileStore(first, transport);
    store.adopt({ ...first, displayName: "Old", version: 2 });
    expect(store.get().displayName).toBe("Noor");
    store.adopt({ ...first, displayName: "New", version: 4 });
    expect(store.get().displayName).toBe("New");
  });

  it("stops telling a listener once it unsubscribes", async () => {
    const { transport } = routeLike();
    const store = createProfileStore(first, transport);
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    stop();
    await store.save({ units: "imperial" });
    expect(heard).not.toHaveBeenCalled();
  });
});
