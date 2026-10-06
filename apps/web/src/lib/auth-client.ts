import { AUTH_BASE_PATH, createAuthClient } from "@tidefern/auth/client";
import type { AuthClient, AuthClientError } from "@tidefern/auth/client";

export { AUTH_BASE_PATH };

/**
 * The one auth client the app's forms share. It calls the page's own origin,
 * where the Hono app mounts Better Auth at /api/auth, with the session cookie
 * the browser already holds (architecture 6.2). Nothing here reads the
 * session itself; server components read it through GET /api/v1/me.
 */
export const authClient: AuthClient = createAuthClient();

export type { AuthClient, AuthClientError };

/** Where every successful sign-in lands. */
export const SIGNED_IN_PATH = "/today";

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
