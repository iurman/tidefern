"use client";
import { useEffect } from "react";

/** While the theme follows the system, a change in the system preference applies live. */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (event: MediaQueryList | MediaQueryListEvent) => {
      const root = document.documentElement;
      if (root.dataset.themeSource !== "system") return;
      root.dataset.theme = event.matches ? "dark" : "light";
    };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return null;
}
