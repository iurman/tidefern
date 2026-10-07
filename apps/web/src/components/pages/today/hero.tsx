import type { ReactNode } from "react";
import type { CyclePrediction } from "@tidefern/schemas";
import type { ChildAge, Part } from "@/app/(app)/today/load";
import { OwnerInput } from "@/components/public/policy-document";
import { CycleRing } from "@/components/ui/cycle-ring";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { WeekCard } from "@/components/ui/week-card";
import { formatSheetDate } from "@/lib/day-log";
import { CONTRACEPTION_LINE, predictionCopy } from "@/lib/prediction-copy";
import type { DatingMethod } from "@tidefern/core";
import { estimateExplanationPlaceholder, feedingLinePlaceholder, todayCopy } from "./copy";
import { LogTodayAction } from "./today-log";
import styles from "./today.module.css";

/**
 * The top of Today by stage (DESIGN.md 3.3): the date as the page's one
 * heading, then the ring and its sentences, the week card, the quiet card,
 * or what others share. Server rendered: every value here is one the API
 * returned, and today is the API's day in the profile's time zone.
 */

export const TODAY_HEADING_ID = "today-heading";

/** The page's one heading: "Today, Monday, Oct 5", with the date shown as the eyebrow. */
export function TodayHeading({ today }: { today: string }) {
  return (
    <h1 id={TODAY_HEADING_ID} className={styles.eyebrow}>
      {/* The space sits outside the hidden word, so every engine reads "Today, Monday, Oct 5". */}
      <span className="sr-only">{todayCopy.headingPrefix}</span> {formatSheetDate(today)}
    </h1>
  );
}

/** A display numeral beside its Newsreader label, from a phrase like "4 weeks, 3 days". */
export function numeralParts(phrase: string): Array<{ numeral: string; label: string }> | null {
  const parts = [...phrase.matchAll(/(\d+)\s+([^\d]+)/g)].map((match) => ({
    numeral: match[1] as string,
    label: (match[2] as string).trim(),
  }));
  return parts.length === 0 ? null : parts;
}

/** The child's name and age, the age's numbers set as display numerals beside their words. */
export function ChildLine({ child }: { child: ChildAge }) {
  const parts = numeralParts(child.age);
  return (
    <p className={styles.dayLine}>
      <span className={styles.childName}>{child.name}</span>{" "}
      {parts === null ? (
        <span className={styles.numeralLabel}>{child.age}</span>
      ) : (
        parts.map((part, index) => (
          <span key={index} className={styles.agePart}>
            {index === 0 ? null : " "}
            <span className={styles.numeral}>{part.numeral}</span>{" "}
            <span className={styles.numeralLabel}>{part.label}</span>
          </span>
        ))
      )}
    </p>
  );
}

/** Postpartum's child line, or what to do when the children could not be read. */
function ChildHeader({ child }: { child: Part<ChildAge | null> | null }) {
  if (child === null) return null;
  if (!child.ok) return <p className={styles.failure}>{todayCopy.childFailed}</p>;
  return child.value === null ? null : <ChildLine child={child.value} />;
}

/** The ovulation sentence with its contraception tail set quieter, as the composition shows it. */
function FertileSentence({ sentence }: { sentence: string }) {
  const lead = sentence.endsWith(CONTRACEPTION_LINE)
    ? sentence.slice(0, sentence.length - CONTRACEPTION_LINE.length).trimEnd()
    : sentence;
  return (
    <p className={styles.fact}>
      {lead}
      {lead === sentence ? null : (
        <>
          {" "}
          <span className={styles.muted}>{CONTRACEPTION_LINE}</span>
        </>
      )}
    </p>
  );
}

export interface CycleHeroProps {
  today: string;
  prediction: CyclePrediction;
  cycleDay: number | null;
  latestStart: string | null;
  loggedDays: string[];
  nudge: boolean;
  child: Part<ChildAge | null> | null;
}

/**
 * The cycle stage (DESIGN.md 3.3 and 6.1): the ring at 260 px (220 on a
 * phone) drawing the API's prediction, and beside it the date, the cycle
 * day as a numeral beside "day of your cycle", the 13.10 estimate in
 * Newsreader italic, the ovulation band with the contraception line, the
 * deviation nudge and the pointing-to-care sentence when the API flags
 * them (her own view only: a grantee's answer never carries the flags),
 * and "How this is estimated". First guess and not enough regular cycles
 * draw and say what 6.1 and 13.10 say, because the ring and the sentences
 * come from the same answer.
 */
