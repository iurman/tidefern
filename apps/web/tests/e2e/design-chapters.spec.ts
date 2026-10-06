import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const repository = resolve(__dirname, "../../../..");

const routes = ["/design/color", "/design/motion", "/design/foundations"] as const;

interface ColorRole {
  name: string;
  light: string;
  dark: string;
}

/** The token file, read the way the contrast gate reads it. */
async function colorRoles(): Promise<Map<string, ColorRole>> {
  const file = resolve(repository, "packages/design-tokens/tokens.json");
  const tokens = JSON.parse(await readFile(file, "utf8")) as { colors: ColorRole[] };
  return new Map(tokens.colors.map((role) => [role.name, role]));
}

/** The gate's own contrast(), so the chapter is checked against the formula the build enforces. */
async function gateContrast(): Promise<(a: string, b: string) => number> {
  const script = pathToFileURL(resolve(repository, "packages/design-tokens/scripts/contrast.mjs"));
  const gate = (await import(script.href)) as { contrast: (a: string, b: string) => number };
  return gate.contrast;
}

async function infiniteAnimations(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll("*")).filter((element) =>
        getComputedStyle(element)
          .animationIterationCount.split(",")
          .some((count) => count.trim() === "infinite"),
      ).length,
  );
}

for (const route of routes) {
  for (const theme of ["light", "dark"] as const) {
    test(`${route} has no axe violations in ${theme} mode`, async ({ page }) => {
      await expectNoAxeViolations(page, route, theme);
    });
  }

  test(`${route} reads without JavaScript, with one H1 and the chapter rail`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Chapters", exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await context.close();
  });
}

test("the hub links every new chapter", async ({ page }) => {
  await page.goto("/design");
  for (const route of routes) {
    await expect(page.locator(`a[href="${route}"]`)).toHaveCount(1);
  }
});

test("the color plates resolve to the token file's values", async ({ page }) => {
  const roles = await colorRoles();
  await page.goto("/design/color");
  for (const [theme, name] of [
    ["light", "text"],
    ["dark", "accent"],
    ["light", "data-period"],
  ] as const) {
    const plate = page.locator(`#${theme}-${name}`);
    const declared = roles.get(name)?.[theme] ?? "";
    await expect(plate.locator("[data-resolved]")).toHaveText(declared.toUpperCase());
  }
});

test("the pairing checker prints the ratio the contrast gate computes", async ({ page }) => {
  const roles = await colorRoles();
  const contrast = await gateContrast();
  const accent = roles.get("accent");
  const panel = roles.get("panel");
  if (!accent || !panel) throw new Error("accent and panel must exist in tokens.json");
  const expected = contrast(accent.dark, panel.dark).toFixed(2);

  await page.goto("/design/color");
  const checker = page.locator("#checker").locator("..");
  await checker.getByLabel("Foreground role").selectOption("accent");
  await checker.getByLabel("Background role").selectOption("panel");
  await checker.getByRole("radio", { name: "Dark", exact: true }).check();
  const result = page.locator("[data-pairing-result]");
  await expect(result).toContainText("Measured from the painted preview");
  await expect(result).toContainText("in dark");
  await expect(result.locator("[data-pairing-ratio]")).toHaveAttribute(
    "data-pairing-ratio",
    expected,
  );
  await expect(result).toContainText(`${expected}:1`);
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the replay control re-runs a demo from the motion tokens", async ({ page }) => {
    await page.goto("/design/motion");
    await expect(page.locator("[data-reduced-motion]")).toHaveAttribute(
      "data-reduced-motion",
      "no-preference",
    );
    const demo = page.locator("#demo-disclosure");
    const subject = demo.locator("[data-subject]");
    await expect(subject).toHaveAttribute("data-run", "1");
    await subject.evaluate((element) => {
      (element as HTMLElement).dataset.marked = "first";
    });
    await demo.getByRole("button", { name: "Replay" }).click();
    await expect(subject).toHaveAttribute("data-run", "2");
    await expect(subject, "replay mounts a fresh subject").not.toHaveAttribute("data-marked");
    const timing = await subject.evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(timing.name).not.toBe("none");
    expect(timing.duration).not.toBe("0s");
  });

  test("the tide waits for a click, runs once and rests", async ({ page }) => {
    await page.goto("/design/motion");
    const tide = page.locator("#tide-demo");
    await expect(tide.locator('[data-tide-settle="once"]')).toHaveCount(0);
    await tide.getByRole("button", { name: "Run the tide" }).click();
    const line = tide.locator('[data-tide-settle="once"]');
    await expect(line).toHaveCount(1);
    const count = await line.evaluate(
      (element) => getComputedStyle(element).animationIterationCount,
    );
    expect(count).toBe("1");
  });
});

test("reduced motion is reported live and makes every demo instant", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/design/motion");
  await expect(page.locator("[data-reduced-motion]")).toHaveAttribute(
    "data-reduced-motion",
    "reduce",
  );
  await expect(page.locator("[data-reduced-motion]")).toContainText(
    "prefers-reduced-motion: reduce",
  );
  const duration = await page
    .locator("#demo-settle [data-subject]")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(duration).toBe("0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("[data-reduced-motion]")).toHaveAttribute(
    "data-reduced-motion",
    "no-preference",
  );
});

test("nothing animates forever on the three chapters, before or after a replay", async ({
  page,
}) => {
  for (const route of routes) {
    await page.goto(route);
    expect(await infiniteAnimations(page), route).toBe(0);
  }
  await page.goto("/design/motion");
  for (const button of await page.getByRole("button", { name: "Replay" }).all()) {
    await button.click();
  }
  await page.getByRole("button", { name: "Run the tide" }).click();
  expect(await infiniteAnimations(page)).toBe(0);
});

test("the checklist names every gate pnpm check runs", async ({ page }) => {
  const manifest = JSON.parse(await readFile(resolve(repository, "package.json"), "utf8")) as {
    scripts: { check: string };
  };
  const steps = manifest.scripts.check.split("&&").length;
  await page.goto("/design/foundations");
  const gates = page.locator("[data-gates] > li");
  expect(await gates.count()).toBeGreaterThanOrEqual(steps);
  await expect(page.locator("[data-gates]")).toContainText("pnpm tokens:contrast");
  await expect(page.locator("[data-gates]")).not.toContainText("Not yet described");
});

test("the three chapters reflow at 390 pixels without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, route).toBeLessThanOrEqual(0);
  }
});
