import { TextLink } from "@/components/ui/text-link";
import { homeCopy } from "./home-copy";
import styles from "./promises.module.css";

const copy = homeCopy.promises;

/**
 * The four promises as a definition list in two columns (DESIGN.md 1.1).
 * Each sentence traces to a row in architecture 9 to 11; the closing line
 * points at the design reference, which is how the product shows its work.
 */
export function Promises() {
  return (
    <section className={`${styles.section} wrap`} aria-labelledby="promises-title">
      <h2 id="promises-title" className="sr-only">
        {copy.heading}
      </h2>
      <dl className={styles.list}>
        {copy.items.map((promise) => (
          <div key={promise.title} className={styles.item}>
            <dt className={styles.title}>{promise.title}</dt>
            <dd className={styles.text}>{promise.text}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.closing}>
        {copy.designLead} <TextLink href="/design">{copy.designLink}</TextLink>
      </p>
    </section>
  );
}
