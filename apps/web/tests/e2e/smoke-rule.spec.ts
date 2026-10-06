import { SmokeGuard, expect, isAuthUrl, isSessionCookie, isSmokeTest, test } from "./smoke-rule";

/**
 * The detector behind the smoke rule, tested on its own: the pure checks,
 * the guard against a real context and request client (routed so nothing
 * here needs a database), and the fixture end to end through two tests that
 * carry the tag, break the rule on purpose and are expected to fail.
 */

const CANNED = { status: 200, contentType: "application/json", body: "null" };

test.describe("the pure checks", () => {
  test("the tag is read from the test's tags", () => {
    expect(isSmokeTest({ tags: ["@smoke"] })).toBe(true);
    expect(isSmokeTest({ tags: ["@slow", "@smoke"] })).toBe(true);
    expect(isSmokeTest({ tags: [] })).toBe(false);
    expect(isSmokeTest({ tags: ["@smokey"] })).toBe(false);
  });

  test("the auth mount is matched by path, with or without an origin", () => {
    expect(isAuthUrl("/api/auth")).toBe(true);
    expect(isAuthUrl("/api/auth/get-session")).toBe(true);
    expect(isAuthUrl("/api/auth/sign-in/email?x=1")).toBe(true);
    expect(isAuthUrl("http://127.0.0.1:3151/api/auth/sign-out")).toBe(true);
    expect(isAuthUrl("api/auth/get-session", "http://127.0.0.1:3151/")).toBe(true);
    expect(isAuthUrl("/api/v1/health")).toBe(false);
    expect(isAuthUrl("/api/authors")).toBe(false);
    expect(isAuthUrl("/sign-in")).toBe(false);
    expect(isAuthUrl("https://example.test/api/auth")).toBe(true);
    expect(isAuthUrl("not a url at all", "also not")).toBe(false);
  });

  test("a session cookie is one with Better Auth's prefix, secure or not", () => {
    expect(isSessionCookie("better-auth.session_token")).toBe(true);
    expect(isSessionCookie("__Secure-better-auth.session_token")).toBe(true);
    expect(isSessionCookie("__Host-better-auth.session_data")).toBe(true);
    expect(isSessionCookie("better-auth")).toBe(true);
    expect(isSessionCookie("theme")).toBe(false);
    expect(isSessionCookie("better-auth-like")).toBe(false);
    expect(isSessionCookie("_vercel_jwt")).toBe(false);
  });

  test("the report names every violation and stays empty for a clean test", () => {
    const clean = new SmokeGuard("http://127.0.0.1:3151");
    clean.noteRequest("/api/v1/health");
    expect(clean.violations).toEqual([]);
    expect(clean.report()).toBeUndefined();

    const guilty = new SmokeGuard("http://127.0.0.1:3151");
    guilty.noteRequest("/api/auth/get-session");
    guilty.noteCookiesAdded(["better-auth.session_token"]);
    guilty.noteStorageState();
    expect(guilty.violations.map((v) => v.kind)).toEqual([
      "auth-request",
      "cookies-added",
      "storage-state",
    ]);
    const report = guilty.report() ?? "";
    expect(report).toContain("@smoke");
    expect(report).toContain("auth-request: /api/auth/get-session");
    expect(report).toContain("cookies-added: better-auth.session_token");
    expect(report).toContain("storage-state");
  });
});

