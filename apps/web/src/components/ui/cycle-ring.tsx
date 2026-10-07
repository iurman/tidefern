import { useId } from "react";
import {
  DEFAULT_CYCLE_LENGTH,
  addDays,
  compareDates,
  diffDays,
  isCalendarDate,
  type CalendarDate,
} from "@tidefern/core";
import type { CyclePrediction } from "@tidefern/schemas";
import { estimateSentence, fertileSentence } from "@/lib/prediction-copy";
import { formatDaySpan } from "./marks-format";
import {
  arcPath,
  clockwiseTangent,
  consecutiveRuns,
  dayEndTurn,
  dayMidTurn,
  dayStartTurn,
  frondCurlPath,
  polarPoint,
} from "./ring-geometry";
import styles from "./cycle-ring.module.css";

/**
 * The cycle ring (DESIGN.md 6.1): the estimated cycle as a clockwise track
 * with day 1 at the top, logged period days solid, the predicted period
 * dashed, the fertile window dotted, ovulation an outlined dot inside a
 * lighter dotted band, the progress arc ending in the frond curl and today
 * as an action dot. The ring is an image; every fact it draws is also a
 * sentence beside it, from lib/prediction-copy (architecture 13.10 word for
 * word). It draws exactly what the API returned: the prediction from GET
 * /v1/cycle/predictions and the latest period start from GET
 * /v1/cycle/status, never a recomputation from period starts, because the
 * grouping of bleeding days and the pregnancy boundary are the server's.
 */

const VIEW = 260;
const CENTER = { x: VIEW / 2, y: VIEW / 2 };
const TRACK_RADIUS = 116;
const PROGRESS_RADIUS = TRACK_RADIUS - 12;
const BAND_RADIUS = TRACK_RADIUS + 11;
const TODAY_HALO_RADIUS = 6.5;
const TODAY_RADIUS = 3.5;
const OVULATION_RADIUS = 3.5;

export interface CycleRingProps {
  /** Today's calendar date in the profile's time zone, from the API (the status `date`); never read from the machine. */
  today: CalendarDate;
  /**
   * The API's prediction (GET /v1/cycle/predictions), drawn as it is. Null,
   * or basis `none`, draws the empty state: a page whose stage pauses
   * predictions shows its own quiet card instead of the ring.
   */
  prediction: CyclePrediction | null;
  /**
   * The latest period start: the status `date` minus `cycleDay` plus one
   * (`latestStartFrom`); null when no period is logged.
   */
  latestStart: CalendarDate | null;
  /** The logged days of the current period, YYYY-MM-DD each, drawn as the solid arc. */
  loggedDays?: CalendarDate[];
  /** Where the empty state's one action leads. */
  logHref?: string;
  /** The values are on their way; the ring keeps its size and says so. */
  loading?: boolean;
  /** What to do next when the cycle could not be loaded. */
  error?: string;
  className?: string;
}

interface RingFacts {
  prediction: CyclePrediction;
  latest: CalendarDate;
  length: number;
  day: number;
}

/**
 * The latest period start from GET /v1/cycle/status: the status date minus
 * the cycle day plus one, or null while no period is logged (cycle day null).
 */
export function latestStartFrom(status: {
  date: CalendarDate;
  cycleDay: number | null;
}): CalendarDate | null {
  if (status.cycleDay === null || !isCalendarDate(status.date)) return null;
  return addDays(status.date, 1 - status.cycleDay);
}

/** "Cycle day 12 of about 28", the ring's accessible name. */
export function cycleDaySentence(day: number, length: number | null): string {
  return length === null ? `Cycle day ${day}` : `Cycle day ${day} of about ${length}`;
}

function facts(props: CycleRingProps): RingFacts | null {
  const { prediction, latestStart, today } = props;
  if (prediction === null || prediction.basis === "none" || latestStart === null) return null;
  // The ring stands for the estimated cycle; without one it keeps the 28 day default for its geometry.
  const length = prediction.cycleLength ?? DEFAULT_CYCLE_LENGTH;
  const day = Math.max(1, diffDays(latestStart, today) + 1);
  return { prediction, latest: latestStart, length, day };
}

/** One-based day of the current cycle for a date. */
function dayOf(latest: CalendarDate, date: CalendarDate): number {
  return diffDays(latest, date) + 1;
}

