import type { SettingsCallError } from "@/lib/auth-client";
import { freshAuthRequired } from "@/lib/auth-client";

/**
 * Every string the devices route shows, in one module (architecture
 * 13.10). `docs/design/CONTENT.md` carries the route's empty-state row
 * ("Only this device", rendered by `DeviceRow` itself); the rest is written
 * to its voice table (pending says what is happening, failure says what to
 * do next) and is an owner input, listed in the C4 report. Nothing here
 * names a health fact: the route is about browsers and sign-ins only.
 */
export const devicesCopy = {
  title: "Devices",
  description: "The browsers and phones signed in to your account.",
  heading: "Devices",
  lede: "Every browser and phone signed in to your account. Sign out any you do not recognize.",
  loading: "Loading your devices",
  loadFailed: "We could not load your devices. Reload the page to try again.",
  reload: "Reload",
  none: {
    heading: "No devices listed",
    why: "Your sign-ins appear here once the list loads. Reload the page to try again.",
  },
  revokeOne: {
    title: "Sign out this device?",
    body: "That browser will need to sign in again. Nothing saved in your account changes.",
    confirm: "Sign out the device",
    pending: "Signing out",
    done: "That device is signed out.",
  },
  revokeOthers: {
    title: (count: number) =>
      count === 1 ? "Sign out the other device?" : `Sign out ${count} other devices?`,
    body: "Every other browser and phone will need to sign in again. This one stays signed in.",
    confirm: (count: number) =>
      count === 1 ? "Sign out the other device" : `Sign out ${count} devices`,
    pending: "Signing out",
    done: (count: number) =>
      count === 1 ? "The other device is signed out." : `${count} devices are signed out.`,
  },
  freshAuth: {
    sentence:
      "For safety, signing out a device needs a sign-in from the last ten minutes. Sign in again, then come back here.",
    // Better Auth's own rule on listing sessions: the list needs a recent sign-in, not a reload.
    list: "For safety, this list needs a recent sign-in. Sign in again, then come back here.",
    action: "Sign in again",
  },
  cancel: "Cancel",
  twoFactorLink: "Two-step sign-in",
} as const;

/** The sentence under a failed revocation: what to do next, never only that it failed. */
export function describeRevokeFailure(error: SettingsCallError | null | undefined): string {
  if (freshAuthRequired(error)) return devicesCopy.freshAuth.sentence;
  if (error === null || error === undefined || error.status === 0) {
    return "We could not reach Tidefern. Check your connection and try again.";
  }
  if (error.status === 429) return "Too many attempts in a row. Wait a minute and try again.";
  if (error.code === "SESSION_NOT_FOUND" || error.status === 404) {
    return "That device is already signed out. Reload the page to see the current list.";
  }
  if (error.status >= 500)
    return "Tidefern had a problem on our side. Wait a moment and try again.";
  return "We could not sign that device out. Try again.";
}
