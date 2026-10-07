import { EmptyState } from "@/components/ui/empty-state";
import { AddChild } from "./add-child";
import { ChildCard } from "./child-card";
import { familyCopy } from "./copy";
import type { FamilyLoad } from "./load";
import type { UnitSystem } from "./types";
import styles from "./family.module.css";

const copy = familyCopy;

export interface FamilyViewProps {
  family: FamilyLoad;
  /** Today in the profile's zone, from GET /v1/me. */
  today: string;
  units: UnitSystem;
}

/**
 * /family (DESIGN.md 3.6): the heading with "Add a child" beside it from
 * 600 px (after the children on phones, as the sketch has it), then one card
 * per child, youngest first. One summary sits on warmth: the youngest
 * child's that has one, since a screen has one warmth surface (architecture
 * 13.6, move 5). No child: the CONTENT.md empty state with its one action.
 */
export function FamilyView({ family, today, units }: FamilyViewProps) {
  if (family.kind === "failed") {
    return (
      <section className={styles.page} aria-labelledby="family-title">
        <h1 id="family-title" className={styles.heading}>
          {copy.heading}
        </h1>
        <p className={styles.errorText}>{copy.loadFailed}</p>
      </section>
    );
  }
  if (family.cards.length === 0) {
    return (
      <section className={styles.page} aria-labelledby="family-title">
        <h1 id="family-title" className={styles.heading}>
          {copy.heading}
        </h1>
        <EmptyState
          className={styles.empty}
          heading={copy.empty.heading}
          why={copy.empty.why}
          action={<AddChild today={today} variant="primary" />}
        />
      </section>
    );
  }
  const warm = family.cards.findIndex((card) => card.day !== null && card.day !== "failed");
  return (
    <section className={styles.page} aria-labelledby="family-title">
      <h1 id="family-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <div className={styles.children}>
        {family.cards.map((card, index) => (
          <ChildCard
            key={card.child.id}
            card={card}
            today={today}
            units={units}
            warm={index === warm}
          />
        ))}
      </div>
      <div className={styles.add}>
        <AddChild today={today} />
      </div>
    </section>
  );
}
