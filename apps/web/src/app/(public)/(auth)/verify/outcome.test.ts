import { describe, expect, it } from "vitest";
import { readVerifyOutcome } from "./outcome";

describe("readVerifyOutcome", () => {
  it("reads the marker the sign-up callback carries as a confirmation", () => {
    expect(readVerifyOutcome({ done: "1" })).toBe("confirmed");
  });

  it("lets the error the server appends win over the marker", () => {
    expect(readVerifyOutcome({ done: "1", error: "INVALID_TOKEN" })).toBe("failed");
    expect(readVerifyOutcome({ error: "TOKEN_EXPIRED" })).toBe("failed");
  });

  it("reads a direct visit as no result at all", () => {
    expect(readVerifyOutcome({})).toBe("none");
    expect(readVerifyOutcome({ done: "" })).toBe("none");
    expect(readVerifyOutcome({ done: ["1"] })).toBe("none");
    expect(readVerifyOutcome({ error: "" })).toBe("none");
  });
});
