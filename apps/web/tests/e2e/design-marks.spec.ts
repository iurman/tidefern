import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/marks";

for (const theme of ["light", "dark"] as const) {
  test(`the marks chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });

  test(`the marks chapter has no axe violations in ${theme} mode at phone width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoAxeViolations(page, route, theme);
  });
}

for (const width of [390, 320]) {
  test(`the marks chapter does not widen the page at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test("the ring draws the API's answer: dashed and dotted arcs for a first guess, none when cycles differ", async ({
  page,
}) => {
  await page.goto(route);
  const firstGuess = page
    .getByRole("region", { name: "Cycle ring, first guess", exact: true })
    .locator('[data-theme="light"] figure')
    .first();
  await expect(firstGuess.getByRole("img", { name: "Cycle day 12 of about 28" })).toBeVisible();
  await expect(firstGuess.locator("path[class*='predicted']")).toHaveCount(1);
  await expect(firstGuess.locator("path[class*='fertile']")).toHaveCount(1);
  await expect(firstGuess.locator("path[class*='logged']")).toHaveCount(0);
  await expect(
    firstGuess.getByText("around Oct 22, give or take 4 days.", { exact: false }),
  ).toBeVisible();
  const differ = page
    .getByRole("region", { name: "Cycle ring, not enough regular cycles", exact: true })
    .locator('[data-theme="light"] figure')
    .first();
  await expect(differ.getByRole("img", { name: "Cycle day 12" })).toBeVisible();
  await expect(differ.locator("path[class*='predicted']")).toHaveCount(0);
  await expect(differ.locator("path[class*='fertile']")).toHaveCount(0);
  await expect(differ.locator("path[class*='logged']")).toHaveCount(1);
});

test("the ring and the card are images named by their facts", async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Marks and charts");
  const ring = page.getByRole("img", { name: "Cycle day 12 of about 28" }).first();
  await expect(ring).toBeVisible();
  await expect(
    page.getByText("Based on your last 4 cycles, your next period will likely start").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Log 3 periods and Tidefern can start estimating").first(),
  ).toBeVisible();
  await expect(page.getByText("Weekly updates are paused.").first()).toBeVisible();
  await expect(page.getByText("110 days to go").first()).toBeVisible();
});

test("an expected row owns a dashed connector and a logged row a solid one", async ({ page }) => {
  await page.goto(route);
  const timeline = page.getByRole("region", { name: "Timeline", exact: true });
  const rows = timeline.getByRole("list", { name: "Milestones" }).first().getByRole("listitem");
  const connectorStyle = (index: number) =>
    rows.nth(index).evaluate((row) => getComputedStyle(row, "::before").borderLeftStyle);
  // Newest first: Nov 2 is expected, Oct 2 is logged.
  await expect(rows.nth(0)).toContainText("Expected");
  expect(await connectorStyle(0)).toBe("dashed");
  await expect(rows.nth(1)).not.toContainText("Expected");
  expect(await connectorStyle(1)).toBe("solid");
  // The journey list has two expectations in a row: both stretches are dashed,
  // and the last logged fact's connector stays solid.
  const journey = page.getByRole("region", { name: "Timeline, no warmth", exact: true });
  const journeyRows = journey
    .getByRole("list", { name: "Appointments" })
    .first()
    .getByRole("listitem");
  const journeyStyle = (index: number) =>
    journeyRows.nth(index).evaluate((row) => getComputedStyle(row, "::before").borderLeftStyle);
  expect(await journeyStyle(0)).toBe("dashed");
  expect(await journeyStyle(1)).toBe("dashed");
  expect(await journeyStyle(2)).toBe("solid");
});

test("the chart swaps its range in place without navigating", async ({ page }) => {
  await page.goto(route);
  const chart = page
    .getByRole("img", { name: /^Weight for age, since birth: 6 measurements/ })
    .first();
  await expect(chart).toBeVisible();
  // The radios are native, so a click before hydration checks one without
  // telling React; wait for the scripts, then retry the pair of clicks until
  // the chart's accessible name follows the range.
  await page.waitForLoadState("networkidle");
  const sinceBirth = page.getByRole("radio", { name: "Since birth" }).first();
  const lastThreeMonths = page.getByRole("radio", { name: "Last 3 months" }).first();
  const swapped = page
    .getByRole("img", { name: /^Weight for age, last 3 months: 2 measurements/ })
    .first();
  await expect(async () => {
    await sinceBirth.click();
    await lastThreeMonths.click();
    await expect(swapped).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(lastThreeMonths).toBeChecked();
  await expect(page).toHaveURL(new RegExp(`${route}$`));
  await expect(
    page.getByText("This is worth mentioning to your doctor or midwife.").first(),
  ).toBeVisible();
});
