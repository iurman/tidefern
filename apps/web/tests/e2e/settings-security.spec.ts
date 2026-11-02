import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";
import { expect, test } from "./fixtures";
import { signInUrl } from "./sign-in-redirect";

/**
 * The devices and two-step sign-in routes against the production build.
 * The settings layout reads the session through GET /api/v1/me in process,
 * so the signed-in tests ask for Noor from the per-worker fixture
 * (./fixtures.ts, task J1): against a seeded server (CI, task B11) that is
 * the worker's one real session for her; without a database the read
 * cannot answer and the layout renders for the canned cookie. Either way every call the pages make
 * to /api/auth is answered by page.route with a canned body, so the states
 * below never depend on real sessions. Nothing here is tagged @smoke.
 */

const routes = [
  { path: "/settings/devices", title: "Devices | Tidefern", heading: "Devices" },
  {
    path: "/settings/two-factor",
    title: "Two-step sign-in | Tidefern",
    heading: "Two-step sign-in",
  },
] as const;

const agents = {
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

// Noon UTC, so the calendar day is the same in every zone the suite might run in.
const current = {
  id: "s-current",
  token: "t-current",
  userId: "u1",
  createdAt: "2026-09-30T12:00:00Z",
  updatedAt: "2026-10-03T12:00:00Z",
  expiresAt: "2026-10-10T12:00:00Z",
  userAgent: agents.firefox,
  ipAddress: null,
};
const chrome = {
  ...current,
  id: "s-chrome",
  token: "t-chrome",
  updatedAt: "2026-10-01T12:00:00Z",
  userAgent: agents.chrome,
};
const safari = {
  ...current,
  id: "s-safari",
  token: "t-safari",
  updatedAt: "2026-10-05T12:00:00Z",
  userAgent: agents.safari,
};

const user = { id: "u1", email: "person@example.com", name: "Sam", emailVerified: true };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** A Better Auth refusal: `code` and `message` in the body. */
function refusal(route: Route, status: number, code: string, message: string) {
  return json(route, { code, message }, status);
}

/** The API's RFC 9457 problem, as `requireFreshAuth` answers a stale session (task C2). */
function freshAuthProblem(route: Route) {
  return route.fulfill({
    status: 401,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "urn:tidefern:problem:unauthenticated",
      title: "Sign in required",
      status: 401,
      code: "unauthenticated",
      instance: "/api/auth/revoke-session",
      detail: "fresh_authentication_required",
    }),
  });
}

interface Canned {
  sessions?: (typeof current)[];
  twoFactorEnabled?: boolean;
}

/**
 * The two reads every page starts with, on a page the fixture signed in as
 * Noor so the settings layout renders. Anything else under /api/auth
 * answers 500 unless a test routes it, so an unexpected call fails loudly
 * instead of reaching a server.
 */
async function signedIn(page: Page, canned: Canned = {}) {
  await page.route("**/api/auth/**", (route) =>
    refusal(route, 500, "UNEXPECTED", "This suite did not expect that call"),
  );
  await page.route("**/api/auth/get-session", (route) =>
    json(route, {
      session: current,
      user: { ...user, twoFactorEnabled: canned.twoFactorEnabled ?? false },
    }),
  );
  await page.route("**/api/auth/list-sessions", (route) =>
    json(route, canned.sessions ?? [chrome, current, safari]),
  );
}

/** The axe pass of ./axe on the page as it stands, for a step reached by the person's own actions. */
async function expectNoAxeViolationsHere(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, label).toEqual([]);
}

/** The innermost element that holds both a device's name and its own sign-out action: its row. */
function deviceRow(page: Page, browser: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(browser, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Sign out this device" }) })
    .last();
}

for (const theme of ["light", "dark"] as const) {
  test(`both security routes render with no axe violations in ${theme} mode`, async ({
    noor: page,
  }) => {
    await signedIn(page, { twoFactorEnabled: true });
    for (const route of routes) {
      await expectNoAxeViolations(page, route.path, theme);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
      // The client read has settled: a row on devices, the status on two-step sign-in.
      await expect(page.getByText(/Last seen|Two-step sign-in is on\./).first()).toBeVisible();
    }
  });
}

test("both routes carry their title, one H1, the settings shell and noindex", async ({
  noor: page,
}) => {
  await signedIn(page);
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("link", { name: "Settings", exact: true }).first()).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("a visitor without a cookie is sent to sign in before anything renders", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page).toHaveURL(signInUrl(route.path));
  }
});

