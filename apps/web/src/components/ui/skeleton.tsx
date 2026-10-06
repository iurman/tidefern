import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

export interface SkeletonProps {
  /** A block holds the place of a card or a ring; text holds the place of lines of copy. */
  variant?: "block" | "text";
  /** Text only: how many lines, the last one shorter. */
  lines?: number;
  /** Block only, as CSS lengths; defaults fill the container at a card's height. */
  width?: string;
  height?: string;
  /** What is on its way, read to assistive technology: "Loading your calendar". */
  label?: string;
  className?: string;
}

/**
 * Stands in for a value that will arrive (DESIGN.md section 4): never for a
 * value that might not. The container it renders is marked busy and carries
 * the label; the shapes inside are decoration and hidden from the tree. The
 * pulse is six swings of opacity and then rest, well inside the five-second
 * limit on automatic motion.
 */
export function Skeleton({
  variant = "block",
  lines = 3,
  width,
  height,
  label = "Loading",
  className,
}: SkeletonProps) {
  const classes = [styles.skeleton, className].filter(Boolean).join(" ");
  const count = Math.max(1, Math.floor(lines));
  return (
    <div className={classes} aria-busy="true" data-variant={variant}>
      <span className="sr-only">{label}</span>
      {variant === "text" ? (
        Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={styles.line}
            data-last={index === count - 1 && count > 1 ? "" : undefined}
            aria-hidden="true"
          />
        ))
      ) : (
        <span
          className={styles.block}
          style={{ width, height } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
