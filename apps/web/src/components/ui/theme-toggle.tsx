"use client";
import { Icon } from "@/components/icons";
import { syncThemeColorMeta } from "@/components/theme-sync";
import { THEME_KEY } from "@/lib/site";
import styles from "./theme-toggle.module.css";

/**
 * The header control that flips between light and dark and remembers the
 * choice on this device (Settings offers the third option, follow the
 * system). Which face shows depends on the theme attribute above it, so the
 * same markup is right in both themes and without JavaScript.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    root.dataset.themeSource = "user";
    syncThemeColorMeta(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Blocked storage still allows an in-session choice.
    }
  }
  const classes = [styles.toggle, className].filter(Boolean).join(" ");
  return (
    <button className={classes} type="button" onClick={toggle}>
      <span className={styles.whenLight}>
        <Icon name="theme-dark" />
        <span className="sr-only">Switch to dark mode</span>
      </span>
      <span className={styles.whenDark}>
        <Icon name="theme-light" />
        <span className="sr-only">Switch to light mode</span>
      </span>
    </button>
  );
}
