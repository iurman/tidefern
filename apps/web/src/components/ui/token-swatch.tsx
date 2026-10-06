"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./token-swatch.module.css";

export interface TokenSwatchProps {
  /** The custom property without its dashes: "accent", "data-period". */
  token: string;
  /** A plain name beside the code, when the token name alone does not say enough. */
  label?: string;
  className?: string;
}

/** The text shown until the browser has measured, and when nothing is set. */
export const SWATCH_PENDING = "Measuring";
export const SWATCH_UNSET = "Not set";

/**
 * Paints `var(--token)` and reads the value the browser resolved for it,
 * so the reference cannot disagree with the stylesheet (architecture 13.8).
 * The measurement happens on the client after paint and again whenever the
 * theme attribute on the root changes.
 */
export function TokenSwatch({ token, label, className }: TokenSwatchProps) {
  const chip = useRef<HTMLSpanElement>(null);
  const [measured, setMeasured] = useState<string | null>(null);

  useEffect(() => {
    const element = chip.current;
    if (!element) return;
    const measure = () => {
      const value = getComputedStyle(element).getPropertyValue(`--${token}`).trim();
      setMeasured(value || SWATCH_UNSET);
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [token]);

  const classes = [styles.swatch, className].filter(Boolean).join(" ");
  const value = measured ?? SWATCH_PENDING;
  return (
    <div className={classes} data-unset={measured === SWATCH_UNSET || undefined}>
      <span
        ref={chip}
        className={styles.chip}
        style={{ "--swatch-fill": `var(--${token})` } as CSSProperties}
        aria-hidden="true"
      />
      <span className={styles.meta}>
        {label ? <span className={styles.label}>{label}</span> : null}
        <code className={styles.name}>--{token}</code>
        <span className={styles.value}>{value}</span>
      </span>
    </div>
  );
}
