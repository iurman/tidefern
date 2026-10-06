import { describe, expect, it } from "vitest";
import { z } from "zod";
import { uuidv7 } from "./id";

const zeros = (bytes: Uint8Array<ArrayBuffer>) => bytes.fill(0);
const ones = (bytes: Uint8Array<ArrayBuffer>) => bytes.fill(0xff);

describe("uuidv7", () => {
  it("passes the same v7 check the API applies to a client-minted id", () => {
    const v7 = z.uuidv7();
    for (let i = 0; i < 100; i += 1) expect(v7.safeParse(uuidv7()).success).toBe(true);
  });

  it("puts the Unix milliseconds in the first 48 bits, big-endian", () => {
    // 1700000000000 ms is 0x018bcfe56800.
    expect(uuidv7(1_700_000_000_000, zeros)).toBe("018bcfe5-6800-7000-8000-000000000000");
  });

  it("sets the version and variant whatever the random bytes are", () => {
    expect(uuidv7(1_700_000_000_000, ones)).toBe("018bcfe5-6800-7fff-bfff-ffffffffffff");
  });

  it("orders ids minted in later milliseconds after earlier ones", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it("draws fresh random bits for each id", () => {
    const now = 1_700_000_000_000;
    const minted = new Set(Array.from({ length: 50 }, () => uuidv7(now)));
    expect(minted.size).toBe(50);
  });
});
