import { OpenAPIHono } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import { problem } from "./problem";
import { healthRoute } from "./routes/health";

export const API_VERSION = "0.1.0";

export interface ApiOptions {
  /** Mount prefix. The web app mounts the API at /api/v1; a standalone deployment may choose /v1. */
  basePath?: string;
}

/**
 * The Tidefern API. Framework neutral: it is a Hono app that the Next.js
 * route handler forwards to today and that can run on its own Vercel
 * project, Node, or Workers later without changes here.
 */
export function createApp(options: ApiOptions = {}) {
  const basePath = options.basePath ?? "/api/v1";
  const app = new OpenAPIHono({
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
  }).basePath(basePath);

  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    await next();
    // Nothing from the API is ever cacheable by a shared cache.
    c.header("Cache-Control", "private, no-store");
  });

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

  app.doc("/openapi.json", {
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