test.describe("the guard on a real context", () => {
  // These tests are not tagged, so the fixtures leave their own context alone
  // and the guard under test is attached by hand to a fresh one.
  test("sees page navigations, page scripts and routed requests to the auth mount", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const guard = new SmokeGuard(baseURL);
    guard.watchContext(context);
    await context.route("**/api/auth/**", (route) => route.fulfill(CANNED));
    const page = await context.newPage();

    await page.goto("/");
    expect(guard.violations).toEqual([]);

    await page.evaluate(() => fetch("/api/auth/get-session"));
    expect(guard.violations.map((v) => v.kind)).toEqual(["auth-request"]);
    expect(guard.violations[0]?.detail).toMatch(/\/api\/auth\/get-session$/);

    await page.goto("/api/auth/get-session");
    expect(guard.violations).toHaveLength(2);

    await context.close();
  });

  test("sees cookies added and storage state set through Playwright", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const guard = new SmokeGuard(baseURL);
    guard.watchContext(context);

    await context.addCookies([{ name: "remembered", value: "yes", url: baseURL ?? "" }]);
    expect(guard.violations).toEqual([{ kind: "cookies-added", detail: "remembered" }]);
    expect((await context.cookies()).map((c) => c.name)).toEqual(["remembered"]);

    await context.setStorageState({ cookies: [], origins: [] });
    expect(guard.violations.map((v) => v.kind)).toEqual(["cookies-added", "storage-state"]);

    await context.close();
  });

  test("finds a session cookie the context ended with", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const guard = new SmokeGuard(baseURL);
    await context.addCookies([
      { name: "theme", value: "dark", url: baseURL ?? "" },
      { name: "better-auth.session_token", value: "not-a-real-token", url: baseURL ?? "" },
    ]);
    await guard.inspectCookies(context);
    expect(guard.violations).toEqual([
      { kind: "session-cookie", detail: "better-auth.session_token" },
    ]);
    await context.close();
  });

  test("inspects a watched context once, at the finish or when it closes", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const guard = new SmokeGuard(baseURL);
    guard.watchContext(context);
    guard.watchContext(context);
    await context.route("**/api/auth/**", (route) => route.fulfill(CANNED));
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => fetch("/api/auth/get-session"));
    await context.addCookies([
      { name: "better-auth.session_token", value: "not-a-real-token", url: baseURL ?? "" },
    ]);
    // Watching twice records the request once; the session cookie waits for an inspection.
    expect(guard.violations.map((v) => v.kind)).toEqual(["auth-request", "cookies-added"]);

    await guard.finish();
    expect(guard.violations.map((v) => v.kind)).toEqual([
      "auth-request",
      "cookies-added",
      "session-cookie",
    ]);

    // Neither the close nor a second finish looks again.
    await context.close();
    await guard.finish();
    expect(guard.violations).toHaveLength(3);

    const closedByTheTest = await browser.newContext();
    guard.watchContext(closedByTheTest);
    await closedByTheTest.addCookies([
      { name: "better-auth.session_data", value: "not-real-either", url: baseURL ?? "" },
    ]);
    await closedByTheTest.close();
    expect(guard.violations.slice(3)).toEqual([
      { kind: "cookies-added", detail: "better-auth.session_data" },
      { kind: "session-cookie", detail: "better-auth.session_data" },
    ]);
  });

  test("wraps the request client, the context's and the page's", async ({
    browser,
    request,
    baseURL,
  }) => {
    const guard = new SmokeGuard(baseURL);
    const guarded = guard.guardRequest(request);
    const health = await guarded.get("/api/v1/health");
    expect(health.status()).toBe(200);
    expect(guard.violations).toEqual([]);

    // Recorded before the call goes out, whatever the server answers.
    await guarded.get("/api/auth/get-session", { failOnStatusCode: false });
    expect(guard.violations).toEqual([{ kind: "auth-request", detail: "/api/auth/get-session" }]);

    const context = await browser.newContext();
    guard.watchContext(context);
    const page = await context.newPage();
    await context.request.head("/api/auth/ok", { failOnStatusCode: false });
    await page.request.post("/api/auth/sign-out", { failOnStatusCode: false });
    expect(guard.violations.map((v) => v.detail)).toEqual([
      "/api/auth/get-session",
      "/api/auth/ok",
      "/api/auth/sign-out",
    ]);
    await context.close();
  });
});

test.describe("the fixture", () => {
  test("leaves an untagged test alone even when it reaches the auth mount", async ({
    page,
    smokeGuard,
  }) => {
    await page.route("**/api/auth/**", (route) => route.fulfill(CANNED));
    await page.goto("/");
    await page.evaluate(() => fetch("/api/auth/get-session"));
    expect(smokeGuard.violations).toEqual([]);
  });

  test("leaves a context an untagged test opens itself alone", async ({
    browser,
    baseURL,
    smokeGuard,
  }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "better-auth.session_token", value: "not-a-real-token", url: baseURL ?? "" },
    ]);
    await context.close();
    expect(smokeGuard.violations).toEqual([]);
  });

  // The tagged tests in this file break the rule on purpose. Each checks
  // what the guard recorded first, so a detector that saw nothing fails the
  // test outright, and only then declares the test expected to fail, which
  // Playwright reports as passed once the rule throws at teardown and as a
  // failure if the rule lets the test through. Each makes one routed request
  // that never leaves the browser, so they are as safe on a deployment as any
  // other smoke test.
  test("fails a tagged test that calls the auth mount @smoke", async ({ page, smokeGuard }) => {
    await page.route("**/api/auth/**", (route) => route.fulfill(CANNED));
    await page.goto("/");
    await page.evaluate(() => fetch("/api/auth/get-session"));
    expect(smokeGuard.violations.map((v) => v.kind)).toEqual(["auth-request"]);
    test.fail(true, "the smoke rule must fail this test at teardown");
  });

  test("fails a tagged test that signs in through a context of its own @smoke", async ({
    browser,
    baseURL,
    smokeGuard,
  }) => {
    const context = await browser.newContext();
    await context.route("**/api/auth/**", (route) => route.fulfill(CANNED));
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => fetch("/api/auth/get-session"));
    await context.addCookies([
      { name: "better-auth.session_token", value: "not-a-real-token", url: baseURL ?? "" },
    ]);
    await context.close();
    expect(smokeGuard.violations.map((v) => v.kind)).toEqual([
      "auth-request",
      "cookies-added",
      "session-cookie",
    ]);
    test.fail(true, "the smoke rule must fail this test at teardown");
  });
});
