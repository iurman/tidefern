import { addDays, compareDates, diffDays, isCalendarDate, type CalendarDate } from "@tidefern/core";
import {
  FLOW_LABELS,
  MOOD_LABELS,
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  isPeriodFlow,
} from "@tidefern/schemas";
import type {
  CycleEntry,
  CyclePrediction,
  FlowLevel,
  MoodCode,
  Note,
  SymptomCode,
} from "@tidefern/schemas";
import {
  firstOfMonth,
  startOfWeek,
  type DayMark,
  type DayWindow,
  type WeekStart,
} from "@/components/ui/calendar-dates";
import type { DayListItem } from "@/components/ui/day-list";
import { formatChildAge } from "@/lib/child-age";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";

/**
 * What the calendar draws, from the API's answers (DESIGN.md 3.4, 6.2 and
 * 6.3): the days she logged as solid pills and dots, the API's prediction as
 * the dashed period band and the dotted fertile window, the list rows, and
 * the month the page shows. Pure: no clock, no DOM, no request. Every date
 * is a `YYYY-MM-DD` string the API already placed in her time zone, and
 * `today` is always the API's.
 */

export type CalendarViewName = "month" | "list";

/** One day the calendar knows about: the entry's three fields, and whether a note sits on it. */
export interface CalendarDay {
  date: CalendarDate;
  flow: FlowLevel | null;
  symptoms: SymptomCode[];
  mood: MoodCode | null;
  /** A note is filed on the day. Only the fact travels to the page, never the text. */
  note: boolean;
}

/* ------------------------------------------------------------------------ */
/* The month                                                                 */
/* ------------------------------------------------------------------------ */

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

/**
 * The years a month address may name. Wider than any calendar a person
 * keeps, and narrow enough that every date in it is a four-digit year the
 * date helpers read as written (a two-digit `Date.UTC` year is read as 19xx).
 */
const FIRST_YEAR = 1900;
const LAST_YEAR = 2999;

/** The first day of the month `?month=YYYY-MM` names, or of today's month when it names none. */
export function monthFromParam(
  value: string | string[] | undefined,
  today: CalendarDate,
): CalendarDate {
  const raw = Array.isArray(value) ? value[0] : value;
  const year = Number(raw?.slice(0, 4));
  if (
    raw !== undefined &&
    MONTH_PARAM.test(raw) &&
    year >= FIRST_YEAR &&
    year <= LAST_YEAR &&
    isCalendarDate(`${raw}-01`)
  ) {
    return `${raw}-01`;
  }
  return firstOfMonth(today);
}

/** `?view=list` opens the list; anything else, or nothing, the month. */
export function viewFromParam(value: string | string[] | undefined): CalendarViewName {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "list" ? "list" : "month";
}

