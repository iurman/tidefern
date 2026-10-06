import type { Context } from "hono";

/**
 * The template of the route the request matched, such as `/api/v1/notes/:id`,
 * never the concrete path. Hono matches every handler up front, so the
 * final route is known inside a middleware before `next()` runs; the last
 * match that is not an `ALL` (a `use()` registration) is the route. When
 * no route matched, the answer is the middleware's own pattern, which is a
 * template too.
 */
export function routeTemplate(c: Context): string {
  const routes = c.req.matchedRoutes;
  for (let index = routes.length - 1; index >= 0; index -= 1) {
    const route = routes[index];
    if (route !== undefined && route.method !== "ALL") return route.path;
  }
  return c.req.routePath;
}
