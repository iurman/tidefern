import { welcomeCopy } from "./copy";
import styles from "./step-indicator.module.css";

export interface StepIndicatorProps {
  /** Every step her stage has, in order, with the name the indicator shows. */
  steps: ReadonlyArray<{ id: string; name: string }>;
  current: string;
}

/**
 * Where she is in onboarding (DESIGN.md 3.2): the numbered steps in a row
 * from 600 px, the current one on the warmth surface (the one highlighted
 * thing on the screen), and on phones the one line "Step 3 of 5". Only the
 * form that fits the width is rendered visible, so assistive technology
 * hears one of them. It counts only the steps her stage has.
 */
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  const index = steps.findIndex((step) => step.id === current);
  const number = index + 1;
  return (
    <div className={styles.indicator}>
      <ol className={styles.list} aria-label={welcomeCopy.steps.label}>
        {steps.map((step, position) => (
          <li
            key={step.id}
            className={styles.item}
            aria-current={step.id === current ? "step" : undefined}
            data-state={position < index ? "done" : position === index ? "current" : "next"}
          >
            <span className={styles.number}>{position + 1}</span>
            <span>{step.name}</span>
          </li>
        ))}
      </ol>
      <p className={styles.count}>{welcomeCopy.steps.count(number, steps.length)}</p>
    </div>
  );
}
