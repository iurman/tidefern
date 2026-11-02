/**
 * A full navigation: the next page renders on the server with the session
 * as it now stands (signed out, or locked by a closure), which a client
 * route change would not read again. One function so a test can stand in
 * for the browser's navigation.
 */
export function goTo(path: string): void {
  window.location.assign(path);
}
