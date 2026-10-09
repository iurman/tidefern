import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations } from "./axe";
import { serverHasDatabase } from "./session";
import { signInRedirect, signInUrl } from "./sign-in-redirect";

/**
 * The (app) route group's frame against the production build: no public
 * header, the tab bar below 1024 px and the rail from it, the current
 * destination marked, the two policy links under every page, and a visitor
 * without a session sent to sign in. The group layout reads the session
 * through GET /api/v1/me in process, so the signed-in tests ask for Noor
 * from the per-worker fixture (./fixtures.ts, task J1), which signs her in
 * once for the worker: against a seeded server that is a real session;
 * without a database the read cannot answer and the shell renders for the
 * canned cookie with the always-on destinations. Nothing here is tagged
 * @smoke.
 */

const appRoutes = [
  { path: "/today", current: "Today" },
  { path: "/settings/sound", current: "Settings" },
] as const;

const healthLink = "Consumer Health Data Privacy Policy";

/** CSS locators, because role queries skip whichever navigation is hidden at this width. */
function shellNavigation(page: Page) {
  const main = page.locator("nav[aria-label='Main']");
  return { rail: main.first(), bar: main.last() };
}

test("an authenticated route shows no public header and keeps both policy links", async ({
  noor: page,
}) => {
  for (const route of appRoutes) {
    await page.goto(route.path);
    await expect(page, route.path).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole("banner"), route.path).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" }), route.path).toHaveCount(0);
    await expect(page.getByRole("main"), route.path).toHaveCount(1);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: healthLink, exact: true })).toHaveAttribute(
      "href",
      "/health-privacy",
    );
    await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute(
      "href",
      "/privacy",
    );
  }
});

test("the rail shows at 1440 px and the tab bar at 390 px, the current destination marked", async ({
  noor: page,
}) => {
  for (const route of appRoutes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route.path);
    const { rail, bar } = shellNavigation(page);
    await expect(rail, `${route.path} rail at 1440`).toBeVisible();
    await expect(bar, `${route.path} bar at 1440`).toBeHidden();
    await expect(rail.getByRole("link", { name: route.current, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rail.locator("[aria-current]")).toHaveCount(1);
    for (const always of ["Today", "Calendar", "Sharing", "Settings"]) {
      await expect(rail.getByRole("link", { name: always, exact: true })).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bar, `${route.path} bar at 390`).toBeVisible();
    await expect(rail, `${route.path} rail at 390`).toBeHidden();
    await expect(bar.getByRole("link", { name: route.current, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(bar.locator("[aria-current]")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route.path} never scrolls sideways at 390`).toBeLessThanOrEqual(0);
  }
});

test("the quick-log action shows on Today and nowhere else", async ({ noor: page }) => {
  const seeded = serverHasDatabase() === true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  const quickLog = shellNavigation(page).bar.getByRole("button", { name: "Log today" });
  if (seeded) {
    // Noor's stage is cycle, which logs days.
    await expect(quickLog).toBeVisible();
  } else {
    // Without a database the shell falls back to the none stage, which is never asked a body question.
    await expect(quickLog).toHaveCount(0);
  }
  await page.goto("/settings/sound");
  await expect(page.getByRole("button", { name: "Log today" })).toHaveCount(0);
});

test("a visitor without a session is sent to sign in before anything renders", async ({
  page,
  request,
}) => {
  for (const route of appRoutes) {
    const response = await request.get(route.path, { maxRedirects: 0 });
    expect(response.status(), route.path).toBe(307);
    expect(response.headers()["location"], route.path).toBe(signInRedirect(route.path));
    await page.goto(route.path);
    await expect(page, route.path).toHaveURL(signInUrl(route.path));
    await expect(page.getByRole("banner"), "sign-in keeps the public header").toHaveCount(1);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`today in the shell has no axe violations in ${theme} mode`, async ({ noor: page }) => {
    await expectNoAxeViolations(page, "/today", theme);
  });
}
