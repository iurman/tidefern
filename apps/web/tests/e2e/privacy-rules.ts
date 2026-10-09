/**
 * The rules the privacy walk (./privacy.spec.ts, task J3f) holds every
 * response and every request to, as pure functions over a URL and a header
 * map, so ./privacy-rules.spec.ts can prove each one rejects what it should
 * without a server.
 *
 * Where each rule comes from:
 *
 * - Architecture 9.1: no third-party request anywhere; a per-request CSP
 *   nonce with `strict-dynamic` and never `unsafe-inline` in `script-src`;
 *   no health data in URLs, query strings or page titles.
 * - Architecture 9.4: API responses carry `private, no-store`, and every
 *   HTML route renders per request, so an authenticated page is never
 *   stored either.
 * - Architecture 9.3 and `apps/web/next.config.ts`: HSTS, `nosniff`, the
 *   referrer policy, the permissions policy and frame denial on everything
 *   the site serves; previews never index (12.1, 3.4).
 */

export type Headers = Record<string, string>;

/** The value `next.config.ts` sends; the walk holds the deployment to it. */
export const HSTS = "max-age=63072000; includeSubDomains";
export const REFERRER_POLICY = "strict-origin-when-cross-origin";
/** The API's own policy (`next.config.ts`): it serves no HTML. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/**
 * Whether a request leaves the site: anything on another origin over the
 * network. `data:` and `blob:` URLs never touch the network and stay inside
 * the page, so they are not third-party.
 */
export function isThirdParty(url: string, origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return false;
  return parsed.origin !== origin;
}

/** The headers every response from the site carries, whatever it is. */
export function baseHeaderProblems(headers: Headers): string[] {
  const problems: string[] = [];
  if (headers["strict-transport-security"] !== HSTS)
    problems.push(`Strict-Transport-Security is "${headers["strict-transport-security"] ?? ""}"`);
  if (headers["x-content-type-options"] !== "nosniff")
    problems.push(`X-Content-Type-Options is "${headers["x-content-type-options"] ?? ""}"`);
  if (headers["referrer-policy"] !== REFERRER_POLICY)
    problems.push(`Referrer-Policy is "${headers["referrer-policy"] ?? ""}"`);
  if (headers["x-frame-options"] !== "DENY")
    problems.push(`X-Frame-Options is "${headers["x-frame-options"] ?? ""}"`);
  const permissions = headers["permissions-policy"] ?? "";
  for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
    if (!permissions.includes(feature)) problems.push(`Permissions-Policy lacks ${feature}`);
  }
  return problems;
}

/** The directives of a policy by name, each with its sources. */
function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

/**
 * The per-request policy an HTML response carries (`src/proxy.ts`): scripts
 * only from the site with this response's nonce and `strict-dynamic`, never
 * `unsafe-inline` or another origin; nothing framed; no plugins; no base
 * URL or form target elsewhere.
 */
export function cspProblems(policy: string | undefined): string[] {
  if (!policy) return ["no Content-Security-Policy"];
  const problems: string[] = [];
  const map = directives(policy);
  const script = map.get("script-src") ?? map.get("default-src") ?? [];
  if (!script.some((source) => /^'nonce-[A-Za-z0-9+/=]+'$/.test(source)))
    problems.push("script-src has no nonce");
  if (!script.includes("'strict-dynamic'")) problems.push("script-src lacks 'strict-dynamic'");
  if (script.includes("'unsafe-inline'")) problems.push("script-src allows 'unsafe-inline'");
  const expected: Record<string, string> = {
    "default-src": "'self'",
    "frame-ancestors": "'none'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
  };
  for (const [name, value] of Object.entries(expected)) {
    const sources = map.get(name);
    if (sources?.join(" ") !== value)
      problems.push(`${name} is "${sources?.join(" ") ?? "missing"}", not ${value}`);
  }
  // No origin may appear in any directive: the site loads nothing from elsewhere.
  for (const [name, sources] of map) {
    for (const source of sources) {
      if (/^(https?:|wss?:|\*)/.test(source) || /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(source))
        problems.push(`${name} allows another origin (${source})`);
    }
  }
  return problems;
}

/** Whether a Cache-Control value keeps the response private and unstored. */
export function isPrivateNoStore(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes("private") && parts.includes("no-store") && !parts.includes("public");
}

/**
 * An HTML page: the base headers, the nonce policy, never stored, and no
 * indexing unless this run expects an indexable production.
 */
