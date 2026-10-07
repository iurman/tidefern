import { syncThemeColorMeta } from "@/components/theme-sync";
import { THEME_KEY } from "@/lib/site";

/**
 * The three theme choices Settings offers (architecture 13.4, DESIGN.md
 * section 4): follow the system, or an explicit light or dark. The choice
 * lives where the pre-paint script, the header toggle and `ThemeSync`
 * already keep it: the `tidefern-theme-v1` key on this device and the
 * `data-theme` and `data-theme-source` attributes on the root. Follow
 * system removes the key, so nothing is stored (the visible way to stop
 * storing it that /privacy names).
 */
export type ThemeChoice = "system" | "light" | "dark";

/** What the root shows now: an explicit choice only when its source is the person's. */
export function readThemeChoice(root: HTMLElement = document.documentElement): ThemeChoice {
  if (root.dataset.themeSource !== "user") return "system";
  return root.dataset.theme === "dark" ? "dark" : "light";
}

function systemTheme(): "light" | "dark" {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Applies a choice the way the header toggle does, plus the third option:
 * follow system clears the stored key, marks the source as the system's
 * (so `ThemeSync` applies a system switch live again) and shows the
 * system's theme now. Blocked storage still allows the choice for this
 * visit.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  const theme = choice === "system" ? systemTheme() : choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage is blocked: the choice holds for this visit only.
  }
  root.dataset.themeSource = choice === "system" ? "system" : "user";
  root.dataset.theme = theme;
  syncThemeColorMeta(theme);
}

/** Hears the two root attributes, so a choice made in another tab or control shows here too. */
export function subscribeThemeChoice(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-source"],
  });
  return () => observer.disconnect();
}
