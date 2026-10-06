"use client";
import styles from "./switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** The id of the visible text that names the switch. */
  "aria-labelledby": string;
  "aria-describedby"?: string;
  disabled?: boolean;
  /** While a change is being saved: the state text reads "Saving" and presses are ignored. */
  loading?: boolean;
}

/**
 * A native button with `role="switch"` (the sound provider's delegation
 * covers that role), a track, a thumb and the state in visible words so the
 * position is never the only cue. The row that renders it owns the label.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  loading = false,
  ...labels
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labels["aria-labelledby"]}
      aria-describedby={labels["aria-describedby"]}
      aria-busy={loading || undefined}
      disabled={disabled}
      className={styles.switch}
      onClick={() => {
        if (loading) return;
        onChange?.(!checked);
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.state}>{loading ? "Saving" : checked ? "On" : "Off"}</span>
    </button>
  );
}
