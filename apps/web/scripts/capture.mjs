import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/**
 * Captures the routes that matter in both themes at desktop and phone widths.
 * Usage: start the production server, then
 *   QA_OUTPUT_DIR=docs/design/qa node scripts/capture.mjs
 * Defaults target http://127.0.0.1:3000 and write to ../../docs/design/qa/.
 */
const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const out =
  process.env.QA_OUTPUT_DIR ?? new URL("../../../docs/design/qa/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const routes = (process.env.QA_ROUTES ?? "/,/design").split(",");
const viewports = [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
];
const themes = ["light", "dark"];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
for (const route of routes) {
  for (const [label, width, height] of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
        reducedMotion: "reduce",
        extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {},
      });
      const page = await context.newPage();
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
      const file = `${out}/${slug}-${theme}-${label}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`captured ${file}`);
      await context.close();
    }
  }
}
await browser.close();
