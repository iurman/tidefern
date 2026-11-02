import { secureHeaders } from "hono/secure-headers";

/**
 * The security headers every API answer carries, with the same values the
 * web host's `next.config.ts` gives every response (architecture 9.3).
 *
 * Hono's defaults are weaker in three places (HSTS for 180 days,
 * `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer` where the
 * site says `strict-origin-when-cross-origin`). Locally Next.js laid its own
 * headers over them, but on Vercel the function's own response headers win
 * over the project's header rules, so production answered the API with
 * Hono's values (task J3f, `curl -D - https://tidefern.app/api/v1/health`).
 * Setting them here makes the API right on any host, including a split
 * `api.` deployment (architecture 3.3) with no Next.js in front of it.
 */
export const API_SECURITY_HEADERS = {
  strictTransportSecurity: "max-age=63072000; includeSubDomains",
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  xContentTypeOptions: "nosniff",
} as const;

/** The API serves no HTML: nothing loads from it and nothing may frame it. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

export function securityHeaders() {
  return secureHeaders({
    ...API_SECURITY_HEADERS,
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  });
}