test("a cookie that names no session sends the person to sign in from the first read", async ({
  noor: page,
}) => {
  await signedIn(page);
  await page.route("**/api/auth/list-sessions", (route) =>
    refusal(route, 401, "UNAUTHORIZED", "Unauthorized"),
  );
  await page.goto("/settings/devices");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signedIn(page);
  await page.route("**/api/auth/get-session", (route) => json(route, null));
  await page.goto("/settings/two-factor");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a list that needs a fresh sign-in shows that step, not a reload", async ({ noor: page }) => {
  await signedIn(page);
  // Better Auth's own freshness rule on list-sessions (freshAge, one day by default).
  await page.route("**/api/auth/list-sessions", (route) =>
    refusal(route, 403, "SESSION_NOT_FRESH", "Session is not fresh"),
  );
  await page.goto("/settings/devices");
  const status = page.getByRole("status").filter({ hasText: "Sign in again" });
  await expect(status).toContainText("needs a recent sign-in");
  await expect(status).toHaveAttribute("data-tone", "error");
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(page.getByRole("button", { name: "Reload" })).toHaveCount(0);
  await expect(page.getByText("could not load your devices")).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/devices$/);
});

test("a failed read of this browser's session is a failed load, not a list of strangers", async ({
  noor: page,
}) => {
  await signedIn(page);
  await page.route("**/api/auth/get-session", (route) =>
    refusal(route, 500, "INTERNAL_SERVER_ERROR", "Internal error"),
  );
  await page.goto("/settings/devices");
  await expect(page.getByRole("status")).toContainText("We could not load your devices");
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.getByText("Chrome on Windows")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out this device" })).toHaveCount(0);
});

