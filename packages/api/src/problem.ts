import type { Context } from "hono";
import type { Problem } from "@tidefern/schemas";

// A URN, not a URL: RFC 9457 does not require a resolvable type, and the domain is still an owner input.
const PROBLEM_BASE = "urn:tidefern:problem:";

export type ProblemCode =
  | "not_found"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "upgrade_required"
  | "internal";

const TITLES: Record<ProblemCode, string> = {
  not_found: "Not found",
  validation_failed: "Validation failed",
  unauthenticated: "Sign in required",
  forbidden: "Not allowed",
  conflict: "Conflict",
  rate_limited: "Too many requests",
  upgrade_required: "Update required",
  internal: "Something went wrong",
};

export function problem(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 426 | 429 | 500,
  code: ProblemCode,
  extra: Partial<Pick<Problem, "detail" | "errors">> = {},
) {
  const body: Problem = {
    type: `${PROBLEM_BASE}${code}`,
    title: TITLES[code],
    status,
    code,
    instance: c.req.path,
    ...extra,
  };
  return c.json(body, status, { "Content-Type": "application/problem+json" });
}
