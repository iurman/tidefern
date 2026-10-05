import { describe, expect, it } from "vitest";
import { dekAad, generateDek } from "./fields";
import { EnvKeyProvider, FixedKeyProvider, KeyConfigurationError } from "./keys";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("FixedKeyProvider", () => {
  it("accepts only a 32 byte key", () => {
    expect(() => new FixedKeyProvider(new Uint8Array(16))).toThrow(KeyConfigurationError);
    expect(new FixedKeyProvider(new Uint8Array(32), "v9").version).toBe("v9");
    expect(new FixedKeyProvider(new Uint8Array(32)).provider).toBe("fixed");
  });
});

describe("EnvKeyProvider", () => {
  it("derives its version from the variable name without reading the environment", () => {
    expect(new EnvKeyProvider().version).toBe("v1");
    expect(new EnvKeyProvider().provider).toBe("env");
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
  it("rejects a value that is not canonical base64 even when it decodes to 32 bytes", () => {
    const name = "TIDEFERN_KEK_V98";
    const aad = dekAad("subject", "v98");
    const dek = generateDek();
    const good = Buffer.alloc(32, 1).toString("base64");
    try {
      // One stray character: Node drops it, and 45 characters still decode to 32 bytes.
      process.env[name] = `${good.slice(0, 10)}!${good.slice(10)}`;
      expect(Buffer.from(process.env[name], "base64").byteLength).toBe(32);
      expect(() => new EnvKeyProvider(name).wrapDek(dek, aad)).toThrow(/canonical base64/);
      // Missing padding and a trailing newline are what a generator or a shell may add or drop.
      process.env[name] = `${good.replace(/=+$/, "")}\n`;
      const provider = new EnvKeyProvider(name);
      expect(hex(provider.unwrapDek(provider.wrapDek(dek, aad), aad))).toBe(hex(dek));
    } finally {
      delete process.env[name];
    }
  });
});
