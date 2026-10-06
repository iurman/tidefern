import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import lockup from "@tidefern/design-tokens/brand/lockup.json";
import { describe, expect, it } from "vitest";
import manifest from "../../manifest";

// The generated files are committed, so these checks guard a regeneration
// that drifted from the spec in docs/design/ASSETS.md rather than the
// generator's own math. Paths are strings because jsdom's URL is not Node's.

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../..");
const publicDir = resolve(here, "../../../../public");
const brand = resolve(here, "../../../../../../packages/design-tokens/brand");

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), `${file} is a PNG`).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function icoSizes(file: string): number[] {
  const bytes = readFileSync(file);
  expect(bytes.readUInt16LE(2), "icon resource type").toBe(1);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const width = bytes.readUInt8(6 + index * 16);
    return width === 0 ? 256 : width;
  });
}

describe("brand rasters", () => {
  it("ships the favicon at 16, 32 and 48", () => {
    expect(icoSizes(resolve(app, "favicon.ico"))).toEqual([16, 32, 48]);
  });

  it("ships the apple icon at 180 and the social card at 1200 by 630", () => {
    expect(pngSize(resolve(app, "apple-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(pngSize(resolve(app, "opengraph-image.png"))).toEqual({ width: 1200, height: 630 });
  });

  it("has alt text for the social card that matches the lockup title", () => {
    const alt = readFileSync(resolve(app, "opengraph-image.alt.txt"), "utf8").trim();
    const svg = readFileSync(resolve(brand, "tidefern-lockup.svg"), "utf8");
    expect(alt.length).toBeGreaterThan(0);
    expect(svg).toContain(`<title id="lockup-title">${alt}</title>`);
  });

  it("lists every manifest PNG at the size it declares, with any and maskable purposes", () => {
    const icons = manifest().icons ?? [];
    const pngs = icons.filter((icon) => icon.type === "image/png");
    expect(pngs.length).toBeGreaterThanOrEqual(3);
    for (const icon of pngs) {
      const [w, h] = (icon.sizes ?? "").split("x").map(Number);
      expect(pngSize(resolve(publicDir, `.${icon.src}`)), icon.src).toEqual({
        width: w,
        height: h,
      });
    }
    const purposes = new Set(pngs.map((icon) => icon.purpose));
    expect(purposes.has("any")).toBe(true);
    expect(purposes.has("maskable")).toBe(true);
  });

  it("keeps the 1024 master as separable layers", () => {
    for (const layer of [
      "tidefern-icon-1024-background.png",
      "tidefern-icon-1024-foreground.png",
      "tidefern-icon-1024.png",
    ]) {
      expect(pngSize(resolve(brand, "master", layer)), layer).toEqual({
        width: 1024,
        height: 1024,
      });
    }
  });
});

describe("the lockup", () => {
  it("is outlined geometry, never live text, in both themes", () => {
    for (const file of ["tidefern-lockup.svg", "tidefern-lockup-dark.svg"]) {
      const svg = readFileSync(resolve(brand, file), "utf8");
      expect(svg, file).not.toMatch(/<text[\s>]/);
      expect(svg, file).not.toMatch(/font-family/);
      expect(svg, file).toContain(`viewBox="0 0 ${lockup.viewBox.width} ${lockup.viewBox.height}"`);
    }
  });

  it("records the clear space as the wordmark cap height", () => {
    expect(lockup.clearSpace).toBe(lockup.wordmark.capHeight);
    expect(lockup.wordmark.opticalSize).toBe(72);
    expect(lockup.wordmark.weight).toBe(500);
    expect(lockup.minimumWidth).toBe(120);
  });
});
