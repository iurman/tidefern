import { expect, test, type Cookie, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";
import {
  SESSION_COOKIE,
  cannedSessionCookieValue,
  freshAccount,
  onboard,
  signInAs,
  submitSignInForm,
  type Account,
} from "./session";

/**
 * The entry redirects and the shell-less (flow) group against the
 * production build (task G10): a signed-in person without a profile lands
 * on /welcome, outside the app shell, with the policy line and a working
 * sign-out; once she has a profile, /welcome sends her on to Today; and a
 * sign-in opened from an invitation link forwards the token to the sharing
 * screen's fragment, never a query.
 *
 * One fresh account made through the mail capture endpoint serves every
 * test (its cookies are passed on, so the file costs one sign-up and three
 * sign-ins), and no seeded persona changes. Against a server without a
 * database the helpers hand back null and the canned cookie, and each test
 * asserts the honest failure state instead. Nothing here is tagged @smoke.
 */

const healthLink = "Consumer Health Data Privacy Policy";

interface Shared {
  account: Account;
  cookies: Cookie[];
  onboarded: boolean;
}

/** The account the tests share, with the cookies of its latest session. */
let shared: Shared | undefined;

/** The shared account's session on this page: its cookies when it exists, a fresh account when not. */
async function sharedSession(page: Page): Promise<Shared | null> {
  if (shared !== undefined) {
    await page.context().addCookies(shared.cookies);
    return shared;
  }
  const made = await freshAccount(page, { label: "flow" });
  if (made === null) return null;
  shared = {
    account: { email: made.email, password: made.password },
    cookies: made.cookies,
    onboarded: false,
  };
  return shared;
}

/** The frame of the (flow) group: main, no rail or tab bar, no public header, the policy line. */
async function expectFlowFrame(page: Page) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("nav[aria-label='Main']")).toHaveCount(0);
  await expect(page.getByRole("banner")).toHaveCount(0);
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: healthLink, exact: true })).toHaveAttribute(
    "href",
    "/health-privacy",
  );
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await expect(footer.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(footer.locator("form")).toHaveAttribute("method", "post");
  await expect(footer.locator("form")).toHaveAttribute("action", "/sign-out");
}

async function expectNoOverflow(page: Page) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${page.url()} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("a signed-in person without a profile lands on /welcome, outside the shell, and can sign out", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const session = await sharedSession(page);
  await page.goto("/today");
  if (session === null) {
    // No database: the read fails, so the shell keeps the person and says so; /welcome says it too.
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByText(/could not load your profile just now/)).toBeVisible();
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");
    await expect(page.getByText("We could not load your account just now.")).toBeVisible();
    await expectFlowFrame(page);
    await expectNoOverflow(page);
    return;
  }

  // The profile-null redirect, from the shell's own entry point.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page).toHaveTitle("Welcome | Tidefern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");
  await expect(
    page.getByText("The steps that set up your account arrive here soon."),
  ).toBeVisible();
  await expectFlowFrame(page);
  await expectNoOverflow(page);

  // A POST, and the session is gone: home, and the flow sends a visitor to sign in.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in$/);

  // Signing in through the form lands on Today, which sends her on to /welcome.
  await submitSignInForm(page, session.account);
  await expect(page).toHaveURL(/\/welcome$/);
  session.cookies = await page.context().cookies();
});

for (const theme of ["light", "dark"] as const) {
  test(`/welcome has no axe violations in ${theme} mode at 1440 and 390`, async ({ page }) => {
    await sharedSession(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expectNoAxeViolations(page, "/welcome", theme);
      await expect(page).toHaveURL(/\/welcome$/);
    }
  });
}

test("once the consent and the profile are written, /welcome sends the person on to Today in the shell", async ({
  page,
}) => {
  const session = await sharedSession(page);
  if (session === null) {
    // No database, so nothing can be written and the session read keeps failing.
    await page.goto("/welcome");
    await expect(page.getByText("We could not load your account just now.")).toBeVisible();
    return;
  }
  if (!session.onboarded) {
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin" });
    session.onboarded = true;
  }
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator("nav[aria-label='Main']").first()).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);
});

test("a sign-in opened from an invitation link drops the token from the address bar and forwards it to /sharing", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // An account with a profile, so the shell keeps it on /sharing instead of sending it to /welcome.
  const session = await sharedSession(page);
  if (session !== null && !session.onboarded) {
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin" });
    session.onboarded = true;
  }
  await page.context().clearCookies();
  if (session === null) {
    // No database: the browser's own sign-in call is answered with the canned session, whose
    // read fails on this server, so /sharing keeps its address once that page exists.
    await page.route("**/api/auth/sign-in/email", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "set-cookie": `${SESSION_COOKIE}=${cannedSessionCookieValue()}; Path=/; HttpOnly`,
        },
        body: JSON.stringify({ redirect: false, token: "e2e-canned", user: { id: "canned" } }),
      }),
    );
  }

  await page.goto("/sign-in#invitation=abc");
  // Out of the address bar at once, path kept.
  await expect(page).toHaveURL(/\/sign-in$/);

  const landed = page.waitForURL(/\/sharing#invitation=abc$/, { waitUntil: "commit" });
  await submitSignInForm(
    page,
    session?.account ?? { email: "person@example.test", password: "not-checked" },
  );
  await landed;
  expect(new URL(page.url()).search, "the token never travels in a query").toBe("");
});

test("signInAs signs a seed persona in once for the worker, and again only when asked for fresh", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sessionToken = (cookies: Cookie[] | null) =>
    cookies?.find((cookie) => cookie.name.endsWith("session_token"))?.value;
  const first = await signInAs(page, "noor");
  await page.goto("/today");
  if (first === null) {
    // No database: the canned cookie, so the shell renders its failed-read notice.
    await expect(page.getByText(/could not load your profile just now/)).toBeVisible();
    return;
  }
  // Noor has a profile, so the shell keeps her on Today.
  await expect(page).toHaveURL(/\/today$/);

  // The worker's cookies come back without another sign-in.
  await page.context().clearCookies();
  const again = await signInAs(page, "noor");
  expect(sessionToken(again)).toBe(sessionToken(first));
  expect(sessionToken(await page.context().cookies())).toBe(sessionToken(first));
  await page.goto("/today");
  await expect(page).toHaveURL(/\/today$/);

  // A fresh sign-in is a new session, and the worker keeps that one from then on.
  const fresh = await signInAs(page, "noor", { fresh: true });
  expect(sessionToken(fresh)).not.toBe(sessionToken(first));
  expect(sessionToken(await signInAs(page, "noor"))).toBe(sessionToken(fresh));
  await page.goto("/today");
  await expect(page).toHaveURL(/\/today$/);
});
