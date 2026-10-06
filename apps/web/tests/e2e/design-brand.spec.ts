import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const assets = [
  ["/favicon.ico", "image/x-icon"],
  ["/apple-icon.png", "image/png"],
  ["/opengraph-image.png", "image/png"],
  ["/icons/icon-192.png", "image/png"],
  ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-512-maskable.png", "image/png"],
  ["/brand/tidefern-lockup.svg", "image/svg+xml"],
  ["/brand/tidefern-lockup-dark.svg", "image/svg+xml"],
] as const;

test("every brand asset is served with its image type", async ({ request }) => {
  for (const [path, type] of assets) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(type);
  }
});

test("the manifest lists the raster icons with any and maskable purposes", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as { icons: { src: string; purpose?: string }[] };
  const purposes = manifest.icons.filter((icon) => icon.src.startsWith("/icons/"));
  expect(purposes.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
});

test("the home page carries the static social card", async ({ page }) => {
  await page.goto("/");
  const image = page.locator('meta[property="og:image"]');
  await expect(image).toHaveAttribute("content", /opengraph-image/);
  const alt = page.locator('meta[property="og:image:alt"]');
  await expect(alt).toHaveAttribute("content", "Tidefern. Life flows together.");
});

test("the brand chapter renders every image and offers the downloads", async ({ page }) => {
  await page.goto("/design/brand");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const images = page.locator("img");
  const count = await images.count();
  expect(count).toBeGreaterThan(20);
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await expect(image, `image ${index}`).toHaveJSProperty("complete", true);
    expect(
      await image.evaluate((el: HTMLImageElement) => el.naturalWidth),
      `image ${index}`,
    ).toBeGreaterThan(0);
  }
  const downloads = page.locator("a[download]");
  expect(await downloads.count()).toBeGreaterThanOrEqual(13);
  await expect(page.getByText("Pending the owner's approval.", { exact: true })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`the brand chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, "/design/brand", theme);
  });
}
