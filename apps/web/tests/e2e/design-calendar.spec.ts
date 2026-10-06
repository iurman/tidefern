import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/calendar";

for (const theme of ["light", "dark"] as const) {
  test(`the calendar chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });
}

test("the month grid moves focus with the APG keys and names today", async ({ page }) => {
  await page.goto(route);
  // The chapter renders sixteen grids, so hydration lands after load; the
  // first move is retried until the handlers are attached.
  await page.waitForLoadState("networkidle");
  const grid = page.getByRole("grid", { name: "October 2026" }).first();
  const today = grid.getByRole("button", { name: /^Today, Monday, October 5, 2026/ });
  await expect(today).toHaveAttribute("tabindex", "0");
  const tuesday = grid.getByRole("button", { name: /^Tuesday, October 6, 2026/ });
  await expect(async () => {
    await today.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tuesday).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("End");
  await expect(grid.getByRole("button", { name: /^Sunday, October 11, 2026/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(today).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grid.getByRole("button", { name: /^Monday, October 12, 2026/ })).toBeFocused();
});

test("a range starts on the first tap, ends on the second and swaps when earlier", async ({
  page,
}) => {
  await page.goto(route);
  const group = page.getByRole("group", { name: /^Days to share/ }).first();
  await group.getByRole("button", { name: /^Friday, October 9, 2026/ }).click();
  await expect(group.getByText("From Fri, Oct 9. Choose the last day.")).toBeVisible();
  await group.getByRole("button", { name: /^Wednesday, October 7, 2026/ }).click();
  await expect(group.getByText("Wed, Oct 7 to Fri, Oct 9, 3 days.")).toBeVisible();
  await expect(
    group.getByRole("button", { name: "Thursday, October 8, 2026, selected" }),
  ).toBeVisible();
  await expect(group.locator("[data-range-start]")).toHaveAttribute("data-day", "2026-10-07");
  await expect(group.locator("[data-range-middle]")).toHaveAttribute("data-day", "2026-10-08");
  await expect(group.locator("[data-range-end]")).toHaveAttribute("data-day", "2026-10-09");
});

test("the day list opens each day from a link and names today", async ({ page }) => {
  await page.goto(route);
  const list = page.getByRole("list", { name: "Days" }).first();
  const rows = list.getByRole("link");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Today");
  await expect(rows.first()).toHaveAttribute("href", "/log/2026-10-05");
});
