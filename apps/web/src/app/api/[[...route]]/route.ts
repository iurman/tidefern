import { createApp } from "@tidefern/api";

/**
 * Every /api request is forwarded to the framework neutral Hono app: the
 * versioned contract under /api/v1 and, once wired, Better Auth under
 * /api/auth. The API never imports from Next.js, so the same app can move to
 * its own Vercel project, Node or Workers by changing only the entry file.
 */
// Route handlers are dynamic by default. Keep API work well under the 300 s Hobby ceiling.
export const maxDuration = 60;

const app = createApp({ basePath: "/api" });
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
