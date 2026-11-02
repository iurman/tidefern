import { homeCopy } from "./home-copy";
import styles from "./promises.module.css";

const copy = homeCopy.promises;

/**
 * The four promises as a definition list in two columns (DESIGN.md 1.1).
 * Each sentence traces to a row in architecture 9 to 11. The design
 * reference is reached from the footer on every public page.
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
    </section>
  );
}
