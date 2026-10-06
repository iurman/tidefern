import { todayIn } from "@tidefern/core";

/**
 * The pure parts of the devices list: turning the session rows Better Auth
 * returns into what a `DeviceRow` shows. No React, no network, so the unit
 * tests cover every branch.
 */

/** The fields of a Better Auth session row the list reads. */
export interface SessionFacts {
  id: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  userAgent?: string | null | undefined;
}

export interface DeviceFacts {
  id: string;
  token: string;
  /** "Firefox on Linux", from the user agent the session recorded. */
  browser: string;
  /** The last day a request arrived, `YYYY-MM-DD` in the given time zone. */
  lastSeen: string;
  current: boolean;
}

const browsers: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\/|\bHeadlessChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const platforms: Array<[RegExp, string]> = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMacintosh\b|\bMac OS X\b/, "Mac"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * The browser and platform a user agent names, in the words the design
 * uses ("Firefox on Linux"). Order matters: Edge and Opera carry a Chrome
 * token, Chrome on iOS carries Safari's, and an iPad carries "Mac OS X".
 * An unknown or missing agent reads as "A browser" rather than the raw
 * string, which is not for people.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "A browser";
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return `A browser on ${platform}`;
  return "A browser";
}

/** The calendar day of an instant in a time zone; an unreadable instant falls back to today. */
export function calendarDayOf(value: string | Date, timeZone: string, now = new Date()): string {
  const instant = value instanceof Date ? value : new Date(value);
  return todayIn(timeZone, Number.isNaN(instant.getTime()) ? now : instant);
}

/**
 * The rows for the list: the current session first, then the others by
 * their last request, newest first. `currentId` is the session the page is
 * being read on; without it (the session lookup failed) no row is current
 * and no row offers to sign the others out.
 */
export function toDevices(
  sessions: readonly SessionFacts[],
  currentId: string | null,
  timeZone: string,
  now = new Date(),
): DeviceFacts[] {
  const instant = (session: SessionFacts) => {
    const updated = new Date(session.updatedAt).getTime();
    return Number.isNaN(updated) ? new Date(session.createdAt).getTime() : updated;
  };
  return [...sessions]
    .sort((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      return instant(b) - instant(a);
    })
    .map((session) => ({
      id: session.id,
      token: session.token,
      browser: describeUserAgent(session.userAgent),
      lastSeen: calendarDayOf(session.updatedAt ?? session.createdAt, timeZone, now),
      current: session.id === currentId,
    }));
}
