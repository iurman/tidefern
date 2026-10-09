import { brand } from "@tidefern/design-tokens";
import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { homeCopy } from "./home-copy";
import styles from "./hero.module.css";

const copy = homeCopy.hero;

/**
 * Composition A from DESIGN.md 1.1: a warmth panel carrying the mark, the
 * eyebrow, the tagline as the H1 and a one-line lede, beside a surface
 * panel carrying the privacy promise as a second statement, its lede, the
 * one primary action and the status line. The warmth surface is used once
 * on the page, here (signature move 5). At 390 px the panels stack and the
 * mark sits above the statement inside the warmth panel.
 */
export function Hero() {
  return (
    <section className={`${styles.hero} wrap`} aria-labelledby="hero-title">
      <div className={styles.warmth}>
        <Mark size={200} className={styles.mark} priority />
        <div className={styles.copy}>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="hero-title" className={styles.tagline}>
            {brand.tagline}.
          </h1>
          <p className={styles.lede}>{copy.lede}</p>
        </div>
      </div>
      <div className={styles.promise}>
        <h2 className={styles.statement}>{copy.statement}</h2>
        <p className={styles.lede}>{copy.promise}</p>
        <div className={styles.actions}>
          <Button href="/sign-up">{copy.action}</Button>
          <p className={styles.status}>{copy.status}</p>
        </div>
      </div>
    </section>
  );
}
