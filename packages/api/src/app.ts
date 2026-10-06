import { OpenAPIHono } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import type { ActorDatabase } from "@tidefern/db";
import { withSession } from "./auth";
import type { SessionAuth } from "./auth";
import type { ApiEnv, Defer } from "./context";
import { problem } from "./problem";
import { healthRoute } from "./routes/health";
import { meBody, meRoute } from "./routes/me";

export const API_VERSION = "0.1.0";

export type { Defer } from "./context";

/**
 * The mount prefix is permanent. Every path in the committed OpenAPI
 * document starts with /api/v1, installed clients are generated against
 * those paths, and a standalone deployment answers at the same paths on its
 * own host. Changing it would be a breaking change for every client.
 */
export const API_PREFIX = "/api";

export interface ApiOptions {
  /**
   * Runs work after the response is sent, for example draining outbox jobs
   * the request enqueued. The Next.js host passes `after` from next/server;
   * a standalone host passes a function that simply starts the task; tests
   * pass a collector. The API never imports a framework to get this.
   */
  defer?: Defer;
  /**
   * The Better Auth instance, mounted at /api/auth/* and consulted for the
   * session on /api/v1 requests. The Next.js host passes `auth` from
   * `@tidefern/auth/server`; tests pass a fake. Without one, the auth path
   * is unmounted and every request is anonymous.
   */
  auth?: SessionAuth;
  /**
   * The database `withActor()` opens the actor's transaction on. The Next.js
   * host passes the pooled client; tests pass PGlite. Without one the db
   * package's production client is used.
   */
  db?: ActorDatabase;
}

/**
 * The Tidefern API. Framework neutral: it is a Hono app that the Next.js
 * route handler forwards to today and that can run on its own Vercel
 * project, Node, or Workers later without changes here. A standalone host
 * passes its own defer (for example waitUntil from @vercel/functions).
 */
export function createApp(options: ApiOptions = {}) {
  const defer: Defer = options.defer ?? ((task) => void task());
  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, 422, "validation_failed", {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          })),
        });
      }
      return undefined;
    },
  }).basePath(API_PREFIX);

  app.use("*", async (c, next) => {
    c.set("defer", defer);
    await next();
  });
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    await next();
    // Nothing from the API is ever cacheable by a shared cache.
    c.header("Cache-Control", "private, no-store");
  });

  // Better Auth owns everything under /api/auth and sees the raw request
  // (architecture 6.1). It is mounted ahead of /v1 and is not an OpenAPI
  // route, so the committed contract never lists it.
  const auth = options.auth;
  if (auth !== undefined) {
    app.all("/auth/*", (c) => auth.handler(c.req.raw));
  }

  // Every /v1 request learns its session and actor first (architecture 8.3
  // step 1); routes that need one add requireActor.
  app.use("/v1/*", withSession(auth, options.db));

  app.openapi(healthRoute, (c) =>
    c.json(
      {
        status: "ok" as const,
        service: "tidefern-api" as const,
        version: API_VERSION,
        time: new Date().toISOString(),
      },
      200,
    ),
  );

  app.openapi(meRoute, (c) => c.json(meBody(c), 200));

  app.doc("/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Tidefern API",
      version: API_VERSION,
      description:
        "Versioned REST contract for every Tidefern client. Health data travels only in request and response bodies, never in paths or query strings.",
    },
    servers: [{ url: "/", description: "Same origin as the web app" }],
  });

  app.notFound((c) => problem(c, 404, "not_found"));
  app.onError((error, c) => {
    console.error("api_error", { path: c.req.path, name: error.name });
    return problem(c, 500, "internal");
  });

  return app;
}

export type TidefernApi = ReturnType<typeof createApp>;
