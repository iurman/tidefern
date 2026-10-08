import { BackLink } from "@/components/ui/back-link";
import { ChildTabs } from "./child-tabs";
import { familyCopy } from "./copy";
import { childAge } from "./format";
import { GrowthPanel } from "./growth-panel";
import type { ChildRecords } from "./load";
import { MilestonesPanel } from "./milestones-panel";
import type { ChildAccess } from "./roles";
import { TimelinePanel } from "./timeline-panel";
import { timelineItemsFrom } from "./timeline-items";
import type { Child, UnitSystem } from "./types";
import styles from "./child.module.css";

const copy = familyCopy.child;

export interface ChildViewProps {
  child: Child;
  access: ChildAccess;
  /** Null for a summary grantee, whose grant reaches the name and age only. */
  records: ChildRecords | null;
  /** Today in the profile's zone, from GET /v1/me. */
  today: string;
  timeZone: string;
  units: UnitSystem;
}

/**
 * /family/[childId] (DESIGN.md 3.6): the way back to Family, the child's
 * name with the age beside it, then Timeline, Growth and Milestones. Each
 * panel says its own failed read; the others still render. The chart's
 * viewer is a guardian's only when the API's answer is a guardian's (it
 * carried the guardians), so a partner's view never gets the
 * pointing-to-care sentence.
 */
export function ChildView({ child, access, records, today, timeZone, units }: ChildViewProps) {
  const header = (
    <>
      <BackLink href="/family">{copy.back}</BackLink>
      <header className={styles.header}>
        <h1 className={styles.name}>{child.displayName}</h1>
        <p className={styles.age}>{childAge(child.dateOfBirth, today)}</p>
      </header>
    </>
  );
  if (records === null) {
    return (
      <section className={styles.page}>
        {header}
        <p className={styles.owner}>{copy.summaryOnly}</p>
      </section>
    );
  }
  const { events, measurements, checklist } = records;
  const timeline =
    events === "failed" ? (
      <p className={styles.errorText}>{copy.timelineFailed}</p>
    ) : (
      <TimelinePanel
        key={`${events.items[0]?.id ?? "none"}:${events.items[0]?.version ?? 0}:${events.items.length}`}
        childId={child.id}
        childName={child.displayName}
        items={timelineItemsFrom(events.items, { timeZone, units })}
        nextCursor={events.nextCursor}
        timeZone={timeZone}
        units={units}
        canWrite={access.canWrite}
      />
    );
  const growth =
    measurements === "failed" ? (
      <p className={styles.errorText}>{copy.growthFailed}</p>
    ) : (
      <GrowthPanel
        childId={child.id}
        childName={child.displayName}
        sex={child.sex}
        dateOfBirth={child.dateOfBirth}
        today={today}
        units={units}
        measurements={measurements}
        canWrite={access.canWrite}
        viewer={child.guardians !== undefined ? "owner" : "partner"}
      />
    );
  const milestones =
    checklist === "failed" ? (
      <p className={styles.errorText}>{copy.milestonesFailed}</p>
    ) : (
      <MilestonesPanel childId={child.id} checklist={checklist} canWrite={access.canWrite} />
    );
  return (
    <section className={styles.page}>
      {header}
      <ChildTabs panels={{ timeline, growth, milestones }} />
    </section>
  );
}
