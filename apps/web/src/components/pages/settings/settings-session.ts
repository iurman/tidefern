import type { Me, MeLookup } from "@tidefern/api-client";

/**
 * What a settings screen does with the session read the (app) layout shares
 * (`sessionMe`). Next renders the layout and the page in parallel, so the
 * page sees the same answer the layout redirects on and must not assume a
 * profile:
 *
 * - `ok`: a person with a profile, so the screen renders and reads more;
 * - `failed`: the read failed without a 401; the layout keeps the person
 *   and says so, and the screen renders what works without the API (the
 *   theme, the links, sign out) with a failure line in each other group;
 * - `leave`: no session, a closing account, or no profile yet; the layout
 *   redirects (to sign in, to /closing, to /welcome) and the screen renders
 *   nothing rather than throw.
 */
export type SettingsSession = { kind: "ok"; me: Me } | { kind: "failed" } | { kind: "leave" };

export function settingsSession(lookup: MeLookup): SettingsSession {
  if (lookup.kind === "ok") {
    return lookup.me.profile === null ? { kind: "leave" } : { kind: "ok", me: lookup.me };
  }
  if (lookup.kind === "failed") return { kind: "failed" };
  return { kind: "leave" };
}
