import { describe, expect, it } from "vitest";
import rootManifest from "../../../../../package.json";
import { checkGates, describeGates, gateDescriptions } from "./gates";

describe("checkGates", () => {
  it("splits a chain and expands a multi-task turbo run", () => {
    expect(checkGates("pnpm a && pnpm  b &&turbo run lint typecheck")).toEqual([
      "pnpm a",
      "pnpm b",
      "turbo run lint",
      "turbo run typecheck",
    ]);
  });

  it("keeps a single command as it is", () => {
    expect(checkGates("pnpm --filter web brand:check")).toEqual(["pnpm --filter web brand:check"]);
  });

  it("marks an undescribed gate instead of dropping it", () => {
    expect(describeGates("pnpm new:gate")).toEqual([
      { command: "pnpm new:gate", holds: "Not yet described on this page." },
    ]);
  });
});

describe("the repository's check script", () => {
  const gates = checkGates(rootManifest.scripts.check);

  it("has a description for every gate it runs", () => {
    const missing = gates.filter((gate) => !(gate in gateDescriptions));
    expect(missing, "describe each new gate in gates.ts").toEqual([]);
  });

  it("describes no gate the script no longer runs", () => {
    const stale = Object.keys(gateDescriptions).filter((gate) => !gates.includes(gate));
    expect(stale).toEqual([]);
  });
});
