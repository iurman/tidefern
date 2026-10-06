import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import styles from "./disclosure.module.css";

export interface DisclosureProps {
  /** The visible question or label on the summary line: "How this is estimated". */
  summary: ReactNode;
  children: ReactNode;
  /** Open on first render; the element keeps its own state afterwards. */
  open?: boolean;
  /** Details that share a name close each other, the native accordion. */
  name?: string;
  id?: string;
  className?: string;
}

/**
 * A native details element with the chevron icon on its summary. It works
 * without JavaScript, the summary is a real control with the global focus
 * ring, and the only motion is the chevron turning.
 */
export function Disclosure({ summary, children, open, name, id, className }: DisclosureProps) {
  const classes = [styles.disclosure, className].filter(Boolean).join(" ");
  return (
    <details className={classes} open={open} name={name} id={id}>
      <summary className={styles.summary}>
        <span className={styles.summaryText}>{summary}</span>
        <Icon name="chevron-down" className={styles.chevron} />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
