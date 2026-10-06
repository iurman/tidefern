import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

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
  await expect(page.locator("html")).toHaveAttribute("data-sound", "all");
  await page.getByRole("button", { name: "Turn interface sounds off" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
  await expect(page.getByRole("button", { name: "Turn interface sounds on" })).toBeVisible();
});

test("security headers and no indexing on previews", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  const scriptSrc =
    csp.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
  expect(scriptSrc, "scripts run only with the per-request nonce").toMatch(
    /'nonce-[A-Za-z0-9+/=]+'/,
  );
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("unsafe-inline");
  const second = (await request.get("/")).headers()["content-security-policy"] ?? "";
  expect(second, "every request gets a fresh nonce").not.toBe(csp);
  const api = (await request.get("/api/v1/health")).headers()["content-security-policy"] ?? "";
  expect(api).toContain("default-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  if (process.env.EXPECT_INDEXABLE !== "true") {
    expect(headers["x-robots-tag"]).toContain("noindex");
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`home and design pages have no axe violations in ${theme} mode`, async ({ page }) => {
    for (const path of ["/", "/design", "/design/type"]) {
      await expectNoAxeViolations(page, path, theme);
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
    // Automation grants sticky activation to a fresh page, which a real first
    // visit never has, so the mount-time fast path is held back to test the
    // gesture path the way a person meets it.
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false, isActive: false },
    });
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

test("the system theme applies without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(15, 26, 23)");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Life flows together.");
  await context.close();
});

test("nothing animates forever", async ({ page }) => {
  await page.goto("/");
  const infinite = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("*")).filter((element) =>
        getComputedStyle(element)
          .animationIterationCount.split(",")
          .some((count) => count.trim() === "infinite"),
      ).length,
  );
  expect(infinite).toBe(0);
});

test("every public page links the health privacy policy by its required name @smoke", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(
    footer.getByRole("link", { name: "Consumer Health Data Privacy Policy" }),
  ).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  for (const path of ["/privacy", "/health-privacy"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html, `${path} stays out of search while a draft`).toMatch(/noindex/);
  }
  await page.goto("/health-privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Consumer Health Data Privacy Policy",
  );
  await expect(page.getByText("Draft, not yet reviewed")).toBeVisible();
});

test("the type chapter renders the specimens in both faces", async ({ page }) => {
  await page.goto("/design/type");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Two faces, each with one job.");
  const wordmark = page.locator(".specimen-wordmark").first();
  await expect(wordmark).toHaveText("Tidefern");
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    const family = (selector: string) =>
      getComputedStyle(document.querySelector(selector) as Element).fontFamily;
    const loaded = (pattern: RegExp) =>
      Array.from(document.fonts).some(
        (face) => pattern.test(face.family) && face.status === "loaded",
      );
    return {
      wordmark: family(".specimen-wordmark"),
      body: family(".specimen-reading"),
      numeric: getComputedStyle(document.querySelector(".numeral-column.tabular") as Element)
        .fontVariantNumeric,
      newsreaderLoaded: loaded(/newsreader/i),
      figtreeLoaded: loaded(/figtree/i),
    };
  });
  expect(families.wordmark).toMatch(/newsreader/i);
  expect(families.body).toMatch(/figtree/i);
  expect(families.newsreaderLoaded).toBe(true);
  expect(families.figtreeLoaded).toBe(true);
  expect(families.numeric).toBe("tabular-nums");
  await expect(page.getByRole("link", { name: "Previous: Design system" })).toBeVisible();
});
