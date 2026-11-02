"use client";
import { useId } from "react";
import type { SharingPerson } from "@tidefern/schemas";
import type { Part, PartnersData } from "@/app/(app)/today/load";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { grantCopy, privateNotesSentence } from "@/components/ui/grant-row";
import { todayCopy } from "./copy";
import styles from "./today.module.css";

/**
 * What each person she shares with can see right now (DESIGN.md 3.3), read
 * only: the category names and the plain descriptions /sharing shows before
 * a category is turned on (CONTENT.md, `grantCopy`), never a value she
 * logged and never a guess at what the other person's screen shows. A
 * child she guards with someone else is listed too, because that person
 * sees everything logged for the child. Changing anything happens on
 * /sharing; PersonCard there is the editable version of this card.
 */

export interface PartnerLine {
  key: string;
  label: string;
  description: string;
}

/** The lines for one person: each grant from her, then each child they guard with her. */
export function partnerLines(
  person: SharingPerson,
  childNames: Readonly<Record<string, string>>,
  pregnancyPaused: boolean,
): PartnerLine[] {
  const nameOf = (id: string | null | undefined) =>
    (id === null || id === undefined ? undefined : childNames[id]) ?? "this child";
  const lines: PartnerLine[] = person.grants.map((grant) => {
    if (grant.category === "child") {
      const name = nameOf(grant.childId);
      return { key: grant.id, label: name, description: todayCopy.partners.childLine(name) };
    }
    const copy = grantCopy[grant.category];
    const paused = grant.category === "pregnancy.overview" && pregnancyPaused;
    return {
      key: grant.id,
      label: copy.label,
      description: paused ? todayCopy.partners.paused : copy.description,
    };
  });
  const granted = new Set(person.grants.map((grant) => grant.childId));
  for (const childId of person.guardianOf) {
    if (granted.has(childId)) continue;
    const name = nameOf(childId);
    lines.push({
      key: `guardian-${childId}`,
      label: name,
      description: todayCopy.partners.guardianLine(name),
    });
  }
  return lines;
}

function PersonView({ person, data }: { person: SharingPerson; data: PartnersData }) {
  const headingId = useId();
  const lines = partnerLines(person, data.childNames, data.pregnancyPaused);
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardHeading}>
        {todayCopy.partners.heading(person.displayName)}
      </h2>
      <dl className={styles.lines}>
        {lines.map((line) => (
          <div key={line.key}>
            <dt>{line.label}</dt>
            <dd>{line.description}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.cardFoot}>{privateNotesSentence}</p>
      <div className={styles.cardAction}>
        <Button variant="secondary" href="/sharing">
          {todayCopy.partners.change}
        </Button>
      </div>
    </section>
  );
}

export function PartnerCard({ partners }: { partners: Part<PartnersData> }) {
  if (!partners.ok) {
    return (
      <div className={styles.card}>
        <p className={styles.cardText}>{todayCopy.partners.failed}</p>
      </div>
    );
  }
  const { people } = partners.value;
  if (people.length === 0) {
    const empty = todayCopy.partners.empty;
    return (
      <EmptyState
        heading={empty.heading}
        why={empty.why}
        action={
          <Button variant="secondary" href="/sharing">
            {empty.action}
          </Button>
        }
      />
    );
  }
  return (
    <>
      {people.map((person) => (
        <PersonView key={person.id} person={person} data={partners.value} />
      ))}
    </>
  );
}
