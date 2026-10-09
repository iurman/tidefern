import { describe, expect, it } from "vitest";
import { uuidv7 } from "./uuid";
import type { RandomFill } from "./uuid";

const zeros: RandomFill = (bytes) => bytes.fill(0);
const ones: RandomFill = (bytes) => bytes.fill(0xff);

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The one minter every package calls (db's jobId, the API's routes, the client's uuidv7). */
describe("uuidv7", () => {
  it("mints the RFC 9562 text form with version 7 and variant 10", () => {
    for (let i = 0; i < 100; i += 1) expect(uuidv7()).toMatch(V7);
  });

  it("puts the Unix milliseconds in the first 48 bits, big-endian", () => {
    // 1700000000000 ms is 0x018bcfe56800.
    expect(uuidv7(1_700_000_000_000, zeros)).toBe("018bcfe5-6800-7000-8000-000000000000");
    // The edges of the 16-bit high word and the 32-bit low word the minter splits into.
    expect(uuidv7(0, zeros)).toBe("00000000-0000-7000-8000-000000000000");
    expect(uuidv7(0xffff_ffff, zeros)).toBe("0000ffff-ffff-7000-8000-000000000000");
    expect(uuidv7(0x1_0000_0000, zeros)).toBe("00010000-0000-7000-8000-000000000000");
    expect(uuidv7(0xffff_ffff_ffff, zeros)).toBe("ffffffff-ffff-7000-8000-000000000000");
  });

  it("sets the version and variant whatever the random bytes are", () => {
    expect(uuidv7(1_700_000_000_000, ones)).toBe("018bcfe5-6800-7fff-bfff-ffffffffffff");
  });

  it("orders ids minted in later milliseconds after earlier ones, as text", () => {
    const instants = [0, 1, 0xffff_ffff, 0x1_0000_0000, 1_700_000_000_000, 0xffff_ffff_ffff];
    for (let i = 1; i < instants.length; i += 1) {
      // The earlier id with the highest random bits still sorts first.
      expect(uuidv7(instants[i - 1], ones) < uuidv7(instants[i], zeros)).toBe(true);
    }
  });

  it("reads the clock it is given and draws fresh random bits for each id", () => {
    const now = Date.UTC(2026, 9, 6, 12, 0, 0, 123);
    const minted = new Set(Array.from({ length: 50 }, () => uuidv7(now)));
    expect(minted.size).toBe(50);
    for (const id of minted) expect(id.slice(0, 13)).toBe(uuidv7(now, zeros).slice(0, 13));
  });

  it("fills the random bits from the source it is given", () => {
    const seen: number[] = [];
    const counting: RandomFill = (bytes) => {
      seen.push(bytes.length);
      return bytes.fill(0xab);
    };
    expect(uuidv7(1_700_000_000_000, counting)).toBe("018bcfe5-6800-7bab-abab-abababababab");
    expect(seen).toEqual([16]);
  });
});
