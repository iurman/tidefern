import { createApp } from "@tidefern/api";

/**
 * Every /api/v1 request is forwarded to the framework neutral Hono app. The
 * API never imports from Next.js, so the same app can move to its own Vercel
 * project, Node or Workers by changing only the entry file.
 */
export const dynamic = "force-dynamic";

const app = createApp({ basePath: "/api/v1" });
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
