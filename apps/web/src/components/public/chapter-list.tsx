import { homeCopy } from "./home-copy";
import styles from "./chapter-list.module.css";

const copy = homeCopy.chapters;

/**
 * Composition B's numbered chapter list (DESIGN.md 1.1), kept below the
 * fold: a serif numeral beside each chapter's name and one sentence, in one
 * column, so the three chapters never read as a card grid.
 */
export function ChapterList() {
  return (
    <section className={`${styles.section} wrap`} aria-labelledby="chapters-title">
      <h2 id="chapters-title" className="sr-only">
        {copy.heading}
      </h2>
      <ol className={styles.list}>
        {copy.items.map((chapter, index) => (
          <li key={chapter.name} className={styles.item}>
            <span className={styles.numeral} aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className={styles.body}>
              <h3 className={styles.name}>{chapter.name}</h3>
              <p className={styles.text}>{chapter.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
