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

test("the public pages say what is true today: the undo after sign-in, the phone menu, and who sees a child", async ({
  page,
}) => {
  // Review loop 1 (task J3e). Closing is undone by a step on the locked view
  // after signing in (H7), never by the sign-in alone.
  for (const path of ["/account/delete", "/design/foundations"]) {
    await page.goto(path);
    await expect(page.getByText("Until then, you can sign in and undo it.").first()).toBeVisible();
    await expect(page.getByText(/Signing in again before then cancels/)).toHaveCount(0);
  }
  // The header has had its phone menu since J3b, so it is no longer a known gap.
  await page.goto("/accessibility");
  await expect(page.getByRole("heading", { level: 2, name: "Known gaps" })).toBeVisible();
  await expect(page.getByText(/offers no\s+replacement/)).toHaveCount(0);
  // A child's record also reaches someone a guardian shares it with (the seed's Pia).
  await page.goto("/");
  await expect(
    page.getByText(/every guardian and by no one else until you share them/),
  ).toBeVisible();
  await expect(page.getByText(/every guardian and nobody else/)).toHaveCount(0);
  // The design hub's chapters are all published.
  await page.goto("/design");
  await expect(page.getByText(/planned structure/)).toHaveCount(0);
});

// Review loop 2 (task J3e): Tab scrolls a footer link only just into view,
// so at the foot of the page its ring (2px at 4px) lost its bottom edge to the
// screen. The root's scroll padding keeps room for the whole ring.
test("tabbing down to the footer shows the focused link's whole ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/account/delete");
  const footer = page.getByRole("contentinfo");
  const target = footer.getByRole("link", { name: "Privacy", exact: true });
  let reached = false;
  for (let step = 0; step < 60 && !reached; step++) {
    await page.keyboard.press("Tab");
    reached = await target.evaluate((link) => link === document.activeElement);
  }
  expect(reached, "Tab reaches the footer's Privacy link").toBe(true);
  const ring = await target.evaluate((link) => {
    const style = getComputedStyle(link);
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    return { bottom: link.getBoundingClientRect().bottom + reach, height: window.innerHeight };
  });
  expect(ring.bottom, "the ring's bottom edge is on the screen").toBeLessThanOrEqual(ring.height);
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

/**
 * The header's visible focusable elements, in source order (Tab order, as
 * none sets a positive tabindex), each paired with whether it paints after
 * the one before it: further along the same row, or on a lower row.
 */
function headerFocusOrder(page: Page) {
  return page.getByRole("banner").evaluate((banner) => {
    const focusable = [...banner.querySelectorAll<HTMLElement>("a[href], button, [tabindex]")]
      .filter((element) => element.tabIndex >= 0)
      .filter((element) => element.getClientRects().length > 0);
    return focusable.map((element, index) => {
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
      const tabindex = element.getAttribute("tabindex");
      if (index === 0) return { name, follows: true, tabindex };
      const before = focusable[index - 1]!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const lowerRow = box.top >= before.bottom - 1;
      const sameRowFurther = box.top < before.bottom && box.left >= before.right - 1;
      return { name, follows: lowerRow || sameRowFurther, tabindex };
    });
  });
}

async function expectHeaderFocusFollowsLayout(page: Page, label: string) {
  const order = await headerFocusOrder(page);
  expect(order.length, `${label}: the header has focusable controls`).toBeGreaterThan(2);
  for (const item of order) {
    expect(item.tabindex === null || Number(item.tabindex) <= 0, `${label}: ${item.name}`).toBe(
      true,
    );
    expect(
      item.follows,
      `${label}: ${item.name} paints after the control Tab visits before it`,
    ).toBe(true);
  }
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
  await expectHeaderFocusFollowsLayout(page, "1440");
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
  // The panel fades and slides in on the disclosure curve (DESIGN.md section 7); check it settled.
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
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
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expectHeaderFocusFollowsLayout(page, `the closed menu at ${width}`);
  }
});

test("the open menu button looks different from the closed one in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.getByRole("banner").getByRole("button", { name: "Menu" });
  await expect(button).toBeVisible();
  const bar = page.locator(".header-bar");
  const look = () =>
    button.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor };
    });
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const barBackground = await bar.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    if ((await button.getAttribute("aria-expanded")) === "true") await button.click();
    await page.mouse.move(0, 800);
    const closed = await look();
    await expect(async () => {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    // Away from the pointer, so the hover fill plays no part.
    await page.mouse.move(0, 800);
    await expect.poll(look, `the open button in ${theme} changes its fill`).not.toEqual(closed);
    const open = await look();
    expect(open.background, `the open fill in ${theme} differs from the bar`).not.toBe(
      barBackground,
    );
    expect(open.border, `the open border in ${theme} differs from the closed one`).not.toBe(
      closed.border,
    );
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
    await expectHeaderFocusFollowsLayout(page, "without JavaScript at 320");
  } finally {
    await context.close();
  }
});
