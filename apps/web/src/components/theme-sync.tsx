"use client";
import { useEffect } from "react";
import { SOUND_KEY, THEME_KEY } from "@/lib/site";

const PAGE_COLOR = { light: "#F7F5EF", dark: "#0F1A17" } as const;

/** Installed web apps read theme-color once, so an explicit choice updates both metas. */
export function syncThemeColorMeta(theme: "light" | "dark") {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", PAGE_COLOR[theme]));
}

/**
 * While the theme follows the system, a change in the system preference
 * applies live (Apple's Auto appearance flips during the day). A choice made
 * in another tab of this origin applies here through the storage event.
 */
export function ThemeSync() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystem = (event: MediaQueryList | MediaQueryListEvent) => {
      if (root.dataset.themeSource !== "system") return;
      const theme = event.matches ? "dark" : "light";
      root.dataset.theme = theme;
      syncThemeColorMeta(theme);
    };
    const applyStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) {
        if (event.newValue === "light" || event.newValue === "dark") {
          root.dataset.theme = event.newValue;
          root.dataset.themeSource = "user";
          syncThemeColorMeta(event.newValue);
        } else {
          root.dataset.themeSource = "system";
          applySystem(media);
        }
      }
      if (event.key === SOUND_KEY) {
        root.dataset.sound =
          event.newValue === "off" || event.newValue === "actions" ? event.newValue : "all";
      }
    };
    media.addEventListener("change", applySystem);
    window.addEventListener("storage", applyStorage);
    return () => {
      media.removeEventListener("change", applySystem);
      window.removeEventListener("storage", applyStorage);
    };
  }, []);
  return null;
}
