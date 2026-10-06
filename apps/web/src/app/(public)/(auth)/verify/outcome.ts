export type VerifyOutcome = "confirmed" | "failed" | "none";

/**
 * Reads what Better Auth's redirect says. The sign-up sends the callback
 * `/verify?done=1`; the server redirects to it as given after a verification
 * and appends `error=` when the token is missing, used or expired, so an
 * error wins over the marker. Without either nobody was sent here.
 */
export function readVerifyOutcome(
  query: Record<string, string | string[] | undefined>,
): VerifyOutcome {
  if (typeof query.error === "string" && query.error.length > 0) return "failed";
  if (typeof query.done === "string" && query.done.length > 0) return "confirmed";
  return "none";
}
