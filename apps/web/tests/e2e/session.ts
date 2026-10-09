import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  test,
  type APIResponse,
  type BrowserContext,
  type Cookie,
  type Page,
} from "@playwright/test";
import { consentTextVersions, TERMS_VERSION, type Stage } from "@tidefern/schemas";
import { limiterPath, nextSlot, parseBuckets, type Bucket } from "./limiter";

/**
 * One way for every browser spec to get a session (task G10).
 *
 * - `signInAs(page, persona)` signs a seed persona in (packages/db README,
 *   "The cast") and adds the cookies to the page's context. The cookies are
 *   kept per persona for the worker, because Better Auth's limiter allows
 *   three sign-ins (and, separately, three sign-ups) per ten seconds, keeps
 *   its count in the database for the whole run, and spec files run one
 *   after another in a single worker. A kept session is checked with GET
 *   /api/v1/me (a read, which no limiter counts) before it is handed back,
 *   and signed in again when a spec earlier in the run signed it out
 *   (Settings' Sign out row, a device sign-out), so a later spec never gets
 *   a dead cookie. `fresh: true` signs in again, for a mutation behind fresh
 *   authentication: a cookie cached early in the run is older than the
 *   ten-minute window by the time a later spec runs.
 * - `freshAccount(page)` makes a verified account of its own through the
 *   mail capture endpoint and signs it in; `onboard(page, ...)` then gives
 *   it the consent and the profile the way onboarding (task H1) writes them.
 * - Every call sends an `Origin` equal to the base URL (Better Auth's origin
 *   check and the API's cross-site check both want one), and a 429 is
 *   waited out once (`X-Retry-After`) and tried again.
 *
 * On a server without a database (the database-free proof of the smoke
 * subset, or a local server started without one) a sign-in or sign-up
 * answers 5xx. The helpers then return null and add the canned session
 * cookie instead (`cannedSessionCookieValue`), so the session read itself
 * fails, the page renders its honest failed-read state and the spec asserts
 * that; a spec never skips. Once a sign-in has worked, a 5xx is a real
 * failure and throws.
 */

export type Persona = "noor" | "theo" | "mira" | "lena" | "pia";

/** The seeded cast's sign-in details: test-only values from packages/db/src/seed/cast.ts. */
export const PERSONAS: Readonly<Record<Persona, { email: string; password: string }>> = {
  noor: { email: "noor@example.test", password: "tidefern-seed-noor" },
  theo: { email: "theo@example.test", password: "tidefern-seed-theo" },
  mira: { email: "mira@example.test", password: "tidefern-seed-mira" },
  lena: { email: "lena@example.test", password: "tidefern-seed-lena" },
  pia: { email: "pia@example.test", password: "tidefern-seed-pia" },
};

/** A test-only password every fresh account shares; the addresses are unique per run. */
export const FRESH_PASSWORD = "tidefern-fresh-account";

/** The mail capture endpoint (architecture 15), mounted under E2E_MAIL_CAPTURE=true off Vercel. */
export const MAIL_CAPTURE_PATH = "/api/internal/e2e/mail";

/** Better Auth's session cookie name on http. */
export const SESSION_COOKIE = "better-auth.session_token";

/** A session token no database holds. */
const CANNED_TOKEN = "e2e-canned";

/**
 * The test-only `BETTER_AUTH_SECRET` CI's job and seeded.sh give every
 * server they start (.github/workflows/ci.yml): not a secret, and never on
 * a deployment. The process's own variable wins when it is set.
 */
export const TEST_ONLY_AUTH_SECRET = "ci-only-better-auth-secret-0123456789abcdef-not-real";

/**
 * The canned session cookie's value: the token signed the way Better Auth
 * signs its session cookie (HMAC-SHA256 under the server's secret, base64,
 * then URL-encoded). Better Auth checks the signature before it reads the
 * database, so an unsigned value would read as no session at all and send
 * the page to sign in; a signed one makes the read itself fail on a server
 * without a database, which is the state the page must say honestly.
 */
export function cannedSessionCookieValue(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? TEST_ONLY_AUTH_SECRET;
  const signature = createHmac("sha256", secret).update(CANNED_TOKEN).digest("base64");
  return encodeURIComponent(`${CANNED_TOKEN}.${signature}`);
}

