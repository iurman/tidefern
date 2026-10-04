import type { Instrumentation } from "next";

/**
 * Server error reporting. Only the route pattern, the route type and the
 * error digest are recorded: never request.path (it carries the query
 * string), never headers (they carry cookies), never the message body of
 * an error that might quote user content. Phase 1 writes these as counters
 * through the API's operations table; until then they go to the function log.
 */
export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  console.error(
    JSON.stringify({
      event: "request_error",
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource ?? null,
      digest,
    }),
  );
};
