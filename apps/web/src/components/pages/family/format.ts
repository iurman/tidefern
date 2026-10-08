import { MILLILITRES_PER_US_FLUID_OUNCE, diffDays, isCalendarDate } from "@tidefern/core";
import { formatChildAge } from "@/lib/child-age";
import type { UnitSystem } from "./types";

/**
 * The family screens' wording for times, durations and volumes (architecture
 * 13.10: en-US through `Intl`, in the profile's time zone, one module so a
 * later locale is a translation). Every function is pure: "now" and "today"
 * arrive as arguments from the server, never from the machine clock, except
 * the feed timer's elapsed time, which the brief keeps on the client.
 */

const MINUTE_MS = 60_000;

/** A no-break space, so "2:15 PM" and "4 h 30 min" never wrap inside themselves. */
const NBSP = "\u00a0";

/**
 * "just now", "5 min ago", "2 h ago", "1 day ago", "3 days ago": how long
 * before `now` an instant was. An instant after `now` (another device's
 * clock running ahead) reads as just now rather than as the future.
 */
export function formatTimeSince(instant: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(instant);
  if (!Number.isFinite(elapsed)) throw new TypeError("formatTimeSince takes an ISO instant");
  if (elapsed < MINUTE_MS) return "just now";
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 60) return `${minutes}${NBSP}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** "2:15 PM": an instant's time of day in the profile's time zone. */
export function formatClock(instant: string, timeZone: string): string {
  let clock = clocks.get(timeZone);
  if (clock === undefined) {
    clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    clocks.set(timeZone, clock);
  }
  // ICU separates the day period with a narrow no-break space; one plain no-break space for all.
  return clock.format(new Date(instant)).replace(/[\u202f\u00a0 ]/g, NBSP);
}

/** Whole minutes from one instant to a later one; never negative. */
export function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS));
}

/** "45 min", "2 h", "4 h 30 min". */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}${NBSP}min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}${NBSP}h` : `${hours}${NBSP}h ${rest}${NBSP}min`;
}

/**
 * A stored volume in the profile's units: millilitres to the nearest 10 ml,
 * or fluid ounces to the nearest half (the H5 Accepts). Storage stays the
 * exact millilitres; this is display only.
 */
export function formatVolume(millilitres: number, units: UnitSystem): string {
  if (units === "imperial") {
    const halves = Math.round((millilitres / MILLILITRES_PER_US_FLUID_OUNCE) * 2) / 2;
    return halves === 0 ? `under 0.5${NBSP}fl oz` : `${halves}${NBSP}fl oz`;
  }
  const tens = Math.round(millilitres / 10) * 10;
  return tens === 0 ? `under 10${NBSP}ml` : `${tens}${NBSP}ml`;
}

/** "05:12" or "1:02:03": a running timer, from milliseconds. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/**
 * The child's age in the one wording every screen uses (`formatChildAge`).
 * A grantee in a zone behind the guardian's can read a date of birth that
 * is still tomorrow for her; that child was born today somewhere, so it
 * reads as born today instead of failing the page.
 */
export function childAge(dateOfBirth: string, today: string): string {
  if (isCalendarDate(dateOfBirth) && isCalendarDate(today) && diffDays(dateOfBirth, today) < 0) {
    return formatChildAge(dateOfBirth, dateOfBirth);
  }
  return formatChildAge(dateOfBirth, today);
}