/**
 * What a fresh account consents to, by stage, unless a spec names its own:
 * the stage's own categories and the private journal. Onboarding (task H1)
 * decides the real list; a spec that depends on it passes `categories`.
 */
const CONSENT_CATEGORIES: Readonly<Record<Stage, readonly string[]>> = {
  cycle: ["cycle.history", "cycle.symptoms", "journal.private"],
  pregnancy: ["pregnancy.overview", "cycle.symptoms", "journal.private"],
  postpartum: ["cycle.history", "cycle.symptoms", "journal.private"],
  none: ["journal.private"],
};

/** Whether the server has a database: unknown until a sign-in or a sign-up answers. */
let databaseBacked: boolean | undefined;

/**
 * Whether a sign-in or a sign-up has shown this worker a database: true or
 * false once one answered, undefined before. The per-flow fixtures read it
 * to pick the database-free branch, as the helpers' null answers do.
 */
export function serverHasDatabase(): boolean | undefined {
  return databaseBacked;
}

/** Each persona's cookies from one real sign-in, kept for the worker. */
const jar = new Map<Persona, Cookie[]>();

/** Fresh accounts made by this worker, so two in one millisecond still get distinct addresses. */
let made = 0;

export interface Account {
  email: string;
  password: string;
}

export interface FreshAccount extends Account {
  name: string;
  /** The session cookies, already in the page's context. */
  cookies: Cookie[];
}

/** The base URL's origin; `playwright.config.ts` always sets one (PLAYWRIGHT_BASE_URL, or port 3000). */
export function baseOrigin(): string {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("the Playwright config has no baseURL; set PLAYWRIGHT_BASE_URL");
  return new URL(base).origin;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * How long to wait out a 429: the seconds Better Auth names in its
 * `X-Retry-After` header (ten, its window, when it names none) and half a
 * second more.
 */
export function retryAfterMs(
  response: APIResponse | { headers(): Record<string, string> },
): number {
  const seconds = Number(response.headers()["x-retry-after"]);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 10) * 1000 + 500;
}

/**
 * Where the limiter's count per path is kept (./limiter.ts), one file per
 * server, outside the repository. A file and not memory, because Playwright
 * starts a new worker after a failed test and the server keeps counting
 * across that restart, and across runs a few seconds apart too. The suite
 * runs one worker (playwright.config.ts), so nothing writes it at once.
 */
function bucketFile(): string {
  return join(tmpdir(), `tidefern-e2e-limiter-${encodeURIComponent(baseOrigin())}.json`);
}

