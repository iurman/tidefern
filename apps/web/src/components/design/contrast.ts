import type { ColorKind } from "@tidefern/design-tokens";

/**
 * The WCAG 2.2 contrast formula for the color chapter, the same arithmetic
 * `packages/design-tokens/scripts/contrast.mjs` runs as a gate. The script
 * reads the token file and exits at import time, so a browser bundle cannot
 * import it; `contrast.test.ts` proves this copy agrees with the script's
 * export on every pairing the gate measures, which keeps the two from
 * drifting. Everything here is pure, so the server can print a ratio and
 * the client can re-measure it from the running stylesheet.
 */

/** The ratio each kind of role must reach on every surface it names (architecture 13.3). */
export const thresholds: Partial<Record<ColorKind, number>> = {
  text: 4.5,
  "on-fill": 4.5,
  ui: 3,
  data: 3,
};

/** The two AA lines the pairing checker reports against. */
export const AA_TEXT = 4.5;
export const AA_LARGE_AND_NON_TEXT = 3;

export function thresholdFor(kind: ColorKind): number | undefined {
  return thresholds[kind];
}

function channel(hex: string, index: number): number {
  const c = parseInt(hex.slice(index, index + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#RRGGBB` color. */
export function luminance(hex: string): number {
  const normalized = toHex(hex);
  if (!normalized) throw new Error(`Not an opaque color: ${hex}`);
  return (
    0.2126 * channel(normalized, 1) +
    0.7152 * channel(normalized, 3) +
    0.0722 * channel(normalized, 5)
  );
}

/** Contrast ratio between two opaque colors, 1 to 21, in either order. */
export function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FUNCTIONAL = /^rgba?\(\s*([^)]*)\)$/i;

/**
 * Normalizes a color the browser or the token file hands back to `#RRGGBB`
 * in upper case: `#abc`, `#AABBCC`, `rgb(1, 2, 3)`, `rgb(1 2 3)` and
 * `rgba(1, 2, 3, 1)`. Returns null for anything else, including a color
 * with alpha below 1, because a translucent color has no single contrast
 * ratio until it is composited.
 */
export function toHex(color: string): string | null {
  const value = color.trim();
  const digits = HEX.exec(value)?.[1];
  if (digits) {
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return `#${full.toUpperCase()}`;
  }
  const inner = FUNCTIONAL.exec(value)?.[1];
  if (inner === undefined) return null;
  const parts = inner
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const numbers = parts.map(Number);
  if (numbers.some((n) => Number.isNaN(n))) return null;
  const [r, g, b, alpha] = numbers;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (alpha !== undefined && alpha < 1) return null;
  const channels = [r, g, b];
  if (channels.some((n) => n < 0 || n > 255)) return null;
  return (
    "#" + channels.map((n) => Math.round(n).toString(16).padStart(2, "0").toUpperCase()).join("")
  );
}

/** "4.52:1", two decimals, the way the matrix prints it. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

export type Verdict = "passes" | "fails";

export function verdict(ratio: number, threshold: number): Verdict {
  return ratio >= threshold ? "passes" : "fails";
}

/** True when two hex values name the same color, whatever their case. */
export function sameColor(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = toHex(a);
  const right = toHex(b);
  return left !== null && left === right;
}