export function CycleHero(props: CycleHeroProps) {
  const { today, prediction, cycleDay, latestStart, loggedDays, nudge, child } = props;
  const copy = predictionCopy(prediction);
  return (
    <section className={styles.hero} data-ring="" aria-labelledby={TODAY_HEADING_ID}>
      <div className={styles.facts}>
        <TodayHeading today={today} />
        <ChildHeader child={child} />
        {cycleDay === null ? null : (
          <p className={styles.dayLine}>
            <span className={styles.numeral}>{cycleDay}</span>{" "}
            <span className={styles.numeralLabel}>{todayCopy.cycleDayLabel}</span>
          </p>
        )}
        {copy.estimate === null ? null : (
          <p className={`estimate ${styles.estimateLine}`}>{copy.estimate}</p>
        )}
        {copy.fertile === null ? null : <FertileSentence sentence={copy.fertile} />}
        {nudge && copy.deviation !== null ? (
          <p className={styles.fact}>
            {copy.deviation} <TextLink href="/calendar">{todayCopy.deviationLink}</TextLink>
          </p>
        ) : null}
        {copy.care === null ? null : <p className={styles.fact}>{copy.care}</p>}
        <Disclosure summary={todayCopy.estimateSummary} className={styles.disclosure}>
          <p>
            <OwnerInput>{estimateExplanationPlaceholder()}</OwnerInput>
          </p>
        </Disclosure>
      </div>
      <div className={styles.ringCell}>
        <CycleRing
          className={styles.ring}
          today={today}
          prediction={prediction}
          latestStart={latestStart}
          loggedDays={loggedDays}
        />
      </div>
    </section>
  );
}

/**
 * Before the first log (CONTENT.md, "/today, cycle stage, no log yet"):
 * the ring's track with no arcs, what would be here, why it is not, and the
 * one action, which opens the quick log.
 */
export function EmptyHero({ today }: { today: string }) {
  const empty = todayCopy.empty;
  return (
    <section className={styles.hero} data-ring="" aria-labelledby={TODAY_HEADING_ID}>
      <div className={styles.facts}>
        <TodayHeading today={today} />
        <h2 className={styles.cardHeading}>{empty.heading}</h2>
        <p className={styles.fact}>{empty.why}</p>
        <div className={styles.emptyAction}>
          <LogTodayAction>{empty.action}</LogTodayAction>
        </div>
      </div>
      <div className={styles.ringCell}>
        <CycleRing className={styles.ring} today={today} prediction={null} latestStart={null} />
      </div>
    </section>
  );
}

/**
 * After a pregnancy ended, and after a birth until a period is logged
 * (architecture 8.4 rules 4 and 5, CONTENT.md "When you are ready"): no
 * prediction and no fertile window, one quiet card whose action opens the
 * quick log. Postpartum adds the child's age above it and the line about
 * cycles returning later while feeding, which the owner writes.
 */
export function QuietHero({
  today,
  feeding,
  child,
}: {
  today: string;
  feeding: boolean;
  child: Part<ChildAge | null> | null;
}) {
  const quiet = todayCopy.quiet;
  return (
    <section className={styles.hero} aria-labelledby={TODAY_HEADING_ID}>
      <div className={styles.facts}>
        <TodayHeading today={today} />
        <ChildHeader child={child} />
        <div className={styles.quiet}>
          <EmptyState
            heading={quiet.heading}
            why={quiet.why}
            action={<LogTodayAction>{quiet.action}</LogTodayAction>}
          />
          {feeding ? (
            <p className={styles.fact}>
              <OwnerInput>{feedingLinePlaceholder}</OwnerInput>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Pregnancy (DESIGN.md 3.3 and 6.4): the week card on warmth in the ring's place. */
export function PregnancyHero({
  today,
  pregnancy,
}: {
  today: string;
  pregnancy: Part<{ dueDate: string; method: DatingMethod } | null>;
}) {
  return (
    <section className={styles.hero} aria-labelledby={TODAY_HEADING_ID}>
      <div className={styles.facts}>
        <TodayHeading today={today} />
        <div className={styles.weekCard}>
          {pregnancy.ok ? (
            <WeekCard
              today={today}
              historyHref="/journey"
              startHref="/journey"
              {...(pregnancy.value === null
                ? {}
                : { dueDate: pregnancy.value.dueDate, method: pregnancy.value.method })}
            />
          ) : (
            <WeekCard today={today} error={todayCopy.weekFailed} />
          )}
        </div>
      </div>
    </section>
  );
}

/** A hero whose reads failed: the heading, and what to do next. */
export function FailedHero({ today, children }: { today: string; children?: ReactNode }) {
  return (
    <section className={styles.hero} aria-labelledby={TODAY_HEADING_ID}>
      <div className={styles.facts}>
        <TodayHeading today={today} />
        {children}
        <p className={styles.failure}>{todayCopy.cycleFailed}</p>
      </div>
    </section>
  );
}
