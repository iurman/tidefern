/**
 * The client's id minter is the one in `@tidefern/core` (a UUIDv7 on Web
 * Crypto, the same function the API and the database package call). It is
 * re-exported here so the client's public `uuidv7` and `RandomFill` stay
 * where callers import them from. The API validates a client-minted id as v7
 * (architecture 5.1), so an offline client can create a record whose id the
 * server keeps.
 */
export { uuidv7 } from "@tidefern/core/uuid";
export type { RandomFill } from "@tidefern/core/uuid";
