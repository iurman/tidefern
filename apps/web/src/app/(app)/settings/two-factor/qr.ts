/**
 * The pure drawing of a QR matrix: one SVG path for every dark module. The
 * encoding itself comes from `uqr` (resolved from the registry, no
 * dependencies of its own); this module turns its boolean grid into the
 * geometry the component renders, so the shape is unit tested without a
 * browser and the component stays a few lines.
 */

/** The path data for every dark module of a matrix of `true` (dark) and `false` (light) cells. */
export function matrixPath(matrix: ReadonlyArray<ReadonlyArray<boolean>>): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      // One rectangle per run of dark cells keeps the path short and the edges crisp.
      let width = 1;
      while (x + width < row.length && row[x + width]) width += 1;
      parts.push(`M${x} ${y}h${width}v1h-${width}z`);
      x += width;
    }
  });
  return parts.join("");
}

/** The matrix's side length in modules, zero for an empty one. */
export function matrixSize(matrix: ReadonlyArray<ReadonlyArray<boolean>>): number {
  return matrix.length;
}
