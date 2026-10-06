import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/structure";

for (const theme of ["light", "dark"] as const) {
  test(`the structure chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });
}

test("the structure chapter renders one H1 and the shell switches by its own width", async ({
  page,
}) => {
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Structure and overlays");
  expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
  const demo = page.locator("#shell-demo");
  // CSS locators, because role queries skip whichever navigation is hidden at this width.
  const rail = demo.locator("nav").first();
  const bar = demo.locator("nav").last();
  await expect(rail).toBeVisible();
  await expect(bar).toBeHidden();
  await expect(rail.getByRole("link", { name: "Journey" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Family" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bar).toBeVisible();
  await expect(rail).toBeHidden();
  await expect(bar.getByRole("button", { name: "Log today" })).toBeVisible();
  const shellOverflow = await demo.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(shellOverflow, "the shell itself never scrolls sideways").toBeLessThanOrEqual(0);
});

// The specimens render the same panels inline, so the live ones are scoped to their section.
test("the dialog opens in the top layer behind the scrim, closes on Escape and returns focus", async ({
  page,
}) => {
  await page.goto(route);
  const demo = page.locator("#overlay-demo");
  const trigger = demo.getByRole("button", { name: "Open the dialog" });
  await trigger.click();
  const dialog = demo.getByRole("dialog", { name: "Send the invitation?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const layer = await dialog.evaluate((element) => {
    const backdrop = getComputedStyle(element, "::backdrop");
    return {
      modal: element.matches(":modal"),
      position: getComputedStyle(element).position,
      opacity: backdrop.opacity,
      background: backdrop.backgroundColor,
    };
  });
  expect(layer.modal).toBe(true);
  expect(layer.position).toBe("fixed");
  expect(Number(layer.opacity)).toBeCloseTo(0.4, 2);
  expect(layer.background, "the scrim is the page color, not transparent").not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the sheet sits on the bottom edge at phone width, closes from its visible close button and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  const demo = page.locator("#overlay-demo");
  const trigger = demo.getByRole("button", { name: "Open the sheet" });
  await trigger.click();
  const sheet = demo.getByRole("dialog", { name: "Sunday, Oct 5" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  const geometry = await sheet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector("[class*='body']");
    return {
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      overscroll: body ? getComputedStyle(body).overscrollBehaviorY : null,
    };
  });
  expect(geometry.bottom).toBe(844);
  expect(geometry.left).toBe(0);
  expect(geometry.width).toBe(390);
  expect(geometry.overscroll).toBe("contain");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a grant switch flips in one press and a withdraw card carries no link", async ({ page }) => {
  await page.goto(route);
  const control = page.getByRole("switch", { name: "Cycle status" }).first();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control).toHaveText("Off");
  const invitation = page.getByRole("article", { name: "Jo" }).first();
  expect(await invitation.getByRole("link").count()).toBe(0);
  await expect(invitation.getByRole("button", { name: "Withdraw" })).toBeVisible();
});