test("devices lists every session as a device row, this browser first", async ({ noor: page }) => {
  await signedIn(page);
  await page.goto("/settings/devices");
  const names = page.locator("p", {
    hasText: /Firefox on Linux|Chrome on Windows|Safari on iPhone/,
  });
  await expect(names).toHaveText([/Firefox on Linux/, /Safari on iPhone/, /Chrome on Windows/]);
  await expect(page.getByText("This browser")).toHaveCount(1);
  await expect(page.getByText("Last seen Oct 3")).toBeVisible();
  await expect(page.getByText("Last seen Oct 5")).toBeVisible();
  await expect(page.getByText("Last seen Oct 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out 2 other devices" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out this device" })).toHaveCount(3);
});

test("revoking a device asks first and shows the fresh sign-in step when the server refuses", async ({
  noor: page,
}) => {
  const bodies: string[] = [];
  await signedIn(page);
  await page.route("**/api/auth/revoke-session", (route) => {
    bodies.push(route.request().postData() ?? "");
    return freshAuthProblem(route);
  });
  await page.goto("/settings/devices");
  const chromeRow = deviceRow(page, "Chrome on Windows");
  await chromeRow.getByRole("button", { name: "Sign out this device" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Sign out this device?" })).toBeVisible();
  await expect(dialog).toContainText("Chrome on Windows");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(bodies).toHaveLength(0);

  await chromeRow.getByRole("button", { name: "Sign out this device" }).click();
  await dialog.getByRole("button", { name: "Sign out the device" }).click();
  await expect(dialog).toBeHidden();
  const status = page.getByRole("status").filter({ hasText: "Sign in again" });
  await expect(status).toContainText("needs a sign-in from the last ten minutes");
  await expect(status).toHaveAttribute("data-tone", "error");
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0] ?? "{}")).toEqual({ token: "t-chrome" });
  // The list is still there; nothing pretended the device was signed out.
  await expect(page.getByText("Chrome on Windows")).toBeVisible();
});

test("revoking a device shows its pending state and keeps the dialog open on a server failure", async ({
  noor: page,
}) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await signedIn(page);
  await page.route("**/api/auth/revoke-session", async (route) => {
    await held;
    await refusal(route, 500, "INTERNAL_SERVER_ERROR", "Internal error");
  });
  await page.goto("/settings/devices");
  const safariRow = deviceRow(page, "Safari on iPhone");
  await safariRow.getByRole("button", { name: "Sign out this device" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.locator("button").last();
  await confirm.click();
  await expect(confirm).toHaveAttribute("aria-busy", "true");
  await expect(confirm).toContainText("Signing out");
  release?.();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-live="polite"]')).toContainText("on our side");
  await expect(confirm).not.toHaveAttribute("aria-busy", "true");
});

test("signing out the other devices confirms, then shows only this device", async ({
  noor: page,
}) => {
  let calls = 0;
  await signedIn(page);
  await page.route("**/api/auth/revoke-other-sessions", (route) => {
    calls += 1;
    return json(route, { status: true });
  });
  await page.goto("/settings/devices");
  await page.getByRole("button", { name: "Sign out 2 other devices" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Sign out 2 other devices?" })).toBeVisible();
  // The list the next read answers: only this browser remains.
  await page.route("**/api/auth/list-sessions", (route) => json(route, [current]));
  await dialog.getByRole("button", { name: "Sign out 2 devices" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "signed out" })).toContainText(
    "2 devices are signed out.",
  );
  await expect(page.getByText("Firefox on Linux")).toBeVisible();
  await expect(page.getByText("Chrome on Windows")).toHaveCount(0);
  await expect(page.getByText("Only this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: /other device/ })).toHaveCount(0);
  expect(calls).toBe(1);
});

test("two-step sign-in moves from the password through the code to the backup codes shown once", async ({
  noor: page,
}) => {
  const enableBodies: string[] = [];
  const verifyBodies: string[] = [];
  let verifyCalls = 0;
  const totpURI =
    "otpauth://totp/Tidefern:person%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Tidefern&period=30&digits=6";
  const backupCodes = ["aaaaa-11111", "bbbbb-22222", "ccccc-33333"];
  await signedIn(page, { twoFactorEnabled: false });
  await page.route("**/api/auth/two-factor/enable", (route) => {
    enableBodies.push(route.request().postData() ?? "");
    return json(route, { method: "totp", totpURI, backupCodes });
  });
  await page.route("**/api/auth/two-factor/verify-totp", (route) => {
    verifyBodies.push(route.request().postData() ?? "");
    verifyCalls += 1;
    return verifyCalls === 1
      ? refusal(route, 401, "INVALID_CODE", "Invalid code")
      : json(route, { token: "new", user });
  });
  await page.goto("/settings/two-factor");
  await expect(page.getByRole("heading", { name: "Two-step sign-in is off" })).toBeVisible();
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();

  // The password step: the field takes focus because the button that opened it has gone.
  const password = page.locator('input[name="password"]');
  await expect(password).toBeFocused();
  await password.fill("correct horse battery");
  await page.getByRole("button", { name: "Continue" }).click();

  // The scan step: a QR drawn in the browser, the setup key behind a disclosure, the code field.
  await expect(page.getByRole("heading", { name: "Scan this code" })).toBeVisible();
  // The password form is gone, so the code field takes focus on mount; it is read before
  // the disclosure below is opened, because that summary takes focus when it is pressed.
  const code = page.locator('input[name="code"]');
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");
  const qr = page.getByRole("img", { name: "QR code for your authenticator app" });
  await expect(qr).toBeVisible();
  expect(Number(await qr.getAttribute("data-modules"))).toBeGreaterThan(21);
  await page.getByText("Cannot scan it?").click();
  await expect(page.locator("pre[aria-label='Setup key']")).toContainText(
    "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  );
  await expect(page.locator("pre[aria-label='Setup link']")).toContainText("otpauth://totp/");
  expect(JSON.parse(enableBodies[0] ?? "{}")).toMatchObject({
    password: "correct horse battery",
    issuer: "Tidefern",
  });
  // The step with the new structure (the drawn code, the open disclosure, two copy blocks, the field).
  await expectNoAxeViolationsHere(page, "the scan step with the disclosure open");
  await code.fill("000 000");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  // Filtered, because each copy block on the step carries its own status region.
  await expect(
    page.getByRole("status").filter({ hasText: "That code did not match" }),
  ).toBeVisible();
  await code.fill("123 456");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();

  // The backup codes, once, with the sentence that says so; the region holds focus.
  await expect(page.getByRole("heading", { name: "Two-step sign-in is on" })).toBeVisible();
  await expect(page.getByText("These backup codes are shown once.")).toBeVisible();
  const codes = page.locator("pre[aria-label='Backup codes']");
  await expect(codes).toContainText("aaaaa-11111");
  await expect(codes).toContainText("ccccc-33333");
  await expect(page.locator(":focus")).toContainText("shown once");
  await expectNoAxeViolationsHere(page, "the backup codes step with its focused region");
  // Spaces stripped, and never a `trustDevice` (architecture 6.1).
  expect(verifyBodies.map((body) => JSON.parse(body))).toEqual([
    { code: "000000" },
    { code: "123456" },
  ]);
  await page.getByRole("button", { name: "I have saved them" }).click();
  await expect(page.getByText("aaaaa-11111")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Two-step sign-in is on." }),
  ).toBeVisible();
  await expect(page.locator(":focus")).toContainText("Two-step sign-in is on.");
  await expect(page.getByRole("button", { name: "Turn off two-step sign-in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make new backup codes" })).toBeVisible();
  expect(verifyCalls).toBe(2);
});

test("two-step sign-in turns off with the password and names a wrong one", async ({
  noor: page,
}) => {
  let calls = 0;
  await signedIn(page, { twoFactorEnabled: true });
  await page.route("**/api/auth/two-factor/disable", (route) => {
    calls += 1;
    return calls === 1
      ? refusal(route, 400, "INVALID_PASSWORD", "Invalid password")
      : json(route, { status: true });
  });
  await page.goto("/settings/two-factor");
  await expect(page.getByText("Two-step sign-in is on.")).toBeVisible();
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Turn off two-step sign-in?" })).toBeVisible();
  await page.locator('input[name="password"]').fill("wrong");
  await page.getByRole("button", { name: "Turn it off" }).click();
  await expect(page.getByRole("status")).toContainText("That password did not match");
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Turn it off" }).click();
  await expect(page.getByRole("status")).toContainText("Two-step sign-in is off.");
  await expect(page.getByRole("heading", { name: "Two-step sign-in is off" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on two-step sign-in" })).toBeVisible();
  expect(calls).toBe(2);
});

test("new backup codes need the password and are shown once", async ({ noor: page }) => {
  await signedIn(page, { twoFactorEnabled: true });
  await page.route("**/api/auth/two-factor/generate-backup-codes", (route) =>
    json(route, { status: true, backupCodes: ["ddddd-44444", "eeeee-55555"] }),
  );
  await page.goto("/settings/two-factor");
  await page.getByRole("button", { name: "Make new backup codes" }).click();
  await expect(page.getByRole("heading", { name: "New backup codes" })).toBeVisible();
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Make new codes" }).click();
  await expect(page.getByRole("heading", { name: "Your new backup codes" })).toBeVisible();
  await expect(page.getByText("These backup codes are shown once.")).toBeVisible();
  await expect(page.locator("pre[aria-label='Backup codes']")).toContainText("ddddd-44444");
  await page.getByRole("button", { name: "I have saved them" }).click();
  await expect(page.getByText("ddddd-44444")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Your new backup codes are in place.");
});

test("a stale sign-in on two-step sign-in points at signing in again", async ({ noor: page }) => {
  await signedIn(page, { twoFactorEnabled: true });
  await page.route("**/api/auth/two-factor/disable", (route) =>
    refusal(route, 403, "SESSION_NOT_FRESH", "Session is not fresh"),
  );
  await page.goto("/settings/two-factor");
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Turn it off" }).click();
  await expect(page.getByRole("status")).toContainText("Sign in again, then come back here.");
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(page.locator("form")).toHaveCount(0);
  // Still on, because nothing changed.
  await expect(page.getByText("Two-step sign-in is on.")).toBeVisible();
});

test("the security routes reflow at 320 px without a horizontal scroll", async ({ noor: page }) => {
  await signedIn(page, { twoFactorEnabled: true });
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByText(/Last seen|Two-step sign-in is on\./).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, route.path).toBeLessThanOrEqual(0);
  }
});
