import { OpenAPIHono } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import type { ActorDatabase } from "@tidefern/db";
import { withSession } from "./auth";
import type { SessionAuth } from "./auth";
import { calendarClock } from "./clock";
import type { CalendarClock } from "./clock";
import type { ApiEnv, Defer, DrainJobs } from "./context";
import { drainEnqueued } from "./jobs/index";
import { crossSite, idempotency, logger, rateLimit, routeTemplate } from "./middleware/index";
import type { CrossSiteOptions, LoggerOptions } from "./middleware/index";
import { problem } from "./problem";
import { healthRoute } from "./routes/health";
import { internalJobs } from "./routes/internal/jobs";
import type { JobsOptions } from "./routes/internal/jobs";
import { internalMailCapture } from "./routes/internal/mail-capture";
import type { MailCaptureOptions } from "./routes/internal/mail-capture";
import { registerRoutes } from "./routes/index";
import { meBody, meRoute } from "./routes/me";

export const API_VERSION = "0.1.0";

export type { Defer, DrainJobs } from "./context";

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
  /**
   * The job runner (architecture 10.1): the owner-role connection, the
   * handler registry, `CRON_SECRET`, and the mailer and address for the
   * dead-queue notice. Without it the inline drain is a no-op and
   * `/api/internal/jobs/run` is not mounted.
   */
  jobs?: JobsOptions;
  /**
   * The origins a `/v1` mutation may come from besides the request's own
   * (architecture 8.3): the host passes the trusted origins `packages/auth`
   * resolves (the production origin and the team's preview pattern).
   * Without it only the request's own origin is trusted.
   */
  crossSite?: CrossSiteOptions;
  /**
   * The allowlist logger's secret (`LOG_HMAC_SECRET`, architecture 9.1) and
   * sink. Without a secret the lines carry no actor field at all.
   */
  log?: LoggerOptions;
  /**
   * The browser suite's window onto the capture mailer (architecture 15 and
   * 17.1): `GET /api/internal/e2e/mail` answers the captured messages and
   * `DELETE` forgets them. The host passes it only when `E2E_MAIL_CAPTURE`
   * is exactly `true` off Vercel; without it the path is not mounted.
   */
  mailCapture?: MailCaptureOptions | undefined;
  /**
   * The calendar clock every decision about which calendar day it is reads
   * (clock.ts). Without one it is resolved here from `process.env`:
   * `TIDEFERN_FAKE_NOW` freezes it outside production, and on production
   * the variable makes this call throw `ClockConfigurationError`, so the
   * host's route module, which calls this at module scope, fails to load
   * and no request is ever answered on a frozen calendar. Tests pass
   * `calendarClock(facts)` and never depend on the runner's environment.
   */
  clock?: CalendarClock | undefined;
}

/**
 * The Tidefern API. Framework neutral: it is a Hono app that the Next.js
 * route handler forwards to today and that can run on its own Vercel
 * project, Node, or Workers later without changes here. A standalone host
 * passes its own defer (for example waitUntil from @vercel/functions).
 */
export function createApp(options: ApiOptions = {}) {
  const defer: Defer = options.defer ?? ((task) => void task());
  const clock = options.clock ?? calendarClock(process.env);
  const jobs = options.jobs;
  const drainJobs: DrainJobs = jobs
    ? (ids) =>
        defer(async () => {
          try {
            await drainEnqueued(jobs.db, ids, jobs.handlers ?? {}, new Date(), clock);
          } catch (error) {
            // A failed claim, not a failed job: those are recorded on the row.
            console.error("jobs_drain_error", { name: (error as Error).name });
          }
        })
    : () => undefined;
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
    c.set("drainJobs", drainJobs);
    c.set("clock", clock);
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

  // The contract is public and answers before the session middleware is
  // reached, so a request for it never costs a session lookup even when it
  // carries a cookie. The document itself is built at request time, so the
  // routes registered below are still in it.
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

  // Every other /v1 request learns its session and actor first (architecture
  // 8.3 step 1); routes that need one add requireActor.
  app.use("/v1/*", withSession(auth, options.db));

  // Then, with the actor known (task E1): one allowlisted log line per
  // request (architecture 9.1), and for every mutation the cross-site
  // check, the per-actor rate limit and the idempotency rule (architecture
  // 8.3 and 5.3), in that order, so a forged request costs no database
  // write and a replay never reaches a handler.
  app.use("/v1/*", logger(options.log));
  app.use("/v1/*", crossSite(options.crossSite));
  app.use("/v1/*", rateLimit(options.db));
  app.use("/v1/*", idempotency(options.db));

  // Outside /v1 and outside the OpenAPI document: a plain sub-app, not app.openapi().
  if (jobs) {
    app.route("/internal", internalJobs(jobs, clock));
  }
  if (options.mailCapture) {
    app.route("/internal", internalMailCapture(options.mailCapture));
  }

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
  registerRoutes(app, { db: options.db });

  app.notFound((c) => problem(c, 404, "not_found"));
  app.onError((error, c) => {
    // The route template, never the path: a path can carry a date or an id (architecture 9.1).
    console.error("api_error", { route: routeTemplate(c), name: error.name });
    return problem(c, 500, "internal");
  });

  return app;
}

export type TidefernApi = ReturnType<typeof createApp>;
