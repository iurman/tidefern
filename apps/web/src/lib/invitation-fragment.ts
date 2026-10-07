/**
 * The invitation link's fragment: the mail links `/sharing#invitation=<token>`
 * (`INVITATION_PATH` in packages/api, task E7). A fragment never reaches a
 * server, a log or a query string, and a browser keeps it across a redirect
 * whose Location names none, so the token survives the 307 to /sign-in for
 * a visitor without a session, the one to /welcome for a person without a
 * profile and the one to /closing for an account that is closing. Every
 * page that can receive it (sign-in, /welcome, /sharing, /closing) reads it
 * here: the token leaves the address bar as soon as the router can take
 * the change and lives in that page's memory only (/closing drops it).
 * Nothing here logs it, stores it or puts it in a query.
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

/** Whether a location hash names an invitation at all, token or not. */
function namesInvitation(hash: string): boolean {
  return fragmentParameters(hash)?.has(KEY) === true;
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
 * Takes the fragment out of the address bar, keeping the path and the
 * query, through whatever `history.replaceState` the page has by now. A
 * fragment already gone (a second read's removal, or a page left in the
 * meantime) is left alone.
 */
function removeInvitationFragment(host: FragmentHost): void {
  const { hash, pathname, search } = host.location;
  if (!namesInvitation(hash)) return;
  host.history.replaceState(null, "", `${pathname}${search}`);
}

/**
 * Reads an `#invitation=` fragment and takes it out of the address bar, so
 * it is not left in the history, a bookmark or a shared screen. Returns the
 * token at once for the caller to hold in memory, or null when the page was
 * not opened from an invitation link; a fragment that names an invitation
 * but holds no token is removed all the same. Call it from an effect: it
 * reads `window` by default.
 *
 * The removal waits one task. Next.js folds `history.replaceState` into its
 * router (it keeps its own state on the entry and adopts the new address),
 * but it installs that in an effect of its root router, and on a full page
 * load React runs a page's mount effects before that one. A native call
 * from a mount effect would leave the history entry with no router state,
 * so Back to it is ignored, and leave the token in the router's own
 * address, which a `router.refresh()` writes back into the address bar. So
 * a read before the removal gets the token again (React strict mode's
 * second effect run in development does), and only one removal happens.
 */
export function takeInvitationFragment(host: FragmentHost = window): string | null {
  const { hash } = host.location;
  if (!namesInvitation(hash)) return null;
  setTimeout(() => removeInvitationFragment(host), 0);
  return invitationTokenFrom(hash);
}
