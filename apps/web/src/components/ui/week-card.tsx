import { useId } from "react";
import {
  GESTATION_DAYS,
  addDays,
  gestationalAge,
  type CalendarDate,
  type DatingMethod,
} from "@tidefern/core";
import { formatDaySpan, formatDayWithYear, pluralDays } from "./marks-format";
import { wavePath } from "./ring-geometry";
import styles from "./week-card.module.css";

/**
 * The pregnancy week card (DESIGN.md 6.4): the week and days as Figtree
 * numerals beside Newsreader labels, the week's date range, the trimester
 * bar drawn with the tide line (the current segment solid, the rest dashed),
 * the due date, the dating method with a link to the history, and days to
 * go. It sits on warmth because the current week is the one highlighted
 * thing on /journey. No renders, no fruit, no daily tips. The partner's card
 * is the paused variant once the pregnancy has ended, and it never says why.
 *
 * A grantee's card while the pregnancy continues is the same card without
 * the Dating row: the API never sends a grantee the dating method, and the
 * history is hers alone, so the card draws only what it was given rather
 * than a method it would have to guess.
 */

const TRIMESTER_ENDS = [98, 196, GESTATION_DAYS] as const;
const BAR_WIDTH = 280;
const BAR_HEIGHT = 12;
const BAR_GAP = 4;

export interface WeekCardProps {
  /** Today's calendar date in the profile's time zone; never read from the machine. */
  today: CalendarDate;
  /** The one due date on record; absent is the empty state. */
  dueDate?: CalendarDate;
  /** How the due date was set. Absent on a grantee's card, which then has no Dating row. */
  method?: DatingMethod;
  /** Where "History" leads: the dating changes the person can see. Null leaves the link out. */
  historyHref?: string | null;
  /** Where the empty state's one action leads. */
  startHref?: string;
  /** The partner's card after the pregnancy has ended. */
  paused?: boolean;
  /**
   * The active card sits on warmth as the one highlighted thing on the
   * screen; false keeps it on the surface when another card on the same
   * screen already holds the warmth.
   */
  highlight?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
}

/** How each dating method reads, here and in the due date history she can open. */
export const datingMethodLabels: Record<DatingMethod, string> = {
  lmp: "Dated from your last period",
  ultrasound: "Dated from an ultrasound",
  transfer: "Dated from the transfer",
  manual: "Due date entered by hand",
};

const trimesterNames = ["First trimester", "Second trimester", "Third trimester"] as const;

/** "108 days to go", "Due today", "3 days past the due date". */
export function daysToGoSentence(totalDays: number): string {
  const left = GESTATION_DAYS - totalDays;
  if (left === 0) return "Due today";
  if (left < 0) return `${pluralDays(-left)} past the due date`;
  return `${pluralDays(left)} to go`;
}

function TrimesterBar({ trimester }: { trimester: 1 | 2 | 3 }) {
  const segments = TRIMESTER_ENDS.map((end, index) => {
    const start = index === 0 ? 0 : (TRIMESTER_ENDS[index - 1] ?? 0);
    const width = ((end - start) / GESTATION_DAYS) * BAR_WIDTH;
    const x = (start / GESTATION_DAYS) * BAR_WIDTH;
    const crests = Math.max(3, Math.round(width / 14));
    const inset = index === 0 ? 0 : BAR_GAP / 2;
    const trailing = index === TRIMESTER_ENDS.length - 1 ? 0 : BAR_GAP / 2;
    return {
      key: index,
      current: index + 1 === trimester,
      d: wavePath(x + inset, BAR_HEIGHT / 2, width - inset - trailing, crests, 2.5),
    };
  });
  return (
    <svg
      className={styles.bar}
      viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {segments.map((segment) => (
        <path
          key={segment.key}
          className={segment.current ? styles.segmentCurrent : styles.segment}
          d={segment.d}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function WeekCard(props: WeekCardProps) {
  const {
    today,
    dueDate,
    method,
    historyHref = "/journey",
    startHref = "/journey",
    paused = false,
    highlight = true,
    loading = false,
    error,
    className,
  } = props;
  const headingId = useId();

  if (paused) {
    return (
      <section
        className={[styles.card, styles.paused, className].filter(Boolean).join(" ")}
        aria-labelledby={headingId}
      >
        <h3 id={headingId} className={styles.eyebrow}>
          Paused
        </h3>
        <p className={styles.text}>Weekly updates are paused.</p>
      </section>
    );
  }

  if (loading || error || !dueDate) {
    return (
      <section
        className={[styles.card, className].filter(Boolean).join(" ")}
        aria-labelledby={headingId}
        aria-busy={loading || undefined}
      >
        <h3 id={headingId} className={styles.eyebrow}>
          {!loading && !error ? "No pregnancy recorded" : "This week"}
        </h3>
        {loading ? <p className={styles.text}>Loading this week</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {!loading && !error ? (
          <>
            <p className={styles.text}>
              Start one with a due date or your last period and this becomes week by week.
            </p>
            <a className={styles.action} href={startHref}>
              Start a pregnancy
            </a>
          </>
        ) : null}
      </section>
    );
  }

  const age = gestationalAge(dueDate, today);
  const weekStart = addDays(dueDate, -GESTATION_DAYS + age.weeks * 7);
  const weekEnd = addDays(weekStart, 6);

  return (
    <section
      className={[styles.card, highlight ? styles.active : "", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className={styles.eyebrow}>
        This week
      </h3>
      <p className={styles.week}>
        <span className={styles.label}>Week</span>
        <span className={styles.numeral}>{age.weeks}</span>
        {age.days > 0 ? (
          <>
            <span className={styles.label}>and</span>
            <span className={styles.numeral}>{age.days}</span>
            <span className={styles.label}>{age.days === 1 ? "day" : "days"}</span>
          </>
        ) : null}
      </p>
      <p className={styles.range}>{formatDaySpan(weekStart, weekEnd)}</p>
      <TrimesterBar trimester={age.trimester} />
      <p className={styles.trimester}>{trimesterNames[age.trimester - 1]}</p>
      <dl className={styles.facts}>
        <dt>Due</dt>
        <dd className="tabular">{formatDayWithYear(dueDate)}</dd>
        {method !== undefined ? (
          <>
            <dt>Dating</dt>
            <dd>
              {datingMethodLabels[method]}.
              {historyHref !== null ? (
                <>
                  {" "}
                  <a className={styles.link} href={historyHref}>
                    History
                  </a>
                </>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt>Countdown</dt>
        <dd className="tabular">{daysToGoSentence(age.totalDays)}</dd>
      </dl>
    </section>
  );
}
