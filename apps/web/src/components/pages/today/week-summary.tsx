import { useId } from "react";
import type { CyclePrediction } from "@tidefern/schemas";
import type { WeekLines } from "@/app/(app)/today/load";
import { formatDaySpan } from "@/components/ui/marks-format";
import { CONTRACEPTION_LINE, estimateSentence } from "@/lib/prediction-copy";
import { todayCopy } from "./copy";
import styles from "./today.module.css";

/** One This week sentence; an estimate sentence is set in Newsreader italic (signature move 3). */
export interface WeekSentence {
  text: string;
  estimate: boolean;
}

/**
 * This week's sentences, in the order the days come: logged, then fertile,
 * then the next period. The next period is never reworded here: when its
 * band touches the week, the sentence is the 13.10 template for the
 * prediction's own basis (`estimateSentence`), so a first guess stays
 * labelled as one and an estimate keeps "Based on your last N cycles".
 */
export function weekSentences(week: WeekLines, prediction: CyclePrediction): WeekSentence[] {
  const sentences: WeekSentence[] = [];
  if (week.logged !== null) {
    sentences.push({
      text: todayCopy.periodLogged(formatDaySpan(week.logged.start, week.logged.end)),
      estimate: false,
    });
  }
  if (week.fertile !== null) {
    // Every fertile-window element carries the contraception line (architecture 13.10).
    sentences.push({
      text: `${todayCopy.week.fertile(formatDaySpan(week.fertile.start, week.fertile.end))} ${CONTRACEPTION_LINE}`,
      estimate: false,
    });
  }
  const next = week.nextPeriod === null ? null : estimateSentence(prediction);
  if (next !== null) sentences.push({ text: next, estimate: true });
  return sentences.length === 0 ? [{ text: todayCopy.week.nothing, estimate: false }] : sentences;
}

/**
 * "This week" on warmth (DESIGN.md 1.2 and 3.3): the calendar strip's day
 * texture in words, the screen's one highlighted thing (signature move 5),
 * holding no control. The dates are the API's; the fertile line is the
 * 13.10 ovulation template's fertile days with its contraception line, and
 * the next period is the 13.10 estimate or first guess sentence itself, so
 * no new claim enters.
 */
export function WeekSummary({
  week,
  prediction,
}: {
  week: WeekLines;
  prediction: CyclePrediction;
}) {
  const headingId = useId();
  return (
    <section className={`${styles.card} ${styles.warmth}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardHeading}>
        {todayCopy.week.heading}
      </h2>
      {weekSentences(week, prediction).map((sentence) => (
        <p
          key={sentence.text}
          className={sentence.estimate ? `estimate ${styles.estimateLine}` : styles.cardText}
        >
          {sentence.text}
        </p>
      ))}
    </section>
  );
}
