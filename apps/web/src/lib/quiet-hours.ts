/**
 * Quiet hours for interface sound (architecture 14.2): a start and an end
 * time in the person's day between which every cue stays silent. Times are
 * `HH:MM` strings in the day the profile's time zone defines; until task E2
 * carries the profile's zone, the device's local clock is the day. The
 * window may cross midnight (22:00 to 07:00), which is the common case.
 *
 * Only pure functions live here, so the unit tests cover the math and the
 * sound library decides when to read the clock.
 */

export interface QuietHours {
  /** Start of silence, `HH:MM`, 24 hour. */
  start: string;
  /** End of silence, `HH:MM`, 24 hour. The window crosses midnight when end is before start. */
  end: string;
}

/** The device storage key, beside `tidefern-sound-v1`; the privacy page should list both (requested of the lead). */
export const QUIET_HOURS_KEY = "tidefern-quiet-hours-v1";

const MINUTES_PER_DAY = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Whether a string is a valid `HH:MM` time. */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/** Minutes since midnight for a valid `HH:MM`; throws on anything else so a bad write cannot go quiet. */
export function toMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Not a clock time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight of a local clock reading. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * True when `minutes` (since midnight) falls inside the window. The start is
 * inclusive and the end exclusive, so 22:00 to 07:00 silences 22:00 and
 * plays again at 07:00 exactly. A window whose start equals its end is
 * empty: nothing is silenced, which is what an untouched pair of fields
 * means.
 */
export function isWithinQuietHours(window: QuietHours | null, minutes: number): boolean {
  if (!window) return false;
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  const now = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  // Crosses midnight: silent from start to the end of the day, and from midnight to end.
  return now >= start || now < end;
}

/** Parses what storage holds; anything malformed reads as no quiet hours. */
export function parseQuietHours(raw: string | null | undefined): QuietHours | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      isClockTime((parsed as { start?: unknown }).start) &&
      isClockTime((parsed as { end?: unknown }).end)
    ) {
      const { start, end } = parsed as QuietHours;
      return { start, end };
    }
  } catch {
    // Not JSON: treated as unset below.
  }
  return null;
}

/** The storage form of a window. */
export function serializeQuietHours(window: QuietHours): string {
  return JSON.stringify({ start: window.start, end: window.end });
}

/** A short sentence for the settings page and the chapter: "Quiet from 22:00 to 07:00". */
export function describeQuietHours(window: QuietHours | null): string {
  if (!window || window.start === window.end) return "No quiet hours";
  return `Quiet from ${window.start} to ${window.end}`;
}
