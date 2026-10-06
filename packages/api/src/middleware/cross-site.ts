import type { MiddlewareHandler } from "hono";

import type { ApiEnv } from "../context";
import { problem } from "../problem";
import { isMutation } from "./limits";

export interface CrossSiteOptions {
  /**
   * Origins a mutation may come from besides the request's own origin, in
   * the form `packages/auth` resolves for Better Auth: an exact origin such
   * as `https://tidefern.example`, or one whose host carries a `*` label
   * such as `https://tidefern-*-team.vercel.app` (the team's preview
   * pattern). The host passes `resolveHosts(facts).trustedOrigins`; without
   * the option only the request's own origin is trusted, which is what one
   * origin (architecture 3.1) needs on any deployment host.
   */
  trustedOrigins?: readonly string[] | undefined;
}

/** The `detail` of the 403 problem a cross-site mutation gets. */
export const CROSS_SITE_REQUEST = "cross_site_request";

/** The `Sec-Fetch-Site` values a browser sends for a request from this origin or from the address bar. */
const OWN_SITE_VALUES: ReadonlySet<string> = new Set(["same-origin", "none"]);

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, "[a-z0-9-]+")}$`);
}

/**
 * Whether `origin` (the request's `Origin` header) is the request's own
 * origin or one of the trusted ones. A `*` in a trusted origin matches one
 * host label, never a dot, so the preview pattern cannot widen to another
 * Vercel customer. The literal `null` origin (a sandboxed frame, a redirect
 * across sites) is never trusted.
 */
export function originAllowed(
  origin: string,
  ownOrigin: string,
  trustedOrigins: readonly string[] = [],
): boolean {
  const candidate = origin.trim().toLowerCase();
  if (candidate === "" || candidate === "null") return false;
  if (candidate === ownOrigin.toLowerCase()) return true;
  for (const trusted of trustedOrigins) {
    const normalized = trusted.trim().toLowerCase();
    if (normalized.includes("*")) {
      if (patternToRegExp(normalized).test(candidate)) return true;
    } else if (normalized === candidate) {
      return true;
    }
  }
  return false;
}

/**
 * Decides a mutation from its headers (architecture 8.3): `Origin` when the
 * browser sent one, `Sec-Fetch-Site` otherwise, and neither means refused.
 * A request whose only credential is an `Authorization` header is allowed
 * through: the check defends the cookie session against a forged request
 * from another site, and a bearer cannot be attached by another site's
 * page (architecture 6.2, the Phase 4 clients).
 */
export function crossSiteVerdict(
  headers: Headers,
  ownOrigin: string,
  trustedOrigins: readonly string[] = [],
): "allowed" | "refused" {
  if (headers.has("authorization") && !headers.has("cookie")) return "allowed";
  const origin = headers.get("origin");
  if (origin !== null) {
    return originAllowed(origin, ownOrigin, trustedOrigins) ? "allowed" : "refused";
  }
  const site = headers.get("sec-fetch-site");
  if (site !== null) {
    return OWN_SITE_VALUES.has(site.trim().toLowerCase()) ? "allowed" : "refused";
  }
  return "refused";
}

/**
 * Refuses every `/v1` mutation that does not come from the app's own
 * origin or a trusted one with the 403 problem, the one use of `forbidden`
 * the contract allows (architecture 5.1). Reads pass untouched.
 */
/**
 * The origin the browser addressed, read the way the browser sees it: the
 * forwarded host and scheme on a platform, else the Host header, else the
 * request URL. A Next.js host rewrites the URL's host to its listen name, so
 * the URL alone would call a request to 127.0.0.1 a request to localhost and
 * refuse the browser's own Origin.
 */
export function ownOriginOf(url: string, headers: Headers): string {
  const parsed = new URL(url);
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return parsed.origin;
  const forwardedProto = headers.get("x-forwarded-proto");
  const protocol = forwardedProto ? `${forwardedProto.split(",")[0]!.trim()}:` : parsed.protocol;
  try {
    return new URL(`${protocol}//${host.split(",")[0]!.trim()}`).origin;
  } catch {
    return parsed.origin;
  }
}

export function crossSite(options: CrossSiteOptions = {}): MiddlewareHandler<ApiEnv> {
  const trusted = options.trustedOrigins ?? [];
  return async (c, next) => {
    if (!isMutation(c.req.method)) return next();
    const ownOrigin = ownOriginOf(c.req.url, c.req.raw.headers);
    if (crossSiteVerdict(c.req.raw.headers, ownOrigin, trusted) === "refused") {
      return problem(c, 403, "forbidden", { detail: CROSS_SITE_REQUEST });
    }
    return next();
  };
}
