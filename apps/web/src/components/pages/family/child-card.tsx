import { useId, type ReactNode } from "react";
import { TextLink } from "@/components/ui/text-link";
import { familyCopy } from "./copy";
import { childAge, formatDuration } from "./format";
import type { FamilyCard } from "./load";
import { QuickLog } from "./quick-log";
import type { UnitSystem } from "./types";
import styles from "./family.module.css";

const copy = familyCopy.card;

export interface ChildCardProps {
  card: FamilyCard;
  /** Today in the profile's zone, from the API. */
  today: string;
  units: UnitSystem;
  /** The one summary on the warmth surface (DESIGN.md 3.6; architecture 13.6, move 5). */
  warm: boolean;
  /** Context lines beside today's counts, by row, where a published range applies. */
  context?: { feed?: ReactNode; sleep?: ReactNode; diaper?: ReactNode };
}

/**
 * One child on /family (DESIGN.md 3.6): the name with the age beside it,
 * the summary card (the last feed, sleep and diaper with the time since,
 * and today's counts), Feed, Sleep and Diaper below the card and never on
 * it (DESIGN.md 8: the warmth surface hosts no control), then the guardians
 * by name. A grantee sees only what her grant answers: no guardians, no
 * control a read grant does not allow, and for a summary grant the name and
 * the age alone.
 */
export function ChildCard({ card, today, units, warm, context = {} }: ChildCardProps) {
  const headingId = useId();
  const { child, access, day, guardians } = card;

  let summary: ReactNode;
  if (day === null) {
    summary = <p className={styles.owner}>{copy.summaryOnly}</p>;
  } else if (day === "failed") {
    summary = <p className={styles.errorText}>{copy.dayFailed}</p>;
  } else {
    const { feed, sleep, diaper } = day.summary;
    summary = (
      <dl
        className={warm ? `${styles.summary} ${styles.warm}` : styles.summary}
        data-warmth={warm ? "true" : undefined}
      >
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>{copy.lastFeed}</dt>
          {feed.lastSince === null ? (
            <dd className={styles.summaryValue}>{copy.none}</dd>
          ) : (
            <>
              <dd className={styles.summaryValue}>{feed.lastSince}</dd>
              <dd className={styles.summaryToday}>{copy.today(String(feed.today))}</dd>
            </>
          )}
          {context.feed === undefined ? null : (
            <dd className={styles.summaryContext}>{context.feed}</dd>
          )}
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>
            {sleep.ongoingSince !== null ? copy.sleep : copy.lastSleep}
          </dt>
          {sleep.ongoingSince !== null ? (
            <dd className={styles.summaryValue}>{copy.asleepSince(sleep.ongoingSince)}</dd>
          ) : sleep.lastSince === null ? (
            <dd className={styles.summaryValue}>{copy.none}</dd>
          ) : (
            <dd className={styles.summaryValue}>{copy.sleepEnded(sleep.lastSince)}</dd>
          )}
          {sleep.ongoingSince !== null || sleep.lastSince !== null ? (
            <dd className={styles.summaryToday}>
              {copy.today(formatDuration(sleep.todayMinutes))}
            </dd>
          ) : null}
          {context.sleep === undefined ? null : (
            <dd className={styles.summaryContext}>{context.sleep}</dd>
          )}
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>{copy.lastDiaper}</dt>
          {diaper.lastSince === null ? (
            <dd className={styles.summaryValue}>{copy.none}</dd>
          ) : (
            <>
              <dd className={styles.summaryValue}>{diaper.lastSince}</dd>
              <dd className={styles.summaryToday}>
                {copy.today(
                  diaper.known
                    ? copy.diapers(diaper.today, diaper.wet, diaper.dirty)
                    : String(diaper.today),
                )}
              </dd>
            </>
          )}
          {context.diaper === undefined ? null : (
            <dd className={styles.summaryContext}>{context.diaper}</dd>
          )}
        </div>
      </dl>
    );
  }

  return (
    <article className={styles.child} aria-labelledby={headingId}>
      <header className={styles.childHeader}>
        <h2 id={headingId} className={styles.childName}>
          {child.displayName}
        </h2>
        <p className={styles.age}>{childAge(child.dateOfBirth, today)}</p>
      </header>
      {summary}
      {access.canWrite && day !== null && day !== "failed" ? (
        <QuickLog
          childId={child.id}
          childName={child.displayName}
          today={today}
          units={units}
          canDelete={access.canDelete}
          ongoingSleep={day.ongoingSleep}
          ongoingSince={day.summary.sleep.ongoingSince}
        />
      ) : null}
      {guardians === null ? null : <p className={styles.guardians}>{copy.guardians(guardians)}</p>}
      {access.canRead ? (
        <p className={styles.open}>
          <TextLink href={`/family/${child.id}`}>
            {copy.open}{" "}
            <span className="sr-only">{familyCopy.log.forChild(child.displayName)}</span>
          </TextLink>
        </p>
      ) : null}
    </article>
  );
}
