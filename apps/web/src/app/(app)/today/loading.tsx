import { Skeleton } from "@/components/ui/skeleton";
import styles from "./today.module.css";

/**
 * Today while the server reads (architecture 12.2): shapes only for what
 * will arrive (the ring, its sentences, the open card), marked busy with
 * one label for assistive technology. The pulse rests after six swings.
 */
export default function TodayLoading() {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingHero}>
        <div className={styles.loadingRing}>
          <Skeleton height="220px" label="Loading today" />
        </div>
        {/* One label for the whole screen; the other shapes say nothing of their own. */}
        <Skeleton variant="text" lines={4} label="" />
      </div>
      <Skeleton height="240px" label="" />
    </div>
  );
}
