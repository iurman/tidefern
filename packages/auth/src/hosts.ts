/**
 * Where the app answers. Everything Better Auth needs to know about hosts is
 * derived from these facts, so tests pass values and the module-scope `auth`
 * in ./auth.ts is the only place that reads the environment.
 */
export interface HostFacts {
  /**
   * The production host without a scheme, for example `tidefern.example`.
   * It is the passkey relying party (minus a `www.` prefix) and the base URL
   * fallback. Comes from `BETTER_AUTH_URL` in production and from
   * `VERCEL_PROJECT_PRODUCTION_URL` on previews.
   */
  productionHost: string;
  /**
   * The Vercel team slug. Previews live on `tidefern-<hash>-<slug>.vercel.app`,
   * so the allowed preview pattern is `tidefern-*-<slug>.vercel.app` and
   * nothing wider: a bare `*.vercel.app` would trust every Vercel customer.
   * Absent outside Vercel, in which case no preview host is allowed.
   */
  teamSlug?: string | undefined;
  /** `VERCEL_ENV`: `production`, `preview` or `development`; unset locally. */
  vercelEnv?: string | undefined;
  /** `VERCEL_URL`: this deployment's own host, without a scheme. */
  vercelUrl?: string | undefined;
  /**
   * The origin a local server answers on when not on Vercel, for example
   * `http://localhost:3000`. Ignored on Vercel.
   */
  localOrigin?: string | undefined;
}

/** Better Auth 1.7.7's multi-host base URL form. */
export interface DynamicBaseUrl {
  allowedHosts: string[];
  fallback: string;
  protocol: "https";
}

export interface ResolvedHosts {
  /** Multi-host on Vercel, a fixed local origin otherwise. */
  baseURL: string | DynamicBaseUrl;
  /** The same patterns as the allowed hosts, as origins. */
  trustedOrigins: string[];
  /** WebAuthn relying party id: the apex production domain, never `www`. */
  rpID: string;
  /** The origin passkey ceremonies happen on. */
  passkeyOrigin: string;
}

export const VERCEL_PROJECT = "tidefern";
export const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";

/** `tidefern-<hash>-<slug>.vercel.app`; the slug itself may contain hyphens. */
const DEPLOYMENT_HOST = new RegExp(`^${VERCEL_PROJECT}-[a-z0-9]+-(.+)\\.vercel\\.app$`, "i");

function assertHost(value: string, name: string): void {
  if (!value || value.includes("/") || value.includes(":")) {
    throw new TypeError(`${name} must be a bare host, without a scheme, port or path`);
  }
}

/** Strips a `www.` prefix; the relying party is always the apex. */
export function apexOf(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** The preview host pattern for one team, or undefined without a team. */
export function previewHostPattern(teamSlug: string | undefined): string | undefined {
  if (!teamSlug) return undefined;
  assertHost(teamSlug, "teamSlug");
  return `${VERCEL_PROJECT}-*-${teamSlug}.vercel.app`;
}

/**
 * Reads the team slug off a Vercel deployment host. Returns undefined for
 * any host that is not this project's deployment URL, so a mistaken value
 * can only narrow what is allowed, never widen it.
 */
export function teamSlugFromDeploymentHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const match = DEPLOYMENT_HOST.exec(host.trim().toLowerCase());
  return match?.[1];
}

export function resolveHosts(facts: HostFacts): ResolvedHosts {
  assertHost(facts.productionHost, "productionHost");
  const productionHost = facts.productionHost.toLowerCase();
  const onVercel = facts.vercelEnv !== undefined && facts.vercelEnv !== "";

  if (!onVercel) {
    const localOrigin = new URL(facts.localOrigin ?? DEFAULT_LOCAL_ORIGIN).origin;
    return {
      baseURL: localOrigin,
      trustedOrigins: [localOrigin],
      rpID: new URL(localOrigin).hostname,
      passkeyOrigin: localOrigin,
    };
  }

  const preview = previewHostPattern(facts.teamSlug);
  const allowedHosts = preview ? [productionHost, preview] : [productionHost];
  const fallback = `https://${productionHost}`;

  // A preview is its own origin, so passkeys registered there are throwaway
  // by design (architecture 6.1); production pins the apex.
  const isProduction = facts.vercelEnv === "production";
  const previewHost = facts.vercelUrl?.toLowerCase();
  const passkeyHost = isProduction || !previewHost ? productionHost : previewHost;

  return {
    baseURL: { allowedHosts, fallback, protocol: "https" },
    trustedOrigins: allowedHosts.map((host) => `https://${host}`),
    rpID: isProduction || !previewHost ? apexOf(productionHost) : previewHost,
    passkeyOrigin: `https://${passkeyHost}`,
  };
}

/**
 * The subset of the environment the host facts come from. The index
 * signature keeps `process.env` assignable from a Next.js program too, where
 * the framework adds `NODE_ENV` to `NodeJS.ProcessEnv` and TypeScript would
 * otherwise reject the all-optional shape for sharing no property with it.
 */
export interface HostEnvironment {
  [key: string]: string | undefined;
  BETTER_AUTH_URL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  VERCEL_URL?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
}

/**
 * Builds the host facts from the environment. Only ./auth.ts calls this, for
 * the module-scope instance; tests construct facts directly.
 *
 * `BETTER_AUTH_URL` is set in production only (architecture 17.1) and
 * locally; previews derive everything from Vercel's own variables.
 */
export function hostFactsFromEnvironment(env: HostEnvironment): HostFacts {
  const configured = env.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL) : undefined;
  const onVercel = Boolean(env.VERCEL_ENV);
  const productionHost =
    (onVercel && env.VERCEL_ENV === "production" && configured?.hostname) ||
    env.VERCEL_PROJECT_PRODUCTION_URL ||
    (configured?.hostname ?? "localhost");

  return {
    productionHost,
    teamSlug: onVercel ? teamSlugFromDeploymentHost(env.VERCEL_URL) : undefined,
    vercelEnv: env.VERCEL_ENV,
    vercelUrl: env.VERCEL_URL,
    localOrigin: !onVercel && configured ? configured.origin : undefined,
  };
}
