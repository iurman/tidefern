import { expect, it } from "vitest";
import { urlProblems } from "../../tests/e2e/privacy-rules";

it("accepts only empty static icon fingerprints and still rejects health and arbitrary query data", () => {
  const inspect = (path: string) =>
    urlProblems(`https://tidefern.example${path}`, { checkPath: true });
  expect(inspect("/icon.svg?icon.1xyvdlpyclsr6.svg")).toEqual([]);
  expect(inspect("/favicon.ico?favicon.1xyvdlpyclsr6.ico")).toEqual([]);
  expect(inspect("/apple-icon.png?apple-icon.3z-ujlnsw0y6l.png")).toEqual([]);
  for (const path of [
    "/today?icon.1xyvdlpyclsr6.svg",
    "/icon.svg?icon.1xyvdlpyclsr6.svg=private-data",
    "/icon.svg?icon.pregnancy.svg",
    "/apple-icon.png?apple-icon.pregnancy.png",
    "/icon.svg?user=123",
    "/icon.svg?token=pregnancy",
  ])
    expect(inspect(path), path).not.toEqual([]);
});
