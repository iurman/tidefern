import { BackLink } from "@/components/ui/back-link";
import { activityCopy as copy } from "./copy";
import styles from "./activity.module.css";

/** The id the page's section is labelled by. */
export const ACTIVITY_HEADING_ID = "activity-title";

/**
 * The way back to Settings and the page title (DESIGN.md 3.8): the back
 * link beside the title where the column is wide, above it on a phone.
 * Activity is reached from Settings, so the link names it at every width.
 */
export function ActivityHeader() {
  return (
    <div className={styles.header}>
      <BackLink href="/settings">{copy.back}</BackLink>
      <h1 id={ACTIVITY_HEADING_ID} className={styles.heading}>
        {copy.heading}
      </h1>
    </div>
  );
}
