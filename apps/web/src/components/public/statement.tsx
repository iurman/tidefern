import type { ReactNode } from "react";
import { TideLine } from "./tide-line";
import styles from "./statement.module.css";

export interface StatementProps {
  /** The serif statement, one line: "That page is not here." */
  heading: string;
  /** One sentence that says what to do next. */
  sentence: string;
  /** The one action: a Button as a link or a button. */
  action: ReactNode;
}

/**
 * The 404 and error pages: a serif statement, one sentence and one action
 * on the page surface, with the tide line as the only decoration. Nothing
 * else, and never a stack trace.
 */
export function Statement({ heading, sentence, action }: StatementProps) {
  return (
    <section className={`${styles.statement} wrap`} aria-labelledby="statement-title">
      <TideLine className={styles.tide} />
      <h1 id="statement-title" className={styles.heading}>
        {heading}
      </h1>
      <p className={styles.sentence}>{sentence}</p>
      <div className={styles.action}>{action}</div>
    </section>
  );
}
