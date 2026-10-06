import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/actions";

for (const theme of ["light", "dark"] as const) {
  test(`the actions chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });
}

test("the chapter has one H1, the chapter rail and every specimen in both themes", async ({
  page,
}) => {
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Say what happened, and what to do next.",
  );
  await expect(page.getByRole("link", { name: "All components" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next: Forms" })).toBeVisible();
  const light = page.locator('main [data-theme="light"]');
  const dark = page.locator('main [data-theme="dark"]');
  await expect(light).toHaveCount(16);
  await expect(dark).toHaveCount(16);
  const html = await page.content();
  expect(html).not.toContain(String.fromCharCode(0x2014));
});

test("a loading button keeps its width and shows the loading text", async ({ page }) => {
  await page.goto(route);
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Button, primary" }),
  });
  const states = card.locator('[data-theme="light"] li');
  const idle = states.nth(0).getByRole("button");
  const loading = states.nth(5).getByRole("button");
  await expect(idle).toHaveText("Create an account");
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expect(loading).toHaveAccessibleName("Creating your account");
  const idleBox = await idle.boundingBox();
  const loadingBox = await loading.boundingBox();
  expect(idleBox?.height).toBe(48);
  expect(loadingBox?.width).toBeGreaterThanOrEqual((idleBox?.width ?? 0) - 1);
  const secondary = page
    .locator("section", { has: page.getByRole("heading", { name: "Button, secondary" }) })
    .locator('[data-theme="light"] li')
    .nth(0)
    .getByRole("button");
  expect((await secondary.boundingBox())?.height).toBe(44);
});

test("the disclosure opens with the keyboard and the chevron turns", async ({ page }) => {
  await page.goto(route);
  const chapterList = page.locator("details", { hasText: "In this chapter" });
  await expect(chapterList).not.toHaveAttribute("open", "");
  await chapterList.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(chapterList).toHaveAttribute("open", "");
  await expect(chapterList.getByRole("link", { name: "Token swatch" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(chapterList).not.toHaveAttribute("open", "");
});

test("a toast is dismissed from its button and the region collapses duplicates", async ({
  page,
}) => {
  await page.goto(route);
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Toast region" }),
  });
  const region = card
    .locator('[data-theme="light"]')
    .getByRole("region", { name: "Notifications" })
    .first();
  await expect(region.getByRole("status")).toHaveCount(2);
  await expect(region.getByText("A second toast for the same action, hidden.")).toHaveCount(0);
  await region.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(region.getByRole("status")).toHaveCount(1);
});

test("copy code reports Copied in visible text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(route);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Copy code" }) });
  const block = card.locator('[data-theme="light"] li').nth(0);
  await block.getByRole("button", { name: "Copy" }).click();
  await expect(block.getByRole("status")).toHaveText("Copied");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe('<Button variant="primary">Create an account</Button>');
  const failed = card.locator('[data-theme="light"] li').nth(6);
  await expect(failed.getByRole("status")).toContainText("Copy failed");
});

test("the token swatch prints the value the browser resolved, per theme", async ({ page }) => {
  await page.goto(route);
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Token swatch" }),
  });
  await expect(card.locator('[data-theme="light"] li').nth(0)).toContainText(/#35645d/i);
  await expect(card.locator('[data-theme="dark"] li').nth(0)).toContainText(/#8fc1b9/i);
  await expect(card.locator('[data-theme="light"] li').nth(6)).toContainText("Not set");
});

test("the moved toggles still drive the header", async ({ page }) => {
  await page.goto(route);
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await header.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await header.getByRole("button", { name: "Turn interface sounds off" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
  await header.getByRole("button", { name: "Turn interface sounds on" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sound", "all");
});

test("nothing on the chapter animates forever and the page reflows at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  const result = await page.evaluate(() => ({
    infinite: Array.from(document.querySelectorAll("*")).filter((element) =>
      getComputedStyle(element)
        .animationIterationCount.split(",")
        .some((count) => count.trim() === "infinite"),
    ).length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(result.infinite).toBe(0);
  expect(result.overflow).toBeLessThanOrEqual(0);
});
