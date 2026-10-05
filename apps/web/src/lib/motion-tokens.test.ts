import { afterEach, describe, expect, it, vi } from "vitest";
import {
  durations,
  easings,
  LONGEST_AUTOMATIC_MOTION_MS,
  prefersReducedMotion,
} from "./motion-tokens";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motion tokens", () => {
  it("reads the four durations from the token file in milliseconds", () => {
    expect(durations.feedback).toBe(180);
    expect(durations.disclosure).toBe(280);
    expect(durations.settle).toBe(600);
    expect(durations.tide).toBe(9000);
  });

  it("keeps every non-decorative duration well under the automatic-motion limit", () => {
    expect(durations.settle).toBeLessThan(LONGEST_AUTOMATIC_MOTION_MS);
    expect(durations.disclosure).toBeLessThan(durations.settle);
    expect(durations.feedback).toBeLessThan(durations.disclosure);
  });

  it("exposes the interface, settle, disclosure and tide easings as CSS strings", () => {
    expect(easings.interface).toMatch(/^cubic-bezier\(/);
    expect(easings.settle).toMatch(/^cubic-bezier\(/);
    expect(easings.settle).not.toBe(easings.interface);
    expect(easings.disclosure).toBe("ease");
    expect(easings.tide).toBe("ease-in-out");
  });

  it("reports the reduced-motion preference from matchMedia", () => {
    // jsdom ships no matchMedia, so the test supplies one and removes it afterwards.
    const matchMedia = vi.fn(
      (query: string) => ({ matches: true, media: query }) as MediaQueryList,
    );
    vi.stubGlobal("matchMedia", matchMedia);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    matchMedia.mockImplementation((query) => ({ matches: false, media: query }) as MediaQueryList);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reports no preference where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
