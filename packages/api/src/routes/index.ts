import type { OpenAPIHono } from "@hono/zod-openapi";
import { EnvKeyProvider } from "@tidefern/crypto";
import type { KeyProvider } from "@tidefern/crypto";
import type { ActorDatabase } from "@tidefern/db";

import type { ApiEnv } from "../context";
import { registerNotes } from "./notes";
import { registerSharing } from "./sharing/index";
import { registerPregnancy } from "./pregnancy/index";
import { registerChildren } from "./children";

/** What every resource area needs from the host: the actor database and the key provider. */
export interface RouteOptions {
  /** The database `withActor()` opens the actor's transaction on; the production client when absent. */
  db?: ActorDatabase | undefined;
  /**
   * The key encryption key provider for the encrypted columns (architecture
   * 9.2). `TIDEFERN_KEK_V1` through `EnvKeyProvider` when absent, read on
   * first use, so a build without the variable still starts.
   */
  keys?: KeyProvider | undefined;
}

/**
 * The resource route registry. Each area (profile, cycle, pregnancy,
 * children, notes, sharing, account) exports a `register<Area>(app, options)`
 * from its own module and adds exactly one line here, so seven areas can
 * land in sequence without sharing a file beyond this one. The health, me and
 * internal routes stay in app.ts because the middleware order depends on them.
 */
export function registerRoutes(app: OpenAPIHono<ApiEnv>, options: RouteOptions = {}): void {
  const resolved = { db: options.db, keys: options.keys ?? new EnvKeyProvider() };
  registerNotes(app);
  registerSharing(app);
  registerPregnancy(app, resolved);
  registerChildren(app);
}
