import tokens from "../tokens.json" with { type: "json" };

export type Theme = "light" | "dark";

export interface ColorToken {
  name: string;
  label: string;
  light: string;
  dark: string;
  use: string;
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
  spacing: ValueToken[];
  radius: ValueToken[];
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

export const brand = {
  name: "Tidefern",
  tagline: "Life flows together",
  closing: "Healthy tomorrows, together",
  description:
    "One app for every chapter, from cycles to pregnancy to childhood, for you and the people who grow with you.",
} as const;
