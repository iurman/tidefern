import { describe, expect, it } from "vitest";
import { familyCopy } from "./copy";

describe("familyCopy.card.diapers", () => {
  it("counts each diaper once by what it held, so the parts never add up past the total", () => {
    expect(familyCopy.card.diapers(5, 3, 2, 0)).toBe("5 (3 wet, 2 dirty)");
    expect(familyCopy.card.diapers(1, 0, 0, 1)).toBe("1 (1 wet and dirty)");
    expect(familyCopy.card.diapers(2, 1, 0, 1)).toBe("2 (1 wet, 1 wet and dirty)");
    // A diaper logged without contents stays in the total and in no part.
    expect(familyCopy.card.diapers(3, 1, 0, 0)).toBe("3 (1 wet)");
    expect(familyCopy.card.diapers(2, 0, 0, 0)).toBe("2");
  });
});
