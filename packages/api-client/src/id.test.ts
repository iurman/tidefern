import { jobId } from "@tidefern/db/jobs";
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

  it("keeps the server minter's layout: the same timestamp, version and variant as jobId", () => {
    // Two copies of the byte layout live in the repository (this one on Web
    // Crypto, jobId on node:crypto in packages/db). This test is the drift
    // gate until one shared minter exists. Only the random bits may differ.
    const instants = [
      0,
      1,
      0xffff_ffff,
      0x1_0000_0000,
      1_700_000_000_000,
      Date.UTC(2026, 9, 6, 12, 0, 0, 123),
      0xffff_ffff_ffff,
    ];
    for (const now of instants) {
      const client = uuidv7(now);
      const server = jobId(now);
      // 12 hex digits of milliseconds and the version nibble.
      expect(client.slice(0, 15)).toBe(server.slice(0, 15));
      // The variant: the top two bits of byte 8 are 10 in both.
      expect(client[19]).toMatch(/[89ab]/);
      expect(server[19]).toMatch(/[89ab]/);
    }
  });
});
