import type { Context } from "hono";
import type { Problem } from "@tidefern/schemas";

const PROBLEM_BASE = "https://tidefern.app/problems/";

export type ProblemCode =
  "not_found" | "validation_failed" | "unauthenticated" | "forbidden" | "rate_limited" | "internal";

const TITLES: Record<ProblemCode, string> = {
  not_found: "Not found",
  validation_failed: "Validation failed",
  unauthenticated: "Sign in required",
  forbidden: "Not allowed",
  rate_limited: "Too many requests",
  internal: "Something went wrong",
};

export function problem(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
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
