/**
 * GET /v1/me/export streams newline-delimited JSON (task E8): an
 * ExportHeader line, one ExportRecord line per row, and an ExportEnd line
 * with the record count, written only after every record. The status is
 * already 200 when the first line leaves, so a failure partway shows only
 * as a file without that last line. The page offers the file only when it
 * is complete.
 */
export type ExportCheck = { complete: true; records: number } | { complete: false };

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Complete means: the first line is the header, the last is the end line,
 * and the end line counts exactly the lines between them.
 */
export function checkExportFile(text: string): ExportCheck {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) return { complete: false };
  const first = parseLine(lines[0] as string);
  const last = parseLine(lines[lines.length - 1] as string);
  if (first?.kind !== "export" || last?.kind !== "end") return { complete: false };
  const records = last.records;
  if (typeof records !== "number" || !Number.isInteger(records) || records !== lines.length - 2) {
    return { complete: false };
  }
  return { complete: true, records };
}