function Marks({ ring, loggedDays }: { ring: RingFacts; loggedDays: CalendarDate[] }) {
  const { prediction, latest, length, day } = ring;
  // DESIGN.md 6.1: a first guess draws the dashed and dotted arcs only; not
  // enough regular cycles draws the track and the logged arcs only.
  const offered = prediction.basis === "estimate" || prediction.basis === "first_guess";
  const firstGuess = prediction.basis === "first_guess";
  const todayTurn = dayMidTurn(day, length);
  const progressEnd = polarPoint(CENTER, PROGRESS_RADIUS, todayTurn);
  const curl = frondCurlPath(progressEnd, clockwiseTangent(todayTurn), {
    x: CENTER.x - progressEnd.x,
    y: CENTER.y - progressEnd.y,
  });
  const today = polarPoint(CENTER, TRACK_RADIUS, todayTurn);
  const loggedRuns = firstGuess
    ? []
    : consecutiveRuns(
        loggedDays.map((date) => dayOf(latest, date)),
        length,
      );

  let predicted: string | null = null;
  let fertile: string | null = null;
  let band: string | null = null;
  let ovulation: { x: number; y: number } | null = null;
  if (offered && prediction.nextPeriod) {
    // The next period from the start of the API's band to the ring's end.
    const predictedStart = dayOf(latest, prediction.nextPeriod.start);
    predicted = arcPath(CENTER, TRACK_RADIUS, dayStartTurn(predictedStart, length), 1);
  }
  if (offered && prediction.fertileWindow) {
    fertile = arcPath(
      CENTER,
      TRACK_RADIUS,
      dayStartTurn(dayOf(latest, prediction.fertileWindow.start), length),
      dayEndTurn(dayOf(latest, prediction.fertileWindow.end), length),
    );
  }
  if (offered && prediction.ovulation) {
    band = arcPath(
      CENTER,
      BAND_RADIUS,
      dayStartTurn(dayOf(latest, prediction.ovulation.start), length),
      dayEndTurn(dayOf(latest, prediction.ovulation.end), length),
    );
    ovulation = polarPoint(
      CENTER,
      TRACK_RADIUS,
      dayMidTurn(dayOf(latest, prediction.ovulation.expected), length),
    );
  }

  return (
    <>
      {loggedRuns.map(([first, last]) => (
        <path
          key={first}
          className={styles.logged}
          d={arcPath(CENTER, TRACK_RADIUS, dayStartTurn(first, length), dayEndTurn(last, length))}
        />
      ))}
      {band ? <path className={styles.band} d={band} /> : null}
      {predicted ? <path className={styles.predicted} d={predicted} /> : null}
      {fertile ? <path className={styles.fertile} d={fertile} /> : null}
      {ovulation ? (
        <>
          <circle
            className={styles.ovulationHalo}
            cx={ovulation.x}
            cy={ovulation.y}
            r={OVULATION_RADIUS + 3}
          />
          <circle
            className={styles.ovulation}
            cx={ovulation.x}
            cy={ovulation.y}
            r={OVULATION_RADIUS}
          />
        </>
      ) : null}
      <g className={styles.settle}>
        <path className={styles.progress} d={arcPath(CENTER, PROGRESS_RADIUS, 0, todayTurn)} />
        <path className={styles.progress} d={curl} />
      </g>
      <circle className={styles.todayHalo} cx={today.x} cy={today.y} r={TODAY_HALO_RADIUS} />
      <circle className={styles.today} cx={today.x} cy={today.y} r={TODAY_RADIUS} />
    </>
  );
}

export function CycleRing(props: CycleRingProps) {
  const { today, loggedDays = [], logHref = "/log", loading = false, error, className } = props;
  const titleId = useId();
  const ring = loading || error ? null : facts(props);
  const rootClass = [styles.ring, className].filter(Boolean).join(" ");

  let title = "Nothing logged yet";
  if (loading) title = "Loading your cycle";
  else if (error) title = "Your cycle could not be shown";
  else if (ring) title = cycleDaySentence(ring.day, ring.prediction.cycleLength);

  const loggedSpan = [...loggedDays]
    .sort(compareDates)
    .filter((date) => compareDates(date, today) <= 0);
  const estimate = ring ? estimateSentence(ring.prediction) : null;
  const ovulation = ring ? fertileSentence(ring.prediction) : null;

  return (
    <figure className={rootClass} aria-busy={loading || undefined}>
      <div className={styles.dial}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-labelledby={titleId}
          focusable="false"
        >
          <title id={titleId}>{title}</title>
          <circle className={styles.track} cx={CENTER.x} cy={CENTER.y} r={TRACK_RADIUS} />
          {ring ? <Marks ring={ring} loggedDays={loggedDays} /> : null}
        </svg>
        {ring ? (
          <p className={styles.center} aria-hidden="true">
            <span className={styles.numeral}>{ring.day}</span>
            <span className={styles.numeralLabel}>day</span>
          </p>
        ) : null}
      </div>
      <figcaption className={styles.facts}>
        {loading ? <p className={styles.fact}>Loading your cycle</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {!loading && !error && !ring ? (
          <>
            <p className={styles.emptyHeading}>Nothing logged yet</p>
            <p className={styles.fact}>
              Log your last period start and Tidefern can place you in your cycle.
            </p>
            <a className={styles.action} href={logHref}>
              Log a period
            </a>
          </>
        ) : null}
        {ring ? (
          <>
            <p className={styles.fact}>
              {cycleDaySentence(ring.day, ring.prediction.cycleLength)}.
              {loggedSpan.length ? (
                <>
                  {" "}
                  Period logged{" "}
                  {formatDaySpan(loggedSpan[0] as string, loggedSpan.at(-1) as string)}.
                </>
              ) : null}
            </p>
            {estimate ? <p className={`estimate ${styles.estimateLine}`}>{estimate}</p> : null}
            {ovulation ? <p className={styles.fact}>{ovulation}</p> : null}
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
