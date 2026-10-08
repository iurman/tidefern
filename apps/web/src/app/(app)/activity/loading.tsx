import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVITY_HEADING_ID, ActivityHeader } from "./activity-header";
import { activityCopy as copy } from "./copy";
import styles from "./activity.module.css";

/**
 * While the rows are read on the server: the title and the way back at
 * once, and lines standing in for the rows that will arrive (DESIGN.md
 * section 4, a skeleton only for values that will arrive).
 */
export default function ActivityLoading() {
  return (
    <section className={styles.page} aria-labelledby={ACTIVITY_HEADING_ID}>
      <ActivityHeader />
      <Skeleton variant="text" lines={6} label={copy.loading} />
    </section>
  );
}
