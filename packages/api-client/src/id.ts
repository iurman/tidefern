/**
 * The random source the id minter reads: Web Crypto's `getRandomValues`,
 * which browsers, Node 24 and the Expo crypto polyfill all provide. Never
 * `crypto.randomUUID`, which mints v4 and is missing on React Native.
 */
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const webRandom: RandomFill = (bytes) => globalThis.crypto.getRandomValues(bytes);

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then random bits with
 * the version and variant set. The same layout as the server's minter
 * (`jobId` in packages/db/src/jobs.ts), rebuilt on Web Crypto because a
 * client never imports the database package or `node:crypto`. The API
 * validates a client-minted id as v7 (architecture 5.1), so an offline
 * client can create a record whose id the server keeps.
 */
export function uuidv7(now: number = Date.now(), fill: RandomFill = webRandom): string {
  const bytes = fill(new Uint8Array(16));
  // 48 bits of milliseconds as a 16-bit high word and a 32-bit low word, so
  // no BigInt is needed, matching the server's minter.
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
