import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY } from "@/lib/site";
import { applyThemeChoice, readThemeChoice, subscribeThemeChoice } from "./theme-choice";

function meta(media: string) {
  const element = document.createElement("meta");
  element.name = "theme-color";
  element.media = media;
  document.head.append(element);
  return element;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeSource;
  document.head.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the theme choice Settings offers", () => {
  it("reads follow system unless the person chose a theme", () => {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    root.dataset.themeSource = "system";
    expect(readThemeChoice()).toBe("system");
    root.dataset.themeSource = "user";
    expect(readThemeChoice()).toBe("dark");
    root.dataset.theme = "light";
    expect(readThemeChoice()).toBe("light");
  });

  it("remembers an explicit choice on this device and rewrites both theme-color metas", () => {
    const light = meta("(prefers-color-scheme: light)");
    const dark = meta("(prefers-color-scheme: dark)");
    applyThemeChoice("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeSource).toBe("user");
    expect(light.content).toBe("#0F1A17");
    expect(dark.content).toBe("#0F1A17");
  });

  it("follows the system by forgetting the stored choice and showing the system's theme", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      media: query,
    }));
    localStorage.setItem(THEME_KEY, "light");
    applyThemeChoice("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.themeSource).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readThemeChoice()).toBe("system");
  });

  it("hears a change to the root made by any control", async () => {
    const heard = vi.fn();
    const stop = subscribeThemeChoice(heard);
    document.documentElement.dataset.themeSource = "user";
    await Promise.resolve();
    expect(heard).toHaveBeenCalled();
    stop();
  });
});
