/**
 * The request header the proxy (`src/proxy.ts`) sets to the path of the page
 * asked for, so a layout, which Next never hands the URL, can send a
 * signed-out visitor to sign in and back to that page (`signInPathFor` in
 * lib/auth-client.ts). It carries the pathname only, never the query, and
 * the proxy overwrites whatever a client sent under the same name; the
 * reader still validates it with `safeNextPath` before it goes anywhere.
 */
export const REQUESTED_PATH_HEADER = "x-tidefern-requested-path";
