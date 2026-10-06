"use client";
import { useId } from "react";
import type { ShareCategory } from "@tidefern/schemas";
import { Switch } from "./switch";
import styles from "./grant-row.module.css";

/**
 * The plain words shown before a category can be turned on
 * (docs/design/CONTENT.md, sharing descriptions). Nouns, not values: a
 * category never shows what was logged, only what the switch would reveal.
 */
export const grantCopy: Record<ShareCategory, { label: string; description: string }> = {
  "cycle.status": {
    label: "Cycle status",
    description:
      "Which day of your cycle it is and whether Tidefern estimates a fertile window today. Not your symptoms, not your notes.",
  },
  "cycle.history": {
    label: "Cycle history",
    description: "Your past periods, cycle lengths and the next period estimate.",
  },
  "cycle.symptoms": {
    label: "Symptoms",
    description: "The symptoms and moods you log on any day, in any stage.",
  },
  "pregnancy.overview": {
    label: "Pregnancy overview",
    description:
      "The week, the due date, appointments and milestones. Never why a pregnancy ended, never your notes.",
  },
  "pregnancy.photos": {
    label: "Pregnancy photos",
    description: "Photos you add to the journey.",
  },
  child: {
    label: "A child",
    description:
      "Everything logged for that child: feeds, sleep, growth, milestones and photos. One switch per child.",
  },
};

export const privateNotesSentence = "Private notes are never shared.";

export interface GrantRowProps {
  label: string;
  /** What turning the switch on reveals, read before the switch and attached to it. */
  description: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** The change is being saved; the switch reads "Saving" and ignores presses. */
  loading?: boolean;
  /** Says what to do next ("We could not save this change. Try again."). */
  error?: string;
}

/**
 * One category on a person's card: its name, the plain description of what
 * it reveals, and the switch. Turning it off revokes in that one step; no
 * confirmation stands between the person and taking access back.
 */
export function GrantRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  loading = false,
  error,
}: GrantRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        loading={loading}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
    </div>
  );
}
