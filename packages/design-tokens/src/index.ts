import tokens from "../tokens.json" with { type: "json" };

export type Theme = "light" | "dark";

export type ColorKind = "surface" | "text" | "fill" | "on-fill" | "ui" | "data" | "decorative";

export interface ColorToken {
  name: string;
  label: string;
  light: string;
  dark: string;
  use: string;
  kind: ColorKind;
  /** Surfaces this role is measured against by pnpm tokens:contrast. */
  on?: string[];
}

export interface ValueToken {
  name: string;
  label?: string;
  value: string;
  use?: string;
  meaning?: string;
}

export interface DesignTokens {
  palette: ValueToken[];
  colors: ColorToken[];
  type: ValueToken[];
  weight: ValueToken[];
  leading: ValueToken[];
  tracking: ValueToken[];
  spacing: ValueToken[];
  radius: ValueToken[];
  size: ValueToken[];
  breakpoint: ValueToken[];
  elevation: ValueToken[];
  motion: ValueToken[];
  sound: ValueToken[];
}

export const designTokens: DesignTokens = tokens as DesignTokens;

export function colorValue(name: string, theme: Theme): string {
  const token = designTokens.colors.find((color) => color.name === name);
  if (!token) throw new Error(`Unknown color token: ${name}`);
  return token[theme];
}

export function soundValue(name: string): number {
  const token = designTokens.sound.find((entry) => entry.name === name);
  if (!token) throw new Error(`Unknown sound token: ${name}`);
  return Number(token.value);
}

/** Haptic patterns are stored as space separated millisecond values. */
export function hapticPattern(name: string): number[] {
  const token = designTokens.sound.find((entry) => entry.name === name);
  if (!token) throw new Error(`Unknown haptic token: ${name}`);
  return token.value.split(/\s+/).map(Number);
}

export const brand = {
  name: "Tidefern",
  tagline: "Life flows together",
  closing: "Healthy tomorrows, together",
  description:
    "One app for every chapter, from cycles to pregnancy to childhood, for you and the people who grow with you.",
} as const;
