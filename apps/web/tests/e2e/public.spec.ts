import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AXE_TAGS, expectNoAxeViolations } from "./axe";

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

/* ------------------------------------------------------------------------ */
/* The public header's Sign in and its phone menu (task J3b)                 */
/* ------------------------------------------------------------------------ */

/** Counts the press drop (a triangle oscillator) the shared SoundProvider plays on a control. */
async function countPressCues(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const presses = { count: 0 };
    (window as unknown as { __presses: { count: number } }).__presses = presses;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when?: number) {
      if (this.type === "triangle") presses.count += 1;
      return start.call(this, when);
    };
  });
  return () =>
    page.evaluate(() => (window as unknown as { __presses: { count: number } }).__presses.count);
}

function overflowOf(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("the public header links Sign in on every public page, in the bar from desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of publicRoutes) {
    await page.goto(path);
    const header = page.getByRole("banner");
    const signIn = header.getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn, path).toBeVisible();
    await expect(signIn, path).toHaveAttribute("href", "/sign-in");
    await expect(header.getByRole("button", { name: "Menu" }), path).toBeHidden();
  }
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("on a phone the header's links sit behind a disclosure button that Escape closes", async ({
  page,
}) => {
  const presses = await countPressCues(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const header = page.getByRole("banner");
  const button = header.getByRole("button", { name: "Menu" });
  const signIn = header.getByRole("link", { name: "Sign in", exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  const menu = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
  await expect(menu).toBeHidden();
  await expect(signIn).toBeHidden();

  // A press before hydration does nothing, so try again until the menu says it is open.
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(menu).toBeVisible();
  await expect(signIn).toBeVisible();
  await expect(header.getByRole("link", { name: "Design system", exact: true })).toBeVisible();
  // The cue comes from the shared provider, which hears every button.
  await expect.poll(presses).toBeGreaterThan(0);
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations, `the open menu in ${theme}`).toEqual([]);
  }

  // Escape from a link inside closes it and puts focus back on the button.
  await signIn.focus();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  // A press outside closes it too; a link inside it navigates and leaves it closed.
  await button.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await signIn.click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("banner").getByRole("button", { name: "Menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/");
    const toggle = page.getByRole("banner").getByRole("button", { name: "Menu" });
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    expect(await overflowOf(page), `the open menu at ${width}`).toBeLessThanOrEqual(0);
  }
});

test("without JavaScript the phone header shows its links as a plain list", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 700 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Menu" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Design system", exact: true })).toBeVisible();
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});
