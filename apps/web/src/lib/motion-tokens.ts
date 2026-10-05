import { designTokens } from "@tidefern/design-tokens";

/**
 * The motion contract from architecture 13.6, read from the design tokens so
 * the app and the /design/motion chapter cannot disagree. Durations are
 * numbers in milliseconds; easings are the CSS strings the stylesheet uses.
 * A missing token throws at import time, so a renamed token fails the build
 * instead of silently falling back.
 */

const motion = new Map(designTokens.motion.map((token) => [token.name, token.value]));

function required(name: string): string {
  const value = motion.get(name);
  if (!value) throw new Error(`Missing motion token ${name}`);
  return value;
}

function milliseconds(name: string): number {
  const value = required(name);
  if (value.endsWith("ms")) return Number(value.slice(0, -2));
  if (value.endsWith("s")) return Number(value.slice(0, -1)) * 1000;
  throw new Error(`Motion token ${name} has no time unit: ${value}`);
}

export const durations = {
  /** Hover and press feedback. */
  feedback: milliseconds("duration-feedback"),
  /** Expand and collapse. */
  disclosure: milliseconds("duration-disclosure"),
  /** A view settling into place after a navigation the person started. */
  settle: milliseconds("duration-settle"),
  /** The decorative tide on the marketing page, and nothing else. */
  tide: milliseconds("duration-tide"),
} as const;

export const easings = {
  /** Small controlled movement. */
  interface: required("ease-interface"),
  /** A view arriving after navigation. */
  settle: required("ease-settle"),
  /** Content expansion and collapse. */
  disclosure: required("ease-disclosure"),
  /** The tide only. */
  tide: required("ease-tide"),
} as const;

/** Nothing automatic lasts longer than this (WCAG 2.2.2); the browser test checks it. */
export const LONGEST_AUTOMATIC_MOTION_MS = 5000;

/**
 * True when the person asked for less motion. Every element then reaches its
 * final state at once; nothing is hidden and nothing waits on an animation.
 * Safe to call during server rendering, where it reports false.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
