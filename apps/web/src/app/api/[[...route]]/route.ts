import { after } from "next/server";
import { createApp } from "@tidefern/api";
// This file is the host entry, the one place in apps/web that hands the
// server-side auth instance and the database to the API. Every other module
// in the app talks to the API over HTTP or the in-process client and never
// imports either package; the ESLint rule stays on for them.
/* eslint-disable no-restricted-imports -- host wiring for the API, see above */
import { auth } from "@tidefern/auth/server";
import { db } from "@tidefern/db/client";
/* eslint-enable no-restricted-imports */

/**
 * Every /api request is forwarded to the framework neutral Hono app: the
 * versioned contract under /api/v1 and Better Auth under /api/auth. The API
 * never imports from Next.js, so the same app can move to its own Vercel
 * project, Node or Workers by changing only the entry file.
 */
// Route handlers are dynamic by default. Keep API work well under the 300 s Hobby ceiling.
export const maxDuration = 60;

const app = createApp({ defer: (task) => after(task), auth, db });
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
