import { BackLink } from "@/components/ui/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { familyCopy } from "@/components/pages/family/copy";
import styles from "@/components/pages/family/child.module.css";

/**
 * While a child's page reads: the way back, which is known, and the places
 * of the name and the panel, which will arrive (DESIGN.md section 4).
 */
export default function ChildLoading() {
  return (
    <section className={styles.page}>
      <BackLink href="/family">{familyCopy.child.back}</BackLink>
      <Skeleton variant="text" lines={2} label="Loading this child" />
      <Skeleton height="16rem" label="Loading the timeline" />
    </section>
  );
}
