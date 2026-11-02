/**
 * The random source the id minter reads: Web Crypto's `getRandomValues`,
 * which browsers, Node 24 and the Expo crypto polyfill all provide. Never
 * `crypto.randomUUID`, which mints v4 and is missing on React Native.
 */
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const webRandom: RandomFill = (bytes) => globalThis.crypto.getRandomValues(bytes);

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, big-endian, then 74
 * random bits with the version (7) and the variant (10) set. The one minter
 * in the repository: the database package's `jobId`, every API route and
 * the API client's `uuidv7` all call this, so a client-minted id and a
 * server-minted one share a layout the API validates as v7 (architecture
 * 5.1). Time-ordered ids keep the claim scan and the list cursors cheap.
 *
 * Ids from different milliseconds sort in time order; two ids minted in the
 * same millisecond order by their random bits, not by when they were made.
 * The clock and the random source are injectable for tests. Web Crypto only:
 * no Node import, because the client runs this in browsers and Expo.
 */
export function uuidv7(now: number = Date.now(), fill: RandomFill = webRandom): string {
  const bytes = fill(new Uint8Array(16));
  // 48 bits of milliseconds as a 16-bit high word and a 32-bit low word, so
  // no BigInt is needed and the web build's lower target type-checks this.
  const high = Math.floor(now / 0x1_0000_0000);
  const low = now % 0x1_0000_0000;
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
