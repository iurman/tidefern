import "server-only";

import { headers } from "next/headers";
import type { ApiClient, components } from "@tidefern/api-client";
import { serverApiClient } from "@/lib/api-server";
import type { ClosureRequest } from "./closure";
import type { Consent } from "./consent-records";
import { snapshotOf, type ProfileSnapshot } from "./profile-input";

/**
 * The reads the settings screens and the locked view make on the server,
 * through the in-process client (architecture 5.2) with the request's own
 * cookie. Each answers null (or `ok: false`) when the API could not answer,
 * so a group renders its own failure line and the page never throws: Next
 * renders the (app) layout and the page in parallel, and a throw would put
 * the error boundary where the rest of the page still works.
 */

export type Processor = components["schemas"]["Processor"];

export async function settingsClient(): Promise<ApiClient> {
  return serverApiClient(await headers());
}

/** The server's clock, read once per render for the fresh sign-in window and the days left. */
export function serverNow(): number {
  return Date.now();
}

/** GET /v1/me/profile: the profile the groups edit, with the version If-Match needs. */
export async function readProfile(client: ApiClient): Promise<ProfileSnapshot | null> {
  try {
    const { data } = await client.GET("/api/v1/me/profile");
    return data === undefined ? null : snapshotOf(data);
  } catch {
    return null;
  }
}

/** Pages of a consent list the record could need; one onboarding writes at most seven rows. */
const MAX_CONSENT_PAGES = 5;

/** GET /v1/me/consents, every page: her own consents and those for the children she guards. */
export async function readConsents(client: ApiClient): Promise<Consent[] | null> {
  const items: Consent[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_CONSENT_PAGES; page += 1) {
      const { data } = await client.GET("/api/v1/me/consents", {
        params: { query: cursor === undefined ? { limit: 200 } : { limit: 200, cursor } },
      });
      if (data === undefined) return null;
      items.push(...data.items);
      if (data.nextCursor === null) return items;
      cursor = data.nextCursor;
    }
    return items;
  } catch {
    return null;
  }
}

/** GET /v1/me/data-summary, for the processors and what each receives (the record names them). */
export async function readProcessors(client: ApiClient): Promise<Processor[] | null> {
  try {
    const { data } = await client.GET("/api/v1/me/data-summary");
    return data === undefined ? null : data.processors;
  } catch {
    return null;
  }
}

/**
 * GET /v1/children: the names of the children she guards, so a consent
 * given for a child says whose it is. A failed read leaves the names out
 * and each row says "A child" instead.
 */
export async function readChildNames(client: ApiClient): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const { data } = await client.GET("/api/v1/children", { params: { query: { limit: 200 } } });
    for (const child of data?.items ?? []) names.set(child.id, child.displayName);
  } catch {
    // The rows say "A child" instead.
  }
  return names;
}

export type CloseRead = { ok: true; request: ClosureRequest | null } | { ok: false };

/** GET /v1/me/close: the open closure, which a closing account may still read. */
export async function readClosure(client: ApiClient): Promise<CloseRead> {
  try {
    const { data } = await client.GET("/api/v1/me/close");
    return data === undefined ? { ok: false } : { ok: true, request: data.request };
  } catch {
    return { ok: false };
  }
}
