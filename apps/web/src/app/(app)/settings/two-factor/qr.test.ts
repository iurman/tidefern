import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { matrixPath, matrixSize } from "./qr";

describe("matrixPath", () => {
  it("draws one unit rectangle per run of dark modules, row by row", () => {
    const matrix = [
      [true, true, false],
      [false, true, false],
      [true, false, true],
    ];
    expect(matrixPath(matrix)).toBe("M0 0h2v1h-2zM1 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1z");
  });

  it("draws nothing for an empty or all-light matrix", () => {
    expect(matrixPath([])).toBe("");
    expect(matrixPath([[false, false]])).toBe("");
    expect(matrixSize([])).toBe(0);
  });

  it("covers every dark module of a real code and nothing else", () => {
    const { data, size } = encode("otpauth://totp/Tidefern:sam?secret=ABCD&issuer=Tidefern", {
      ecc: "M",
      border: 2,
    });
    const path = matrixPath(data);
    const drawn = (path.match(/h(\d+)v1/g) ?? []).reduce(
      (sum, run) => sum + Number(run.slice(1, -2)),
      0,
    );
    const dark = data.flat().filter(Boolean).length;
    expect(drawn).toBe(dark);
    expect(matrixSize(data)).toBe(size);
    // The quiet zone is light: the first row and column draw nothing.
    expect(path.startsWith("M0 0")).toBe(false);
    expect(data[0]?.every((cell) => !cell)).toBe(true);
  });
});