/** The first day of the month `delta` months from `month`'s. */
export function shiftMonth(month: CalendarDate, delta: number): CalendarDate {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + delta;
  const shiftedYear = Math.floor(index / 12);
  const shiftedMonth = index - shiftedYear * 12 + 1;
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}-01`;
}

export function lastOfMonth(month: CalendarDate): CalendarDate {
  return addDays(shiftMonth(month, 1), -1);
}

export function inMonth(date: CalendarDate, month: CalendarDate): boolean {
  return date.slice(0, 7) === month.slice(0, 7);
}

/**
 * Every day the month grid draws, neighbours included: the week that holds
 * the first through the week that holds the last, in her week start. One
 * read of this range serves the grid, the list and this week's strip.
 */
export function gridRange(
  month: CalendarDate,
  weekStart: WeekStart,
): { from: CalendarDate; to: CalendarDate } {
  const first = firstOfMonth(month);
  return {
    from: startOfWeek(first, weekStart),
    to: addDays(startOfWeek(lastOfMonth(first), weekStart), 6),
  };
}

/**
 * The calendar's address for a month and a view: `/calendar` for today's
 * month in the month view, with `month=YYYY-MM` and `view=list` only when
 * they differ. A month is a date, never a health fact, so it may ride in
 * the query.
 */
export function calendarHref(input: {
  month: CalendarDate;
  view: CalendarViewName;
  today: CalendarDate;
}): string {
  const query = new URLSearchParams();
  if (!inMonth(input.month, input.today)) query.set("month", input.month.slice(0, 7));
  if (input.view === "list") query.set("view", "list");
  const search = query.toString();
  return search === "" ? "/calendar" : `/calendar?${search}`;
}

/** The day sheet's page for a date. */
export function logHref(date: CalendarDate): string {
  return `/log/${date}`;
}

const LOG_HREF = /^\/log\/(\d{4}-\d{2}-\d{2})$/;

/** The date a `/log/YYYY-MM-DD` link opens, or null for any other address. */
export function dateFromLogHref(href: string | null): CalendarDate | null {
  if (href === null) return null;
  const match = LOG_HREF.exec(href);
  const date = match?.[1];
  return date !== undefined && isCalendarDate(date) ? date : null;
}

/* ------------------------------------------------------------------------ */
/* From the API to days                                                      */
/* ------------------------------------------------------------------------ */

const SYMPTOM_ORDER = new Map<string, number>(SYMPTOM_CODES.map((code, index) => [code, index]));

function inPickerOrder(symptoms: readonly SymptomCode[]): SymptomCode[] {
  return [...new Set(symptoms)].sort(
    (a, b) => (SYMPTOM_ORDER.get(a) ?? 0) - (SYMPTOM_ORDER.get(b) ?? 0),
  );
}

/**
 * The days of a range from the two list answers (GET /v1/cycle/entries and
 * GET /v1/notes over the same dates): each live entry's fields, and whether
 * a live note of any category sits on the day. Tombstones are dropped.
 * Oldest first.
 */
export function calendarDaysFrom(
  entries: readonly CycleEntry[],
  notes: readonly Note[],
): CalendarDay[] {
  const days = new Map<CalendarDate, CalendarDay>();
  const dayFor = (date: CalendarDate): CalendarDay => {
    const known = days.get(date);
    if (known) return known;
    const created: CalendarDay = { date, flow: null, symptoms: [], mood: null, note: false };
    days.set(date, created);
    return created;
  };
  for (const entry of entries) {
    if (entry.deletedAt !== null || entry.date === undefined) continue;
    const day = dayFor(entry.date);
    day.flow = entry.flow ?? null;
    day.symptoms = inPickerOrder(entry.symptoms ?? []);
    day.mood = entry.mood ?? null;
  }
  for (const note of notes) {
    if (note.deletedAt !== undefined) continue;
    dayFor(note.date).note = true;
  }
  return [...days.values()].sort((a, b) => compareDates(a.date, b.date));
}

/** Something was logged: a flow, a symptom, a mood or a note. A saved note counts, as the sheet promises. */
export function isLoggedDay(day: CalendarDay): boolean {
  return day.flow !== null || day.symptoms.length > 0 || day.mood !== null || day.note;
}

/* ------------------------------------------------------------------------ */
/* Words                                                                     */
/* ------------------------------------------------------------------------ */

const FLOW_WORDS: Record<FlowLevel, string> = {
  none: "no flow",
  spotting: FLOW_LABELS.spotting.toLowerCase(),
  light: `${FLOW_LABELS.light.toLowerCase()} flow`,
  medium: `${FLOW_LABELS.medium.toLowerCase()} flow`,
  heavy: `${FLOW_LABELS.heavy.toLowerCase()} flow`,
};

/** What was logged on a day, in lower case: "heavy flow, cramps, fatigue, low mood, note". */
export function dayWords(day: CalendarDay): string {
  const words: string[] = [];
  if (day.flow !== null) words.push(FLOW_WORDS[day.flow]);
  for (const symptom of day.symptoms) words.push(SYMPTOM_LABELS[symptom].toLowerCase());
  if (day.mood !== null) words.push(`${MOOD_LABELS[day.mood].toLowerCase()} mood`);
  if (day.note) words.push("note");
  return [...new Set(words)].join(", ");
}

/** The same words as a row's summary, in sentence case: "Heavy flow, cramps, fatigue, note". */
export function daySummary(day: CalendarDay): string {
  const words = dayWords(day);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ------------------------------------------------------------------------ */
/* Drawing                                                                   */
/* ------------------------------------------------------------------------ */

/** The words a logged period day adds to its accessible name. */
export const LOGGED_PERIOD_WORDS = "period logged";
/** The words each day of the predicted period band adds. */
export const EXPECTED_PERIOD_WORDS = "period expected";
/** Every fertile-window day carries the contraception line in its own name. */
export const FERTILE_WORDS = `fertile window estimated. ${CONTRACEPTION_LINE}`;
export const OVULATION_WORDS = "ovulation estimated";

/**
 * The logged period as solid pills: each run of consecutive days whose flow
 * is light, medium or heavy. Spotting and none are not a period, so they get
 * the logged-day dot and no pill. This draws what she logged; which day
 * starts a period stays the server's decision.
 */
export function loggedWindows(days: readonly CalendarDay[]): DayWindow[] {
  const periodDays = days
    .filter((day) => isPeriodFlow(day.flow))
    .map((day) => day.date)
    .sort(compareDates);
  const windows: DayWindow[] = [];
  for (const date of periodDays) {
    const last = windows.at(-1);
    if (last !== undefined && diffDays(last.end, date) === 1) {
      last.end = date;
    } else {
      windows.push({ start: date, end: date, texture: "logged", words: LOGGED_PERIOD_WORDS });
    }
  }
  return windows;
}

/**
 * The API's prediction as the grid draws it (DESIGN.md 6.1 and 6.2): the
 * next period's whole band, start to end, dashed, so a wider uncertainty
 * draws a longer band; the fertile window dotted; ovulation as the outlined
 * point on its expected day. Only an estimate or a first guess offers dates.
 * Not enough regular cycles and basis none draw nothing, whatever else the
 * answer carries.
 */
export function predictionMarks(prediction: CyclePrediction | null): {
  windows: DayWindow[];
  points: DayMark[];
} {
  if (prediction === null) return { windows: [], points: [] };
  if (prediction.basis !== "estimate" && prediction.basis !== "first_guess") {
    return { windows: [], points: [] };
  }
  const windows: DayWindow[] = [];
  const points: DayMark[] = [];
  if (prediction.nextPeriod !== null) {
    windows.push({
      start: prediction.nextPeriod.start,
      end: prediction.nextPeriod.end,
      texture: "predicted",
      words: EXPECTED_PERIOD_WORDS,
    });
  }
  if (prediction.fertileWindow !== null) {
    windows.push({
      start: prediction.fertileWindow.start,
      end: prediction.fertileWindow.end,
      texture: "estimated",
      words: FERTILE_WORDS,
    });
  }
  if (prediction.ovulation !== null) {
    points.push({ date: prediction.ovulation.expected, words: OVULATION_WORDS });
  }
  return { windows, points };
}

/** The 4 px dot on every logged day, its words naming what was logged. */
export function notedMarks(days: readonly CalendarDay[]): DayMark[] {
  return days.filter(isLoggedDay).map((day) => ({ date: day.date, words: dayWords(day) }));
}

/** Everything the grid and the strip draw, in one call. */
export function calendarMarks(
  days: readonly CalendarDay[],
  prediction: CyclePrediction | null,
): { windows: DayWindow[]; points: DayMark[]; noted: DayMark[] } {
  const predicted = predictionMarks(prediction);
  return {
    windows: [...loggedWindows(days), ...predicted.windows],
    points: predicted.points,
    noted: notedMarks(days),
  };
}

/** Whether any day of `month` itself (not its neighbours in the grid) has something logged. */
export function hasLoggedDayIn(days: readonly CalendarDay[], month: CalendarDate): boolean {
  return days.some((day) => inMonth(day.date, month) && isLoggedDay(day));
}

/** The list view's rows: the month's logged days, each with its words and its sheet. */
export function listItems(days: readonly CalendarDay[], month: CalendarDate): DayListItem[] {
  return days
    .filter((day) => inMonth(day.date, month) && isLoggedDay(day))
    .map((day) => ({ date: day.date, summary: daySummary(day), href: logHref(day.date) }));
}

/* ------------------------------------------------------------------------ */
/* After a birth                                                             */
/* ------------------------------------------------------------------------ */

export interface ChildFacts {
  id: string;
  displayName: string;
  dateOfBirth: CalendarDate;
}

/**
 * The child whose age the postpartum calendar shows (architecture 8.4): the
 * youngest child she is a guardian of, born on or before today. The ages
 * come from `formatChildAge`, the one wording every screen uses.
 */
export function childAgeLine(
  children: readonly ChildFacts[],
  guardianOf: readonly string[],
  today: CalendarDate,
): string | null {
  const guarded = children
    .filter((child) => guardianOf.includes(child.id))
    .filter((child) => isCalendarDate(child.dateOfBirth))
    .filter((child) => compareDates(child.dateOfBirth, today) <= 0)
    .sort((a, b) => compareDates(b.dateOfBirth, a.dateOfBirth));
  const youngest = guarded[0];
  if (youngest === undefined) return null;
  const age = formatChildAge(youngest.dateOfBirth, today);
  return `${youngest.displayName}, ${age.charAt(0).toLowerCase()}${age.slice(1)}`;
}
