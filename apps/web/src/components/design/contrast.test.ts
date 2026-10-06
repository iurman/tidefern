// @vitest-environment node
import { designTokens } from "@tidefern/design-tokens";
import { describe, expect, it } from "vitest";
import {
  AA_LARGE_AND_NON_TEXT,
  AA_TEXT,
  contrast,
  formatRatio,
  luminance,
  sameColor,
  thresholdFor,
  toHex,
  verdict,
} from "./contrast";

// The gate's own formula. The script measures the token file when imported and
// prints its summary; it never exits unless a pairing fails, which pnpm check
// would already have caught.
import { contrast as gateContrast } from "../../../../../packages/design-tokens/scripts/contrast.mjs";

const byName = new Map(designTokens.colors.map((token) => [token.name, token]));

function surfaceValue(name: string, theme: "light" | "dark"): string {
  const surface = byName.get(name);
  if (!surface) throw new Error(`Unknown surface ${name}`);
  return surface[theme];
}

describe("contrast", () => {
  it("agrees with the gate script on every pairing it measures, in both themes", () => {
    let pairings = 0;
    for (const token of designTokens.colors) {
      if (!thresholdFor(token.kind)) continue;
      for (const theme of ["light", "dark"] as const) {
        for (const surface of token.on ?? []) {
          const mine = contrast(token[theme], surfaceValue(surface, theme));
          const gate = gateContrast(token[theme], surfaceValue(surface, theme));
          expect(mine, `${theme} ${token.name} on ${surface}`).toBe(gate);
          pairings += 1;
        }
      }
    }
    expect(pairings).toBeGreaterThan(0);
  });

  it("is symmetric and bounded", () => {
    expect(contrast("#000000", "#FFFFFF")).toBe(21);
    expect(contrast("#FFFFFF", "#000000")).toBe(21);
    expect(contrast("#808080", "#808080")).toBe(1);
  });

  it("accepts the rgb() form the browser hands back", () => {
    expect(contrast("rgb(31, 53, 48)", "rgb(247, 245, 239)")).toBe(contrast("#1F3530", "#F7F5EF"));
    expect(luminance("rgb(255, 255, 255)")).toBe(1);
  });

  it("refuses a color it cannot measure", () => {
    expect(() => contrast("transparent", "#FFFFFF")).toThrow(/opaque/);
  });
});

describe("toHex", () => {
  it("normalizes hex and functional notations to upper case #RRGGBB", () => {
    expect(toHex("#abc")).toBe("#AABBCC");
    expect(toHex(" #35645d ")).toBe("#35645D");
    expect(toHex("rgb(53, 100, 93)")).toBe("#35645D");
    expect(toHex("rgb(53 100 93)")).toBe("#35645D");
    expect(toHex("rgba(53, 100, 93, 1)")).toBe("#35645D");
    expect(toHex("rgb(53 100 93 / 1)")).toBe("#35645D");
  });

  it("returns null for translucent or unknown colors", () => {
    expect(toHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(toHex("rgba(53, 100, 93, 0.5)")).toBeNull();
    expect(toHex("transparent")).toBeNull();
    expect(toHex("oklch(0.5 0.1 180)")).toBeNull();
    expect(toHex("")).toBeNull();
    expect(toHex("rgb(300, 0, 0)")).toBeNull();
  });
});

describe("verdicts and formatting", () => {
  it("prints two decimals the way the matrix does", () => {
    expect(formatRatio(4.5)).toBe("4.50:1");
    expect(formatRatio(contrast("#1F3530", "#F7F5EF"))).toMatch(/^\d+\.\d\d:1$/);
  });

  it("passes at the threshold and fails below it", () => {
    expect(verdict(4.5, AA_TEXT)).toBe("passes");
    expect(verdict(4.49, AA_TEXT)).toBe("fails");
    expect(verdict(3, AA_LARGE_AND_NON_TEXT)).toBe("passes");
  });

  it("knows which kinds the gate measures", () => {
    expect(thresholdFor("text")).toBe(4.5);
    expect(thresholdFor("on-fill")).toBe(4.5);
    expect(thresholdFor("ui")).toBe(3);
    expect(thresholdFor("data")).toBe(3);
    expect(thresholdFor("surface")).toBeUndefined();
    expect(thresholdFor("decorative")).toBeUndefined();
  });

  it("compares colors by value, not by spelling", () => {
    expect(sameColor("#35645d", "rgb(53, 100, 93)")).toBe(true);
    expect(sameColor("#35645D", "#8FC1B9")).toBe(false);
    expect(sameColor(null, "#8FC1B9")).toBe(false);
  });
});
