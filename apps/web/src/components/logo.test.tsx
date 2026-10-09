import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mark } from "./logo";

function images(container: HTMLElement) {
  return Array.from(container.querySelectorAll("img"));
}

describe("Mark", () => {
  it("makes both theme variants lazy, so only the one the theme shows is fetched", () => {
    const { container } = render(<Mark size={36} />);
    const imgs = images(container);
    expect(imgs.map((img) => img.getAttribute("src"))).toEqual([
      "/brand/tidefern-mark.svg",
      "/brand/tidefern-mark-dark.svg",
    ]);
    for (const img of imgs) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).not.toHaveAttribute("fetchpriority");
    }
  });

  it("as the LCP element, fetches only the shown variant, at high priority", () => {
    const { container } = render(<Mark size={200} priority />);
    const imgs = images(container);
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      // Lazy, so the variant the theme hides is never fetched; high, so the shown one comes first.
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("fetchpriority", "high");
      expect(img).toHaveAttribute("width", "200");
      expect(img).toHaveAttribute("height", "200");
    }
  });

  it("as the LCP element, preloads each variant at high priority for its system theme", async () => {
    render(<Mark size={200} priority />);
    // React hoists the preloads into the head; give it a tick to flush them.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const links = Array.from(document.head.querySelectorAll('link[rel="preload"][as="image"]'));
    const byHref = Object.fromEntries(
      links.map((link) => [
        link.getAttribute("href"),
        [link.getAttribute("media"), link.getAttribute("fetchpriority")],
      ]),
    );
    expect(byHref["/brand/tidefern-mark.svg"]).toEqual(["(prefers-color-scheme: light)", "high"]);
    expect(byHref["/brand/tidefern-mark-dark.svg"]).toEqual([
      "(prefers-color-scheme: dark)",
      "high",
    ]);
  });
});
