import { Skeleton } from "@/components/ui/skeleton";
import { familyCopy } from "@/components/pages/family/copy";
import styles from "@/components/pages/family/family.module.css";

/**
 * While /family reads: the heading, which is known, and a card's place,
 * which will arrive (DESIGN.md section 4: a skeleton only for values that
 * will arrive).
 */
export default function FamilyLoading() {
  return (
    <section className={styles.page} aria-labelledby="family-title">
      <h1 id="family-title" className={styles.heading}>
        {familyCopy.heading}
      </h1>
      <div className={styles.children}>
        <Skeleton label="Loading your family" height="12rem" />
      </div>
    </section>
  );
}
