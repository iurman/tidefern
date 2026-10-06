import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const publicRoutes = [
  "/",
  "/privacy",
  "/health-privacy",
  "/terms",
  "/accessibility",
  "/account/delete",
] as const;
const policyRoutes = ["/privacy", "/health-privacy", "/terms", "/accessibility"] as const;
const missingRoute = "/this-page-does-not-exist";
const healthLink = "Consumer Health Data Privacy Policy";

const titles: Record<(typeof publicRoutes)[number], string> = {
  "/": "Tidefern | Life flows together",
  "/privacy": "Privacy | Tidefern",
  "/health-privacy": "Consumer Health Data Privacy Policy | Tidefern",
  "/terms": "Terms | Tidefern",
  "/accessibility": "Accessibility | Tidefern",
  "/account/delete": "Delete your account | Tidefern",
};

for (const theme of ["light", "dark"] as const) {
  test(`every public page and the 404 have no axe violations in ${theme} mode`, async ({
    page,
  }) => {
    for (const path of [...publicRoutes, missingRoute]) {
      await expectNoAxeViolations(page, path, theme);
    }
  });
}

test("every public page carries the health privacy link by its required name and its title", async ({
  page,
}) => {
  for (const path of publicRoutes) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(titles[path]);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: healthLink, exact: true })).toHaveAttribute(
      "href",
      "/health-privacy",
    );
  }
});

test("the drafts and the deletion entry stay out of search", async ({ request }) => {
  for (const path of ["/terms", "/accessibility", "/account/delete"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), `${path} carries noindex`).toMatch(/noindex/);
  }
});

test("the home page renders the hero statement @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Life flows together.");
  await expect(
    page.getByRole("heading", { level: 2, name: "Shared only when you say so." }),
  ).toBeVisible();
});

test("the home page has one primary action and it creates an account", async ({ page }) => {
  await page.goto("/");
  const primary = page.locator("main [data-variant='primary']");
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveRole("link");
  await expect(primary).toHaveText("Create an account");
  await expect(primary).toHaveAttribute("href", "/sign-up");
});

test("the home tide settles once and rests", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto("/");
  const tides = page.locator("[data-tide-settle='once']");
  await expect(tides).toHaveCount(2);
  const motion = await tides.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      name: style.animationName,
      iterations: style.animationIterationCount,
      fill: style.animationFillMode,
      seconds: parseFloat(style.animationDuration),
    };
  });
  expect(motion.name).not.toBe("none");
  expect(motion.iterations).toBe("1");
  expect(motion.fill).toBe("forwards");
  expect(motion.seconds).toBeGreaterThan(0);
  expect(motion.seconds, "no automatic motion lasts longer than the tide").toBeLessThanOrEqual(9);
  await context.close();
});

test("at phone width the mark stacks above the tagline and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const hero = page.locator("section[aria-labelledby='hero-title']");
  const mark = hero.locator(".mark").first();
  const tagline = page.getByRole("heading", { level: 1 });
  const markBox = await mark.boundingBox();
  const taglineBox = await tagline.boundingBox();
  expect(markBox).not.toBeNull();
  expect(taglineBox).not.toBeNull();
  expect(markBox!.y + markBox!.height).toBeLessThanOrEqual(taglineBox!.y);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every public page and the 404 reflow at 320 pixels without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const measure = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  for (const path of [...publicRoutes, missingRoute]) {
    await page.goto(path);
    expect(await measure(), `${path} overflows at 320 px`).toBeLessThanOrEqual(0);
    const summary = page.locator("summary", { hasText: "Contents" });
    if ((await summary.count()) > 0) {
      await summary.click();
      expect(
        await measure(),
        `${path} overflows at 320 px with the contents open`,
      ).toBeLessThanOrEqual(0);
    }
  }
});

for (const path of policyRoutes) {
  test(`${path} has a sticky contents list whose links resolve to headings on the page`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByText("Draft, not yet reviewed")).toBeVisible();
    const contents = page.getByRole("navigation", { name: "Contents" });
    await expect(contents).toBeVisible();
    expect(await contents.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
    const links = contents.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < count; index += 1) {
      const href = await links.nth(index).getAttribute("href");
      expect(href, `link ${index} on ${path}`).toMatch(/^#[a-z-]+$/);
      const target = page.locator(href as string);
      await expect(target, `${href} on ${path}`).toHaveCount(1);
      await expect(target).toHaveRole("heading");
    }
    await links.last().click();
    await expect(page).toHaveURL(new RegExp(`${path}#[a-z-]+$`));
  });
}

test("on a phone the contents list is a disclosure that opens to the same links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/privacy");
  const summary = page.locator("summary", { hasText: "Contents" });
  await expect(summary).toBeVisible();
  const contents = page.getByRole("navigation", { name: "Contents" });
  await expect(contents).toBeHidden();
  await summary.click();
  await expect(contents).toBeVisible();
  await contents.getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(/\/privacy#contact$/);
  await expect(page.getByRole("heading", { level: 2, name: "Contact" })).toBeInViewport();
});

test("an unknown route answers 404 with the statement, one action and the footer link", async ({
  page,
}) => {
  const response = await page.goto(missingRoute);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That page is not here.");
  await expect(page.getByRole("link", { name: "Back to the start" })).toHaveAttribute("href", "/");
  await expect(page.locator("main [data-variant='primary']")).toHaveCount(1);
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: healthLink, exact: true }),
  ).toBeVisible();
});

test("/account/delete shows the signed-out action without a session", async ({ page, request }) => {
  await page.goto("/account/delete");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delete your account");
  await expect(page.getByText("locks it now and deletes it in 7 days")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(page.getByRole("link", { name: "Close my account" })).toHaveCount(0);
  const response = await request.get("/account/delete");
  expect(response.headers()["cache-control"], "the action depends on the session").toContain(
    "no-store",
  );
});
