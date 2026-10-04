import { OpenAPIHono } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import { problem } from "./problem";
import { healthRoute } from "./routes/health";

export const API_VERSION = "0.1.0";

export type Defer = (task: () => Promise<void>) => void;

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
}

/**
 * The Tidefern API. Framework neutral: it is a Hono app that the Next.js
 * route handler forwards to today and that can run on its own Vercel
 * project, Node, or Workers later without changes here. A standalone host
 * passes its own defer (for example waitUntil from @vercel/functions).
 */
export function createApp(options: ApiOptions = {}) {
  const defer: Defer = options.defer ?? ((task) => void task());
  const app = new OpenAPIHono<{ Variables: { defer: Defer } }>({
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

  // Better Auth mounts here in the build: app.all("/auth/*", (c) => auth.handler(c.req.raw))

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
