"use client";
import { THEME_KEY } from "@/lib/site";
import { syncThemeColorMeta } from "@/components/theme-sync";

export function ThemeToggle() {
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
  return (
    <button className="control theme-toggle" type="button" onClick={toggle}>
      <span className="when-light">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M20.7 14.5A9 9 0 0 1 9.5 3.3 9 9 0 1 0 20.7 14.5Z" />
        </svg>
        <span className="sr-only">Switch to dark mode</span>
      </span>
      <span className="when-dark">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </svg>
        <span className="sr-only">Switch to light mode</span>
      </span>
    </button>
  );
}
