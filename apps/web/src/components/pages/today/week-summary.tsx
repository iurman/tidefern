import { useId } from "react";
import type { WeekLines } from "@/app/(app)/today/load";
import { formatDay, formatDaySpan } from "@/components/ui/marks-format";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { todayCopy } from "./copy";
import styles from "./today.module.css";

/** This week's sentences, in the order the days come: logged, then fertile, then the next period. */
export function weekSentences(week: WeekLines): string[] {
  const sentences: string[] = [];
  if (week.logged !== null) {
    sentences.push(todayCopy.week.logged(formatDaySpan(week.logged.start, week.logged.end)));
  }
  if (week.fertile !== null) {
    // Every fertile-window element carries the contraception line (architecture 13.10).
    sentences.push(
      `${todayCopy.week.fertile(formatDaySpan(week.fertile.start, week.fertile.end))} ${CONTRACEPTION_LINE}`,
    );
  }
  if (week.nextPeriod !== null) {
    sentences.push(
      todayCopy.week.nextPeriod(formatDay(week.nextPeriod.start), formatDay(week.nextPeriod.end)),
    );
  }
  return sentences.length === 0 ? [todayCopy.week.nothing] : sentences;
}

/**
 * "This week" on warmth (DESIGN.md 1.2 and 3.3): the calendar strip's day
 * texture in words, the screen's one highlighted thing (signature move 5),
 * holding no control. The dates are the API's and the fertile and next
 * period wording is the 13.10 templates', so no new claim enters.
 */
export function WeekSummary({ week }: { week: WeekLines }) {
  const headingId = useId();
  return (
    <section className={`${styles.card} ${styles.warmth}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardHeading}>
        {todayCopy.week.heading}
      </h2>
      {weekSentences(week).map((sentence) => (
        <p key={sentence} className={styles.cardText}>
          {sentence}
        </p>
      ))}
    </section>
  );
}
