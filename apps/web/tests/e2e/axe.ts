import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export type Theme = "light" | "dark";

/**
 * Opens a route, applies the theme the way the product does (the data-theme
 * attribute on the root) and asserts no WCAG 2.2 AA violation. Every design
 * chapter spec calls this for its own route, so the shared home spec never
 * grows a route list that several branches would edit at once.
 */
export async function expectNoAxeViolations(page: Page, path: string, theme: Theme) {
  await page.goto(path);
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, `${path} in ${theme}`).toEqual([]);
}
