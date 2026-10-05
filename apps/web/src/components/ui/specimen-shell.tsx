"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import styles from "./specimen-frame.module.css";

const widths = [
  { label: "Phone", value: 390 },
  { label: "Reading", value: 720 },
  { label: "Full", value: 1200 },
] as const;

/**
 * Owns the specimen width for every card on the page through one custom
 * property on the wrapper it renders. The choice lives in component state
 * only; nothing is stored on the device, and the server-rendered page
 * already carries the default width.
 */
export function SpecimenShell({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number>(1200);
  return (
    <div className={styles.group} style={{ "--specimen-width": `${width}px` } as CSSProperties}>
      <div className={styles.widthControl} role="group" aria-label="Specimen width">
        {widths.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.widthButton}
            aria-pressed={width === option.value}
            onClick={() => setWidth(option.value)}
          >
            {option.label}
            <span className="tabular"> {option.value}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
