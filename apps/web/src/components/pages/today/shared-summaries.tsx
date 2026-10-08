"use client";
import { useId } from "react";
import type { CycleStatus, PregnancyOverview, PregnancyPaused } from "@tidefern/schemas";
import type { ChildAge, Part, SharedPerson } from "@/app/(app)/today/load";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { grantCopy } from "@/components/ui/grant-row";
import { formatDayWithYear } from "@/components/ui/marks-format";
import { CONTRACEPTION_LINE } from "@/lib/prediction-copy";
import { todayCopy } from "./copy";
import styles from "./today.module.css";

/**
 * The `none` stage (DESIGN.md 3.3): what the people who share with this
 * person show them today, and the children they see, and never a body
 * question of their own. A status card says only what `cycle.status`
 * carries (architecture 8.2: "Period day 2", the fertile window), never a
 * prediction, a symptom or the pointing-to-care sentence, which never
 * shows on a partner's view; a pregnancy shows its week and due date, or
 * the neutral paused state after an ending, never why. Each category is
 * named the way /sharing names it (`grantCopy`).
 */

/** The status card's lines, from the API's derived status only. */
export function statusLines(status: CycleStatus): string[] {
  const lines: string[] = [];
  if (status.cycleDay !== null) lines.push(todayCopy.shared.cycleDay(status.cycleDay));
  if (status.periodDay !== null) lines.push(todayCopy.shared.periodDay(status.periodDay));
  if (status.inFertileWindow) lines.push(`${todayCopy.shared.fertile} ${CONTRACEPTION_LINE}`);
  return lines.length === 0 ? [todayCopy.shared.nothingToday] : lines;
}

/** The pregnancy summary's lines: the week and the due date, or the paused sentence. */
export function pregnancyLines(pregnancy: PregnancyOverview | PregnancyPaused): string[] {
  if (pregnancy.status === "paused") return [todayCopy.shared.paused];
  return [
    todayCopy.shared.pregnancyWeek(pregnancy.gestation.weeks, pregnancy.gestation.days),
    todayCopy.shared.due(formatDayWithYear(pregnancy.dueDate)),
  ];
}

interface Block {
  label: string;
  lines: string[];
}

/**
 * One block per category held: its name as /sharing says it, and what today
 * shows. `name` is the person's name, or null when it is not known, so a
 * failed read says "this person" rather than the card's fallback heading.
 */
export function personBlocks(person: SharedPerson, name: string | null): Block[] {
  const blocks: Block[] = [];
  if (person.status !== null) {
    blocks.push({
      label: grantCopy["cycle.status"].label,
      lines: !person.status.ok
        ? [todayCopy.shared.failed(name)]
        : person.status.value === null
          ? [todayCopy.shared.nothingToday]
          : statusLines(person.status.value),
    });
  }
  if (person.pregnancy !== null) {
    blocks.push({
      label: grantCopy["pregnancy.overview"].label,
      lines: !person.pregnancy.ok
        ? [todayCopy.shared.failed(name)]
        : person.pregnancy.value === null
          ? [todayCopy.shared.nothingToday]
          : pregnancyLines(person.pregnancy.value),
    });
  }
  return blocks;
}

function PersonSummary({ person }: { person: SharedPerson }) {
  const headingId = useId();
  const name = person.name.ok ? person.name.value : null;
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardHeading}>
        {name ?? todayCopy.shared.someone}
      </h2>
      {/* The sharing read failed: say so in the name's place instead of passing the fallback off as an answer. */}
      {person.name.ok ? null : <p className={styles.cardText}>{todayCopy.shared.nameFailed}</p>}
      <dl className={`${styles.lines} ${styles.summaryLines}`}>
        {personBlocks(person, name).map((block) => (
          <div key={block.label}>
            <dt>{block.label}</dt>
            {block.lines.map((line) => (
              <dd key={line}>{line}</dd>
            ))}
          </div>
        ))}
      </dl>
    </section>
  );
}

function ChildSummary({ child }: { child: ChildAge }) {
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardHeading}>
        {child.name}
      </h2>
      <p className={styles.cardText}>{child.age}</p>
      <div className={styles.cardAction}>
        <Button variant="secondary" href="/family">
          {todayCopy.shared.openFamily}
        </Button>
      </div>
    </section>
  );
}

export function SharedSummaries({
  people,
  childAges,
}: {
  people: SharedPerson[];
  childAges: Part<ChildAge[]>;
}) {
  if (people.length === 0 && childAges.ok && childAges.value.length === 0) {
    const empty = todayCopy.shared.empty;
    return <EmptyState heading={empty.heading} why={empty.why} />;
  }
  return (
    <div className={styles.summaryList}>
      {people.map((person) => (
        <PersonSummary key={person.ownerId} person={person} />
      ))}
      {childAges.ok ? (
        childAges.value.map((child) => <ChildSummary key={child.id} child={child} />)
      ) : (
        <p className={styles.failure}>{todayCopy.shared.childrenFailed}</p>
      )}
    </div>
  );
}
