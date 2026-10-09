import { after } from "next/server";
import {
  configureClosure,
  configureReminders,
  configureSharing,
  createApp,
  jobHandlers,
} from "@tidefern/api";
import type { JobsOptions } from "@tidefern/api";
// This file is the host entry, the one place in apps/web that hands the
// server-side auth instance and the database to the API. Every other module
// in the app talks to the API over HTTP or the in-process client and never
// imports either package; the ESLint rule stays on for them.
/* eslint-disable no-restricted-imports -- host wiring for the API, see above */
import {
  capturedMail,
  clearCapturedMail,
  hostFactsFromEnvironment,
  reminderEmail,
  resolveHosts,
} from "@tidefern/auth";
import { auth, mailer } from "@tidefern/auth/server";
import { db, ownerDatabase } from "@tidefern/db/client";
/* eslint-enable no-restricted-imports */
import { site } from "@/lib/site";

/**
 * Every /api request is forwarded to the framework neutral Hono app: the
 * versioned contract under /api/v1 and Better Auth under /api/auth. The API
 * never imports from Next.js, so the same app can move to its own Vercel
 * project, Node or Workers by changing only the entry file.
 */
// Route handlers are dynamic by default. Keep API work well under the 300 s Hobby ceiling.
export const maxDuration = 60;

// The browser suite reads verification links from the capture mailer
// (architecture 17.1): only when E2E_MAIL_CAPTURE is exactly "true" and the
// server is not a Vercel deployment of any kind, so no preview or production
// ever mounts the endpoint.
const mailCapture =
  process.env.E2E_MAIL_CAPTURE === "true" && !process.env.VERCEL_ENV
    ? { read: capturedMail, clear: clearCapturedMail }
    : undefined;

// The owner's inbox for the two notices the jobs send (architecture 10.1 and
// 11): the dead-queue count and the closure processor notice. While it is
// unset the first is skipped with a warning and a closure past its window
// waits, deleting nothing.
const ownerEmail = process.env.OWNER_EMAIL;

// The job runner (architecture 10.1): the scheduled run at
// /api/internal/jobs/run and the inline drain after a request that enqueued
// work. Its connection is a one-connection pool on the owner role's direct
// string, because the sweep, the reminder step and the closure job work
// under withSystem across every person's rows (7.2). Where
// DATABASE_URL_UNPOOLED is unset (the build, the unit tests and the
// database-free server in CI, a local server started without it) the host
// passes no runner and behaves as before: the endpoint answers 404 and the
// inline drain is a no-op. With it set, the endpoint still answers 404
// until CRON_SECRET is set and the bearer matches. None of these values is
// ever logged.
//
// CI's seeded server has the runner, and E2E_JOBS_SCHEDULED_ONLY=true there
// turns off the inline drain alone, so a closure waits for the scheduled run:
// the browser suite sees the deleting view in a stable state and then runs
// the job itself through the endpoint (task J3d). Like E2E_MAIL_CAPTURE it is
// refused on any Vercel deployment, where the inline drain always runs.
const scheduledOnly = process.env.E2E_JOBS_SCHEDULED_ONLY === "true" && !process.env.VERCEL_ENV;
const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
const jobs: JobsOptions | undefined = ownerUrl
  ? {
      db: ownerDatabase(ownerUrl),
      handlers: jobHandlers,
      cronSecret: process.env.CRON_SECRET,
      // The dead-queue notice goes out through Better Auth's transport.
      mailer,
      ownerEmail,
      // The API's default drain budget assumes Hobby's 300 s, but this route
      // ends at maxDuration: a run stops starting batches halfway there, which
      // leaves the rest for the batch in flight, the sweep and the notice.
      drainBudgetMs: (maxDuration * 1000) / 2,
      inlineDrain: !scheduledOnly,
    }
  : undefined;

// The origins a mutation may come from besides the request's own (the
// production origin and this team's preview pattern), and the secret that
// keys the actor hash in the log lines; without it a line carries no actor.
const app = createApp({
  defer: (task) => after(task),
  auth,
  db,
  crossSite: { trustedOrigins: resolveHosts(hostFactsFromEnvironment(process.env)).trustedOrigins },
  log: { secret: process.env.LOG_HMAC_SECRET },
  mailCapture,
  jobs,
});
// The invitation mail goes out through the same transport as Better Auth's
// (Resend on production, capture under E2E_MAIL_CAPTURE, the console
// otherwise). Without this the invitation route answers 503 and sends nothing.
configureSharing(app, { mailer });
// The reminder emails (task H10): the same transport, the generic template
// from packages/auth, and links on the site's origin (`site.url`: SITE_URL,
// else the host Vercel supplies; architecture 10.2 and 17.1). Without this a
// reminder job fails and dies into the owner notice instead of sending.
configureReminders({ mailer, siteUrl: site.url, template: reminderEmail });
// The account closure job (task I2): the same transport, LOG_HMAC_SECRET for
// the tombstone's keyed hash, and the owner's inbox for the processor
// notice. No object store: photos arrive in Phase 2 and no route writes a
// photo row, so closureHasPhotos is false for every account and the job
// never asks for one; a photo row with no store would stop a closure
// before it destroyed anything.
configureClosure({ mailer, hmacSecret: process.env.LOG_HMAC_SECRET, ownerEmail });
const handler = (request: Request) => app.fetch(request);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
