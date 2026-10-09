import { AUTH_BASE_PATH, createAuthClient } from "@tidefern/auth/client";
import type { AuthClient, AuthClientError } from "@tidefern/auth/client";
import { invitationLanding } from "./invitation-fragment";

export { AUTH_BASE_PATH };

/**
 * The one auth client the app's forms share. It calls the page's own origin,
 * where the Hono app mounts Better Auth at /api/auth, with the session cookie
 * the browser already holds (architecture 6.2). Nothing here reads the
 * session itself; server components read it through GET /api/v1/me.
 */
export const authClient: AuthClient = createAuthClient();

export type { AuthClient, AuthClientError };

/** Where a successful sign-in lands unless an invitation or a `?next=` path says otherwise. */
export const SIGNED_IN_PATH = "/today";

/** Where the (app) layout sends a signed-in person without a profile: onboarding, outside the shell (task H1). */
export const WELCOME_PATH = "/welcome";

/** Where the (app) layout sends a person whose account is closing: the locked view with the undo (task H7). */
export const CLOSING_PATH = "/closing";

/** Long enough for any page path the app has; a longer `?next=` is refused unread. */
const MAX_NEXT_LENGTH = 512;

/** A base no real request carries, so a value that resolves anywhere else shows it leaves the origin. */
const NEXT_BASE = "https://next.invalid";

/**
 * Whether a `?next=` value is a page on this origin that a sign-in may
 * return to (the way back after a fresh sign-in, or to the page a
 * signed-out visitor asked for): a path only, starting with exactly one
 * slash; no backslash, no query, no fragment, no space or control
 * character (a browser drops tabs and newlines from a URL, so
 * "/\t/elsewhere.example" would become "//elsewhere.example"); no percent
 * sign, so no encoded slash, backslash or dot reaches anything that decodes
 * it again (the app's paths are dates and opaque ids, never encoded);
 * already normalized, so no dot segment resolves somewhere else; and never
 * the API. Returns the path, or null for anything else, and the person
 * then lands on Today.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (raw[0] !== "/" || raw[1] === "/") return null;
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || "\\?#%".includes(character)) return null;
  }
  let url: URL;
  try {
    url = new URL(raw, NEXT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== NEXT_BASE || url.pathname !== raw) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  return url.pathname;
}

/**
 * Where a successful sign-in lands (a full navigation, so the page reads
 * the fresh session cookie on the server): the sharing screen with the
 * token back in its fragment when the sign-in page was opened from an
 * invitation link (the token the page took from the address bar,
 * `takeInvitationFragment`), else a safe `?next=` path, else Today.
 */
export function signedInPath(invitation: string | null, next: string | null | undefined): string {
  const landing = invitation === null ? null : invitationLanding(invitation);
  return landing ?? safeNextPath(next) ?? SIGNED_IN_PATH;
}

/**
 * Where a protected page sends a signed-out visitor: the sign-in page with
 * the page they asked for in `?next=`, so the sign-in returns them to it.
 * Only the path travels, never the original query or fragment (a fragment
 * the browser keeps across the redirect on its own, which is how an
 * invitation's token survives), and only a path `safeNextPath` accepts;
 * Today needs no `next`, since a sign-in lands there anyway.
 */
export function signInPathFor(requested: string | null | undefined): string {
  const next = safeNextPath(requested);
  if (next === null || next === SIGNED_IN_PATH) return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?${new URLSearchParams({ next }).toString()}`;
}

/**
 * The callback the verification link in a sign-up mail lands on. Better Auth
 * redirects to it as given after a verification and appends `error=` when
 * the token fails, so `done` is the one signal that a verification happened:
 * /verify without it is a direct visit and shows neither result.
 */
export const VERIFY_PATH = "/verify?done=1";

/** The route the reset link in a reset mail lands on; the server appends the token. */
export const RESET_PATH = "/reset";

/**
 * The slice of `window` the passkey checks read, so a test can pass a plain
 * object instead of a browser.
 */
export interface PasskeyHost {
  PublicKeyCredential?: {
    isConditionalMediationAvailable?: () => Promise<boolean>;
  };
}

/**
 * Whether this browser can run a passkey ceremony at all. WebAuthn exposes
 * itself as `PublicKeyCredential`; without it the passkey control is left
 * out rather than shown and failing.
 */
export function passkeysAvailable(host: PasskeyHost | undefined): boolean {
  return host?.PublicKeyCredential !== undefined;
}

/**
 * Whether the browser can offer a passkey inside the email field's autofill
 * (conditional mediation). Older browsers lack the method and a few throw
 * when asked; both mean no.
 */
export async function passkeyAutofillAvailable(host: PasskeyHost | undefined): Promise<boolean> {
  const check = host?.PublicKeyCredential?.isConditionalMediationAvailable;
  if (typeof check !== "function") return false;
  try {
    return await check.call(host?.PublicKeyCredential);
  } catch {
    return false;
  }
}

/** Where a page sends a visitor whose session is missing or too old for what they asked. */
export const SIGN_IN_PATH = "/sign-in";

/** The `detail` the API's `requireFreshAuth` puts on its 401 problem (packages/api, task C2). */
export const FRESH_AUTHENTICATION_REQUIRED = "fresh_authentication_required";

/**
 * The error a settings call can answer with. Better Auth's own refusals
 * carry `code`; a refusal from a `/v1` route is an RFC 9457 problem whose
 * `detail` names the reason. The client surfaces the body's fields on the
 * error, so both shapes arrive on one object.
 */
export interface SettingsCallError extends AuthClientError {
  detail?: string | undefined;
}

/**
 * Whether a refusal means "sign in again, then retry": the API's ten-minute
 * rule from architecture 6.1 (`fresh_authentication_required` on a 401) or
 * Better Auth's own freshness rule on the session routes
 * (`SESSION_NOT_FRESH` on a 403). Both are answered the same way on the
 * page: the next step is a fresh sign-in, never a retry.
 */
export function freshAuthRequired(error: SettingsCallError | null | undefined): boolean {
  if (error === null || error === undefined) return false;
  if (error.status === 401 && error.detail === FRESH_AUTHENTICATION_REQUIRED) return true;
  return error.code === "SESSION_NOT_FRESH";
}

/**
 * Whether a refusal means there is no session at all (the cookie is stale
 * or gone), in which case the page sends the person to sign in rather than
 * showing a failure it cannot help with. Keyed on the code, not the status
 * alone: Better Auth's session middleware answers `UNAUTHORIZED` and the
 * API's problem answers `unauthenticated`, while a wrong one-time code is
 * also a 401 (`INVALID_CODE`) and must stay on the page.
 */
export function sessionGone(error: SettingsCallError | null | undefined): boolean {
  if (error === null || error === undefined || error.status !== 401) return false;
  if (freshAuthRequired(error)) return false;
  return error.code === "UNAUTHORIZED" || error.code === "unauthenticated";
}
