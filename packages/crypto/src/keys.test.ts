import { describe, expect, it } from "vitest";
import { dekAad, generateDek } from "./fields";
import { EnvKeyProvider, FixedKeyProvider, KeyConfigurationError } from "./keys";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("FixedKeyProvider", () => {
  it("accepts only a 32 byte key", () => {
    expect(() => new FixedKeyProvider(new Uint8Array(16))).toThrow(KeyConfigurationError);
    expect(new FixedKeyProvider(new Uint8Array(32), "v9").version).toBe("v9");
  });
});

describe("EnvKeyProvider", () => {
  it("derives its version from the variable name without reading the environment", () => {
    expect(new EnvKeyProvider().version).toBe("v1");
    expect(new EnvKeyProvider("TIDEFERN_KEK_V7").version).toBe("v7");
    expect(() => new EnvKeyProvider("TIDEFERN_KEK")).toThrow(KeyConfigurationError);
  });
  it("rejects a missing variable and a wrong length key, then reads a good one lazily", () => {
    const name = "TIDEFERN_KEK_V99";
    const aad = dekAad("subject", "v99");
    const dek = generateDek();
    delete process.env[name];
    try {
      expect(() => new EnvKeyProvider(name).wrapDek(dek, aad)).toThrow(/is not set/);
      process.env[name] = Buffer.alloc(16, 1).toString("base64");
      expect(() => new EnvKeyProvider(name).wrapDek(dek, aad)).toThrow(/exactly 32 bytes/);
      process.env[name] = Buffer.alloc(32, 1).toString("base64");
      const provider = new EnvKeyProvider(name);
      const wrapped = provider.wrapDek(dek, aad);
      expect(hex(provider.unwrapDek(wrapped, aad))).toBe(hex(dek));
    } finally {
      delete process.env[name];
    }
  });
});
