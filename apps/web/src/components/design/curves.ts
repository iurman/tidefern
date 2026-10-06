/**
 * Easing curves for the motion chapter. An easing token is a CSS string
 * (`cubic-bezier(0.2, 0.8, 0.2, 1)` or a keyword such as `ease`); this
 * module turns it into control points so the chapter can draw the curve the
 * stylesheet runs, and compare the four side by side.
 */

export interface Bezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The keyword curves as CSS Easing Functions Level 1 defines them. */
export const keywordCurves = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  "ease-in": { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  "ease-out": { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  "ease-in-out": { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
} satisfies Record<string, Bezier>;

const keywords: Record<string, Bezier | undefined> = keywordCurves;

const CUBIC = /^cubic-bezier\(\s*([^)]*)\)$/i;

/** Control points for a keyword or a `cubic-bezier()` string; null for anything else. */
export function parseEasing(value: string): Bezier | null {
  const trimmed = value.trim();
  const keyword = keywords[trimmed.toLowerCase()];
  if (keyword) return keyword;
  const match = CUBIC.exec(trimmed);
  if (!match) return null;
  const numbers = (match[1] ?? "").split(",").map((part) => Number(part.trim()));
  const [x1, y1, x2, y2] = numbers;
  if (
    numbers.length !== 4 ||
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    numbers.some((n) => Number.isNaN(n))
  ) {
    return null;
  }
  // CSS requires the x control points inside the unit interval; y may overshoot.
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return { x1, y1, x2, y2 };
}

/** A point on the curve at parameter t (0 to 1): x is time, y is progress. */
export function bezierPoint(curve: Bezier, t: number): { x: number; y: number } {
  const u = 1 - t;
  const a = 3 * u * u * t;
  const b = 3 * u * t * t;
  const c = t * t * t;
  return { x: a * curve.x1 + b * curve.x2 + c, y: a * curve.y1 + b * curve.y2 + c };
}

/**
 * An SVG path for the curve inside a square of `size` units with the origin
 * at the bottom left, so the drawing reads like the usual easing graph: time
 * runs right, progress runs up.
 */
export function easingPath(curve: Bezier, size: number, steps = 48): string {
  const points: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const { x, y } = bezierPoint(curve, index / steps);
    const px = (x * size).toFixed(2);
    const py = ((1 - y) * size).toFixed(2);
    points.push(`${index === 0 ? "M" : "L"}${px} ${py}`);
  }
  return points.join(" ");
}

/** Progress (0 to 1) reached at a fraction of the duration, by bisection on the x axis. */
export function progressAt(curve: Bezier, time: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  let low = 0;
  let high = 1;
  let t = time;
  for (let index = 0; index < 40; index += 1) {
    const { x } = bezierPoint(curve, t);
    if (Math.abs(x - time) < 1e-9) break;
    if (x < time) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return bezierPoint(curve, t).y;
}
