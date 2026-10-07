/**
 * The invitation link's fragment: the mail links `/sharing#invitation=<token>`
 * (`INVITATION_PATH` in packages/api, task E7). A fragment never reaches a
 * server, a log or a query string, and a browser keeps it across a redirect
 * whose Location names none, so the token survives the 307 to /sign-in for
 * a visitor without a session and the one to /welcome for a person without
 * a profile. Every page that can receive it (sign-in, /welcome, /sharing)
 * reads it here, once: the token leaves the address bar at once and lives
 * in that page's memory only. Nothing here logs it, stores it or puts it in
 * a query.
 */

/** Where an invitation is accepted (task H6), the path the mail links. */
export const INVITATION_LANDING_PATH = "/sharing";

const KEY = "invitation";

/**
 * The alphabet the API mints tokens in (base64url) and the longest token its
 * accept route takes. The API stays the judge of whether a token is real;
 * this only keeps anything else out of the URL a page builds from it.
 */
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

/** The parameters of a location hash such as `#invitation=abc`. */
function fragmentParameters(hash: string): URLSearchParams | null {
  return hash.length > 1 && hash.startsWith("#") ? new URLSearchParams(hash.slice(1)) : null;
}

/** The token in a location hash such as `#invitation=abc`, or null when there is none or it is not a token. */
export function invitationTokenFrom(hash: string): string | null {
  const value = fragmentParameters(hash)?.get(KEY) ?? null;
  return value !== null && TOKEN.test(value) ? value : null;
}

/** `/sharing#invitation=<token>`, or null when the token is not one the API could have minted. */
export function invitationLanding(token: string): string | null {
  return TOKEN.test(token) ? `${INVITATION_LANDING_PATH}#${KEY}=${token}` : null;
}

/** The slice of `window` the fragment is read from and removed through, so a test can pass a fake. */
export interface FragmentHost {
  location: Pick<Location, "hash" | "pathname" | "search">;
  history: Pick<History, "replaceState">;
}

/**
 * Reads an `#invitation=` fragment once and takes it out of the address bar
 * in the same call (`history.replaceState`, keeping the path and the
 * query), so it is not left in the history, a bookmark or a shared screen.
 * Returns the token for the caller to hold in memory, or null when the page
 * was not opened from an invitation link; a fragment that names an
 * invitation but holds no token is removed all the same. Call it from an
 * effect: it reads `window` by default.
 */
export function takeInvitationFragment(host: FragmentHost = window): string | null {
  const { hash, pathname, search } = host.location;
  if (fragmentParameters(hash)?.has(KEY) !== true) return null;
  // Next.js integrates replaceState into its router; null keeps the router's own state.
  host.history.replaceState(null, "", `${pathname}${search}`);
  return invitationTokenFrom(hash);
}
