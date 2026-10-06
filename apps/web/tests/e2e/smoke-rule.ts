import { test as base } from "@playwright/test";
import type { APIRequestContext, BrowserContext, TestInfo } from "@playwright/test";

/**
 * The rule that keeps `@smoke` honest: a smoke test runs against production
 * deployments, which hold no seeded users, so it never authenticates
 * (architecture 15). A spec that carries a `@smoke` test imports `test` from
 * this file instead of `@playwright/test`; the fixtures below watch every
 * smoke test and fail it when it reaches `/api/auth`, injects cookies or
 * storage state, or ends with a session cookie in any of its contexts. Tests
 * without the tag get the plain fixtures. Nothing here is itself tagged.
 *
 * How a violation is detected:
 *
 * - `context.on("request")` sees every request the browser makes for the
 *   test, including `fetch` from page scripts and routed (canned) requests,
 *   so a form that posts to `/api/auth/sign-in/email` is caught whether or
 *   not `page.route` answers it.
 * - The `request` fixture, `context.request` and `page.request` are wrapped
 *   so each HTTP method reports its URL before the call goes out.
 * - `context.addCookies` and `context.setStorageState` are wrapped the same
 *   way, and a `storageState` set through `test.use` is refused at setup.
 * - Every context the test gets is watched: the `context` fixture, and any
 *   the test opens itself through `browser.newContext()`, which the worker's
 *   `browser` fixture wraps while a smoke test runs.
 * - When a watched context closes, and again at teardown for one still open,
 *   its cookies are read: a cookie whose name carries Better Auth's prefix
 *   means a sign-in happened somewhere.
 */

export const SMOKE_TAG = "@smoke";

/** The path Better Auth is mounted on (`packages/api`), with every subpath. */
export const AUTH_PATH = "/api/auth";

/** Better Auth's default cookie prefix; the names are `better-auth.<name>`, with `__Secure-` in front on https. */
const SESSION_COOKIE_PREFIX = "better-auth";

export type ViolationKind = "auth-request" | "cookies-added" | "storage-state" | "session-cookie";

export interface SmokeViolation {
  kind: ViolationKind;
  detail: string;
}

/** Whether the rule applies: the test carries the tag, in its title or through the `tag` option. */
export function isSmokeTest(info: Pick<TestInfo, "tags">): boolean {
  return info.tags.includes(SMOKE_TAG);
}

/** Whether a URL (absolute, or a path resolved against `baseURL`) lands on the auth mount. */
export function isAuthUrl(url: string, baseURL?: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url, baseURL ?? "http://127.0.0.1").pathname;
  } catch {
    return false;
  }
  return pathname === AUTH_PATH || pathname.startsWith(`${AUTH_PATH}/`);
}

/** Whether a cookie name is one Better Auth sets. */
export function isSessionCookie(name: string): boolean {
  const bare = name.replace(/^__(Secure|Host)-/, "");
  return bare === SESSION_COOKIE_PREFIX || bare.startsWith(`${SESSION_COOKIE_PREFIX}.`);
}

const REQUEST_METHODS = ["fetch", "get", "post", "put", "patch", "delete", "head"] as const;

/**
 * Collects what a smoke test did that it must not. One per test; the
 * fixtures attach it to every context and request client the test gets, and
 * fail the test from the report at teardown.
 */
export class SmokeGuard {
  readonly violations: SmokeViolation[] = [];
  readonly #baseURL: string | undefined;
  /** Every context handed to `watchContext`, in order; each is inspected once. */
  readonly #contexts: BrowserContext[] = [];
  readonly #inspected = new WeakSet<BrowserContext>();

  constructor(baseURL?: string) {
    this.#baseURL = baseURL;
  }

