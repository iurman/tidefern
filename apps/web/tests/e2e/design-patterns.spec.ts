import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

for (const theme of ["light", "dark"] as const) {
  test(`the patterns chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, "/design/components/patterns", theme);
  });
}

test("the day sheet reveals the flow scale when a period is logged and keeps the note private", async ({
  page,
}) => {
  await page.goto("/design/components/patterns");
  const sheet = page.getByRole("dialog", { name: "Monday, Oct 5" }).first();
  await expect(sheet).toBeVisible();
  const emptySheet = page.locator("[data-theme='light'] dialog").last();
  await expect(emptySheet.getByRole("group", { name: "Flow" })).toHaveCount(0);
  const toggle = emptySheet.getByRole("switch", { name: "Period" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(emptySheet.getByRole("group", { name: "Flow" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /private/i })).toHaveCount(0);
});

test("the components index links every group page", async ({ page }) => {
  await page.goto("/design/components");
  for (const slug of ["actions", "forms", "structure", "calendar", "marks", "patterns"]) {
    const link = page.locator(`a[href="/design/components/${slug}"]`).first();
    await expect(link).toBeVisible();
  }
});

for (const path of ["/design/components/structure", "/design/components/patterns"]) {
  test(`${path} does not widen the page at phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}
