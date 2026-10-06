import { useId } from "react";
import {
  DEFAULT_CYCLE_LENGTH,
  addDays,
  compareDates,
  cycleDay,
  diffDays,
  predictCycle,
  type CalendarDate,
  type CyclePrediction,
  type PeriodStart,
} from "@tidefern/core";
import { formatDay, formatDaySpan } from "./marks-format";
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
 * sentence beside it, using the templates from architecture 13.10 word for
 * word. All cycle math comes from @tidefern/core.
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
  /** Today's calendar date in the profile's time zone; never read from the machine. */
  today: CalendarDate;
  /** Every logged period start the estimate may use; an empty list is the empty state. */
  periodStarts: PeriodStart[];
  /** The logged days of the current period, YYYY-MM-DD each, drawn as the solid arc. */
  loggedDays?: CalendarDate[];
  /** Period starts on or before this date are ignored, for example the date a pregnancy ended. */
  since?: CalendarDate;
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

function pluralCycles(count: number): string {
  return count === 1 ? "cycle" : `${count} cycles`;
}

/** The estimate sentence from architecture 13.10, chosen by the prediction's basis. */
export function estimateSentence(prediction: CyclePrediction): string {
  const { basis, nextPeriodStart, uncertaintyDays, sampleSize } = prediction;
  if (basis === "not_enough_regular_cycles" || !nextPeriodStart) {
    return "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.";
  }
  if (basis === "first_guess") {
    return `Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around ${formatDay(nextPeriodStart)}, give or take ${uncertaintyDays} days.`;
  }
  const from = formatDay(addDays(nextPeriodStart, -uncertaintyDays));
  const to = formatDay(addDays(nextPeriodStart, uncertaintyDays));
  return `Based on your last ${pluralCycles(sampleSize)}, your next period will likely start between ${from} and ${to}.`;
}

/** The ovulation and fertile days sentence from architecture 13.10, or null when nothing is estimated. */
export function ovulationSentence(prediction: CyclePrediction): string | null {
  const { ovulation, fertileWindow, ovulationBandDays } = prediction;
  if (!ovulation || !fertileWindow) return null;
  const band = formatDaySpan(
    addDays(ovulation, -ovulationBandDays),
    addDays(ovulation, ovulationBandDays),
  );
  const window = formatDaySpan(fertileWindow.start, fertileWindow.end);
  return `Ovulation is estimated around ${formatDay(ovulation)} (${band}). ${window} are the days pregnancy is most likely. An estimate from your logged dates. Not a form of contraception.`;
}

/** "Cycle day 12 of about 28", the ring's accessible name. */
export function cycleDaySentence(day: number, length: number | null): string {
  return length === null ? `Cycle day ${day}` : `Cycle day ${day} of about ${length}`;
}

function facts(props: CycleRingProps): RingFacts | null {
  const { periodStarts, since, today } = props;
  const prediction = predictCycle(periodStarts, since ? { since } : {});
  if (!prediction) return null;
  const counted = since
    ? periodStarts.filter((start) => compareDates(start.date, since) > 0)
    : periodStarts;
  const latest = [...counted].sort((a, b) => compareDates(a.date, b.date)).at(-1);
  if (!latest) return null;
  const length = prediction.cycleLength ?? DEFAULT_CYCLE_LENGTH;
  const day = Math.max(1, cycleDay(latest.date, today));
  return { prediction, latest: latest.date, length, day };
}

/** One-based day of the current cycle for a date. */
function dayOf(latest: CalendarDate, date: CalendarDate): number {
  return diffDays(latest, date) + 1;
}

function Marks({ ring, loggedDays }: { ring: RingFacts; loggedDays: CalendarDate[] }) {
  const { prediction, latest, length, day } = ring;
  const offered = prediction.basis !== "not_enough_regular_cycles";
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
  if (offered && prediction.nextPeriodStart) {
    const predictedStart = dayOf(
      latest,
      addDays(prediction.nextPeriodStart, -prediction.uncertaintyDays),
    );
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
    const ovulationDay = dayOf(latest, prediction.ovulation);
    band = arcPath(
      CENTER,
      BAND_RADIUS,
      dayStartTurn(ovulationDay - prediction.ovulationBandDays, length),
      dayEndTurn(ovulationDay + prediction.ovulationBandDays, length),
    );
    ovulation = polarPoint(CENTER, TRACK_RADIUS, dayMidTurn(ovulationDay, length));
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
  const ovulation = ring ? ovulationSentence(ring.prediction) : null;

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
            <p className={styles.estimate}>{estimateSentence(ring.prediction)}</p>
            {ovulation ? <p className={styles.fact}>{ovulation}</p> : null}
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
