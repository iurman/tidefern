// The raw db and pool stay in ./client on purpose: route code reaches the
// database only through withActor() and withSystem().
export { withActor, withSystem, isActorId } from "./actor";
export type { ActorDatabase, Transaction } from "./actor";
export { applyMigrations, migrationConfig } from "./migrate";
export * as schema from "./schema/index";
