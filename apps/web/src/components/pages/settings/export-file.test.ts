import { describe, expect, it } from "vitest";
import { checkExportFile } from "./export-file";

const header = JSON.stringify({
  kind: "export",
  format: 1,
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  generatedAt: "2026-10-06T12:00:00.000Z",
});
const record = (n: number) => JSON.stringify({ kind: "cycleEntry", data: { n } });
const end = (records: number) => JSON.stringify({ kind: "end", records });

describe("whether an export file is complete", () => {
  it("is complete when the end line counts the records between it and the header", () => {
    const file = [header, record(1), record(2), end(2)].join("\n") + "\n";
    expect(checkExportFile(file)).toEqual({ complete: true, records: 2 });
    expect(checkExportFile(`${header}\n${end(0)}\n`)).toEqual({ complete: true, records: 0 });
  });

  it("is cut off when the stream stopped before the end line", () => {
    expect(checkExportFile([header, record(1), record(2)].join("\n"))).toEqual({ complete: false });
    expect(checkExportFile(`${header}\n${record(1)}\n{"kind":"cycleEn`)).toEqual({
      complete: false,
    });
  });

  it("is not complete when the count disagrees, the header is missing, or the body is empty", () => {
    expect(checkExportFile([header, record(1), end(2)].join("\n"))).toEqual({ complete: false });
    expect(checkExportFile([record(1), end(1)].join("\n"))).toEqual({ complete: false });
    expect(checkExportFile("")).toEqual({ complete: false });
    expect(checkExportFile('{"type":"urn:tidefern:problem:internal","status":500}')).toEqual({
      complete: false,
    });
  });
});
