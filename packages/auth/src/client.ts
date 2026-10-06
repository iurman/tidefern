import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient as createReactAuthClient } from "better-auth/react";

/**
 * The server mounts Better Auth at this path (`basePath` in `./auth.ts`);
 * the client must agree with it or every call goes to a 404.
 */
export const AUTH_BASE_PATH = "/api/auth";

export interface AuthClientOptions {
  /**
   * The origin the client calls. In a browser the default is the page's own
   * origin, which is the only origin the session cookie is sent to; a test
   * passes a fixed one.
   */
  baseURL?: string | undefined;
  /**
   * Called when a sign-in answers that a second factor is still needed. The
   * sign-in form reads `twoFactorRedirect` off the response as well, so this
   * is optional; it exists for a caller that wants a side effect.
   */
  onTwoFactorRedirect?: (() => void | Promise<void>) | undefined;
}

/**
 * The browser client for the server in `./auth.ts`: email and password,
 * passkeys and TOTP, the same three the server enables and nothing more.
 * This is the one entry `apps/web` may import from this package; it never
 * loads the server config or the database pool. No call here ever sends
 * `trustDevice`: a remembered device on a shared household computer would
 * defeat the second factor (architecture 6.1).
 */
export function createAuthClient(options: AuthClientOptions = {}) {
  return createReactAuthClient({
    ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    basePath: AUTH_BASE_PATH,
    plugins: [
      passkeyClient(),
      twoFactorClient(
        options.onTwoFactorRedirect !== undefined
          ? { onTwoFactorRedirect: options.onTwoFactorRedirect }
          : {},
      ),
    ],
  });
}

export type AuthClient = ReturnType<typeof createAuthClient>;

/** The error every client call can answer with, as `{ data: null, error }`. */
export interface AuthClientError {
  code?: string | undefined;
  message?: string | undefined;
  status: number;
  statusText: string;
}
