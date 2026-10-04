import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home renders the brand and links to the design system @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Life flows together.");
  await expect(page.getByRole("link", { name: "Tidefern home" })).toBeVisible();
  await page.getByRole("link", { name: "Explore the design system" }).click();
  await expect(page).toHaveURL(/\/design$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tokens first");
});

test("the API answers through the Next.js route handler @smoke", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toBe("private, no-store");
  expect(await health.json()).toMatchObject({ status: "ok", service: "tidefern-api" });
  const contract = await request.get("/api/v1/openapi.json");
  expect((await contract.json()).openapi).toBe("3.1.0");
  const missing = await request.get("/api/v1/does-not-exist");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("application/problem+json");
});

test("theme follows the system on first visit and remembers an explicit choice", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-source", "system");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-source", "user");
  await context.close();
});

test("interface sound can be turned off and the choice persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sound", "on");
  await page.getByRole("button", { name: "Turn interface sounds off" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
  await expect(page.getByRole("button", { name: "Turn interface sounds on" })).toBeVisible();
});

test("security headers and no indexing on previews", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  if (process.env.EXPECT_INDEXABLE !== "true") {
    expect(headers["x-robots-tag"]).toContain("noindex");
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`home and design pages have no axe violations in ${theme} mode`, async ({ page }) => {
    for (const path of ["/", "/design"]) {
      await page.goto(path);
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${path} in ${theme}`).toEqual([]);
    }
  });
}

test("the page reflows at 320 pixels without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("no audio context exists before a gesture and one shared context runs after a click", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const created: AudioContext[] = [];
    (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts = created;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        created.push(this);
      }
    } as typeof AudioContext;
  });
  await page.goto("/");
  await page.mouse.move(200, 200);
  await page.mouse.move(640, 300);
  const before = await page.evaluate(
    () => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.length,
  );
  expect(before, "hovering must not create an audio context").toBe(0);
  await page.getByRole("link", { name: "Explore the design system" }).hover();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  const after = await page.evaluate(() => {
    const contexts = (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts;
    return { count: contexts.length, state: contexts[0]?.state };
  });
  expect(after.count, "exactly one shared context after gestures").toBe(1);
  expect(after.state).toBe("running");
});