  /** A request left the test, by any path; recorded when it targets the auth mount. */
  noteRequest(url: string): void {
    if (isAuthUrl(url, this.#baseURL)) {
      this.violations.push({ kind: "auth-request", detail: url });
    }
  }

  noteCookiesAdded(names: string[]): void {
    this.violations.push({ kind: "cookies-added", detail: names.join(", ") || "(none named)" });
  }

  noteStorageState(): void {
    this.violations.push({ kind: "storage-state", detail: "storageState was set" });
  }

  /**
   * Reads the cookies the context holds and records a session cookie. Once
   * per context: the close wrapper, the fixture and `finish()` may each ask,
   * and only the first look counts.
   */
  async inspectCookies(context: BrowserContext): Promise<void> {
    if (this.#inspected.has(context)) return;
    this.#inspected.add(context);
    const cookies = await context.cookies();
    for (const cookie of cookies) {
      if (isSessionCookie(cookie.name)) {
        this.violations.push({ kind: "session-cookie", detail: cookie.name });
      }
    }
  }

  /**
   * Watches a context: its requests, its cookie writes, its request client,
   * and its cookies at the moment it closes. Watching the same context twice
   * is a no-op, so the `context` fixture and the wrapped `browser.newContext`
   * can both hand over the fixture's context without double counting.
   */
  watchContext(context: BrowserContext): void {
    if (this.#contexts.includes(context)) return;
    this.#contexts.push(context);

    context.on("request", (request) => this.noteRequest(request.url()));

    const addCookies = context.addCookies.bind(context);
    context.addCookies = async (cookies) => {
      this.noteCookiesAdded(cookies.map((cookie) => cookie.name));
      return addCookies(cookies);
    };

    const setStorageState = context.setStorageState.bind(context);
    context.setStorageState = async (state) => {
      this.noteStorageState();
      return setStorageState(state);
    };

    // A context the test closes itself is gone before teardown, so its cookies are read on the way out.
    const close = context.close.bind(context);
    context.close = async (options) => {
      await this.inspectCookies(context);
      return close(options);
    };

    // `request` is a getter on the prototype; the instance gets its own that hands out the guarded client.
    const guarded = this.guardRequest(context.request);
    Object.defineProperty(context, "request", { value: guarded, configurable: true });
  }

  /** Wraps an API request client so every HTTP method reports its URL first. */
  guardRequest(client: APIRequestContext): APIRequestContext {
    return new Proxy(client, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (
          typeof property === "string" &&
          (REQUEST_METHODS as readonly string[]).includes(property) &&
          typeof value === "function"
        ) {
          return (url: unknown, ...rest: unknown[]) => {
            if (typeof url === "string") this.noteRequest(url);
            return (value as (...args: unknown[]) => unknown).call(target, url, ...rest);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /** Inspects every watched context the test left open; the fixture calls it at teardown. */
  async finish(): Promise<void> {
    for (const context of this.#contexts) {
      await this.inspectCookies(context);
    }
  }

  /** The failure message, or undefined when the test behaved. */
  report(): string | undefined {
    if (this.violations.length === 0) return undefined;
    const lines = this.violations.map((v) => `  ${v.kind}: ${v.detail}`);
    return [
      `A ${SMOKE_TAG} test must never authenticate: it runs against production deployments with no seeded users (architecture 15).`,
      "This test did the following:",
      ...lines,
      "Drop the tag, or make the test work without a session and without /api/auth.",
    ].join("\n");
  }
}

interface SmokeFixtures {
  /** The guard for this test; inert unless the test is tagged. */
  smokeGuard: SmokeGuard;
}

interface SmokeWorkerFixtures {
  /**
   * The guard of the smoke test running on this worker, or undefined between
   * tests and during an untagged one. The wrapped `browser.newContext` reads
   * it, so a context a smoke test opens itself is watched too.
   */
  smokeHook: { guard: SmokeGuard | undefined };
}

/**
 * `test` with the rule attached. The guard is an automatic fixture, so a
 * smoke test that uses neither `page` nor `request` is still checked, and
 * its teardown runs after the context's, which is when the cookie inspection
 * has happened. The fixture callbacks are named `provide` rather than
 * Playwright's customary `use`, because the web app's React hooks lint reads
 * `use` as a hook.
 */
export const test = base.extend<SmokeFixtures, SmokeWorkerFixtures>({
  smokeHook: [{ guard: undefined } as SmokeWorkerFixtures["smokeHook"], { scope: "worker" }],

  // Same worker scope as Playwright's own `browser` (an override may not change it). The browser is
  // shared by every test on the worker, so the wrapper stays and the hook decides per test.
  browser: [
    async ({ browser, smokeHook }, provide) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        smokeHook.guard?.watchContext(context);
        return context;
      };
      await provide(browser);
      browser.newContext = newContext;
    },
    { scope: "worker" },
  ],

  smokeGuard: [
    async ({ baseURL, smokeHook }, provide, testInfo) => {
      const guard = new SmokeGuard(baseURL);
      const tagged = isSmokeTest(testInfo);
      if (tagged) smokeHook.guard = guard;
      await provide(guard);
      smokeHook.guard = undefined;
      if (!tagged) return;
      await guard.finish();
      const report = guard.report();
      if (report) {
        throw new Error(report);
      }
    },
    { auto: true },
  ],

  storageState: async ({ storageState, smokeGuard }, provide, testInfo) => {
    if (isSmokeTest(testInfo) && storageState !== undefined) {
      smokeGuard.noteStorageState();
    }
    await provide(storageState);
  },

  // `smokeGuard` is listed first so the hook is in place when the base context is created; the
  // explicit call below keeps the result the same whichever order Playwright sets them up in.
  context: async ({ smokeGuard, context }, provide, testInfo) => {
    if (isSmokeTest(testInfo)) {
      smokeGuard.watchContext(context);
    }
    await provide(context);
    if (isSmokeTest(testInfo)) {
      await smokeGuard.inspectCookies(context);
    }
  },

  request: async ({ request, smokeGuard }, provide, testInfo) => {
    await provide(isSmokeTest(testInfo) ? smokeGuard.guardRequest(request) : request);
  },
});

export { expect } from "@playwright/test";
