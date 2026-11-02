/**
 * Leaves onboarding with a full navigation, so the next page is rendered
 * on the server with the profile that now exists (the (app) layout reads
 * it there). Its own module so a component test can stand in for it: a
 * test browser cannot spy on `location.assign`.
 */
export function leaveTo(path: string): void {
  window.location.assign(path);
}
