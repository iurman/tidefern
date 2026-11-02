/**
 * Where the (app) layout sends a signed-out visitor who asked for `path`
 * (task J3b): the sign-in page with that path as `?next=`, so the sign-in
 * returns them to it, and plain /sign-in for Today, where a sign-in lands
 * anyway. Written out by hand rather than imported from the app, so a
 * change to the app's encoding shows up here as a failing spec.
 */
export function signInRedirect(path: string): string {
  return path === "/today" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(path)}`;
}

/** The whole address of that redirect as a pattern for `toHaveURL`, anchored at the end. */
export function signInUrl(path: string): RegExp {
  return new RegExp(`${signInRedirect(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}
