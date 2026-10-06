import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiEnv } from "../context";

/**
 * The resource route registry. Each area (profile, cycle, pregnancy,
 * children, notes, sharing, account) exports a `register<Area>(app)` from its
 * own module and adds exactly one line here, so seven areas can land in
 * sequence without sharing a file beyond this one. The health, me and
 * internal routes stay in app.ts because the middleware order depends on them.
 */
export function registerRoutes(app: OpenAPIHono<ApiEnv>): void {
  void app;
}
