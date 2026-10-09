import { afterEach, describe, expect, it } from "vitest";
import { MARK_DARK, MARK_LIGHT } from "./brand-mark";
import { THEME_KEY, preferenceScript } from "./site";

type Run = { stored: string | null; systemDark: boolean; pathname: string };

// Runs the inline script with the page globals it reads passed in, so each case picks
// its own stored theme, system theme and path.
function run({ stored, systemDark, pathname }: Run) {
  const storage = { getItem: (key: string) => (key === THEME_KEY ? stored : null) };
  const win = {
    matchMedia: (query: string) => ({ matches: systemDark && query.includes("dark") }),
  };
  new Function("window", "localStorage", "location", preferenceScript)(win, storage, { pathname });
}

function heroPreloads() {
  return Array.from(document.head.querySelectorAll('link[rel="preload"][as="image"]')).map(
    (link) => [link.getAttribute("href"), link.getAttribute("fetchpriority")],
  );
}

afterEach(() => {
  document.head.innerHTML = "";
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeSource;
});

describe("preferenceScript", () => {
  it("preloads the dark mark on the hero page when the stored theme is dark on a light system", () => {
    run({ stored: "dark", systemDark: false, pathname: "/" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(heroPreloads()).toEqual([[MARK_DARK, "high"]]);
  });

  it("preloads the light mark on the hero page when the stored theme is light on a dark system", () => {
    run({ stored: "light", systemDark: true, pathname: "/" });
    expect(heroPreloads()).toEqual([[MARK_LIGHT, "high"]]);
  });

  it("adds nothing when the stored theme matches the system, since the hero's own preload fits", () => {
    run({ stored: "dark", systemDark: true, pathname: "/" });
    expect(heroPreloads()).toEqual([]);
  });

  it("adds nothing when the theme follows the system", () => {
    run({ stored: null, systemDark: false, pathname: "/" });
    expect(document.documentElement.dataset.themeSource).toBe("system");
    expect(heroPreloads()).toEqual([]);
  });

  it("adds nothing on a page without the hero mark", () => {
    run({ stored: "dark", systemDark: false, pathname: "/today" });
    expect(heroPreloads()).toEqual([]);
  });
});
