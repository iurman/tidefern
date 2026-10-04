import { createRoute } from "@hono/zod-openapi";
import { Health } from "@tidefern/schemas";

export const healthRoute = createRoute({
  method: "get",
  path: "/v1/health",
  tags: ["platform"],
  summary: "Liveness and version",
  responses: {
    200: {
      description: "The API is reachable",
      content: { "application/json": { schema: Health } },
    },
  },
});