export function htmlProblems(headers: Headers, { indexable = false } = {}): string[] {
  const problems = [
    ...baseHeaderProblems(headers),
    ...cspProblems(headers["content-security-policy"]),
  ];
  if (!isPrivateNoStore(headers["cache-control"]))
    problems.push(`Cache-Control is "${headers["cache-control"] ?? ""}", not private and no-store`);
  if (!indexable && !(headers["x-robots-tag"] ?? "").includes("noindex"))
    problems.push(`X-Robots-Tag is "${headers["x-robots-tag"] ?? ""}", not noindex`);
  return problems;
}

/** An API answer: the base headers, exactly `private, no-store`, and the API's own policy. */
export function apiProblems(headers: Headers): string[] {
  const problems = baseHeaderProblems(headers);
  if (headers["cache-control"] !== "private, no-store")
    problems.push(`Cache-Control is "${headers["cache-control"] ?? ""}", not "private, no-store"`);
  if (headers["content-security-policy"] !== API_CSP)
    problems.push(`Content-Security-Policy is "${headers["content-security-policy"] ?? ""}"`);
  return problems;
}

/**
 * Words that would name a health fact if they reached a page title, a page
 * path or a query string. Page routes are neutral by rule (architecture
 * 9.1: `/today`, `/calendar`, `/journey`, `/family`); API resource paths
 * are a published contract and are logged as route templates only, so they
 * are judged by their query strings, not their names.
 */
export const HEALTH_WORDS =
  /\b(period|periods|menstrua\w*|pregnan\w*|fertil\w*|ovulat\w*|symptoms?|cramps?|spotting|bleed\w*|miscarr\w*|abortion|contracept\w*|trimester|sex|libido|mood|moods|diapers?|breast\w*|weight|percentile|due[- ]date|cycle[- ]day|week \d+)\b/i;

/** The query parameters a page or the API may carry: none of them holds a health fact. */
export const NEUTRAL_QUERY = new Set([
  "_rsc",
  "next",
  "cursor",
  "limit",
  "order",
  "done",
  "error",
  "token",
  // The calendar's address: a month as `YYYY-MM` and the month or list view.
  "month",
  "view",
  // A span of calendar dates as `YYYY-MM-DD`.
  "from",
  "to",
]);

/** What is wrong with a URL a signed-in walk produced: a health word in the path or any query parameter outside the neutral set. */
export function urlProblems(url: string, { checkPath }: { checkPath: boolean }): string[] {
  const problems: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [`unparsable URL ${url}`];
  }
  if (checkPath && HEALTH_WORDS.test(decodeURIComponent(parsed.pathname)))
    problems.push(`the path ${parsed.pathname} names a health fact`);
  for (const [name, value] of parsed.searchParams) {
    if (!NEUTRAL_QUERY.has(name)) problems.push(`query parameter "${name}" on ${parsed.pathname}`);
    if (HEALTH_WORDS.test(value)) problems.push(`query value of "${name}" names a health fact`);
  }
  return problems;
}

/** What is wrong with a signed-in page's title. */
export function titleProblems(title: string): string[] {
  return HEALTH_WORDS.test(title) ? [`the title "${title}" names a health fact`] : [];
}

/** A captured mail as the e2e capture reports it: the address, the subject and the one link. */
export interface CapturedMail {
  to: string;
  subject: string;
  link?: string;
}

/**
 * What is wrong with a mail the routes sent (architecture 10.2): a health
 * word in the subject, in the link's path or in any of its query values.
 * The link's parameter names belong to the auth library, so only the
 * values are judged.
 */
export function mailProblems(mail: CapturedMail): string[] {
  const problems: string[] = [];
  if (HEALTH_WORDS.test(mail.subject))
    problems.push(`the subject "${mail.subject}" names a health fact`);
  if (mail.link === undefined) return problems;
  let parsed: URL;
  try {
    parsed = new URL(mail.link);
  } catch {
    return [...problems, `unparsable link in "${mail.subject}"`];
  }
  if (HEALTH_WORDS.test(decodeURIComponent(parsed.pathname)))
    problems.push(`the link path ${parsed.pathname} names a health fact`);
  for (const [name, value] of parsed.searchParams)
    if (HEALTH_WORDS.test(value)) problems.push(`the link's "${name}" value names a health fact`);
  return problems;
}