function readBuckets(): Record<string, Bucket> {
  try {
    return parseBuckets(readFileSync(bucketFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeBucket(path: string, bucket: Bucket): void {
  writeFileSync(bucketFile(), JSON.stringify({ ...readBuckets(), [path]: bucket }));
}

/** Every sign-in and sign-up request this worker sent, by limiter path, for the run's report. */
export const authRequests: string[] = [];

/**
 * Every 429 the limiter answered this worker, by path. The limiter must
 * never trip in a run (architecture 15): the pacing below keeps it from
 * happening, each one is printed where the run's log shows it, and the
 * per-flow suites assert none happened.
 */
export const rateLimited: string[] = [];

function noteRateLimited(path: string): void {
  rateLimited.push(path);
  console.warn(`[session] the limiter answered 429 for ${path}; waiting it out`);
}

/**
 * Waits until the limiter will take one more request on `path` and counts
 * it as sent. Every sign-in and sign-up this suite makes goes through here
 * first: the helpers' own calls, the sign-in form (`submitSignInForm`), and
 * the browser's calls in a context `paceBrowserAuth` watches.
 */
export async function paceAuthCall(path: string): Promise<void> {
  const slot = nextSlot(readBuckets()[path], Date.now());
  writeBucket(path, slot.next);
  authRequests.push(path);
  if (slot.waitMs > 0) await wait(slot.waitMs);
}

/** Contexts whose own sign-in and sign-up requests `paceBrowserAuth` already paces. */
const paced = new WeakSet<BrowserContext>();

/** After a 429 the server starts its count again with the retried request. */
function restartBucket(path: string): void {
  writeBucket(path, { count: 1, last: Date.now() });
}

/**
 * Paces the sign-in and sign-up requests the pages in a context send
 * themselves (a form submitted by a click), the same way as the helpers'
 * own. Other auth calls pass untouched. A spec that routes the same paths
 * registers its own routes after this one, which then win.
 */
export async function paceBrowserAuth(context: BrowserContext): Promise<void> {
  if (paced.has(context)) return;
  paced.add(context);
  context.on("response", (response) => {
    const path = limiterPath(response.url());
    if (path !== null && response.status() === 429) noteRateLimited(`${path} (browser)`);
  });
  await context.route("**/api/auth/**", async (route) => {
    const path = limiterPath(route.request().url());
    if (path !== null && route.request().method() === "POST") await paceAuthCall(path);
    await route.fallback();
  });
}

/** One request, paced, and once more after the wait the limiter names if it answered 429. */
async function patiently(path: string, call: () => Promise<APIResponse>): Promise<APIResponse> {
  await paceAuthCall(path);
  const first = await call();
  if (first.status() !== 429) return first;
  noteRateLimited(path);
  await wait(retryAfterMs(first));
  restartBucket(path);
  return call();
}

/** A JSON POST to Better Auth with the Origin it checks. `page.request` shares the context's cookies. */
function authPost(page: Page, path: string, data: unknown): Promise<APIResponse> {
  const origin = baseOrigin();
  return patiently(path, () =>
    page.request.post(`${origin}/api/auth${path}`, { data, headers: { origin } }),
  );
}

async function contextCookies(page: Page): Promise<Cookie[]> {
  return page.context().cookies(baseOrigin());
}

/** Adds the canned session cookie for a server without a database; always answers null. */
async function addCannedCookie(page: Page): Promise<null> {
  const cookies: Parameters<BrowserContext["addCookies"]>[0] = [
    { name: SESSION_COOKIE, value: cannedSessionCookieValue(), url: baseOrigin() },
  ];
  await page.context().addCookies(cookies);
  return null;
}

async function failure(what: string, response: APIResponse): Promise<Error> {
  const body = (await response.text()).slice(0, 200);
  return new Error(`${what} answered ${response.status()}: ${body}`);
}

/**
 * Signs an account in with its email and password and leaves the session
 * in the page's context. Null (and the canned cookie) on a server without a
 * database; throws on any other refusal.
 */
export async function signInAccount(page: Page, account: Account): Promise<Cookie[] | null> {
  if (databaseBacked === false) return addCannedCookie(page);
  const response = await authPost(page, "/sign-in/email", account);
  if (response.ok()) {
    databaseBacked = true;
    return contextCookies(page);
  }
  if (response.status() >= 500 && databaseBacked !== true) {
    databaseBacked = false;
    return addCannedCookie(page);
  }
  throw await failure(`signing in as ${account.email}`, response);
}

/**
 * Whether the session in the page's context is still live. GET /api/v1/me
 * answers 401 once the session was signed out or has expired; any other
 * answer (a failing server among them) leaves the decision to the spec.
 */
async function sessionIsLive(page: Page): Promise<boolean> {
  const response = await page.request.get(`${baseOrigin()}/api/v1/me`);
  return response.status() !== 401;
}

/**
 * Signs a seed persona in, or reuses the cookies this worker already holds
 * for it once they prove live, and adds them to the page's context. `fresh:
 * true` signs in again (for a mutation behind fresh authentication) and
 * keeps the new cookies; so does a kept session that was signed out since.
 * Null, with the canned cookie added, when the server has no database.
 */
export async function signInAs(
  page: Page,
  persona: Persona,
  options: { fresh?: boolean } = {},
): Promise<Cookie[] | null> {
  const cached = jar.get(persona);
  if (cached !== undefined && options.fresh !== true) {
    await page.context().addCookies(cached);
    if (await sessionIsLive(page)) return cached;
  }
  const cookies = await signInAccount(page, PERSONAS[persona]);
  if (cookies !== null) jar.set(persona, cookies);
  return cookies;
}

interface CapturedMessage {
  to: string;
  subject: string;
  link?: string;
}

/** The newest captured link sent to `email`; the capture keeps the last 20 messages for the process. */
async function capturedLink(page: Page, email: string): Promise<string> {
  const origin = baseOrigin();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.get(`${origin}${MAIL_CAPTURE_PATH}`);
    if (!response.ok()) throw await failure("reading the mail capture", response);
    const { messages } = (await response.json()) as { messages: CapturedMessage[] };
    const link = messages.filter((message) => message.to === email).at(-1)?.link;
    if (link !== undefined) return link;
    await wait(250);
  }
  throw new Error(`no captured mail reached ${email}`);
}

/**
 * Makes a verified account of the spec's own and signs it in: clears the
 * mail capture, signs up a unique `@example.test` address, follows the
 * verification link the capture holds for it, and signs in. The session
 * is left in the page's context. Null, with the canned cookie added, when
 * the server has no database.
 */
export async function freshAccount(
  page: Page,
  options: { name?: string; label?: string } = {},
): Promise<FreshAccount | null> {
  if (databaseBacked === false) return addCannedCookie(page);
  const origin = baseOrigin();
  const name = options.name ?? "Sam";
  made += 1;
  const email = `${options.label ?? "fresh"}-${Date.now()}-${made}@example.test`;
  const account = { email, password: FRESH_PASSWORD };

  const cleared = await page.request.delete(`${origin}${MAIL_CAPTURE_PATH}`);
  if (cleared.status() === 404) {
    throw new Error(
      `${MAIL_CAPTURE_PATH} is not mounted: start the server with E2E_MAIL_CAPTURE=true, off Vercel`,
    );
  }
  // The callback the sign-up form sends (`VERIFY_PATH` in src/lib/auth-client.ts).
  const signUp = await authPost(page, "/sign-up/email", {
    name,
    ...account,
    callbackURL: "/verify?done=1",
  });
  if (!signUp.ok()) {
    if (signUp.status() >= 500 && databaseBacked !== true) {
      databaseBacked = false;
      return addCannedCookie(page);
    }
    throw await failure(`signing up ${email}`, signUp);
  }
  databaseBacked = true;

  // The link lands on /verify?done=1 once Better Auth accepts the token, with `error=` when it does not.
  const verified = await page.request.get(await capturedLink(page, email));
  const landed = new URL(verified.url());
  if (!verified.ok() || landed.pathname !== "/verify" || landed.searchParams.has("error")) {
    throw new Error(`verifying ${email} landed on ${landed.pathname}${landed.search}`);
  }

  const cookies = await signInAccount(page, account);
  if (cookies === null) throw new Error(`signing in as ${email} found no database after sign-up`);
  return { ...account, name, cookies };
}

export interface OnboardOptions {
  stage: Stage;
  timeZone: string;
  displayName?: string;
  /** The consented categories; by default the stage's own and the private journal. */
  categories?: readonly string[];
}

/**
 * Gives the signed-in account its consent and then its profile, in the
 * order onboarding (task H1) writes them: `POST /api/v1/me/consents` with
 * the current consent text and terms versions, then `PUT
 * /api/v1/me/profile` with the age attestation. Returns the profile the
 * API answered with; throws when either write is refused.
 */
export async function onboard(page: Page, options: OnboardOptions): Promise<unknown> {
  const origin = baseOrigin();
  const consent = await page.request.post(`${origin}/api/v1/me/consents`, {
    data: {
      categories: options.categories ?? CONSENT_CATEGORIES[options.stage],
      textVersion: consentTextVersions.at(-1),
      termsVersion: TERMS_VERSION,
    },
    headers: { origin, "idempotency-key": randomUUID() },
  });
  if (consent.status() !== 201) throw await failure("recording the consent", consent);
  const profile = await page.request.put(`${origin}/api/v1/me/profile`, {
    data: {
      displayName: options.displayName ?? null,
      timeZone: options.timeZone,
      stage: options.stage,
      ageAttested: true,
    },
    headers: { origin },
  });
  if (!profile.ok()) throw await failure("creating the profile", profile);
  return profile.json();
}

/**
 * Fills the sign-in form on the page and submits it, waiting out one 429
 * (the limiter's count is shared with every sign-in in the run) and
 * submitting again. Resolves once the server answered a sign-in that was
 * not rate limited; the caller asserts where the page went.
 */
export async function submitSignInForm(page: Page, account: Account): Promise<void> {
  await page.getByLabel("Email").fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answer = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/sign-in/email",
    );
    if (!paced.has(page.context())) await paceAuthCall("/sign-in/email");
    await page.locator('form button[type="submit"]').click();
    const response = await answer;
    if (response.status() !== 429) return;
    noteRateLimited("/sign-in/email (form)");
    await wait(retryAfterMs(response));
    restartBucket("/sign-in/email");
  }
  throw new Error(`signing in as ${account.email} through the form was rate limited twice`);
}
