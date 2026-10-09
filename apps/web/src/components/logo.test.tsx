import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mark } from "./logo";

function images(container: HTMLElement) {
  return Array.from(container.querySelectorAll("img"));
}

describe("Mark", () => {
  it("leaves both theme variants at the browser's defaults by default", () => {
    const { container } = render(<Mark size={36} />);
    const imgs = images(container);
    expect(imgs.map((img) => img.getAttribute("src"))).toEqual([
      "/brand/tidefern-mark.svg",
      "/brand/tidefern-mark-dark.svg",
    ]);
    for (const img of imgs) {
      expect(img).not.toHaveAttribute("loading");
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
});
