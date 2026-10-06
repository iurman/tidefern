import type { ReactNode } from "react";
import { Mark } from "@/components/logo";
import styles from "./empty-state.module.css";

export interface EmptyStateProps {
  /** What would be here: "Nothing logged yet". */
  heading: string;
  /** Why it is not, in one or two sentences. */
  why: string;
  /** The one action that changes that, usually a Button; none where nothing can (the activity list). */
  action?: ReactNode;
  /** The mark instead of the tide line, for the first screen of a stage. */
  mark?: boolean;
  /** The heading level that fits the page outline. */
  level?: 2 | 3;
  className?: string;
}

/**
 * The empty-state formula from CONTENT.md: what would be here, why it is
 * not, and the one action that changes that. Drawn with the tide line or the
 * mark, never with stock art, and never with "No results" alone.
 */
export function EmptyState({
  heading,
  why,
  action,
  mark = false,
  level = 2,
  className,
}: EmptyStateProps) {
  const Heading = level === 3 ? "h3" : "h2";
  const classes = [styles.empty, className].filter(Boolean).join(" ");
  return (
    <section className={classes} aria-label={heading}>
      {mark ? (
        <Mark size={48} className={styles.mark} />
      ) : (
        <svg
          className={styles.tide}
          viewBox="0 0 120 12"
          width="120"
          height="12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M0 6c10 0 10-5 20-5s10 5 20 5 10-5 20-5 10 5 20 5 10-5 20-5 10 5 20 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <Heading className={styles.heading}>{heading}</Heading>
      <p className={styles.why}>{why}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
