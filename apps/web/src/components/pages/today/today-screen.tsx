import type { ReactNode } from "react";
import type { Hero, TodayView } from "@/app/(app)/today/load";
import { TideLine } from "@/components/public/tide-line";
import { PREDICTION_FOOTER } from "@/lib/prediction-copy";
import {
  CycleHero,
  EmptyHero,
  FailedHero,
  PregnancyHero,
  QuietHero,
  TODAY_HEADING_ID,
  TodayHeading,
  ChildLine,
} from "./hero";
import { PartnerCard } from "./partner-card";
import { SharedSummaries } from "./shared-summaries";
import { TodayLogCard, TodayLogProvider } from "./today-log";
import { WeekSummary } from "./week-summary";
import styles from "./today.module.css";

/**
 * Today on composition A (DESIGN.md 1.2 and 3.3): the hero by stage, the
 * tide line, the open card beside the partner card and "This week", and the
 * prediction footer last when there is a prediction. The open card keeps
 * its place in the tree whatever the hero shows, so a save that turns the
 * empty state into a first guess (the page refreshes from the API) keeps the
 * card's "Saved" line and its Undo on screen.
 */
function heroFor(view: TodayView, hero: Hero): ReactNode {
  const { today, child } = view;
  switch (hero.kind) {
    case "cycle":
      return (
        <CycleHero
          today={today}
          prediction={hero.prediction}
          cycleDay={hero.cycleDay}
          latestStart={hero.latestStart}
          loggedDays={hero.loggedDays}
          nudge={hero.nudge}
          child={child}
        />
      );
    case "empty":
      return <EmptyHero today={today} />;
    case "quiet":
      return <QuietHero today={today} feeding={hero.feeding} child={child} />;
    case "pregnancy":
      return <PregnancyHero today={today} pregnancy={hero.pregnancy} />;
    case "shared":
      return (
        <section className={styles.hero} aria-labelledby={TODAY_HEADING_ID}>
          <div className={styles.facts}>
            <TodayHeading today={today} />
            <SharedSummaries people={hero.people} childAges={hero.children} />
          </div>
        </section>
      );
    case "failed":
      return (
        <FailedHero today={today}>
          {child !== null && child.ok && child.value !== null ? (
            <ChildLine child={child.value} />
          ) : null}
        </FailedHero>
      );
  }
}

export function TodayScreen({ view }: { view: TodayView }) {
  const { hero, log, partners, today } = view;
  const side = (
    <>
      {partners === null ? null : <PartnerCard partners={partners} />}
      {hero.kind === "cycle" ? <WeekSummary week={hero.week} /> : null}
    </>
  );

  if (log === null) {
    // Never asked a body question: no open card, no sheet, no quick log.
    return (
      <div className={styles.page}>
        {heroFor(view, hero)}
        {partners === null ? null : (
          <>
            <TideLine />
            <div className={styles.cards}>{side}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <TodayLogProvider stage={log.stage} today={today} initial={log.initial}>
      <div className={styles.page}>
        {heroFor(view, hero)}
        <TideLine />
        <div className={styles.cards}>
          <TodayLogCard stage={log.stage} today={today} initial={log.initial} />
          <div className={styles.side}>{side}</div>
        </div>
        {hero.kind === "cycle" ? <p className={styles.footer}>{PREDICTION_FOOTER}</p> : null}
      </div>
    </TodayLogProvider>
  );
}
