import { describe, expect, it } from "vitest";
import { easings } from "@/lib/motion-tokens";
import { bezierPoint, easingPath, keywordCurves, parseEasing, progressAt } from "./curves";

describe("parseEasing", () => {
  it("reads every easing token the product ships", () => {
    for (const [name, value] of Object.entries(easings)) {
      expect(parseEasing(value), name).not.toBeNull();
    }
  });

  it("parses cubic-bezier with any spacing and the five keywords", () => {
    expect(parseEasing("cubic-bezier(0.2, 0.8, 0.2, 1)")).toEqual({
      x1: 0.2,
      y1: 0.8,
      x2: 0.2,
      y2: 1,
    });
    expect(parseEasing("cubic-bezier(0.16,1,0.3,1)")).toEqual({ x1: 0.16, y1: 1, x2: 0.3, y2: 1 });
    expect(parseEasing("ease")).toEqual(keywordCurves.ease);
    expect(parseEasing(" EASE-IN-OUT ")).toEqual(keywordCurves["ease-in-out"]);
  });

  it("returns null for anything the stylesheet would reject", () => {
    expect(parseEasing("steps(4)")).toBeNull();
    expect(parseEasing("cubic-bezier(1.2, 0, 0, 1)")).toBeNull();
    expect(parseEasing("cubic-bezier(0, 0, 1)")).toBeNull();
    expect(parseEasing("")).toBeNull();
  });
});

describe("bezierPoint and progressAt", () => {
  it("starts at the origin and ends at one", () => {
    const curve = parseEasing(easings.settle)!;
    expect(bezierPoint(curve, 0)).toEqual({ x: 0, y: 0 });
    expect(bezierPoint(curve, 1)).toEqual({ x: 1, y: 1 });
    expect(progressAt(curve, 0)).toBe(0);
    expect(progressAt(curve, 1)).toBe(1);
  });

  it("is the identity for linear", () => {
    expect(progressAt(keywordCurves.linear, 0.25)).toBeCloseTo(0.25, 6);
    expect(progressAt(keywordCurves.linear, 0.9)).toBeCloseTo(0.9, 6);
  });

  it("shows the settle curve ahead of the interface curve early on", () => {
    const settle = parseEasing(easings.settle)!;
    const ui = parseEasing(easings.interface)!;
    expect(progressAt(settle, 0.2)).toBeGreaterThan(progressAt(ui, 0.2));
    expect(progressAt(settle, 0.5)).toBeGreaterThan(0.9);
  });
});

describe("easingPath", () => {
  it("draws from the bottom left to the top right of the box", () => {
    const path = easingPath(keywordCurves.ease, 100, 4);
    expect(path.startsWith("M0.00 100.00")).toBe(true);
    expect(path.endsWith("L100.00 0.00")).toBe(true);
    expect(path.split(" L"), "steps + 1 points").toHaveLength(5);
  });
});
